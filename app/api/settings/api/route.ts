import type { Database } from "@/types/database";
import { route, AuthError } from "@/lib/http";

const KEY_FIELD_MAP: Record<string, { enc: string; plain: string | null }> = {
  // Migration 00040 drops the plaintext column once the vault key is
  // configured. We try `_enc` first; if that succeeds we use it. If
  // the migration has not yet been run we fall back to the plaintext
  // column so the reveal flow keeps working in dev.
  at_key: {
    enc: "africas_talking_api_key_enc",
    plain: "africas_talking_api_key",
  },
};

const MASK = "••••••••••••••••";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const url = new URL(request.url);
    const revealKey = url.searchParams.get("key");

    if (revealKey) {
      const mapping = KEY_FIELD_MAP[revealKey];
      if (!mapping) {
        throw new AuthError("Unknown credential key", 400);
      }

      const selectColumns = mapping.plain
        ? `${mapping.enc}, ${mapping.plain}`
        : mapping.enc;
      const { data: school, error } = await ctx.supabase
        .from("schools")
        .select(selectColumns)
        .eq("id", schoolId)
        .single();

      if (error || !school) {
        throw new AuthError("School not found", 404);
      }

      const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;
      const encValue = (school as unknown as Record<string, unknown>)[
        mapping.enc
      ] as string | null;

      if (encValue && vaultKey) {
        const { data: decrypted } = await ctx.supabase.rpc("decrypt_secret", {
          encrypted: encValue,
          key: vaultKey,
        });
        if (decrypted) {
          await ctx.supabase.from("audit_logs").insert({
            school_id: schoolId,
            user_id: ctx.profile.id,
            action: "CREDENTIAL_REVEALED",
            entity_type: "school",
            entity_id: schoolId,
            old_value: null,
            new_value: { key: revealKey },
            ip_address: null,
          } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

          return { value: decrypted as string };
        }
      }

      return { value: null };
    }

    const { data: school, error } = await ctx.supabase
      .from("schools")
      .select(
        "africas_talking_username, africas_talking_api_key_enc, africas_talking_username_enc, resend_api_key_enc",
      )
      .eq("id", schoolId)
      .single();

    if (error || !school) {
      throw new AuthError("School not found", 404);
    }

    const s = school as Record<string, unknown>;
    return {
      africas_talking_username: s.africas_talking_username || null,
      has_at_key: !!s.africas_talking_api_key_enc,
      at_key_display: s.africas_talking_api_key_enc ? MASK : null,
      has_resend: !!s.resend_api_key_enc,
    };
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const body = (await request.json().catch(() => ({}))) as {
      section?: string;
      africas_talking_username?: string;
      africas_talking_api_key?: string;
      sms_sender_id?: string;
      resend_api_key?: string;
    };
    const section = body.section;

    const updatePayload: Record<string, unknown> = {};
    const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;

    async function encryptInto(encColumn: string, value: string) {
      if (!vaultKey) {
        throw new AuthError(
          "Secret storage is not configured (missing vault key)",
          500,
        );
      }
      const { data: enc, error } = await ctx.supabase.rpc("encrypt_secret", {
        secret: value,
        key: vaultKey,
      });
      if (error || !enc) {
        throw new AuthError("Failed to encrypt credential", 500);
      }
      updatePayload[encColumn] = enc as string;
    }

    if (section === "africastalking") {
      if (body.africas_talking_username !== undefined) {
        updatePayload.africas_talking_username = body.africas_talking_username;
      }
      if (
        body.africas_talking_api_key &&
        body.africas_talking_api_key !== MASK
      ) {
        await encryptInto("africas_talking_api_key_enc", body.africas_talking_api_key);
      }
      if (body.sms_sender_id !== undefined) {
        updatePayload.sms_sender_id = body.sms_sender_id;
      }
    } else if (section === "resend") {
      if (body.resend_api_key && body.resend_api_key !== MASK) {
        await encryptInto("resend_api_key_enc", body.resend_api_key);
      }
    } else {
      throw new AuthError("Unknown section", 400);
    }

    if (Object.keys(updatePayload).length === 0) {
      return { message: "No changes to save" };
    }

    const { error: updateErr } = await ctx.supabase
      .from("schools")
      .update(
        updatePayload as unknown as Database["public"]["Tables"]["schools"]["Update"],
      )
      .eq("id", schoolId);

    if (updateErr) {
      throw new AuthError("Failed to save credentials", 500);
    }

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.profile.id,
      action: "CREDENTIALS_UPDATED",
      entity_type: "school",
      entity_id: schoolId,
      old_value: null,
      new_value: { section, fields: Object.keys(updatePayload) },
      ip_address: null,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return { message: "Credentials saved successfully" };
  },
});