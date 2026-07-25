import assert from "node:assert/strict";
import test from "node:test";
import { extractExternalFormAttachmentAnswers } from "./external-form-attachment-extraction.ts";

const definition = {
  source: "microsoft_forms",
  fields: [
    {
      name: "project_name",
      label: "Project name",
      type: "text",
      required: true,
      source: "manual",
      inputSource: "microsoft_forms",
      instructions: "",
    },
    {
      name: "payment_amount",
      label: "Payment amount",
      type: "currency",
      required: true,
      source: "ai",
      inputSource: "attachment_extraction",
      attachmentFieldName: "payment_certificate",
      instructions: "Extract the final payable amount.",
    },
  ],
  attachmentFields: [
    { name: "payment_certificate", label: "Payment certificate", required: true },
  ],
};

const intake = {
  attachments: [
    {
      fieldName: "payment_certificate",
      fileName: "payment.pdf",
      contentType: "application/pdf",
      downloadUrl: "https://files.example.com/payment.pdf",
    },
  ],
};

test("extracts only fields linked to the Microsoft Forms attachment", async () => {
  let parsedLabels = [];
  const result = await extractExternalFormAttachmentAnswers({
    definition,
    intake,
    fetcher: async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    parser: async ({ fields }) => {
      parsedLabels = fields.map((field) => field.label);
      return {
        strategy: "pdf-ocr",
        fields: { "Payment amount": "HKD 500,000.00" },
        confidence: { "Payment amount": "high" },
        evidence: { "Payment amount": "Final payable amount" },
        suggestedFields: [],
        notes: [],
      };
    },
  });
  assert.equal(result.success, true);
  assert.deepEqual(parsedLabels, ["Payment amount"]);
  assert.deepEqual(result.answers, { "Payment amount": "HKD 500,000.00" });
});

test("fails clearly when Power Automate omits the attachment download URL", async () => {
  const result = await extractExternalFormAttachmentAnswers({
    definition,
    intake: {
      ...intake,
      attachments: [{ fieldName: "payment_certificate", fileName: "payment.pdf" }],
    },
  });
  assert.equal(result.success, false);
  assert.match(result.message, /download URL/);
});
