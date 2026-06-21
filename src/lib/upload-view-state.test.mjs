import assert from "node:assert/strict";
import { test } from "node:test";
import { getUploadViewState } from "./upload-view-state.ts";
import {
  buildAdHocExtractionFields,
  createAdHocFieldDraft,
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
