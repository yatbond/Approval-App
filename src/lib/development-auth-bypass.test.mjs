import assert from "node:assert/strict";
import test from "node:test";
import {
  getDevelopmentAuthBypassUser,
  getLocalPerformanceAuthBypassUser,
} from "./supabase/development-auth-bypass.ts";

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

test("allows a token-protected performance identity only on loopback", () => {
  const token = "local-performance-secret-token-1234567890";
  assert.deepEqual(
    getLocalPerformanceAuthBypassUser({
      enabled: "true",
      email: " Performance.QA@Example.com ",
      expectedToken: token,
      requestToken: token,
      requestHost: "localhost:3000",
    }),
    {
      id: "local-performance-performance.qa@example.com",
      email: "performance.qa@example.com",
    },
  );
  assert.deepEqual(
    getLocalPerformanceAuthBypassUser({
      enabled: "true",
      email: "performance.qa@example.com",
      expectedToken: token,
      requestToken: token,
      requestHost: "[::1]:3000",
    })?.email,
    "performance.qa@example.com",
  );
});

test("rejects local performance auth on public hosts or weak credentials", () => {
  const token = "local-performance-secret-token-1234567890";
  const base = {
    enabled: "true",
    email: "performance.qa@example.com",
    expectedToken: token,
    requestToken: token,
  };

  assert.equal(
    getLocalPerformanceAuthBypassUser({
      ...base,
      requestHost: "approval.example.com",
    }),
    null,
  );
  assert.equal(
    getLocalPerformanceAuthBypassUser({
      ...base,
      requestToken: "wrong-token-that-is-still-long-enough-1234",
      requestHost: "127.0.0.1:3000",
    }),
    null,
  );
  assert.equal(
    getLocalPerformanceAuthBypassUser({
      ...base,
      enabled: "false",
      requestHost: "127.0.0.1:3000",
    }),
    null,
  );
});
