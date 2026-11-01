import assert from "node:assert/strict";
import test from "node:test";
import { createTemplateCopilotV2Ledger } from "./template-copilot-facts.ts";
import { projectTemplateCopilotV2Candidates } from "./template-copilot-v2-candidates.ts";
import { bindTemplateCopilotV2DocumentIdentity, runTemplateCopilotV2DescribeCommand } from "./template-copilot-v2-describe-command.ts";

const actor = { id: "33333333-3333-4333-8333-333333333333" };
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts Payable" };

function sourceCandidate(messageId) {
  return {
    factId: "workflow.name", valueType: "text", value: "Purchase approval",
    originalWording: "Purchase approval", confidence: "high", ambiguity: "none",
    evidence: [{ path: "/", messageId, startCodePoint: 0, endCodePoint: 17, exactText: "Purchase approval" }],
  };
}

function serviceFor({ prepared, terminal }) {
  const calls = [];
  let durableUserMessage = "";
  let durableAssistantMessage = "Durable response";
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "prepare_template_copilot_v2_mode_command") {
        durableUserMessage = args.p_user_message;
        return { data: prepared(args), error: null };
      }
      if (name === "finalize_template_copilot_v2_mode_command") {
        durableAssistantMessage = args.p_detail.assistantMessage;
        return { data: terminal(args), error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from(table) {
      assert.equal(table, "template_copilot_messages");
      let sourceMessageId = "";
      return {
        select() { return this; },
        eq(column, value) {
          if (column === "client_message_id") sourceMessageId = String(value);
          return this;
        },
        order: async () => ({ data: [
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", client_message_id: sourceMessageId, role: "user", content: durableUserMessage || "Purchase approval", created_at: "2026-07-28T00:00:00.000Z" },
          { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", client_message_id: sourceMessageId, role: "assistant", content: durableAssistantMessage, created_at: "2026-07-28T00:00:00.001Z" },
        ], error: null }),
      };
    },
  };
}

function command({ service, mode = "describe_everything", sourceText = "Purchase approval", document, documentQuarantine, sectionHint, extractCandidates, fallbackReason = (error) => error.reasonCode || "provider_error" }) {
  return runTemplateCopilotV2DescribeCommand({
    session: service, service, actor, sessionId, expectedRevision: 4,
    idempotencyKey: "describe:durable:001", mode, sourceText, document, documentQuarantine, sectionHint,
    extractCandidates, fallbackReason,
  });
}

test("v2 document identity is stable for one command and distinct for a new intentional upload", () => {
  const document = { id: "req-random", fileName: "requirements.txt", sha256: "a".repeat(64), text: "Purchase approval", safety: "sanitized_untrusted_text" };
  const first = bindTemplateCopilotV2DocumentIdentity({ sessionId, idempotencyKey: "document:stable:001", document });
  const retry = bindTemplateCopilotV2DocumentIdentity({ sessionId, idempotencyKey: "document:stable:001", document: { ...document, id: "req-other-random" } });
  const intentional = bindTemplateCopilotV2DocumentIdentity({ sessionId, idempotencyKey: "document:new:002", document });
  assert.equal(retry.id, first.id);
  assert.notEqual(intentional.id, first.id);
  assert.match(first.id, /^req-[0-9a-f]{32}$/u);
});

test("Describe persists its exact source before one provider call and finalizes review-only candidates", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const service = serviceFor({
    prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger, claimToken: "claim-1", sourceMessageId: "mode-command:source-1" }),
    terminal: (args) => ({ outcome: "applied", revision: 5, status: "interviewing", ledger: args.p_ledger, detail: args.p_detail }),
  });
  let providerCalls = 0;
  const result = await command({
    service,
    extractCandidates: async ({ message, messageId, locale, section }) => {
      providerCalls += 1;
      assert.equal(message, "Purchase approval");
      assert.equal(messageId, "mode-command:source-1");
      assert.equal(locale, "en");
      assert.equal(section, "all");
      return { candidates: [sourceCandidate(messageId)] };
    },
  });
  assert.equal(providerCalls, 1);
  assert.deepEqual(service.calls.map((call) => call.name), ["prepare_template_copilot_v2_mode_command", "finalize_template_copilot_v2_mode_command"]);
  assert.equal(service.calls[0].args.p_user_message, "Purchase approval");
  assert.equal(service.calls[0].args.p_mode, "describe_everything");
  assert.equal(service.calls[0].args.p_source_kind, "narrative");
  assert.equal(service.calls[1].args.p_claim_token, "claim-1");
  assert.equal(service.calls[1].args.p_outcome, "applied");
  assert.equal(result.ledger.facts["workflow.name"].status, "candidate");
  assert.equal(result.ledger.facts["workflow.name"].confirmation, undefined, "Describe never auto-commits");
  assert.deepEqual(result.messages.map((message) => message.role), ["user", "assistant"]);
  assert.equal(result.messages[0].clientMessageId, "mode-command:source-1");
  assert.deepEqual(service.calls[1].args.p_detail.extractionDiagnostics, {
    schemaVersion: 1,
    terminalCode: "candidates_applied",
    acceptedCandidateCount: 1,
    rejectedCandidateCount: 0,
    rejectionCodeCounts: {},
    rejectedFactCounts: {},
  });
});

test("Similar differences use the broad candidate path, then return to Guided gaps without becoming an atomic answer", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const service = serviceFor({
    prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger, claimToken: "claim-similar", sourceMessageId: "mode-command:similar" }),
    terminal: (args) => ({ outcome: "applied", revision: 5, status: "interviewing", ledger: args.p_ledger, modeState: { mode: "guided" }, detail: { ...args.p_detail, entryMode: args.p_mode } }),
  });
  let providerCalls = 0;
  const result = await command({
    service, mode: "similar_template", sourceText: "Purchase approval differs by adding finance review.",
    extractCandidates: async ({ messageId }) => {
      providerCalls += 1;
      return { candidates: [sourceCandidate(messageId)] };
    },
  });
  assert.equal(providerCalls, 1);
  assert.equal(service.calls[0].args.p_mode, "similar_template");
  assert.equal(service.calls[0].args.p_source_kind, "similar_difference");
  assert.equal(service.calls[1].args.p_mode, "similar_template");
  assert.deepEqual(service.calls[1].args.p_ledger.atomicDecisions, ledger.atomicDecisions, "a Similar difference never becomes a guided atomic answer");
  assert.equal(result.ledger.facts["workflow.name"].status, "candidate");
  assert.equal(result.modeState.mode, "guided");
  assert.equal(result.detail.entryMode, "similar_template");

  const replayService = serviceFor({
    prepared: () => ({ outcome: "replayed", revision: 5, status: "interviewing", ledger: result.ledger, modeState: { mode: "guided" }, detail: { terminal: "applied", entryMode: "similar_template" } }),
    terminal: () => { throw new Error("a terminal Similar receipt must replay without finalizing again"); },
  });
  const replay = await command({
    service: replayService, mode: "similar_template", sourceText: "Purchase approval differs by adding finance review.",
    extractCandidates: async () => { throw new Error("provider must not run on exact Similar replay"); },
  });
  assert.equal(replay.outcome, "replayed");
  assert.equal(replay.modeState.mode, "guided");
  assert.equal(replayService.calls.length, 1);
});

test("replay, pending, stale, and document-limit preparations never call a provider or choose a new branch", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, { enabled: true });
  for (const outcome of ["replayed", "pending", "stale_revision", "document_limit"]) {
    const service = serviceFor({
      prepared: () => ({ outcome, revision: 5, status: "interviewing", ledger, detail: { terminal: "guided_fallback" } }),
      terminal: () => { throw new Error("terminal must not run"); },
    });
    let providerCalls = 0;
    const result = await command({ service, extractCandidates: async () => { providerCalls += 1; return { candidates: [] }; } });
    assert.equal(result.outcome, outcome);
    assert.equal(providerCalls, 0, outcome);
    assert.equal(service.calls.length, 1, outcome);
    if (outcome === "replayed") assert.deepEqual(result.messages.map((message) => message.role), ["user", "assistant"]);
  }
});

test("outage, malformed/configuration failure finalizes one durable Guided fallback without changing prior candidates", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const service = serviceFor({
    prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger, claimToken: "claim-outage", sourceMessageId: "mode-command:outage" }),
    terminal: (args) => ({ outcome: "guided_fallback", revision: 5, status: "interviewing", ledger: args.p_ledger, detail: args.p_detail }),
  });
  const result = await command({
    service,
    extractCandidates: async () => { throw Object.assign(new Error("missing config"), { reasonCode: "provider_configuration" }); },
  });
  assert.equal(result.outcome, "guided_fallback");
  assert.equal(service.calls.length, 2);
  assert.equal(service.calls[1].args.p_outcome, "guided_fallback");
  assert.equal(service.calls[1].args.p_detail.fallbackReason, "provider_configuration");
  assert.deepEqual(service.calls[1].args.p_detail.extractionDiagnostics, {
    schemaVersion: 1,
    terminalCode: "provider_failure",
    acceptedCandidateCount: 0,
    rejectedCandidateCount: 0,
    rejectionCodeCounts: {},
    rejectedFactCounts: {},
  });
  assert.equal(
    JSON.stringify(service.calls[1].args.p_detail).includes("missing config"),
    false,
    "provider error text never enters diagnostic detail",
  );
  assert.deepEqual(service.calls[1].args.p_ledger.facts, ledger.facts);
  assert.deepEqual(service.calls[1].args.p_ledger.extractionEvidence, ledger.extractionEvidence);
});

test("v2 requirement documents retain safe provenance and evidence only after the durable source message exists", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const document = { id: "req-123", fileName: "requirements.txt", sha256: "a".repeat(64), text: "Purchase approval", safety: "sanitized_untrusted_text" };
  const service = serviceFor({
    prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger, claimToken: "claim-document", sourceMessageId: "mode-command:document" }),
    terminal: (args) => ({ outcome: "applied", revision: 5, status: "interviewing", ledger: args.p_ledger, detail: args.p_detail }),
  });
  const result = await command({
    service, sourceText: document.text, document,
    documentQuarantine: {
      schemaVersion: 1,
      inspectedBlockCount: 2,
      retainedBlockCount: 1,
      quarantinedBlockCount: 1,
      reasonCounts: { instruction_override: 1 },
    },
    extractCandidates: async ({ message, messageId, locale, section }) => {
      assert.equal(message, document.text);
      assert.equal(messageId, "mode-command:document");
      assert.equal(locale, "en");
      assert.equal(section, "document");
      return {
        candidates: [sourceCandidate(messageId)],
        documentBlocks: {
          attemptedBlockCount: 1,
          completedBlockCount: 1,
          failedBlockCount: 0,
          retainedAtomCount: 1,
          truncatedAtomCount: 0,
        },
      };
    },
  });
  assert.deepEqual(result.ledger.requirementDocumentExtracts, [document]);
  assert.equal(service.calls[0].args.p_source_kind, "document");
  assert.equal(result.ledger.extractionEvidence.candidates[0].evidence[0].messageId, "mode-command:document");
  assert.equal(result.messages[0].content, document.text, "the response exposes the exact durable evidence source, not a UI file-name substitute");
  assert.deepEqual(service.calls[1].args.p_detail.document, { id: document.id, fileName: document.fileName, sha256: document.sha256, safety: document.safety });
  assert.deepEqual(service.calls[1].args.p_detail.documentQuarantine, {
    schemaVersion: 1,
    inspectedBlockCount: 2,
    retainedBlockCount: 1,
    quarantinedBlockCount: 1,
    reasonCounts: { instruction_override: 1 },
  });
  assert.deepEqual(service.calls[1].args.p_detail.documentBlockExtraction, {
    attemptedBlockCount: 1,
    completedBlockCount: 1,
    failedBlockCount: 0,
    retainedAtomCount: 1,
    truncatedAtomCount: 0,
  });
  assert.equal(service.calls[1].args.p_detail.sectionHint, "document");
  assert.equal(JSON.stringify(service.calls[1].args.p_detail).includes(document.text), false, "raw document text never enters audit detail");
});

test("Describe binds a focused section and ledger locale into extraction and replay identity", async () => {
  const ledger = createTemplateCopilotV2Ledger(
    { ...scope, locale: "zh-Hant" },
    { enabled: true },
  );
  const service = serviceFor({
    prepared: () => ({
      outcome: "prepared",
      revision: 4,
      status: "interviewing",
      ledger,
      claimToken: "claim-focused",
      sourceMessageId: "mode-command:focused",
    }),
    terminal: (args) => ({
      outcome: "applied",
      revision: 5,
      status: "interviewing",
      ledger: args.p_ledger,
      detail: args.p_detail,
    }),
  });
  await command({
    service,
    sectionHint: "attachments",
    extractCandidates: async ({ locale, section, messageId }) => {
      assert.equal(locale, "zh-Hant");
      assert.equal(section, "attachments");
      return { candidates: [sourceCandidate(messageId)] };
    },
  });
  assert.equal(service.calls[1].args.p_detail.sectionHint, "attachments");
  assert.equal(
    service.calls[0].args.p_command_hash,
    service.calls[1].args.p_command_hash,
    "preparation and finalization must bind the same focused section",
  );
  assert.notEqual(
    service.calls[0].args.p_command_hash,
    "",
    "the focused section is included in the prepared command identity",
  );
});

test("Describe persists only bounded focused-recovery counts", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const service = serviceFor({
    prepared: () => ({
      outcome: "prepared",
      revision: 4,
      status: "interviewing",
      ledger,
      claimToken: "claim-recovered",
      sourceMessageId: "mode-command:recovered",
    }),
    terminal: (args) => ({
      outcome: "applied",
      revision: 5,
      status: "interviewing",
      ledger: args.p_ledger,
      detail: args.p_detail,
    }),
  });
  const result = await command({
    service,
    sectionHint: "identity_scope",
    extractCandidates: async ({ messageId }) => ({
      candidates: [sourceCandidate(messageId)],
      recovery: {
        attemptedFactCount: 3,
        completedFactCount: 2,
        failedFactCount: 1,
      },
    }),
  });
  assert.deepEqual(result.detail.focusedRecovery, {
    attemptedFactCount: 3,
    completedFactCount: 2,
    failedFactCount: 1,
  });
  assert.equal(
    JSON.stringify(result.detail).includes("provider response"),
    false,
  );
});

test("empty, fully rejected, and duplicate broad output complete durably without fabricating candidates", async () => {
  const base = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const existing = projectTemplateCopilotV2Candidates({
    ledger: base,
    candidates: [sourceCandidate("mode-command:no-candidates")],
  }).ledger;
  const cases = [
    {
      name: "empty",
      ledger: base,
      extracted: { candidates: [] },
      expectedTerminal: "no_candidates",
      expectedAccepted: 0,
      expectedRejected: 0,
    },
    {
      name: "rejected",
      ledger: base,
      extracted: {
        candidates: [],
        rejected: [
          {
            code: "untraceable",
            detail: "workflow.name:normalization",
          },
        ],
      },
      expectedTerminal: "no_usable_candidates",
      expectedAccepted: 0,
      expectedRejected: 1,
    },
    {
      name: "duplicate",
      ledger: existing,
      extracted: [sourceCandidate("mode-command:no-candidates")],
      expectedTerminal: "no_new_candidates",
      expectedAccepted: 1,
      expectedRejected: 0,
    },
  ];
  for (const scenario of cases) {
    const service = serviceFor({
      prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger: scenario.ledger, claimToken: `claim-${scenario.name}`, sourceMessageId: "mode-command:no-candidates" }),
      terminal: (args) => ({ outcome: "applied", revision: 4, status: "interviewing", ledger: args.p_ledger, modeState: { mode: "guided" }, detail: args.p_detail }),
    });
    const extracted = Array.isArray(scenario.extracted)
      ? { candidates: scenario.extracted }
      : scenario.extracted;
    const result = await command({ service, extractCandidates: async () => extracted });
    assert.equal(service.calls[1].args.p_outcome, "no_candidates", scenario.name);
    assert.equal(result.modeState.mode, "guided", scenario.name);
    assert.equal(result.ledger.extractionEvidence.candidates.length, scenario.ledger.extractionEvidence.candidates.length, scenario.name);
    const diagnostics = service.calls[1].args.p_detail.extractionDiagnostics;
    assert.equal(diagnostics.terminalCode, scenario.expectedTerminal, scenario.name);
    assert.equal(diagnostics.acceptedCandidateCount, scenario.expectedAccepted, scenario.name);
    assert.equal(diagnostics.rejectedCandidateCount, scenario.expectedRejected, scenario.name);
    if (scenario.name === "rejected") {
      assert.deepEqual(diagnostics.rejectionCodeCounts, {
        untraceable_normalization: 1,
      });
      assert.deepEqual(diagnostics.rejectedFactCounts, {
        "workflow.name": 1,
      });
      assert.equal(
        JSON.stringify(service.calls[1].args.p_detail).includes("normalization"),
        true,
        "only the bounded reason code is retained",
      );
      assert.equal("rejected" in service.calls[1].args.p_detail, false);
    }
  }
});

test("a no-candidate document is retained once and continues with Guided gaps", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const document = { id: `req-${"a".repeat(32)}`, fileName: "requirements.txt", sha256: "b".repeat(64), text: "General background only", safety: "sanitized_untrusted_text" };
  const service = serviceFor({
    prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger, claimToken: "claim-no-document-facts", sourceMessageId: "mode-command:no-document-facts" }),
    terminal: (args) => ({ outcome: "applied", revision: 5, status: "interviewing", ledger: args.p_ledger, modeState: { mode: "guided" }, detail: args.p_detail }),
  });
  const result = await command({ service, sourceText: document.text, document, extractCandidates: async () => ({ candidates: [] }) });
  assert.equal(service.calls[1].args.p_outcome, "no_candidates");
  assert.deepEqual(result.ledger.requirementDocumentExtracts, [document]);
  assert.equal(result.modeState.mode, "guided");
});

test("partial document extraction is disclosed in the durable assistant turn in every locale", async () => {
  for (const [locale, pattern] of [
    ["en", /Only 1 of 8 document sections were analysed; 7 failed/u],
    ["zh-Hant", /只完成分析 1\/8 個部分；其餘 7 個部分未能分析/u],
    ["zh-Hans", /只完成分析 1\/8 个部分；其余 7 个部分未能分析/u],
  ]) {
    const ledger = createTemplateCopilotV2Ledger(
      { ...scope, locale },
      { enabled: true },
    );
    const document = {
      id: `req-${String(locale).padEnd(32, "a").slice(0, 32)}`,
      fileName: "requirements.txt",
      sha256: "c".repeat(64),
      text: "General background only",
      safety: "sanitized_untrusted_text",
    };
    const service = serviceFor({
      prepared: () => ({
        outcome: "prepared",
        revision: 4,
        status: "interviewing",
        ledger,
        claimToken: `claim-partial-${locale}`,
        sourceMessageId: `mode-command:partial-${locale}`,
      }),
      terminal: (args) => ({
        outcome: "applied",
        revision: 5,
        status: "interviewing",
        ledger: args.p_ledger,
        modeState: { mode: "guided" },
        detail: args.p_detail,
      }),
    });
    await command({
      service,
      sourceText: document.text,
      document,
      extractCandidates: async () => ({
        candidates: [],
        documentBlocks: {
          attemptedBlockCount: 8,
          completedBlockCount: 1,
          failedBlockCount: 7,
          retainedAtomCount: 0,
          truncatedAtomCount: 0,
        },
      }),
    });
    assert.match(
      service.calls[1].args.p_detail.assistantMessage,
      pattern,
      locale,
    );
  }
});

test("durable broad-mode assistant turns are localized in all supported locales", async () => {
  for (const [locale, pattern] of [["en", /Review the extracted suggestions/u], ["zh-Hant", /審閱已擷取的建議/u], ["zh-Hans", /审核已提取的建议/u]]) {
    const ledger = createTemplateCopilotV2Ledger({ ...scope, locale }, { enabled: true });
    const service = serviceFor({
      prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger, claimToken: `claim-${locale}`, sourceMessageId: `mode-command:${locale}` }),
      terminal: (args) => ({ outcome: "applied", revision: 5, status: "interviewing", ledger: args.p_ledger, modeState: { mode: "guided" }, detail: args.p_detail }),
    });
    await command({ service, extractCandidates: async ({ messageId }) => ({ candidates: [sourceCandidate(messageId)] }) });
    assert.match(service.calls[1].args.p_detail.assistantMessage, pattern, locale);
  }
});
