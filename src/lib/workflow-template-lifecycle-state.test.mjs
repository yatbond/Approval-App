import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowTemplateLifecycleState } from "./workflow-template-lifecycle-state.ts";

const template = {
  id: "workflow-1",
  name: "General approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
};

test("describes draft workflow templates as editable and publishable", () => {
  assert.deepEqual(
    getWorkflowTemplateLifecycleState({
      ...template,
      isDraft: true,
    }),
    {
      statusLabel: "Draft",
      statusTone: "draft",
      detail: "Editable draft. Publish when the workflow is ready for new requests.",
      canPublish: true,
      publishLabel: "Publish version",
      publishTitle: "Publish this draft as a locked version for new requests.",
    },
  );
});

test("describes published workflow templates as locked versions", () => {
  const state = getWorkflowTemplateLifecycleState({
    ...template,
    isDraft: false,
    publishedAt: "2026-06-21T05:00:00.000Z",
  });

  assert.equal(state.statusLabel, "Published");
  assert.equal(state.statusTone, "published");
  assert.equal(state.canPublish, false);
  assert.equal(state.publishLabel, "Already published");
  assert.match(state.detail, /duplicate to revise/i);
});

test("describes archived workflow templates as read-only history", () => {
  const state = getWorkflowTemplateLifecycleState({
    ...template,
    isArchived: true,
  });

  assert.equal(state.statusLabel, "Archived");
  assert.equal(state.statusTone, "archived");
  assert.equal(state.canPublish, false);
  assert.equal(state.publishLabel, "Archived");
  assert.match(state.detail, /kept for history/i);
});

test("describes an empty workflow selection", () => {
  const state = getWorkflowTemplateLifecycleState(null);

  assert.equal(state.statusLabel, "No template");
  assert.equal(state.statusTone, "empty");
  assert.equal(state.canPublish, false);
  assert.match(state.detail, /create or select/i);
});
