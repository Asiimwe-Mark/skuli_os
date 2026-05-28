#!/usr/bin/env node

/**
 * Skuli OS — Database Migration Runner
 *
 * Generates a combined SQL file from all migrations.
 * If SUPABASE_ACCESS_TOKEN is set, also applies them via the Management API.
 *
 * Usage:
 *   node scripts/run-migrations.mjs           # Generate combined.sql
 *   node scripts/run-migrations.mjs --apply    # Generate + apply via API
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

// Load .env.local
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = supabaseUrl
  ? supabaseUrl.replace("https://", "").split(".")[0]
  : "unknown";

console.log("\n🗄️  Skuli OS — Database Migration Runner\n");

// Read migration files
const migrationsDir = resolve(__dirname, "..", "supabase", "migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && f !== "combined.sql")
  .sort();

console.log(`   Project: ${projectRef}`);
console.log(`   Migrations: ${migrationFiles.length} files\n`);

// Build combined SQL
const combinedSql = migrationFiles
  .map((f) => {
    const content = readFileSync(resolve(migrationsDir, f), "utf-8");
    return `-- ============================================\n-- Migration: ${f}\n-- ============================================\n\n${content}`;
  })
  .join("\n\n");

// Write combined SQL file
const combinedPath = resolve(migrationsDir, "combined.sql");
writeFileSync(combinedPath, combinedSql);
console.log(`   ✅ Combined SQL written to: supabase/migrations/combined.sql`);
console.log(`      (${(combinedSql.length / 1024).toFixed(1)} KB)\n`);

// Apply via API if token is present and --apply flag is used
const shouldApply = process.argv.includes("--apply") && accessToken;

if (!shouldApply) {
  if (!accessToken) {
    console.log("   ℹ️  No SUPABASE_ACCESS_TOKEN found.\n");
  }
  console.log("   To apply these migrations:\n");
  console.log("   OPTION A — Supabase Dashboard (recommended):");
  console.log(`   1. Go to: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  console.log("   2. Paste the contents of: supabase/migrations/combined.sql");
  console.log("   3. Click 'Run'\n");
  console.log("   OPTION B — Management API:");
  console.log("   1. Get token from: https://supabase.com/dashboard/account/tokens");
  console.log("   2. Add to .env.local: SUPABASE_ACCESS_TOKEN=sbp_xxxxx");
  console.log("   3. Run: node scripts/run-migrations.mjs --apply\n");
  console.log("   Then run: npm run seed\n");
  process.exit(0);
}

// Apply via Management API
console.log("   Applying via Management API...\n");

let success = 0;
let failed = 0;

for (const file of migrationFiles) {
  const sql = readFileSync(resolve(migrationsDir, file), "utf-8");
  process.stdout.write(`   ⏳ ${file} ... `);

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HTTP ${response.status}: ${err}`);
    }

    console.log("✅");
    success++;
  } catch (err) {
    console.log(`❌ ${err.message}`);
    failed++;
  }
}

console.log(`\n   Done: ${success} succeeded, ${failed} failed\n`);

if (failed === 0) {
  console.log("   🎉 All migrations applied! Now run: npm run seed\n");
}
