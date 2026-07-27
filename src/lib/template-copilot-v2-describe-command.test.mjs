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

function command({ service, mode = "describe_everything", sourceText = "Purchase approval", document, extractCandidates, fallbackReason = (error) => error.reasonCode || "provider_error" }) {
  return runTemplateCopilotV2DescribeCommand({
    session: service, service, actor, sessionId, expectedRevision: 4,
    idempotencyKey: "describe:durable:001", mode, sourceText, document,
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
    extractCandidates: async ({ message, messageId }) => {
      providerCalls += 1;
      assert.equal(message, "Purchase approval");
      assert.equal(messageId, "mode-command:source-1");
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
    extractCandidates: async ({ message, messageId }) => {
      assert.equal(message, document.text);
      assert.equal(messageId, "mode-command:document");
      return { candidates: [sourceCandidate(messageId)] };
    },
  });
  assert.deepEqual(result.ledger.requirementDocumentExtracts, [document]);
  assert.equal(service.calls[0].args.p_source_kind, "document");
  assert.equal(result.ledger.extractionEvidence.candidates[0].evidence[0].messageId, "mode-command:document");
  assert.equal(result.messages[0].content, document.text, "the response exposes the exact durable evidence source, not a UI file-name substitute");
  assert.deepEqual(service.calls[1].args.p_detail.document, { id: document.id, fileName: document.fileName, sha256: document.sha256, safety: document.safety });
  assert.equal(JSON.stringify(service.calls[1].args.p_detail).includes(document.text), false, "raw document text never enters audit detail");
});

test("empty, fully rejected, and duplicate broad output complete durably without fabricating candidates", async () => {
  const base = createTemplateCopilotV2Ledger(scope, { enabled: true });
  const existing = projectTemplateCopilotV2Candidates({
    ledger: base,
    candidates: [sourceCandidate("mode-command:no-candidates")],
  }).ledger;
  const cases = [
    { name: "empty", ledger: base, extracted: { candidates: [] } },
    { name: "rejected", ledger: base, extracted: { candidates: [], rejected: [{ index: 0, reason: "invalid_evidence", factId: "workflow.name" }] } },
    { name: "duplicate", ledger: existing, extracted: { candidates: [sourceCandidate("mode-command:no-candidates")] } },
  ];
  for (const scenario of cases) {
    const service = serviceFor({
      prepared: () => ({ outcome: "prepared", revision: 4, status: "interviewing", ledger: scenario.ledger, claimToken: `claim-${scenario.name}`, sourceMessageId: "mode-command:no-candidates" }),
      terminal: (args) => ({ outcome: "applied", revision: 4, status: "interviewing", ledger: args.p_ledger, modeState: { mode: "guided" }, detail: args.p_detail }),
    });
    const result = await command({ service, extractCandidates: async () => scenario.extracted });
    assert.equal(service.calls[1].args.p_outcome, "no_candidates", scenario.name);
    assert.equal(result.modeState.mode, "guided", scenario.name);
    assert.equal(result.ledger.extractionEvidence.candidates.length, scenario.ledger.extractionEvidence.candidates.length, scenario.name);
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
