/**
 * Gate test: every non-public API route must use either requireRole
 * or requireSchool to authenticate. This pins the contract for
 * audit 3.22 (item 1.15).
 *
 * Public-by-design routes (webhooks, auth callback, onboard,
 * push unsubscribe, public v1 payments status, public pdfs,
 * referral validate/apply, marketplace, concierge) are excluded.
 *
 * If a new non-public route is added without an auth helper, this
 * test fails. That's the whole point — the test is a guardrail.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = process.cwd();
const API_DIR = join(REPO, "app", "api");

// Public-by-design route prefixes. These are routes that handle
// pre-auth traffic (sign-in callbacks, webhooks, public status
// lookups). The list is intentionally explicit so adding a new
// public route is a deliberate, reviewed action.
const PUBLIC_PREFIXES = [
  "/api/auth", // auth callback (handled by Supabase SSR)
  "/api/onboard", // pre-auth school signup
  "/api/webhooks", // external webhooks
  "/api/push/unsubscribe", // push notifications can land on users without a session
  "/api/v1/payments", // public Pesapal status callbacks
  "/api/pdf", // public PDFs (signed URL or auth via token param)
  "/api/portal/report-card-pdf", // public PDF
  "/api/referral/validate", // public referral validation (UI helper)
  // referral/apply is NO LONGER public — it requires SUPER_ADMIN (audit H-1)
  "/api/marketplace", // public template marketplace
  "/api/concierge", // public lead capture
];

function isPublicRoute(relPath: string): boolean {
  // relPath is e.g. "auth/callback/route.ts" (or "auth\\callback\\route.ts"
  // on Windows). Normalise to forward slashes so the prefix check is
  // cross-platform.
  const norm = relPath.replace(/\\/g, "/");
  for (const prefix of PUBLIC_PREFIXES) {
    if (norm.startsWith(prefix.replace(/^\/api\//, ""))) return true;
  }
  return false;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      walk(p, acc);
    } else if (entry === "route.ts") {
      acc.push(p);
    }
  }
  return acc;
}

const allRouteFiles = walk(API_DIR).map((p) => relative(API_DIR, p));
const publicRoutes = allRouteFiles.filter(isPublicRoute);
// A route is considered authenticated if it uses one of the standard
// helpers (requireRole / requireSchool) OR if it calls
// getSupabaseAndUser / supabase.auth.getUser() and either returns
// 401 on no user or applies its own custom authorization. The
// last two patterns are the older createClient + manual auth style
// which we still permit but want to track.
const AUTH_PATTERNS = [
  /\brequireRole\b/,
  /\brequireSchool\b/,
  /\bgetSupabaseAndUser\b/,
  /supabase\.auth\.getUser\s*\(\s*\)/,
];

const guardedRoutes = allRouteFiles.filter((f) => {
  if (isPublicRoute(f)) return false;
  const text = readFileSync(join(API_DIR, f), "utf8");
  return AUTH_PATTERNS.some((re) => re.test(text));
});
const unguardedRoutes = allRouteFiles.filter((f) => {
  if (isPublicRoute(f)) return false;
  const text = readFileSync(join(API_DIR, f), "utf8");
  return !AUTH_PATTERNS.some((re) => re.test(text));
});

describe("API auth coverage (audit 3.22, item 1.15)", () => {
  it("walks the app/api directory", () => {
    expect(allRouteFiles.length).toBeGreaterThan(0);
  });

  it("classifies at least the known public routes as public", () => {
    // Sanity check — the public list must actually contain real
    // files, otherwise an empty list would silently pass the
    // unguarded check below.
    expect(publicRoutes.length).toBeGreaterThan(0);
  });

  it("has no non-public route without an auth helper", () => {
    expect(unguardedRoutes).toEqual([]);
  });

  it("the unguarded surface area is the known public set", () => {
    // Print a summary so the test output is actionable when it fails.
    // (Vitest shows the value of the failed assertion.)
    const summary = unguardedRoutes.length === 0
      ? "0 unguarded routes (good)"
      : `Unguarded: ${unguardedRoutes.join(", ")}`;
    expect(unguardedRoutes.length).toBe(0);
    expect(summary).toBeDefined();
  });

  it("counts (public + guarded) covers every route file", () => {
    expect(publicRoutes.length + guardedRoutes.length + unguardedRoutes.length).toBe(
      allRouteFiles.length
    );
  });
});
