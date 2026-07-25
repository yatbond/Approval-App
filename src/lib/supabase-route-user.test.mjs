import assert from "node:assert/strict";
import test from "node:test";

import { getSupabaseRouteUser } from "./supabase/route-user.ts";

test("uses verified claims without loading the full auth user", async () => {
  let getUserCalls = 0;
  const user = await getSupabaseRouteUser({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: "user-1", email: "user@example.com" } },
        error: null,
      }),
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: null } };
      },
    },
  });

  assert.deepEqual(user, { id: "user-1", email: "user@example.com" });
  assert.equal(getUserCalls, 0);
});

test("falls back to the full auth user when claims are unavailable", async () => {
  const user = await getSupabaseRouteUser({
    auth: {
      getClaims: async () => ({ data: null, error: new Error("claims unavailable") }),
      getUser: async () => ({
        data: { user: { id: "user-2", email: "fallback@example.com" } },
      }),
    },
  });

  assert.deepEqual(user, { id: "user-2", email: "fallback@example.com" });
});

test("returns null when neither auth source provides an email", async () => {
  const user = await getSupabaseRouteUser({
    auth: {
      getClaims: async () => ({ data: { claims: {} }, error: null }),
      getUser: async () => ({ data: { user: { id: "user-3", email: null } } }),
    },
  });

  assert.equal(user, null);
});
