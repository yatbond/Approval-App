import assert from "node:assert/strict";
import test from "node:test";
import { applyTemplateCopilotV2FactTransition, createTemplateCopilotV2Ledger, templateCopilotFactIds } from "./template-copilot-facts.ts";
import { confirmTemplateCopilotV2Candidate, projectTemplateCopilotV2Candidates } from "./template-copilot-v2-candidates.ts";
import { candidatesFromTemplateCopilotV2SourceSnapshot, templateCopilotV2ModeCommandSchema, templateCopilotV2ModeCopy } from "./template-copilot-v2-modes.ts";
import { createTemplateCopilotV2SourceSnapshot } from "./template-copilot-v2-source-snapshot.ts";
import { getTemplateCopilotV2ModeFlags, isTemplateCopilotV2ModeEnabled } from "./template-copilot-v2-feature.ts";
import { getTemplateCopilotV2InterviewState } from "./template-copilot-question-library.ts";

const enabled = { enabled: true };
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts Payable" };
const row = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", template_key: "supplier-payment", version_number: 4,
  template_snapshot: {
    name: "Supplier payment", business: "Finance", department: "Accounts Payable",
    fields: [{ label: "Invoice number", type: "text", required: true, options: [] }],
    documents: [{ documentType: "Invoice", required: true, format: "pdf" }],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Start" },
        { id: "submit", kind: "submit_request", label: "Submit invoice", dueInHours: 48 },
        { id: "finance", kind: "approval", label: "Finance approval", assigneeEmail: "finance@example.com", assigneeEmailFixed: true, dueInHours: 48 },
        { id: "info", kind: "for_information", label: "Tell requester", assigneeEmail: "requester-notices@example.com", assigneeEmailFixed: true, dueInHours: 48 },
        { id: "end", kind: "end", label: "End" },
      ],
      edges: [
        { sourceId: "start", targetId: "submit" },
        { sourceId: "submit", targetId: "finance" },
        { sourceId: "finance", targetId: "info" },
        { sourceId: "info", targetId: "end" },
      ],
    },
  },
};

test("Step 6 source snapshot is version-bound, deterministic, and candidate-only", () => {
  const persisted = { ...row, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-02T00:00:00.000Z" };
  const snapshot = createTemplateCopilotV2SourceSnapshot(persisted);
  const laterLiveRow = { ...row, template_snapshot: { ...row.template_snapshot, name: "Changed after selection" } };
  assert.equal(snapshot.name, "Supplier payment");
  assert.equal(snapshot.capturedAt, "2026-07-02T00:00:00.000Z", "snapshot identity comes from persisted source version metadata");
  assert.equal(snapshot.snapshotHash, createTemplateCopilotV2SourceSnapshot({ ...persisted, template_snapshot: { ...persisted.template_snapshot } }).snapshotHash, "selection wall-clock cannot affect a command hash");
  assert.notEqual(snapshot.snapshotHash, createTemplateCopilotV2SourceSnapshot(laterLiveRow).snapshotHash);
  const candidates = candidatesFromTemplateCopilotV2SourceSnapshot(snapshot);
  assert.ok(candidates.length >= 4, "compatible name, fields, documents, and actionable process stages are imported");
  assert.deepEqual(candidates.find((candidate) => candidate.factId === "attachments.requirements")?.value, [
    { label: "Invoice", required: true, formats: ["pdf"] },
  ]);
  assert.deepEqual(candidates.find((candidate) => candidate.factId === "workflow.stages")?.value, [
    { label: "Submit invoice", kind: "submission", participant: { mode: "requester" }, sequence: 1 },
    { label: "Finance approval", kind: "approval", participant: { mode: "fixed_email", value: "finance@example.com" }, sequence: 2 },
    { label: "Tell requester", kind: "for_information", participant: { mode: "fixed_email", value: "requester-notices@example.com" }, sequence: 3 },
  ]);
  assert.deepEqual(candidates.find((candidate) => candidate.factId === "timing.rules")?.value, { defaultDueHours: 48 });
  assert.ok(candidates.every((candidate) => candidate.evidence.every((evidence) => evidence.messageId === `template-version:${snapshot.versionId}`)));
  const ledger = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  const projected = projectTemplateCopilotV2Candidates({ ledger, candidates });
  assert.equal(projected.ledger.facts["workflow.name"].status, "candidate", "import never commits a source value");
  assert.equal(projected.ledger.facts["workflow.name"].confirmation, undefined);
  assert.ok(projected.ledger.extractionEvidence.candidates.every((candidate) => candidate.evidence.every((evidence) => evidence.messageId === `template-version:${snapshot.versionId}`)));
});

test("all entry modes retain the same deterministic controller path and preserve unrelated facts", () => {
  const base = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  const snapshot = createTemplateCopilotV2SourceSnapshot(row);
  const actorId = "33333333-3333-4333-8333-333333333333";
  const confirmedAt = "2026-07-27T12:00:00.000Z";
  const provenance = [{ kind: "human_editor", sourceId: "test:guided", sourceMessageIds: [] }];
  const withUnrelatedFact = applyTemplateCopilotV2FactTransition({
    ledger: base,
    factId: "governance.retention",
    transition: { operation: "human_commit", payload: { canonicalValue: { period: "7 years", rationale: "Corporate records policy" }, provenance } },
    actorId,
    confirmedAt,
    flag: enabled,
  });
  const guided = applyTemplateCopilotV2FactTransition({
    ledger: withUnrelatedFact,
    factId: "workflow.name",
    transition: { operation: "human_commit", payload: { canonicalValue: "Supplier payment", provenance } },
    actorId,
    confirmedAt,
    flag: enabled,
  });
  const nameCandidate = candidatesFromTemplateCopilotV2SourceSnapshot(snapshot).filter((candidate) => candidate.factId === "workflow.name");
  assert.equal(nameCandidate.length, 1);
  const proposed = projectTemplateCopilotV2Candidates({ ledger: withUnrelatedFact, candidates: nameCandidate }).ledger;
  const similar = confirmTemplateCopilotV2Candidate({ ledger: proposed, candidateId: proposed.extractionEvidence.candidates[0].candidateId, actorId, confirmedAt });
  // Describe and Similar both enter through the same candidate projector and
  // human-confirmation transition; the mode itself is not a compiler input.
  const described = confirmTemplateCopilotV2Candidate({ ledger: projectTemplateCopilotV2Candidates({ ledger: withUnrelatedFact, candidates: nameCandidate }).ledger, candidateId: proposed.extractionEvidence.candidates[0].candidateId, actorId, confirmedAt });
  const semanticInput = (ledger) => Object.fromEntries(templateCopilotFactIds.map((factId) => [factId, {
    status: ledger.facts[factId].status,
    canonicalValue: ledger.facts[factId].canonicalValue,
    notApplicableReason: ledger.facts[factId].notApplicableReason,
  }]));
  assert.deepEqual(semanticInput(guided), semanticInput(described));
  assert.deepEqual(semanticInput(guided), semanticInput(similar), "equivalent confirmed facts yield one mode-independent compiler input");
  assert.deepEqual(getTemplateCopilotV2InterviewState(guided), getTemplateCopilotV2InterviewState(described));
  assert.deepEqual(getTemplateCopilotV2InterviewState(guided), getTemplateCopilotV2InterviewState(similar), "equivalent ledgers yield the same deterministic gap order");
  assert.deepEqual(similar.facts["governance.retention"].canonicalValue, { period: "7 years", rationale: "Corporate records policy" }, "mode import cannot weaken an unrelated confirmed fact");
});

test("Similar never flattens branches or fabricates a global due time", () => {
  const branched = createTemplateCopilotV2SourceSnapshot({
    ...row,
    template_snapshot: {
      ...row.template_snapshot,
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start" },
          { id: "finance", kind: "approval", label: "Finance", assigneeEmail: "finance@example.com", assigneeEmailFixed: true, dueInHours: 24 },
          { id: "legal", kind: "review", label: "Legal", assigneeEmail: "legal@example.com", assigneeEmailFixed: true },
          { id: "manager", kind: "approval", label: "Manager", assigneeEmail: "manager@example.com", assigneeEmailFixed: true, dueInHours: 24 },
          { id: "end", kind: "end", label: "End" },
        ],
        edges: [
          { sourceId: "start", targetId: "finance" },
          { sourceId: "start", targetId: "legal" },
          { sourceId: "finance", targetId: "manager" },
          { sourceId: "legal", targetId: "manager" },
          { sourceId: "manager", targetId: "end" },
        ],
      },
    },
  });
  const candidates = candidatesFromTemplateCopilotV2SourceSnapshot(branched);
  assert.equal(candidates.some((candidate) => candidate.factId === "workflow.stages"), false);
  assert.equal(candidates.some((candidate) => candidate.factId === "timing.rules"), false);
});

test("one unrepresentable Similar fact cannot erase other safe candidates", () => {
  const manyFields = Array.from({ length: 67 }, (_, index) => ({
    label: `Ordinary field ${String(index + 1).padStart(2, "0")} ${"x".repeat(100)}`,
    type: "text",
    required: index % 2 === 0,
    options: [],
  }));
  const snapshot = createTemplateCopilotV2SourceSnapshot({
    ...row,
    template_snapshot: {
      ...row.template_snapshot,
      name: "Large source remains identifiable",
      fields: manyFields,
    },
  });
  const candidates = candidatesFromTemplateCopilotV2SourceSnapshot(snapshot);
  assert.equal(candidates.find((candidate) => candidate.factId === "workflow.name")?.value, "Large source remains identifiable");
  assert.equal(candidates.some((candidate) => candidate.factId === "request.fields"), false, "the >8k/200-leaf fact is omitted independently");
  assert.ok(candidates.some((candidate) => candidate.factId === "attachments.requirements"));
});

test("mode command requires source only for similar-template and independent flags roll back safely", () => {
  const base = { expectedRevision: 1, idempotencyKey: "mode:test:123" };
  assert.equal(templateCopilotV2ModeCommandSchema.safeParse({ ...base, mode: "guided" }).success, true);
  assert.equal(templateCopilotV2ModeCommandSchema.safeParse({ ...base, mode: "describe_everything" }).success, true);
  assert.equal(templateCopilotV2ModeCommandSchema.safeParse({ ...base, mode: "similar_template" }).success, false);
  assert.equal(templateCopilotV2ModeCommandSchema.safeParse({ ...base, mode: "similar_template", sourceVersionId: row.id }).success, true);
  assert.deepEqual(getTemplateCopilotV2ModeFlags({ TEMPLATE_COPILOT_V2_GUIDED: "true", TEMPLATE_COPILOT_V2_DESCRIBE_EVERYTHING: "false", TEMPLATE_COPILOT_V2_SIMILAR_TEMPLATE: "true" }), { guided: true, describeEverything: false, similarTemplate: true });
  assert.equal(isTemplateCopilotV2ModeEnabled("describe_everything", { TEMPLATE_COPILOT_V2_DESCRIBE_EVERYTHING: "false" }), false);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) assert.ok(templateCopilotV2ModeCopy(locale).switch.length > 0);
});
