import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
const supabaseUrl = requiredEnv("LOCAL_SUPABASE_URL");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = requiredEnv("CRON_SECRET");
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const runId = randomUUID().slice(0, 8);
const password = `Phase6-${randomUUID()}-Aa1!`;
const users = {
  requester: await createUser("requester"),
  owner: await createUser("owner"),
  escalation: await createUser("escalation"),
  outsider: await createUser("outsider"),
  admin: await createUser("admin", true),
};
const cookies = {
  requester: await signIn(users.requester.email),
  escalation: await signIn(users.escalation.email),
  outsider: await signIn(users.outsider.email),
  admin: await signIn(users.admin.email),
};
const requestRow = await createDueRequest();

const anonymousCron = await api("/api/cron/approval-operations");
assert.equal(anonymousCron.status, 401);
const wrongCron = await api("/api/cron/approval-operations", {
  headers: { Authorization: "Bearer wrong-wrong-wrong-wrong" },
});
assert.equal(wrongCron.status, 401);
const cronHeaders = {
  Authorization: `Bearer ${cronSecret}`,
  "x-vercel-deployment-url": `phase6-${runId}.example.test`,
};
const firstCron = await api("/api/cron/approval-operations", { headers: cronHeaders });
assert.equal(firstCron.status, 200);
const firstCronPayload = await firstCron.json();
assert.equal(firstCronPayload.scheduler.outcome, "completed");
assert.equal(firstCronPayload.scheduler.escalated, 1);
assert.equal(firstCronPayload.email.outcome, "disabled");
const replayCron = await api("/api/cron/approval-operations", { headers: cronHeaders });
assert.equal(replayCron.status, 200);
assert.equal((await replayCron.json()).scheduler.outcome, "replayed");

const requesterNotifications = await api("/api/notifications", { cookie: cookies.requester });
assert.equal(requesterNotifications.status, 200);
const requesterPayload = await requesterNotifications.json();
assert.equal(requesterPayload.notifications.length, 1);
assert.equal(requesterPayload.notifications[0].requestId, requestRow.request_no);
assert.equal(requesterPayload.notifications[0].unread, true);
const escalationNotifications = await api("/api/notifications", { cookie: cookies.escalation });
assert.equal(escalationNotifications.status, 200);
assert.equal((await escalationNotifications.json()).notifications.length, 1);
const outsiderNotifications = await api("/api/notifications", { cookie: cookies.outsider });
assert.equal(outsiderNotifications.status, 200);
assert.equal((await outsiderNotifications.json()).notifications.length, 0);

const readUpdate = await api("/api/notifications", {
  method: "PATCH", cookie: cookies.requester,
  body: { ids: [requesterPayload.notifications[0].id] },
});
assert.equal(readUpdate.status, 200);
const { data: readRow } = await service.from("approval_notifications")
  .select("read_at").eq("id", requesterPayload.notifications[0].id).single();
assert.ok(readRow.read_at);
const outsiderReadAttempt = await api("/api/notifications", {
  method: "PATCH", cookie: cookies.outsider,
  body: { ids: [requesterPayload.notifications[0].id] },
});
assert.equal(outsiderReadAttempt.status, 200);

const outboxAdmin = await api("/api/email/outbox", { cookie: cookies.admin });
assert.equal(outboxAdmin.status, 200);
const outboxEntries = (await outboxAdmin.json()).entries.filter((entry) => {
  const request = Array.isArray(entry.approval_requests)
    ? entry.approval_requests[0]
    : entry.approval_requests;
  return request?.request_no === requestRow.request_no;
});
assert.equal(outboxEntries.length, 2);
assert.equal((await api("/api/email/outbox", { cookie: cookies.outsider })).status, 403);

const retryId = outboxEntries[0].id;
await service.from("approval_email_outbox").update({
  status: "failed", failure_class: "permanent", last_error_code: "422",
  last_error_message: "invalid recipient",
}).eq("id", retryId);
const retry = await api("/api/email/outbox", {
  method: "POST", cookie: cookies.admin, body: { id: retryId },
});
assert.equal(retry.status, 200);
const { data: retried } = await service.from("approval_email_outbox")
  .select("status,attempt_count,last_error_message").eq("id", retryId).single();
assert.equal(retried.status, "retry");
assert.equal(retried.attempt_count, 0);
assert.equal(retried.last_error_message, null);

const retired = await api("/api/email/task-notifications", {
  method: "POST", cookie: cookies.requester, body: { notifications: [] },
});
assert.equal(retired.status, 410);

console.log(JSON.stringify({
  outcome: "passed", cron: { auth: true, replay: true },
  notifications: { requester: 1, escalation: 1, outsider: 0, readState: "server" },
  outbox: { adminVisible: 2, manualRetry: true },
}));

async function api(path, { method = "GET", cookie, body, headers = {} } = {}) {
  return fetch(`${appUrl}${path}`, {
    method, redirect: "manual",
    headers: {
      ...headers,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function signIn(email) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  const response = await fetch(`${appUrl}/api/auth/sign-in`, {
    method: "POST", body: form, redirect: "manual",
  });
  assert.equal(response.status, 303);
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

async function createUser(label, admin = false) {
  const email = `phase6-api-${label}-${runId}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `Phase 6 API ${label}` },
  });
  assert.ifError(error);
  const user = { id: data.user.id, email };
  const { error: profileError } = await service.from("profiles").upsert({
    id: user.id, email, full_name: `Phase 6 API ${label}`,
    role: admin ? "admin" : "participant", is_admin: admin, is_active: true,
  });
  assert.ifError(profileError);
  return user;
}

async function createDueRequest() {
  const requestNo = `P6-API-${runId}`;
  const { data, error } = await service.from("approval_requests").insert({
    request_no: requestNo, requester_id: users.requester.id,
    requester_name: "Phase 6 API requester", requester_email: users.requester.email,
    title: "Phase 6 API due request", workflow_name: "Phase 6 API", department_name: "Testing",
    status: "pending", due_label: "Overdue", due_at: "2026-07-18T00:00:00.000Z",
    value_label: "HKD 1", current_step: "Approval", current_node_id: "approval-1",
    current_owner_id: users.owner.id, current_owner_email: users.owner.email,
    pending_owner_emails: [users.owner.email], participants: [users.requester.email, users.owner.email],
    last_action: "Submitted",
    task_snapshot: { schemaVersion: 1, id: requestNo, status: "pending", currentOwner: users.owner.email,
      pendingOwners: [users.owner.email], participants: [users.requester.email, users.owner.email], auditTrail: [] },
    pinned_template_snapshot: { schemaVersion: 1, graph: { nodes: [{ id: "approval-1",
      escalationName: "Escalation", escalationEmail: users.escalation.email }], edges: [] } },
  }).select("id,request_no").single();
  assert.ifError(error);
  return data;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
