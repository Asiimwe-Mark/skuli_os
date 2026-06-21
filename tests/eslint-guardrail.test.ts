// Test that the ESLint guardrail rejects @/lib/api-helpers imports
// in app/api/**/route.ts. The architecture review (P2) requires every
// route to use the @/lib/http wrapper, not the hand-rolled helpers.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("eslint.config.mjs architecture guardrail", () => {
  it("forbids @/lib/api-helpers imports in app/api/**/route.ts", () => {
    const config = readFileSync(
      join(process.cwd(), "eslint.config.mjs"),
      "utf8",
    );
    // The patterns entry for app/api/**/route.ts must block the
    // helpers module so the wrapper contract is enforced on every
    // new route file.
    expect(config).toMatch(
      /files:\s*\["app\/api\/\*\*\/route\.ts"\]/,
    );
    expect(config).toMatch(
      /"@\/lib\/api-helpers"/,
    );
    expect(config).toMatch(
      /Route handlers must use @\/lib\/http instead of @\/lib\/api-helpers/,
    );
  });
});