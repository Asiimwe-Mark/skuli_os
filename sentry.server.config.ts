/**
 * Sentry server-side config.
 *
 * Loaded by @sentry/nextjs's `withSentryConfig()` webpack wrapper, before
 * any server module runs. Initialise Sentry here; the SDK guards against
 * being initialised twice, so this is safe to call from both the
 * instrumentation hook and Next's own setup.
 *
 * DSN is read from SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN. When neither is
 * set (local dev without a Sentry project, CI), the SDK no-ops and every
 * capture call becomes a console.error. This means the rest of the app
 * never has to gate Sentry calls behind a feature flag.
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
    // Server-side: keep the sample rate high; we are not user-billable
    // for these events the same way we are on the client.
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
    ),
    // Surface every unhandled error. We are not a high-volume public
    // API — 100% capture on errors is the right trade-off.
    sampleRate: 1.0,
    // Don't send PII to Sentry. The only context attached is the
    // school_id and request id, both already considered non-sensitive
    // for a school-management app.
    sendDefaultPii: false,
    // Strip cookies / headers we don't need. Sentry's default is to
    // include request headers; we don't want Authorization on the wire.
    beforeSendTransaction(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });
}
