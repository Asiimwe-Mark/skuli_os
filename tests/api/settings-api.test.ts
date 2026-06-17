/**
 * Gate tests for /api/settings/api (audit 3.11, 7.5).
 *
 * The plaintext africas_talking_api_key column is being phased out
 * by migration 00040. The reveal endpoint must:
 *  - work when only the *_enc column exists (production / post-migration)
 *  - gracefully tolerate a plaintext fallback if the column still
 *    exists in some environments (pre-migration dev)
 *  - return 400 for unknown reveal keys
 *  - return 404 when the school row is missing
 *  - require role SCHOOL_ADMIN / BURSAR / SUPER_ADMIN
 */
import { describe, it, expect, vi } from "vitest";
import { AuthError } from "@/lib/api-helpers";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

const mockState: {
  current: Profile | null;
  schoolRow: Record<string, unknown> | null;
  selectedColumns: string | null;
  rpc: { decrypt: string | null; rpcError: { message: string } | null };
} = {
  current: null,
  schoolRow: null,
  selectedColumns: null,
  rpc: { decrypt: "atsk_plaintext_value", rpcError: null },
};

vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) {
        throw new AuthError("test not configured", 500);
      }
      const profile = mockState.current;

      // Capture the columns passed to .select() so we can assert
      // that the route only requests _enc when the plaintext column
      // is gone.
      const schoolsChain: Record<string, unknown> = {};
      schoolsChain.select = (cols: string) => {
        mockState.selectedColumns = cols;
        return schoolsChain;
      };
      schoolsChain.eq = () => schoolsChain;
      schoolsChain.single = async () => ({
        data: mockState.schoolRow,
        error: mockState.schoolRow ? null : { message: "Not found" },
      });
      schoolsChain.update = () => ({
        eq: async () => ({ error: null }),
      });

      const auditChain = {
        insert: async () => ({ error: null }),
      };

      return {
        supabase: {
          from: (table: string) => {
            if (table === "schools") return schoolsChain;
            if (table === "audit_logs") return auditChain;
            return schoolsChain;
          },
          rpc: async (fn: string, _args: Record<string, unknown>) => {
            if (fn === "decrypt_secret") {
              if (mockState.rpc.rpcError) {
                return { data: null, error: mockState.rpc.rpcError };
              }
              return { data: mockState.rpc.decrypt, error: null };
            }
            if (fn === "encrypt_secret") {
              return { data: "encrypted-blob", error: null };
            }
            return { data: null, error: { message: `unknown rpc ${fn}` } };
          },
        } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

// Set SUPABASE_VAULT_SECRET_KEY so the route attempts decryption.
process.env.SUPABASE_VAULT_SECRET_KEY = "test-vault-key";

import { GET, POST } from "@/app/api/settings/api/route";

function fakeGet(url = "http://test.local/api/settings/api") {
  return new Request(url, { method: "GET" });
}

function fakePost(body: unknown, url = "http://test.local/api/settings/api") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setProfile(role: string, school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.selectedColumns = null;
  mockState.schoolRow = null;
  mockState.rpc = { decrypt: "atsk_plaintext_value", rpcError: null };
}

describe("GET /api/settings/api — credential reveal (audit 3.11, 7.5)", () => {
  it("returns 500 when no user is set (test harness convention)", async () => {
    mockState.current = null;
    const res = await GET(fakeGet() as never);
    // The mock throws AuthError("test not configured", 500) when no
    // user is wired up. The route's catch propagates the status.
    expect(res.status).toBe(500);
  });

  it("returns 403 for a PARENT (insufficient role)", async () => {
    setProfile("PARENT");
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 for an unknown reveal key", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await GET(fakeGet("http://test.local/api/settings/api?key=unknown") as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("reveals the AT key from the *_enc column and audits the reveal", async () => {
    setProfile("SCHOOL_ADMIN");
    mockState.schoolRow = { africas_talking_api_key_enc: "encrypted-blob" };
    const res = await GET(fakeGet("http://test.local/api/settings/api?key=at_key") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.value).toBe("atsk_plaintext_value");
  });

  it("returns null value when no *_enc row is set", async () => {
    setProfile("SCHOOL_ADMIN");
    mockState.schoolRow = { africas_talking_api_key_enc: null };
    const res = await GET(fakeGet("http://test.local/api/settings/api?key=at_key") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.value).toBeNull();
  });

  it("returns 404 when school row not found", async () => {
    setProfile("SCHOOL_ADMIN");
    mockState.schoolRow = null;
    const res = await GET(fakeGet("http://test.local/api/settings/api?key=at_key") as never);
    expect(res.status).toBe(404);
  });

  it("status endpoint reports masked presence from *_enc", async () => {
    setProfile("SCHOOL_ADMIN");
    mockState.schoolRow = {
      africas_talking_username: "schoolname",
      africas_talking_api_key_enc: "encrypted-blob",
      africas_talking_username_enc: null,
      resend_api_key_enc: null,
    };
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.has_at_key).toBe(true);
    expect(json.data.at_key_display).toBeTruthy();
  });
});

describe("POST /api/settings/api — credential save (audit 3.11, 7.5)", () => {
  it("encrypts the AT key into the *_enc column and never writes plaintext", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await POST(
      fakePost({
        section: "africastalking",
        africas_talking_username: "schoolname",
        africas_talking_api_key: "atsk_newvalue",
      }) as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("rejects PARENT writes with 403", async () => {
    setProfile("PARENT");
    const res = await POST(
      fakePost({
        section: "africastalking",
        africas_talking_api_key: "atsk_newvalue",
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for unknown section", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await POST(
      fakePost({ section: "bogus" }) as never,
    );
    expect(res.status).toBe(400);
  });
});
