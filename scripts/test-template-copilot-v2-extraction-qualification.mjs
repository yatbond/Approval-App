import assert from "node:assert/strict";
import { templateCopilotV2ExtractionQualificationFixtures } from "./template-copilot-v2-extraction-qualification-fixtures.mjs";

// Deliberately keyless: this proves the corpus is bounded and ready for a
// later provider harness without calling a live model in CI/unit tests.
assert.ok(templateCopilotV2ExtractionQualificationFixtures.length >= 3);
for (const fixture of templateCopilotV2ExtractionQualificationFixtures) {
  assert.match(fixture.id, /^[a-z0-9-]+$/);
  assert.ok(Array.from(fixture.message).length <= 8_000);
  assert.ok(Array.isArray(fixture.expectedFactIds));
}
console.log(`Template Copilot v2 extraction qualification fixtures: ${templateCopilotV2ExtractionQualificationFixtures.length}`);
