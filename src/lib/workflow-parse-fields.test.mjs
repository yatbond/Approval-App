import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkflowFieldsForParsing } from "./workflow-parse-fields.ts";

test("normalizes partial workflow fields before parser API validation", () => {
  assert.deepEqual(
    normalizeWorkflowFieldsForParsing([
      {
        name: "subcontractor_name",
        instructions: "name of subbie",
      },
    ]),
    [
      {
        name: "subcontractor_name",
        label: "subcontractor_name",
        type: "text",
        required: false,
        source: "ai",
        instructions: "name of subbie",
      },
    ],
  );
});

test("keeps complete workflow fields unchanged for parsing", () => {
  assert.deepEqual(
    normalizeWorkflowFieldsForParsing([
      {
        name: "payment_amount",
        label: "Payment amount",
        type: "currency",
        required: true,
        source: "ocr",
        instructions: "Extract the payment amount.",
        documentId: "payment-doc",
      },
    ]),
    [
      {
        name: "payment_amount",
        label: "Payment amount",
        type: "currency",
        required: true,
        source: "ocr",
        instructions: "Extract the payment amount.",
        documentId: "payment-doc",
      },
    ],
  );
});
