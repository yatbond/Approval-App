import assert from "node:assert/strict";
import test from "node:test";
import {
  getCreatedTemplateRecordState,
  getDeletedTemplateRecordState,
  getActivatedTemplateVersionRecordState,
  getUpdatedTemplateVersionCommentRecordState,
  getUpdatedTemplateRecordState,
} from "./workspace-template-record-state.ts";

function template(id, name = id) {
  return {
    id,
    name,
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: [],
    fields: [],
    steps: [],
  };
}

test("prepends created templates and selects the created template", () => {
  const state = getCreatedTemplateRecordState({
    templates: [template("old")],
    template: template("new"),
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["new", "old"],
  );
  assert.equal(state.selectedTemplateId, "new");
});

test("updates a matching template without changing list order", () => {
  const state = getUpdatedTemplateRecordState({
    templates: [template("a"), template("b")],
    template: template("b", "Updated B"),
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["a", "b"],
  );
  assert.equal(state.templates[1].name, "Updated B");
});

test("selects the first remaining template when deleting the selected template", () => {
  const state = getDeletedTemplateRecordState({
    templates: [template("a"), template("b"), template("c")],
    selectedTemplateId: "b",
    templateId: "b",
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["a", "c"],
  );
  assert.equal(state.selectedTemplateId, "a");
});

test("keeps current selection when deleting a different template", () => {
  const state = getDeletedTemplateRecordState({
    templates: [template("a"), template("b")],
    selectedTemplateId: "b",
    templateId: "a",
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["b"],
  );
  assert.equal(state.selectedTemplateId, "b");
});

test("stamps template ownership and audit event when creating a template", () => {
  const state = getCreatedTemplateRecordState({
    templates: [],
    template: template("new-template", "New Template"),
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "superuser",
    },
    now: new Date("2026-06-21T07:00:00.000Z"),
  });

  assert.equal(state.templates[0].createdByEmail, "dpang@chunwo.com");
  assert.equal(state.templates[0].createdByName, "Derrick Pang");
  assert.equal(state.templates[0].updatedAt, "2026-06-21T07:00:00.000Z");
  assert.deepEqual(state.auditEvent, {
    id: "template-new-template-1782025200000-created",
    action: "template_created",
    actor: "Derrick Pang",
    actorEmail: "dpang@chunwo.com",
    timestamp: "2026-06-21T07:00:00.000Z",
    detail: "Created template New Template.",
    templateId: "new-template",
    templateName: "New Template",
    templateVersion: 1,
  });
});

test("keeps existing creator metadata while stamping publish audit details", () => {
  const state = getCreatedTemplateRecordState({
    templates: [
      {
        ...template("published-template-v2", "Published Template"),
        version: 2,
        isDraft: false,
        isActiveVersion: true,
        sourceTemplateId: "published-template",
      },
    ],
    template: {
      ...template("published-template-v3", "Published Template"),
      version: 3,
      isDraft: false,
      isActiveVersion: true,
      sourceTemplateId: "published-template",
      createdByEmail: "original@example.com",
      createdByName: "Original Creator",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "superuser",
    },
    now: new Date("2026-06-21T08:00:00.000Z"),
    action: "template_published",
  });

  assert.equal(state.templates[0].createdByEmail, "original@example.com");
  assert.equal(state.templates[0].createdByName, "Original Creator");
  assert.equal(state.templates[0].createdAt, "2026-06-01T00:00:00.000Z");
  assert.equal(state.templates[0].updatedByEmail, "dpang@chunwo.com");
  assert.equal(state.templates[0].isActiveVersion, true);
  assert.equal(state.templates[1].isActiveVersion, false);
  assert.deepEqual(state.auditEvent, {
    id: "template-published-template-v3-1782028800000-published",
    action: "template_published",
    actor: "Derrick Pang",
    actorEmail: "dpang@chunwo.com",
    timestamp: "2026-06-21T08:00:00.000Z",
    detail: "Published template Published Template.",
    templateId: "published-template-v3",
    templateName: "Published Template",
    templateVersion: 3,
  });
});

test("stamps updated templates and records duplicated audit details", () => {
  const state = getUpdatedTemplateRecordState({
    templates: [template("a"), template("copy", "Copy")],
    template: { ...template("copy", "Copied Template"), version: 2 },
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "superuser",
    },
    now: new Date("2026-06-21T08:30:00.000Z"),
    action: "template_duplicated",
  });

  assert.equal(state.templates[1].updatedByEmail, "dpang@chunwo.com");
  assert.equal(state.templates[1].updatedAt, "2026-06-21T08:30:00.000Z");
  assert.deepEqual(state.auditEvent, {
    id: "template-copy-1782030600000-duplicated",
    action: "template_duplicated",
    actor: "Derrick Pang",
    actorEmail: "dpang@chunwo.com",
    timestamp: "2026-06-21T08:30:00.000Z",
    detail: "Duplicated template Copied Template.",
    templateId: "copy",
    templateName: "Copied Template",
    templateVersion: 2,
  });
});

test("stamps updated templates with default update audit details", () => {
  const state = getUpdatedTemplateRecordState({
    templates: [template("a", "Original Template")],
    template: { ...template("a", "Updated Template"), version: 4 },
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "superuser",
    },
    now: new Date("2026-06-21T08:45:00.000Z"),
  });

  assert.equal(state.templates[0].updatedByEmail, "dpang@chunwo.com");
  assert.deepEqual(state.auditEvent, {
    id: "template-a-1782031500000-updated",
    action: "template_updated",
    actor: "Derrick Pang",
    actorEmail: "dpang@chunwo.com",
    timestamp: "2026-06-21T08:45:00.000Z",
    detail: "Updated template Updated Template.",
    templateId: "a",
    templateName: "Updated Template",
    templateVersion: 4,
  });
});

test("archives a template with actor metadata instead of dropping it", () => {
  const state = getDeletedTemplateRecordState({
    templates: [template("a"), template("b")],
    selectedTemplateId: "b",
    templateId: "b",
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "superuser",
    },
    now: new Date("2026-06-21T07:10:00.000Z"),
  });

  assert.deepEqual(
    state.templates.map((item) => ({
      id: item.id,
      isArchived: item.isArchived,
      archivedByEmail: item.archivedByEmail,
    })),
    [
      { id: "a", isArchived: undefined, archivedByEmail: undefined },
      { id: "b", isArchived: true, archivedByEmail: "dpang@chunwo.com" },
    ],
  );
  assert.equal(state.selectedTemplateId, "a");
  assert.equal(state.auditEvent.action, "template_archived");
});

test("does not create archive audit event when actor delete target is missing", () => {
  const state = getDeletedTemplateRecordState({
    templates: [template("a")],
    selectedTemplateId: "a",
    templateId: "missing",
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "superuser",
    },
    now: new Date("2026-06-21T09:00:00.000Z"),
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["a"],
  );
  assert.equal(state.selectedTemplateId, "a");
  assert.equal(state.auditEvent, undefined);
});

test("activates a template version with audit details", () => {
  const state = getActivatedTemplateVersionRecordState({
    templates: [
      {
        ...template("invoice-v1", "Invoice"),
        version: 1,
        isDraft: false,
        isActiveVersion: true,
        sourceTemplateId: "invoice",
        createdByEmail: "dpang@chunwo.com",
      },
      {
        ...template("invoice-v2", "Invoice"),
        version: 2,
        isDraft: false,
        isActiveVersion: false,
        sourceTemplateId: "invoice",
        createdByEmail: "dpang@chunwo.com",
      },
    ],
    selectedTemplateId: "invoice-v1",
    templateId: "invoice-v2",
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "superuser",
    },
    now: new Date("2026-06-22T03:00:00.000Z"),
  });

  assert.equal(state.selectedTemplateId, "invoice-v2");
  assert.deepEqual(
    state.templates.map((item) => ({
      id: item.id,
      isActiveVersion: item.isActiveVersion,
    })),
    [
      { id: "invoice-v1", isActiveVersion: false },
      { id: "invoice-v2", isActiveVersion: true },
    ],
  );
  assert.deepEqual(state.auditEvent, {
    id: "template-invoice-v2-1782097200000-activated",
    action: "template_activated",
    actor: "Derrick Pang",
    actorEmail: "dpang@chunwo.com",
    timestamp: "2026-06-22T03:00:00.000Z",
    detail: "Activated template Invoice.",
    templateId: "invoice-v2",
    templateName: "Invoice",
    templateVersion: 2,
  });
});

test("saves a template version comment with owner permissions", () => {
  const state = getUpdatedTemplateVersionCommentRecordState({
    templates: [
      {
        ...template("invoice-v1", "Invoice"),
        version: 1,
        isDraft: false,
        createdByEmail: "dpang@chunwo.com",
      },
    ],
    templateId: "invoice-v1",
    comment: "Keep for old department routing.",
    actor: {
      name: "Derrick Pang",
      email: "dpang@chunwo.com",
      role: "approver",
    },
    now: new Date("2026-06-22T04:00:00.000Z"),
  });

  assert.equal(state.didUpdate, true);
  assert.equal(state.templates[0].versionComment, "Keep for old department routing.");
  assert.equal(state.auditEvent?.action, "template_updated");
});
