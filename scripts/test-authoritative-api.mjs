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
  admin: await createIdentity("admin", true, true),
};
const templateVersionId = await createTemplate();
await assignCrossScope(users.unrelated.id);
const cookies = {
  requester: await signIn(users.requester.email),
  actor: await signIn(users.actor.email),
  target: await signIn(users.target.email),
  unrelated: await signIn(users.unrelated.email),
  inactive: await signIn(users.inactive.email),
  admin: await signIn(users.admin.email),
};

await testAuthAndQueries();
await testDirectoryPagination();
await testReassignmentAndApproval();
await testDelegation();
await testRejectResubmitAndCancel();
await testCollaborationAndCorrectionLifecycle();

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
  const mePayload = await me.json();
  assert.equal(mePayload.profile.id, users.requester.id);
  assert.ok(mePayload.effectiveRoles.includes("originator"));
  assert.ok(
    mePayload.scopeAssignments.some(
      (assignment) => assignment.role === "originator",
    ),
  );

  const directory = await api(`/api/directory?query=${runId}&limit=20`, {
    cookie: cookies.requester,
  });
  assert.equal(directory.status, 200);
  const directoryPayload = await directory.json();
  assert.ok(directoryPayload.users.length >= 4);
  assert.ok(
    directoryPayload.users.every(
      (user) => Array.isArray(user.effectiveRoles) && user.effectiveRoles.length,
    ),
  );

  const unboundedDirectory = await api("/api/directory?query=&limit=50", {
    cookie: cookies.requester,
  });
  assert.equal(unboundedDirectory.status, 403);

  const invalidDirectory = await api("/api/directory?query=%25%2Cis_admin.eq.true", {
    cookie: cookies.requester,
  });
  assert.equal(invalidDirectory.status, 400);
}

async function testDirectoryPagination() {
  const created = await Promise.all(
    Array.from({ length: 53 }, async (_, index) => {
      const email = `directory-${runId}-${String(index).padStart(2, "0")}@example.com`;
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Directory ${runId} ${index}` },
      });
      assert.ifError(error);
      return {
        id: data.user.id,
        email,
        full_name: `Directory ${runId} ${index}`,
        role: "participant",
        is_admin: false,
        is_active: true,
      };
    }),
  );
  const { error: profileError } = await service.from("profiles").upsert(created);
  assert.ifError(profileError);

  const adminMe = await api("/api/me", { cookie: cookies.admin });
  assert.equal(adminMe.status, 200);
  assert.ok((await adminMe.json()).effectiveRoles.includes("superuser"));

  const { data: templateRow, error: templateReadError } = await service
    .from("workflow_template_versions")
    .select("template_snapshot")
    .eq("id", templateVersionId)
    .single();
  assert.ifError(templateReadError);
  const invalidPublishedTemplate = {
    ...templateRow.template_snapshot,
    isDraft: false,
    graph: {
      ...templateRow.template_snapshot.graph,
      nodes: templateRow.template_snapshot.graph.nodes.map((node) =>
        node.id === "approval-1"
          ? { ...node, assigneeEmail: `missing-${runId}@example.com` }
          : node,
      ),
    },
  };
  const invalidPublish = await api("/api/workspace", {
    method: "POST",
    cookie: cookies.admin,
    body: {
      snapshot: {
        approvalTasks: [],
        businessDirectory: [],
        workflowTemplates: [invalidPublishedTemplate],
        formLibrary: [],
        userRoleAssignments: [],
        adminAuditEvents: [],
        selectedTemplateId: invalidPublishedTemplate.id,
      },
    },
  });
  assert.equal(invalidPublish.status, 422);
  assert.match((await invalidPublish.json()).reason, /inactive or missing/i);

  const first = await api(
    `/api/directory?query=${encodeURIComponent(`directory-${runId}`)}&limit=50`,
    { cookie: cookies.admin },
  );
  assert.equal(first.status, 200);
  const firstPayload = await first.json();
  assert.equal(firstPayload.users.length, 50);
  assert.ok(firstPayload.nextCursor);

  const second = await api(
    `/api/directory?query=${encodeURIComponent(`directory-${runId}`)}&limit=50&cursor=${encodeURIComponent(firstPayload.nextCursor)}`,
    { cookie: cookies.admin },
  );
  assert.equal(second.status, 200);
  const secondPayload = await second.json();
  assert.equal(secondPayload.users.length, 3);
  assert.equal(secondPayload.nextCursor, null);
  const ids = new Set([
    ...firstPayload.users.map((user) => user.id),
    ...secondPayload.users.map((user) => user.id),
  ]);
  assert.equal(ids.size, 53);
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

  const crossScopeTarget = await action(
    requestNo,
    {
      action: "reassign",
      expectedVersion: 0,
      idempotencyKey: `cross-scope-${runId}`,
      targetProfileId: users.unrelated.id,
    },
    cookies.actor,
  );
  assert.equal(crossScopeTarget.status, 422);

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

  const revokedRequestNo = await submitRequest(
    "delegation revocation",
    `phase2-submit-${runId}-revoke`,
  );
  const delegatedForRevocation = await action(
    revokedRequestNo,
    {
      action: "delegate",
      expectedVersion: 0,
      idempotencyKey: `delegate-revoke-setup-${runId}`,
      targetProfileId: users.target.id,
    },
    cookies.actor,
  );
  assert.equal(delegatedForRevocation.status, 200);
  const delegatedForRevocationPayload = await delegatedForRevocation.json();
  assert.ok(delegatedForRevocationPayload.request.task.delegationExpiresAt);
  assert.ok(
    delegatedForRevocationPayload.request.availableActions.includes(
      "revoke_delegation",
    ),
  );
  const revoked = await action(
    revokedRequestNo,
    {
      action: "revoke_delegation",
      expectedVersion: 1,
      idempotencyKey: `delegate-revoke-${runId}`,
    },
    cookies.actor,
  );
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).request.task.status, "pending");
  const revokedDelegateAttempt = await action(
    revokedRequestNo,
    {
      action: "approve",
      expectedVersion: 2,
      idempotencyKey: `revoked-delegate-${runId}`,
    },
    cookies.target,
  );
  assert.equal(revokedDelegateAttempt.status, 403);
  const ownerAfterRevocation = await action(
    revokedRequestNo,
    {
      action: "approve",
      expectedVersion: 2,
      idempotencyKey: `owner-after-revoke-${runId}`,
    },
    cookies.actor,
  );
  assert.equal(ownerAfterRevocation.status, 200);
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

async function testCollaborationAndCorrectionLifecycle() {
  const contributorRequestNo = await submitRequest(
    "contributor lifecycle",
    `phase5-submit-${runId}-a`,
  );
  const requested = await collaboration(
    contributorRequestNo,
    {
      action: "request_contributor",
      expectedVersion: 0,
      idempotencyKey: `phase5-contributor-${runId}`,
      targetProfileId: users.target.id,
      requestNote: "Please provide the supporting schedule.",
      blocksApproval: true,
    },
    cookies.actor,
  );
  assert.equal(requested.status, 200);
  const requestedPayload = await requested.json();
  const collaborationRequestId =
    requestedPayload.request.task.collaborationRequests[0].id;
  assert.equal(requestedPayload.request.version, 1);

  const blockedApproval = await action(
    contributorRequestNo,
    {
      action: "approve",
      expectedVersion: 1,
      idempotencyKey: `phase5-blocked-${runId}`,
    },
    cookies.actor,
  );
  assert.equal(blockedApproval.status, 403);

  const unrelatedContribution = await collaboration(
    contributorRequestNo,
    {
      action: "submit_contribution",
      expectedVersion: 1,
      idempotencyKey: `phase5-unrelated-${runId}`,
      collaborationRequestId,
      attachment: attachment(users.unrelated, "unrelated.txt"),
      extractedFields: { note: "forged" },
    },
    cookies.unrelated,
  );
  assert.equal(unrelatedContribution.status, 404);

  const invalidAttachment = await collaboration(
    contributorRequestNo,
    {
      action: "submit_contribution",
      expectedVersion: 1,
      idempotencyKey: `phase5-invalid-path-${runId}`,
      collaborationRequestId,
      attachment: {
        ...attachment(users.target, "invalid.txt"),
        storagePath: `${users.actor.id}/phase5/invalid.txt`,
      },
      extractedFields: {},
    },
    cookies.target,
  );
  assert.equal(invalidAttachment.status, 503);
  const afterInvalidAttachment = await api(
    `/api/approval-requests/${contributorRequestNo}`,
    { cookie: cookies.target },
  );
  assert.equal((await afterInvalidAttachment.json()).request.version, 1);

  const contributed = await collaboration(
    contributorRequestNo,
    {
      action: "submit_contribution",
      expectedVersion: 1,
      idempotencyKey: `phase5-contributed-${runId}`,
      collaborationRequestId,
      attachment: attachment(users.target, "schedule.txt"),
      extractedFields: { schedule: "Submitted" },
    },
    cookies.target,
  );
  assert.equal(contributed.status, 200);
  assert.equal(
    (await contributed.json()).request.task.collaborationRequests[0].status,
    "submitted",
  );
  const contributorApproved = await action(
    contributorRequestNo,
    {
      action: "approve",
      expectedVersion: 2,
      idempotencyKey: `phase5-contributor-approve-${runId}`,
    },
    cookies.actor,
  );
  assert.equal(contributorApproved.status, 200);

  const correctionRequestNo = await submitRequest(
    "shared correction lifecycle",
    `phase5-submit-${runId}-b`,
  );
  await enableTemplateSharedFulfillment(correctionRequestNo);
  const ownerImpersonation = await collaboration(
    correctionRequestNo,
    {
      action: "submit_shared_fulfillment",
      expectedVersion: 0,
      idempotencyKey: `phase5-owner-share-${runId}`,
      requirementNodeId: "submit-target",
      documentId: "supporting-schedule",
      assignedSubmitterProfileId: users.target.id,
      attachment: {
        ...attachment(users.actor, "owner-forged.txt"),
        documentId: "supporting-schedule",
        documentType: "Supporting schedule",
        workflowNodeId: "submit-target",
      },
      extractedFields: {},
    },
    cookies.actor,
  );
  assert.equal(ownerImpersonation.status, 403);

  const shared = await collaboration(
    correctionRequestNo,
    {
      action: "submit_shared_fulfillment",
      expectedVersion: 0,
      idempotencyKey: `phase5-shared-${runId}`,
      requirementNodeId: "submit-target",
      documentId: "supporting-schedule",
      assignedSubmitterProfileId: users.target.id,
      attachment: {
        ...attachment(users.requester, "shared.txt"),
        documentId: "supporting-schedule",
        documentType: "Supporting schedule",
        workflowNodeId: "submit-target",
      },
      extractedFields: { amount: "100" },
    },
    cookies.requester,
  );
  assert.equal(shared.status, 200);
  const sharedPayload = await shared.json();
  const fulfillmentId = sharedPayload.request.task.sharedFulfillments[0].id;

  const rejected = await collaboration(
    correctionRequestNo,
    {
      action: "decide_shared_fulfillment",
      expectedVersion: 1,
      idempotencyKey: `phase5-reject-shared-${runId}`,
      fulfillmentId,
      decision: "reject",
      note: "The amount is incorrect.",
    },
    cookies.actor,
  );
  assert.equal(rejected.status, 200);
  const rejectedPayload = await rejected.json();
  const correctionRequestId = rejectedPayload.request.task.correctionRequests[0].id;
  assert.equal(rejectedPayload.request.task.correctionRequests[0].status, "requested");

  const correctionBlocked = await action(
    correctionRequestNo,
    {
      action: "approve",
      expectedVersion: 2,
      idempotencyKey: `phase5-correction-block-${runId}`,
    },
    cookies.actor,
  );
  assert.equal(correctionBlocked.status, 403);

  const corrected = await collaboration(
    correctionRequestNo,
    {
      action: "submit_correction",
      expectedVersion: 2,
      idempotencyKey: `phase5-corrected-${runId}`,
      correctionRequestId,
      attachment: attachment(users.target, "corrected.txt"),
      extractedFields: { amount: "200" },
    },
    cookies.target,
  );
  assert.equal(corrected.status, 200);
  const correctedPayload = await corrected.json();
  const correctedFulfillmentId =
    correctedPayload.request.task.correctionRequests[0].resolvedByFulfillmentId;

  const confirmed = await collaboration(
    correctionRequestNo,
    {
      action: "decide_shared_fulfillment",
      expectedVersion: 3,
      idempotencyKey: `phase5-confirm-correction-${runId}`,
      fulfillmentId: correctedFulfillmentId,
      decision: "confirm",
    },
    cookies.actor,
  );
  assert.equal(confirmed.status, 200);
  const finalApproval = await action(
    correctionRequestNo,
    {
      action: "approve",
      expectedVersion: 4,
      idempotencyKey: `phase5-correction-approve-${runId}`,
    },
    cookies.actor,
  );
  assert.equal(finalApproval.status, 200);

  const { data: collaborationRows, error: collaborationRowsError } = await service
    .from("approval_requests")
    .select("id")
    .in("request_no", [contributorRequestNo, correctionRequestNo]);
  assert.ifError(collaborationRowsError);
  const { data: notifications, error: notificationError } = await service
    .from("approval_notifications")
    .select("recipient_id")
    .in("approval_request_id", collaborationRows.map((row) => row.id));
  assert.ifError(notificationError);
  assert.ok(notifications.length > 0);
  assert.ok(
    notifications.every((row) =>
      [users.actor.id, users.target.id, users.requester.id].includes(row.recipient_id),
    ),
  );
}

async function enableTemplateSharedFulfillment(requestNo) {
  const { data: request, error: readError } = await service
    .from("approval_requests")
    .select("pinned_template_snapshot")
    .eq("request_no", requestNo)
    .single();
  assert.ifError(readError);
  const snapshot = request.pinned_template_snapshot;
  const sharedSnapshot = {
    ...snapshot,
    documents: [
      ...(snapshot.documents || []),
      {
        id: "supporting-schedule",
        documentType: "Supporting schedule",
        required: true,
        acceptedFormats: ["text"],
        fields: [],
      },
    ],
    graph: {
      ...snapshot.graph,
      nodes: [
        ...snapshot.graph.nodes,
        {
          id: "submit-source",
          kind: "submit_request",
          label: "Shared source",
          x: 0,
          y: 200,
          assigneeName: users.requester.name,
          assigneeEmail: users.requester.email,
          allowSharedFulfillment: true,
          requireSharedFulfillmentConfirmation: true,
          documentIds: [],
        },
        {
          id: "submit-target",
          kind: "submit_request",
          label: "Target requirement",
          x: 150,
          y: 200,
          assigneeName: users.target.name,
          assigneeEmail: users.target.email,
          documentIds: ["supporting-schedule"],
        },
      ],
    },
  };
  const { error: updateError } = await service
    .from("approval_requests")
    .update({ pinned_template_snapshot: sharedSnapshot })
    .eq("request_no", requestNo);
  assert.ifError(updateError);
}

function attachment(user, fileName) {
  return {
    key: `${runId}-${user.id}-${fileName}`,
    fileName,
    documentType: "Collaboration upload",
    format: "ad_hoc",
    storagePath: `${user.id}/phase5/${fileName}`,
  };
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

async function collaboration(requestNo, body, cookie) {
  return api(`/api/approval-requests/${requestNo}/collaboration`, {
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

async function createIdentity(label, active, isAdmin = false) {
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
    is_admin: isAdmin,
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

async function assignCrossScope(profileId) {
  const { data: department, error: departmentError } = await service
    .from("departments")
    .insert({
      name: `Cross Scope Department ${runId}`,
      code: `CROSS-${runId}`.toUpperCase(),
      is_active: true,
    })
    .select("id")
    .single();
  assert.ifError(departmentError);
  const { error: profileError } = await service
    .from("profiles")
    .update({ department_id: department.id })
    .eq("id", profileId);
  assert.ifError(profileError);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
