import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
const supabaseUrl = requiredEnv("LOCAL_SUPABASE_URL");
const serviceRoleKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const password = `Phase2-${randomUUID()}-Aa1!`;
const runId = randomUUID().slice(0, 8);
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = {
  requester: await createIdentity("requester", true),
  actor: await createIdentity("actor", true),
  target: await createIdentity("target", true),
  unrelated: await createIdentity("unrelated", true),
  inactive: await createIdentity("inactive", false),
};
const templateVersionId = await createTemplate();
const cookies = {
  requester: await signIn(users.requester.email),
  actor: await signIn(users.actor.email),
  target: await signIn(users.target.email),
  unrelated: await signIn(users.unrelated.email),
  inactive: await signIn(users.inactive.email),
};

await testAuthAndQueries();
await testReassignmentAndApproval();
await testDelegation();
await testRejectResubmitAndCancel();

console.log("Authoritative API integration suite passed.");

async function testAuthAndQueries() {
  const anonymous = await api("/api/me");
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "authentication_required");

  const inactive = await api("/api/me", { cookie: cookies.inactive });
  assert.equal(inactive.status, 403);
  assert.equal((await inactive.json()).error.code, "inactive_profile");

  const me = await api("/api/me", { cookie: cookies.requester });
  assert.equal(me.status, 200);
  assert.match(me.headers.get("cache-control") || "", /no-store/);
  assert.ok(me.headers.get("x-correlation-id"));
  assert.equal((await me.json()).profile.id, users.requester.id);

  const directory = await api(`/api/directory?query=${runId}&limit=20`, {
    cookie: cookies.requester,
  });
  assert.equal(directory.status, 200);
  assert.ok((await directory.json()).users.length >= 4);

  const invalidDirectory = await api("/api/directory?query=%25%2Cis_admin.eq.true", {
    cookie: cookies.requester,
  });
  assert.equal(invalidDirectory.status, 400);
}

async function testReassignmentAndApproval() {
  const submissionKey = `phase2-submit-${runId}-a`;
  const forged = await submit(
    {
      templateVersionId,
      title: "Forged request",
      idempotencyKey: submissionKey,
      actorId: users.requester.id,
    },
    cookies.requester,
  );
  assert.equal(forged.status, 400);

  const body = {
    templateVersionId,
    title: "Phase 2 reassignment request",
    valueLabel: "HKD 10,000",
    extractedFields: { amount: "10000" },
    idempotencyKey: submissionKey,
  };
  const submitted = await submit(body, cookies.requester);
  assert.equal(submitted.status, 201);
  const submittedPayload = await submitted.json();
  assert.equal(submittedPayload.outcome, "applied");
  const requestNo = submittedPayload.request.requestNo;

  const inbox = await api("/api/approval-requests?view=inbox&limit=1", {
    cookie: cookies.actor,
  });
  assert.equal(inbox.status, 200);
  const inboxPayload = await inbox.json();
  assert.equal(inboxPayload.items.length, 1);
  assert.equal(inboxPayload.items[0].requestNo, requestNo);

  const invalidCursor = await api(
    "/api/approval-requests?view=tracking&cursor=not-a-valid-cursor",
    { cookie: cookies.requester },
  );
  assert.equal(invalidCursor.status, 400);

  const replayed = await submit(body, cookies.requester);
  assert.equal(replayed.status, 200);
  assert.equal((await replayed.json()).outcome, "replayed");

  const conflict = await submit({ ...body, title: "Conflicting reuse" }, cookies.requester);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "idempotency_conflict");

  const hidden = await api(`/api/approval-requests/${requestNo}`, {
    cookie: cookies.unrelated,
  });
  assert.equal(hidden.status, 404);

  const requesterApproval = await action(
    requestNo,
    { action: "approve", expectedVersion: 0, idempotencyKey: `forbidden-${runId}` },
    cookies.requester,
  );
  assert.equal(requesterApproval.status, 403);

  const forgedAction = await action(
    requestNo,
    {
      action: "approve",
      expectedVersion: 0,
      idempotencyKey: `forged-action-${runId}`,
      actorEmail: users.requester.email,
    },
    cookies.actor,
  );
  assert.equal(forgedAction.status, 400);

  const stale = await action(
    requestNo,
    { action: "approve", expectedVersion: 99, idempotencyKey: `stale-${runId}` },
    cookies.actor,
  );
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "stale_version");

  const invalidTarget = await action(
    requestNo,
    {
      action: "delegate",
      expectedVersion: 0,
      idempotencyKey: `inactive-${runId}`,
      targetProfileId: users.inactive.id,
    },
    cookies.actor,
  );
  assert.equal(invalidTarget.status, 422);

  const reassigned = await action(
    requestNo,
    {
      action: "reassign",
      expectedVersion: 0,
      idempotencyKey: `reassign-${runId}`,
      targetProfileId: users.target.id,
      comment: "Please take this request.",
    },
    cookies.actor,
  );
  assert.equal(reassigned.status, 200);

  const candidateDetail = await api(`/api/approval-requests/${requestNo}`, {
    cookie: cookies.target,
  });
  assert.equal(candidateDetail.status, 200);
  assert.deepEqual((await candidateDetail.json()).request.availableActions, [
    "accept_reassignment",
    "decline_reassignment",
  ]);

  const premature = await action(
    requestNo,
    { action: "approve", expectedVersion: 1, idempotencyKey: `premature-${runId}` },
    cookies.target,
  );
  assert.equal(premature.status, 403);

  const accepted = await action(
    requestNo,
    {
      action: "accept_reassignment",
      expectedVersion: 1,
      idempotencyKey: `accept-${runId}`,
    },
    cookies.target,
  );
  assert.equal(accepted.status, 200);

  const approveBody = {
    action: "approve",
    expectedVersion: 2,
    idempotencyKey: `approve-${runId}`,
  };
  const approved = await action(requestNo, approveBody, cookies.target);
  assert.equal(approved.status, 200);
  const approvalCorrelationId = approved.headers.get("x-correlation-id");
  const approvedPayload = await approved.json();
  assert.equal(approvedPayload.request.task.status, "approved");
  assert.ok(approvalCorrelationId);
  assert.equal(
    approvedPayload.request.events.at(-1).details.correlationId,
    approvalCorrelationId,
  );

  const approvalReplay = await action(requestNo, approveBody, cookies.target);
  assert.equal(approvalReplay.status, 200);
  assert.equal((await approvalReplay.json()).outcome, "replayed");

  const alreadyDecided = await action(
    requestNo,
    { action: "approve", expectedVersion: 3, idempotencyKey: `decided-${runId}` },
    cookies.target,
  );
  assert.equal(alreadyDecided.status, 409);
  assert.equal((await alreadyDecided.json()).error.code, "already_decided");
}

async function testDelegation() {
  const requestNo = await submitRequest("delegation", `phase2-submit-${runId}-b`);
  const delegated = await action(
    requestNo,
    {
      action: "delegate",
      expectedVersion: 0,
      idempotencyKey: `delegate-${runId}`,
      targetProfileId: users.target.id,
    },
    cookies.actor,
  );
  assert.equal(delegated.status, 200);
  const delegatedPayload = await delegated.json();
  assert.equal(delegatedPayload.request.task.status, "delegated");
  assert.ok(delegatedPayload.request.task.pendingOwners.includes(users.target.email));

  const approved = await action(
    requestNo,
    { action: "approve", expectedVersion: 1, idempotencyKey: `delegate-approve-${runId}` },
    cookies.target,
  );
  assert.equal(approved.status, 200);
}

async function testRejectResubmitAndCancel() {
  const requestNo = await submitRequest("return", `phase2-submit-${runId}-c`);
  const rejected = await action(
    requestNo,
    {
      action: "reject_with_comment",
      expectedVersion: 0,
      idempotencyKey: `reject-${runId}`,
      comment: "Please correct the amount.",
    },
    cookies.actor,
  );
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).request.task.status, "returned");

  const resubmitted = await action(
    requestNo,
    {
      action: "amend_resubmit",
      expectedVersion: 1,
      idempotencyKey: `resubmit-${runId}`,
      fieldUpdates: { amount: "11000" },
    },
    cookies.requester,
  );
  assert.equal(resubmitted.status, 200);
  assert.equal((await resubmitted.json()).request.task.extractedFields.amount, "11000");

  const rejectedAgain = await action(
    requestNo,
    {
      action: "reject",
      expectedVersion: 2,
      idempotencyKey: `reject-again-${runId}`,
    },
    cookies.actor,
  );
  assert.equal(rejectedAgain.status, 200);

  const cancelled = await action(
    requestNo,
    { action: "cancel", expectedVersion: 3, idempotencyKey: `cancel-${runId}` },
    cookies.requester,
  );
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).request.task.status, "cancelled");

  const firstPage = await api("/api/approval-requests?view=tracking&limit=1", {
    cookie: cookies.requester,
  });
  assert.equal(firstPage.status, 200);
  const firstPagePayload = await firstPage.json();
  assert.equal(firstPagePayload.items.length, 1);
  assert.ok(firstPagePayload.nextCursor);
  const secondPage = await api(
    `/api/approval-requests?view=tracking&limit=1&cursor=${encodeURIComponent(firstPagePayload.nextCursor)}`,
    { cookie: cookies.requester },
  );
  assert.equal(secondPage.status, 200);
  const secondPagePayload = await secondPage.json();
  assert.equal(secondPagePayload.items.length, 1);
  assert.notEqual(
    secondPagePayload.items[0].requestNo,
    firstPagePayload.items[0].requestNo,
  );
}

async function submitRequest(label, idempotencyKey) {
  const response = await submit(
    { templateVersionId, title: `Phase 2 ${label}`, idempotencyKey },
    cookies.requester,
  );
  assert.equal(response.status, 201);
  return (await response.json()).request.requestNo;
}

async function submit(body, cookie) {
  return api("/api/approval-requests", {
    method: "POST",
    cookie,
    body,
  });
}

async function action(requestNo, body, cookie) {
  return api(`/api/approval-requests/${requestNo}/actions`, {
    method: "POST",
    cookie,
    body,
  });
}

async function api(path, { method = "GET", cookie, body } = {}) {
  return fetch(`${appUrl}${path}`, {
    method,
    redirect: "manual",
    headers: {
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
    method: "POST",
    body: form,
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const setCookies = response.headers.getSetCookie();
  assert.ok(setCookies.length);
  return setCookies.map((value) => value.split(";", 1)[0]).join("; ");
}

async function createIdentity(label, active) {
  const email = `phase2-${label}-${runId}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Phase 2 ${label}` },
  });
  assert.ifError(error);
  const profile = {
    id: data.user.id,
    email,
    full_name: `Phase 2 ${label}`,
    role: label === "actor" || label === "target" ? "approver" : "originator",
    is_admin: false,
    is_active: active,
  };
  const { error: profileError } = await service.from("profiles").upsert(profile);
  assert.ifError(profileError);
  return { id: profile.id, email, name: profile.full_name };
}

async function createTemplate() {
  const businessName = `Phase 2 Business ${runId}`;
  const { data: business, error: businessError } = await service
    .from("business_units")
    .insert({ name: businessName, is_active: true })
    .select("id")
    .single();
  assert.ifError(businessError);
  const { data: department, error: departmentError } = await service
    .from("business_departments")
    .insert({ business_unit_id: business.id, name: "Finance", is_active: true })
    .select("id")
    .single();
  assert.ifError(departmentError);
  const templateKey = `phase2-api-${runId}`;
  const snapshot = {
    id: templateKey,
    name: "Phase 2 API workflow",
    business: businessName,
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Approval",
          x: 150,
          y: 0,
          assigneeName: users.actor.name,
          assigneeEmail: users.actor.email,
          dueInHours: 24,
        },
        { id: "return", kind: "return_reject", label: "Return", x: 300, y: 100 },
        { id: "end", kind: "end", label: "Complete", x: 300, y: 0 },
      ],
      edges: [
        { id: "start-approval", sourceId: "start", targetId: "approval-1", branchType: "main", label: "Submit" },
        { id: "approval-end", sourceId: "approval-1", targetId: "end", branchType: "approved", label: "Approved" },
        { id: "approval-return", sourceId: "approval-1", targetId: "return", branchType: "rejected", label: "Rejected" },
      ],
    },
  };
  const { data, error } = await service
    .from("workflow_template_versions")
    .insert({
      template_key: templateKey,
      version_number: 1,
      name: snapshot.name,
      business_unit_id: business.id,
      department_id: department.id,
      graph: snapshot.graph,
      document_requirements: [],
      supported_languages: ["en"],
      template_snapshot: snapshot,
      created_by: users.requester.id,
      is_active: true,
      is_active_version: true,
    })
    .select("id")
    .single();
  assert.ifError(error);
  return data.id;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
