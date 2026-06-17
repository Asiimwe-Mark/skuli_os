/**
 * Sentry edge-runtime config.
 *
 * The middleware runs in the Edge runtime, not Node. Sentry needs its
 * own init there because the server init is bundled for Node. The DSN
 * comes from the same env vars — the project is the same.
 */
import * as Sentry from "@sentry/nextjs";

const dsn =
  process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

const environment =
  process.env.SENTRY_ENVIRONMENT ??
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
  process.env.NODE_ENV ??
  "development";

const release =
  process.env.SENTRY_RELEASE ??
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
  undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.05",
    ),
    sampleRate: 1.0,
    sendDefaultPii: false,
  });
}
