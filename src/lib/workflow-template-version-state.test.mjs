import assert from "node:assert/strict";
import test from "node:test";
import {
  getActiveWorkflowRequestTemplates,
  isActiveWorkflowTemplateVersion,
  setActiveWorkflowTemplateVersion,
  setWorkflowTemplateVersionComment,
} from "./workflow-template-version-state.ts";

function template(id, patch = {}) {
  return {
    id,
    name: "Invoice approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: [],
    fields: [],
    steps: [],
    ...patch,
  };
}

test("selects explicit active published workflow versions for new requests", () => {
  const templates = [
    template("invoice-v1", {
      version: 1,
      isDraft: false,
      isActiveVersion: true,
      sourceTemplateId: "invoice",
    }),
    template("invoice-v2", {
      version: 2,
      isDraft: false,
      isActiveVersion: false,
      sourceTemplateId: "invoice",
    }),
    template("invoice-draft", {
      isDraft: true,
      sourceTemplateId: "invoice",
    }),
  ];

  assert.deepEqual(
    getActiveWorkflowRequestTemplates(templates).map((item) => item.id),
    ["invoice-v1"],
  );
  assert.equal(isActiveWorkflowTemplateVersion(templates[0], templates), true);
  assert.equal(isActiveWorkflowTemplateVersion(templates[1], templates), false);
});

test("falls back to the latest published version when templates have no active flag", () => {
  assert.deepEqual(
    getActiveWorkflowRequestTemplates([
      template("invoice-v1", {
        version: 1,
        isDraft: false,
        sourceTemplateId: "invoice",
      }),
      template("invoice-v3", {
        version: 3,
        isDraft: false,
        sourceTemplateId: "invoice",
      }),
      template("archived-v4", {
        version: 4,
        isDraft: false,
        isArchived: true,
        sourceTemplateId: "invoice",
      }),
    ]).map((item) => item.id),
    ["invoice-v3"],
  );
});

test("activates one published version and deactivates sibling versions", () => {
  const templates = [
    template("invoice-v1", {
      version: 1,
      isDraft: false,
      isActiveVersion: true,
      sourceTemplateId: "invoice",
      createdByEmail: "creator@example.com",
    }),
    template("invoice-v2", {
      version: 2,
      isDraft: false,
      isActiveVersion: false,
      sourceTemplateId: "invoice",
      createdByEmail: "creator@example.com",
    }),
    template("invoice-draft", {
      isDraft: true,
      sourceTemplateId: "invoice",
      createdByEmail: "creator@example.com",
    }),
  ];

  const state = setActiveWorkflowTemplateVersion({
    templates,
    templateId: "invoice-v2",
    activeUserEmail: "creator@example.com",
    activeUserRole: "approver",
    now: new Date("2026-06-22T01:00:00.000Z"),
  });

  assert.equal(state.didUpdate, true);
  assert.deepEqual(
    state.templates.map((item) => ({
      id: item.id,
      isActiveVersion: item.isActiveVersion,
      updatedByEmail: item.updatedByEmail,
    })),
    [
      {
        id: "invoice-v1",
        isActiveVersion: false,
        updatedByEmail: "creator@example.com",
      },
      {
        id: "invoice-v2",
        isActiveVersion: true,
        updatedByEmail: "creator@example.com",
      },
      {
        id: "invoice-draft",
        isActiveVersion: undefined,
        updatedByEmail: undefined,
      },
    ],
  );
});

test("does not activate workflow versions for non creators", () => {
  const templates = [
    template("invoice-v1", {
      isDraft: false,
      sourceTemplateId: "invoice",
      createdByEmail: "creator@example.com",
    }),
  ];

  const state = setActiveWorkflowTemplateVersion({
    templates,
    templateId: "invoice-v1",
    activeUserEmail: "other@example.com",
    activeUserRole: "approver",
  });

  assert.equal(state.didUpdate, false);
  assert.equal(state.templates, templates);
});

test("updates version comments only for managers", () => {
  const templates = [
    template("invoice-v1", {
      isDraft: false,
      createdByEmail: "creator@example.com",
    }),
  ];

  const state = setWorkflowTemplateVersionComment({
    templates,
    templateId: "invoice-v1",
    comment: " Use this while finance validates the new routing. ",
    activeUserEmail: "creator@example.com",
    activeUserRole: "approver",
    now: new Date("2026-06-22T02:00:00.000Z"),
  });
  const blockedState = setWorkflowTemplateVersionComment({
    templates,
    templateId: "invoice-v1",
    comment: "Blocked",
    activeUserEmail: "other@example.com",
    activeUserRole: "approver",
  });

  assert.equal(state.didUpdate, true);
  assert.equal(
    state.templates[0].versionComment,
    "Use this while finance validates the new routing.",
  );
  assert.equal(state.templates[0].updatedAt, "2026-06-22T02:00:00.000Z");
  assert.equal(blockedState.didUpdate, false);
});
