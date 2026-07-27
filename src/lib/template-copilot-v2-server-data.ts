import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import {
  applyTemplateCopilotV2FactTransition,
  applyTemplateCopilotV2AtomicDecision,
  approveLegacyTemplateCopilotUpgrade,
  createTemplateCopilotV2Ledger,
  previewLegacyTemplateCopilotUpgrade,
  templateCopilotV2LedgerSchema,
  templateCopilotStoredLedgerSchema,
  TemplateCopilotFactTransitionError,
  type TemplateCopilotFactId,
  type V2FactTransition,
} from "./template-copilot-facts.ts";
import { getTemplateCopilotReadiness } from "./template-copilot-readiness.ts";
import { requireTemplateCopilotV2, type TemplateCopilotV2Flag } from "./template-copilot-v2-feature.ts";
import { getTemplateCopilotQuestionLibrary, getTemplateCopilotV2InterviewState, getTemplateCopilotV2SpecialReview, reopenTemplateCopilotV2Decision, type TemplateCopilotAtomicAnswerInput } from "./template-copilot-question-library.ts";
import { orderTemplateCopilotMessages } from "./template-copilot-history.ts";

export function templateCopilotV2CommandHash(command: unknown) {
  return createHash("sha256").update(JSON.stringify(sortJson(command))).digest("hex");
}

export async function createTemplateCopilotV2Session({ service, actor, clientMessageId, scope, flag }: {
  service: SupabaseClient; actor: ApprovalRuntimeProfile; clientMessageId: string;
  scope: { businessUnitId: string; businessName: string; departmentId: string; departmentName: string; locale: "en" | "zh-Hant" | "zh-Hans" };
  flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const ledger = createTemplateCopilotV2Ledger(scope, flag);
  const interview = getTemplateCopilotV2InterviewState(ledger);
  const introduction = scope.locale === "zh-Hant"
    ? "我會逐步詢問簡單問題，協助你建立可供審核的流程方案。"
    : scope.locale === "zh-Hans"
      ? "我会逐步询问简单问题，帮助你建立可供审核的流程方案。"
      : "I’ll ask one simple question at a time to build a workflow proposal for review.";
  const assistantMessage = interview.state === "question" && interview.nextQuestion
    ? `${introduction} ${interview.nextQuestion.prompt}`
    : introduction;
  const commandHash = templateCopilotV2CommandHash({ operation: "create_session", clientMessageId, ledger });
  const { data, error } = await service.rpc("create_template_copilot_v2_session", {
    p_actor_id: actor.id, p_client_message_id: clientMessageId, p_command_hash: commandHash,
    p_ledger: ledger, p_assistant_message: assistantMessage,
  });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return { ...withV2InterviewState(result), assistantMessage };
}

/** Loads the owner-scoped authoritative row, derives actor/time server-side,
 * computes one typed fact transition, then asks the locked RPC to apply that
 * exact revision. A concurrent change can only return stale_revision; it can
 * never be overwritten by this pre-computed transition. */
export async function applyTemplateCopilotV2Mutation({
  session, service, actor, sessionId, expectedRevision, idempotencyKey, transition, factId, flag,
}: {
  session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string;
  expectedRevision: number; idempotencyKey: string; factId: TemplateCopilotFactId; transition: V2FactTransition; flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const commandHash = templateCopilotV2CommandHash({ operation: transition.operation, sessionId, expectedRevision, factId, transition });
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  if (replay) return withV2InterviewState(replay);
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const confirmedAt = new Date().toISOString();
  const nextLedger = applyTemplateCopilotV2FactTransition({ ledger: stored.ledger, factId, transition, actorId: actor.id, confirmedAt, flag });
  const interview = getTemplateCopilotV2InterviewState(nextLedger);
  const readiness = getTemplateCopilotReadiness(nextLedger, { compilerValid: false, publishedRevisionMatches: false, inapplicableFactIds: interview.inapplicableFactIds });
  const { data, error } = await service.rpc("mutate_template_copilot_v2_fact", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: commandHash, p_operation: transition.operation,
    p_fact_id: factId, p_fact_entry: nextLedger.facts[factId], p_readiness: readiness,
  });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return withV2InterviewState(result);
}

export async function applyTemplateCopilotV2AtomicAnswer({ session, service, actor, sessionId, expectedRevision, idempotencyKey, answer, flag }: { session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string; expectedRevision: number; idempotencyKey: string; answer: TemplateCopilotAtomicAnswerInput | string; flag?: TemplateCopilotV2Flag }) {
  requireTemplateCopilotV2(flag);
  let input: TemplateCopilotAtomicAnswerInput = typeof answer === "string" ? { kind: "text", text: answer } : answer;
  // The caller cannot name a decision or a next question.  The receipt hash
  // binds precisely the only user supplied content, so a retry is resolvable
  // before we inspect a later version of the interview.
  const commandHash = templateCopilotV2CommandHash({ operation: "atomic_answer", sessionId, expectedRevision, idempotencyKey, answer: input });
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  // Receipts deliberately retain only small replay metadata.  Ask the locked
  // RPC for the current ledger so a lost response can be replayed even after
  // later answers completed the interview; do not rebuild an old transition.
  if (replay) {
    const replayMetadata = replay as { decisionId?: unknown; questionId?: unknown };
    const { data, error } = await service.rpc("answer_template_copilot_v2_decision", {
      p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey, p_command_hash: commandHash,
      p_decision_id: typeof replayMetadata.decisionId === "string" ? replayMetadata.decisionId : "decision.replay.placeholder",
      p_ledger: stored.ledger, p_question_id: typeof replayMetadata.questionId === "string" ? replayMetadata.questionId : "v2.replay.placeholder",
      p_user_message: "", p_assistant_message: "", p_user_detail: {}, p_assistant_detail: {},
    });
    if (error) throw error;
    const result = withV2InterviewState(data as Record<string, unknown>);
    const currentLedger = result.ledger ? templateCopilotV2LedgerSchema.parse(result.ledger) : stored.ledger;
    return { ...result, assistantMessage: atomicAssistantMessage(currentLedger.locale, getTemplateCopilotV2InterviewState(currentLedger)) };
  }
  const interview = getTemplateCopilotV2InterviewState(stored.ledger);
  if (!interview.nextQuestion) return { outcome: "invalid_transition" };
  const question = getTemplateCopilotQuestionLibrary(stored.ledger.questionLibraryVersion).questions.find((candidate) => candidate.questionId === interview.nextQuestion?.questionId);
  if (!question) throw new Error("The server-selected question is unavailable.");
  if (question.answer.type === "choice") {
    if (input.kind !== "choice") throw new TemplateCopilotFactTransitionError("Choose one of the listed options for this question.");
    const optionId = input.optionId;
    const option = question.answer.options?.find((candidate) => candidate.optionId === optionId);
    if (!option) throw new TemplateCopilotFactTransitionError("That option is not available for this question.");
    input = { kind: "choice", optionId: option.optionId };
  } else if (input.kind !== "text") {
    throw new TemplateCopilotFactTransitionError("Please enter a short answer for this question.");
  }
  const nextLedger = applyTemplateCopilotV2AtomicDecision({ ledger: stored.ledger, decisionId: interview.nextQuestion.primaryDecisionId, answer: input.kind === "choice" ? { kind: "choice", optionId: input.optionId, display: question.answer.options?.find((option) => option.optionId === input.optionId)?.label[stored.ledger.locale] || input.optionId } : input, provenance: [{ kind: "human_editor", sourceId: `answer:${idempotencyKey}`, sourceMessageIds: [] }], answeredAt: new Date().toISOString(), flag });
  const nextInterview = getTemplateCopilotV2InterviewState(nextLedger);
  const assistantMessage = atomicAssistantMessage(stored.ledger.locale, nextInterview);
  const selectedOption = input.kind === "choice" ? question.answer.options?.find((option) => option.optionId === input.optionId) : undefined;
  const userMessage = input.kind === "text" ? input.text : selectedOption?.label[stored.ledger.locale] || input.optionId;
  const { data, error } = await service.rpc("answer_template_copilot_v2_decision", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey, p_command_hash: commandHash,
    p_decision_id: interview.nextQuestion.primaryDecisionId, p_ledger: nextLedger, p_question_id: interview.nextQuestion.questionId,
    p_user_message: userMessage, p_assistant_message: assistantMessage,
    p_user_detail: { schemaVersion: 2, questionId: interview.nextQuestion.questionId, decisionId: interview.nextQuestion.primaryDecisionId, answerKind: input.kind, ...(input.kind === "choice" ? { optionId: input.optionId } : {}), idempotencyKey, provenance: "human_editor" },
    p_assistant_detail: { schemaVersion: 2, decisionId: interview.nextQuestion.primaryDecisionId, status: nextInterview.state, ...(nextInterview.nextQuestion ? { nextQuestionId: nextInterview.nextQuestion.questionId } : {}) },
  });
  if (error) throw error;
  return withV2InterviewState(data as Record<string, unknown>);
}

export type TemplateCopilotV2SpecialDecision = Readonly<{ operation: "defer" } | { operation: "not_applicable"; reason: string } | { operation: "reopen"; decisionId: string }>;

type TemplateCopilotV2PersistedCommandMessage = Readonly<{
  id: string;
  clientMessageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}>;

/** Read-only receipt reconciliation for an ambiguous browser request. The
 * service-role preflight performs the owner check before inspecting a receipt,
 * so an Admin's broader read policy cannot reveal another owner's command. */
export async function reconcileTemplateCopilotV2SpecialDecision({ session, service, actor, sessionId, expectedRevision, idempotencyKey, command, flag }: { session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string; expectedRevision: number; idempotencyKey: string; command: TemplateCopilotV2SpecialDecision; flag?: TemplateCopilotV2Flag }) {
  requireTemplateCopilotV2(flag);
  const commandHash = templateCopilotV2CommandHash({ operation: "special_decision", sessionId, expectedRevision, idempotencyKey, command });
  const current = await preflightTemplateCopilotV2SpecialDecision({ service, actorId: actor.id, sessionId, idempotencyKey, commandHash });
  const result = withV2InterviewState(current);
  if (current.outcome !== "committed") return result;
  const messages = await loadV2PersistedCommandTranscript(session, sessionId, idempotencyKey);
  return { ...result, messages };
}

export async function applyTemplateCopilotV2SpecialDecision({ session, service, actor, sessionId, expectedRevision, idempotencyKey, command, flag }: { session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string; expectedRevision: number; idempotencyKey: string; command: TemplateCopilotV2SpecialDecision; flag?: TemplateCopilotV2Flag }) {
  requireTemplateCopilotV2(flag);
  const commandHash = templateCopilotV2CommandHash({ operation: "special_decision", sessionId, expectedRevision, idempotencyKey, command });
  const preflight = await preflightTemplateCopilotV2SpecialDecision({ service, actorId: actor.id, sessionId, idempotencyKey, commandHash });
  if (preflight.outcome === "committed") {
    const result = withV2InterviewState({ ...preflight, outcome: "replayed" });
    const messages = await loadV2PersistedCommandTranscript(session, sessionId, idempotencyKey);
    const userMessage = messages.find((message) => message.role === "user")?.content;
    const assistantMessage = messages.find((message) => message.role === "assistant")?.content;
    return { ...result, messages, userMessage, assistantMessage };
  }
  if (preflight.outcome !== "missing") return withV2InterviewState(preflight);

  // Only a missing receipt proceeds to projection. Invalid or unavailable
  // projections are represented explicitly and sent to the locked mutation
  // RPC; the application never fabricates a plausible ledger delta.
  const storedLedgerResult = templateCopilotV2LedgerSchema.safeParse(preflight.ledger);
  let projectionValid = false;
  let nextLedger: unknown = preflight.ledger ?? {};
  let decisionId = command.operation === "reopen" ? command.decisionId : "decision.invalid.placeholder";
  let removedDecisionIds: string[] = [];
  let nextInterview: ReturnType<typeof getTemplateCopilotV2InterviewState> | undefined;
  if (storedLedgerResult.success) {
    const storedLedger = storedLedgerResult.data;
    try {
      const current = getTemplateCopilotV2InterviewState(storedLedger);
      const library = getTemplateCopilotQuestionLibrary(storedLedger.questionLibraryVersion);
      if (command.operation === "reopen") {
        const existing = storedLedger.atomicDecisions[command.decisionId];
        if (!existing || !["unknown", "not_applicable"].includes(existing.kind)) throw new TemplateCopilotFactTransitionError("This decision cannot be reopened.");
        ({ ledger: nextLedger, removedDecisionIds } = reopenTemplateCopilotV2Decision({ ledgerInput: storedLedger, decisionId: command.decisionId, libraryInput: library }));
      } else {
        const questionId = current.nextQuestion?.questionId;
        decisionId = current.nextQuestion?.primaryDecisionId || decisionId;
        const question = library.questions.find((candidate) => candidate.questionId === questionId);
        if (!question || storedLedger.atomicDecisions[decisionId]) throw new TemplateCopilotFactTransitionError("The current question is unavailable.");
        if (command.operation === "not_applicable" && question.uncertainty.notApplicable !== "when_optional") throw new TemplateCopilotFactTransitionError("The current question is required.");
        const display = command.operation === "defer" ? (storedLedger.locale === "zh-Hant" ? "未能確定" : storedLedger.locale === "zh-Hans" ? "暂不确定" : "Not sure") : (storedLedger.locale === "zh-Hant" ? "不適用" : storedLedger.locale === "zh-Hans" ? "不适用" : "Not applicable");
        nextLedger = templateCopilotV2LedgerSchema.parse({ ...storedLedger, atomicDecisions: { ...storedLedger.atomicDecisions, [decisionId]: { kind: command.operation === "defer" ? "unknown" : "not_applicable", answer: command.operation === "defer" ? "unknown" : "not_applicable", display, ...(command.operation === "not_applicable" ? { reason: command.reason.trim() } : {}), provenance: [{ kind: "human_editor", sourceId: `special:${idempotencyKey}`, sourceMessageIds: [] }], answeredAt: new Date().toISOString() } } });
      }
      nextInterview = getTemplateCopilotV2InterviewState(templateCopilotV2LedgerSchema.parse(nextLedger));
      projectionValid = true;
    } catch {
      nextLedger = storedLedger;
      removedDecisionIds = [];
    }
  }
  const transcript = projectionValid && storedLedgerResult.success && nextInterview
    ? specialTranscript(storedLedgerResult.data.locale, command, nextInterview)
    : { userMessage: "Invalid special decision.", assistantMessage: "The requested action cannot be applied to the current interview." };
  const userDetail = projectionValid && nextInterview
    ? { schemaVersion: 2, operation: command.operation, decisionId, ...(command.operation === "not_applicable" ? { reason: command.reason.trim() } : {}) }
    : {};
  const assistantDetail = projectionValid && nextInterview
    ? { schemaVersion: 2, operation: command.operation, decisionId, status: nextInterview.state, ...(nextInterview.nextQuestion ? { nextQuestionId: nextInterview.nextQuestion.questionId } : {}) }
    : {};
  const { data, error } = await service.rpc("apply_template_copilot_v2_special_decision", { p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey, p_command_hash: commandHash, p_operation: command.operation, p_projection_valid: projectionValid, p_decision_id: decisionId, p_removed_decision_ids: removedDecisionIds, p_ledger: nextLedger, p_user_message: transcript.userMessage, p_assistant_message: transcript.assistantMessage, p_user_detail: userDetail, p_assistant_detail: assistantDetail });
  if (error) throw error;
  const result = withV2InterviewState(data as Record<string, unknown>);
  // A concurrent exact invocation can create the receipt after our initial
  // read but before this RPC obtains its lock. Treat that RPC-level replay the
  // same as an initially observed replay and load its canonical historical
  // rows instead of describing the now-current interview.
  if (result.outcome === "replayed") {
    const messages = await loadV2PersistedCommandTranscript(session, sessionId, idempotencyKey);
    return {
      ...result,
      messages,
      userMessage: messages.find((message) => message.role === "user")?.content,
      assistantMessage: messages.find((message) => message.role === "assistant")?.content,
    };
  }
  if (result.outcome !== "applied") return result;
  const currentLedger = templateCopilotV2LedgerSchema.parse(result.ledger);
  return { ...result, ...specialTranscript(currentLedger.locale, command, getTemplateCopilotV2InterviewState(currentLedger)) };
}

function specialTranscript(locale: "en" | "zh-Hant" | "zh-Hans", command: TemplateCopilotV2SpecialDecision, interview: ReturnType<typeof getTemplateCopilotV2InterviewState>) {
  const labels = locale === "zh-Hant"
    ? { defer: "未能確定", na: "不適用", reopen: "重新開啟此決定", deferred: "此決定已標記為未能確定。重新開啟後才可繼續。", reopened: "此決定及其相關答案已重新開啟。", marked: "此部分已標記為不適用。" }
    : locale === "zh-Hans"
      ? { defer: "暂不确定", na: "不适用", reopen: "重新打开此决定", deferred: "此决定已标记为暂不确定。重新打开后才可继续。", reopened: "此决定及其相关答案已重新打开。", marked: "此部分已标记为不适用。" }
      : { defer: "Not sure", na: "Not applicable", reopen: "Reopen this decision", deferred: "This decision is marked as not yet known. Reopen it to continue.", reopened: "This decision and its dependent answers have been reopened.", marked: "This part is marked not applicable." };
  const acknowledgement = command.operation === "defer" ? labels.deferred : command.operation === "reopen" ? labels.reopened : labels.marked;
  // The committed transcript retains exactly the next prompt shown at this
  // revision.  A later replay presents the then-current prompt separately
  // without rewriting the historical row.
  const next = atomicAssistantMessage(locale, interview);
  return { userMessage: command.operation === "defer" ? labels.defer : command.operation === "reopen" ? labels.reopen : `${labels.na}: ${command.reason.trim()}`, assistantMessage: `${acknowledgement} ${next}`.trim() };
}

function atomicAssistantMessage(locale: "en" | "zh-Hant" | "zh-Hans", interview: ReturnType<typeof getTemplateCopilotV2InterviewState>) {
  if (interview.state === "question" && interview.nextQuestion) return interview.nextQuestion.prompt;
  if (interview.state === "complete") return locale === "zh-Hant" ? "所有適用的決定已完成。" : locale === "zh-Hans" ? "所有适用的决定已完成。" : "All applicable decisions are complete.";
  return locale === "zh-Hant" ? "此訪談需要重新載入後才能繼續。" : locale === "zh-Hans" ? "此访谈需要重新加载后才能继续。" : "This interview needs to be reloaded before it can continue.";
}

export async function previewTemplateCopilotV1Upgrade({ session, sessionId, flag }: { session: SupabaseClient; sessionId: string; flag?: TemplateCopilotV2Flag }) {
  requireTemplateCopilotV2(flag);
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 1) return null;
  return previewLegacyTemplateCopilotUpgrade({ legacyInput: stored.ledger, sessionId, sourceRevision: Number(stored.revision) });
}

export async function approveTemplateCopilotV1Upgrade({ session, service, actor, sessionId, expectedRevision, idempotencyKey, previewHash, flag }: {
  session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string; expectedRevision: number; idempotencyKey: string; previewHash: string; flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const commandHash = templateCopilotV2CommandHash({ operation: "legacy_upgrade", sessionId, expectedRevision, previewHash, targetQuestionLibraryVersion: "v2.0" });
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  if (replay) return withV2InterviewState(replay);
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 1) return { outcome: "not_found" };
  const preview = previewLegacyTemplateCopilotUpgrade({ legacyInput: stored.ledger, sessionId, sourceRevision: Number(stored.revision) });
  if (preview.sourceRevision !== expectedRevision || preview.previewHash !== previewHash) return { outcome: "stale_preview", currentRevision: stored.revision };
  const nextLedger = approveLegacyTemplateCopilotUpgrade({ legacyInput: stored.ledger, preview, previewHash, flag });
  const approvedCommandHash = templateCopilotV2CommandHash({ operation: "legacy_upgrade", sessionId, expectedRevision, previewHash, targetQuestionLibraryVersion: preview.targetQuestionLibraryVersion });
  const { data, error } = await service.rpc("upgrade_template_copilot_v1_session", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: approvedCommandHash, p_preview_hash: previewHash, p_ledger: nextLedger,
  });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return withV2InterviewState(result);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortJson(child)]));
  return value;
}

async function loadV2PersistedCommandTranscript(session: SupabaseClient, sessionId: string, idempotencyKey: string): Promise<TemplateCopilotV2PersistedCommandMessage[]> {
  const { data: transcriptRows, error: transcriptError } = await session
    .from("template_copilot_messages")
    .select("id,client_message_id,role,content,created_at")
    .eq("session_id", sessionId)
    .eq("client_message_id", idempotencyKey)
    .order("created_at", { ascending: true });
  if (transcriptError) throw transcriptError;
  const messages = orderTemplateCopilotMessages(transcriptRows || []).flatMap((row) => {
    if ((row.role !== "user" && row.role !== "assistant")
      || typeof row.id !== "string"
      || typeof row.client_message_id !== "string"
      || row.client_message_id !== idempotencyKey
      || typeof row.content !== "string"
      || typeof row.created_at !== "string") return [];
    return [{
      id: row.id,
      clientMessageId: row.client_message_id,
      role: row.role,
      content: row.content,
      // Keep the database timestamp verbatim, including microseconds. The
      // browser uses this value for deterministic transcript recovery.
      createdAt: row.created_at,
    }];
  });
  const userCount = messages.filter((message) => message.role === "user").length;
  const assistantCount = messages.filter((message) => message.role === "assistant").length;
  if (messages.length !== 2 || userCount !== 1 || assistantCount !== 1) {
    throw new Error("The persisted Template Copilot command transcript is incomplete.");
  }
  return messages;
}

async function preflightTemplateCopilotV2SpecialDecision({ service, actorId, sessionId, idempotencyKey, commandHash }: {
  service: SupabaseClient;
  actorId: string;
  sessionId: string;
  idempotencyKey: string;
  commandHash: string;
}) {
  const { data, error } = await service.rpc("reconcile_template_copilot_v2_special_decision", {
    p_actor_id: actorId,
    p_session_id: sessionId,
    p_idempotency_key: idempotencyKey,
    p_command_hash: commandHash,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The special decision preflight returned an invalid response.");
  const result = data as Record<string, unknown>;
  if (!["not_found", "invalid_command", "missing", "idempotency_conflict", "committed"].includes(String(result.outcome))) {
    throw new Error("The special decision preflight returned an unknown outcome.");
  }
  return result;
}

async function loadV2StoredSession(session: SupabaseClient, sessionId: string) {
  const { data, error } = await session
    .from("template_copilot_sessions")
    .select("id,owner_id,status,revision,ledger")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, ledger: templateCopilotStoredLedgerSchema.parse(data.ledger) };
}

async function loadV2Receipt(session: SupabaseClient, sessionId: string, idempotencyKey: string, commandHash: string) {
  const { data, error } = await session
    .from("template_copilot_v2_operation_receipts")
    .select("command_hash,response")
    .eq("session_id", sessionId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.command_hash !== commandHash) return { outcome: "idempotency_conflict" };
  return { ...(data.response as Record<string, unknown>), outcome: "replayed" };
}

/** Every v2 response derives its next question from the RPC-returned ledger.
 * This is presentation metadata only; the ledger and revision remain the
 * authoritative persisted result, including on an idempotent replay. */
function withV2InterviewState(result: Record<string, unknown>) {
  if (!result.ledger) return result;
  const ledger = templateCopilotV2LedgerSchema.parse(result.ledger);
  return { ...result, interview: getTemplateCopilotV2InterviewState(ledger), specialReview: getTemplateCopilotV2SpecialReview(ledger) };
}
