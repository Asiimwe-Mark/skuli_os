import { z } from "zod";

/**
 * Single source of truth for required environment variables.
 *
 * Audit §5.3: the previous code used `process.env.X!` non-null
 * assertions throughout. A missing env var became a runtime 500
 * deep inside a handler — late, unactionable, and depending on the
 * route potentially after a write. Fail fast at boot instead.
 *
 * Usage:
 *   - in instrumentation.ts (Node runtime) call validateEnv() at
 *     module load;
 *   - in Edge runtime entry points (middleware, sentry.edge.config)
 *     call validateEnv({ runtime: "edge" }) which omits Node-only
 *     keys.
 *
 * Each variable is documented with what the app does with it, so a
 * missing value points the operator at the right env name.
 */
const baseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, "SUPABASE_SERVICE_ROLE_KEY looks too short"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a URL")
    .default("http://localhost:3000"),
});

const nodeOnlySchema = z.object({
  SUPABASE_VAULT_SECRET_KEY: z
    .string()
    .min(16, "SUPABASE_VAULT_SECRET_KEY is required for decrypt_secret"),
  PESAPAL_CONSUMER_KEY: z.string().min(1).optional(),
  PESAPAL_CONSUMER_SECRET: z.string().min(1).optional(),
  PESAPAL_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  AFRICAS_TALKING_WEBHOOK_SECRET: z
    .string()
    .min(8, "AFRICAS_TALKING_WEBHOOK_SECRET must be >= 8 chars"),
  RESEND_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().email().optional(),
  // §8.9: optional CAPTCHA providers. If any of these is set, the
  // matching provider is wired up by lib/utils/captcha. Verification
  // is skipped when none are set (so local dev / CI keeps working).
  RECAPTCHA_SECRET_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  HCAPTCHA_SECRET_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof baseSchema> & Partial<z.infer<typeof nodeOnlySchema>>;

let cached: Env | null = null;

export interface ValidateEnvOptions {
  runtime?: "node" | "edge";
  /** When true, do not throw — return the error object instead. */
  collectErrors?: boolean;
}

/**
 * Validate the environment. Throws on missing required keys unless
 * `collectErrors` is set. Safe to call multiple times (cached).
 */
export function validateEnv(opts: ValidateEnvOptions = {}): Env {
  if (cached) return cached;
  const schema = opts.runtime === "edge" ? baseSchema : baseSchema.merge(nodeOnlySchema);
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    const message = `Environment validation failed:\n${issues}`;
    if (opts.collectErrors) {
      throw new Error(message);
    }
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error("Environment validation failed; see logs.");
  }
  cached = parsed.data as Env;
  return cached;
}

/**
 * Lightweight startup check. Returns the names of missing variables
 * (useful in /api/health) without throwing.
 */
export function envHealth(): {
  ok: boolean;
  missing: string[];
  warnings: string[];
} {
  const result = baseSchema.safeParse(process.env);
  const missing: string[] = result.success
    ? []
    : result.error.issues.map((i) => i.path.join(".") || "(root)");

  const warnings: string[] = [];
  if (!process.env.SUPABASE_VAULT_SECRET_KEY) {
    warnings.push("SUPABASE_VAULT_SECRET_KEY missing — decrypt_secret unavailable");
  }
  if (!process.env.AFRICAS_TALKING_WEBHOOK_SECRET) {
    warnings.push("AFRICAS_TALKING_WEBHOOK_SECRET missing — MM webhook will 500");
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    warnings.push("VAPID keys missing — web push will silently no-op (§14.7)");
  }
  if (!process.env.SENTRY_DSN) {
    warnings.push("SENTRY_DSN missing — error reporting disabled");
  }
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    warnings.push("UPSTASH_REDIS_REST_URL missing — cache falls back to in-memory");
  }

  return { ok: missing.length === 0, missing, warnings };
}
