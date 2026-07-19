import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = requiredEnv("LOCAL_SUPABASE_URL");
const anonKey = requiredEnv("LOCAL_SUPABASE_ANON_KEY");
const serviceRoleKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const password = `Phase1-${randomUUID()}-Aa1!`;
const runId = randomUUID().slice(0, 8);

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const identities = {
  admin: await createIdentity("admin", true),
  requester: await createIdentity("requester", false),
  actor: await createIdentity("actor", false),
  target: await createIdentity("target", false),
  unrelated: await createIdentity("unrelated", false),
};

const clients = {
  admin: await signIn(identities.admin.email),
  requester: await signIn(identities.requester.email),
  actor: await signIn(identities.actor.email),
  target: await signIn(identities.target.email),
  unrelated: await signIn(identities.unrelated.email),
};

const fixture = await createRequestFixture("primary");
const raceFixture = await createRequestFixture("race");
const reassignmentFixture = await createRequestFixture("reassignment");

await testRlsAndDirectMutationDenial(fixture);
await testAtomicConfiguration();
await testAtomicSubmission(fixture);
await testCommandSemantics(fixture);
await testConcurrentWinner(raceFixture);
await testNormalizedAssignmentTransitions(reassignmentFixture);

console.log("Authoritative database suite passed.");

async function createIdentity(label, isAdmin) {
  const email = `phase1-${label}-${runId}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Phase 1 ${label}` },
  });
  assert.ifError(error);
  assert.ok(data.user?.id);

  const identity = {
    id: data.user.id,
    email,
    name: `Phase 1 ${label}`,
    isAdmin,
  };
  const { error: profileError } = await service.from("profiles").upsert({
    id: identity.id,
    email: identity.email,
    full_name: identity.name,
    role: isAdmin ? "admin" : "requester",
    is_admin: isAdmin,
    is_active: true,
  });
  assert.ifError(profileError);
  return identity;
}

async function signIn(email) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  return client;
}

async function createRequestFixture(label) {
  const businessName = `Phase 1 Business ${runId}`;
  const departmentName = `Phase 1 Department ${runId}`;
  const { data: business, error: businessError } = await service
    .from("business_units")
    .upsert({ name: businessName, is_active: true }, { onConflict: "name" })
    .select("id")
    .single();
  assert.ifError(businessError);

  const { data: department, error: departmentError } = await service
    .from("business_departments")
    .upsert(
      {
        business_unit_id: business.id,
        name: departmentName,
        is_active: true,
      },
      { onConflict: "business_unit_id,name" },
    )
    .select("id")
    .single();
  assert.ifError(departmentError);

  const templateKey = `phase1-template-${runId}`;
  const { data: template, error: templateError } = await service
    .from("workflow_template_versions")
    .upsert(
      {
        template_key: templateKey,
        version_number: 1,
        name: `Phase 1 ${label} template`,
        business_unit_id: business.id,
        department_id: department.id,
        graph: { nodes: [], edges: [] },
        document_requirements: [],
        supported_languages: ["en"],
        template_snapshot: {
          schemaVersion: 1,
          id: templateKey,
          name: `Phase 1 ${label} template`,
          business: businessName,
          department: departmentName,
          documentTypes: [],
          documents: [],
          languages: ["en"],
          fields: [],
          steps: [],
          graph: { nodes: [], edges: [] },
        },
        created_by: identities.admin.id,
        is_active: true,
        is_active_version: true,
      },
      { onConflict: "template_key,version_number" },
    )
    .select("id")
    .single();
  assert.ifError(templateError);

  const requestNo = `PHASE1-${label.toUpperCase()}-${runId}`;
  const { data: request, error: requestError } = await service
    .from("approval_requests")
    .insert({
      request_no: requestNo,
      workflow_template_version_id: template.id,
      requester_id: identities.requester.id,
      requester_name: identities.requester.name,
      requester_email: identities.requester.email,
      title: `Phase 1 ${label} request`,
      workflow_name: `Phase 1 ${label} template`,
      department_name: departmentName,
      status: "pending",
      due_label: "Tomorrow",
      current_node_id: "approval-1",
      current_owner_id: identities.actor.id,
      current_owner_email: identities.actor.email,
      current_step: "Approval",
      value_label: "HKD 1,000",
      last_action: "Submitted",
      pending_node_ids: ["approval-1"],
      pending_owner_emails: [identities.actor.email],
      participants: [identities.requester.email, identities.actor.email],
      task_snapshot: { schemaVersion: 1, id: requestNo },
      pinned_template_snapshot: { schemaVersion: 1, id: templateKey },
    })
    .select("id,request_no,state_version,workflow_template_version_id")
    .single();
  assert.ifError(requestError);

  const { error: participantsError } = await service
    .from("approval_request_participants")
    .insert([
      {
        approval_request_id: request.id,
        profile_id: identities.requester.id,
        participant_role: "requester",
        visibility_reason: "Test requester",
        workflow_node_id: "",
        created_by: identities.admin.id,
      },
      {
        approval_request_id: request.id,
        profile_id: identities.actor.id,
        participant_role: "owner",
        visibility_reason: "Test owner",
        workflow_node_id: "approval-1",
        created_by: identities.admin.id,
      },
    ]);
  assert.ifError(participantsError);

  const { error: assignmentError } = await service
    .from("approval_request_assignments")
    .insert({
      approval_request_id: request.id,
      workflow_node_id: "approval-1",
      assignee_id: identities.actor.id,
      assignment_type: "owner",
      status: "active",
      assigned_by: identities.requester.id,
    });
  assert.ifError(assignmentError);

  return request;
}

async function testRlsAndDirectMutationDenial(request) {
  const { data: actorRows, error: actorReadError } = await clients.actor
    .from("approval_requests")
    .select("request_no,state_version")
    .eq("id", request.id);
  assert.ifError(actorReadError);
  assert.equal(actorRows.length, 1);

  const { data: requesterRows, error: requesterReadError } =
    await clients.requester
      .from("approval_requests")
      .select("request_no")
      .eq("id", request.id);
  assert.ifError(requesterReadError);
  assert.equal(requesterRows.length, 1);

  const { data: unrelatedRows, error: unrelatedReadError } =
    await clients.unrelated
      .from("approval_requests")
      .select("request_no")
      .eq("id", request.id);
  assert.ifError(unrelatedReadError);
  assert.equal(unrelatedRows.length, 0);

  const { data: adminRows, error: adminReadError } = await clients.admin
    .from("approval_requests")
    .select("request_no")
    .eq("id", request.id);
  assert.ifError(adminReadError);
  assert.equal(adminRows.length, 1);

  const { error: directUpdateError } = await clients.actor
    .from("approval_requests")
    .update({ status: "approved" })
    .eq("id", request.id);
  assert.ok(directUpdateError, "authenticated request UPDATE must be denied");

  const { error: directEventError } = await clients.actor
    .from("approval_request_events")
    .insert({
      approval_request_id: request.id,
      event_key: randomUUID(),
      action: "approve",
      event_type: "approve",
      request_version: 1,
      actor_email: identities.actor.email,
      actor_name: identities.actor.name,
      detail: "forged browser event",
    });
  assert.ok(directEventError, "authenticated event INSERT must be denied");

  const { error: directRpcError } = await clients.actor.rpc(
    "commit_approval_request_command",
    commandArgs(request.request_no, 0, "forbidden-rpc", "approve"),
  );
  assert.ok(directRpcError, "authenticated command RPC execution must be denied");

  const { error: directSubmissionRpcError } = await clients.requester.rpc(
    "submit_approval_request",
    {
      p_actor_id: identities.requester.id,
      p_idempotency_key: "forbidden-submission",
      p_payload_hash: hash({ forbidden: true }),
      p_request: {},
      p_notifications: [],
    },
  );
  assert.ok(
    directSubmissionRpcError,
    "authenticated submission RPC execution must be denied",
  );
}

async function testAtomicConfiguration() {
  const businessName = `Atomic Business ${runId}`;
  const departmentName = `Atomic Department ${runId}`;
  const templateKey = `atomic-template-${runId}`;
  const configuration = {
    schemaVersion: 1,
    businessUnits: [{ name: businessName, isActive: true }],
    businessDepartments: [
      { businessName, name: departmentName, isActive: true },
    ],
    workflowTemplateVersions: [
      {
        templateKey,
        versionNumber: 1,
        name: `Atomic template ${runId}`,
        businessName,
        departmentName,
        graph: { nodes: [], edges: [] },
        documentRequirements: [],
        supportedLanguages: ["en"],
        templateSnapshot: {
          id: templateKey,
          name: `Atomic template ${runId}`,
        },
        isActive: true,
        isActiveVersion: true,
      },
    ],
  };

  const { data, error } = await clients.admin.rpc(
    "save_workspace_configuration",
    { p_configuration: configuration },
  );
  assert.ifError(error);
  assert.deepEqual(data, {
    schemaVersion: 1,
    businessUnits: 1,
    businessDepartments: 1,
    workflowTemplateVersions: 1,
  });

  const { error: nonAdminError } = await clients.actor.rpc(
    "save_workspace_configuration",
    { p_configuration: configuration },
  );
  assert.ok(nonAdminError, "non-admin configuration save must be denied");

  const rollbackBusiness = `Rollback Business ${runId}`;
  const { error: rollbackError } = await clients.admin.rpc(
    "save_workspace_configuration",
    {
      p_configuration: {
        schemaVersion: 1,
        businessUnits: [{ name: rollbackBusiness, isActive: true }],
        businessDepartments: [
          {
            businessName: `Missing Business ${runId}`,
            name: "Must roll back",
            isActive: true,
          },
        ],
        workflowTemplateVersions: [],
      },
    },
  );
  assert.ok(rollbackError, "invalid configuration must fail atomically");

  const { data: rolledBackRows, error: rolledBackReadError } = await service
    .from("business_units")
    .select("id")
    .eq("name", rollbackBusiness);
  assert.ifError(rolledBackReadError);
  assert.equal(rolledBackRows.length, 0);
}

async function testAtomicSubmission(templateFixture) {
  const requestNo = `PHASE1-SUBMIT-${runId}`;
  const submission = {
    requestNo,
    templateVersionId: templateFixture.workflow_template_version_id,
    title: `Atomic submission ${runId}`,
    status: "pending",
    dueLabel: "Tomorrow",
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    valueLabel: "HKD 2,000",
    currentStep: "Approval",
    currentNodeId: "approval-1",
    currentOwnerId: identities.actor.id,
    pendingNodeIds: ["approval-1"],
    pendingOwnerProfileIds: [identities.actor.id],
    pendingOwnerEmails: [identities.actor.email],
    completedNodeIds: ["start"],
    notifiedNodeIds: [],
    nodeDecisions: {},
    activeBranchId: "",
    extractedFields: { Amount: "2000" },
    participants: [identities.requester.email, identities.actor.email],
    participantProfileIds: [identities.requester.id, identities.actor.id],
    lastAction: "Submitted by authoritative API",
    taskSnapshot: { id: requestNo, status: "pending" },
  };
  const notifications = [
    {
      recipientProfileId: identities.actor.id,
      kind: "assigned",
      title: "New approval request",
      body: "An approval request was assigned.",
      href: `/?tab=queue&request=${requestNo}`,
      sendEmail: true,
      templateKey: "approval-assigned",
    },
  ];
  const idempotencyKey = `submission-${runId}`;
  const payloadHash = hash({ submission, notifications });
  const args = {
    p_actor_id: identities.requester.id,
    p_idempotency_key: idempotencyKey,
    p_payload_hash: payloadHash,
    p_request: submission,
    p_notifications: notifications,
  };

  const { data: applied, error: appliedError } = await service.rpc(
    "submit_approval_request",
    args,
  );
  assert.ifError(appliedError);
  assert.equal(applied.outcome, "applied");

  const { data: replayed, error: replayError } = await service.rpc(
    "submit_approval_request",
    args,
  );
  assert.ifError(replayError);
  assert.equal(replayed.outcome, "replayed");
  assert.equal(replayed.requestId, applied.requestId);

  const { data: conflict, error: conflictError } = await service.rpc(
    "submit_approval_request",
    { ...args, p_payload_hash: hash({ changed: true }) },
  );
  assert.ifError(conflictError);
  assert.equal(conflict.outcome, "idempotency_conflict");

  for (const [table, expected] of [
    ["approval_requests", 1],
    ["approval_submission_receipts", 1],
    ["approval_request_events", 1],
    ["approval_notifications", 1],
    ["approval_email_outbox", 1],
  ]) {
    const query = service.from(table).select("id", { count: "exact", head: true });
    const { count, error } =
      table === "approval_requests"
        ? await query.eq("request_no", requestNo)
        : table === "approval_submission_receipts"
          ? await query.eq("approval_request_id", applied.requestId)
          : await query.eq("approval_request_id", applied.requestId);
    assert.ifError(error);
    assert.equal(count, expected, table);
  }

  const rollbackRequestNo = `PHASE1-SUBMIT-ROLLBACK-${runId}`;
  const rollbackSubmission = {
    ...submission,
    requestNo: rollbackRequestNo,
    title: "Must roll back",
    taskSnapshot: { id: rollbackRequestNo, status: "pending" },
  };
  const { error: rollbackError } = await service.rpc("submit_approval_request", {
    p_actor_id: identities.requester.id,
    p_idempotency_key: `submission-rollback-${runId}`,
    p_payload_hash: hash({ rollbackSubmission }),
    p_request: rollbackSubmission,
    p_notifications: [
      {
        ...notifications[0],
        recipientProfileId: randomUUID(),
      },
    ],
  });
  assert.ok(rollbackError, "invalid notification must roll back submission");
  const { count: rollbackCount, error: rollbackReadError } = await service
    .from("approval_requests")
    .select("id", { count: "exact", head: true })
    .eq("request_no", rollbackRequestNo);
  assert.ifError(rollbackReadError);
  assert.equal(rollbackCount, 0);
}

async function testCommandSemantics(request) {
  const idempotencyKey = `apply-${runId}`;
  const args = commandArgs(request.request_no, 0, idempotencyKey, "approve", {
    p_next_state: {
      status: "approved",
      pendingNodeIds: [],
      pendingOwnerEmails: [],
      completedNodeIds: ["approval-1"],
      lastAction: "Approved by server",
      taskSnapshot: { id: request.request_no, status: "approved" },
    },
    p_event: {
      type: "approved",
      summary: "Approved by authoritative command.",
      details: { source: "phase-1-test" },
    },
    p_notifications: [
      {
        recipientProfileId: identities.requester.id,
        kind: "approved",
        title: "Request approved",
        body: "The request was approved.",
        href: `/?tab=tracking&request=${request.request_no}`,
        sendEmail: true,
        templateKey: "approval-update",
      },
    ],
  });

  const applied = await rpcCommand(args);
  assert.equal(applied.outcome, "applied");
  assert.equal(applied.currentVersion, 1);

  const replayed = await rpcCommand(args);
  assert.equal(replayed.outcome, "replayed");
  assert.equal(replayed.commandId, applied.commandId);
  assert.equal(replayed.eventId, applied.eventId);

  const conflict = await rpcCommand({
    ...args,
    p_payload_hash: hash({ changed: true }),
  });
  assert.equal(conflict.outcome, "idempotency_conflict");

  const stale = await rpcCommand(
    commandArgs(request.request_no, 0, `stale-${runId}`, "approve"),
  );
  assert.equal(stale.outcome, "stale");
  assert.equal(stale.currentVersion, 1);

  const invalidAction = await rpcCommand(
    commandArgs(request.request_no, 1, `action-${runId}`, "invented_action"),
  );
  assert.equal(invalidAction.outcome, "invalid_command");

  const invalidTarget = await rpcCommand(
    commandArgs(request.request_no, 1, `target-${runId}`, "delegate", {
      p_next_state: { currentOwnerId: randomUUID() },
    }),
  );
  assert.equal(invalidTarget.outcome, "invalid_target");

  const rollbackKey = `rollback-${runId}`;
  const rollbackArgs = commandArgs(
    request.request_no,
    1,
    rollbackKey,
    "request_correction",
    {
      p_next_state: { status: "returned", lastAction: "Must roll back" },
      p_notifications: [
        {
          recipientProfileId: randomUUID(),
          kind: "correction",
          title: "Correction required",
          body: "This recipient is invalid, so every write must roll back.",
        },
      ],
    },
  );
  const { error: rollbackError } = await service.rpc(
    "commit_approval_request_command",
    rollbackArgs,
  );
  assert.ok(rollbackError, "post-update failure must abort the command transaction");

  const { data: afterRollback, error: requestReadError } = await service
    .from("approval_requests")
    .select("state_version,status")
    .eq("id", request.id)
    .single();
  assert.ifError(requestReadError);
  assert.deepEqual(afterRollback, { state_version: 1, status: "approved" });

  const { count: receiptCount, error: receiptError } = await service
    .from("approval_command_receipts")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", request.id);
  assert.ifError(receiptError);
  assert.equal(receiptCount, 1);

  const { count: eventCount, error: eventCountError } = await service
    .from("approval_request_events")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", request.id);
  assert.ifError(eventCountError);
  assert.equal(eventCount, 1);

  const { count: notificationCount, error: notificationError } = await service
    .from("approval_notifications")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", request.id);
  assert.ifError(notificationError);
  assert.equal(notificationCount, 1);

  const { count: outboxCount, error: outboxError } = await service
    .from("approval_email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", request.id);
  assert.ifError(outboxError);
  assert.equal(outboxCount, 1);

  const { error: eventUpdateError } = await service
    .from("approval_request_events")
    .update({ detail: "mutated" })
    .eq("id", applied.eventId);
  assert.ok(eventUpdateError, "service-role event UPDATE must be denied");
}

async function testConcurrentWinner(request) {
  const approve = commandArgs(
    request.request_no,
    0,
    `race-approve-${runId}`,
    "approve",
    { p_next_state: { status: "approved", lastAction: "Race approve" } },
  );
  const reject = commandArgs(
    request.request_no,
    0,
    `race-reject-${runId}`,
    "reject",
    { p_next_state: { status: "returned", lastAction: "Race reject" } },
  );

  const [first, second] = await Promise.all([rpcCommand(approve), rpcCommand(reject)]);
  assert.deepEqual(
    [first.outcome, second.outcome].sort(),
    ["applied", "stale"],
  );

  const { data: current, error: currentError } = await service
    .from("approval_requests")
    .select("state_version,status")
    .eq("id", request.id)
    .single();
  assert.ifError(currentError);
  assert.equal(current.state_version, 1);
  assert.ok(["approved", "returned"].includes(current.status));

  const { count: receiptCount, error: receiptError } = await service
    .from("approval_command_receipts")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", request.id);
  assert.ifError(receiptError);
  assert.equal(receiptCount, 1);

  const { count: eventCount, error: eventError } = await service
    .from("approval_request_events")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", request.id);
  assert.ifError(eventError);
  assert.equal(eventCount, 1);
}

async function testNormalizedAssignmentTransitions(request) {
  const proposed = await rpcCommand(
    commandArgs(request.request_no, 0, `reassign-${runId}`, "reassign", {
      p_next_state: {
        currentOwnerId: identities.actor.id,
        pendingOwnerEmails: [identities.actor.email],
      },
      p_event: {
        type: "reassignment_requested",
        summary: "Reassignment proposed",
        targetProfileId: identities.target.id,
        details: {},
      },
    }),
  );
  assert.equal(proposed.outcome, "applied");

  const prematureApproval = await rpcCommand(
    commandArgs(request.request_no, 1, `premature-${runId}`, "approve", {
      p_actor_id: identities.target.id,
    }),
  );
  assert.equal(prematureApproval.outcome, "forbidden");

  const accepted = await rpcCommand(
    commandArgs(
      request.request_no,
      1,
      `accept-${runId}`,
      "accept_reassignment",
      {
        p_actor_id: identities.target.id,
        p_next_state: {
          status: "reassigned",
          currentOwnerId: identities.target.id,
          pendingOwnerEmails: [identities.target.email],
        },
        p_event: {
          type: "reassignment_accepted",
          summary: "Reassignment accepted",
          details: {},
        },
      },
    ),
  );
  assert.equal(accepted.outcome, "applied");

  const { data: assignments, error: assignmentsError } = await service
    .from("approval_request_assignments")
    .select("assignee_id,assignment_type,status")
    .eq("approval_request_id", request.id);
  assert.ifError(assignmentsError);
  assert.ok(
    assignments.some(
      (row) =>
        row.assignee_id === identities.target.id &&
        row.assignment_type === "reassignment" &&
        row.status === "accepted",
    ),
  );
  assert.ok(
    assignments.some(
      (row) =>
        row.assignee_id === identities.target.id &&
        row.assignment_type === "owner" &&
        row.status === "active",
    ),
  );
  assert.ok(
    assignments.some(
      (row) =>
        row.assignee_id === identities.actor.id &&
        row.assignment_type === "owner" &&
        row.status === "completed",
    ),
  );

  const { data: targetVisible, error: targetVisibleError } = await clients.target
    .from("approval_requests")
    .select("request_no,state_version,current_owner_id")
    .eq("id", request.id);
  assert.ifError(targetVisibleError);
  assert.equal(targetVisible.length, 1);
  assert.equal(targetVisible[0].state_version, 2);
  assert.equal(targetVisible[0].current_owner_id, identities.target.id);
}

function commandArgs(requestNo, expectedVersion, idempotencyKey, action, overrides = {}) {
  const payload = {
    requestNo,
    expectedVersion,
    idempotencyKey,
    action,
    nextState: overrides.p_next_state || {},
    event: overrides.p_event || {
      type: action,
      summary: `${action} from Phase 1 test`,
      details: {},
    },
    notifications: overrides.p_notifications || [],
  };
  return {
    p_request_no: requestNo,
    p_actor_id: identities.actor.id,
    p_idempotency_key: idempotencyKey,
    p_action: action,
    p_payload_hash: hash(payload),
    p_expected_state_version: expectedVersion,
    p_next_state: payload.nextState,
    p_event: payload.event,
    p_notifications: payload.notifications,
    ...overrides,
  };
}

async function rpcCommand(args) {
  const { data, error } = await service.rpc(
    "commit_approval_request_command",
    args,
  );
  assert.ifError(error);
  return data;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
