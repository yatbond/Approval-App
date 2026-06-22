import assert from "node:assert/strict";
import { test } from "node:test";
import { getUploadViewState } from "./upload-view-state.ts";
import {
  addBoxToHighlightFieldGroup,
  buildAdHocExtractionFields,
  createAdHocFieldDraft,
  createFieldDraftFromSuggestion,
  createHighlightFieldGroup,
  createHighlightValueBox,
  createHighlightedExtractionField,
  mergeHighlightedFieldValue,
  updateHighlightFieldGroupLabel,
  updateHighlightValueBox,
} from "./upload-view-state.ts";

const invoiceDocument = {
  id: "invoice-doc",
  documentType: "Invoice",
  format: "pdf",
  required: true,
  fields: [],
};

const supportDocument = {
  id: "support-doc",
  documentType: "Support",
  format: "image",
  required: false,
  fields: [],
};

const templateA = {
  id: "template-a",
  name: "Template A",
  business: "Business",
  department: "Finance",
  version: 2,
  isDraft: false,
  publishedAt: "2026-06-21T05:00:00.000Z",
  documentTypes: [],
  documents: [invoiceDocument, supportDocument],
  fields: [],
  steps: [],
  languages: ["English"],
};

const templateB = {
  id: "template-b",
  name: "Template B",
  business: "Business",
  department: "HR",
  version: 1,
  isDraft: true,
  documentTypes: [],
  documents: [],
  fields: [],
  steps: [],
  languages: ["English"],
};

test("selects the requested template and derives upload document state", () => {
  const state = getUploadViewState({
    workflowTemplates: [templateA, templateB],
    selectedTemplateId: "template-a",
    uploadedAttachments: [
      {
        id: "attachment-1",
        fileName: "invoice.pdf",
        documentId: "invoice-doc",
        documentType: "Invoice",
        uploadedAt: "2026-06-21",
      },
    ],
  });

  assert.equal(state.selectedTemplate, templateA);
  assert.deepEqual(state.requestTemplates, [templateA]);
  assert.deepEqual(
    state.uploadDocuments.map((document) => document.id),
    ["invoice-doc", "support-doc"],
  );
  assert.deepEqual(Array.from(state.uploadedDocumentIds), ["invoice-doc"]);
  assert.deepEqual(state.missingRequiredDocuments, []);
});

test("excludes draft templates from new request upload options", () => {
  const state = getUploadViewState({
    workflowTemplates: [templateB, templateA],
    selectedTemplateId: "template-b",
    uploadedAttachments: [],
  });

  assert.deepEqual(state.requestTemplates, [templateA]);
  assert.equal(state.selectedTemplate, templateA);
});

test("keeps legacy templates without draft metadata available for requests", () => {
  const legacyTemplate = {
    ...templateB,
    id: "legacy-template",
    isDraft: undefined,
  };
  const state = getUploadViewState({
    workflowTemplates: [templateB, legacyTemplate],
    selectedTemplateId: "legacy-template",
    uploadedAttachments: [],
  });

  assert.deepEqual(state.requestTemplates, [legacyTemplate]);
  assert.equal(state.selectedTemplate, legacyTemplate);
});

test("falls back to the first template when selection is missing", () => {
  const state = getUploadViewState({
    workflowTemplates: [templateA, templateB],
    selectedTemplateId: "missing-template",
    uploadedAttachments: [],
  });

  assert.equal(state.selectedTemplate, templateA);
  assert.deepEqual(
    state.missingRequiredDocuments.map((document) => document.id),
    ["invoice-doc"],
  );
});

test("returns empty upload state when no templates exist", () => {
  const state = getUploadViewState({
    workflowTemplates: [],
    selectedTemplateId: "",
    uploadedAttachments: [],
  });

  assert.equal(state.selectedTemplate, undefined);
  assert.deepEqual(state.uploadDocuments, []);
  assert.deepEqual(Array.from(state.uploadedDocumentIds), []);
  assert.deepEqual(state.missingRequiredDocuments, []);
});

test("builds ad hoc extraction fields from user-entered labels", () => {
  const fields = buildAdHocExtractionFields([
    { id: "draft-1", label: "Invoice amount", instructions: "" },
    { id: "draft-2", label: " Doctor name ", instructions: "Find the attending doctor." },
    { id: "draft-3", label: " ", instructions: "Ignore blank label." },
  ]);

  assert.deepEqual(fields, [
    {
      name: "ad_hoc_invoice_amount",
      label: "Invoice amount",
      type: "text",
      required: false,
      source: "ai",
      instructions: "Extract Invoice amount.",
    },
    {
      name: "ad_hoc_doctor_name",
      label: "Doctor name",
      type: "text",
      required: false,
      source: "ai",
      instructions: "Find the attending doctor.",
    },
  ]);
});

test("creates a blank ad hoc field draft with a stable id", () => {
  const draft = createAdHocFieldDraft(3);

  assert.equal(draft.id, "ad-hoc-field-3");
  assert.equal(draft.label, "");
  assert.equal(draft.instructions, "");
});

test("creates an ad hoc field draft from a suggested field", () => {
  const draft = createFieldDraftFromSuggestion(
    {
      name: "suggested_vendor",
      label: "Vendor",
      value: "Northstar Cloud Limited",
      confidence: "high",
      evidence: "Vendor Northstar Cloud Limited",
      instructions: "Extract Vendor.",
    },
    4,
  );

  assert.deepEqual(draft, {
    id: "suggested-field-4",
    label: "Vendor",
    instructions: "Extract Vendor.",
  });
});

test("creates an extraction field from a highlighted document region label", () => {
  assert.deepEqual(createHighlightedExtractionField(" Doctor Name ", 2), {
    name: "highlight_doctor_name_2",
    label: "Doctor Name",
    type: "text",
    required: false,
    source: "ai",
    instructions: "Extract Doctor Name from the highlighted document region.",
  });
});

test("creates highlight field groups with multiple value boxes", () => {
  const group = createHighlightFieldGroup(2);
  const firstBox = createHighlightValueBox(1, {
    pageId: "pdf-page-1",
    pageNumber: 1,
    rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
  });
  const secondBox = createHighlightValueBox(2, {
    pageId: "pdf-page-2",
    pageNumber: 2,
    rect: { x: 0.2, y: 0.3, width: 0.4, height: 0.05 },
  });

  const renamed = updateHighlightFieldGroupLabel([group], group.id, "Contract sum");
  const withBoxes = addBoxToHighlightFieldGroup(
    addBoxToHighlightFieldGroup(renamed, group.id, firstBox),
    group.id,
    secondBox,
  );

  assert.equal(withBoxes[0].fieldLabel, "Contract sum");
  assert.deepEqual(withBoxes[0].boxes.map((box) => box.id), [
    "highlight-value-box-1",
    "highlight-value-box-2",
  ]);
});

test("updates one highlighted value box without changing other boxes", () => {
  const group = {
    ...createHighlightFieldGroup(1),
    fieldLabel: "Payment",
    boxes: [
      createHighlightValueBox(1, {
        pageId: "pdf-page-1",
        pageNumber: 1,
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
      }),
      createHighlightValueBox(2, {
        pageId: "pdf-page-1",
        pageNumber: 1,
        rect: { x: 0.2, y: 0.4, width: 0.3, height: 0.04 },
      }),
    ],
  };

  const updated = updateHighlightValueBox([group], group.id, "highlight-value-box-2", {
    value: "500,000.00",
    status: "done",
  });

  assert.equal(updated[0].boxes[0].value, "");
  assert.equal(updated[0].boxes[1].value, "500,000.00");
  assert.equal(updated[0].boxes[1].status, "done");
});

test("merges many highlighted values under one field label", () => {
  assert.deepEqual(
    mergeHighlightedFieldValue(
      { Vendor: "Existing vendor" },
      "Payment milestones",
      ["100,000", " ", "250,000"],
    ),
    {
      Vendor: "Existing vendor",
      "Payment milestones": "100,000\n250,000",
    },
  );
});
