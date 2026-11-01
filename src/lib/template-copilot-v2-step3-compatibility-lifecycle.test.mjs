import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createTemplateCopilotV2Ledger,
  templateCopilotStoredLedgerSchema,
  templateCopilotV2LedgerSchema,
} from "./template-copilot-facts.ts";
import { createTemplateCopilotLedger } from "./template-copilot-ledger.ts";
import {
  isTemplateCopilotV2CandidateCreationEnabled,
  isTemplateCopilotV2ExtractionShadowEnabled,
} from "./template-copilot-v2-feature.ts";
import { createTemplateCopilotV2LifecycleFence } from "./template-copilot-v2-client-command.ts";

const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts",
};

test("Step 3 leaves v1 and pre-sidecar v2 ledgers readable and defaults only the additive evidence sidecar", () => {
  const v1 = createTemplateCopilotLedger(scope);
  assert.equal(templateCopilotStoredLedgerSchema.parse(v1).schemaVersion, 1);

  const modern = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const preStep3 = { ...modern };
  delete preStep3.extractionEvidence;
  const parsed = templateCopilotV2LedgerSchema.parse(preStep3);
  assert.deepEqual(parsed.extractionEvidence.candidates, []);
  assert.deepEqual(parsed.extractionEvidence.conflicts, []);
  assert.deepEqual(parsed.extractionEvidence.history, []);
  assert.equal(parsed.schemaVersion, 2);
});

test("shadow, candidate creation, and mutation remain independently gated", () => {
  assert.equal(isTemplateCopilotV2ExtractionShadowEnabled({}), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({}), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({ TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW: "true" }), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({ TEMPLATE_COPILOT_V2_CANDIDATE_CREATION: "true" }), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({ TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW: "true", TEMPLATE_COPILOT_V2_CANDIDATE_CREATION: "true" }), true);
});

test("the extraction, confirm, and resolve lifecycle leases fail closed after rollback or unmount", () => {
  const fence = createTemplateCopilotV2LifecycleFence();
  const extraction = fence.capture();
  const confirmation = fence.capture();
  const resolution = fence.capture();
  assert.equal(extraction.isCurrent(), true);
  fence.invalidateCurrent();
  for (const lease of [extraction, confirmation, resolution]) {
    assert.equal(lease.isCurrent(), false);
    let committed = false;
    assert.equal(lease.commit(() => { committed = true; }), false);
    assert.equal(committed, false);
  }
  const remounted = fence.capture();
  assert.equal(remounted.isCurrent(), true);
});

test("the Copilot client fences extraction-conflict response, retry, rollback, and unmount state updates", async () => {
  const component = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
  const functionStart = component.indexOf("async function resolveExtractionConflict");
  assert.ok(functionStart >= 0, "Step 3 conflict action must remain a distinct lifecycle-owned operation");
  const functionEnd = component.indexOf("\n  function ", functionStart + 1);
  const action = component.slice(functionStart, functionEnd < 0 ? component.length : functionEnd);
  assert.match(action, /captureV2LifecycleLease\(\)/);
  assert.match(action, /await api\(/);
  assert.match(action, /if \(!lifecycle\.isCurrent\(\)\) return;/);
  assert.match(action, /finally[\s\S]*?lifecycle\.isCurrent\(\)/);
});
