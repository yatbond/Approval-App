import assert from "node:assert/strict";
import test from "node:test";
import {
  attachLibraryFormToWorkflow,
  activateFormLibraryDefinition,
  createEmptyFormLibraryDraft,
  createFormLibraryField,
  extractMicrosoftFormId,
  getFormLibraryPreflightIssues,
  getActiveFormLibraryDefinitions,
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

test("choice fields require configured choices", () => {
  const draft = createEmptyFormLibraryDraft("native");
  draft.fields[0] = { ...draft.fields[0], type: "checkbox", options: [] };
  assert.deepEqual(getFormLibraryPreflightIssues(draft, []), [
    "New field: add at least one choice.",
  ]);
});

test("Microsoft Forms choices remain managed by Microsoft Forms", () => {
  const draft = createEmptyFormLibraryDraft("microsoft_forms");
  draft.responseUrl = "https://forms.cloud.microsoft/r/5raJmEfjPA";
  draft.fields[0] = {
    ...draft.fields[0],
    type: "radio",
    options: ["Choice 1", "Choice 2"],
  };
  assert.deepEqual(getFormLibraryPreflightIssues(draft, []), []);
  const saved = saveFormLibraryDraft({
    library: [],
    draft,
    actorEmail: "admin@example.com",
  });
  assert.equal(saved.definition.fields[0].inputSource, "microsoft_forms");
  assert.equal(saved.definition.fields[0].options, undefined);
});

test("request data fields can be populated from a registered attachment", () => {
  const draft = createEmptyFormLibraryDraft("microsoft_forms");
  draft.responseUrl = "https://forms.cloud.microsoft/r/5raJmEfjPA";
  draft.attachmentFields = [
    { name: "payment_certificate", label: "Payment certificate", required: true },
  ];
  draft.fields = [
    createFormLibraryField("Project name", "microsoft_forms"),
    {
      ...createFormLibraryField("Payment amount", "attachment_extraction"),
      required: true,
      attachmentFieldName: "payment_certificate",
      instructions: "Extract the final payable amount.",
    },
  ];

  assert.deepEqual(getFormLibraryPreflightIssues(draft, []), []);
  const saved = saveFormLibraryDraft({
    library: [],
    draft,
    actorEmail: "admin@example.com",
  });
  assert.equal(saved.definition.fields[0].inputSource, "microsoft_forms");
  assert.equal(saved.definition.fields[0].externalQuestionLabel, "Project name");
  assert.equal(saved.definition.fields[1].inputSource, "attachment_extraction");
  assert.equal(saved.definition.fields[1].source, "ai");
  assert.equal(saved.definition.fields[1].attachmentFieldName, "payment_certificate");
});

test("attachment extraction requires a valid registered attachment", () => {
  const draft = createEmptyFormLibraryDraft("native");
  draft.fields = [
    {
      ...createFormLibraryField("Invoice total", "attachment_extraction"),
      attachmentFieldName: "missing_upload",
    },
  ];
  assert.deepEqual(getFormLibraryPreflightIssues(draft, []), [
    "Invoice total: choose the attachment AI should parse.",
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
  assert.deepEqual(
    attached.template.documents[0].formLibraryRef.attachmentFields,
    second.definition.attachmentFields,
  );
  assert.deepEqual(
    attached.template.documents[0].formLibraryRef.layout,
    second.definition.layout,
  );
});

test("draft forms update in place and publish as the active version", () => {
  const draft = createEmptyFormLibraryDraft("native", {
    business: "Chun Wo",
    department: "Finance",
  });
  draft.name = "Payment intake";
  const savedDraft = saveFormLibraryDraft({
    library: [],
    draft,
    actorEmail: "admin@example.com",
    saveMode: "draft",
  });
  const updatedDraft = saveFormLibraryDraft({
    library: savedDraft.library,
    draft: { ...draft, description: "Updated" },
    actorEmail: "admin@example.com",
    existingDefinition: savedDraft.definition,
    saveMode: "draft",
  });
  assert.equal(updatedDraft.library.length, 1);
  assert.equal(updatedDraft.definition.id, savedDraft.definition.id);
  assert.equal(updatedDraft.definition.isDraft, true);
  assert.equal(updatedDraft.definition.business, "Chun Wo");

  const published = saveFormLibraryDraft({
    library: updatedDraft.library,
    draft: { ...draft, description: "Published" },
    actorEmail: "admin@example.com",
    existingDefinition: updatedDraft.definition,
    saveMode: "publish",
  });
  assert.equal(published.library.length, 1);
  assert.equal(published.definition.isDraft, false);
  assert.equal(published.definition.isActiveVersion, true);
  assert.equal(getActiveFormLibraryDefinitions(published.library)[0].id, published.definition.id);
});

test("activating an older published form version changes only the active version", () => {
  const draft = { ...createEmptyFormLibraryDraft("native"), name: "Site intake" };
  const first = saveFormLibraryDraft({
    library: [],
    draft,
    actorEmail: "admin@example.com",
  });
  const second = saveFormLibraryDraft({
    library: first.library,
    draft,
    actorEmail: "admin@example.com",
    existingDefinition: first.definition,
  });
  const activated = activateFormLibraryDefinition(second.library, first.definition.id);
  assert.equal(getActiveFormLibraryDefinitions(activated)[0].id, first.definition.id);
  assert.equal(activated.find((item) => item.id === second.definition.id)?.isActiveVersion, false);
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
