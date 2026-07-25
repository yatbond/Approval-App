import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
const supabaseUrl = requiredEnv("LOCAL_SUPABASE_URL");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const password = "Phase8-Cutover-Aa1!";
const fallbackUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const { data: profiles, error: profilesError } = await service.from("profiles")
  .select("id,email,is_admin").in("email", ["phase8-admin@example.com", "phase8-owner@example.com"]);
assert.ifError(profilesError);
const admin = profiles.find((row) => row.is_admin);
const owner = profiles.find((row) => !row.is_admin);
assert.ok(admin && owner);
const adminCookie = await signIn(admin.email);
const ownerCookie = await signIn(owner.email);

const forbidden = await api("/api/admin/rollout", { cookie: ownerCookie });
assert.equal(forbidden.status, 403);
const initial = await api("/api/admin/rollout", { cookie: adminCookie });
assert.equal(initial.status, 200);
assert.equal((await initial.json()).setting.legacy_writes_frozen, true);

try {
  const rollback = await setState(adminCookie, "rollback_read_only", 0, "Phase 8 HTTP rollback rehearsal pauses commands");
  assert.equal(rollback.status, 200);
  const readable = await api("/api/approval-requests/PHASE8-SEQUENTIAL", { cookie: ownerCookie });
  assert.equal(readable.status, 200);
  assert.equal((await readable.json()).request.requestNo, "PHASE8-SEQUENTIAL");
  const paused = await api("/api/approval-requests/PHASE8-SEQUENTIAL/actions", {
    method: "POST", cookie: ownerCookie,
    body: { action: "approve", expectedVersion: 2, idempotencyKey: `phase8-paused-${randomUUID()}` },
  });
  assert.equal(paused.status, 503);
  assert.equal((await paused.json()).error.code, "cutover_paused");

  const authoritative = await setState(adminCookie, "authoritative", 100, "Phase 8 HTTP rollback rehearsal restored authority");
  assert.equal(authoritative.status, 200);
  const applied = await api("/api/approval-requests/PHASE8-SEQUENTIAL/actions", {
    method: "POST", cookie: ownerCookie,
    body: { action: "approve", expectedVersion: 2, idempotencyKey: `phase8-applied-${randomUUID()}` },
  });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).outcome, "applied");
  console.log(JSON.stringify({ outcome: "passed", rollbackRead: 200, rollbackCommand: 503, restoredCommand: 200, finalMode: "authoritative" }));
} finally {
  await setState(adminCookie, "authoritative", 100, "Phase 8 HTTP rehearsal final authoritative safeguard");
}

async function setState(cookie, mode, cohortPercentage, reason) {
  return api("/api/admin/rollout", {
    method: "POST", cookie,
    body: { action: "set_state", mode, cohortPercentage, legacyReadFallbackUntil: fallbackUntil, reason },
  });
}
async function api(path, { method = "GET", cookie, body } = {}) {
  return fetch(`${appUrl}${path}`, {
    method, redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function signIn(email) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  const response = await fetch(`${appUrl}/api/auth/sign-in`, { method: "POST", body: form, redirect: "manual" });
  assert.equal(response.status, 303);
  const setCookies = response.headers.getSetCookie();
  assert.ok(setCookies.length);
  return setCookies.map((value) => value.split(";", 1)[0]).join("; ");
}
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
