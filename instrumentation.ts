/**
 * Next.js instrumentation entry point.
 *
 * Next.js looks for a file at exactly `instrumentation.ts` (root) and
 * for an exported function named `register`. Both the server and edge
 * Sentry configs are imported here, but Sentry's SDK guards against
 * double-init, so the imports are safe across hot reloads.
 *
 * `onRequestError` is wired so that every unhandled error in a Server
 * Component, Route Handler, or Server Action gets captured with the
 * right route / method / user context.
 *
 * Audit §5.3: validate the environment at boot so a missing env var
 * becomes a loud, single-line startup failure rather than a deep
 * runtime 500.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv({ runtime: "node" });
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    const { validateEnv } = await import("./lib/env");
    validateEnv({ runtime: "edge" });
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    revalidateReason?: string;
  },
): Promise<void> {
  // Lazy import: onRequestError is part of the Sentry Next SDK but
  // importing it statically would pull Sentry into the Edge bundle
  // even when no DSN is configured.
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
}
