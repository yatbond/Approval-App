import assert from "node:assert/strict";
import test from "node:test";
import {
  getLibraryFormSourceLabel,
  getLocallyEditableWorkflowFormFields,
  getLocallyUploadableWorkflowFormAttachments,
  getWorkflowFormAttachmentFields,
  getWorkflowFormFieldSourceLabel,
  isLibraryFormRequirement,
  isMicrosoftFormsRequirement,
} from "./workflow-library-form-state.ts";

const microsoftDocument = {
  fields: [
    {
      name: "team",
      label: "Winning team",
      inputSource: "microsoft_forms",
    },
    {
      name: "amount",
      label: "Amount",
      inputSource: "attachment_extraction",
      attachmentFieldName: "invoice",
    },
  ],
  formLibraryRef: {
    source: "microsoft_forms",
    selectedAttachmentNames: ["invoice"],
    attachmentFields: [
      { name: "invoice", label: "Invoice PDF", required: true },
    ],
  },
};

test("identifies pinned Microsoft Forms without converting them to native forms", () => {
  assert.equal(isLibraryFormRequirement(microsoftDocument), true);
  assert.equal(isMicrosoftFormsRequirement(microsoftDocument), true);
  assert.equal(getLibraryFormSourceLabel(microsoftDocument), "Microsoft Forms");
  assert.deepEqual(getLocallyEditableWorkflowFormFields(microsoftDocument), []);
  assert.deepEqual(getLocallyUploadableWorkflowFormAttachments(microsoftDocument), []);
});

test("describes Microsoft Forms answers and attachment extraction separately", () => {
  assert.equal(
    getWorkflowFormFieldSourceLabel(microsoftDocument, microsoftDocument.fields[0]),
    "Microsoft Forms answer",
  );
  assert.equal(
    getWorkflowFormFieldSourceLabel(microsoftDocument, microsoftDocument.fields[1]),
    "AI from Invoice PDF",
  );
  assert.deepEqual(getWorkflowFormAttachmentFields(microsoftDocument), [
    { name: "invoice", label: "Invoice PDF", required: true },
  ]);
});

test("keeps native library fields and attachments locally editable", () => {
  const nativeDocument = {
    ...microsoftDocument,
    formLibraryRef: {
      ...microsoftDocument.formLibraryRef,
      source: "native",
    },
  };
  assert.equal(isMicrosoftFormsRequirement(nativeDocument), false);
  assert.equal(getLibraryFormSourceLabel(nativeDocument), "Approval App form");
  assert.equal(getLocallyEditableWorkflowFormFields(nativeDocument).length, 2);
  assert.equal(getLocallyUploadableWorkflowFormAttachments(nativeDocument).length, 1);
});
