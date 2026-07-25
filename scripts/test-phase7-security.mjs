import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = requiredEnv("LOCAL_SUPABASE_URL");
const anonKey = requiredEnv("LOCAL_SUPABASE_ANON_KEY");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const password = `Phase7-${randomUUID()}-Aa1!`;
const runId = randomUUID().slice(0, 8);
const requester = await createUser("requester");
const owner = await createUser("owner");
const participant = await createUser("participant");
const outsider = await createUser("outsider");
const admin = await createUser("admin", true);
const clients = {
  requester: await signIn(requester.email),
  owner: await signIn(owner.email),
  participant: await signIn(participant.email),
  outsider: await signIn(outsider.email),
  admin: await signIn(admin.email),
};

const requestNo = `P7-SEC-${runId}`;
const { data: requestRow, error: requestError } = await service.from("approval_requests").insert({
  request_no: requestNo, requester_id: requester.id, requester_name: "Phase 7 requester",
  requester_email: requester.email, title: "Phase 7 security matrix", workflow_name: "Security",
  department_name: "Testing", status: "pending", due_label: "Tomorrow",
  value_label: "HKD 1", current_step: "Review", current_owner_id: owner.id,
  current_owner_email: owner.email, participants: [requester.email, owner.email, participant.email],
  last_action: "Submitted", task_snapshot: { schemaVersion: 1 },
  pinned_template_snapshot: { schemaVersion: 1 },
}).select("id").single();
assert.ifError(requestError);
for (const [profile, role] of [[requester, "requester"], [owner, "owner"], [participant, "observer"]]) {
  const { error } = await service.from("approval_request_participants").insert({
    approval_request_id: requestRow.id, profile_id: profile.id,
    participant_role: role, visibility_reason: `Phase 7 ${role}`,
    workflow_node_id: "review", created_by: requester.id,
  });
  assert.ifError(error);
}

const storagePath = `${owner.id}/phase7/${runId}.txt`;
const ownerUpload = await clients.owner.storage.from("approval-documents")
  .upload(storagePath, Buffer.from("phase 7 private attachment"), { contentType: "text/plain" });
assert.ifError(ownerUpload.error);
const { error: attachmentError } = await service.from("approval_request_attachments").insert({
  approval_request_id: requestRow.id, attachment_key: `phase7-${runId}`,
  file_name: "phase7.txt", document_type: "Security proof", document_format: "text",
  storage_path: storagePath, uploaded_by: owner.id, uploaded_by_email: owner.email,
});
assert.ifError(attachmentError);

for (const allowed of [clients.owner, clients.requester, clients.participant]) {
  const download = await allowed.storage.from("approval-documents").download(storagePath);
  assert.ifError(download.error);
  assert.equal(await download.data.text(), "phase 7 private attachment");
}
const outsiderDownload = await clients.outsider.storage.from("approval-documents").download(storagePath);
assert.ok(outsiderDownload.error, "unrelated user downloaded a private request attachment");
const forgedUpload = await clients.outsider.storage.from("approval-documents")
  .upload(`${owner.id}/phase7/forged-${runId}.txt`, Buffer.from("forged"), { contentType: "text/plain" });
assert.ok(forgedUpload.error, "unrelated user uploaded into another user's storage prefix");
const participantDelete = await clients.participant.storage.from("approval-documents").remove([storagePath]);
assert.ifError(participantDelete.error);
const ownerReadAfterParticipantDelete = await clients.owner.storage.from("approval-documents").download(storagePath);
assert.ifError(ownerReadAfterParticipantDelete.error);
assert.equal(
  await ownerReadAfterParticipantDelete.data.text(),
  "phase 7 private attachment",
  "participant deleted the owner's attachment",
);

const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const { error: publicDepartmentsError } = await anonymous.from("departments").select("name").limit(1);
assert.ifError(publicDepartmentsError);
const { error: anonymousRuntimeRead } = await anonymous.from("approval_requests").select("id").limit(1);
assert.ok(anonymousRuntimeRead, "anonymous role read approval runtime rows");
const { error: anonymousLegacyWrite } = await anonymous.from("approval_tasks").insert({});
assert.ok(anonymousLegacyWrite, "anonymous role wrote an obsolete runtime table");

const { data: requesterRequests, error: requesterReadError } = await clients.requester
  .from("approval_requests").select("request_no").eq("id", requestRow.id);
assert.ifError(requesterReadError);
assert.equal(requesterRequests.length, 1);
const { data: participantRequests, error: participantReadError } = await clients.participant
  .from("approval_requests").select("request_no").eq("id", requestRow.id);
assert.ifError(participantReadError);
assert.equal(participantRequests.length, 1);
const { data: outsiderRequests, error: outsiderReadError } = await clients.outsider
  .from("approval_requests").select("request_no").eq("id", requestRow.id);
assert.ifError(outsiderReadError);
assert.equal(outsiderRequests.length, 0);

const { error: forgedRuntimeWrite } = await clients.owner.from("approval_requests")
  .update({ status: "approved" }).eq("id", requestRow.id);
assert.ok(forgedRuntimeWrite, "browser updated authoritative approval state directly");
const { error: forgedEventWrite } = await clients.owner.from("approval_request_events")
  .insert({ approval_request_id: requestRow.id, action: "approved", actor_email: owner.email,
    detail: "forged", request_version: 1, event_type: "approve" });
assert.ok(forgedEventWrite, "browser appended an authoritative event directly");
const { error: schedulerCallError } = await clients.admin.rpc("run_approval_escalation_scheduler", {
  p_run_key: `browser-forged-${runId}`, p_limit: 1,
});
assert.ok(schedulerCallError, "authenticated admin executed the service-only scheduler");

const { data: outboxForOutsider, error: outboxOutsiderError } = await clients.outsider
  .from("approval_email_outbox").select("id");
assert.ifError(outboxOutsiderError);
assert.equal(outboxForOutsider.length, 0);
const { error: obsoleteWrite } = await clients.admin.from("delegations").insert({
  delegator_id: admin.id, delegate_id: outsider.id,
  starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 60_000).toISOString(),
});
assert.ok(obsoleteWrite, "admin wrote obsolete delegations table through Data API");

const ownerDelete = await clients.owner.storage.from("approval-documents").remove([storagePath]);
assert.ifError(ownerDelete.error);

console.log(JSON.stringify({
  outcome: "passed",
  rls: { requester: 1, participant: 1, outsider: 0, forgedRuntimeWrite: "denied" },
  storage: { owner: "read-delete", requester: "read", participant: "read", outsider: "denied" },
  dataApi: { anonymousRuntime: "denied", obsoleteTables: "denied", scheduler: "service-only" },
}));

async function createUser(label, isAdmin = false) {
  const email = `phase7-${label}-${runId}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `Phase 7 ${label}` },
  });
  assert.ifError(error);
  const user = { id: data.user.id, email };
  const { error: profileError } = await service.from("profiles").upsert({
    id: user.id, email, full_name: `Phase 7 ${label}`, role: isAdmin ? "admin" : "participant",
    is_admin: isAdmin, is_active: true,
  });
  assert.ifError(profileError);
  return user;
}

async function signIn(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  return client;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
