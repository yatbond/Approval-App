import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
assert.ok(["seed", "verify"].includes(mode), "Expected seed or verify mode.");
const url = requiredEnv("LOCAL_SUPABASE_URL");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const password = "Phase8-Cutover-Aa1!";
const emails = {
  requester: "phase8-requester@example.com",
  owner: "phase8-owner@example.com",
  admin: "phase8-admin@example.com",
  missing: "phase8-missing@example.com",
};
const scenarios = [
  ["PHASE8-SEQUENTIAL", "pending", "Sequential approval"],
  ["PHASE8-PARALLEL", "pending", "Parallel approval"],
  ["PHASE8-CONDITIONAL", "pending", "Conditional approval"],
  ["PHASE8-RETURNED", "returned", "Returned approval"],
  ["PHASE8-DELEGATED", "delegated", "Delegated approval"],
  ["PHASE8-REASSIGNED", "reassigned", "Reassigned approval"],
  ["PHASE8-COLLABORATION", "pending", "Collaborative approval"],
];

if (mode === "seed") await seed();
else await verify();

async function seed() {
  const requester = await createUser(emails.requester, "Phase 8 Requester");
  const owner = await createUser(emails.owner, "Phase 8 Owner");
  const admin = await createUser(emails.admin, "Phase 8 Admin");
  const profiles = [
    profile(requester, "requester", false),
    profile(owner, "approver", false),
    profile(admin, "superuser", true),
  ];
  assert.ifError((await service.from("profiles").upsert(profiles, { onConflict: "id" })).error);
  let { data: template, error: templateError } = await service
    .from("workflow_template_versions").select("id,template_snapshot").limit(1).maybeSingle();
  assert.ifError(templateError);
  if (!template) {
    const { data: business, error: businessError } = await service.from("business_units")
      .insert({ name: "Phase 8 Migration Business", is_active: true }).select("id").single();
    assert.ifError(businessError);
    const { data: department, error: departmentError } = await service.from("business_departments")
      .insert({ business_unit_id: business.id, name: "Phase 8 Operations", is_active: true }).select("id").single();
    assert.ifError(departmentError);
    const created = await service.from("workflow_template_versions").insert({
      template_key: "phase8-migration-template", version_number: 1,
      name: "Phase 8 Migration Template", business_unit_id: business.id,
      department_id: department.id, graph: { nodes: [], edges: [] },
      document_requirements: [], supported_languages: ["en"],
      template_snapshot: {
        schemaVersion: 1, templateKey: "phase8-migration-template", name: "Phase 8 Migration Template",
        graph: { nodes: [], edges: [] }, steps: [], documents: [],
      },
      created_by: requester.id,
    }).select("id,template_snapshot").single();
    assert.ifError(created.error);
    template = created.data;
  }

  const rows = scenarios.map(([requestNo, status, title], index) => ({
    request_no: requestNo,
    workflow_template_version_id: template.id,
    requester_id: null,
    requester_name: "Phase 8 Requester",
    requester_email: emails.requester,
    title,
    workflow_name: "Phase 8 migration rehearsal",
    department_name: "Operations",
    status,
    current_node_id: index === 1 ? "parallel-a" : `${requestNo.toLowerCase()}-node`,
    current_owner_id: null,
    current_owner_email: index === 2 ? emails.missing : emails.owner,
    current_step: index === 1 ? "Parallel review" : title,
    value_label: `HKD ${1_000 + index}`,
    last_action: status === "returned" ? "Returned for correction" : "Submitted",
    pending_node_ids: status === "returned" ? [] : [index === 1 ? "parallel-a" : `${requestNo.toLowerCase()}-node`],
    pending_owner_emails: status === "returned" ? [] : [index === 2 ? emails.missing : emails.owner],
    participants: index === 2
      ? [emails.owner, emails.missing]
      : [emails.requester, emails.owner],
    task_snapshot: { schemaVersion: 0, id: requestNo, status: "legacy-stale", participants: [] },
    state_version: requestNo === "PHASE8-SEQUENTIAL" ? 2 : 0,
    submitted_at: new Date(Date.UTC(2026, 6, 19, 10, index)).toISOString(),
  }));
  const { data: requests, error: requestsError } = await service
    .from("approval_requests").insert(rows).select("id,request_no");
  assert.ifError(requestsError);
  const sequential = requests.find((row) => row.request_no === "PHASE8-SEQUENTIAL");
  assert.ok(sequential);
  assert.ifError((await service.from("approval_request_events").insert([
    {
      approval_request_id: sequential.id, event_key: "phase8-seq-1", action: "submitted",
      event_type: "submitted", actor_id: requester.id, actor_name: "Phase 8 Requester",
      actor_email: emails.requester, detail: "Submitted", request_version: 1,
      created_at: "2026-07-19T10:00:00.000Z",
    },
    {
      approval_request_id: sequential.id, event_key: "phase8-seq-2", action: "assigned",
      event_type: "assigned", actor_id: requester.id, actor_name: "Phase 8 Requester",
      actor_email: emails.requester, detail: "Assigned", target_email: emails.owner,
      request_version: 2, created_at: "2026-07-19T10:01:00.000Z",
    },
  ])).error);
  assert.ifError((await service.from("approval_request_attachments").insert({
    approval_request_id: sequential.id,
    attachment_key: "phase8-evidence",
    file_name: "phase8-evidence.pdf",
    storage_path: "phase8/phase8-evidence.pdf",
    document_type: "Cutover evidence",
    document_format: "pdf",
    uploaded_by: requester.id,
    uploaded_by_email: emails.requester,
  })).error);
  assert.ifError((await service.from("workflow_collaboration_requests").insert({
    id: "phase8-collaboration-request",
    approval_request_no: "PHASE8-COLLABORATION",
    contributor_email: emails.owner,
    contributor_name: "Phase 8 Owner",
    requested_by_email: emails.requester,
    status: "pending",
    blocks_approval: true,
    payload: { workflowNodeId: "collaboration-node" },
  })).error);
  assert.ifError((await service.from("notifications").insert({
    recipient_id: owner.id,
    title: "Phase 8 legacy notification",
    body: "This row proves the legacy runtime freeze.",
  })).error);
  console.log(JSON.stringify({ outcome: "seeded", requests: rows.length, scenarios: scenarios.map(([name]) => name) }));
}

async function verify() {
  const { data: profiles, error: profilesError } = await service
    .from("profiles").select("id,email,is_admin").in("email", Object.values(emails).filter((email) => email !== emails.missing));
  assert.ifError(profilesError);
  const byEmail = new Map(profiles.map((row) => [row.email, row]));
  const requester = byEmail.get(emails.requester);
  const owner = byEmail.get(emails.owner);
  const admin = byEmail.get(emails.admin);
  assert.ok(requester && owner && admin);

  const requestNos = scenarios.map(([name]) => name);
  const { data: requests, error: requestsError } = await service.from("approval_requests")
    .select("id,request_no,status,state_version,requester_id,current_owner_id,current_owner_email,current_step,last_action,participants,task_snapshot,pinned_template_snapshot")
    .in("request_no", requestNos).order("request_no");
  assert.ifError(requestsError);
  assert.equal(requests.length, 7);
  const expectedStatus = new Map(scenarios.map(([name, status]) => [name, status]));
  for (const request of requests) {
    assert.equal(request.status, expectedStatus.get(request.request_no));
    assert.equal(request.requester_id, requester.id);
    assert.equal(request.current_owner_id, request.request_no === "PHASE8-CONDITIONAL" ? null : owner.id);
    assert.equal(request.task_snapshot.schemaVersion, 1);
    assert.equal(request.task_snapshot.id, request.request_no);
    assert.equal(request.task_snapshot.status, request.status);
    assert.equal(request.task_snapshot.currentOwner, request.current_owner_email || "");
    assert.deepEqual(request.task_snapshot.participants, request.participants);
    assert.equal(request.pinned_template_snapshot.schemaVersion, 1);
    assert.ok(request.pinned_template_snapshot.graph || request.pinned_template_snapshot.steps);
  }
  const canonicalHash = sha256(requests.map((row) => ({
    id: row.id, requestNo: row.request_no, status: row.status,
    stateVersion: row.state_version, requesterId: row.requester_id,
    currentOwnerId: row.current_owner_id, currentOwnerEmail: row.current_owner_email,
    currentStep: row.current_step, lastAction: row.last_action,
    participants: row.participants, pinnedTemplateSnapshot: row.pinned_template_snapshot,
  })));

  const { data: issues, error: issuesError } = await service.from("approval_migration_issues")
    .select("entity_id,field_name,legacy_value,resolved_at").in("entity_id", requests.map((row) => row.id)).is("resolved_at", null);
  assert.ifError(issuesError);
  assert.deepEqual(issues.map((row) => [row.field_name, row.legacy_value]).sort(), [
    ["current_owner_email", emails.missing],
    ["participants", emails.missing],
  ]);
  const { count: participantCount, error: participantError } = await service
    .from("approval_request_participants").select("id", { count: "exact", head: true }).in("approval_request_id", requests.map((row) => row.id));
  assert.ifError(participantError);
  assert.ok(participantCount >= 19, `Expected reconciled participant rows, got ${participantCount}.`);
  const { count: assignmentCount, error: assignmentError } = await service
    .from("approval_request_assignments").select("id", { count: "exact", head: true }).in("approval_request_id", requests.map((row) => row.id));
  assert.ifError(assignmentError);
  assert.equal(assignmentCount, 5);

  const sequential = requests.find((row) => row.request_no === "PHASE8-SEQUENTIAL");
  const { data: events, error: eventsError } = await service.from("approval_request_events")
    .select("event_type,request_version,created_at").eq("approval_request_id", sequential.id).order("created_at");
  assert.ifError(eventsError);
  assert.deepEqual(events.map((row) => [row.event_type, row.request_version]), [["submitted", 1], ["assigned", 2]]);
  assert.equal((await service.from("approval_request_attachments").select("id", { count: "exact", head: true }).eq("approval_request_id", sequential.id)).count, 1);
  assert.equal((await service.from("workflow_collaboration_requests").select("id", { count: "exact", head: true }).eq("approval_request_no", "PHASE8-COLLABORATION")).count, 1);

  const initialAudit = await rpc("audit_approval_runtime_projections", { p_request_no: null, p_limit: 5000 });
  assert.equal(initialAudit.mismatches, 0);
  const beforeCanonical = { status: sequential.status, stateVersion: sequential.state_version, owner: sequential.current_owner_email };
  assert.ifError((await service.from("approval_requests").update({
    task_snapshot: { ...sequential.task_snapshot, status: "approved", currentOwner: "wrong@example.com" },
  }).eq("id", sequential.id)).error);
  assert.equal((await rpc("audit_approval_runtime_projections", { p_request_no: sequential.request_no, p_limit: 1 })).mismatches, 1);
  const mismatch = await service.from("approval_read_comparison_mismatches").select("canonical_projection,legacy_projection,resolved_at")
    .eq("entity_key", sequential.request_no).single();
  assert.ifError(mismatch.error);
  assert.equal(mismatch.data.canonical_projection.status, beforeCanonical.status);
  assert.equal(mismatch.data.legacy_projection.status, "approved");
  const canonicalAfterAudit = await service.from("approval_requests").select("status,state_version,current_owner_email").eq("id", sequential.id).single();
  assert.ifError(canonicalAfterAudit.error);
  assert.deepEqual({ status: canonicalAfterAudit.data.status, stateVersion: canonicalAfterAudit.data.state_version, owner: canonicalAfterAudit.data.current_owner_email }, beforeCanonical);
  await rpc("reconcile_approval_legacy_runtime", { p_limit: 10000 });
  assert.equal((await rpc("audit_approval_runtime_projections", { p_request_no: sequential.request_no, p_limit: 1 })).resolved, 1);

  const fallbackUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await setState("read_compare", 0, fallbackUntil, admin.id, "Phase 8 read comparison rehearsal");
  assert.equal((await decision(owner.id)).commandEnabled, false);
  await setState("cohort", 50, fallbackUntil, admin.id, "Phase 8 deterministic cohort rehearsal");
  const candidateIds = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const decisions = await Promise.all(candidateIds.map(decision));
  assert.ok(decisions.some((value) => value.commandEnabled));
  assert.ok(decisions.some((value) => !value.commandEnabled));
  for (let index = 0; index < candidateIds.length; index += 1) {
    assert.deepEqual(await decision(candidateIds[index]), decisions[index]);
  }
  await setState("rollback_read_only", 0, fallbackUntil, admin.id, "Phase 8 rollback rehearsal pauses commands");
  assert.equal((await decision(owner.id)).commandEnabled, false);

  const authClient = createClient(url, requiredEnv("LOCAL_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  assert.ifError((await authClient.auth.signInWithPassword({ email: emails.admin, password })).error);
  const denied = await authClient.rpc("set_approval_rollout_state", {
    p_mode: "authoritative", p_cohort_percentage: 100,
    p_legacy_read_fallback_until: fallbackUntil, p_actor_id: admin.id, p_reason: "This must be denied",
  });
  assert.ok(denied.error);

  const legacy = await service.from("notifications").select("id,title").eq("title", "Phase 8 legacy notification").single();
  assert.ifError(legacy.error);
  const frozenWrite = await service.from("notifications").update({ title: "Mutation must fail" }).eq("id", legacy.data.id);
  assert.ok(frozenWrite.error);
  assert.match(frozenWrite.error.message, /legacy runtime writes are frozen/i);
  const rolloutEvent = await service.from("approval_rollout_events").select("id").limit(1).single();
  assert.ifError(rolloutEvent.error);
  const appendOnly = await service.from("approval_rollout_events").update({ reason: "Mutation must fail" }).eq("id", rolloutEvent.data.id);
  assert.ok(appendOnly.error);

  await setState("authoritative", 100, fallbackUntil, admin.id, "Phase 8 rehearsal complete; authoritative restored");
  assert.equal((await decision(owner.id)).commandEnabled, true);
  const finalAudit = await rpc("audit_approval_runtime_projections", { p_request_no: null, p_limit: 5000 });
  assert.equal(finalAudit.mismatches, 0);
  console.log(JSON.stringify({
    outcome: "passed", fixtureRequests: requests.length, canonicalHash,
    unresolvedIssues: issues.length, participants: participantCount, assignments: assignmentCount,
    eventVersions: events.map((row) => row.request_version), readCompare: "passed",
    cohort: "deterministic", rollback: "read_only", legacyWrites: "frozen",
    finalMode: "authoritative",
  }));
}

async function createUser(email, fullName) {
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ifError(listed.error);
  const existing = listed.data.users.find((user) => user.email === email);
  if (existing) return existing;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  assert.ifError(error);
  assert.ok(data.user);
  return data.user;
}
function profile(user, role, isAdmin) {
  return { id: user.id, email: user.email, full_name: user.user_metadata.full_name, role, is_admin: isAdmin, is_active: true };
}
async function rpc(name, args) {
  const { data, error } = await service.rpc(name, args);
  assert.ifError(error);
  return data;
}
function setState(mode, percentage, fallbackUntil, actorId, reason) {
  return rpc("set_approval_rollout_state", {
    p_mode: mode, p_cohort_percentage: percentage, p_legacy_read_fallback_until: fallbackUntil,
    p_actor_id: actorId, p_reason: reason,
  });
}
function decision(actorId) {
  return rpc("get_approval_rollout_decision", { p_actor_id: actorId });
}
function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
