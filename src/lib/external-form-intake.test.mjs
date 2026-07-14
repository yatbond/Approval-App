import assert from "node:assert/strict";
import test from "node:test";
import {
  isAuthorizedFormIntake,
  parseExternalFormIntake,
} from "./external-form-intake.ts";

const payload = {
  provider: "microsoft_forms",
  formKey: "world-cup-survey",
  externalFormId: "5raJmEfjPA",
  externalResponseId: "response-42",
  responseMode: "start_workflow",
  respondentEmail: "user@example.com",
  answers: {
    input_date: "2026-07-14",
    selected_team: "France",
  },
  attachments: [
    {
      fieldName: "jersey_photo",
      fileName: "jersey.jpg",
      driveItemId: "drive-item-1",
    },
  ],
};

test("accepts mapped Microsoft Forms response payloads", () => {
  const result = parseExternalFormIntake(payload);
  assert.equal(result.success, true);
  assert.equal(result.data.attachments[0].fileName, "jersey.jpg");
});

test("rejects payloads without an idempotent external response id", () => {
  const result = parseExternalFormIntake({
    ...payload,
    externalResponseId: "",
  });
  assert.equal(result.success, false);
});

test("requires a sufficiently long exact bearer secret", () => {
  const secret = "test-secret-with-24-characters";
  assert.equal(isAuthorizedFormIntake(`Bearer ${secret}`, secret), true);
  assert.equal(isAuthorizedFormIntake("Bearer wrong", secret), false);
  assert.equal(isAuthorizedFormIntake("Bearer short", "short"), false);
});
