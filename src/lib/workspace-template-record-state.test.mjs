import assert from "node:assert/strict";
import test from "node:test";
import {
  getCreatedTemplateRecordState,
  getDeletedTemplateRecordState,
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
