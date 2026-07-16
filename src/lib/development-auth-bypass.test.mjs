import assert from "node:assert/strict";
import test from "node:test";
import { getDevelopmentAuthBypassUser } from "./supabase/development-auth-bypass.ts";

test("creates a deterministic local test identity outside production", () => {
  assert.deepEqual(
    getDevelopmentAuthBypassUser({
      nodeEnv: "development",
      email: "  Workflow.QA@Example.com ",
    }),
    {
      id: "development-e2e-workflow.qa@example.com",
      email: "workflow.qa@example.com",
    },
  );
});

test("never bypasses authentication in production", () => {
  assert.equal(
    getDevelopmentAuthBypassUser({
      nodeEnv: "production",
      email: "workflow.qa@example.com",
    }),
    null,
  );
});

test("rejects missing or invalid test identities", () => {
  assert.equal(
    getDevelopmentAuthBypassUser({ nodeEnv: "test", email: "not-an-email" }),
    null,
  );
  assert.equal(
    getDevelopmentAuthBypassUser({ nodeEnv: "development" }),
    null,
  );
});
