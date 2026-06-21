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

class FakeSupabase {
  constructor(seed = {}) {
    this.rows = {
      business_units: [],
      business_departments: [],
      workflow_template_versions: [],
      approval_requests: [],
      approval_request_events: [],
      approval_request_attachments: [],
      ...seed,
    };
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
