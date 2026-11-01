import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTemplateCopilotV2LifecycleFence } from "./template-copilot-v2-client-command.ts";

const component = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/extraction-conflicts/route.ts", import.meta.url), "utf8");

function conflictAction() {
  const start = component.indexOf("async function resolveExtractionConflict");
  assert.ok(start >= 0, "Conflict action must be lifecycle-owned by the client");
  const next = component.slice(start + 1).search(/\n  (?:async )?function /);
  return component.slice(start, next < 0 ? component.length : start + 1 + next);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

async function runDelayedConflict({ lifecycle, request, model }) {
  if (!lifecycle.commit(() => { model.busy = true; model.error = ""; })) return;
  try {
    const response = await request;
    if (!lifecycle.isCurrent()) return;
    if (!response.ledger || !response.interview) throw new Error("invalid response");
    lifecycle.commit(() => { model.state = response; model.storage = `authoritative:${response.revision}`; });
  } catch {
    lifecycle.commit(() => { model.error = "This conflict could not be resolved. Reload and try again."; });
  } finally {
    lifecycle.commit(() => { model.busy = false; });
  }
}

async function runLostResponseConflictRecovery({ lifecycle, request, reload, model }) {
  if (!lifecycle.commit(() => { model.busy = true; model.error = ""; })) return;
  try {
    await request;
  } catch {
    if (!lifecycle.isCurrent()) return;
    try {
      const recovered = await reload;
      if (!lifecycle.isCurrent()) return;
      if (recovered.closed) {
        lifecycle.commit(() => { model.state = recovered; });
        return;
      }
    } catch {
      if (!lifecycle.isCurrent()) return;
    }
    lifecycle.commit(() => { model.error = "This conflict could not be resolved. Reload and try again."; });
  } finally {
    lifecycle.commit(() => { model.busy = false; });
  }
}

test("Conflict UI exposes localized Keep existing and Use proposed actions only for open conflicts", () => {
  // Open-only filtering is centralized in the executable, behavior-tested
  // review selector instead of being duplicated in this component.
  const reviewDisplayImport = component.match(/import \{([^}]*)\} from "@\/lib\/template-copilot-v2-review-display";/);
  assert.ok(reviewDisplayImport, "the review-display helper must be imported");
  assert.match(reviewDisplayImport[1], /\bselectTemplateCopilotV2OpenExtractionReview\b/);
  assert.match(component, /selectTemplateCopilotV2OpenExtractionReview\(\s*state\.ledger\.extractionEvidence\s*\)/);
  assert.match(component, /resolveExtractionConflict\(conflict\.conflictId, "keep_existing"\)/);
  assert.match(component, /resolveExtractionConflict\(conflict\.conflictId, "commit_incoming"\)/);
  assert.match(component, /const extractionReviewCopy = templateCopilotV2ReviewPanelCopy\(locale\)/);
  assert.match(component, /\{extractionReviewCopy\.keepExisting\}<\/button>/);
  assert.match(component, /\{extractionReviewCopy\.useProposed\}<\/button>/);
  assert.match(component, /disabled=\{busy\}/);
});

test("Conflict review discloses both candidate evidence chains or a safe existing-provenance summary", () => {
  assert.doesNotMatch(component, /conflict\.existingValue/);
  assert.match(component, /conflict\.existing\.candidate/);
  assert.match(component, /<ExtractionEvidenceDisclosure candidate=\{conflict\.existing\.candidate\} locale=\{locale\} \/>/);
  assert.match(component, /<ExtractionEvidenceDisclosure candidate=\{conflict\.incoming\} locale=\{locale\} \/>/);
  assert.match(component, /function extractionExistingProvenanceSummary/);
  assert.doesNotMatch(component, /JSON\.stringify\(conflict\.existing/);
});

test("Conflict rationale is optional, bounded, and the request sends no spoofable fact/value evidence", () => {
  const action = conflictAction();
  assert.match(component, /extractionRationale.*maxLength=\{1000\}/s);
  assert.match(route, /rationale: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(1_000\)\.optional\(\)/);
  assert.match(action, /body: JSON\.stringify\(\{ conflictId, choice, rationale: extractionRationale\.trim\(\) \|\| undefined, expectedRevision: state\.revision, idempotencyKey: messageId\("extract-resolve"\) \}\)/);
  assert.doesNotMatch(action, /existingValue|canonicalValue|incoming:|provenance|evidence|humanValue/);
  assert.doesNotMatch(action.slice(0, action.indexOf("await api(")), /installV2State|setState|facts\[/);
});

test("Conflict action installs only authoritative applied/replayed state and has a localized safe error path", () => {
  const action = conflictAction();
  assert.match(action, /await reloadV2ExtractionReviewState\(lifecycle, state\.sessionId\)/);
  assert.match(action, /item\.conflictId === conflictId && item\.state === "closed"/);
  const guard = action.indexOf("if (!lifecycle.isCurrent()) return;");
  const install = action.indexOf("installV2State(");
  assert.ok(guard >= 0 && install > guard);
  assert.match(action, /response\.ledger[\s\S]*?schemaVersion !== 2[\s\S]*?throw new Error/);
  assert.match(action, /This conflict could not be resolved\. Reload and try again\./);
  assert.match(action, /finally \{ lifecycle\.commit\(\(\) => setBusy/);
});

test("lost conflict response recovers only from a closed authoritative conflict and a stale reload cannot mutate", async () => {
  const successFence = createTemplateCopilotV2LifecycleFence();
  const success = { state: "old", busy: false, error: "old-error" };
  await runLostResponseConflictRecovery({ lifecycle: successFence.capture(), request: Promise.reject(new Error("lost response")), reload: Promise.resolve({ closed: true, revision: 12 }), model: success });
  assert.deepEqual(success, { state: { closed: true, revision: 12 }, busy: false, error: "" });

  const staleFence = createTemplateCopilotV2LifecycleFence();
  const oldLease = staleFence.capture();
  const pendingReload = deferred();
  const stale = { state: "old", busy: false, error: "old-error" };
  const task = runLostResponseConflictRecovery({ lifecycle: oldLease, request: Promise.reject(new Error("lost response")), reload: pendingReload.promise, model: stale });
  await Promise.resolve();
  staleFence.invalidateCurrent();
  pendingReload.resolve({ closed: true, revision: 13 });
  await task;
  assert.deepEqual(stale, { state: "old", busy: true, error: "" });
});

test("delayed conflict success, error, and finally are ignored after rollback/unmount/remount", async () => {
  for (const outcome of ["success", "error"]) {
    const fence = createTemplateCopilotV2LifecycleFence();
    const oldLease = fence.capture();
    const pending = deferred();
    const old = { state: "old", storage: "old-storage", busy: false, error: "old-error" };
    const task = runDelayedConflict({ lifecycle: oldLease, request: pending.promise, model: old });
    assert.equal(old.busy, true);

    fence.invalidateCurrent();
    const fresh = fence.capture();
    const remounted = { state: "remounted", storage: "fresh-storage", busy: true, error: "fresh-error" };
    if (outcome === "success") pending.resolve({ revision: 11, ledger: { schemaVersion: 2 }, interview: {} });
    else pending.reject(new Error("late transport failure"));
    await task;

    assert.equal(oldLease.isCurrent(), false);
    assert.equal(fresh.isCurrent(), true);
    assert.deepEqual(remounted, { state: "remounted", storage: "fresh-storage", busy: true, error: "fresh-error" });
    assert.deepEqual(old, { state: "old", storage: "old-storage", busy: true, error: "" }, outcome);
  }
});
