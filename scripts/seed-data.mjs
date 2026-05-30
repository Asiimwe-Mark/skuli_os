#!/usr/bin/env node

/**
 * Skuli OS — Comprehensive Database Seed Script
 *
 * Creates test data covering ALL features, ALL user roles, ALL tables.
 *
 * Roles seeded:
 *   SUPER_ADMIN, GROUP_ADMIN, SCHOOL_ADMIN, BURSAR, TEACHER, PARENT
 *
 * Usage:
 *   node scripts/seed-data.mjs              # Seed (skip existing auth users)
 *   node scripts/seed-data.mjs --clean      # Truncate all data first, then seed
 *
 * Environment variables required (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ACCESS_TOKEN
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

// ── Validate env ───────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "\n❌ Missing environment variables. Ensure .env.local contains:\n" +
      "   NEXT_PUBLIC_SUPABASE_URL=...\n" +
      "   SUPABASE_SERVICE_ROLE_KEY=...\n"
  );
  process.exit(1);
}

if (!accessToken) {
  console.error(
    "\n❌ Missing SUPABASE_ACCESS_TOKEN. Required for SQL execution.\n" +
      "   Get token from: https://supabase.com/dashboard/account/tokens\n" +
      "   Add to .env.local: SUPABASE_ACCESS_TOKEN=sbp_xxxxx\n"
  );
  process.exit(1);
}

const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

// ── Clients ────────────────────────────────────────────────────────────
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runSql(sql) {
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
    throw new Error(`SQL execution failed (HTTP ${response.status}): ${err}`);
  }
  return response.json();
}

// ── Parse CLI args ─────────────────────────────────────────────────────
const shouldClean = process.argv.includes("--clean");

// ── Constants ──────────────────────────────────────────────────────────
const PASSWORD = "SkuliTest2026!";

// Fixed UUIDs for deterministic references
const IDS = {
  // School Group
  GROUP: "a0000001-0000-0000-0000-000000000000",

  // Schools
  SCHOOL1: "a0000002-0000-0000-0000-000000000000",
  SCHOOL2: "a0000003-0000-0000-0000-000000000000",

  // Academic Years
  AY2026_S1: "b0000001-0000-0000-0000-000000000000",
  AY2026_S2: "b0000002-0000-0000-0000-000000000000",

  // Terms
  T1_S1: "c0000001-0000-0000-0000-000000000000",
  T2_S1: "c0000002-0000-0000-0000-000000000000",
  T3_S1: "c0000003-0000-0000-0000-000000000000",
  T1_S2: "c0000004-0000-0000-0000-000000000000",
  T2_S2: "c0000005-0000-0000-0000-000000000000",
  T3_S2: "c0000006-0000-0000-0000-000000000000",

  // Classes — School 1 (Primary)
  CLS_P1A: "d0000001-0000-0000-0000-000000000000",
  CLS_P2A: "d0000002-0000-0000-0000-000000000000",
  CLS_P3A: "d0000003-0000-0000-0000-000000000000",
  CLS_P4A: "d0000004-0000-0000-0000-000000000000",
  CLS_P5A: "d0000005-0000-0000-0000-000000000000",
  CLS_P6A: "d0000006-0000-0000-0000-000000000000",
  CLS_P7A: "d0000007-0000-0000-0000-000000000000",

  // Classes — School 2 (Secondary)
  CLS_S1A: "d0000008-0000-0000-0000-000000000000",
  CLS_S2A: "d0000009-0000-0000-0000-000000000000",
  CLS_S3A: "d000000a-0000-0000-0000-000000000000",
  CLS_S4A: "d000000b-0000-0000-0000-000000000000",

  // Subjects — School 1 (Primary)
  SUB_MATH1: "e0000001-0000-0000-0000-000000000000",
  SUB_ENG1:  "e0000002-0000-0000-0000-000000000000",
  SUB_SCI1:  "e0000003-0000-0000-0000-000000000000",
  SUB_SST1:  "e0000004-0000-0000-0000-000000000000",
  SUB_CRE1:  "e0000005-0000-0000-0000-000000000000",
  SUB_LIT1:  "e0000006-0000-0000-0000-000000000000",
  SUB_ART1:  "e0000007-0000-0000-0000-000000000000",
  SUB_PE1:   "e0000008-0000-0000-0000-000000000000",

  // Subjects — School 2 (Secondary)
  SUB_MATH2: "e0000009-0000-0000-0000-000000000000",
  SUB_ENG2:  "e000000a-0000-0000-0000-000000000000",
  SUB_PHY2:  "e000000b-0000-0000-0000-000000000000",
  SUB_CHM2:  "e000000c-0000-0000-0000-000000000000",
  SUB_BIO2:  "e000000d-0000-0000-0000-000000000000",
  SUB_HIS2:  "e000000e-0000-0000-0000-000000000000",
  SUB_GEO2:  "e000000f-0000-0000-0000-000000000000",
  SUB_LIT2:  "e0000010-0000-0000-0000-000000000000",
  SUB_CRE2:  "e0000011-0000-0000-0000-000000000000",

  // Staff IDs (for meeting_slots teacher_id FK)
  STAFF_T1A: "af000001-0000-0000-0000-000000000000",
  STAFF_T1B: "af000002-0000-0000-0000-000000000000",
  STAFF_T1C: "af000003-0000-0000-0000-000000000000",
  STAFF_T2A: "af000006-0000-0000-0000-000000000000",
  STAFF_T2B: "af000007-0000-0000-0000-000000000000",

  // Expense Categories
  EXP_CAT1: "f0000001-0000-0000-0000-000000000000",
  EXP_CAT2: "f0000002-0000-0000-0000-000000000000",
  EXP_CAT3: "f0000003-0000-0000-0000-000000000000",
  EXP_CAT4: "f0000004-0000-0000-0000-000000000000",

  // Fee Discounts
  DISC_SIBLING:  "f1000001-0000-0000-0000-000000000000",
  DISC_STAFF:    "f1000002-0000-0000-0000-000000000000",
  DISC_SCHOLAR:  "f1000003-0000-0000-0000-000000000000",
};

// Auth user definitions (email → metadata)
const AUTH_USERS = [
  { email: "admin@skuli.app",             name: "Platform Admin",      role: "SUPER_ADMIN",  schoolId: null,          phone: null },
  { email: "groupadmin@skuli.app",        name: "James Group Admin",   role: "GROUP_ADMIN",  schoolId: null,          phone: "+256700000001" },
  { email: "headteacher@greenfield.ac.ug",name: "Florence Kamukama",   role: "SCHOOL_ADMIN", schoolId: IDS.SCHOOL1,   phone: "+256700000002" },
  { email: "admin@sunrise.ss.ug",         name: "Robert Ssemwanga",    role: "SCHOOL_ADMIN", schoolId: IDS.SCHOOL2,   phone: "+256700000003" },
  { email: "bursar@greenfield.ac.ug",     name: "James Mukasa",        role: "BURSAR",       schoolId: IDS.SCHOOL1,   phone: "+256700000004" },
  { email: "bursar@sunrise.ss.ug",        name: "Agnes Nabirye",       role: "BURSAR",       schoolId: IDS.SCHOOL2,   phone: "+256700000005" },
  { email: "teacher1@greenfield.ac.ug",   name: "Grace Nakamya",       role: "TEACHER",      schoolId: IDS.SCHOOL1,   phone: "+256700000006" },
  { email: "teacher2@greenfield.ac.ug",   name: "David Okello",        role: "TEACHER",      schoolId: IDS.SCHOOL1,   phone: "+256700000007" },
  { email: "teacher3@greenfield.ac.ug",   name: "Sarah Achieng",       role: "TEACHER",      schoolId: IDS.SCHOOL1,   phone: "+256700000008" },
  { email: "teacher1@sunrise.ss.ug",      name: "Peter Mugisha",       role: "TEACHER",      schoolId: IDS.SCHOOL2,   phone: "+256700000009" },
  { email: "teacher2@sunrise.ss.ug",      name: "Christine Apio",      role: "TEACHER",      schoolId: IDS.SCHOOL2,   phone: "+256700000010" },
  { email: "parent1@example.com",         name: "Mary Nansubuga",      role: "PARENT",       schoolId: IDS.SCHOOL1,   phone: "+256701000001" },
  { email: "parent2@example.com",         name: "John Sserwanga",      role: "PARENT",       schoolId: IDS.SCHOOL1,   phone: "+256701000002" },
  { email: "parent3@example.com",         name: "Betty Nakato",        role: "PARENT",       schoolId: IDS.SCHOOL1,   phone: "+256701000003" },
  { email: "parent4@example.com",         name: "Moses Kiggundu",      role: "PARENT",       schoolId: IDS.SCHOOL2,   phone: "+256701000004" },
  { email: "parent5@example.com",         name: "Janet Akello",        role: "PARENT",       schoolId: IDS.SCHOOL2,   phone: "+256701000005" },
];

// ── Main Seed Function ─────────────────────────────────────────────────
async function seed() {
  console.log("\n🌱 Skuli OS — Comprehensive Seed Script\n");
  console.log(`   Project:  ${projectRef}`);
  console.log(`   Schools:  2 (Greenfield Academy, Sunrise Secondary)`);
  console.log(`   Roles:    SUPER_ADMIN, GROUP_ADMIN, SCHOOL_ADMIN, BURSAR, TEACHER, PARENT`);
  console.log(`   Users:    ${AUTH_USERS.length}\n`);

  // ── Step 0: Clean if requested ─────────────────────────────────────
  if (shouldClean) {
    console.log("🧹 Cleaning existing data...\n");
    const cleanSql = `
      -- Disable triggers temporarily to avoid FK issues during truncate
      SET session_replication_role = 'replica';
      TRUNCATE TABLE audit_logs, in_app_notifications, push_subscriptions, push_queue,
        asset_maintenance, assets, library_issues, library_books,
        thread_messages, message_threads, meeting_bookings, meeting_slots,
        expenses, expense_categories, discipline_records, calendar_events,
        timetable_slots, timetable_periods, teacher_class_assignments,
        sms_templates, sms_logs, announcements, attendance_records,
        report_cards, marks, fee_payments, fee_accounts, student_discounts,
        fee_discounts, fee_structures, class_enrollments, payroll_records,
        staff, subscription_invoices, notification_preferences,
        fee_structure_audit_log, platform_settings, grading_scales,
        alumni, group_admins, class_subjects, students, classes, subjects,
        terms, academic_years, school_groups
        CASCADE;
      DELETE FROM users;
      SET session_replication_role = 'origin';
    `;
    await runSql(cleanSql);

    // Also delete auth users so the handle_new_user trigger fires again
    const { data: existingAuth } = await supabase.auth.admin.listUsers();
    const seedEmails = new Set(AUTH_USERS.map((u) => u.email));
    for (const u of existingAuth?.users || []) {
      if (seedEmails.has(u.email)) {
        await supabase.auth.admin.deleteUser(u.id);
      }
    }

    console.log("   ✅ All tables truncated & auth users deleted\n");
  }

  // ── Step 1: Ensure handle_new_user trigger has search_path ────────
  console.log("🔧 Fixing handle_new_user trigger...");
  try {
    await runSql(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $function$
      DECLARE
          v_full_name text;
          v_phone text;
          v_role user_role;
          v_school_id uuid;
      BEGIN
          v_full_name := COALESCE(
              NEW.raw_user_meta_data->>'full_name',
              NEW.raw_user_meta_data->>'name',
              split_part(NEW.email, '@', 1)
          );
          v_phone := COALESCE(
              NEW.raw_user_meta_data->>'phone',
              NEW.phone
          );
          BEGIN
              v_role := COALESCE(
                  (NEW.raw_user_meta_data->>'role')::user_role,
                  'SCHOOL_ADMIN'::user_role
              );
          EXCEPTION WHEN OTHERS THEN
              v_role := 'SCHOOL_ADMIN'::user_role;
          END;
          BEGIN
              v_school_id := (NEW.raw_user_meta_data->>'school_id')::uuid;
          EXCEPTION WHEN OTHERS THEN
              v_school_id := NULL;
          END;
          INSERT INTO public.users (
              id, school_id, role, full_name, phone, is_active
          ) VALUES (
              NEW.id, v_school_id, v_role, v_full_name, v_phone, true
          );
          RETURN NEW;
      END;
      $function$;
    `);
    console.log("   ✅ Trigger fixed\n");
  } catch (e) {
    console.log("   ⚡ Trigger already OK\n");
  }

  // ── Step 2: Create Group & Schools (before auth users for FK) ───
  console.log("🏫 Creating school group & schools...");
  await runSql(`
    INSERT INTO school_groups (id, name, code) VALUES
      ('${IDS.GROUP}', 'Bright Future Education Group', 'BFEG')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO schools (id, name, school_code, school_type, subscription_plan, subscription_status, address, district, phone, email, motto, max_students, group_id, trial_ends_at) VALUES
      ('${IDS.SCHOOL1}', 'Greenfield Academy', 'GFA', 'primary', 'growth', 'active', 'Plot 15, Kampala Road', 'Kampala', '+256414000001', 'info@greenfield.ac.ug', 'Excellence in Education', 500, '${IDS.GROUP}', NULL),
      ('${IDS.SCHOOL2}', 'Sunrise Secondary School', 'SSS', 'secondary', 'pro', 'active', 'Plot 42, Jinja Road', 'Jinja', '+256414000002', 'info@sunrise.ss.ug', 'Rising to Greatness', 800, '${IDS.GROUP}', NULL)
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log("   ✅ Schools created\n");

  // ── Step 3: Create Auth Users ─────────────────────────────────────
  console.log("👤 Creating auth users...\n");

  // Store mapping of email → user ID
  const userIds = {};

  // List existing auth users to skip duplicates
  const { data: existingAuth } = await supabase.auth.admin.listUsers();
  const existingEmails = new Set(
    (existingAuth?.users || []).map((u) => u.email)
  );

  for (const user of AUTH_USERS) {
    if (existingEmails.has(user.email)) {
      const existing = existingAuth.users.find(
        (u) => u.email === user.email
      );
      userIds[user.email] = existing.id;
      console.log(`   ⚡ ${user.email} already exists (${user.role})`);
      // Update password and metadata
      await supabase.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        user_metadata: {
          full_name: user.name,
          role: user.role,
          school_id: user.schoolId,
          phone: user.phone,
        },
      });
      continue;
    }

    const { data: created, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: user.name,
        role: user.role,
        school_id: user.schoolId,
        phone: user.phone,
      },
    });

    if (error) {
      console.error(`   ❌ Failed to create ${user.email}: ${error.message}`);
      process.exit(1);
    }

    userIds[user.email] = created.user.id;
    console.log(`   ✅ ${user.email} → ${user.role}`);
  }

  console.log(`\n   ${Object.keys(userIds).length} users ready.\n`);

  // ── Step 2: Resolve user IDs for SQL ──────────────────────────────
  const U = {
    superAdmin:  userIds["admin@skuli.app"],
    groupAdmin:  userIds["groupadmin@skuli.app"],
    admin1:      userIds["headteacher@greenfield.ac.ug"],
    admin2:      userIds["admin@sunrise.ss.ug"],
    bursar1:     userIds["bursar@greenfield.ac.ug"],
    bursar2:     userIds["bursar@sunrise.ss.ug"],
    teacher1a:   userIds["teacher1@greenfield.ac.ug"],
    teacher1b:   userIds["teacher2@greenfield.ac.ug"],
    teacher1c:   userIds["teacher3@greenfield.ac.ug"],
    teacher2a:   userIds["teacher1@sunrise.ss.ug"],
    teacher2b:   userIds["teacher2@sunrise.ss.ug"],
    parent1:     userIds["parent1@example.com"],
    parent2:     userIds["parent2@example.com"],
    parent3:     userIds["parent3@example.com"],
    parent4:     userIds["parent4@example.com"],
    parent5:     userIds["parent5@example.com"],
  };

  // ── Step 3: Student IDs (fixed for cross-referencing) ─────────────
  const STU = {};
  const studentNames1 = [
    { first: "Samuel", last: "Kamukama",   gender: "male",   parentName: "Mary Nansubuga",  parentPhone: "+256701000001" },
    { first: "Esther", last: "Nakamya",    gender: "female", parentName: "Mary Nansubuga",  parentPhone: "+256701000001" },
    { first: "Isaac",  last: "Sserwanga",  gender: "male",   parentName: "John Sserwanga",  parentPhone: "+256701000002" },
    { first: "Deborah",last: "Sserwanga",  gender: "female", parentName: "John Sserwanga",  parentPhone: "+256701000002" },
    { first: "Ruth",   last: "Nakato",     gender: "female", parentName: "Betty Nakato",    parentPhone: "+256701000003" },
    { first: "Daniel", last: "Okello",     gender: "male",   parentName: "Betty Nakato",    parentPhone: "+256701000003" },
    { first: "Joyce",  last: "Nansubuga",  gender: "female", parentName: "Grace Ssempijja", parentPhone: "+256701000006" },
    { first: "Moses",  last: "Ochieng",    gender: "male",   parentName: "Peter Ochieng",   parentPhone: "+256701000007" },
    { first: "Sarah",  last: "Namukasa",   gender: "female", parentName: "Joseph Namukasa", parentPhone: "+256701000008" },
    { first: "Brian",  last: "Mugisha",    gender: "male",   parentName: "Agnes Mugisha",   parentPhone: "+256701000009" },
    { first: "Martha", last: "Auma",       gender: "female", parentName: "Stephen Auma",    parentPhone: "+256701000010" },
    { first: "Joseph", last: "Ssekitooleko",gender: "male",  parentName: "Florence Ssek",   parentPhone: "+256701000011" },
    { first: "Hannah", last: "Tusiime",    gender: "female", parentName: "David Tusiime",   parentPhone: "+256701000012" },
    { first: "Mark",   last: "Byarugaba",  gender: "male",   parentName: "Catherine B.",     parentPhone: "+256701000013" },
    { first: "Priscilla",last: "Atuhaire", gender: "female", parentName: "Samuel Atuhaire", parentPhone: "+256701000014" },
    { first: "Elijah", last: "Wasswa",     gender: "male",   parentName: "Harriet Wasswa",  parentPhone: "+256701000015" },
    { first: "Lydia",  last: "Nalwoga",    gender: "female", parentName: "Michael Nalwoga", parentPhone: "+256701000016" },
    { first: "Caleb",  last: "Opio",       gender: "male",   parentName: "Juliet Opio",     parentPhone: "+256701000017" },
    { first: "Abigail",last: "Namutebi",   gender: "female", parentName: "Richard Namutebi",parentPhone: "+256701000018" },
    { first: "Timothy",last: "Kizza",      gender: "male",   parentName: "Alice Kizza",     parentPhone: "+256701000019" },
  ];

  const studentNames2 = [
    { first: "Andrew", last: "Kiggundu",   gender: "male",   parentName: "Moses Kiggundu",  parentPhone: "+256701000004" },
    { first: "Patricia",last: "Kiggundu",  gender: "female", parentName: "Moses Kiggundu",  parentPhone: "+256701000004" },
    { first: "Victor", last: "Akello",     gender: "male",   parentName: "Janet Akello",    parentPhone: "+256701000005" },
    { first: "Diana",  last: "Akello",     gender: "female", parentName: "Janet Akello",    parentPhone: "+256701000005" },
    { first: "Simon",  last: "Ssemakula",  gender: "male",   parentName: "Rose Ssemakula",  parentPhone: "+256701000020" },
    { first: "Charity",last: "Nabwire",    gender: "female", parentName: "John Nabwire",    parentPhone: "+256701000021" },
    { first: "Peter",  last: "Ssekandi",   gender: "male",   parentName: "Florence Ssekandi",parentPhone: "+256701000022" },
    { first: "Martha", last: "Turyasingura",gender: "female",parentName: "Godfrey T.",      parentPhone: "+256701000023" },
    { first: "Gerald", last: "Byamukama",  gender: "male",   parentName: "Constance B.",    parentPhone: "+256701000024" },
    { first: "Juliet", last: "Kemigisa",   gender: "female", parentName: "Innocent K.",     parentPhone: "+256701000025" },
    { first: "Ronald", last: "Tumusiime",  gender: "male",   parentName: "Justine T.",      parentPhone: "+256701000026" },
    { first: "Annet",  last: "Birungi",    gender: "female", parentName: "Emmanuel B.",     parentPhone: "+256701000027" },
  ];

  // Assign fixed UUIDs to students
  for (let i = 0; i < studentNames1.length; i++) {
    STU[`s1_${String(i + 1).padStart(2, "0")}`] =
      `1${String(i + 1).padStart(7, "0")}-0000-0000-0000-000000000000`;
  }
  for (let i = 0; i < studentNames2.length; i++) {
    STU[`s2_${String(i + 1).padStart(2, "0")}`] =
      `2${String(i + 1).padStart(7, "0")}-0000-0000-0000-000000000000`;
  }

  // Assign students to classes (school 1)
  const s1ClassMap = [
    { classId: IDS.CLS_P1A, students: ["s1_01", "s1_02", "s1_03"] },
    { classId: IDS.CLS_P2A, students: ["s1_04", "s1_05", "s1_06"] },
    { classId: IDS.CLS_P3A, students: ["s1_07", "s1_08", "s1_09"] },
    { classId: IDS.CLS_P4A, students: ["s1_10", "s1_11", "s1_12"] },
    { classId: IDS.CLS_P5A, students: ["s1_13", "s1_14", "s1_15"] },
    { classId: IDS.CLS_P6A, students: ["s1_16", "s1_17", "s1_18"] },
    { classId: IDS.CLS_P7A, students: ["s1_19", "s1_20"] },
  ];

  // Assign students to classes (school 2)
  const s2ClassMap = [
    { classId: IDS.CLS_S1A, students: ["s2_01", "s2_02", "s2_03"] },
    { classId: IDS.CLS_S2A, students: ["s2_04", "s2_05", "s2_06"] },
    { classId: IDS.CLS_S3A, students: ["s2_07", "s2_08", "s2_09"] },
    { classId: IDS.CLS_S4A, students: ["s2_10", "s2_11", "s2_12"] },
  ];

  // ── Step 4: Generate and execute SQL ─────────────────────────────
  console.log("📦 Inserting seed data via SQL...\n");

  const batches = [
    // ═══════════════════════════════════════════════════════════════
    // BATCH 1: School Group + Schools + Academic Structure
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Academic Structure",
      sql: `
-- Link group admin
INSERT INTO group_admins (group_id, user_id) VALUES
  ('${IDS.GROUP}', '${U.groupAdmin}')
ON CONFLICT (group_id, user_id) DO NOTHING;

-- Academic Years
INSERT INTO academic_years (id, school_id, name, is_current) VALUES
  ('${IDS.AY2026_S1}', '${IDS.SCHOOL1}', '2026', true),
  ('${IDS.AY2026_S2}', '${IDS.SCHOOL2}', '2026', true)
ON CONFLICT (id) DO NOTHING;

-- Terms
INSERT INTO terms (id, school_id, academic_year_id, name, start_date, end_date, is_current) VALUES
  ('${IDS.T1_S1}', '${IDS.SCHOOL1}', '${IDS.AY2026_S1}', 'Term1', '2026-01-06', '2026-04-10', false),
  ('${IDS.T2_S1}', '${IDS.SCHOOL1}', '${IDS.AY2026_S1}', 'Term2', '2026-05-05', '2026-08-07', true),
  ('${IDS.T3_S1}', '${IDS.SCHOOL1}', '${IDS.AY2026_S1}', 'Term3', '2026-09-01', '2026-12-05', false),
  ('${IDS.T1_S2}', '${IDS.SCHOOL2}', '${IDS.AY2026_S2}', 'Term1', '2026-01-06', '2026-04-10', false),
  ('${IDS.T2_S2}', '${IDS.SCHOOL2}', '${IDS.AY2026_S2}', 'Term2', '2026-05-05', '2026-08-07', true),
  ('${IDS.T3_S2}', '${IDS.SCHOOL2}', '${IDS.AY2026_S2}', 'Term3', '2026-09-01', '2026-12-05', false)
ON CONFLICT (id) DO NOTHING;
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 2: Classes & Subjects
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Classes & Subjects",
      sql: `
-- Classes — School 1 (Primary)
INSERT INTO classes (id, school_id, name, level, stream, class_teacher_id) VALUES
  ('${IDS.CLS_P1A}', '${IDS.SCHOOL1}', 'P1-A', 'P1', 'A', '${U.teacher1a}'),
  ('${IDS.CLS_P2A}', '${IDS.SCHOOL1}', 'P2-A', 'P2', 'A', '${U.teacher1b}'),
  ('${IDS.CLS_P3A}', '${IDS.SCHOOL1}', 'P3-A', 'P3', 'A', '${U.teacher1c}'),
  ('${IDS.CLS_P4A}', '${IDS.SCHOOL1}', 'P4-A', 'P4', 'A', '${U.teacher1a}'),
  ('${IDS.CLS_P5A}', '${IDS.SCHOOL1}', 'P5-A', 'P5', 'A', '${U.teacher1b}'),
  ('${IDS.CLS_P6A}', '${IDS.SCHOOL1}', 'P6-A', 'P6', 'A', '${U.teacher1c}'),
  ('${IDS.CLS_P7A}', '${IDS.SCHOOL1}', 'P7-A', 'P7', 'A', '${U.teacher1a}')
ON CONFLICT (id) DO NOTHING;

-- Classes — School 2 (Secondary)
INSERT INTO classes (id, school_id, name, level, stream, class_teacher_id) VALUES
  ('${IDS.CLS_S1A}', '${IDS.SCHOOL2}', 'S1-A', 'S1', 'A', '${U.teacher2a}'),
  ('${IDS.CLS_S2A}', '${IDS.SCHOOL2}', 'S2-A', 'S2', 'A', '${U.teacher2b}'),
  ('${IDS.CLS_S3A}', '${IDS.SCHOOL2}', 'S3-A', 'S3', 'A', '${U.teacher2a}'),
  ('${IDS.CLS_S4A}', '${IDS.SCHOOL2}', 'S4-A', 'S4', 'A', '${U.teacher2b}')
ON CONFLICT (id) DO NOTHING;

-- Subjects — School 1
INSERT INTO subjects (id, school_id, name, code, max_marks) VALUES
  ('${IDS.SUB_MATH1}', '${IDS.SCHOOL1}', 'Mathematics',     'MATH', 100),
  ('${IDS.SUB_ENG1}',  '${IDS.SCHOOL1}', 'English',         'ENG',  100),
  ('${IDS.SUB_SCI1}',  '${IDS.SCHOOL1}', 'Science',         'SCI',  100),
  ('${IDS.SUB_SST1}',  '${IDS.SCHOOL1}', 'Social Studies',  'SST',  100),
  ('${IDS.SUB_CRE1}',  '${IDS.SCHOOL1}', 'Religious Studies','CRE',  100),
  ('${IDS.SUB_LIT1}',  '${IDS.SCHOOL1}', 'Literacy',        'LIT',  100),
  ('${IDS.SUB_ART1}',  '${IDS.SCHOOL1}', 'Art & Craft',     'ART',  50),
  ('${IDS.SUB_PE1}',   '${IDS.SCHOOL1}', 'Physical Education','PE',  50)
ON CONFLICT (id) DO NOTHING;

-- Subjects — School 2
INSERT INTO subjects (id, school_id, name, code, max_marks) VALUES
  ('${IDS.SUB_MATH2}', '${IDS.SCHOOL2}', 'Mathematics',  'MATH', 100),
  ('${IDS.SUB_ENG2}',  '${IDS.SCHOOL2}', 'English',      'ENG',  100),
  ('${IDS.SUB_PHY2}',  '${IDS.SCHOOL2}', 'Physics',      'PHY',  100),
  ('${IDS.SUB_CHM2}',  '${IDS.SCHOOL2}', 'Chemistry',    'CHM',  100),
  ('${IDS.SUB_BIO2}',  '${IDS.SCHOOL2}', 'Biology',      'BIO',  100),
  ('${IDS.SUB_HIS2}',  '${IDS.SCHOOL2}', 'History',      'HIS',  100),
  ('${IDS.SUB_GEO2}',  '${IDS.SCHOOL2}', 'Geography',    'GEO',  100),
  ('${IDS.SUB_LIT2}',  '${IDS.SCHOOL2}', 'Literature',   'LIT',  100),
  ('${IDS.SUB_CRE2}',  '${IDS.SCHOOL2}', 'CRE',          'CRE',  100)
ON CONFLICT (id) DO NOTHING;
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 3: Class-Subject Assignments & Teacher Assignments
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Class-Subject & Teacher Assignments",
      sql: `
-- Class-Subject links — School 1 (each class gets MATH, ENG, SCI, SST, CRE, LIT)
${[IDS.CLS_P1A, IDS.CLS_P2A, IDS.CLS_P3A, IDS.CLS_P4A, IDS.CLS_P5A, IDS.CLS_P6A, IDS.CLS_P7A]
  .flatMap((clsId, ci) => [
    IDS.SUB_MATH1, IDS.SUB_ENG1, IDS.SUB_SCI1, IDS.SUB_SST1, IDS.SUB_CRE1, IDS.SUB_LIT1
  ].map((subId, si) => {
    const teachers = [U.teacher1a, U.teacher1b, U.teacher1c];
    const teacherId = teachers[(ci + si) % 3];
    return `INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ('${clsId}', '${subId}', '${teacherId}') ON CONFLICT DO NOTHING;`;
  })).join("\n")}

-- Class-Subject links — School 2
${[IDS.CLS_S1A, IDS.CLS_S2A, IDS.CLS_S3A, IDS.CLS_S4A]
  .flatMap((clsId, ci) => [
    IDS.SUB_MATH2, IDS.SUB_ENG2, IDS.SUB_PHY2, IDS.SUB_CHM2, IDS.SUB_BIO2, IDS.SUB_HIS2, IDS.SUB_GEO2, IDS.SUB_LIT2, IDS.SUB_CRE2
  ].map((subId, si) => {
    const teachers = [U.teacher2a, U.teacher2b];
    const teacherId = teachers[(ci + si) % 2];
    return `INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ('${clsId}', '${subId}', '${teacherId}') ON CONFLICT DO NOTHING;`;
  })).join("\n")}

-- Teacher class assignments — School 1
INSERT INTO teacher_class_assignments (school_id, teacher_id, class_id, subject_id, is_class_teacher) VALUES
  ('${IDS.SCHOOL1}', '${U.teacher1a}', '${IDS.CLS_P1A}', '${IDS.SUB_MATH1}', true),
  ('${IDS.SCHOOL1}', '${U.teacher1a}', '${IDS.CLS_P4A}', '${IDS.SUB_MATH1}', false),
  ('${IDS.SCHOOL1}', '${U.teacher1b}', '${IDS.CLS_P2A}', '${IDS.SUB_ENG1}', true),
  ('${IDS.SCHOOL1}', '${U.teacher1b}', '${IDS.CLS_P5A}', '${IDS.SUB_ENG1}', false),
  ('${IDS.SCHOOL1}', '${U.teacher1c}', '${IDS.CLS_P3A}', '${IDS.SUB_SCI1}', true),
  ('${IDS.SCHOOL1}', '${U.teacher1c}', '${IDS.CLS_P6A}', '${IDS.SUB_SCI1}', false)
ON CONFLICT DO NOTHING;

-- Teacher class assignments — School 2
INSERT INTO teacher_class_assignments (school_id, teacher_id, class_id, subject_id, is_class_teacher) VALUES
  ('${IDS.SCHOOL2}', '${U.teacher2a}', '${IDS.CLS_S1A}', '${IDS.SUB_MATH2}', true),
  ('${IDS.SCHOOL2}', '${U.teacher2a}', '${IDS.CLS_S3A}', '${IDS.SUB_MATH2}', false),
  ('${IDS.SCHOOL2}', '${U.teacher2b}', '${IDS.CLS_S2A}', '${IDS.SUB_ENG2}', true),
  ('${IDS.SCHOOL2}', '${U.teacher2b}', '${IDS.CLS_S4A}', '${IDS.SUB_ENG2}', false)
ON CONFLICT DO NOTHING;
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 4: Students
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Students",
      sql: `
-- Students — School 1 (Greenfield Academy)
${studentNames1.map((s, i) => {
  const key = `s1_${String(i + 1).padStart(2, "0")}`;
  const sid = STU[key];
  // Find class
  let classId = IDS.CLS_P1A;
  for (const cm of s1ClassMap) {
    if (cm.students.includes(key)) { classId = cm.classId; break; }
  }
  const admNo = `GFA-2026-${String(i + 1).padStart(4, "0")}`;
  const dob = `${2018 - Math.floor(i / 3)}-${String((i % 12) + 1).padStart(2, "0")}-15`;
  return `INSERT INTO students (id, school_id, admission_number, full_name, date_of_birth, gender, parent_name, parent_phone, current_class_id, enrollment_date, status) VALUES ('${sid}', '${IDS.SCHOOL1}', '${admNo}', '${s.first} ${s.last}', '${dob}', '${s.gender}', '${s.parentName}', '${s.parentPhone}', '${classId}', '2026-01-06', 'active') ON CONFLICT (id) DO NOTHING;`;
}).join("\n")}

-- Students — School 2 (Sunrise Secondary)
${studentNames2.map((s, i) => {
  const key = `s2_${String(i + 1).padStart(2, "0")}`;
  const sid = STU[key];
  let classId = IDS.CLS_S1A;
  for (const cm of s2ClassMap) {
    if (cm.students.includes(key)) { classId = cm.classId; break; }
  }
  const admNo = `SSS-2026-${String(i + 1).padStart(4, "0")}`;
  const dob = `${2012 - Math.floor(i / 3)}-${String((i % 12) + 1).padStart(2, "0")}-20`;
  return `INSERT INTO students (id, school_id, admission_number, full_name, date_of_birth, gender, parent_name, parent_phone, current_class_id, enrollment_date, status) VALUES ('${sid}', '${IDS.SCHOOL2}', '${admNo}', '${s.first} ${s.last}', '${dob}', '${s.gender}', '${s.parentName}', '${s.parentPhone}', '${classId}', '2026-01-06', 'active') ON CONFLICT (id) DO NOTHING;`;
}).join("\n")}
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 5: Class Enrollments
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Class Enrollments",
      sql: `
-- Enrollments — School 1 (Term 2 current + Term 1 historical)
${s1ClassMap.flatMap(cm =>
  cm.students.map(key => {
    const sid = STU[key];
    return `INSERT INTO class_enrollments (student_id, class_id, term_id, academic_year_id) VALUES ('${sid}', '${cm.classId}', '${IDS.T2_S1}', '${IDS.AY2026_S1}') ON CONFLICT DO NOTHING;`;
  })
).join("\n")}

${s1ClassMap.flatMap(cm =>
  cm.students.map(key => {
    const sid = STU[key];
    return `INSERT INTO class_enrollments (student_id, class_id, term_id, academic_year_id) VALUES ('${sid}', '${cm.classId}', '${IDS.T1_S1}', '${IDS.AY2026_S1}') ON CONFLICT DO NOTHING;`;
  })
).join("\n")}

-- Enrollments — School 2
${s2ClassMap.flatMap(cm =>
  cm.students.map(key => {
    const sid = STU[key];
    return `INSERT INTO class_enrollments (student_id, class_id, term_id, academic_year_id) VALUES ('${sid}', '${cm.classId}', '${IDS.T2_S2}', '${IDS.AY2026_S2}') ON CONFLICT DO NOTHING;`;
  })
).join("\n")}

${s2ClassMap.flatMap(cm =>
  cm.students.map(key => {
    const sid = STU[key];
    return `INSERT INTO class_enrollments (student_id, class_id, term_id, academic_year_id) VALUES ('${sid}', '${cm.classId}', '${IDS.T1_S2}', '${IDS.AY2026_S2}') ON CONFLICT DO NOTHING;`;
  })
).join("\n")}
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 6: Fee Structures, Discounts, Accounts & Payments
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Fee Structures & Payments",
      sql: `
-- Fee Structures — School 1
INSERT INTO fee_structures (school_id, term_id, class_id, name, amount, is_mandatory) VALUES
  ('${IDS.SCHOOL1}', '${IDS.T2_S1}', NULL, 'Tuition', 150000, true),
  ('${IDS.SCHOOL1}', '${IDS.T2_S1}', NULL, 'Activity Fee', 25000, true),
  ('${IDS.SCHOOL1}', '${IDS.T2_S1}', NULL, 'Examination Fee', 15000, true),
  ('${IDS.SCHOOL1}', '${IDS.T2_S1}', NULL, 'Development Fund', 10000, false),
  ('${IDS.SCHOOL1}', '${IDS.T1_S1}', NULL, 'Tuition', 150000, true),
  ('${IDS.SCHOOL1}', '${IDS.T1_S1}', NULL, 'Activity Fee', 25000, true),
  ('${IDS.SCHOOL1}', '${IDS.T1_S1}', NULL, 'Examination Fee', 15000, true);

-- Fee Structures — School 2
INSERT INTO fee_structures (school_id, term_id, class_id, name, amount, is_mandatory) VALUES
  ('${IDS.SCHOOL2}', '${IDS.T2_S2}', NULL, 'Tuition', 350000, true),
  ('${IDS.SCHOOL2}', '${IDS.T2_S2}', NULL, 'Science Lab Fee', 45000, true),
  ('${IDS.SCHOOL2}', '${IDS.T2_S2}', NULL, 'Library Fee', 20000, true),
  ('${IDS.SCHOOL2}', '${IDS.T2_S2}', NULL, 'Examination Fee', 30000, true),
  ('${IDS.SCHOOL2}', '${IDS.T2_S2}', NULL, 'Sports Fee', 15000, false);

-- Fee Discounts
INSERT INTO fee_discounts (id, school_id, name, discount_type, value, max_amount, is_recurring) VALUES
  ('${IDS.DISC_SIBLING}', '${IDS.SCHOOL1}', 'Sibling Discount', 'percentage', 10, NULL, true),
  ('${IDS.DISC_STAFF}',   '${IDS.SCHOOL1}', 'Staff Waiver', 'percentage', 50, NULL, true),
  ('${IDS.DISC_SCHOLAR}', '${IDS.SCHOOL2}', 'Scholarship', 'fixed_amount', 100000, NULL, true)
ON CONFLICT (id) DO NOTHING;

-- Student Discounts (assign sibling discount to 2 students)
INSERT INTO student_discounts (school_id, student_id, discount_id, term_id, approved_by, note) VALUES
  ('${IDS.SCHOOL1}', '${STU.s1_02}', '${IDS.DISC_SIBLING}', '${IDS.T2_S1}', '${U.admin1}', 'Sibling of Samuel Kamukama'),
  ('${IDS.SCHOOL1}', '${STU.s1_04}', '${IDS.DISC_SIBLING}', '${IDS.T2_S1}', '${U.admin1}', 'Sibling of Isaac Sserwanga');

-- Fee Accounts — Term 2 School 1 (each student, expected = 190000 mandatory)
${s1ClassMap.flatMap(cm =>
  cm.students.map(key => {
    const sid = STU[key];
    const faId = `fa${sid.slice(1)}`; // derive from student id
    return `INSERT INTO fee_accounts (school_id, student_id, term_id, academic_year_id, total_expected, total_paid, balance, status) VALUES ('${IDS.SCHOOL1}', '${sid}', '${IDS.T2_S1}', '${IDS.AY2026_S1}', 190000, 0, 190000, 'unpaid') ON CONFLICT DO NOTHING;`;
  })
).join("\n")}

-- Fee Accounts — Term 2 School 2
${s2ClassMap.flatMap(cm =>
  cm.students.map(key => {
    const sid = STU[key];
    return `INSERT INTO fee_accounts (school_id, student_id, term_id, academic_year_id, total_expected, total_paid, balance, status) VALUES ('${IDS.SCHOOL2}', '${sid}', '${IDS.T2_S2}', '${IDS.AY2026_S2}', 445000, 0, 445000, 'unpaid') ON CONFLICT DO NOTHING;`;
  })
).join("\n")}

-- Fee Payments (some students have paid)
-- Samuel Kamukama: full payment
INSERT INTO fee_payments (school_id, fee_account_id, student_id, amount, payment_method, mobile_money_provider, phone_used, received_by_user_id, payment_date, notes, receipt_number, status)
SELECT '${IDS.SCHOOL1}', fa.id, '${STU.s1_01}', 190000, 'mobile_money', 'mtn', '+256701000001', '${U.bursar1}', '2026-05-10', 'Full term payment', 'SKULI-GFA-202605-0001', 'confirmed'
FROM fee_accounts fa WHERE fa.student_id = '${STU.s1_01}' AND fa.term_id = '${IDS.T2_S1}' LIMIT 1;

-- Isaac Sserwanga: partial payment
INSERT INTO fee_payments (school_id, fee_account_id, student_id, amount, payment_method, mobile_money_provider, phone_used, received_by_user_id, payment_date, notes, receipt_number, status)
SELECT '${IDS.SCHOOL1}', fa.id, '${STU.s1_03}', 100000, 'mobile_money', 'airtel', '+256701000002', '${U.bursar1}', '2026-05-12', 'Partial payment', 'SKULI-GFA-202605-0002', 'confirmed'
FROM fee_accounts fa WHERE fa.student_id = '${STU.s1_03}' AND fa.term_id = '${IDS.T2_S1}' LIMIT 1;

-- Ruth Nakato: full payment via cash
INSERT INTO fee_payments (school_id, fee_account_id, student_id, amount, payment_method, received_by_user_id, payment_date, notes, receipt_number, status)
SELECT '${IDS.SCHOOL1}', fa.id, '${STU.s1_05}', 190000, 'cash', '${U.bursar1}', '2026-05-08', 'Cash payment at office', 'SKULI-GFA-202605-0003', 'confirmed'
FROM fee_accounts fa WHERE fa.student_id = '${STU.s1_05}' AND fa.term_id = '${IDS.T2_S1}' LIMIT 1;

-- Andrew Kiggundu: full payment
INSERT INTO fee_payments (school_id, fee_account_id, student_id, amount, payment_method, mobile_money_provider, phone_used, received_by_user_id, payment_date, notes, receipt_number, status)
SELECT '${IDS.SCHOOL2}', fa.id, '${STU.s2_01}', 445000, 'mobile_money', 'mtn', '+256701000004', '${U.bursar2}', '2026-05-11', 'Full term payment', 'SKULI-SSS-202605-0001', 'confirmed'
FROM fee_accounts fa WHERE fa.student_id = '${STU.s2_01}' AND fa.term_id = '${IDS.T2_S2}' LIMIT 1;

-- Victor Akello: partial
INSERT INTO fee_payments (school_id, fee_account_id, student_id, amount, payment_method, received_by_user_id, payment_date, notes, receipt_number, status)
SELECT '${IDS.SCHOOL2}', fa.id, '${STU.s2_03}', 250000, 'bank', '${U.bursar2}', '2026-05-15', 'Bank transfer partial', 'SKULI-SSS-202605-0002', 'confirmed'
FROM fee_accounts fa WHERE fa.student_id = '${STU.s2_03}' AND fa.term_id = '${IDS.T2_S2}' LIMIT 1;

-- Recalculate fee accounts that have payments
SELECT recalculate_fee_account(fa.id)
FROM fee_accounts fa
WHERE fa.term_id IN ('${IDS.T2_S1}', '${IDS.T2_S2}')
  AND fa.student_id IN ('${STU.s1_01}', '${STU.s1_03}', '${STU.s1_05}', '${STU.s2_01}', '${STU.s2_03}');
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 7: Staff & Payroll
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Staff & Payroll",
      sql: `
-- Staff — School 1
INSERT INTO staff (id, school_id, user_id, employee_number, full_name, role_title, national_id, bank_name, bank_account, nssf_number, basic_salary, hire_date, is_active) VALUES
  ('af000001-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', '${U.teacher1a}', 'GFA-T001', 'Grace Nakamya',    'Senior Teacher',  'CM920001', 'Stanbic', '9200000001', 'NSSF001', 450000, '2022-01-10', true),
  ('af000002-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', '${U.teacher1b}', 'GFA-T002', 'David Okello',     'Teacher',         'CM920002', 'Centenary','9200000002', 'NSSF002', 400000, '2023-02-01', true),
  ('af000003-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', '${U.teacher1c}', 'GFA-T003', 'Sarah Achieng',    'Teacher',         'CM920003', 'DFCU',    '9200000003', 'NSSF003', 400000, '2023-06-15', true),
  ('af000004-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', '${U.bursar1}',   'GFA-B001', 'James Mukasa',     'Bursar',          'CM920004', 'Stanbic', '9200000004', 'NSSF004', 500000, '2021-03-01', true),
  ('af000005-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', NULL,             'GFA-N001', 'Patricia Nansaba', 'Support Staff',   'CM920005', NULL,      NULL,        NULL,     200000, '2024-01-15', true)
ON CONFLICT (id) DO NOTHING;

-- Staff — School 2
INSERT INTO staff (id, school_id, user_id, employee_number, full_name, role_title, national_id, bank_name, bank_account, nssf_number, basic_salary, hire_date, is_active) VALUES
  ('af000006-0000-0000-0000-000000000000', '${IDS.SCHOOL2}', '${U.teacher2a}', 'SSS-T001', 'Peter Mugisha',    'Head of Department','CM930001', 'Stanbic', '9300000001', 'NSSF005', 600000, '2020-01-10', true),
  ('af000007-0000-0000-0000-000000000000', '${IDS.SCHOOL2}', '${U.teacher2b}', 'SSS-T002', 'Christine Apio',   'Teacher',          'CM930002', 'Centenary','9300000002', 'NSSF006', 550000, '2021-06-01', true),
  ('af000008-0000-0000-0000-000000000000', '${IDS.SCHOOL2}', '${U.bursar2}',   'SSS-B001', 'Agnes Nabirye',    'Bursar',           'CM930003', 'DFCU',    '9300000003', 'NSSF007', 550000, '2021-09-01', true),
  ('af000009-0000-0000-0000-000000000000', '${IDS.SCHOOL2}', NULL,             'SSS-L001', 'Robert Wasswa',    'Lab Technician',   'CM930004', NULL,      NULL,        NULL,     300000, '2023-04-01', true)
ON CONFLICT (id) DO NOTHING;

-- Payroll — May 2026 for School 1 staff
INSERT INTO payroll_records (school_id, staff_id, month, year, basic_salary, allowances, deductions, nssf_employee, nssf_employer, net_salary, payment_status, paid_at, payment_method) VALUES
  ('${IDS.SCHOOL1}', 'af000001-0000-0000-0000-000000000000', 5, 2026, 450000, '{"housing": 50000}', '{"paye": 45000}', 27000, 45000, 428000, 'paid', '2026-05-28', 'bank'),
  ('${IDS.SCHOOL1}', 'af000002-0000-0000-0000-000000000000', 5, 2026, 400000, '{"housing": 50000}', '{"paye": 38000}', 24000, 40000, 388000, 'paid', '2026-05-28', 'bank'),
  ('${IDS.SCHOOL1}', 'af000003-0000-0000-0000-000000000000', 5, 2026, 400000, '{"housing": 50000}', '{"paye": 38000}', 24000, 40000, 388000, 'paid', '2026-05-28', 'bank'),
  ('${IDS.SCHOOL1}', 'af000004-0000-0000-0000-000000000000', 5, 2026, 500000, '{"housing": 50000}', '{"paye": 55000}', 30000, 50000, 465000, 'paid', '2026-05-28', 'bank'),
  ('${IDS.SCHOOL1}', 'af000005-0000-0000-0000-000000000000', 5, 2026, 200000, '{}', '{"paye": 10000}', 12000, 20000, 178000, 'pending', NULL, NULL);

-- Payroll — May 2026 for School 2 staff
INSERT INTO payroll_records (school_id, staff_id, month, year, basic_salary, allowances, deductions, nssf_employee, nssf_employer, net_salary, payment_status, paid_at, payment_method) VALUES
  ('${IDS.SCHOOL2}', 'af000006-0000-0000-0000-000000000000', 5, 2026, 600000, '{"housing": 80000, "responsibility": 50000}', '{"paye": 75000}', 36000, 60000, 619000, 'paid', '2026-05-28', 'bank'),
  ('${IDS.SCHOOL2}', 'af000007-0000-0000-0000-000000000000', 5, 2026, 550000, '{"housing": 80000}', '{"paye": 65000}', 33000, 55000, 532000, 'paid', '2026-05-28', 'bank'),
  ('${IDS.SCHOOL2}', 'af000008-0000-0000-0000-000000000000', 5, 2026, 550000, '{"housing": 80000}', '{"paye": 65000}', 33000, 55000, 532000, 'pending', NULL, NULL),
  ('${IDS.SCHOOL2}', 'af000009-0000-0000-0000-000000000000', 5, 2026, 300000, '{}', '{"paye": 20000}', 18000, 30000, 262000, 'pending', NULL, NULL);
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 8: Marks (BOT + Midterm for Term 2)
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Marks",
      sql: `
-- Marks — School 1, BOT exams (Term 1, for historical data)
${s1ClassMap.flatMap(cm =>
  cm.students.flatMap(key => {
    const sid = STU[key];
    const subjects = [IDS.SUB_MATH1, IDS.SUB_ENG1, IDS.SUB_SCI1, IDS.SUB_SST1, IDS.SUB_CRE1, IDS.SUB_LIT1];
    return subjects.map((subId, si) => {
      const score = 50 + ((parseInt(key.split("_")[1]) * 7 + si * 13) % 45); // Deterministic pseudo-random 50-94
      return `INSERT INTO marks (school_id, student_id, subject_id, class_id, term_id, academic_year_id, exam_type, score, max_score, entered_by, review_status) VALUES ('${IDS.SCHOOL1}', '${sid}', '${subId}', '${cm.classId}', '${IDS.T1_S1}', '${IDS.AY2026_S1}', 'bot', ${score}, 100, '${U.teacher1a}', 'approved') ON CONFLICT DO NOTHING;`;
    });
  })
).join("\n")}

-- Marks — School 1, Midterm exams (Term 2, current)
${s1ClassMap.flatMap(cm =>
  cm.students.flatMap(key => {
    const sid = STU[key];
    const subjects = [IDS.SUB_MATH1, IDS.SUB_ENG1, IDS.SUB_SCI1, IDS.SUB_SST1, IDS.SUB_CRE1, IDS.SUB_LIT1];
    return subjects.map((subId, si) => {
      const score = 55 + ((parseInt(key.split("_")[1]) * 11 + si * 17) % 40); // 55-94
      return `INSERT INTO marks (school_id, student_id, subject_id, class_id, term_id, academic_year_id, exam_type, score, max_score, entered_by, review_status) VALUES ('${IDS.SCHOOL1}', '${sid}', '${subId}', '${cm.classId}', '${IDS.T2_S1}', '${IDS.AY2026_S1}', 'midterm', ${score}, 100, '${U.teacher1a}', 'approved') ON CONFLICT DO NOTHING;`;
    });
  })
).join("\n")}

-- Marks — School 2, Midterm (Term 2)
${s2ClassMap.flatMap(cm =>
  cm.students.flatMap(key => {
    const sid = STU[key];
    const subjects = [IDS.SUB_MATH2, IDS.SUB_ENG2, IDS.SUB_PHY2, IDS.SUB_CHM2, IDS.SUB_BIO2, IDS.SUB_HIS2, IDS.SUB_GEO2, IDS.SUB_LIT2, IDS.SUB_CRE2];
    return subjects.map((subId, si) => {
      const score = 40 + ((parseInt(key.split("_")[1]) * 9 + si * 11) % 55); // 40-94
      return `INSERT INTO marks (school_id, student_id, subject_id, class_id, term_id, academic_year_id, exam_type, score, max_score, entered_by, review_status) VALUES ('${IDS.SCHOOL2}', '${sid}', '${subId}', '${cm.classId}', '${IDS.T2_S2}', '${IDS.AY2026_S2}', 'midterm', ${score}, 100, '${U.teacher2a}', 'approved') ON CONFLICT DO NOTHING;`;
    });
  })
).join("\n")}

-- Some marks pending review (School 2, a few BOT marks)
${s2ClassMap.slice(0, 2).flatMap(cm =>
  cm.students.slice(0, 2).flatMap(key => {
    const sid = STU[key];
    const subjects = [IDS.SUB_MATH2, IDS.SUB_ENG2];
    return subjects.map((subId, si) => {
      const score = 45 + ((parseInt(key.split("_")[1]) * 7 + si * 5) % 30);
      return `INSERT INTO marks (school_id, student_id, subject_id, class_id, term_id, academic_year_id, exam_type, score, max_score, entered_by, review_status, review_comment) VALUES ('${IDS.SCHOOL2}', '${sid}', '${subId}', '${cm.classId}', '${IDS.T1_S2}', '${IDS.AY2026_S2}', 'bot', ${score}, 100, '${U.teacher2b}', 'submitted', 'Awaiting HOD approval') ON CONFLICT DO NOTHING;`;
    });
  })
).join("\n")}
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 9: Report Cards (Term 1 published)
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Report Cards",
      sql: `
-- Report cards — School 1, Term 1 (published)
${s1ClassMap.flatMap(cm =>
  cm.students.map((key, idx) => {
    const sid = STU[key];
    const total = 380 + (idx * 23) % 120;
    const avg = Math.round(total / 6 * 10) / 10;
    const pos = idx + 1;
    const conduct = avg > 70 ? 'A' : avg > 55 ? 'B' : 'C';
    return `INSERT INTO report_cards (school_id, student_id, term_id, academic_year_id, total_marks, average, position_in_class, class_size, class_teacher_comment, headmaster_comment, conduct_grade, is_published) VALUES ('${IDS.SCHOOL1}', '${sid}', '${IDS.T1_S1}', '${IDS.AY2026_S1}', ${total}, ${avg}, ${pos}, ${cm.students.length}, 'Good performance. Keep it up.', 'Well done.', '${conduct}', true) ON CONFLICT DO NOTHING;`;
  })
).join("\n")}

-- Report cards — School 2, Term 1 (published)
${s2ClassMap.flatMap(cm =>
  cm.students.map((key, idx) => {
    const sid = STU[key];
    const total = 320 + (idx * 31) % 200;
    const avg = Math.round(total / 9 * 10) / 10;
    const pos = idx + 1;
    const conduct = avg > 65 ? 'A' : avg > 50 ? 'B' : 'C';
    return `INSERT INTO report_cards (school_id, student_id, term_id, academic_year_id, total_marks, average, position_in_class, class_size, class_teacher_comment, headmaster_comment, conduct_grade, is_published) VALUES ('${IDS.SCHOOL2}', '${sid}', '${IDS.T1_S2}', '${IDS.AY2026_S2}', ${total}, ${avg}, ${pos}, ${cm.students.length}, 'Satisfactory progress.', 'Keep working hard.', '${conduct}', true) ON CONFLICT DO NOTHING;`;
  })
).join("\n")}
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 10: Attendance Records (2 weeks of Term 2)
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Attendance Records",
      sql: `
-- Attendance — School 1, 10 school days in May 2026
${(() => {
  const dates = ['2026-05-05','2026-05-06','2026-05-07','2026-05-08','2026-05-09',
                 '2026-05-12','2026-05-13','2026-05-14','2026-05-15','2026-05-16'];
  return s1ClassMap.flatMap(cm =>
    cm.students.flatMap(key => {
      const sid = STU[key];
      const studentIdx = parseInt(key.split("_")[1]);
      return dates.map((date, di) => {
        // Most present, some absent/late deterministically
        let status = 'present';
        if ((studentIdx + di) % 11 === 0) status = 'absent';
        else if ((studentIdx + di) % 7 === 0) status = 'late';
        else if ((studentIdx + di) % 13 === 0) status = 'excused';
        const teacherMap = { [IDS.CLS_P1A]: U.teacher1a, [IDS.CLS_P2A]: U.teacher1b, [IDS.CLS_P3A]: U.teacher1c,
                             [IDS.CLS_P4A]: U.teacher1a, [IDS.CLS_P5A]: U.teacher1b, [IDS.CLS_P6A]: U.teacher1c, [IDS.CLS_P7A]: U.teacher1a };
        const markedBy = teacherMap[cm.classId] || U.teacher1a;
        return `INSERT INTO attendance_records (school_id, student_id, class_id, date, status, marked_by) VALUES ('${IDS.SCHOOL1}', '${sid}', '${cm.classId}', '${date}', '${status}', '${markedBy}') ON CONFLICT DO NOTHING;`;
      });
    })
  ).join("\n");
})()}

-- Attendance — School 2, 10 school days in May 2026
${(() => {
  const dates = ['2026-05-05','2026-05-06','2026-05-07','2026-05-08','2026-05-09',
                 '2026-05-12','2026-05-13','2026-05-14','2026-05-15','2026-05-16'];
  return s2ClassMap.flatMap(cm =>
    cm.students.flatMap(key => {
      const sid = STU[key];
      const studentIdx = parseInt(key.split("_")[1]);
      return dates.map((date, di) => {
        let status = 'present';
        if ((studentIdx + di) % 9 === 0) status = 'absent';
        else if ((studentIdx + di) % 11 === 0) status = 'late';
        const teacherMap = { [IDS.CLS_S1A]: U.teacher2a, [IDS.CLS_S2A]: U.teacher2b, [IDS.CLS_S3A]: U.teacher2a, [IDS.CLS_S4A]: U.teacher2b };
        const markedBy = teacherMap[cm.classId] || U.teacher2a;
        return `INSERT INTO attendance_records (school_id, student_id, class_id, date, status, marked_by) VALUES ('${IDS.SCHOOL2}', '${sid}', '${cm.classId}', '${date}', '${status}', '${markedBy}') ON CONFLICT DO NOTHING;`;
      });
    })
  ).join("\n");
})()}
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 11: Announcements, SMS Logs & Templates
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Announcements, SMS & Templates",
      sql: `
-- Announcements — School 1
INSERT INTO announcements (school_id, title, body, target_audience, target_class_ids, sent_via, sent_at, sent_by, sms_cost) VALUES
  ('${IDS.SCHOOL1}', 'Term 2 Opening', 'Welcome back! Term 2 begins on 5th May 2026. All students should report by 8:00 AM with full requirements.', 'all', '{}', 'sms', '2026-05-01 09:00:00+03', '${U.admin1}', 15000),
  ('${IDS.SCHOOL1}', 'Mid-Term Exams', 'Mid-term examinations will run from 26th May to 30th May 2026. Please ensure students are well prepared.', 'all', '{}', 'sms', '2026-05-20 10:00:00+03', '${U.admin1}', 15000),
  ('${IDS.SCHOOL1}', 'P7 Mock Exams', 'P7 students will sit for mock examinations next week. Extra revision classes available after school.', 'class', ARRAY['${IDS.CLS_P7A}']::uuid[], 'sms', '2026-05-18 08:00:00+03', '${U.admin1}', 3000),
  ('${IDS.SCHOOL1}', 'Fee Reminder', 'Dear parents, please clear outstanding fee balances before end of May. Contact the bursar for payment plans.', 'defaulters', '{}', 'sms', '2026-05-22 11:00:00+03', '${U.bursar1}', 8000),
  ('${IDS.SCHOOL1}', 'Sports Day', 'Annual Sports Day will be held on 14th June 2026. All parents are welcome to attend!', 'all', '{}', 'in_app', '2026-05-25 14:00:00+03', '${U.admin1}', NULL);

-- Announcements — School 2
INSERT INTO announcements (school_id, title, body, target_audience, target_class_ids, sent_via, sent_at, sent_by, sms_cost) VALUES
  ('${IDS.SCHOOL2}', 'Lab Equipment Update', 'New science lab equipment has been installed. All S3 and S4 students will have practical sessions starting next week.', 'class', ARRAY['${IDS.CLS_S3A}','${IDS.CLS_S4A}']::uuid[], 'in_app', '2026-05-10 09:00:00+03', '${U.admin2}', NULL),
  ('${IDS.SCHOOL2}', 'Parent-Teacher Meeting', 'PTA meeting scheduled for 28th June 2026 at 2:00 PM. Attendance is compulsory for all parents.', 'all', '{}', 'sms', '2026-05-25 10:00:00+03', '${U.admin2}', 20000);

-- SMS Logs
INSERT INTO sms_logs (school_id, recipient_phone, message_body, message_type, status, cost, sent_at) VALUES
  ('${IDS.SCHOOL1}', '+256701000001', 'Welcome back! Term 2 begins on 5th May 2026. All students should report by 8:00 AM.', 'announcement', 'delivered', 50, '2026-05-01 09:01:00+03'),
  ('${IDS.SCHOOL1}', '+256701000002', 'Welcome back! Term 2 begins on 5th May 2026. All students should report by 8:00 AM.', 'announcement', 'delivered', 50, '2026-05-01 09:01:00+03'),
  ('${IDS.SCHOOL1}', '+256701000003', 'Welcome back! Term 2 begins on 5th May 2026. All students should report by 8:00 AM.', 'announcement', 'delivered', 50, '2026-05-01 09:01:00+03'),
  ('${IDS.SCHOOL1}', '+256701000001', 'Dear parent, Samuel Kamukama was present today. Thank you.', 'absence', 'delivered', 50, '2026-05-05 16:00:00+03'),
  ('${IDS.SCHOOL1}', '+256701000002', 'Dear parent, Isaac Sserwanga was absent today. Please contact the school.', 'absence', 'delivered', 50, '2026-05-07 16:00:00+03'),
  ('${IDS.SCHOOL2}', '+256701000004', 'PTA meeting scheduled for 28th June 2026 at 2:00 PM. Attendance compulsory.', 'announcement', 'sent', 50, '2026-05-25 10:01:00+03'),
  ('${IDS.SCHOOL2}', '+256701000005', 'PTA meeting scheduled for 28th June 2026 at 2:00 PM. Attendance compulsory.', 'announcement', 'pending', NULL, NULL);

-- SMS Templates (for schools created after migration 00035 ran)
INSERT INTO sms_templates (school_id, name, body, variables, is_default)
SELECT s.id, t.name, t.body, t.variables::text[], true
FROM schools s
CROSS JOIN (
  VALUES
    ('Fee Reminder', 'Dear {parent_name}, fee balance for {student_name} is {balance}. Pay before {due_date}.', ARRAY['parent_name', 'student_name', 'balance', 'due_date']),
    ('Payment Receipt', 'Payment of {amount} received for {student_name}. Receipt: {receipt_number}. Thank you.', ARRAY['parent_name', 'amount', 'student_name', 'receipt_number']),
    ('Absence Alert', 'Dear {parent_name}, {student_name} was absent on {date}. Contact school if error.', ARRAY['parent_name', 'student_name', 'date']),
    ('Exam Results', '{student_name}''s results for {term}: Average {average}%. Check portal.', ARRAY['student_name', 'term', 'average'])
) AS t(name, body, variables)
WHERE NOT EXISTS (
  SELECT 1 FROM sms_templates WHERE school_id = s.id AND is_default = true
);
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 12: Meetings, Message Threads, Calendar
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Meetings, Messaging & Calendar",
      sql: `
-- Meeting Slots — School 1
INSERT INTO meeting_slots (school_id, teacher_id, slot_date, start_time, end_time, duration_minutes, is_booked) VALUES
  ('${IDS.SCHOOL1}', '${IDS.STAFF_T1A}', '2026-06-02', '09:00', '09:30', 30, true),
  ('${IDS.SCHOOL1}', '${IDS.STAFF_T1A}', '2026-06-02', '09:30', '10:00', 30, false),
  ('${IDS.SCHOOL1}', '${IDS.STAFF_T1A}', '2026-06-02', '10:00', '10:30', 30, false),
  ('${IDS.SCHOOL1}', '${IDS.STAFF_T1B}', '2026-06-03', '14:00', '14:30', 30, true),
  ('${IDS.SCHOOL1}', '${IDS.STAFF_T1B}', '2026-06-03', '14:30', '15:00', 30, false),
  ('${IDS.SCHOOL1}', '${IDS.STAFF_T1C}', '2026-06-04', '08:00', '08:30', 30, false),
  ('${IDS.SCHOOL1}', '${IDS.STAFF_T1C}', '2026-06-04', '08:30', '09:00', 30, false);

-- Meeting Slots — School 2
INSERT INTO meeting_slots (school_id, teacher_id, slot_date, start_time, end_time, duration_minutes, is_booked) VALUES
  ('${IDS.SCHOOL2}', '${IDS.STAFF_T2A}', '2026-06-05', '10:00', '10:30', 30, true),
  ('${IDS.SCHOOL2}', '${IDS.STAFF_T2A}', '2026-06-05', '10:30', '11:00', 30, false),
  ('${IDS.SCHOOL2}', '${IDS.STAFF_T2B}', '2026-06-06', '13:00', '13:30', 30, false);

-- Meeting Bookings
INSERT INTO meeting_bookings (slot_id, school_id, student_id, parent_name, parent_phone, notes, status)
SELECT ms.id, '${IDS.SCHOOL1}', '${STU.s1_01}', 'Mary Nansubuga', '+256701000001', 'Discuss Samuel''s performance in Science', 'confirmed'
FROM meeting_slots ms WHERE ms.school_id = '${IDS.SCHOOL1}' AND ms.teacher_id = '${IDS.STAFF_T1A}' AND ms.slot_date = '2026-06-02' AND ms.start_time = '09:00';

INSERT INTO meeting_bookings (slot_id, school_id, student_id, parent_name, parent_phone, notes, status)
SELECT ms.id, '${IDS.SCHOOL1}', '${STU.s1_03}', 'John Sserwanga', '+256701000002', 'Fee payment plan discussion', 'confirmed'
FROM meeting_slots ms WHERE ms.school_id = '${IDS.SCHOOL1}' AND ms.teacher_id = '${IDS.STAFF_T1B}' AND ms.slot_date = '2026-06-03' AND ms.start_time = '14:00';

INSERT INTO meeting_bookings (slot_id, school_id, student_id, parent_name, parent_phone, notes, status)
SELECT ms.id, '${IDS.SCHOOL2}', '${STU.s2_01}', 'Moses Kiggundu', '+256701000004', 'Andrew''s subject choices for S3', 'confirmed'
FROM meeting_slots ms WHERE ms.school_id = '${IDS.SCHOOL2}' AND ms.teacher_id = '${IDS.STAFF_T2A}' AND ms.slot_date = '2026-06-05' AND ms.start_time = '10:00';

-- Message Threads — School 1
INSERT INTO message_threads (id, school_id, parent_phone, student_id, last_message_at, is_read) VALUES
  ('ae000001-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', '+256701000001', '${STU.s1_01}', '2026-05-20 14:30:00+03', true),
  ('ae000002-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', '+256701000002', '${STU.s1_03}', '2026-05-22 09:15:00+03', false)
ON CONFLICT (id) DO NOTHING;

-- Thread Messages
INSERT INTO thread_messages (thread_id, school_id, direction, body, sender_name, status, sent_at) VALUES
  ('ae000001-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', 'inbound', 'Hello, I wanted to ask about Samuel''s midterm results.', 'Mary Nansubuga', 'sent', '2026-05-20 14:00:00+03'),
  ('ae000001-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', 'outbound', 'Hello Mrs. Nansubuga, Samuel scored 78% average. He is doing well in Mathematics. The full report will be shared after end of term.', 'Florence Kamukama', 'delivered', '2026-05-20 14:30:00+03'),
  ('ae000002-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', 'inbound', 'Good morning. I would like to discuss Isaac''s fee balance. Can I come to school tomorrow?', 'John Sserwanga', 'sent', '2026-05-22 09:00:00+03'),
  ('ae000002-0000-0000-0000-000000000000', '${IDS.SCHOOL1}', 'outbound', 'Good morning Mr. Sserwanga. Yes, you are welcome. The bursar is available from 9 AM to 4 PM. You can also pay via mobile money.', 'Florence Kamukama', 'sent', '2026-05-22 09:15:00+03');

-- Calendar Events
INSERT INTO calendar_events (school_id, title, description, event_date, end_date, event_type, affects_attendance, is_public, created_by) VALUES
  ('${IDS.SCHOOL1}', 'Labour Day', 'Public Holiday - Labour Day', '2026-05-01', NULL, 'holiday', true, true, '${U.admin1}'),
  ('${IDS.SCHOOL1}', 'Mid-Term Exams Begin', 'Mid-term examination period starts', '2026-05-26', '2026-05-30', 'exam', false, true, '${U.admin1}'),
  ('${IDS.SCHOOL1}', 'Mid-Term Break', 'Half-term holiday', '2026-05-31', '2026-06-01', 'holiday', true, true, '${U.admin1}'),
  ('${IDS.SCHOOL1}', 'Sports Day', 'Annual inter-class sports competition', '2026-06-14', NULL, 'event', false, true, '${U.admin1}'),
  ('${IDS.SCHOOL1}', 'Martyrs Day', 'Public Holiday', '2026-06-03', NULL, 'holiday', true, true, '${U.admin1}'),
  ('${IDS.SCHOOL1}', 'End of Term 2', 'Last day of Term 2', '2026-08-07', NULL, 'closure', false, true, '${U.admin1}'),
  ('${IDS.SCHOOL2}', 'Lab Opening', 'New science lab official opening', '2026-05-15', NULL, 'event', false, true, '${U.admin2}'),
  ('${IDS.SCHOOL2}', 'Mid-Term Exams', 'S1-S4 mid-term examinations', '2026-05-26', '2026-05-30', 'exam', false, true, '${U.admin2}'),
  ('${IDS.SCHOOL2}', 'Career Day', 'Career guidance and university fair', '2026-06-20', NULL, 'event', false, true, '${U.admin2}'),
  ('${IDS.SCHOOL2}', 'Independence Day', 'Public Holiday', '2026-10-09', NULL, 'holiday', true, true, '${U.admin2}');
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 13: Library, Assets, Expenses, Discipline, Timetable
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Library, Assets, Expenses, Discipline & Timetable",
      sql: `
-- Library Books — School 1
INSERT INTO library_books (school_id, title, author, isbn, category, total_copies, available_copies, shelf_location) VALUES
  ('${IDS.SCHOOL1}', 'Primary Mathematics P6', 'MK Publishers', '978-9970-001-01-1', 'Textbook', 30, 22, 'Shelf A1'),
  ('${IDS.SCHOOL1}', 'English Grammar P7', 'Longhorn', '978-9970-001-02-2', 'Textbook', 25, 18, 'Shelf A2'),
  ('${IDS.SCHOOL1}', 'Integrated Science P5', 'Oxford', '978-9970-001-03-3', 'Textbook', 20, 15, 'Shelf B1'),
  ('${IDS.SCHOOL1}', 'The River Between', 'Ngugi wa Thiong''o', '978-0-435-90850-4', 'Literature', 15, 10, 'Shelf C1'),
  ('${IDS.SCHOOL1}', 'Weep Not Child', 'Ngugi wa Thiong''o', '978-0-435-90072-5', 'Literature', 15, 12, 'Shelf C1'),
  ('${IDS.SCHOOL1}', 'Atlas of East Africa', 'Macmillan', '978-9970-001-04-4', 'Reference', 5, 4, 'Shelf D1'),
  ('${IDS.SCHOOL1}', 'Oxford Primary Dictionary', 'OUP', '978-0-19-431025-8', 'Reference', 10, 8, 'Shelf D2'),
  ('${IDS.SCHOOL1}', 'African Folk Tales', 'Various', NULL, 'General', 20, 16, 'Shelf E1');

-- Library Books — School 2
INSERT INTO library_books (school_id, title, author, isbn, category, total_copies, available_copies, shelf_location) VALUES
  ('${IDS.SCHOOL2}', 'New Certificate Physics', 'John W. Noakes', '978-0-582-02848-1', 'Textbook', 25, 20, 'Shelf F1'),
  ('${IDS.SCHOOL2}', 'Understanding Chemistry', 'R.W. Renshaw', '978-0-7195-7540-5', 'Textbook', 25, 19, 'Shelf F2'),
  ('${IDS.SCHOOL2}', 'Certificate Biology', 'M.B. Njau', '978-9970-002-01-1', 'Textbook', 30, 24, 'Shelf F3'),
  ('${IDS.SCHOOL2}', 'Things Fall Apart', 'Chinua Achebe', '978-0-435-90525-7', 'Literature', 20, 14, 'Shelf G1'),
  ('${IDS.SCHOOL2}', 'The Pearl', 'John Steinbeck', '978-0-14-024618-8', 'Literature', 15, 11, 'Shelf G1'),
  ('${IDS.SCHOOL2}', 'Advanced Mathematics S4', 'Makerere Press', NULL, 'Textbook', 20, 17, 'Shelf H1');

-- Library Issues (some books currently checked out)
INSERT INTO library_issues (school_id, book_id, student_id, issued_at, due_date, returned_at, fine_amount, fine_paid, issued_by)
SELECT '${IDS.SCHOOL1}', lb.id, '${STU.s1_01}', '2026-05-10', '2026-05-24', NULL, NULL, false, '${U.admin1}'
FROM library_books lb WHERE lb.title = 'The River Between' AND lb.school_id = '${IDS.SCHOOL1}' LIMIT 1;

INSERT INTO library_issues (school_id, book_id, student_id, issued_at, due_date, returned_at, fine_amount, fine_paid, issued_by)
SELECT '${IDS.SCHOOL1}', lb.id, '${STU.s1_05}', '2026-04-20', '2026-05-04', '2026-05-06', 500, true, '${U.admin1}'
FROM library_books lb WHERE lb.title = 'Weep Not Child' AND lb.school_id = '${IDS.SCHOOL1}' LIMIT 1;

INSERT INTO library_issues (school_id, book_id, student_id, issued_at, due_date, returned_at, fine_amount, fine_paid, issued_by)
SELECT '${IDS.SCHOOL2}', lb.id, '${STU.s2_01}', '2026-05-08', '2026-05-22', NULL, NULL, false, '${U.admin2}'
FROM library_books lb WHERE lb.title = 'Things Fall Apart' AND lb.school_id = '${IDS.SCHOOL2}' LIMIT 1;

-- Assets — School 1
INSERT INTO assets (school_id, name, asset_code, category, purchase_date, purchase_price, current_value, condition, location, notes) VALUES
  ('${IDS.SCHOOL1}', 'Desktop Computer (HP)', 'GFA-IT-001', 'IT Equipment', '2024-01-15', 2500000, 1800000, 'good', 'Computer Lab', 'Used for admin work'),
  ('${IDS.SCHOOL1}', 'Printer (Canon)', 'GFA-IT-002', 'IT Equipment', '2024-03-10', 800000, 500000, 'good', 'Admin Office', 'For printing reports'),
  ('${IDS.SCHOOL1}', 'Projector (Epson)', 'GFA-AV-001', 'Audio Visual', '2023-08-01', 1200000, 600000, 'fair', 'Staff Room', 'Needs lamp replacement'),
  ('${IDS.SCHOOL1}', 'Office Desk', 'GFA-FN-001', 'Furniture', '2022-01-10', 350000, 200000, 'good', 'Admin Office', NULL),
  ('${IDS.SCHOOL1}', 'Football (Size 5)', 'GFA-SP-001', 'Sports', '2025-02-01', 50000, 40000, 'good', 'Store', 'Inter-class games');

-- Assets — School 2
INSERT INTO assets (school_id, name, asset_code, category, purchase_date, purchase_price, current_value, condition, location, notes) VALUES
  ('${IDS.SCHOOL2}', 'Chemistry Lab Equipment Set', 'SSS-LAB-001', 'Lab Equipment', '2025-01-20', 5000000, 4200000, 'excellent', 'Chemistry Lab', 'Brand new set'),
  ('${IDS.SCHOOL2}', 'Microscope (x10)', 'SSS-LAB-002', 'Lab Equipment', '2024-06-15', 800000, 600000, 'good', 'Biology Lab', NULL),
  ('${IDS.SCHOOL2}', 'Server (Dell)', 'SSS-IT-001', 'IT Equipment', '2023-09-01', 4500000, 2500000, 'good', 'Server Room', 'School network hub'),
  ('${IDS.SCHOOL2}', 'Bus (Toyota Hiace)', 'SSS-TR-001', 'Vehicle', '2022-06-01', 25000000, 15000000, 'fair', 'Parking', 'For school trips');

-- Asset Maintenance
INSERT INTO asset_maintenance (asset_id, school_id, maintenance_date, description, cost, next_service_date, performed_by)
SELECT a.id, '${IDS.SCHOOL1}', '2026-04-01', 'Replaced projector lamp', 250000, '2026-10-01', 'Tech Solutions Ltd'
FROM assets a WHERE a.asset_code = 'GFA-AV-001';

INSERT INTO asset_maintenance (asset_id, school_id, maintenance_date, description, cost, next_service_date, performed_by)
SELECT a.id, '${IDS.SCHOOL2}', '2026-03-15', 'Bus service and oil change', 350000, '2026-09-15', 'Toyota Uganda'
FROM assets a WHERE a.asset_code = 'SSS-TR-001';

-- Expense Categories
INSERT INTO expense_categories (id, school_id, name) VALUES
  ('${IDS.EXP_CAT1}', '${IDS.SCHOOL1}', 'Utilities'),
  ('${IDS.EXP_CAT2}', '${IDS.SCHOOL1}', 'Supplies'),
  ('${IDS.EXP_CAT3}', '${IDS.SCHOOL2}', 'Lab Consumables'),
  ('${IDS.EXP_CAT4}', '${IDS.SCHOOL2}', 'Transport')
ON CONFLICT (id) DO NOTHING;

-- Expenses
INSERT INTO expenses (school_id, category_id, term_id, description, amount, expense_date, payment_method, receipt_number, recorded_by, notes) VALUES
  ('${IDS.SCHOOL1}', '${IDS.EXP_CAT1}', '${IDS.T2_S1}', 'Electricity bill - May', 180000, '2026-05-15', 'bank', 'UMEME-202605-001', '${U.bursar1}', NULL),
  ('${IDS.SCHOOL1}', '${IDS.EXP_CAT1}', '${IDS.T2_S1}', 'Water bill - May', 95000, '2026-05-15', 'bank', 'NWSC-202605-001', '${U.bursar1}', NULL),
  ('${IDS.SCHOOL1}', '${IDS.EXP_CAT2}', '${IDS.T2_S1}', 'Chalk and markers', 45000, '2026-05-06', 'cash', NULL, '${U.bursar1}', 'Bulk purchase for term'),
  ('${IDS.SCHOOL1}', '${IDS.EXP_CAT2}', '${IDS.T2_S1}', 'Printing paper (10 reams)', 120000, '2026-05-10', 'cash', 'SHOP-001', '${U.bursar1}', NULL),
  ('${IDS.SCHOOL2}', '${IDS.EXP_CAT3}', '${IDS.T2_S2}', 'Chemical reagents', 350000, '2026-05-08', 'bank', 'CHEM-SUPPLY-001', '${U.bursar2}', 'For S3-S4 practicals'),
  ('${IDS.SCHOOL2}', '${IDS.EXP_CAT4}', '${IDS.T2_S2}', 'Bus fuel - field trip', 180000, '2026-05-20', 'cash', NULL, '${U.bursar2}', 'Geography field trip to Jinja');

-- Discipline Records
INSERT INTO discipline_records (school_id, student_id, incident_date, incident_type, description, action_taken, recorded_by, parent_notified, parent_notified_at) VALUES
  ('${IDS.SCHOOL1}', '${STU.s1_10}', '2026-05-12', 'latecoming', 'Arrived 45 minutes late without excuse note', 'Verbal warning and parent notified', '${U.teacher1a}', true, '2026-05-12 10:00:00+03'),
  ('${IDS.SCHOOL1}', '${STU.s1_15}', '2026-05-19', 'fighting', 'Involved in a fight during break time', 'Suspended for 2 days. Parent conference required.', '${U.teacher1b}', true, '2026-05-19 14:00:00+03'),
  ('${IDS.SCHOOL2}', '${STU.s2_06}', '2026-05-14', 'noise_making', 'Disrupting class during Physics lesson', 'Detention and written apology', '${U.teacher2a}', false, NULL),
  ('${IDS.SCHOOL2}', '${STU.s2_09}', '2026-05-21', 'uniform_violation', 'Repeatedly out of uniform', 'Warning letter sent home', '${U.teacher2b}', true, '2026-05-21 11:00:00+03');

-- Timetable Periods — School 1
INSERT INTO timetable_periods (school_id, name, start_time, end_time, sort_order, is_break) VALUES
  ('${IDS.SCHOOL1}', 'Morning Assembly', '07:30', '07:50', 1, false),
  ('${IDS.SCHOOL1}', 'Period 1', '07:50', '08:30', 2, false),
  ('${IDS.SCHOOL1}', 'Period 2', '08:30', '09:10', 3, false),
  ('${IDS.SCHOOL1}', 'Break', '09:10', '09:30', 4, true),
  ('${IDS.SCHOOL1}', 'Period 3', '09:30', '10:10', 5, false),
  ('${IDS.SCHOOL1}', 'Period 4', '10:10', '10:50', 6, false),
  ('${IDS.SCHOOL1}', 'Period 5', '10:50', '11:30', 7, false),
  ('${IDS.SCHOOL1}', 'Lunch', '11:30', '12:10', 8, true),
  ('${IDS.SCHOOL1}', 'Period 6', '12:10', '12:50', 9, false),
  ('${IDS.SCHOOL1}', 'Period 7', '12:50', '13:30', 10, false);

-- Timetable Periods — School 2
INSERT INTO timetable_periods (school_id, name, start_time, end_time, sort_order, is_break) VALUES
  ('${IDS.SCHOOL2}', 'Assembly', '07:20', '07:40', 1, false),
  ('${IDS.SCHOOL2}', 'Lesson 1', '07:40', '08:20', 2, false),
  ('${IDS.SCHOOL2}', 'Lesson 2', '08:20', '09:00', 3, false),
  ('${IDS.SCHOOL2}', 'Lesson 3', '09:00', '09:40', 4, false),
  ('${IDS.SCHOOL2}', 'Break', '09:40', '10:00', 5, true),
  ('${IDS.SCHOOL2}', 'Lesson 4', '10:00', '10:40', 6, false),
  ('${IDS.SCHOOL2}', 'Lesson 5', '10:40', '11:20', 7, false),
  ('${IDS.SCHOOL2}', 'Lesson 6', '11:20', '12:00', 8, false),
  ('${IDS.SCHOOL2}', 'Lunch', '12:00', '12:40', 9, true),
  ('${IDS.SCHOOL2}', 'Lesson 7', '12:40', '13:20', 10, false),
  ('${IDS.SCHOOL2}', 'Lesson 8', '13:20', '14:00', 11, false);
      `,
    },

    // ═══════════════════════════════════════════════════════════════
    // BATCH 14: Timetable Slots (sample), Alumni, Audit Logs, Platform
    // ═══════════════════════════════════════════════════════════════
    {
      label: "Timetable, Alumni, Audit Logs & Platform Settings",
      sql: `
-- Timetable Slots — School 1 (P1-A sample: Mon-Fri, periods 1-5)
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 1, '${IDS.SUB_MATH1}', '${U.teacher1a}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 1'
ON CONFLICT DO NOTHING;
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 1, '${IDS.SUB_ENG1}', '${U.teacher1b}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 2'
ON CONFLICT DO NOTHING;
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 1, '${IDS.SUB_SCI1}', '${U.teacher1c}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 3'
ON CONFLICT DO NOTHING;
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 1, '${IDS.SUB_SST1}', '${U.teacher1a}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 5'
ON CONFLICT DO NOTHING;
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 2, '${IDS.SUB_ENG1}', '${U.teacher1b}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 1'
ON CONFLICT DO NOTHING;
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 2, '${IDS.SUB_MATH1}', '${U.teacher1a}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 2'
ON CONFLICT DO NOTHING;
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 2, '${IDS.SUB_LIT1}', '${U.teacher1b}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 3'
ON CONFLICT DO NOTHING;
INSERT INTO timetable_slots (school_id, class_id, period_id, day_of_week, subject_id, teacher_id, room, academic_year_id)
SELECT '${IDS.SCHOOL1}', '${IDS.CLS_P1A}', tp.id, 2, '${IDS.SUB_CRE1}', '${U.teacher1c}', 'Room 1', '${IDS.AY2026_S1}'
FROM timetable_periods tp WHERE tp.school_id = '${IDS.SCHOOL1}' AND tp.name = 'Period 5'
ON CONFLICT DO NOTHING;

-- Alumni
INSERT INTO alumni (school_id, first_name, last_name, admission_number, graduation_year, last_class, current_school, phone, email, profession, notes) VALUES
  ('${IDS.SCHOOL1}', 'Emmanuel', 'Ssekitooleko', 'GFA-2023-0001', 2023, 'P7-A', 'King''s College Budo', '+256702000001', 'emmanuel.s@gmail.com', 'Student', 'Best PLE performer 2023'),
  ('${IDS.SCHOOL1}', 'Charity', 'Nalwoga', 'GFA-2023-0002', 2023, 'P7-A', 'Gayaza High School', '+256702000002', 'charity.n@yahoo.com', 'Student', NULL),
  ('${IDS.SCHOOL1}', 'Brian', 'Ochieng', 'GFA-2024-0001', 2024, 'P7-A', 'St. Mary''s Kisubi', '+256702000003', NULL, 'Student', 'Prefect 2024'),
  ('${IDS.SCHOOL2}', 'Diana', 'Nakato', 'SSS-2023-0001', 2023, 'S4-A', 'Makerere University', '+256702000004', 'diana.nakato@mak.ac.ug', 'University Student', 'Passed with 18 points'),
  ('${IDS.SCHOOL2}', 'Robert', 'Kizza', 'SSS-2024-0001', 2024, 'S4-A', 'Kyambogo University', '+256702000005', 'robert.k@kyu.ac.ug', 'University Student', 'Science track');

-- Audit Logs
INSERT INTO audit_logs (school_id, user_id, action, entity_type, entity_id, new_value, ip_address, created_at) VALUES
  ('${IDS.SCHOOL1}', '${U.admin1}', 'create', 'school', '${IDS.SCHOOL1}', '{"name": "Greenfield Academy"}', '192.168.1.1', '2026-01-02 10:00:00+03'),
  ('${IDS.SCHOOL1}', '${U.admin1}', 'create', 'academic_year', '${IDS.AY2026_S1}', '{"name": "2026"}', '192.168.1.1', '2026-01-03 09:00:00+03'),
  ('${IDS.SCHOOL1}', '${U.bursar1}', 'create', 'fee_payment', NULL, '{"amount": 190000, "student": "Samuel Kamukama"}', '192.168.1.2', '2026-05-10 11:00:00+03'),
  ('${IDS.SCHOOL1}', '${U.admin1}', 'update', 'fee_structure', NULL, '{"old_amount": 140000, "new_amount": 150000, "name": "Tuition"}', '192.168.1.1', '2026-04-28 14:00:00+03'),
  ('${IDS.SCHOOL1}', '${U.teacher1a}', 'create', 'marks', NULL, '{"subject": "Mathematics", "exam_type": "midterm", "class": "P1-A"}', '192.168.1.3', '2026-05-26 16:00:00+03'),
  ('${IDS.SCHOOL2}', '${U.admin2}', 'create', 'school', '${IDS.SCHOOL2}', '{"name": "Sunrise Secondary School"}', '10.0.0.1', '2026-01-02 10:30:00+03'),
  ('${IDS.SCHOOL2}', '${U.bursar2}', 'create', 'fee_payment', NULL, '{"amount": 445000, "student": "Andrew Kiggundu"}', '10.0.0.2', '2026-05-11 09:00:00+03'),
  (NULL, '${U.superAdmin}', 'login', 'user', '${U.superAdmin}', NULL, '41.210.0.5', '2026-05-29 08:00:00+03'),
  (NULL, '${U.superAdmin}', 'view', 'school', '${IDS.SCHOOL1}', NULL, '41.210.0.5', '2026-05-29 08:05:00+03');

-- Platform Settings
INSERT INTO platform_settings (key, value, updated_by) VALUES
  ('sms_rate_per_sms', '{"ugx": 50}', '${U.superAdmin}'),
  ('feature_flags', '{"push_notifications": true, "whatsapp": false, "report_card_pdf": true, "offline_mode": true}', '${U.superAdmin}'),
  ('max_sms_per_day', '{"default": 1000, "starter": 100, "growth": 500, "pro": 2000}', '${U.superAdmin}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Notification Preferences
INSERT INTO notification_preferences (school_id, send_receipt_sms, send_absence_sms, send_weekly_defaulter, defaulter_reminder_day, defaulter_reminder_hour, send_report_card_sms, send_term_start_sms) VALUES
  ('${IDS.SCHOOL1}', true, true, true, 5, 9, true, true),
  ('${IDS.SCHOOL2}', true, true, false, 5, 9, true, true);

-- Subscription Invoices
INSERT INTO subscription_invoices (school_id, plan, amount, currency, period_start, period_end, status, paid_at) VALUES
  ('${IDS.SCHOOL1}', 'growth', 150000, 'UGX', '2026-01-01', '2026-03-31', 'paid', '2026-01-05 10:00:00+03'),
  ('${IDS.SCHOOL1}', 'growth', 150000, 'UGX', '2026-04-01', '2026-06-30', 'paid', '2026-04-03 09:00:00+03'),
  ('${IDS.SCHOOL2}', 'pro', 300000, 'UGX', '2026-01-01', '2026-03-31', 'paid', '2026-01-08 11:00:00+03'),
  ('${IDS.SCHOOL2}', 'pro', 300000, 'UGX', '2026-04-01', '2026-06-30', 'paid', '2026-04-05 10:00:00+03');

-- In-App Notifications
INSERT INTO in_app_notifications (school_id, recipient_user_id, title, body, type, is_read, related_entity_type) VALUES
  ('${IDS.SCHOOL1}', '${U.admin1}', 'New fee payment received', 'Samuel Kamukama paid UGX 190,000 for Term 2.', 'success', false, 'fee_payment'),
  ('${IDS.SCHOOL1}', '${U.admin1}', 'Discipline incident recorded', 'Brian Mugisha (P4-A) was late today.', 'warning', true, 'discipline_record'),
  ('${IDS.SCHOOL1}', '${U.teacher1a}', 'Marks entry reminder', 'Please submit midterm marks for P1-A Mathematics by Friday.', 'info', false, NULL),
  ('${IDS.SCHOOL2}', '${U.admin2}', 'New booking', 'Moses Kiggundu booked a meeting with Peter Mugisha on June 5.', 'info', false, 'meeting_booking'),
  ('${IDS.SCHOOL2}', '${U.bursar2}', 'Fee payment received', 'Andrew Kiggundu paid UGX 445,000 for Term 2.', 'success', false, 'fee_payment');
      `,
    },
  ];

  // ── Execute batches ───────────────────────────────────────────────
  let totalRows = 0;
  for (const batch of batches) {
    process.stdout.write(`   📦 ${batch.label} ... `);
    try {
      await runSql(batch.sql);
      console.log("✅");
      totalRows++;
    } catch (err) {
      console.log(`❌`);
      console.error(`\n   Error in batch "${batch.label}":`);
      console.error(`   ${err.message}\n`);
      // Continue with remaining batches
    }
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log(" 🎉 Skuli OS Seed Complete!");
  console.log("═══════════════════════════════════════════════════\n");
  console.log(" Schools:");
  console.log("   1. Greenfield Academy (GFA) — Primary, Growth plan");
  console.log("   2. Sunrise Secondary (SSS) — Secondary, Pro plan");
  console.log("   3. Group: Bright Future Education Group\n");
  console.log(" Login Credentials (all passwords: " + PASSWORD + "):");
  console.log(" ┌──────────────────────────────────┬──────────────────┬───────────────┐");
  console.log(" │ Email                            │ Role             │ Portal        │");
  console.log(" ├──────────────────────────────────┼──────────────────┼───────────────┤");
  console.log(" │ admin@skuli.app                  │ SUPER_ADMIN      │ /admin        │");
  console.log(" │ groupadmin@skuli.app             │ GROUP_ADMIN      │ /group        │");
  console.log(" │ headteacher@greenfield.ac.ug     │ SCHOOL_ADMIN     │ /dashboard    │");
  console.log(" │ admin@sunrise.ss.ug              │ SCHOOL_ADMIN     │ /dashboard    │");
  console.log(" │ bursar@greenfield.ac.ug          │ BURSAR           │ /dashboard    │");
  console.log(" │ bursar@sunrise.ss.ug             │ BURSAR           │ /dashboard    │");
  console.log(" │ teacher1@greenfield.ac.ug        │ TEACHER          │ /teacher      │");
  console.log(" │ teacher2@greenfield.ac.ug        │ TEACHER          │ /teacher      │");
  console.log(" │ teacher3@greenfield.ac.ug        │ TEACHER          │ /teacher      │");
  console.log(" │ teacher1@sunrise.ss.ug           │ TEACHER          │ /teacher      │");
  console.log(" │ teacher2@sunrise.ss.ug           │ TEACHER          │ /teacher      │");
  console.log(" │ parent1@example.com              │ PARENT           │ /portal       │");
  console.log(" │ parent2@example.com              │ PARENT           │ /portal       │");
  console.log(" │ parent3@example.com              │ PARENT           │ /portal       │");
  console.log(" │ parent4@example.com              │ PARENT           │ /portal       │");
  console.log(" │ parent5@example.com              │ PARENT           │ /portal       │");
  console.log(" └──────────────────────────────────┴──────────────────┴───────────────┘\n");
  console.log(" Data seeded:");
  console.log("   • 32 students (20 primary + 12 secondary)");
  console.log("   • 11 classes, 17 subjects, 105+ marks entries");
  console.log("   • 320 attendance records (10 days × 32 students)");
  console.log("   • Fee structures, accounts, payments & discounts");
  console.log("   • 9 staff members with payroll records");
  console.log("   • Report cards (Term 1 published)");
  console.log("   • Announcements, SMS logs & templates");
  console.log("   • Meeting slots & bookings");
  console.log("   • Message threads with conversation history");
  console.log("   • Library books & lending records");
  console.log("   • Assets & maintenance history");
  console.log("   • Expenses & categories");
  console.log("   • Discipline records");
  console.log("   • Timetable periods & slots");
  console.log("   • Calendar events (holidays, exams, events)");
  console.log("   • Alumni records");
  console.log("   • Audit logs");
  console.log("   • Platform settings & notification preferences");
  console.log("   • Subscription invoices\n");
  console.log(" Run 'node scripts/seed-data.mjs --clean' to reset and re-seed.\n");
}

seed().catch((err) => {
  console.error("\n❌ Seed failed:", err.message);
  process.exit(1);
});
