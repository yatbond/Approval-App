import assert from "node:assert/strict";
import { templateCopilotV2Step3QualificationFixtures } from "./template-copilot-v2-step3-qualification-fixtures.mjs";

assert.ok(templateCopilotV2Step3QualificationFixtures.length >= 7);
for (const fixture of templateCopilotV2Step3QualificationFixtures) {
  assert.match(fixture.id, /^[a-z0-9-]+$/);
  assert.ok(["en", "zh-Hant", "zh-Hans", "mixed"].includes(fixture.locale));
  assert.ok(Array.from(fixture.message).length <= 8_000);
  assert.ok(Array.isArray(fixture.expected.acceptedFactIds));
  assert.ok(Array.isArray(fixture.expected.rejectedFactIds));
  assert.equal(new Set(fixture.expected.acceptedFactIds).size, fixture.expected.acceptedFactIds.length);
  assert.equal(new Set(fixture.expected.rejectedFactIds).size, fixture.expected.rejectedFactIds.length);
}
console.log(`Template Copilot v2 Step 3 qualification fixtures: ${templateCopilotV2Step3QualificationFixtures.length}`);
