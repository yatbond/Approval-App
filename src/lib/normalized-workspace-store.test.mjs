import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deactivateWorkspaceAdminRecord,
  loadNormalizedWorkspaceState,
  saveNormalizedWorkspaceState,
} from "./normalized-workspace-store.ts";

const user = {
  id: "user-1",
  email: "mandy@example.com",
};

const template = {
  id: "template-finance",
  name: "Finance invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice PDF"],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [{ id: "start", kind: "start", label: "Start", x: 0, y: 0 }],
    edges: [],
  },
};

function createSnapshot(overrides = {}) {
  return {
    selectedTemplateId: "template-finance",
    businessDirectory: [
      {
        id: "business-aai",
        name: "Asia Allied Infrastructure",
        departments: ["Finance"],
      },
    ],
    workflowTemplates: [template],
    approvalTasks: [
      {
        id: "APR-1",
        title: "Invoice approval",
        workflow: "Finance invoice approval",
        workflowTemplateId: "template-finance",
        workflowTemplateVersion: 1,
        requester: "Mandy Chan",
        requesterEmail: "mandy@example.com",
        department: "Finance",
        status: "pending",
        due: "24h",
        value: "HKD 8,400",
        currentStep: "Review 1",
        currentOwner: "reviewer@example.com",
        participants: ["mandy@example.com", "reviewer@example.com"],
        lastAction: "Submitted",
        extractedFields: {},
        auditTrail: [],
      },
    ],
    userRoleAssignments: [],
    ...overrides,
  };
}

test("does not deactivate directory rows during a general workspace save", async () => {
  const supabase = new FakeSupabase({
    business_units: [
      { id: "business-kept-db", name: "Asia Allied Infrastructure", is_active: true },
      { id: "business-other-db", name: "Other Workspace Business", is_active: true },
    ],
    business_departments: [
      {
        id: "dept-other-db",
        business_unit_id: "business-other-db",
        name: "Other Department",
        is_active: true,
      },
    ],
    workflow_template_versions: [
      {
        id: "template-other-db",
        template_key: "template-other",
        version_number: 1,
        is_active: true,
      },
    ],
  });

  await saveNormalizedWorkspaceState(supabase, createSnapshot(), user);

  assert.equal(
    supabase.operations.some(
      (operation) =>
        operation.type === "update" &&
        operation.payload.is_active === false,
    ),
    false,
  );
});

test("throws instead of dropping approval requests that have no normalized template", async () => {
  const snapshot = createSnapshot({
    workflowTemplates: [],
    approvalTasks: [
      {
        ...createSnapshot().approvalTasks[0],
        workflowTemplateId: "template-deleted",
        workflowTemplateVersion: 1,
      },
    ],
  });

  await assert.rejects(
    () => saveNormalizedWorkspaceState(new FakeSupabase(), snapshot, user),
    /APR-1.*missing workflow template/i,
  );
});

test("does not mutate normalized tables when request template preflight fails", async () => {
  const supabase = new FakeSupabase({
    business_units: [
      { id: "business-old-db", name: "Old Business", is_active: true },
    ],
    workflow_template_versions: [
      {
        id: "template-old-db",
        template_key: "template-old",
        version_number: 1,
        is_active: true,
      },
    ],
  });
  const snapshot = createSnapshot({
    workflowTemplates: [],
    approvalTasks: [
      {
        ...createSnapshot().approvalTasks[0],
        workflowTemplateId: "template-deleted",
      },
    ],
  });

  await assert.rejects(
    () => saveNormalizedWorkspaceState(supabase, snapshot, user),
    /APR-1.*missing workflow template/i,
  );

  assert.deepEqual(supabase.operations, []);
});

test("does not write normalized rows when the workspace snapshot is empty", async () => {
  const supabase = new FakeSupabase();

  await saveNormalizedWorkspaceState(
    supabase,
    createSnapshot({
      selectedTemplateId: "",
      businessDirectory: [],
      workflowTemplates: [],
      approvalTasks: [],
    }),
    user,
  );

  assert.deepEqual(supabase.operations, []);
});

test("skips department writes when business upsert returns no database ids", async () => {
  const supabase = new FakeSupabase({}, { emptyUpsertTables: ["business_units"] });

  await saveNormalizedWorkspaceState(
    supabase,
    createSnapshot({
      workflowTemplates: [],
      approvalTasks: [],
    }),
    user,
  );

  assert.deepEqual(
    supabase.operations.map((operation) => ({
      type: operation.type,
      table: operation.table,
    })),
    [{ type: "upsert", table: "business_units" }],
  );
});

test("saves approval request audit events and attachments to child tables", async () => {
  const supabase = new FakeSupabase();
  const snapshot = createSnapshot({
    approvalTasks: [
      {
        ...createSnapshot().approvalTasks[0],
        auditTrail: [
          {
            id: "APR-1-event-1",
            action: "submitted",
            actor: "Mandy Chan",
            actorEmail: "mandy@example.com",
            timestamp: "2026-06-27T08:00:00.000Z",
            detail: "Request submitted.",
            targetEmail: "reviewer@example.com",
          },
        ],
        attachments: [
          {
            id: "attachment-1",
            fileName: "invoice.pdf",
            documentId: "invoice-doc",
            documentType: "Invoice PDF",
            format: "pdf",
            workflowNodeId: "review-1",
            storagePath: "requests/APR-1/invoice.pdf",
            uploadedBy: "mandy@example.com",
            uploadedAt: "2026-06-27T08:01:00.000Z",
          },
        ],
      },
    ],
  });

  await saveNormalizedWorkspaceState(supabase, snapshot, user);

  const eventUpsert = supabase.operations.find(
    (operation) => operation.table === "approval_request_events",
  );
  const attachmentUpsert = supabase.operations.find(
    (operation) => operation.table === "approval_request_attachments",
  );

  assert.deepEqual(eventUpsert.payload, [
    {
      approval_request_id: "request-1",
      event_key: "APR-1-event-1",
      action: "submitted",
      actor_name: "Mandy Chan",
      actor_id: "user-1",
      actor_email: "mandy@example.com",
      detail: "Request submitted.",
      target_email: "reviewer@example.com",
      created_at: "2026-06-27T08:00:00.000Z",
    },
  ]);
  assert.deepEqual(attachmentUpsert.payload, [
    {
      approval_request_id: "request-1",
      attachment_key: "attachment-1",
      file_name: "invoice.pdf",
      document_id: "invoice-doc",
      document_type: "Invoice PDF",
      document_format: "pdf",
      workflow_node_id: "review-1",
      storage_path: "requests/APR-1/invoice.pdf",
      uploaded_by: "user-1",
      uploaded_by_email: "mandy@example.com",
      created_at: "2026-06-27T08:01:00.000Z",
    },
  ]);
});

test("uses the same archived template key for historical requests and template FKs", async () => {
  const archivedSnapshot = {
    ...template,
    id: "template-snapshot-id",
    name: "Archived finance approval",
  };
  const supabase = new FakeSupabase();
  const snapshot = createSnapshot({
    workflowTemplates: [],
    approvalTasks: [
      {
        ...createSnapshot().approvalTasks[0],
        workflow: "Archived finance approval",
        workflowTemplateId: "template-request-id",
        workflowTemplateVersion: 2,
        workflowTemplateSnapshot: archivedSnapshot,
      },
    ],
  });

  await saveNormalizedWorkspaceState(supabase, snapshot, user);

  const templateUpsert = supabase.operations.find(
    (operation) =>
      operation.type === "upsert" &&
      operation.table === "workflow_template_versions",
  );
  const requestUpsert = supabase.operations.find(
    (operation) =>
      operation.type === "upsert" &&
      operation.table === "approval_requests",
  );

  assert.equal(templateUpsert.payload[0].template_key, "template-request-id");
  assert.equal(templateUpsert.payload[0].is_active, false);
  assert.equal(requestUpsert.payload[0].workflow_template_version_id, "template-1");
});

test("saves workflow version activation and comments to dedicated template columns", async () => {
  const supabase = new FakeSupabase();
  const snapshot = createSnapshot({
    workflowTemplates: [
      {
        ...template,
        version: 1,
        isDraft: false,
        isActiveVersion: true,
        versionComment: "Current finance routing.",
      },
    ],
  });

  await saveNormalizedWorkspaceState(supabase, snapshot, user);

  const templateUpsert = supabase.operations.find(
    (operation) =>
      operation.type === "upsert" &&
      operation.table === "workflow_template_versions",
  );

  assert.equal(templateUpsert.payload[0].is_active_version, true);
  assert.equal(templateUpsert.payload[0].version_comment, "Current finance routing.");
});

test("soft-deactivates a business and its departments through an explicit admin action", async () => {
  const supabase = new FakeSupabase({
    business_units: [
      { id: "business-aai-db", name: "Asia Allied Infrastructure", is_active: true },
    ],
    business_departments: [
      {
        id: "dept-finance-db",
        business_unit_id: "business-aai-db",
        name: "Finance",
        is_active: true,
      },
    ],
  });

  await deactivateWorkspaceAdminRecord(supabase, {
    type: "business",
    businessId: "business-aai-db",
  });

  assert.equal(supabase.rows.business_units[0].is_active, false);
  assert.equal(supabase.rows.business_departments[0].is_active, false);
  assert.deepEqual(
    supabase.operations.map((operation) => operation.type),
    ["update", "update"],
  );
});

test("soft-deactivates a department through an explicit admin action", async () => {
  const supabase = new FakeSupabase({
    business_departments: [
      {
        id: "dept-finance-db",
        business_unit_id: "business-aai-db",
        name: "Finance",
        is_active: true,
      },
    ],
  });

  await deactivateWorkspaceAdminRecord(supabase, {
    type: "department",
    businessId: "business-aai-db",
    departmentName: "Finance",
  });

  assert.equal(supabase.rows.business_departments[0].is_active, false);
  assert.equal(supabase.operations[0].table, "business_departments");
  assert.deepEqual(supabase.operations[0].filters, [
    { type: "eq", column: "business_unit_id", value: "business-aai-db" },
    { type: "eq", column: "name", value: "Finance" },
  ]);
});

test("soft-deactivates a workflow template version through an explicit admin action", async () => {
  const supabase = new FakeSupabase({
    workflow_template_versions: [
      {
        id: "template-finance-db",
        template_key: "template-finance",
        version_number: 3,
        is_active: true,
      },
    ],
  });

  await deactivateWorkspaceAdminRecord(supabase, {
    type: "template",
    templateKey: "template-finance",
    versionNumber: 3,
  });

  assert.equal(supabase.rows.workflow_template_versions[0].is_active, false);
  assert.equal(supabase.operations[0].table, "workflow_template_versions");
  assert.deepEqual(supabase.operations[0].filters, [
    { type: "eq", column: "template_key", value: "template-finance" },
    { type: "eq", column: "version_number", value: 3 },
  ]);
});

test("rejects business deactivation when no business row is updated", async () => {
  const supabase = new FakeSupabase({
    business_departments: [
      {
        id: "dept-finance-db",
        business_unit_id: "business-aai-db",
        name: "Finance",
        is_active: true,
      },
    ],
  });

  await assert.rejects(
    () =>
      deactivateWorkspaceAdminRecord(supabase, {
        type: "business",
        businessId: "missing-business",
      }),
    /No active business matched/i,
  );

  assert.equal(supabase.rows.business_departments[0].is_active, true);
});

test("rejects department deactivation when no department row is updated", async () => {
  const supabase = new FakeSupabase({
    business_departments: [
      {
        id: "dept-finance-db",
        business_unit_id: "business-aai-db",
        name: "Finance",
        is_active: true,
      },
    ],
  });

  await assert.rejects(
    () =>
      deactivateWorkspaceAdminRecord(supabase, {
        type: "department",
        businessId: "business-aai-db",
        departmentName: "Legal",
      }),
    /No active department matched/i,
  );
});

test("rejects template deactivation when no template version row is updated", async () => {
  const supabase = new FakeSupabase({
    workflow_template_versions: [
      {
        id: "template-finance-db",
        template_key: "template-finance",
        version_number: 3,
        is_active: true,
      },
    ],
  });

  await assert.rejects(
    () =>
      deactivateWorkspaceAdminRecord(supabase, {
        type: "template",
        templateKey: "template-finance",
        versionNumber: 4,
      }),
    /No active template version matched/i,
  );
});

test("returns null when normalized load has no templates or requests", async () => {
  assert.equal(await loadNormalizedWorkspaceState(new FakeSupabase()), null);
});

test("restores template version numbers from normalized template rows", async () => {
  const supabase = new FakeSupabase({
    workflow_template_versions: [
      {
        id: "template-finance-db",
        template_key: "template-finance",
        version_number: 3,
        name: "Finance invoice approval",
        graph: template.graph,
        document_requirements: [],
        supported_languages: ["English"],
        template_snapshot: template,
        business_units: { name: "Asia Allied Infrastructure" },
        business_departments: { name: "Finance" },
        is_active: true,
      },
    ],
  });

  const snapshot = await loadNormalizedWorkspaceState(supabase, "template-finance");

  assert.equal(snapshot.workflowTemplates[0].version, 3);
});

test("restores workflow version activation and comments from dedicated columns", async () => {
  const supabase = new FakeSupabase({
    workflow_template_versions: [
      {
        id: "template-finance-db",
        template_key: "template-finance",
        version_number: 3,
        name: "Finance invoice approval",
        graph: template.graph,
        document_requirements: [],
        supported_languages: ["English"],
        template_snapshot: {
          ...template,
          isActiveVersion: false,
          versionComment: "Stale snapshot note",
        },
        business_units: { name: "Asia Allied Infrastructure" },
        business_departments: { name: "Finance" },
        is_active: true,
        is_active_version: true,
        version_comment: "Column note wins.",
      },
    ],
  });

  const snapshot = await loadNormalizedWorkspaceState(supabase, "template-finance");

  assert.equal(snapshot.workflowTemplates[0].isActiveVersion, true);
  assert.equal(snapshot.workflowTemplates[0].versionComment, "Column note wins.");
});

test("loads inactive workflow template rows as archived library items", async () => {
  const supabase = new FakeSupabase({
    workflow_template_versions: [
      {
        id: "template-active-db",
        template_key: "template-active",
        version_number: 1,
        name: "Active approval",
        graph: template.graph,
        document_requirements: [],
        supported_languages: ["English"],
        template_snapshot: {
          ...template,
          id: "template-active",
          name: "Active approval",
        },
        business_units: { name: "Asia Allied Infrastructure" },
        business_departments: { name: "Finance" },
        is_active: true,
      },
      {
        id: "template-archived-db",
        template_key: "template-archived",
        version_number: 1,
        name: "Archived approval",
        graph: template.graph,
        document_requirements: [],
        supported_languages: ["English"],
        template_snapshot: {
          ...template,
          id: "template-archived",
          name: "Archived approval",
        },
        business_units: { name: "Asia Allied Infrastructure" },
        business_departments: { name: "Finance" },
        is_active: false,
      },
    ],
  });

  const snapshot = await loadNormalizedWorkspaceState(supabase, "template-active");

  assert.deepEqual(
    snapshot.workflowTemplates.map((item) => ({
      id: item.id,
      isArchived: item.isArchived,
    })),
    [
      { id: "template-active", isArchived: undefined },
      { id: "template-archived", isArchived: true },
    ],
  );
});

test("restores directory rows, event targets, and attachment metadata from normalized rows", async () => {
  const task = createSnapshot().approvalTasks[0];
  const supabase = new FakeSupabase({
    business_units: [
      { id: "business-aai-db", name: "Asia Allied Infrastructure", is_active: true },
    ],
    business_departments: [
      {
        id: "dept-finance-db",
        business_unit_id: "business-aai-db",
        name: "Finance",
        is_active: true,
      },
    ],
    workflow_template_versions: [
      {
        id: "template-finance-db",
        template_key: "template-finance",
        version_number: 2,
        name: "Finance invoice approval",
        graph: template.graph,
        document_requirements: [],
        supported_languages: ["English", "Chinese"],
        template_snapshot: {
          ...template,
          business: "",
          department: "",
          fields: [{ name: "Total", instructions: "Extract total" }],
        },
        business_units: { name: "Asia Allied Infrastructure" },
        business_departments: { name: "Finance" },
        is_active: true,
      },
    ],
    approval_requests: [
      {
        id: "request-1",
        request_no: "APR-1",
        requester_name: task.requester,
        requester_email: task.requesterEmail,
        title: task.title,
        workflow_name: task.workflow,
        department_name: task.department,
        status: task.status,
        due_label: task.due,
        due_at: "2026-06-27T10:00:00.000Z",
        value_label: task.value,
        current_step: task.currentStep,
        current_node_id: "review-1",
        current_owner_email: task.currentOwner,
        pending_node_ids: ["review-1"],
        pending_owner_emails: ["reviewer@example.com"],
        completed_node_ids: ["start"],
        notified_node_ids: ["fyi-1"],
        node_decisions: { "review-1": "approved" },
        active_branch_id: "case-high",
        extracted_fields: { Total: "HKD 8,400" },
        participants: task.participants,
        last_action: task.lastAction,
        task_snapshot: {
          ...task,
          currentNodeId: "",
          pendingNodeIds: [],
          attachments: [],
          auditTrail: [],
        },
        workflow_template_versions: {
          template_key: "template-finance",
          version_number: 2,
        },
      },
    ],
    approval_request_events: [
      {
        approval_request_id: "request-1",
        event_key: "APR-1-event-1",
        action: "assigned",
        actor_name: "System",
        actor_email: "system@example.com",
        detail: "Assigned to reviewer.",
        target_email: "reviewer@example.com",
        created_at: "2026-06-27T09:00:00.000Z",
      },
    ],
    approval_request_attachments: [
      {
        approval_request_id: "request-1",
        attachment_key: "attachment-1",
        file_name: "invoice.pdf",
        document_id: "invoice-doc",
        document_type: "Invoice PDF",
        document_format: "pdf",
        workflow_node_id: "review-1",
        storage_path: "requests/APR-1/invoice.pdf",
        uploaded_by_email: "mandy@example.com",
        created_at: "2026-06-27T08:55:00.000Z",
      },
    ],
  });

  const snapshot = await loadNormalizedWorkspaceState(supabase, "template-finance");

  assert.deepEqual(snapshot.businessDirectory, [
    {
      id: "business-aai-db",
      name: "Asia Allied Infrastructure",
      departments: ["Finance"],
    },
  ]);
  assert.equal(snapshot.workflowTemplates[0].version, 2);
  assert.equal(snapshot.approvalTasks[0].auditTrail[0].targetEmail, "reviewer@example.com");
  assert.equal(snapshot.approvalTasks[0].attachments[0].workflowNodeId, "review-1");
  assert.equal(snapshot.approvalTasks[0].attachments[0].storagePath, "requests/APR-1/invoice.pdf");
});

test("hydrates collaboration state from mirror tables during normalized load", async () => {
  const task = createSnapshot().approvalTasks[0];
  const supabase = new FakeSupabase({
    workflow_template_versions: [
      {
        id: "template-finance-db",
        template_key: "template-finance",
        version_number: 1,
        name: "Finance invoice approval",
        graph: template.graph,
        document_requirements: [],
        supported_languages: ["English"],
        template_snapshot: template,
        business_units: { name: "Asia Allied Infrastructure" },
        business_departments: { name: "Finance" },
        is_active: true,
      },
    ],
    approval_requests: [
      {
        id: "request-1",
        request_no: "APR-1",
        requester_name: task.requester,
        requester_email: task.requesterEmail,
        title: task.title,
        workflow_name: task.workflow,
        department_name: task.department,
        status: task.status,
        due_label: task.due,
        due_at: null,
        value_label: task.value,
        current_step: task.currentStep,
        current_node_id: null,
        current_owner_email: task.currentOwner,
        pending_node_ids: [],
        pending_owner_emails: [],
        completed_node_ids: [],
        notified_node_ids: [],
        node_decisions: {},
        active_branch_id: null,
        extracted_fields: task.extractedFields,
        participants: task.participants,
        last_action: task.lastAction,
        task_snapshot: task,
      },
    ],
    workflow_collaboration_requests: [
      {
        approval_request_no: "APR-1",
        payload: null,
      },
      {
        approval_request_no: "APR-1",
        payload: ["not", "an", "object"],
      },
      {
        approval_request_no: "APR-1",
        payload: {
          id: "APR-1-collab-1",
          contributorName: "Site Team",
          contributorEmail: "site@example.com",
          requestedByName: "Reviewer",
          requestedByEmail: "reviewer@example.com",
          requestNote: "Upload site confirmation.",
          dueAt: "",
          blocksApproval: true,
          status: "requested",
          createdAt: "2026-06-26T10:00:00.000Z",
        },
      },
    ],
    workflow_shared_fulfillments: [
      {
        approval_request_no: "APR-1",
        payload: {
          id: "shared-1",
          taskId: "APR-1",
          requirementNodeId: "review-1",
          documentId: "site-confirmation",
          documentType: "Site confirmation",
          assignedSubmitterEmail: "site@example.com",
          assignedSubmitterName: "Site Team",
          uploaderEmail: "uploader@example.com",
          uploaderName: "Uploader",
          attachmentId: "attachment-1",
          required: true,
          status: "pending_confirmation",
          submittedAt: "2026-06-26T10:05:00.000Z",
        },
      },
    ],
    workflow_correction_requests: [
      {
        approval_request_no: "APR-1",
        payload: {
          id: "correction-1",
          taskId: "APR-1",
          sharedFulfillmentId: "shared-1",
          requestedByEmail: "reviewer@example.com",
          requestedByName: "Reviewer",
          assignedSubmitterEmail: "site@example.com",
          uploaderEmail: "uploader@example.com",
          rejectionNote: "Wrong document.",
          status: "requested",
          blocksApproval: true,
          createdAt: "2026-06-26T10:10:00.000Z",
        },
      },
    ],
  });

  const snapshot = await loadNormalizedWorkspaceState(supabase, "template-finance");
  const restoredTask = snapshot.approvalTasks[0];

  assert.equal(restoredTask.collaborationRequests[0].contributorEmail, "site@example.com");
  assert.equal(restoredTask.sharedFulfillments[0].status, "pending_confirmation");
  assert.equal(restoredTask.correctionRequests[0].rejectionNote, "Wrong document.");
});

class FakeSupabase {
  constructor(seed = {}, options = {}) {
    this.rows = {
      business_units: [],
      business_departments: [],
      workflow_template_versions: [],
      approval_requests: [],
      approval_request_events: [],
      approval_request_attachments: [],
      ...seed,
    };
    this.options = options;
    this.operations = [];
    this.nextIds = new Map();
  }

  from(table) {
    return new FakeQuery(this, table);
  }

  select(table, filters) {
    return (this.rows[table] || []).filter((row) =>
      filters.every((filter) => {
        if (filter.type === "eq") {
          return row[filter.column] === filter.value;
        }
        return filter.values.includes(row[filter.column]);
      }),
    );
  }

  upsert(table, payload, options) {
    const rows = Array.isArray(payload) ? payload : [payload];
    this.operations.push({ type: "upsert", table, payload: rows, options });
    if (this.options.emptyUpsertTables?.includes(table)) {
      return [];
    }
    return rows.map((row) => this.upsertRow(table, row));
  }

  update(table, payload, filters) {
    this.operations.push({ type: "update", table, payload, filters });
    let count = 0;
    for (const row of this.select(table, filters)) {
      Object.assign(row, payload);
      count += 1;
    }
    return count;
  }

  upsertRow(table, row) {
    if (table === "business_units") {
      return this.upsertUnique(table, row, (item) => item.name === row.name, {
        id: this.existingId(table, (item) => item.name === row.name) || this.createId("business"),
        name: row.name,
        is_active: row.is_active,
      });
    }

    if (table === "business_departments") {
      return this.upsertUnique(
        table,
        row,
        (item) =>
          item.business_unit_id === row.business_unit_id && item.name === row.name,
        {
          id:
            this.existingId(
              table,
              (item) =>
                item.business_unit_id === row.business_unit_id && item.name === row.name,
            ) || this.createId("department"),
          business_unit_id: row.business_unit_id,
          name: row.name,
          is_active: row.is_active,
        },
      );
    }

    if (table === "workflow_template_versions") {
      return this.upsertUnique(
        table,
        row,
        (item) =>
          item.template_key === row.template_key &&
          item.version_number === row.version_number,
        {
          id:
            this.existingId(
              table,
              (item) =>
                item.template_key === row.template_key &&
                item.version_number === row.version_number,
            ) || this.createId("template"),
          template_key: row.template_key,
          version_number: row.version_number,
          is_active: row.is_active,
        },
      );
    }

    if (table === "approval_requests") {
      return this.upsertUnique(
        table,
        row,
        (item) => item.request_no === row.request_no,
        {
          id:
            this.existingId(table, (item) => item.request_no === row.request_no) ||
            this.createId("request"),
          request_no: row.request_no,
        },
      );
    }

    return row;
  }

  upsertUnique(table, payload, matches, row) {
    const existing = (this.rows[table] || []).find(matches);
    if (existing) {
      Object.assign(existing, payload);
      return { ...existing, ...row };
    }

    this.rows[table].push({ ...payload, ...row });
    return row;
  }

  existingId(table, matches) {
    return (this.rows[table] || []).find(matches)?.id;
  }

  createId(prefix) {
    const next = (this.nextIds.get(prefix) || 0) + 1;
    this.nextIds.set(prefix, next);
    return `${prefix}-${next}`;
  }
}

class FakeQuery {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.action = "select";
    this.filters = [];
    this.payload = null;
    this.options = undefined;
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  in(column, values) {
    this.filters.push({ type: "in", column, values });
    return this;
  }

  order() {
    return this;
  }

  upsert(payload, options) {
    this.action = "upsert";
    this.payload = payload;
    this.options = options;
    return this;
  }

  update(payload, options) {
    this.action = "update";
    this.payload = payload;
    this.options = options;
    return this;
  }

  then(resolve, reject) {
    try {
      resolve(this.execute());
    } catch (error) {
      reject(error);
    }
  }

  execute() {
    if (this.action === "upsert") {
      return {
        data: this.supabase.upsert(this.table, this.payload, this.options),
        error: null,
      };
    }

    if (this.action === "update") {
      const count = this.supabase.update(this.table, this.payload, this.filters);
      return { data: null, error: null, count };
    }

    return {
      data: this.supabase.select(this.table, this.filters),
      error: null,
    };
  }
}
