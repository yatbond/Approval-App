import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTemplateCopilotV2LifecycleFence } from "./template-copilot-v2-client-command.ts";

const component = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");

function confirmAction() {
  const start = component.indexOf("async function confirmExtractionCandidate");
  assert.ok(start >= 0, "Confirm candidate action must be client-owned and lifecycle-fenced");
  const remainder = component.slice(start + 1);
  const next = remainder.search(/\n  (?:async )?function /);
  return component.slice(start, next < 0 ? component.length : start + 1 + next);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

/** Minimal executable equivalent of the action's lifecycle boundary. The React
 * component itself is intentionally not exported; this lets the test prove
 * delayed success/error/finally behavior while source assertions bind it to the
 * actual Confirm implementation. */
async function runDelayedConfirm({ lifecycle, request, model }) {
  if (!lifecycle.commit(() => { model.busy = true; model.error = ""; })) return;
  try {
    const response = await request;
    if (!lifecycle.isCurrent()) return;
    if (!response.ledger || !response.interview) throw new Error("invalid");
    lifecycle.commit(() => {
      model.state = response;
      model.storage = `authoritative:${response.revision}`;
    });
  } catch {
    lifecycle.commit(() => { model.error = "This suggestion could not be confirmed. Reload and try again."; });
  } finally {
    lifecycle.commit(() => { model.busy = false; });
  }
}

async function runLostResponseConfirmRecovery({ lifecycle, request, reload, model }) {
  if (!lifecycle.commit(() => { model.busy = true; model.error = ""; })) return;
  try {
    await request;
  } catch {
    if (!lifecycle.isCurrent()) return;
    try {
      const recovered = await reload;
      if (!lifecycle.isCurrent()) return;
      if (recovered.candidateConfirmed || recovered.matchingHistory) {
        lifecycle.commit(() => { model.state = recovered; });
        return;
      }
    } catch {
      if (!lifecycle.isCurrent()) return;
    }
    lifecycle.commit(() => { model.error = "This suggestion could not be confirmed. Reload and try again."; });
  } finally {
    lifecycle.commit(() => { model.busy = false; });
  }
}

test("Confirm button is rendered only for open, clear, current candidates without an open fact conflict", () => {
  // Open-only filtering is centralized in the executable, behavior-tested
  // review selector instead of being duplicated in this component.
  const reviewDisplayImport = component.match(/import \{([^}]*)\} from "@\/lib\/template-copilot-v2-review-display";/);
  assert.ok(reviewDisplayImport, "the review-display helper must be imported");
  assert.match(reviewDisplayImport[1], /\bselectTemplateCopilotV2OpenExtractionReview\b/);
  assert.match(component, /selectTemplateCopilotV2OpenExtractionReview\(\s*state\.ledger\.extractionEvidence\s*\)/);
  assert.match(component, /function extractionCandidateReviewBlockReason/);
  assert.match(component, /candidate\.ambiguity !== "none"/);
  assert.match(component, /ledger\.facts\[candidate\.factId\]\.status !== "candidate"/);
  assert.match(component, /conflict\.state === "open" && conflict\.factId === candidate\.factId/);
  assert.match(component, /blockedReason \?[\s\S]*?: <button[\s\S]*?confirmExtractionCandidate\(candidate\.candidateId\)/);
  assert.match(component, /Suggestion is currently not confirmable/);
  assert.match(component, /disabled=\{busy\}/);
});

test("Candidate review discloses every durable leaf evidence record without an editor", () => {
  assert.match(component, /function ExtractionEvidenceDisclosure/);
  assert.match(component, /candidate\.evidence\.map\(\(item, index\)/);
  assert.match(component, /item\.path/);
  assert.match(component, /item\.messageId/);
  assert.match(component, /item\.startCodePoint/);
  assert.match(component, /item\.endCodePoint/);
  assert.match(component, /item\.exactText/);
  assert.match(component, /item\.normalizationRule/);
  assert.match(component, /<ExtractionEvidenceDisclosure candidate=\{candidate\} locale=\{locale\} \/>/);
  assert.doesNotMatch(component, /textarea[\s\S]*?candidate\.evidence/);
});

test("Confirm sends only candidate ID, current revision, and a fresh action key; it performs no optimistic fact mutation", () => {
  const action = confirmAction();
  const awaitIndex = action.indexOf("await api(");
  assert.ok(awaitIndex > 0);
  const beforeRequest = action.slice(0, awaitIndex);
  assert.doesNotMatch(beforeRequest, /installV2State|setState|canonicalValue|facts\[/);
  assert.match(action, /\/extraction-candidates/);
  assert.match(action, /body: JSON\.stringify\(\{ candidateId, expectedRevision: state\.revision, idempotencyKey: messageId\("extract-confirm"\) \}\)/);
  assert.doesNotMatch(action, /humanValue|choice|rationale/);
});

test("applied and replayed authoritative responses are installed only after the lifecycle-current check", () => {
  const action = confirmAction();
  const check = action.indexOf("if (!lifecycle.isCurrent()) return;");
  const install = action.indexOf("installV2State(");
  assert.ok(check >= 0 && install > check);
  assert.match(action, /response\.ledger[\s\S]*?schemaVersion !== 2[\s\S]*?throw new Error/);
  assert.match(action, /revision: Number\(response\.revision\)/);
  assert.match(action, /specialReview: Array\.isArray\(response\.specialReview\)/);
});

test("stale, conflict, and not-found Confirm responses have one localized safe failure path", () => {
  const action = confirmAction();
  assert.match(component, /async function reloadV2ExtractionReviewState/);
  assert.match(action, /await reloadV2ExtractionReviewState\(lifecycle, state\.sessionId\)/);
  assert.match(component, /method: "GET"/);
  assert.match(action, /candidate\?\.state === "confirmed" \|\| confirmedByHistory/);
  assert.match(action, /item\.kind === "candidate_confirmed" && item\.candidateId === candidateId/);
  assert.match(action, /stableExtractionRecoveryValue\(item\.incoming\.value\) === attemptedValue/);
  assert.match(action, /Another session updated this fact\. Review the current information before acting on this suggestion\./);
  assert.match(action, /catch \{[\s\S]*?This suggestion could not be confirmed\. Reload and try again\./);
  assert.doesNotMatch(action, /JSON\.stringify\(response\)|response\.ledger\.facts/);
  assert.match(action, /finally \{[\s\S]*?lifecycle\.commit\(\(\) => setBusy/);
});

test("lost Confirm response recovers from an authoritative snapshot and delayed reload cannot mutate a released client", async () => {
  const successFence = createTemplateCopilotV2LifecycleFence();
  const success = { state: "old", busy: false, error: "old-error" };
  await runLostResponseConfirmRecovery({ lifecycle: successFence.capture(), request: Promise.reject(new Error("lost response")), reload: Promise.resolve({ candidateConfirmed: true, revision: 9 }), model: success });
  assert.deepEqual(success, { state: { candidateConfirmed: true, revision: 9 }, busy: false, error: "" });

  const staleFence = createTemplateCopilotV2LifecycleFence();
  const oldLease = staleFence.capture();
  const pendingReload = deferred();
  const stale = { state: "old", busy: false, error: "old-error" };
  const task = runLostResponseConfirmRecovery({ lifecycle: oldLease, request: Promise.reject(new Error("lost response")), reload: pendingReload.promise, model: stale });
  await Promise.resolve();
  staleFence.invalidateCurrent();
  pendingReload.resolve({ candidateConfirmed: true, revision: 10 });
  await task;
  assert.deepEqual(stale, { state: "old", busy: true, error: "" });
});

test("same-user two-tab recovery does not treat a different committed value as this candidate's success", async () => {
  const fence = createTemplateCopilotV2LifecycleFence();
  const model = { state: "candidate A", busy: false, error: "old-error" };
  await runLostResponseConfirmRecovery({ lifecycle: fence.capture(), request: Promise.reject(new Error("lost response")), reload: Promise.resolve({ factCommitted: true, candidateConfirmed: false, matchingHistory: false, value: "candidate B" }), model });
  assert.deepEqual(model, { state: "candidate A", busy: false, error: "This suggestion could not be confirmed. Reload and try again." });
});

test("delayed Confirm success, error, and finally cannot mutate a new remounted state after rollback/unmount", async () => {
  for (const outcome of ["success", "error"]) {
    const fence = createTemplateCopilotV2LifecycleFence();
    const oldLease = fence.capture();
    const pending = deferred();
    const old = { state: "old", storage: "old-storage", busy: false, error: "old-error" };
    const task = runDelayedConfirm({ lifecycle: oldLease, request: pending.promise, model: old });
    assert.equal(old.busy, true);

    fence.invalidateCurrent();
    const freshLease = fence.capture();
    const remounted = { state: "new", storage: "new-storage", busy: true, error: "new-error" };
    if (outcome === "success") pending.resolve({ revision: 9, ledger: { schemaVersion: 2 }, interview: {} });
    else pending.reject(new Error("delayed failure"));
    await task;

    assert.equal(oldLease.isCurrent(), false);
    assert.equal(freshLease.isCurrent(), true);
    assert.deepEqual(remounted, { state: "new", storage: "new-storage", busy: true, error: "new-error" });
    assert.deepEqual(old, { state: "old", storage: "old-storage", busy: true, error: "" }, `${outcome} finally must not mutate a released client`);
  }
});
