import { z } from "zod";
import { route, AuthError } from "@/lib/http";
import { registerIPN } from "@/lib/gateways/pesapal";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";

const MASK = "••••••••••••••••";

const postSchema = z.object({
  // Pesapal consumer key/secret are typically <100 chars; cap at 200 to allow
  // for future format changes while rejecting pathological payloads.
  consumer_key: z.string().max(200).optional(),
  consumer_secret: z.string().max(200).optional(),
  sandbox: z.boolean().optional(),
});

/** GET: report whether Pesapal credentials are configured. */
export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx) => {
    const schoolId = ctx.profile.school_id!;
    const { data: school } = await ctx.supabase
      .from("schools")
      .select(
        "pesapal_consumer_key_enc, pesapal_consumer_secret_enc, pesapal_ipn_id, pesapal_sandbox",
      )
      .eq("id", schoolId)
      .single();

    const s = (school as Record<string, unknown>) || {};
    return {
      configured: !!s.pesapal_consumer_key_enc && !!s.pesapal_consumer_secret_enc,
      has_ipn: !!s.pesapal_ipn_id,
      ipn_id: (s.pesapal_ipn_id as string) || null,
      sandbox: s.pesapal_sandbox !== false,
    };
  },
});

/** POST: encrypt + save Pesapal credentials, then register the IPN URL. */
export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  schema: postSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // Rate limit: 5 save attempts per school per 10 minutes. Each call
    // hits Pesapal's IPN registration endpoint so we cap aggressively.
    const rl = await checkRateLimitAsync(
      `pesapal-config:${schoolId}`,
      5,
      10 * 60 * 1000,
    );
    if (!rl.success) {
      throw new AuthError(
        "Too many Pesapal configuration attempts. Please wait before retrying.",
        429,
      );
    }

    const { consumer_key, consumer_secret, sandbox } = body;
    const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;
    const updatePayload: Record<string, unknown> = {};

    async function encryptInto(col: string, value: string) {
      if (!vaultKey)
        throw new AuthError(
          "Secret storage is not configured (missing vault key)",
          500,
        );
      const { data: enc, error } = await ctx.supabase.rpc("encrypt_secret", {
        secret: value,
        key: vaultKey,
      } as never);
      if (error || !enc)
        throw new AuthError("Failed to encrypt credential", 500);
      updatePayload[col] = enc as string;
    }

    if (consumer_key && consumer_key !== MASK) {
      await encryptInto("pesapal_consumer_key_enc", consumer_key);
    }
    if (consumer_secret && consumer_secret !== MASK) {
      await encryptInto("pesapal_consumer_secret_enc", consumer_secret);
    }
    if (sandbox !== undefined) {
      updatePayload.pesapal_sandbox = sandbox;
    }

    let ipnId: string | null = null;
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://skuli.app";
      ipnId = await registerIPN(`${appUrl}/api/webhooks/pesapal`);
      updatePayload.pesapal_ipn_id = ipnId;
    } catch (err) {
      // Save the credentials even if IPN registration fails; surface the error.
      if (Object.keys(updatePayload).length > 0) {
        await ctx.supabase
          .from("schools")
          .update(updatePayload as never)
          .eq("id", schoolId);
      }
      throw new AuthError(
        `Credentials saved but IPN registration failed: ${err instanceof Error ? err.message : "unknown error"}`,
        502,
      );
    }

    if (Object.keys(updatePayload).length === 0) {
      return { message: "No changes to save" };
    }

    const { error: updErr } = await ctx.supabase
      .from("schools")
      .update(updatePayload as never)
      .eq("id", schoolId);
    if (updErr) throw new AuthError("Failed to save credentials", 500);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.profile.id,
      action: "PESAPAL_CONFIGURED",
      entity_type: "school",
      entity_id: schoolId,
      old_value: null,
      new_value: { ipn_registered: !!ipnId },
      ip_address: null,
    } as never);

    return {
      message: "Pesapal configured successfully",
      ipn_id: ipnId,
    };
  },
});