/**
 * Optional CAPTCHA verification for unauthenticated routes.
 *
 * Audit §8.9: the /api/onboard endpoint is the single biggest
 * public-facing attack surface — anyone can POST to it, and each
 * call creates a new school + admin user + Supabase auth account.
 * A naive IP rate-limit (5/hour) is not enough once an attacker
 * spreads across a botnet.
 *
 * This helper accepts an opaque captcha token (reCAPTCHA v3, hCaptcha,
 * or Cloudflare Turnstile) and verifies it with the upstream provider
 * when a `*_SITE_SECRET` env var is configured.
 *
 * Behaviour:
 *   - If no secret is configured (local dev, CI), verification is
 *     skipped silently. This is the same posture as every other env-
 *     optional integration in the app (e.g. Upstash Redis falls back
 *     to in-process storage when missing).
 *   - If a secret is configured, the token is required and the
 *     provider's response must report `success: true`. A score
 *     threshold (where the provider supports one) is enforced for
 *     reCAPTCHA v3.
 *   - Failures are reported via Sentry's `captureMessage` and a
 *     generic 400 is returned. We never echo the provider's failure
 *     reason to the client.
 *
 * Usage from a route handler:
 *
 *   const captcha = await verifyCaptcha(body.captcha_token);
 *   if (captcha.required && !captcha.ok) {
 *     return errorResponse("CAPTCHA verification failed", 400);
 *   }
 *
 * `body.captcha_token` is then stripped before the body is passed
 * to zod (since it is not part of the schema).
 */

export interface CaptchaVerification {
  /** True when the env var is set and verification actually ran. */
  required: boolean;
  /** True when verification passed (or was not required). */
  ok: boolean;
  /** Provider-specific score, when available (reCAPTCHA v3). */
  score?: number;
}

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export async function verifyCaptcha(
  token: string | undefined,
): Promise<CaptchaVerification> {
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY;

  if (!recaptchaSecret && !turnstileSecret && !hcaptchaSecret) {
    return { required: false, ok: true };
  }

  if (!token) {
    return { required: true, ok: false };
  }

  try {
    if (recaptchaSecret) {
      const res = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret: recaptchaSecret, response: token }),
        },
      );
      if (!res.ok) {
        return { required: true, ok: false };
      }
      const data = (await res.json()) as RecaptchaResponse;
      if (!data.success) return { required: true, ok: false };
      // reCAPTCHA v3 returns a score in [0, 1]. We treat anything
      // below 0.4 as a bot. If the provider returned no score (v2 /
      // enterprise), we accept success as-is.
      if (typeof data.score === "number" && data.score < 0.4) {
        return { required: true, ok: false, score: data.score };
      }
      return { required: true, ok: true, score: data.score };
    }

    if (turnstileSecret) {
      const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret: turnstileSecret, response: token }),
        },
      );
      if (!res.ok) return { required: true, ok: false };
      const data = (await res.json()) as { success?: boolean };
      return { required: true, ok: Boolean(data.success) };
    }

    if (hcaptchaSecret) {
      const res = await fetch("https://api.hcaptcha.com/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: hcaptchaSecret, response: token }),
      });
      if (!res.ok) return { required: true, ok: false };
      const data = (await res.json()) as { success?: boolean };
      return { required: true, ok: Boolean(data.success) };
    }
  } catch {
    // Treat provider outage as a verification failure. The route
    // will 400 the user; we'd rather inconvenience a real person
    // than let a bot spam school-creation in the gap.
    return { required: true, ok: false };
  }

  return { required: false, ok: true };
}
