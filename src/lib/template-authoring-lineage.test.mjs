import assert from "node:assert/strict";
import test from "node:test";

import { removeUntrustedCopilotLineage } from "./template-authoring-lineage.ts";

const command = {
  expectedRevision: 3,
  idempotencyKey: "replace:lineage-test",
  changeReason: "Human edit",
  dossier: { dossierId: "dossier-1" },
  definition: {
    sourceDossierId: "dossier-1",
    generation: {
      mode: "copilot",
      generatedAt: "2026-07-30T00:00:00.000Z",
      generatedByEmail: "author@example.com",
      unresolvedQuestionIds: [],
      sourceSessionId: "44444444-4444-4444-8444-444444444444",
      sourceSessionRevision: 9,
    },
  },
};

test("general edits strip Copilot lineage and become manual", () => {
  const sanitized = removeUntrustedCopilotLineage(command);
  assert.equal(sanitized.definition.generation.mode, "manual");
  assert.equal(
    Object.hasOwn(sanitized.definition.generation, "sourceSessionId"),
    false,
  );
  assert.equal(
    Object.hasOwn(sanitized.definition.generation, "sourceSessionRevision"),
    false,
  );
  assert.equal(command.definition.generation.sourceSessionRevision, 9);
});

test("external-agent attribution remains while Copilot lineage is stripped", () => {
  const sanitized = removeUntrustedCopilotLineage({
    ...command,
    definition: {
      ...command.definition,
      generation: {
        ...command.definition.generation,
        mode: "external_agent",
      },
    },
  });
  assert.equal(sanitized.definition.generation.mode, "external_agent");
  assert.equal(
    Object.hasOwn(sanitized.definition.generation, "sourceSessionId"),
    false,
  );
});
