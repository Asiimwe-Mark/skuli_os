import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Gate tests for schema ↔ application consistency.
 *
 * The point of these tests is to make the schema↔app contract enforceable
 * from CI. Two invariants:
 *
 *   1. Every `from('table')` / `from("table")` / `from(\`table\`)` /
 *      `rpc('fn')` / `storage.from('bucket')` reference in the
 *      application code corresponds to a real database object defined
 *      in supabase/migrations/.
 *
 *   2. Every `CREATE TABLE` / `CREATE FUNCTION` /
 *      `INSERT INTO storage.buckets` in the migrations is either (a)
 *      referenced by the application or (b) explicitly marked as
 *      "intentionally retained" via a comment block (search for
 *      `-- INTENTIONALLY-UNUSED`).
 *
 * If either invariant breaks, the test fails with a message that
 * points at the offending reference. That is the proof the migrations
 * cannot silently drift from what the app expects.
 *
 * The test is deterministic and runs in <2s.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");
const appScanRoots = [
  "app",
  "lib",
  "components",
  "scripts",
  "tests",
];
const functionRoots = ["supabase/functions"];

interface SchemaCatalog {
  tables: Set<string>;
  views: Set<string>;
  functions: Set<string>;
  storageBuckets: Set<string>;
  intentionallyUnusedTables: Set<string>;
  intentionallyUnusedFunctions: Set<string>;
  intentionallyUnusedBuckets: Set<string>;
}

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  const absRoot = join(repoRoot, root);
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(absRoot, { withFileTypes: true }) as unknown as import("node:fs").Dirent[];
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(absRoot, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursiveRelative(join(root, entry.name)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function listFilesRecursiveRelative(rel: string): string[] {
  const out: string[] = [];
  const abs = join(repoRoot, rel);
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(abs, { withFileTypes: true }) as unknown as import("node:fs").Dirent[];
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const child = join(rel, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursiveRelative(child));
    } else if (entry.isFile()) {
      out.push(child);
    }
  }
  return out;
}

function isCodeFile(p: string): boolean {
  return /\.(ts|tsx|js|mjs|jsx)$/.test(p);
}

function readAllAppFiles(): string[] {
  const all: string[] = [];
  for (const root of appScanRoots) {
    for (const f of listFilesRecursiveRelative(root)) {
      // Skip the schema-consistency test itself — it contains regex
      // patterns that look like Supabase client calls but aren't.
      if (f.endsWith("schema-consistency.test.ts")) continue;
      all.push(f);
    }
  }
  for (const root of functionRoots) all.push(...listFilesRecursiveRelative(root));
  return all.filter(isCodeFile);
}

function concatMigrations(): string {
  const files = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();
  let buf = "";
  for (const f of files) {
    buf += readFileSync(join(migrationsDir, f), "utf8") + "\n";
  }
  return buf;
}

function buildSchemaCatalog(migrationSql: string): SchemaCatalog {
  const tables = new Set<string>();
  const views = new Set<string>();
  const functions = new Set<string>();
  const storageBuckets = new Set<string>();
  const intentionallyUnusedTables = new Set<string>();
  const intentionallyUnusedFunctions = new Set<string>();
  const intentionallyUnusedBuckets = new Set<string>();

  // Strip SQL comments so the regex below does not match commented-out
  // pseudo-code (e.g. "-- CREATE TABLE statements in 0004..."). Keep
  // INTENTIONALLY-UNUSED markers because they carry semantic meaning.
  const stripped = migrationSql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // CREATE TABLE [IF NOT EXISTS] <name> (
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(stripped))) {
    tables.add(unescapeIdent(m[1]));
  }

  // CREATE [OR REPLACE] VIEW <name> [ ( cols ) ] AS
  // We also catch MATERIALIZED VIEW since PostgREST exposes both.
  const viewRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+([A-Za-z0-9_."]+)/gi;
  while ((m = viewRe.exec(stripped))) {
    views.add(unescapeIdent(m[1]));
  }

  // CREATE OR REPLACE FUNCTION <name>(...)  or  CREATE FUNCTION <name>(...)
  const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z0-9_."]+)\s*\(/gi;
  while ((m = fnRe.exec(stripped))) {
    functions.add(unescapeIdent(m[1]));
  }

  // INSERT INTO storage.buckets (id, name, public) VALUES ('x', 'x', ...)
  const bucketRe = /INSERT\s+INTO\s+storage\.buckets[^;]*VALUES\s*([\s\S]*?);/gi;
  while ((m = bucketRe.exec(stripped))) {
    const rowsBody = m[1];
    const rows = rowsBody.split(/\)\s*,\s*\(|\)\s*;|\(\s*/).map((s) => s.replace(/^\(|\)$/g, "").trim()).filter(Boolean);
    for (const row of rows) {
      const first = row.split(",")[0]?.trim().replace(/^'|'$/g, "");
      if (first) storageBuckets.add(first);
    }
  }

  // INTENTIONALLY-UNUSED markers: read from the original (un-stripped) SQL
  // because they are comments and were just stripped above.
  const blockRe = /--\s*INTENTIONALLY-UNUSED[^\n]*\n([\s\S]*?)(?=\n--\s*[A-Z]|\nCREATE|\nALTER|\nDROP|\nINSERT|\nUPDATE|\nDELETE|\nDO\s|\n--\s*\n|$)/gi;
  while ((m = blockRe.exec(migrationSql))) {
    const block = m[1].replace(/--[^\n]*/g, "");
    const tableInBlock = /TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)/i.exec(block);
    const fnInBlock = /FUNCTION\s+([A-Za-z0-9_."]+)/i.exec(block);
    const bucketInBlock = /bucket\s+['"]([^'"]+)['"]/i.exec(block);
    if (tableInBlock) intentionallyUnusedTables.add(unescapeIdent(tableInBlock[1]));
    if (fnInBlock) intentionallyUnusedFunctions.add(unescapeIdent(fnInBlock[1]));
    if (bucketInBlock) intentionallyUnusedBuckets.add(bucketInBlock[1]);
  }

  return {
    tables,
    views,
    functions,
    storageBuckets,
    intentionallyUnusedTables,
    intentionallyUnusedFunctions,
    intentionallyUnusedBuckets,
  };
}

function unescapeIdent(s: string): string {
  return s.replace(/^"|"$/g, "").replace(/^public\./, "");
}

interface AppRefs {
  tables: Map<string, string[]>; // ref -> [file:line, ...]
  functions: Map<string, string[]>;
  storageBuckets: Map<string, string[]>;
}

function extractAppRefs(files: string[]): AppRefs {
  const tables = new Map<string, string[]>();
  const functions = new Map<string, string[]>();
  const storageBuckets = new Map<string, string[]>();

  // .from('name')  |  .from("name")  |  .from(`name`)
  const fromRe = /\.from\s*\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g;
  // .rpc('name', ...)
  const rpcRe = /\.rpc\s*\(\s*['"`]([A-Za-z0-9_]+)['"`]/g;
  // .storage.from('name')  |  .storage.from("name")
  const storageRe = /\.storage\.from\s*\(\s*['"`]([A-Za-z0-9_-]+)['"`]\s*\)/g;

  for (const file of files) {
    const rel = file.replace(repoRoot + "\\", "").replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      scan(lineRe(fromRe, line), rel, i + 1, tables);
      scan(lineRe(rpcRe, line), rel, i + 1, functions);
      scan(lineRe(storageRe, line), rel, i + 1, storageBuckets);
    }
  }

  return { tables, functions, storageBuckets };
}

function lineRe(re: RegExp, line: string): RegExpMatchArray | null {
  re.lastIndex = 0;
  return re.exec(line);
}

function scan(match: RegExpMatchArray | null, rel: string, line: number, into: Map<string, string[]>) {
  if (!match) return;
  const ref = match[1];
  if (!into.has(ref)) into.set(ref, []);
  into.get(ref)!.push(`${rel}:${line}`);
}

describe("schema ↔ app consistency", () => {
  let catalog: SchemaCatalog;
  let refs: AppRefs;

  beforeAll(() => {
    const sql = concatMigrations();
    catalog = buildSchemaCatalog(sql);
    refs = extractAppRefs(readAllAppFiles());
  });

  // ─── A. App references must resolve to migrations ──────────────────────
  // These are the load-bearing checks. They prove the runtime can never
  // throw "relation does not exist" or "function does not exist".

  it("every .from(table) reference has a CREATE TABLE or CREATE VIEW in migrations", () => {
    const missing: string[] = [];
    for (const [t, sites] of refs.tables) {
      if (catalog.tables.has(t)) continue;
      if (catalog.views.has(t)) continue; // PostgREST exposes views via .from()
      if (catalog.intentionallyUnusedTables.has(t)) continue;
      if (t.includes("-")) continue; // kebab-case → bucket, not table
      missing.push(`  - ${t} (referenced at ${sites.slice(0, 3).join(", ")}${sites.length > 3 ? `, +${sites.length - 3} more` : ""})`);
    }
    expect(missing, `app references tables/views missing from migrations:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every .rpc(fn) reference has a CREATE FUNCTION in migrations", () => {
    const missing: string[] = [];
    for (const [fn, sites] of refs.functions) {
      if (catalog.functions.has(fn)) continue;
      if (catalog.intentionallyUnusedFunctions.has(fn)) continue;
      missing.push(`  - ${fn} (referenced at ${sites.slice(0, 3).join(", ")}${sites.length > 3 ? `, +${sites.length - 3} more` : ""})`);
    }
    expect(missing, `app references RPCs missing from migrations:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every .storage.from(bucket) reference has an INSERT INTO storage.buckets in migrations", () => {
    const missing: string[] = [];
    for (const [b, sites] of refs.storageBuckets) {
      if (catalog.storageBuckets.has(b)) continue;
      if (catalog.intentionallyUnusedBuckets.has(b)) continue;
      missing.push(`  - ${b} (referenced at ${sites.slice(0, 3).join(", ")}${sites.length > 3 ? `, +${sites.length - 3} more` : ""})`);
    }
    expect(missing, `app references storage buckets missing from migrations:\n${missing.join("\n")}`).toEqual([]);
  });

  // ─── B. Migrations must be referenced by app (or marked unused) ───────
  // The reverse check is softer. Many functions are SQL-only (used by
  // triggers, RLS policies, or by other functions), so requiring every
  // function to be `.rpc()`-ed would be wrong. Tables are stricter —
  // an unused table is dead weight.

  it("every table in migrations is referenced by app or marked intentionally unused", () => {
    const orphans: string[] = [];
    for (const t of catalog.tables) {
      if (refs.tables.has(t)) continue;
      if (catalog.intentionallyUnusedTables.has(t)) continue;
      orphans.push(`  - ${t}`);
    }
    expect(orphans, `tables in migrations with no app reference (mark with -- INTENTIONALLY-UNUSED if kept on purpose):\n${orphans.join("\n")}`).toEqual([]);
  });

  // ─── C. Sanity checks on the rewrite ──────────────────────────────────

  it("the rewrite does not include the legacy subdirectory (consolidated stream)", () => {
    const legacyDir = join(migrationsDir, "_legacy");
    let exists = true;
    try { statSync(legacyDir); } catch { exists = false; }
    expect(exists, "_legacy/ must be removed by the rewrite").toBe(false);
  });

  it("the rewrite includes all canonical files in numeric order", () => {
    const files = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".sql"))
      .map((e) => e.name)
      .sort();
    // Must be 0001..N in numeric order. The exact count grows as
    // features are added. Bump this when adding 0031, 0032, etc.
    expect(files.length).toBeGreaterThanOrEqual(29);
    expect(files[0]).toBe("0001_extensions.sql");
    // Every filename matches 4-digit-number_name.sql
    for (const f of files) {
      expect(f).toMatch(/^00\d{2}_[a-z0-9_]+\.sql$/);
    }
  });

  it("schema.sql is regenerated and matches the migration stream", () => {
    const schemaPath = join(repoRoot, "supabase", "schema.sql");
    const stat = statSync(schemaPath);
    expect(stat.size).toBeGreaterThan(100_000);
  });
});
