import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorkflowHandoffFieldNames,
  toggleWorkflowHandoffFieldName,
} from "./workflow-handoff-fields-state.ts";

const template = {
  id: "template-1",
  name: "Payment approval",
  fields: [
    { name: "amount", label: "Amount" },
    { name: "vendor", label: "Supplier" },
    { name: "blank", label: " " },
  ],
  documents: [
    {
      id: "doc-1",
      name: "Payment Cert",
      fields: [
        { name: "payment_amount", label: "Amount" },
        { name: "payment_number", label: "Payment Number" },
      ],
    },
  ],
};

test("lists unique handoff field names from template and document fields", () => {
  assert.deepEqual(getWorkflowHandoffFieldNames(template), [
    "Amount",
    "Supplier",
    "Payment Number",
  ]);
});

test("toggles handoff field names for checkbox selection", () => {
  assert.deepEqual(toggleWorkflowHandoffFieldName(["Amount"], "Supplier", true), [
    "Amount",
    "Supplier",
  ]);
  assert.deepEqual(
    toggleWorkflowHandoffFieldName(["Amount", "Supplier"], "Amount", false),
    ["Supplier"],
  );
  assert.deepEqual(toggleWorkflowHandoffFieldName(["Amount"], "Amount", true), [
    "Amount",
  ]);
});
