import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTemplateCopilotV2FactTransition,
  createTemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";
import {
  confirmTemplateCopilotV2Candidate,
  normalizeTemplateCopilotV2Candidates,
  projectTemplateCopilotV2Candidates,
  resolveTemplateCopilotV2CommittedExtractionConflict as resolveProjection,
} from "./template-copilot-v2-candidates.ts";
import { resolveTemplateCopilotV2CommittedExtractionConflict as resolveServer } from "./template-copilot-v2-server-data.ts";

const flag = { enabled: true };
const actor = { id: "33333333-3333-4333-8333-333333333333" };
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts",
};

function rawName(value, messageId) {
  return {
    factId: "workflow.name", valueType: "text", value, originalWording: value,
    evidence: [{ path: "/", messageId, startCodePoint: 0, endCodePoint: Array.from(value).length, exactText: value }],
    confidence: "high", ambiguity: "none",
  };
}

function normalized(value, messageId) {
  const result = normalizeTemplateCopilotV2Candidates({ output: { candidates: [rawName(value, messageId)] }, messages: { [messageId]: value } });
  assert.equal(result.rejected.length, 0);
  return result.candidates;
}

function commit(ledger, value) {
  return applyTemplateCopilotV2FactTransition({
    ledger, factId: "workflow.name", actorId: actor.id, confirmedAt: "2026-07-27T00:00:00Z", flag,
    transition: { operation: "human_commit", payload: { canonicalValue: value, provenance: [{ kind: "human_editor", sourceId: "manual:name", sourceMessageIds: [] }] } },
  });
}

function unrelatedFactsStayByteIdentical(before, after, factId) {
  for (const [id, value] of Object.entries(before.facts)) if (id !== factId) assert.deepEqual(after.facts[id], value, id);
}

function resolutionHarness(ledger) {
  const row = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision: 1, ledger };
  const calls = [];
  const session = { from: (table) => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: table === "template_copilot_sessions" ? row : null, error: null }) }) };
  const service = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { outcome: "applied", sessionId: row.id, revision: 2, status: row.status, ledger: args.p_ledger }, error: null }; } };
  return { session, service, calls, row };
}

test("3D11 real first candidate serialization changes only its unresolved fact and appends full durable evidence", () => {
  const before = createTemplateCopilotV2Ledger(scope, flag);
  const after = projectTemplateCopilotV2Candidates({ ledger: before, candidates: normalized("Purchase Approval", "m-first") }).ledger;
  const candidate = after.extractionEvidence.candidates[0];
  assert.equal(after.facts["workflow.name"].status, "candidate");
  assert.deepEqual(after.facts["workflow.name"].canonicalValue, candidate.value);
  assert.equal(after.facts["workflow.name"].originalWording, candidate.originalWording);
  assert.equal(after.facts["workflow.name"].confirmation, undefined);
  assert.equal(after.facts["workflow.name"].provenance[0].kind, "message");
  assert.equal(after.facts["workflow.name"].provenance[0].sourceId, candidate.evidence[0].messageId);
  assert.deepEqual(after.facts["workflow.name"].provenance[0].sourceMessageIds, ["m-first"]);
  assert.equal(after.extractionEvidence.conflicts.length, 0);
  assert.equal(after.extractionEvidence.history.length, 0);
  unrelatedFactsStayByteIdentical(before, after, "workflow.name");
});

test("3D11 real candidate and committed conflicts retain exact incoming/existing chains without unrelated mutation", () => {
  const first = projectTemplateCopilotV2Candidates({ ledger: createTemplateCopilotV2Ledger(scope, flag), candidates: normalized("Purchase Approval", "m-one") }).ledger;
  const candidateConflict = projectTemplateCopilotV2Candidates({ ledger: first, candidates: normalized("Expense Approval", "m-two") }).ledger;
  const conflict = candidateConflict.extractionEvidence.conflicts[0];
  assert.equal(conflict.factId, "workflow.name");
  assert.equal(conflict.state, "open");
  assert.deepEqual(conflict.existing.value, first.facts["workflow.name"].canonicalValue);
  assert.deepEqual(conflict.existing.provenance, first.facts["workflow.name"].provenance);
  assert.deepEqual(conflict.existing.candidate, first.extractionEvidence.candidates[0]);
  assert.equal(conflict.incoming.factId, conflict.factId);
  assert.equal(conflict.incoming.evidence[0].messageId, "m-two");
  assert.deepEqual(candidateConflict.facts["workflow.name"], first.facts["workflow.name"]);
  unrelatedFactsStayByteIdentical(first, candidateConflict, "workflow.name");

  const committed = commit(createTemplateCopilotV2Ledger(scope, flag), "Invoice Approval");
  const committedConflict = projectTemplateCopilotV2Candidates({ ledger: committed, candidates: normalized("Purchase Approval", "m-three") }).ledger;
  const committedEntry = committedConflict.extractionEvidence.conflicts[0];
  assert.deepEqual(committedConflict.facts["workflow.name"], committed.facts["workflow.name"]);
  assert.deepEqual(committedEntry.existing.value, committed.facts["workflow.name"].canonicalValue);
  assert.deepEqual(committedEntry.existing.provenance, committed.facts["workflow.name"].provenance);
  assert.equal(committedEntry.existing.candidate, undefined);
});

test("3D11 real confirmation and keep/incoming/human resolutions serialize the exact action delta and history snapshots", async () => {
  const first = projectTemplateCopilotV2Candidates({ ledger: createTemplateCopilotV2Ledger(scope, flag), candidates: normalized("Purchase Approval", "m-confirm") }).ledger;
  const candidate = first.extractionEvidence.candidates[0];
  const confirmed = confirmTemplateCopilotV2Candidate({ ledger: first, candidateId: candidate.candidateId, actorId: actor.id, confirmedAt: "2026-07-27T01:00:00Z", beforeRevision: 4 });
  assert.equal(confirmed.extractionEvidence.candidates[0].state, "confirmed");
  assert.equal(confirmed.facts["workflow.name"].status, "committed");
  assert.deepEqual(confirmed.facts["workflow.name"].canonicalValue, candidate.value);
  assert.deepEqual(confirmed.extractionEvidence.history[0].before, { value: first.facts["workflow.name"].canonicalValue, provenance: first.facts["workflow.name"].provenance });
  assert.deepEqual(confirmed.extractionEvidence.history[0].incoming, candidate);
  unrelatedFactsStayByteIdentical(first, confirmed, "workflow.name");

  const ambiguous = projectTemplateCopilotV2Candidates({ ledger: createTemplateCopilotV2Ledger(scope, flag), candidates: [{ ...normalized("Uncertain Approval", "m-ambiguous")[0], ambiguity: "possible" }] }).ledger;
  assert.throws(() => confirmTemplateCopilotV2Candidate({ ledger: ambiguous, candidateId: ambiguous.extractionEvidence.candidates[0].candidateId, actorId: actor.id, confirmedAt: "2026-07-27T01:00:00Z" }));

  const candidateConflict = projectTemplateCopilotV2Candidates({ ledger: first, candidates: normalized("Expense Approval", "m-keep") }).ledger;
  const keepConflict = candidateConflict.extractionEvidence.conflicts[0];
  const kept = resolveProjection({ ledger: candidateConflict, conflictId: keepConflict.conflictId, resolution: "keep_existing", actorId: actor.id, confirmedAt: "2026-07-27T02:00:00Z", beforeRevision: 5 });
  assert.equal(kept.facts["workflow.name"].status, "committed");
  assert.deepEqual(kept.facts["workflow.name"].canonicalValue, keepConflict.existing.value);
  assert.equal(kept.extractionEvidence.conflicts[0].state, "closed");
  assert.deepEqual(kept.extractionEvidence.history.at(-1).before, { value: keepConflict.existing.value, provenance: keepConflict.existing.provenance });
  assert.deepEqual(kept.extractionEvidence.history.at(-1).existingCandidate, keepConflict.existing.candidate);
  assert.deepEqual(kept.extractionEvidence.history.at(-1).incoming, keepConflict.incoming);

  const committedConflict = projectTemplateCopilotV2Candidates({ ledger: commit(createTemplateCopilotV2Ledger(scope, flag), "Invoice Approval"), candidates: normalized("Purchase Approval", "m-incoming") }).ledger;
  const incomingConflict = committedConflict.extractionEvidence.conflicts[0];
  const incoming = resolveProjection({ ledger: committedConflict, conflictId: incomingConflict.conflictId, resolution: "commit_incoming", actorId: actor.id, confirmedAt: "2026-07-27T03:00:00Z", beforeRevision: 6 });
  assert.deepEqual(incoming.facts["workflow.name"].canonicalValue, incomingConflict.incoming.value);
  assert.equal(incoming.extractionEvidence.conflicts[0].state, "closed");

  const humanHarness = resolutionHarness(committedConflict);
  await resolveServer({ session: humanHarness.session, service: humanHarness.service, actor, sessionId: humanHarness.row.id, expectedRevision: 1, idempotencyKey: "human:0001", conflictId: incomingConflict.conflictId, choice: "commit_human_value", humanValue: "Human Approved Name", rationale: "Owner review", flag });
  const human = humanHarness.calls[0].args.p_ledger;
  assert.equal(human.facts["workflow.name"].canonicalValue, "Human Approved Name");
  assert.equal(human.extractionEvidence.conflicts[0].state, "closed");
  assert.equal(human.extractionEvidence.history.at(-1).choice, "commit_human_value");
  assert.equal(human.extractionEvidence.history.at(-1).humanValue, "Human Approved Name");
  assert.deepEqual(human.extractionEvidence.history.at(-1).before, { value: incomingConflict.existing.value, provenance: incomingConflict.existing.provenance, confirmation: incomingConflict.existing.confirmation });
  assert.equal(human.extractionEvidence.history.at(-1).existingCandidate, undefined);
  assert.deepEqual(human.extractionEvidence.history.at(-1).incoming, incomingConflict.incoming);
});
