import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server.js";
import { createSupabaseJsonResponse } from "./route-response.ts";

test("copies refreshed Supabase cookies onto the returned JSON response", async () => {
  const cookieSource = NextResponse.next();
  cookieSource.cookies.set("sb-test-auth-token", "refreshed", {
    httpOnly: true,
    sameSite: "lax",
  });

  const response = createSupabaseJsonResponse(
    cookieSource,
    { ok: true },
    { status: 202 },
  );

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.cookies.get("sb-test-auth-token")?.value, "refreshed");
  assert.match(response.headers.get("set-cookie") || "", /HttpOnly/i);
});
