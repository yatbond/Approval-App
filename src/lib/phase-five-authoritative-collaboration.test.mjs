import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvalCollaborationCommandSchema } from "./approval-collaboration-contracts.ts";
import { getAvailableApprovalActions } from "./approval-runtime.ts";
import { getTaskContributorUploadState } from "./task-collaboration-state.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const task = {
  id: "APR-PHASE5",
  title: "Phase 5",
  workflow: "Approval",
  requester: "Requester",
  requesterEmail: "requester@example.com",
  department: "Finance",
  status: "pending",
  due: "Tomorrow",
  value: "",
  currentStep: "Approval",
  currentOwner: "owner@example.com",
  pendingOwners: ["owner@example.com"],
  participants: ["requester@example.com", "owner@example.com"],
  lastAction: "Submitted",
  extractedFields: {},
  auditTrail: [],
};
const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  fullName: "Owner",
  role: "approver",
  isAdmin: false,
  isActive: true,
};

test("collaboration contracts reject client authority and snapshots", () => {
  const valid = {
    action: "request_contributor",
    expectedVersion: 0,
    idempotencyKey: "phase5-command",
    targetProfileId: "22222222-2222-4222-8222-222222222222",
    requestNote: "Provide the schedule.",
    blocksApproval: true,
  };
  assert.equal(approvalCollaborationCommandSchema.safeParse(valid).success, true);
  for (const field of ["actor", "actorEmail", "timestamp", "task", "nextState"]) {
    assert.equal(
      approvalCollaborationCommandSchema.safeParse({ ...valid, [field]: "forged" }).success,
      false,
      field,
    );
  }
  const shared = {
    action: "submit_shared_fulfillment",
    expectedVersion: 0,
    idempotencyKey: "phase5-shared-command",
    requirementNodeId: "submit-target",
    documentId: "document-1",
    assignedSubmitterProfileId: "22222222-2222-4222-8222-222222222222",
    attachment: {
      key: "attachment-1",
      fileName: "support.txt",
      documentId: "document-1",
      documentType: "Support",
      workflowNodeId: "submit-target",
      format: "text",
      storagePath: "11111111-1111-4111-8111-111111111111/phase5/support.txt",
    },
    extractedFields: {},
  };
  assert.equal(approvalCollaborationCommandSchema.safeParse(shared).success, true);
  assert.equal(
    approvalCollaborationCommandSchema.safeParse({ ...shared, required: false }).success,
    false,
  );
  assert.equal(
    approvalCollaborationCommandSchema.safeParse({
      ...shared,
      requiresConfirmation: false,
    }).success,
    false,
  );
});

test("required collaboration blocks approval but preserves correction actions", () => {
  const blocked = {
    ...task,
    collaborationRequests: [
      {
        id: "collab-1",
        contributorName: "Contributor",
        contributorEmail: "contributor@example.com",
        requestedByName: "Owner",
        requestedByEmail: owner.email,
        requestNote: "Provide input",
        dueAt: "",
        blocksApproval: true,
        status: "requested",
        createdAt: "2026-07-20 12:00",
      },
    ],
  };
  assert.deepEqual(getAvailableApprovalActions(blocked, owner), [
    "reject",
    "reject_with_comment",
    "reassign",
    "delegate",
  ]);
});

test("only the requested contributor can submit contributor input", () => {
  const requested = {
    ...task,
    collaborationRequests: [
      {
        id: "collab-1",
        contributorName: "Contributor",
        contributorEmail: "contributor@example.com",
        requestedByName: "Owner",
        requestedByEmail: owner.email,
        requestNote: "Provide input",
        dueAt: "",
        blocksApproval: true,
        status: "requested",
        createdAt: "2026-07-20 12:00",
      },
    ],
  };
  const result = getTaskContributorUploadState({
    task: requested,
    collaborationRequestId: "collab-1",
    actor: { name: "Unrelated", email: "unrelated@example.com" },
    attachment: {
      id: "attachment-1",
      fileName: "input.txt",
      documentType: "Contributor upload",
      format: "ad_hoc",
      uploadedBy: "unrelated@example.com",
      uploadedAt: new Date().toISOString(),
    },
    extractedFields: {},
  });
  assert.equal(result.didApply, false);
  assert.equal(result.errorMessage, "You cannot submit this contributor request.");
});

test("collaboration writes are versioned server commands and the legacy endpoint is retired", () => {
  const route = read("../app/api/approval-requests/[requestNo]/collaboration/route.ts");
  const legacy = read("../app/api/workflow-collaboration/route.ts");
  const server = read("./approval-server-data.ts");
  const client = read("./approval-collaboration-client.ts");
  const migration = read(
    "../../supabase/migrations/20260719150248_authoritative_runtime_foundation.sql",
  );
  assert.match(route, /approvalCollaborationCommandSchema/);
  assert.match(route, /executeApprovalCollaborationCommand/);
  assert.match(legacy, /legacy_endpoint_retired/);
  assert.doesNotMatch(legacy, /saveCollaborationMirrorState/);
  assert.match(server, /commit_approval_request_command/);
  assert.match(server, /collaborationState/);
  assert.match(client, /expectedVersion/);
  assert.doesNotMatch(client, /actorEmail|timestamp|nextState/);
  assert.match(migration, /insert into public\.workflow_collaboration_requests/);
  assert.match(migration, /insert into public\.workflow_shared_fulfillments/);
  assert.match(migration, /insert into public\.workflow_correction_requests/);
  assert.match(migration, /insert into public\.approval_request_attachments/);
});

test("delegation has expiry and authoritative revocation", () => {
  const contracts = read("./approval-api-contracts.ts");
  const runtime = read("./approval-runtime.ts");
  const migration = read(
    "../../supabase/migrations/20260719150248_authoritative_runtime_foundation.sql",
  );
  assert.match(contracts, /revoke_delegation/);
  assert.match(contracts, /expiresAt/);
  assert.match(runtime, /delegationExpiresAt/);
  assert.match(migration, /assignmentExpiresAt/);
  assert.match(migration, /expires_at/);
});

test("admin directory is searchable and keyset paginated without client truncation", () => {
  const hook = read("../app/use-authoritative-admin-directory.ts");
  const view = read("../app/admin-view.tsx");
  const server = read("./approval-server-data.ts");
  assert.match(hook, /\/api\/directory/);
  assert.match(hook, /limit:\s*"50"/);
  assert.match(hook, /nextCursor/);
  assert.match(view, /Search by name or email/);
  assert.match(view, /Load next 50 users/);
  assert.match(server, /builder\.gt\("email", cursorEmail\)/);
  assert.doesNotMatch(view, /userDirectory\.slice/);
});

test("effective roles come from normalized active scoped assignments", () => {
  const context = read("./approval-server.ts");
  const me = read("../app/api/me/route.ts");
  const migration = read(
    "../../supabase/migrations/20260719150248_authoritative_runtime_foundation.sql",
  );
  assert.match(context, /approval_scoped_role_assignments/);
  assert.match(context, /effectiveRoles/);
  assert.match(me, /actor\.effectiveRoles/);
  assert.match(migration, /create table if not exists public\.approval_scoped_role_assignments/);
  assert.match(migration, /role = 'superuser'/);
  assert.match(migration, /expires_at is null or .*expires_at > statement_timestamp/);
});

test("workflow publish and request submission reject unresolved directory targets", () => {
  const workflow = read("../app/workflow-view.tsx");
  const workspace = read("../app/api/workspace/route.ts");
  const client = read("./approval-client.ts");
  const server = read("./approval-server-data.ts");
  const submission = read(
    "../../supabase/migrations/20260720000500_authoritative_request_submission.sql",
  );
  assert.match(workflow, /validateActiveDirectoryEmails\(assignmentEmails\)/);
  assert.match(workflow, /Cannot publish/);
  assert.match(client, /resolveDirectoryProfileId/);
  assert.match(workspace, /validate_active_directory_emails/);
  assert.match(workspace, /Published workflow assignment is inactive or missing/);
  assert.match(server, /profiles\.length !== participantEmails\.length/);
  assert.match(submission, /return jsonb_build_object\('outcome', 'invalid_target'\)/);
  assert.match(
    read("../../supabase/migrations/20260719150248_authoritative_runtime_foundation.sql"),
    /inactive or missing template assignment/,
  );
});

test("shared fulfillment policy is template-derived and available in the real UI", () => {
  const contracts = read("./approval-collaboration-contracts.ts");
  const server = read("./approval-server-data.ts");
  const panel = read("../app/task-detail-panels.tsx");
  const actions = read("../app/use-workspace-task-actions.ts");
  assert.doesNotMatch(contracts, /required:\s*z\.boolean|requiresConfirmation:\s*z\.boolean/);
  assert.match(server, /node\.allowSharedFulfillment === true/);
  assert.match(server, /documentType: document\.documentType/);
  assert.match(server, /required: document\.required/);
  assert.match(panel, /Fulfill \{item\.label\} for \{item\.assignedEmail\}/);
  assert.match(actions, /submitSharedFulfillmentUpload/);
});

test("action, collaboration, and submission targets are constrained to request scope", () => {
  const server = read("./approval-server-data.ts");
  assert.match(server, /function isProfileInTaskScope/);
  assert.ok((server.match(/isProfileInTaskScope\(/g) || []).length >= 4);
  assert.match(server, /profile\.departmentId &&/);
  assert.match(server, /profile\.departmentName/);
});
