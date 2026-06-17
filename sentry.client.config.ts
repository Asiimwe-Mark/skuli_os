/**
 * Sentry browser config.
 *
 * Loaded once when the client bundle evaluates. The session-replay
 * sample rate is intentionally low (0.1) — replaying a parent paying
 * fees is not necessary for catching bugs, and SKULI operates in
 * markets where bandwidth is at a premium.
 */
import * as Sentry from "@sentry/nextjs";

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";

const environment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
  process.env.SENTRY_ENVIRONMENT ??
  process.env.NODE_ENV ??
  "development";

const release =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
  process.env.SENTRY_RELEASE ??
  undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
    ),
    sampleRate: 1.0,
    sendDefaultPii: false,
    // Replays: cheap to capture when something goes wrong, useful for
    // diagnosing the "bursar sees a blank table" class of bug.
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? "0.1",
    ),
  });
}
