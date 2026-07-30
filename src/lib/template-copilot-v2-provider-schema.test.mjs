import assert from "node:assert/strict";
import test from "node:test";
import Ajv from "ajv";
import { z } from "zod";
import {
  templateCopilotV2CandidateOutputSchema,
  templateCopilotV2CandidateVariants,
} from "./template-copilot-v2-candidates.ts";
import { templateCopilotFactIds } from "./template-copilot-facts.ts";

const evidence = [{ path: "/", messageId: "m1", startCodePoint: 0, endCodePoint: 1, exactText: "x" }];
function envelope(factId, valueType, value) {
  return { candidates: [{ factId, valueType, value, originalWording: "x", evidence, confidence: "medium", ambiguity: "none" }] };
}

test("provider candidate schema exposes 16 literal fact/value variants without generic JSON", () => {
  const jsonSchema = z.toJSONSchema(templateCopilotV2CandidateOutputSchema, { target: "draft-07" });
  const variants = jsonSchema.properties.candidates.items.oneOf;
  assert.equal(templateCopilotV2CandidateVariants.length, 16);
  assert.equal(variants.length, 16);
  assert.deepEqual(variants.map((variant) => variant.properties.factId.const).sort(), [...templateCopilotFactIds].sort());
  assert.ok(variants.every((variant) => variant.properties.factId.const && variant.properties.valueType.const && variant.properties.value));
  assert.doesNotMatch(JSON.stringify(jsonSchema), /"type":"json"/);
});

test("provider JSON Schema and Zod both reject mismatched variants and accept typed complex values", () => {
  const jsonSchema = z.toJSONSchema(templateCopilotV2CandidateOutputSchema, { target: "draft-07" });
  const validate = new Ajv({ allErrors: true, strict: false }).compile(jsonSchema);
  const invalid = [
    envelope("workflow.name", "attachments", [{ label: "Invoice", required: true, formats: ["pdf"] }]),
    envelope("workflow.name", "text", { description: "Not a workflow name", rules: [] }),
    envelope("workflow.stages", "stages", [{ label: "Finance", kind: "approval", participant: { mode: "directory_position" }, sequence: "first" }]),
  ];
  for (const input of invalid) {
    assert.equal(templateCopilotV2CandidateOutputSchema.safeParse(input).success, false);
    assert.equal(validate(input), false, JSON.stringify(validate.errors));
  }
  const valid = [
    envelope("attachments.requirements", "attachments", [{ label: "Invoice", required: true, formats: ["pdf", "image"], stage: "Finance review" }]),
    envelope("workflow.stages", "stages", [{ label: "Finance review", kind: "approval", participant: { mode: "directory_position", value: "Finance Manager" }, sequence: 1 }]),
  ];
  for (const input of valid) {
    assert.equal(templateCopilotV2CandidateOutputSchema.safeParse(input).success, true);
    assert.equal(validate(input), true, JSON.stringify(validate.errors));
  }
});
