/**
 * Typed wrapper around Sentry.
 *
 * Two reasons this exists:
 *   1. `@sentry/nextjs` re-exports `captureException` but with an `unknown`
 *      signature that doesn't help us attach a school_id tag without a
 *      cast. Centralising the cast here means every call site stays
 *      strict-typed.
 *   2. When `SENTRY_DSN` is not configured the SDK no-ops, so callers
 *      never need to gate a `captureException` behind a feature flag.
 *      Tests and CI get a no-op for free.
 *
 * Capture is fire-and-forget — these helpers never throw, never await
 * the network, never block the request. A failed capture must not roll
 * back a real business operation.
 */
import * as Sentry from '@sentry/nextjs';

export interface CaptureContext {
  school_id?: string | null;
  user_id?: string | null;
  route?: string;
  method?: string;
  /** Extra structured context that ends up under `contexts.extra` in Sentry. */
  extra?: Record<string, unknown>;
  /** Tags shown in the Sentry UI for filtering / alert routing. */
  tags?: Record<string, string>;
  /** Severity. Defaults to 'error'. */
  level?: Sentry.SeverityLevel;
}

const NOOP_DSN =
  !process.env.SENTRY_DSN &&
  !process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Capture an exception with a typed context. Never throws.
 *
 * @param err   The error to capture. Strings are wrapped in Error so the
 *              stack trace is meaningful in Sentry.
 * @param ctx   Optional structured context.
 */
export function captureException(
  err: unknown,
  ctx: CaptureContext = {},
): void {
  try {
    const error =
      err instanceof Error
        ? err
        : new Error(typeof err === 'string' ? err : 'Unknown error');
    Sentry.captureException(error, {
      level: ctx.level ?? 'error',
      tags: ctx.tags,
      contexts: ctx.extra
        ? {
            extra: ctx.extra as Record<string, never>,
          }
        : undefined,
      user: ctx.user_id
        ? { id: ctx.user_id }
        : undefined,
    });
    // setTag so the value is searchable in the Sentry UI filter.
    // (tags on the event work too, but setTag is the public API
    // and stays consistent across the rest of the app's tagging.)
    for (const [k, v] of Object.entries(ctx.tags ?? {})) {
      Sentry.setTag(k, v);
    }
    if (ctx.school_id) {
      Sentry.setTag('school_id', ctx.school_id);
    }
    if (ctx.route) {
      Sentry.setTag('route', ctx.route);
    }
    if (ctx.method) {
      Sentry.setTag('http.method', ctx.method);
    }
  } catch {
    // Never throw out of a capture. The catch is deliberately empty
    // so a broken Sentry SDK cannot crash a request.
  }
}

/**
 * Capture a message (non-exception). Useful for "expected" failures
 * like a payment gateway rejecting a request — we want to count them
 * but they aren't exceptions.
 */
export function captureMessage(
  message: string,
  ctx: CaptureContext & { level?: Sentry.SeverityLevel } = {},
): void {
  try {
    Sentry.captureMessage(message, {
      level: ctx.level ?? 'info',
      tags: ctx.tags,
      contexts: ctx.extra
        ? {
            extra: ctx.extra as Record<string, never>,
          }
        : undefined,
    });
  } catch {
    // See captureException.
  }
}

/**
 * Add a breadcrumb. The SDK keeps the last 100 breadcrumbs attached
 * to the next exception captured in this request. We use this in the
 * audit log helper to leave a trail of "user did X, then Y" leading
 * up to an error.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  try {
    Sentry.addBreadcrumb({
      category,
      message,
      data: data as Record<string, never> | undefined,
      level: 'info',
    });
  } catch {
    // No-op.
  }
}

/**
 * Wrap a function call so any thrown error is captured and re-thrown.
 * Use this around top-level API route bodies to ensure every unhandled
 * error is reported.
 */
export async function captureErrors<T>(
  fn: () => Promise<T>,
  ctx: CaptureContext = {},
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    captureException(err, ctx);
    throw err;
  }
}

/**
 * Whether a Sentry DSN is configured in this environment. Exposed so
 * dashboards / health checks can report the integration state without
 * guessing.
 */
export const SENTRY_ENABLED = !NOOP_DSN;
