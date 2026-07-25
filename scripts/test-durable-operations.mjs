import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = requiredEnv("LOCAL_SUPABASE_URL");
const anonKey = requiredEnv("LOCAL_SUPABASE_ANON_KEY");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = "Phase6-test-password-123!";

const requester = await createUser("requester", false);
const owner = await createUser("owner", false);
const escalation = await createUser("escalation", false);
const outsider = await createUser("outsider", false);
const stranger = await createUser("stranger", false);
const dueAt = "2026-07-18T17:00:00.000Z";
const schedulerNow = "2026-07-19T12:00:00.000Z"; // Saturday: no browser is involved.
const dueRequest = await createRequest("due", dueAt);
const futureRequest = await createRequest("future", "2026-07-20T12:00:00.000Z");
const delegatedRequest = await createRequest("delegated", "2026-07-20T12:00:00.000Z");
await service.from("approval_requests").update({
  status: "delegated", pending_owner_emails: [owner.email, outsider.email],
  task_snapshot: { schemaVersion: 1, id: delegatedRequest.request_no, status: "delegated",
    currentOwner: owner.email, pendingOwners: [owner.email, outsider.email],
    participants: [requester.email, owner.email, outsider.email], auditTrail: [] },
}).eq("id", delegatedRequest.id);
const { data: expiredAssignment, error: delegateSetupError } = await service
  .from("approval_request_assignments").insert({
    approval_request_id: delegatedRequest.id, workflow_node_id: "approval-1",
    assignee_id: outsider.id, assignment_type: "delegate", status: "active",
    assigned_by: owner.id, starts_at: "2026-07-18T10:00:00.000Z",
    expires_at: "2026-07-19T11:00:00.000Z", reason: "Temporary delegation",
  }).select("id").single();
assert.ifError(delegateSetupError);

const runKey = `phase6-overlap-${runId}`;
const [left, right] = await Promise.all([
  service.rpc("run_approval_escalation_scheduler", { p_run_key: runKey, p_now: schedulerNow, p_limit: 100 }),
  service.rpc("run_approval_escalation_scheduler", { p_run_key: runKey, p_now: schedulerNow, p_limit: 100 }),
]);
assert.ifError(left.error);
assert.ifError(right.error);
assert.deepEqual(new Set([left.data.outcome, right.data.outcome]), new Set(["completed", "replayed"]));
assert.equal((left.data.expiredDelegations || 0) + (right.data.expiredDelegations || 0), 1);

const { data: escalated, error: requestError } = await service
  .from("approval_requests")
  .select("id,status,state_version,current_owner_id,current_owner_email,escalated_at")
  .eq("id", dueRequest.id)
  .single();
assert.ifError(requestError);
assert.equal(escalated.status, "escalated");
assert.equal(escalated.state_version, 1);
assert.equal(escalated.current_owner_id, escalation.id);
assert.equal(escalated.current_owner_email, escalation.email);

const { data: future } = await service.from("approval_requests")
  .select("status,state_version").eq("id", futureRequest.id).single();
assert.equal(future.status, "pending");
assert.equal(future.state_version, 0);
const { data: delegationAfter } = await service.from("approval_requests")
  .select("status,state_version,pending_owner_emails").eq("id", delegatedRequest.id).single();
assert.equal(delegationAfter.status, "pending");
assert.equal(delegationAfter.state_version, 1);
assert.deepEqual(delegationAfter.pending_owner_emails, [owner.email]);
const { data: assignmentAfter } = await service.from("approval_request_assignments")
  .select("status,ended_at").eq("id", expiredAssignment.id).single();
assert.equal(assignmentAfter.status, "expired");
assert.ok(assignmentAfter.ended_at);

const { data: events } = await service.from("approval_request_events")
  .select("id,action,event_type,request_version,actor_email,target_id")
  .eq("approval_request_id", dueRequest.id);
assert.equal(events.length, 1);
assert.equal(events[0].action, "escalated");
assert.equal(events[0].request_version, 1);
assert.equal(events[0].target_id, escalation.id);

const { data: notifications } = await service.from("approval_notifications")
  .select("id,recipient_id,read_at").eq("approval_request_id", dueRequest.id)
  .order("recipient_id");
assert.equal(notifications.length, 2);
assert.deepEqual(new Set(notifications.map((row) => row.recipient_id)), new Set([requester.id, escalation.id]));

const escalationClient = await signedInClient(escalation.email);
const outsiderClient = await signedInClient(stranger.email);
const { data: ownNotifications, error: ownError } = await escalationClient
  .from("approval_notifications").select("id");
assert.ifError(ownError);
assert.equal(ownNotifications.length, 1);
const { data: outsiderNotifications, error: outsiderError } = await outsiderClient
  .from("approval_notifications").select("id");
assert.ifError(outsiderError);
assert.equal(outsiderNotifications.length, 0);
const { error: directReadUpdate } = await escalationClient
  .from("approval_notifications").update({ read_at: schedulerNow }).eq("id", ownNotifications[0].id);
assert.ok(directReadUpdate, "browser must not directly mutate notification read state");

const replay = await service.rpc("run_approval_escalation_scheduler", {
  p_run_key: `phase6-next-tick-${runId}`, p_now: "2026-07-19T12:01:00.000Z", p_limit: 100,
});
assert.ifError(replay.error);
assert.equal(replay.data.escalated, 0);

const claimNow = "2026-07-19T12:02:00.000Z";
await service.from("approval_email_outbox").update({ status: "sent", sent_at: claimNow })
  .neq("approval_request_id", dueRequest.id);
const [claimA, claimB] = await Promise.all([
  service.rpc("claim_approval_email_outbox", { p_worker_id: `worker-a-${runId}`, p_now: claimNow, p_limit: 1, p_lease_seconds: 60 }),
  service.rpc("claim_approval_email_outbox", { p_worker_id: `worker-b-${runId}`, p_now: claimNow, p_limit: 1, p_lease_seconds: 60 }),
]);
assert.ifError(claimA.error);
assert.ifError(claimB.error);
assert.equal(claimA.data.length, 1);
assert.equal(claimB.data.length, 1);
assert.notEqual(claimA.data[0].id, claimB.data[0].id);

const retryResult = await service.rpc("fail_approval_email_outbox", {
  p_outbox_id: claimA.data[0].id,
  p_lease_token: claimA.data[0].lease_token,
  p_retryable: true,
  p_error_code: "503",
  p_error_message: "provider unavailable",
  p_now: claimNow,
});
assert.ifError(retryResult.error);
assert.equal(retryResult.data, "retry");

const permanentResult = await service.rpc("fail_approval_email_outbox", {
  p_outbox_id: claimB.data[0].id,
  p_lease_token: claimB.data[0].lease_token,
  p_retryable: false,
  p_error_code: "422",
  p_error_message: "invalid recipient",
  p_now: claimNow,
});
assert.ifError(permanentResult.error);
assert.equal(permanentResult.data, "failed");

const { data: outbox } = await service.from("approval_email_outbox")
  .select("id,status,attempt_count,next_attempt_at,failure_class,last_error_code")
  .eq("approval_request_id", dueRequest.id);
assert.equal(outbox.find((row) => row.id === claimA.data[0].id).status, "retry");
assert.equal(outbox.find((row) => row.id === claimA.data[0].id).failure_class, "retryable");
assert.equal(outbox.find((row) => row.id === claimB.data[0].id).status, "failed");
assert.equal(outbox.find((row) => row.id === claimB.data[0].id).failure_class, "permanent");

const retryClaim = await service.rpc("claim_approval_email_outbox", {
  p_worker_id: `worker-complete-${runId}`, p_now: "2026-07-19T12:03:00.000Z",
  p_limit: 1, p_lease_seconds: 60,
});
assert.ifError(retryClaim.error);
assert.equal(retryClaim.data.length, 1);
assert.equal(retryClaim.data[0].id, claimA.data[0].id);
const completed = await service.rpc("complete_approval_email_outbox", {
  p_outbox_id: retryClaim.data[0].id,
  p_lease_token: retryClaim.data[0].lease_token,
  p_provider_message_id: `provider-${runId}`,
  p_now: "2026-07-19T12:03:01.000Z",
});
assert.ifError(completed.error);
assert.equal(completed.data, true);

const { data: exhaustedNotification, error: exhaustedNotificationError } = await service
  .from("approval_notifications").insert({
    approval_request_id: futureRequest.id, recipient_id: requester.id,
    kind: "test", title: "Exhaust retry", body: "Retry exhaustion proof",
  }).select("id").single();
assert.ifError(exhaustedNotificationError);
const { data: exhaustedOutbox, error: exhaustedOutboxError } = await service
  .from("approval_email_outbox").insert({
    notification_id: exhaustedNotification.id, approval_request_id: futureRequest.id,
    recipient_id: requester.id, recipient_email: requester.email,
    template_key: "retry-exhaustion", payload: { requestNo: futureRequest.request_no },
    max_attempts: 1, next_attempt_at: "2026-07-19T12:04:00.000Z",
  }).select("id").single();
assert.ifError(exhaustedOutboxError);
const exhaustedClaim = await service.rpc("claim_approval_email_outbox", {
  p_worker_id: `worker-exhaust-${runId}`, p_now: "2026-07-19T12:04:00.000Z",
  p_limit: 1, p_lease_seconds: 60,
});
assert.ifError(exhaustedClaim.error);
assert.equal(exhaustedClaim.data[0].id, exhaustedOutbox.id);
const exhausted = await service.rpc("fail_approval_email_outbox", {
  p_outbox_id: exhaustedClaim.data[0].id,
  p_lease_token: exhaustedClaim.data[0].lease_token,
  p_retryable: true, p_error_code: "503", p_error_message: "still unavailable",
  p_now: "2026-07-19T12:04:01.000Z",
});
assert.ifError(exhausted.error);
assert.equal(exhausted.data, "failed");
const { data: exhaustedRow } = await service.from("approval_email_outbox")
  .select("status,failure_class,attempt_count").eq("id", exhaustedOutbox.id).single();
assert.equal(exhaustedRow.status, "failed");
assert.equal(exhaustedRow.failure_class, "exhausted");
assert.equal(exhaustedRow.attempt_count, 1);

console.log(JSON.stringify({
  outcome: "passed",
  scheduler: { overlappingRuns: 2, escalatedEvents: events.length,
    expiredDelegations: 1, weekendNoBrowser: true },
  notifications: { targeted: notifications.length, outsiderVisible: outsiderNotifications.length },
  outbox: { parallelClaims: 2, retryable: "retry", permanent: "failed",
    completion: "sent", exhausted: "failed" },
}));

async function createUser(label, isAdmin) {
  const email = `phase6-${label}-${runId}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `Phase 6 ${label}` },
  });
  assert.ifError(error);
  const user = { id: data.user.id, email };
  const { error: profileError } = await service.from("profiles").upsert({
    id: user.id, email, full_name: `Phase 6 ${label}`, role: isAdmin ? "admin" : "participant",
    is_admin: isAdmin, is_active: true,
  });
  assert.ifError(profileError);
  return user;
}

async function signedInClient(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  return client;
}

async function createRequest(label, due) {
  const requestNo = `P6-${label}-${runId}`;
  const snapshot = {
    schemaVersion: 1,
    id: `phase6-template-${runId}`,
    graph: { nodes: [{
      id: "approval-1", kind: "approval", label: "Approval",
      assigneeEmail: owner.email, escalationName: "Escalation owner",
      escalationEmail: escalation.email,
    }], edges: [] },
  };
  const { data, error } = await service.from("approval_requests").insert({
    request_no: requestNo, requester_id: requester.id, requester_name: "Phase 6 requester",
    requester_email: requester.email, title: `Phase 6 ${label}`, workflow_name: "Phase 6",
    department_name: "Testing", status: "pending", due_label: due,
    due_at: due, value_label: "HKD 1", current_step: "Approval",
    current_node_id: "approval-1", current_owner_id: owner.id,
    current_owner_email: owner.email, pending_owner_emails: [owner.email],
    participants: [requester.email, owner.email], last_action: "Submitted",
    task_snapshot: { schemaVersion: 1, id: requestNo, status: "pending", currentOwner: owner.email,
      pendingOwners: [owner.email], participants: [requester.email, owner.email], auditTrail: [] },
    pinned_template_snapshot: snapshot,
  }).select("id,request_no").single();
  assert.ifError(error);
  const { error: assignmentError } = await service.from("approval_request_assignments").insert({
    approval_request_id: data.id, workflow_node_id: "approval-1", assignee_id: owner.id,
    assignment_type: "owner", status: "active", assigned_by: requester.id, reason: "Initial owner",
  });
  assert.ifError(assignmentError);
  return data;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
