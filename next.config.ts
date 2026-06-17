import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// SECURITY (audit M-4): 'unsafe-eval' defeats most of CSP's XSS protection.
// It is only needed for Next.js dev mode (HMR + Fast Refresh both rely on
// runtime-compiled module code). In production no first-party code path
// uses eval, Function(), or dynamic code — so we strip it for prod builds.
const isDev = process.env.NODE_ENV !== 'production';

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://*.sentry.io;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob: https://*.supabase.co https://pay.pesapal.com https://cybqa.pesapal.com https://*.sentry.io;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://pay.pesapal.com https://cybqa.pesapal.com https://*.africas-talking.com https://*.upstash.io https://*.sentry.io;
  frame-src https://pay.pesapal.com https://cybqa.pesapal.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self' https://pay.pesapal.com https://cybqa.pesapal.com;
  object-src 'none';
`.replace(/\n/g, ' ').trim();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  serverExternalPackages: ['@react-pdf/renderer', '@supabase/ssr'],
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            // Audit 8.11: HSTS preload is what makes the site eligible
            // for the browser-shipped HSTS preload list. Without it,
            // a first-time visitor is one redirect away from an MITM.
            // hstspreload.org requires: max-age >= 31536000, includeSubDomains, preload.
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: ContentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry. `withSentryConfig` is a no-op when no SENTRY_DSN
// is configured, so this is safe in local dev and CI. We pass
// `silent: !isDev` so dev builds don't print the Sentry banner, and
// `widenClientFileUpload: true` to ensure the Sentry upload hook
// runs on the client bundle.
const sentryOptions = {
  // Build-time source map upload is opt-in via SENTRY_AUTH_TOKEN.
  // When the token is absent (local / CI) Sentry skips the upload
  // automatically and the build still succeeds.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !isDev,
  hideSourceMaps: true,
  disableLogger: true,
  widenClientFileUpload: true,
  // The SDK auto-detects Next version and instruments the right
  // surfaces. `unstable_serializationHook` is the official escape
  // hatch for our pino logger integration.
  excludeServerRoutes: ['/api/webhooks/pesapal', '/api/webhooks/africas-talking/*'],
};

export default withSentryConfig(nextConfig, sentryOptions);
