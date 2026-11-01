import assert from "node:assert/strict";
import test from "node:test";
import { TemplateCopilotApiError, templateCopilotApiErrorCode, templateCopilotApiErrorFromResponse, templateCopilotApiErrorStatus } from "./template-copilot-api-error.ts";

test("Copilot API errors retain only safe status and machine code", () => {
  const error = templateCopilotApiErrorFromResponse(422, { error: { code: "invalid_atomic_answer", message: "internal diagnostic must not leak" } });
  assert.equal(error instanceof TemplateCopilotApiError, true);
  assert.equal(error.status, 422);
  assert.equal(error.code, "invalid_atomic_answer");
  assert.equal(error.message.includes("internal diagnostic"), false);
  assert.equal(templateCopilotApiErrorStatus(error), 422);
  assert.equal(templateCopilotApiErrorCode(error), "invalid_atomic_answer");
  assert.equal(templateCopilotApiErrorStatus(new Error("network")), null);
  assert.equal(templateCopilotApiErrorCode(new Error("network")), null);
});
