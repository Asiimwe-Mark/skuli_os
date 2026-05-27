/**
 * Environment variable validation
 * Import this early to fail fast on missing env vars
 */

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
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
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  africasTalking: {
    username: process.env.AFRICAS_TALKING_USERNAME,
    apiKey: process.env.AFRICAS_TALKING_API_KEY,
    senderId: process.env.AFRICAS_TALKING_SENDER_ID,
    webhookSecret: process.env.AFRICAS_TALKING_WEBHOOK_SECRET,
  },
  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
} as const;
