import assert from "node:assert/strict";
import test from "node:test";
import { shouldSignOutWithSupabase } from "./logout-route-state.ts";

test("skips Supabase sign out when auth configuration is absent", () => {
  assert.equal(
    shouldSignOutWithSupabase({
      cookies: [{ name: "sb-example-auth-token" }],
      supabaseUrl: "",
      supabaseKey: "",
    }),
    false,
  );
});

test("skips Supabase sign out when no Supabase auth cookie is present", () => {
  assert.equal(
    shouldSignOutWithSupabase({
      cookies: [{ name: "theme" }],
      supabaseUrl: "https://example.supabase.co",
      supabaseKey: "publishable",
    }),
    false,
  );
});

test("signs out through Supabase when configuration and auth cookie are present", () => {
  assert.equal(
    shouldSignOutWithSupabase({
      cookies: [{ name: "sb-example-auth-token.0" }],
      supabaseUrl: "https://example.supabase.co",
      supabaseKey: "publishable",
    }),
    true,
  );
});
