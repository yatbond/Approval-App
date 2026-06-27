import assert from "node:assert/strict";
import test from "node:test";
import { hasSupabaseAuthCookie } from "./supabase/auth-cookies.ts";

test("detects project-scoped Supabase auth cookies", () => {
  assert.equal(
    hasSupabaseAuthCookie(
      [{ name: "sb-wlbxrdmpwuupjyarjcxb-auth-token.0" }],
      "https://wlbxrdmpwuupjyarjcxb.supabase.co",
    ),
    true,
  );
});

test("detects generic Supabase auth cookies without a valid project URL", () => {
  assert.equal(
    hasSupabaseAuthCookie(
      [{ name: "sb-anything-auth-token" }],
      "not a url",
    ),
    true,
  );
  assert.equal(
    hasSupabaseAuthCookie(
      [{ name: "sb-other-auth-token" }],
      undefined,
    ),
    true,
  );
});

test("ignores requests without Supabase auth cookies", () => {
  assert.equal(
    hasSupabaseAuthCookie(
      [{ name: "theme" }, { name: "next-instant-navigation-testing" }],
      "https://wlbxrdmpwuupjyarjcxb.supabase.co",
    ),
    false,
  );
});
