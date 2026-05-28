#!/usr/bin/env node

/**
 * Skuli OS — Admin Seed Script
 *
 * Creates a SUPER_ADMIN user in Supabase Auth + the users table.
 *
 * Usage:
 *   node scripts/seed-admin.mjs
 *
 * Environment variables required (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * You can also override defaults via CLI args:
 *   node scripts/seed-admin.mjs --email admin@skuli.app --password "YourPass123!" --name "Platform Admin"
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load .env.local ────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ── Parse CLI args ─────────────────────────────────────────────────────
function getArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const ADMIN_EMAIL = getArg("email", "admin@skuli.app");
const ADMIN_PASSWORD = getArg("password", "SkuliAdmin2026!");
const ADMIN_NAME = getArg("name", "Platform Admin");

// ── Validate env ───────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "\n❌ Missing environment variables. Ensure .env.local contains:\n" +
      "   NEXT_PUBLIC_SUPABASE_URL=...\n" +
      "   SUPABASE_SERVICE_ROLE_KEY=...\n"
  );
  process.exit(1);
}

// ── Create Supabase admin client ───────────────────────────────────────
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedAdmin() {
  console.log("\n🌱 Skuli OS — Admin Seed Script\n");
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Name:     ${ADMIN_NAME}`);
  console.log(`   Password: ${"*".repeat(ADMIN_PASSWORD.length)}\n`);

  // 1. Check if auth user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const alreadyExists = existingUsers?.users?.find(
    (u) => u.email === ADMIN_EMAIL
  );

  let userId;

  if (alreadyExists) {
    console.log(`⚡ Auth user ${ADMIN_EMAIL} already exists (id: ${alreadyExists.id})`);
    userId = alreadyExists.id;

    // Update password in case it changed
    await supabase.auth.admin.updateUserById(userId, {
      password: ADMIN_PASSWORD,
    });
    console.log("   → Password updated.");
  } else {
    // 2. Create auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: ADMIN_NAME },
      });

    if (authError || !authData.user) {
      console.error("❌ Failed to create auth user:", authError?.message);
      process.exit(1);
    }

    userId = authData.user.id;
    console.log(`✅ Auth user created (id: ${userId})`);
  }

  // 3. Upsert user profile with SUPER_ADMIN role
  const { error: profileError } = await supabase.from("users").upsert(
    {
      id: userId,
      school_id: null,
      role: "SUPER_ADMIN",
      full_name: ADMIN_NAME,
      is_active: true,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("❌ Failed to create/update user profile:", profileError.message);
    process.exit(1);
  }

  console.log("✅ User profile set to SUPER_ADMIN\n");

  // 4. Summary
  console.log("─────────────────────────────────────────");
  console.log(" Login credentials:");
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log("   Role:     SUPER_ADMIN");
  console.log("   URL:      /admin (after login)");
  console.log("─────────────────────────────────────────\n");
  console.log("🎉 Done! You can now log in at /login\n");
}

seedAdmin().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
