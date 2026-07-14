import assert from "node:assert/strict";
import test from "node:test";
import {
  attachLibraryFormToWorkflow,
  createEmptyFormLibraryDraft,
  extractMicrosoftFormId,
  getFormLibraryPreflightIssues,
  saveFormLibraryDraft,
} from "./form-library-state.ts";

const template = {
  id: "payment-v1",
  name: "Payment",
  business: "Chun Wo",
  department: "Finance",
  isDraft: false,
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "submit", kind: "submit_request", label: "Submit", x: 0, y: 0 },
      { id: "approval", kind: "approval", label: "Manager", x: 100, y: 0 },
      { id: "end", kind: "end", label: "End", x: 200, y: 0 },
    ],
    edges: [],
  },
};

test("extracts Microsoft Forms ids from short and query links", () => {
  assert.equal(
    extractMicrosoftFormId("https://forms.cloud.microsoft/r/5raJmEfjPA"),
    "5raJmEfjPA",
  );
  assert.equal(
    extractMicrosoftFormId("https://forms.office.com/Pages/ResponsePage.aspx?id=tenant-form"),
    "tenant-form",
  );
});

test("Microsoft Forms start mode requires a published workflow", () => {
  const draft = {
    ...createEmptyFormLibraryDraft("microsoft_forms"),
    responseUrl: "https://forms.cloud.microsoft/r/5raJmEfjPA",
    responseMode: "start_workflow",
  };
  assert.deepEqual(getFormLibraryPreflightIssues(draft, [template]), [
    "Choose the published workflow this form starts.",
  ]);
});

test("saving creates immutable versions and attaching pins the version", () => {
  const draft = createEmptyFormLibraryDraft("native");
  draft.name = "Site intake";
  const first = saveFormLibraryDraft({
    library: [],
    draft,
    actorEmail: "admin@example.com",
    now: new Date("2026-07-14T00:00:00.000Z"),
  });
  const second = saveFormLibraryDraft({
    library: first.library,
    draft: { ...draft, versionComment: "Clarified field" },
    actorEmail: "admin@example.com",
    existingDefinition: first.definition,
    now: new Date("2026-07-14T01:00:00.000Z"),
  });
  assert.equal(second.definition.version, 2);
  assert.equal(second.library.length, 2);

  const attached = attachLibraryFormToWorkflow({
    template,
    nodeId: "submit",
    definition: second.definition,
  });
  assert.equal(attached.didUpdate, true);
  assert.equal(attached.template.documents[0].formLibraryRef.version, 2);
  assert.deepEqual(attached.template.graph.nodes[0].documentIds, [
    attached.template.documents[0].id,
  ]);
});

test("forms cannot be attached to End boxes", () => {
  const saved = saveFormLibraryDraft({
    library: [],
    draft: { ...createEmptyFormLibraryDraft(), name: "Intake" },
    actorEmail: "admin@example.com",
  });
  const result = attachLibraryFormToWorkflow({
    template,
    nodeId: "end",
    definition: saved.definition,
  });
  assert.equal(result.didUpdate, false);
});
