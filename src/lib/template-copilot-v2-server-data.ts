import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import {
  applyTemplateCopilotV2FactTransition,
  applyTemplateCopilotV2AtomicDecision,
  approveLegacyTemplateCopilotUpgrade,
  createTemplateCopilotV2Ledger,
  normalizeTemplateCopilotCommittedValue,
  previewLegacyTemplateCopilotUpgrade,
  templateCopilotV2LedgerSchema,
  templateCopilotV2FactTransitionSchema,
  templateCopilotStoredLedgerSchema,
  TemplateCopilotFactTransitionError,
  type TemplateCopilotFactId,
  type V2FactTransition,
} from "./template-copilot-facts.ts";
import { getTemplateCopilotV2ModeFlags, getTemplateCopilotV2StructuredEditorFlags, isTemplateCopilotV2Step4Enabled, isTemplateCopilotV2Step5EditingEnabled, isTemplateCopilotV2StructuredEditorEnabled, requireTemplateCopilotV2, type TemplateCopilotV2Flag } from "./template-copilot-v2-feature.ts";
import { getTemplateCopilotQuestionLibrary, getTemplateCopilotV2InterviewState, getTemplateCopilotV2SpecialReview, reopenTemplateCopilotV2Decision, type TemplateCopilotAtomicAnswerInput } from "./template-copilot-question-library.ts";
import { orderTemplateCopilotMessages } from "./template-copilot-history.ts";
import {
  projectTemplateCopilotV2Candidates,
  resolveTemplateCopilotV2CommittedExtractionConflict as projectTemplateCopilotV2CommittedExtractionConflict,
  confirmTemplateCopilotV2Candidate as projectTemplateCopilotV2CandidateConfirmation,
  templateCopilotV2CandidateEvidenceHash,
  templateCopilotV2CandidateOutputSchema,
  type TemplateCopilotV2Candidate,
} from "./template-copilot-v2-candidates.ts";
import { getTemplateCopilotV2CommittedAcknowledgement } from "./template-copilot-v2-step4.ts";
import { projectTemplateCopilotV2AuthoritativeLedger } from "./template-copilot-v2-authoritative-projection.ts";
import {
  type TemplateCopilotV2AuthoringMode,
  type TemplateCopilotV2ModeState,
  type TemplateCopilotV2SourceSnapshot,
} from "./template-copilot-v2-modes.ts";
import {
  TemplateCopilotV2StructuredFactsError,
  TemplateCopilotV2StructuredEditorUnavailableError,
  isTemplateCopilotV2StrictStructuredValue,
  templateCopilotV2StructuredFactIds,
  validateTemplateCopilotV2CommittedStrictStructures,
  validateTemplateCopilotV2StructuredMutation,
} from "./template-copilot-v2-structured-facts.ts";

export function templateCopilotV2CommandHash(command: unknown) {
  return createHash("sha256").update(JSON.stringify(sortJson(command))).digest("hex");
}

function sameTemplateCopilotV2CanonicalValue(left: unknown, right: unknown) {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
}

export async function createTemplateCopilotV2Session({ service, actor, clientMessageId, scope, questionLibraryVersion = "v2.0", flag }: {
  service: SupabaseClient; actor: ApprovalRuntimeProfile; clientMessageId: string;
  scope: { businessUnitId: string; businessName: string; departmentId: string; departmentName: string; locale: "en" | "zh-Hant" | "zh-Hans" };
  questionLibraryVersion?: "v2.0" | "v2.1" | "v2.2";
  flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  // The request's pinned library version is included in the start command hash.
  // A pre-Step-4 response-lost v2.0 start therefore replays identically after
  // deployment rather than becoming a different v2.1 create command.
  const ledger = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion }, flag);
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

/** Sends the smallest possible map-edit command.  PostgreSQL locks the current
 * ledger and independently derives the target, confirmation, provenance,
 * stale history, dependency closure, and returned authoritative ledger. */
export async function applyTemplateCopilotV2Mutation({
  session, service, actor, sessionId, expectedRevision, idempotencyKey, transition, factId, flag,
}: {
  session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string;
  expectedRevision: number; idempotencyKey: string; factId: TemplateCopilotFactId; transition: V2FactTransition; flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const command = templateCopilotV2FactTransitionSchema.parse(transition);
  const canonicalValue = "payload" in command
    ? normalizeTemplateCopilotCommittedValue(factId, command.payload.canonicalValue)
    : null;
  const reason = command.operation === "mark_not_applicable" ? command.reason : null;
  // Cross-fact references cannot be validated from an isolated JSON value.
  // Validate an exact-revision prospective ledger through the caller's
  // owner-scoped client, then let the locked RPC re-check ownership, revision,
  // receipt, and field shape. A later revision skips this preflight so an
  // exact lost-response retry can still be resolved by its database receipt.
  if (
    factId === "request.fields"
    || factId === "timing.rules"
    || factId === "workflow.stages"
    || templateCopilotV2StructuredFactIds.includes(factId as (typeof templateCopilotV2StructuredFactIds)[number])
  ) {
    const stored = await loadV2StoredSession(session, sessionId, actor.id);
    if (
      stored?.ledger.schemaVersion === 2
      && Number(stored.revision) === expectedRevision
    ) {
      const prospective = applyTemplateCopilotV2FactTransition({
        ledger: stored.ledger,
        factId,
        transition: command,
        actorId: actor.id,
        confirmedAt: new Date().toISOString(),
        flag,
      });
      const issues = validateTemplateCopilotV2StructuredMutation({
        before: stored.ledger,
        after: prospective,
        factId,
      });
      if (issues.length) throw new TemplateCopilotV2StructuredFactsError(issues);
    }
  }
  // Provenance and original wording are intentionally not part of this hash:
  // map edits cannot choose either persisted field.  The database derives both
  // from the locked owner, operation, and idempotency key.
  const commandHash = templateCopilotV2CommandHash({ operation: command.operation, sessionId, expectedRevision, factId, canonicalValue, reason });
  const { data, error } = await service.rpc("mutate_template_copilot_v2_fact_delta", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: commandHash, p_operation: command.operation,
    // No client-produced ledger, entry, dependency closure, confirmation,
    // history, sidecar, readiness, provenance, or timestamp crosses this boundary.
    p_fact_id: factId,
    p_canonical_value: canonicalValue,
    p_reason: reason,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The fact mutation returned an invalid response.");
  const result = data as Record<string, unknown>;
  return withV2InterviewState(result);
}

export async function applyTemplateCopilotV2AtomicAnswer({ session, service, actor, sessionId, expectedRevision, idempotencyKey, answer, enqueueExtractionJob = false, flag }: { session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string; expectedRevision: number; idempotencyKey: string; answer: TemplateCopilotAtomicAnswerInput | string; enqueueExtractionJob?: boolean; flag?: TemplateCopilotV2Flag }) {
  requireTemplateCopilotV2(flag);
  let input: TemplateCopilotAtomicAnswerInput = typeof answer === "string" ? { kind: "text", text: answer } : answer;
  // The caller cannot name a decision or a next question.  The receipt hash
  // binds precisely the only user supplied content, so a retry is resolvable
  // before we inspect a later version of the interview.
  const commandHash = templateCopilotV2CommandHash({ operation: "atomic_answer", sessionId, expectedRevision, idempotencyKey, answer: input });
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  if (replay && (replay as { outcome?: unknown }).outcome === "idempotency_conflict") return withV2InterviewState(replay);
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  // Receipts deliberately retain only small replay metadata.  Ask the locked
  // RPC for the current ledger so a lost response can be replayed even after
  // later answers completed the interview; do not rebuild an old transition.
  if (replay) {
    const replayMetadata = replay as { decisionId?: unknown; questionId?: unknown };
    const { data, error } = await service.rpc(enqueueExtractionJob ? "answer_template_copilot_v2_decision_with_extraction_job" : "answer_template_copilot_v2_decision", {
      p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey, p_command_hash: commandHash,
      p_decision_id: typeof replayMetadata.decisionId === "string" ? replayMetadata.decisionId : "decision.replay.placeholder",
      p_ledger: stored.ledger, p_question_id: typeof replayMetadata.questionId === "string" ? replayMetadata.questionId : "v2.replay.placeholder",
      p_user_message: "", p_assistant_message: "", p_user_detail: {}, p_assistant_detail: {},
      ...(enqueueExtractionJob ? { p_enqueue_extraction: true } : {}),
    });
    if (error) throw error;
    const result = withV2InterviewState(data as Record<string, unknown>);
    // A readable receipt proves only that the key exists. The locked RPC is
    // the owner check: never query transcript content unless it confirms this
    // actor's exact command replayed. Receipts store identifiers/metadata, not
    // an acknowledgement body.
    if (result.outcome !== "replayed") return result;
    const messages = await loadV2PersistedCommandTranscript(session, sessionId, idempotencyKey, actor.id);
    const originalAssistantMessage = messages.find((message) => message.role === "assistant")?.content;
    return {
      ...result,
      // Exact retries use the original assistant transcript written in the
      // same transaction as the ledger and receipt identifiers; never derive
      // an acknowledgement from a later reopened/reanswered ledger.
      ...(originalAssistantMessage ? { assistantMessage: originalAssistantMessage, messages } : { assistantMessage: undefined }),
    };
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
  const assistantMessage = atomicAssistantMessage(
    nextLedger.locale,
    nextInterview,
    getTemplateCopilotV2CommittedAcknowledgement({ ledger: nextLedger, decisionId: interview.nextQuestion.primaryDecisionId }),
  );
  const selectedOption = input.kind === "choice" ? question.answer.options?.find((option) => option.optionId === input.optionId) : undefined;
  const userMessage = input.kind === "text" ? input.text : selectedOption?.label[stored.ledger.locale] || input.optionId;
  const { data, error } = await service.rpc(enqueueExtractionJob ? "answer_template_copilot_v2_decision_with_extraction_job" : "answer_template_copilot_v2_decision", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey, p_command_hash: commandHash,
    p_decision_id: interview.nextQuestion.primaryDecisionId, p_ledger: nextLedger, p_question_id: interview.nextQuestion.questionId,
    p_user_message: userMessage, p_assistant_message: assistantMessage,
    p_user_detail: { schemaVersion: 2, questionId: interview.nextQuestion.questionId, decisionId: interview.nextQuestion.primaryDecisionId, answerKind: input.kind, ...(input.kind === "choice" ? { optionId: input.optionId } : {}), idempotencyKey, provenance: "human_editor" },
    p_assistant_detail: { schemaVersion: 2, decisionId: interview.nextQuestion.primaryDecisionId, status: nextInterview.state, ...(nextInterview.nextQuestion ? { nextQuestionId: nextInterview.nextQuestion.questionId } : {}) },
    ...(enqueueExtractionJob ? { p_enqueue_extraction: true } : {}),
  });
  if (error) throw error;
  const result = withV2InterviewState(data as Record<string, unknown>);
  // A competing double-click can miss the preflight receipt and reach the
  // locked RPC after the first caller commits. That RPC replay is allowed to
  // return a newer session ledger, so it must never be used to manufacture an
  // acknowledgement. Recover the exact command's durable assistant turn or
  // fail closed without a saved claim.
  if (result.outcome === "replayed") {
    try {
      const messages = await loadV2PersistedCommandTranscript(session, sessionId, idempotencyKey, actor.id);
      const originalAssistantMessage = messages.find((message) => message.role === "assistant")?.content;
      return {
        ...result,
        ...(originalAssistantMessage ? { assistantMessage: originalAssistantMessage, messages } : { assistantMessage: undefined }),
      };
    } catch {
      return { ...result, assistantMessage: undefined };
    }
  }
  // A stale/invalid RPC response can still contain another tab's current
  // ledger. Acknowledgement is permitted only for this command's applied or
  // exact replay outcome, never merely because a similarly named decision now
  // exists in a newer authoritative snapshot.
  const committedLedger = result.outcome === "applied" && result.ledger
    ? templateCopilotV2LedgerSchema.parse(result.ledger)
    : null;
  return {
    ...result,
    ...(committedLedger ? {
      // The RPC response contains the assistant message transactionally saved
      // in the receipt/transcript. Preserve it verbatim if present.
      assistantMessage: typeof result.assistantMessage === "string"
        ? result.assistantMessage
        : atomicAssistantMessage(committedLedger.locale, getTemplateCopilotV2InterviewState(committedLedger), getTemplateCopilotV2CommittedAcknowledgement({ ledger: committedLedger, decisionId: interview.nextQuestion.primaryDecisionId })),
    } : {}),
  };
}

/** Gated batch persistence for one broad answer. The model output has already
 * been source-validated by the candidate module; this function still derives
 * the next ledger from the owner-scoped row and uses a locked receipt RPC. */
export async function applyTemplateCopilotV2CandidateExtraction({
  session, service, actor, sessionId, expectedRevision, idempotencyKey, candidates, flag,
}: {
  session: SupabaseClient; service: SupabaseClient; actor: Pick<ApprovalRuntimeProfile, "id">; sessionId: string;
  expectedRevision: number; idempotencyKey: string; candidates: readonly TemplateCopilotV2Candidate[]; flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const evidenceHash = templateCopilotV2CandidateEvidenceHash(candidates);
  const commandHash = templateCopilotV2CommandHash({ operation: "candidate_extraction", sessionId, expectedRevision, idempotencyKey, evidenceHash });
  // Cron uses a service client for reads, so ownership is an explicit query
  // predicate before receipt inspection rather than an implicit RLS side
  // effect. The mutation RPC repeats the same owner check under its lock.
  const stored = await loadV2StoredSession(session, sessionId, actor.id);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  if (replay) {
    if ((replay as { outcome?: unknown }).outcome === "idempotency_conflict") return withV2InterviewState(replay);
    return currentOwnerScopedV2Replay(session, sessionId, actor.id);
  }
  const projected = projectTemplateCopilotV2Candidates({ ledger: stored.ledger, candidates });
  const { data, error } = await service.rpc("apply_template_copilot_v2_extraction", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: commandHash,
    p_operation: "candidate_extraction", p_candidate_id: null, p_conflict_id: null, p_choice: null, p_rationale: null, p_human_value: null, p_ledger: projected.ledger, p_evidence_hash: evidenceHash,
  });
  if (error) throw error;
  return { ...withV2InterviewState(data as Record<string, unknown>), extractionConflicts: projected.conflicts };
}

/** Step 6 keeps entry-mode state outside the executable ledger while every
 * candidate still passes through the same candidate projection and locked
 * ledger revision. The source snapshot is an immutable copy, never a live
 * template lookup, so later edits or deletion cannot alter this session. */
export async function switchTemplateCopilotV2AuthoringMode({
  session, service, actor, sessionId, expectedRevision, idempotencyKey, mode, sourceSnapshot, flag,
}: {
  session: SupabaseClient; service: SupabaseClient; actor: Pick<ApprovalRuntimeProfile, "id">; sessionId: string;
  expectedRevision: number; idempotencyKey: string; mode: TemplateCopilotV2AuthoringMode;
  sourceSnapshot?: TemplateCopilotV2SourceSnapshot; flag?: TemplateCopilotV2Flag;
}): Promise<Record<string, unknown>> {
  requireTemplateCopilotV2(flag);
  const stored = await loadV2StoredSession(session, sessionId, actor.id);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const commandHash = templateCopilotV2CommandHash({ operation: "mode_switch", sessionId, expectedRevision, idempotencyKey, mode, sourceSnapshot: sourceSnapshot ? { versionId: sourceSnapshot.versionId, snapshotHash: sourceSnapshot.snapshotHash } : null });
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  if (replay) {
    if ((replay as { outcome?: unknown }).outcome === "idempotency_conflict") return withV2InterviewState(replay);
    const current = await currentOwnerScopedV2Replay(session, sessionId, actor.id) as Record<string, unknown>;
    const replayRecord = replay as Record<string, unknown>;
    return { ...current, modeReceiptRevision: typeof replayRecord.revision === "number" ? replayRecord.revision : null };
  }
  const { data, error } = await service.rpc("switch_template_copilot_v2_mode", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: commandHash, p_mode: mode,
    p_source_snapshot: sourceSnapshot || null, p_ledger: stored.ledger,
  });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  // A later Guided/Describe switch must retain (and immediately return) the
  // immutable Similar source even though its current mode has changed.
  const modeState = await loadTemplateCopilotV2AuthoringModeState(service, sessionId);
  return { ...withV2InterviewState(result), modeReceiptRevision: typeof result.revision === "number" ? result.revision : null, modeState };
}

/** Similar-template import is one durable revision: its mode/snapshot and
 * candidate projection either arrive together or neither does.  Do not compose
 * the old mode and extraction RPCs in a route; a lost response between them
 * would leave a session in the wrong entry state. */
export async function importTemplateCopilotV2SimilarMode({
  session, service, actor, sessionId, expectedRevision, idempotencyKey, sourceSnapshot, candidates, flag,
}: {
  session: SupabaseClient; service: SupabaseClient; actor: Pick<ApprovalRuntimeProfile, "id">; sessionId: string;
  expectedRevision: number; idempotencyKey: string; sourceSnapshot: TemplateCopilotV2SourceSnapshot;
  candidates: readonly TemplateCopilotV2Candidate[]; flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const stored = await loadV2StoredSession(session, sessionId, actor.id);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const evidenceHash = templateCopilotV2CandidateEvidenceHash(candidates);
  const projected = projectTemplateCopilotV2Candidates({ ledger: stored.ledger, candidates });
  const commandHash = templateCopilotV2CommandHash({
    operation: "similar_template_import", sessionId, expectedRevision, idempotencyKey,
    // The immutable source version is the command intent. Candidate mapping is
    // implementation detail and may safely improve between deployments without
    // breaking an exact response-lost replay.
    source: { versionId: sourceSnapshot.versionId, snapshotHash: sourceSnapshot.snapshotHash },
  });
  const { data, error } = await service.rpc("import_template_copilot_v2_similar_mode", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: commandHash, p_source_snapshot: sourceSnapshot,
    p_ledger: projected.ledger, p_evidence_hash: evidenceHash,
  });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return { ...withV2InterviewState(result), extractionConflicts: projected.conflicts, modeState: Object.freeze({ mode: "similar_template", sourceSnapshot } satisfies TemplateCopilotV2ModeState) };
}

/** Reconciles a response-lost Similar import before the route re-reads its
 * live source. The receipt hash is rebuilt from the immutable private snapshot,
 * so deletion, deactivation, or later edits of the published source cannot
 * turn an exact retry into a new command. */
export async function replayTemplateCopilotV2SimilarModeIfCommitted({
  session,
  service,
  actor,
  sessionId,
  expectedRevision,
  idempotencyKey,
  sourceVersionId,
  flag,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: Pick<ApprovalRuntimeProfile, "id">;
  sessionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  sourceVersionId: string;
  flag?: TemplateCopilotV2Flag;
}): Promise<Record<string, unknown> | null> {
  requireTemplateCopilotV2(flag);
  const stored = await loadV2StoredSession(session, sessionId, actor.id);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const { data: receipt, error } = await session
    .from("template_copilot_v2_operation_receipts")
    .select("command_hash")
    .eq("session_id", sessionId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  if (!receipt) return null;
  const modeState = await loadTemplateCopilotV2AuthoringModeState(service, sessionId);
  const sourceSnapshot = modeState.sourceSnapshot;
  if (!sourceSnapshot || sourceSnapshot.versionId !== sourceVersionId) {
    return { outcome: "idempotency_conflict" };
  }
  const commandHash = templateCopilotV2CommandHash({
    operation: "similar_template_import",
    sessionId,
    expectedRevision,
    idempotencyKey,
    source: { versionId: sourceSnapshot.versionId, snapshotHash: sourceSnapshot.snapshotHash },
  });
  if (receipt.command_hash !== commandHash) return { outcome: "idempotency_conflict" };
  const replay = await currentOwnerScopedV2Replay(session, sessionId, actor.id);
  return { ...replay, modeState };
}

export async function loadTemplateCopilotV2AuthoringModeState(service: SupabaseClient, sessionId: string): Promise<TemplateCopilotV2ModeState> {
  const { data, error } = await service
    .from("template_copilot_v2_authoring_modes")
    .select("mode,source_snapshot")
    .eq("session_id", sessionId)
    .maybeSingle();
  // Step 6 is independently gated and code can deploy before its migration.
  // A missing optional companion table must keep pre-Step-6 v2 sessions
  // readable; other errors remain real dependency failures.
  if (error && ["42P01", "PGRST205"].includes((error as { code?: string }).code || "")) return Object.freeze({ mode: "guided" });
  if (error) throw error;
  if (!data || !["guided", "describe_everything", "similar_template"].includes(String(data.mode))) return Object.freeze({ mode: "guided" });
  return Object.freeze({ mode: data.mode as TemplateCopilotV2AuthoringMode, ...(data.source_snapshot ? { sourceSnapshot: data.source_snapshot as TemplateCopilotV2SourceSnapshot } : {}) });
}

/** Proves session ownership before an endpoint enumerates any source data.
 * This is intentionally separate from the mode companion table so old
 * databases can still read v2 sessions with every Step-6 flag disabled. */
export async function loadTemplateCopilotV2OwnedSession(session: SupabaseClient, sessionId: string, actorId: string) {
  return loadV2StoredSession(session, sessionId, actorId);
}

type TemplateCopilotV2ExtractionJobDependencies = Readonly<{
  leaseToken?: string;
  extractCandidates: (input: Readonly<{ message: string; messageId: string }>) => Promise<Readonly<{
    candidates: readonly TemplateCopilotV2Candidate[];
  }>>;
  persistCandidates?: typeof applyTemplateCopilotV2CandidateExtraction;
}>;

function extractionJobRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function extractionJobInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function extractionJobErrorCode(error: unknown) {
  if (error instanceof Error && error.name === "TemplateCopilotConfigurationError") {
    return "provider_configuration";
  }
  const reasonCode = error && typeof error === "object"
    ? (error as { reasonCode?: unknown }).reasonCode
    : undefined;
  if (typeof reasonCode === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(reasonCode)) {
    return reasonCode;
  }
  return "provider_error";
}

async function callTemplateCopilotV2ExtractionJobRpc(
  service: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await service.rpc(name, args);
  if (error) throw error;
  return extractionJobRecord(data);
}

/**
 * Runs one durable answer-bound extraction attempt. The answer RPC has already
 * committed the manual answer and job atomically. A private candidate
 * checkpoint makes retries deterministic, while the original answer revision
 * remains the only revision at which candidates may be appended.
 */
export async function processTemplateCopilotV2AnswerExtractionJob({
  session,
  service,
  actor,
  sessionId,
  answerClientMessageId,
  jobId: requestedJobId,
  dependencies,
  flag,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: Pick<ApprovalRuntimeProfile, "id">;
  sessionId: string;
  answerClientMessageId?: string;
  jobId?: string;
  dependencies: TemplateCopilotV2ExtractionJobDependencies;
  flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  if (Boolean(answerClientMessageId) === Boolean(requestedJobId)) {
    throw new Error("Exactly one extraction job locator is required.");
  }
  const leaseToken = dependencies.leaseToken || randomUUID();
  const extractCandidates = dependencies.extractCandidates;
  const persistCandidates = dependencies.persistCandidates || applyTemplateCopilotV2CandidateExtraction;
  const claim = await callTemplateCopilotV2ExtractionJobRpc(
    service,
    "claim_template_copilot_v2_answer_extraction_job",
    {
      p_actor_id: actor.id,
      p_session_id: sessionId,
      p_answer_client_message_id: answerClientMessageId || null,
      p_lease_token: leaseToken,
      p_job_id: requestedJobId || null,
    },
  );
  if (claim.outcome !== "claimed") return claim;

  const jobId = typeof claim.jobId === "string" ? claim.jobId : "";
  const claimedMessageId = typeof claim.answerMessageId === "string" ? claim.answerMessageId : "";
  const answerMessage = typeof claim.answerMessage === "string" ? claim.answerMessage : "";
  const answerRevision = extractionJobInteger(claim.answerRevision);
  const currentRevision = extractionJobInteger(claim.currentRevision);
  if (
    !jobId
    || (requestedJobId ? jobId !== requestedJobId : claimedMessageId !== answerClientMessageId)
    || !claimedMessageId
    || !answerMessage
    || !answerRevision
    || !currentRevision
  ) {
    throw new Error("The extraction job claim is malformed.");
  }

  const finish = (completionOutcome: "no_candidates" | "applied" | "replayed" | "superseded", completedRevision: number) =>
    callTemplateCopilotV2ExtractionJobRpc(
      service,
      "finish_template_copilot_v2_answer_extraction_job",
      {
        p_actor_id: actor.id,
        p_session_id: sessionId,
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_completion_outcome: completionOutcome,
        p_completed_revision: Math.max(answerRevision, completedRevision),
      },
    );
  const fail = (retry: boolean, errorCode: string) =>
    callTemplateCopilotV2ExtractionJobRpc(
      service,
      "fail_template_copilot_v2_answer_extraction_job",
      {
        p_actor_id: actor.id,
        p_session_id: sessionId,
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_retry: retry,
        p_error_code: errorCode,
      },
    );

  const checkpointInput = claim.candidatePayload;
  if (checkpointInput == null && currentRevision !== answerRevision) {
    const terminal = await finish("superseded", currentRevision);
    return { ...terminal, candidateCount: 0 };
  }

  let candidates: readonly TemplateCopilotV2Candidate[];
  if (checkpointInput != null) {
    const parsed = templateCopilotV2CandidateOutputSchema.safeParse({ candidates: checkpointInput });
    if (!parsed.success) {
      const terminal = await fail(false, "checkpoint_invalid");
      return { ...terminal, errorCode: "checkpoint_invalid" };
    }
    candidates = parsed.data.candidates;
    const expectedHash = templateCopilotV2CandidateEvidenceHash(candidates);
    if (claim.candidatePayloadHash !== expectedHash) {
      const terminal = await fail(false, "checkpoint_hash_mismatch");
      return { ...terminal, errorCode: "checkpoint_hash_mismatch" };
    }
  } else {
    try {
      const extracted = await extractCandidates({
        message: answerMessage,
        messageId: claimedMessageId,
      });
      candidates = templateCopilotV2CandidateOutputSchema.parse({
        candidates: extracted.candidates,
      }).candidates;
    } catch (error) {
      const errorCode = extractionJobErrorCode(error);
      const terminal = await fail(errorCode !== "provider_configuration", errorCode);
      return { ...terminal, errorCode };
    }
    const payloadHash = templateCopilotV2CandidateEvidenceHash(candidates);
    const checkpoint = await callTemplateCopilotV2ExtractionJobRpc(
      service,
      "checkpoint_template_copilot_v2_answer_extraction_job",
      {
        p_actor_id: actor.id,
        p_session_id: sessionId,
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_candidate_payload: candidates,
        p_candidate_payload_hash: payloadHash,
      },
    );
    if (checkpoint.outcome !== "checkpointed") return checkpoint;
  }

  if (candidates.length === 0) {
    const terminal = await finish("no_candidates", currentRevision);
    return { ...terminal, candidateCount: 0 };
  }

  let persisted: Record<string, unknown>;
  try {
    persisted = extractionJobRecord(await persistCandidates({
      session,
      service,
      actor,
      sessionId,
      expectedRevision: answerRevision,
      idempotencyKey: `extract-job:${jobId}`,
      candidates,
      flag,
    }));
  } catch {
    const terminal = await fail(true, "candidate_persistence_error");
    return { ...terminal, errorCode: "candidate_persistence_error" };
  }

  const persistedRevision = extractionJobInteger(persisted.revision)
    || extractionJobInteger(persisted.currentRevision)
    || currentRevision;
  if (persisted.outcome === "applied" || persisted.outcome === "replayed") {
    const terminal = await finish(persisted.outcome, persistedRevision);
    return { ...terminal, candidateCount: candidates.length };
  }
  if (persisted.outcome === "stale_revision") {
    const terminal = await finish("superseded", persistedRevision);
    return { ...terminal, candidateCount: candidates.length };
  }

  const errorCode = persisted.outcome === "idempotency_conflict"
    ? "candidate_receipt_conflict"
    : persisted.outcome === "invalid_transition"
      ? "candidate_invalid_transition"
      : persisted.outcome === "not_found"
        ? "candidate_owner_state_unavailable"
        : "candidate_persistence_unavailable";
  const terminal = await fail(errorCode === "candidate_persistence_unavailable", errorCode);
  return { ...terminal, errorCode };
}

export async function resolveTemplateCopilotV2CommittedExtractionConflict({
  session, service, actor, sessionId, expectedRevision, idempotencyKey, conflictId, choice, rationale, humanValue, flag,
}: {
  session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string;
  expectedRevision: number; idempotencyKey: string; conflictId: string; choice: "keep_existing" | "commit_incoming" | "commit_human_value"; rationale?: string; humanValue?: unknown; flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const commandHash = templateCopilotV2CommandHash({ operation: "resolve_extraction_conflict", sessionId, expectedRevision, conflictId, choice, rationale, humanValue });
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  if (replay) {
    if ((replay as { outcome?: unknown }).outcome === "idempotency_conflict") return withV2InterviewState(replay);
    return currentOwnerScopedV2Replay(session, sessionId);
  }
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const conflict = stored.ledger.extractionEvidence.conflicts.find((item) => item.conflictId === conflictId && item.state === "open");
  if (!conflict) throw new TemplateCopilotFactTransitionError("The extraction conflict is no longer available.");
  const storedFact = stored.ledger.facts[conflict.factId];
  const projected = projectTemplateCopilotV2CommittedExtractionConflict({ ledger: stored.ledger, conflictId, resolution: choice, humanValue, rationale, actorId: actor.id, confirmedAt: new Date().toISOString(), beforeRevision: expectedRevision });
  const projectedValue = projected.facts[conflict.factId].canonicalValue;
  const unchangedAlreadyAuthoritativeKeep = choice === "keep_existing"
    && ["committed", "not_applicable"].includes(storedFact.status)
    && sameTemplateCopilotV2CanonicalValue(storedFact.canonicalValue, projectedValue);
  if (
    !unchangedAlreadyAuthoritativeKeep
    && isTemplateCopilotV2StrictStructuredValue(conflict.factId, projectedValue)
    && !isTemplateCopilotV2StructuredEditorEnabled(conflict.factId)
  ) {
    throw new TemplateCopilotV2StructuredEditorUnavailableError(conflict.factId);
  }
  const structuredIssues = validateTemplateCopilotV2CommittedStrictStructures(projected);
  if (structuredIssues.length) throw new TemplateCopilotV2StructuredFactsError(structuredIssues);
  const resolvedHumanValue = choice === "commit_human_value" ? projected.extractionEvidence.history.at(-1)?.humanValue : undefined;
  const { data, error } = await service.rpc("apply_template_copilot_v2_extraction", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: commandHash,
    p_operation: "resolve_extraction_conflict", p_candidate_id: null, p_conflict_id: conflictId, p_choice: choice, p_rationale: rationale ?? null, p_human_value: resolvedHumanValue ?? null, p_ledger: projected, p_evidence_hash: templateCopilotV2CandidateEvidenceHash({ conflictId, choice, rationale, resolvedHumanValue }),
  });
  if (error) throw error;
  return withV2InterviewState(data as Record<string, unknown>);
}

export async function confirmTemplateCopilotV2Candidate({ session, service, actor, sessionId, expectedRevision, idempotencyKey, candidateId, flag }: {
  session: SupabaseClient; service: SupabaseClient; actor: ApprovalRuntimeProfile; sessionId: string; expectedRevision: number; idempotencyKey: string; candidateId: string; flag?: TemplateCopilotV2Flag;
}) {
  requireTemplateCopilotV2(flag);
  const commandHash = templateCopilotV2CommandHash({ operation: "candidate_confirmation", sessionId, expectedRevision, candidateId });
  const replay = await loadV2Receipt(session, sessionId, idempotencyKey, commandHash);
  if (replay) {
    if ((replay as { outcome?: unknown }).outcome === "idempotency_conflict") return withV2InterviewState(replay);
    return currentOwnerScopedV2Replay(session, sessionId);
  }
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const candidate = stored.ledger.extractionEvidence.candidates.find((item) => item.candidateId === candidateId && item.state === "open");
  const ledger = projectTemplateCopilotV2CandidateConfirmation({ ledger: stored.ledger, candidateId, actorId: actor.id, confirmedAt: new Date().toISOString(), beforeRevision: expectedRevision });
  if (
    candidate
    && isTemplateCopilotV2StrictStructuredValue(candidate.factId, ledger.facts[candidate.factId].canonicalValue)
    && !isTemplateCopilotV2StructuredEditorEnabled(candidate.factId)
  ) {
    throw new TemplateCopilotV2StructuredEditorUnavailableError(candidate.factId);
  }
  const structuredIssues = validateTemplateCopilotV2CommittedStrictStructures(ledger);
  if (structuredIssues.length) throw new TemplateCopilotV2StructuredFactsError(structuredIssues);
  const { data, error } = await service.rpc("apply_template_copilot_v2_extraction", { p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision, p_idempotency_key: idempotencyKey, p_command_hash: commandHash, p_operation: "candidate_confirmation", p_candidate_id: candidateId, p_conflict_id: null, p_choice: null, p_rationale: null, p_human_value: null, p_ledger: ledger, p_evidence_hash: templateCopilotV2CandidateEvidenceHash({ candidateId }) });
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

function atomicAssistantMessage(locale: "en" | "zh-Hant" | "zh-Hans", interview: ReturnType<typeof getTemplateCopilotV2InterviewState>, acknowledgement?: string | null) {
  const next = interview.state === "question" && interview.nextQuestion
    ? interview.nextQuestion.prompt
    : interview.state === "complete"
      ? locale === "zh-Hant" ? "所有適用的決定已完成。" : locale === "zh-Hans" ? "所有适用的决定已完成。" : "All applicable decisions are complete."
      : locale === "zh-Hant" ? "此訪談需要重新載入後才能繼續。" : locale === "zh-Hans" ? "此访谈需要重新加载后才能继续。" : "This interview needs to be reloaded before it can continue.";
  return acknowledgement ? `${acknowledgement} ${next}` : next;
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

async function loadV2PersistedCommandTranscript(session: SupabaseClient, sessionId: string, idempotencyKey: string, ownerId?: string): Promise<TemplateCopilotV2PersistedCommandMessage[]> {
  let query = session
    .from("template_copilot_messages")
    .select("id,client_message_id,role,content,created_at")
    .eq("session_id", sessionId)
    .eq("client_message_id", idempotencyKey);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data: transcriptRows, error: transcriptError } = await query.order("created_at", { ascending: true });
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

async function loadV2StoredSession(session: SupabaseClient, sessionId: string, ownerId?: string) {
  let query = session
    .from("template_copilot_sessions")
    .select("id,owner_id,status,revision,ledger")
    .eq("id", sessionId);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, ledger: templateCopilotStoredLedgerSchema.parse(data.ledger) };
}

/** A matching receipt proves the command already committed, but its response
 * can be old. Re-read through the caller's owner-scoped client so a retry
 * returns the current authoritative ledger/revision without exposing a row to
 * a mismatched idempotency key. */
async function currentOwnerScopedV2Replay(session: SupabaseClient, sessionId: string, ownerId?: string) {
  const stored = await loadV2StoredSession(session, sessionId, ownerId);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  return withV2InterviewState({ outcome: "replayed", sessionId: stored.id, revision: stored.revision, status: stored.status, ledger: stored.ledger });
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
  const interview = getTemplateCopilotV2InterviewState(ledger);
  return { ...result, interview, specialReview: getTemplateCopilotV2SpecialReview(ledger), projection: projectTemplateCopilotV2AuthoritativeLedger(ledger, { inapplicableFactIds: interview.inapplicableFactIds }), step4Enabled: isTemplateCopilotV2Step4Enabled(), step5EditingEnabled: isTemplateCopilotV2Step5EditingEnabled(), modeFlags: getTemplateCopilotV2ModeFlags(), structuredEditorFlags: getTemplateCopilotV2StructuredEditorFlags() };
}
