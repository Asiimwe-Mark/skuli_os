/**
 * Environment variable validation
 * Import this early to fail fast on missing env vars
 *
 * IMPORTANT: This file exports server-only secrets (service role key, API keys).
 * The `import 'server-only'` below prevents accidental client-side bundling.
 */
import "server-only";

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_VAULT_SECRET_KEY',
  'VAPID_PRIVATE_KEY',
  'AFRICAS_TALKING_WEBHOOK_SECRET',
  'PESAPAL_CONSUMER_KEY',
  'PESAPAL_CONSUMER_SECRET',
  'RESEND_API_KEY',
] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const env = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    vaultSecretKey: process.env.SUPABASE_VAULT_SECRET_KEY!,
  },
  africasTalking: {
    username: process.env.AFRICAS_TALKING_USERNAME,
    apiKey: process.env.AFRICAS_TALKING_API_KEY,
    senderId: process.env.AFRICAS_TALKING_SENDER_ID,
    webhookSecret: process.env.AFRICAS_TALKING_WEBHOOK_SECRET!,
  },
  pesapal: {
    consumerKey: process.env.PESAPAL_CONSUMER_KEY!,
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET!,
    sandbox: process.env.PESAPAL_SANDBOX === 'true',
    ipnId: process.env.PESAPAL_IPN_ID,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY!,
  },
  vapid: {
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
} as const;
