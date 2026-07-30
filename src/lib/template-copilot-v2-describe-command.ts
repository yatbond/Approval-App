import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import { templateCopilotV2LedgerSchema, type TemplateCopilotV2Ledger } from "./template-copilot-facts.ts";
import { templateCopilotV2CandidateEvidenceHash, type TemplateCopilotV2Candidate, type TemplateCopilotV2CandidateRejection } from "./template-copilot-v2-candidates.ts";
import { projectTemplateCopilotV2Candidates } from "./template-copilot-v2-candidates.ts";
import { templateCopilotV2CommandHash } from "./template-copilot-v2-server-data.ts";
import { getTemplateCopilotV2InterviewState } from "./template-copilot-question-library.ts";
import { projectTemplateCopilotV2AuthoritativeLedger } from "./template-copilot-v2-authoritative-projection.ts";
import {
  summarizeTemplateCopilotV2ExtractionDiagnostics,
  type TemplateCopilotV2ExtractionTerminalCode,
} from "./template-copilot-v2-extraction-diagnostics.ts";
import type {
  TemplateCopilotV2CandidateExtractionInput,
  TemplateCopilotV2ExtractionSection,
} from "./template-copilot-v2-extraction-context.ts";
import type { TemplateCopilotV2FocusedRecoverySummary } from "./template-copilot-v2-focused-recovery.ts";

export type TemplateCopilotV2BroadAuthoringMode = "describe_everything" | "similar_template";

/** The provider executes strictly between these two authoritative calls.  The
 * prepared row owns the client key and source text before a model can see it;
 * finalization owns the sole terminal branch.  A retry therefore replays a
 * durable result and never calls the model again. */
export type TemplateCopilotV2DescribePrepared = Readonly<{
  outcome: "prepared";
  revision: number;
  status: string;
  ledger: TemplateCopilotV2Ledger;
  claimToken: string;
  sourceMessageId: string;
}>;

export type TemplateCopilotV2DescribeTerminal = Readonly<Record<string, unknown>> & {
  outcome: "applied" | "replayed" | "guided_fallback" | "pending" | "stale_revision" | "idempotency_conflict" | "not_found" | "invalid_command" | "document_limit";
};

export type TemplateCopilotV2DescribePreparation = TemplateCopilotV2DescribePrepared | TemplateCopilotV2DescribeTerminal;

export type TemplateCopilotV2DescribeDocument = Readonly<{
  id: string;
  fileName: string;
  sha256: string;
  text: string;
  safety: "sanitized_untrusted_text";
}>;

export function bindTemplateCopilotV2DocumentIdentity({
  sessionId,
  idempotencyKey,
  document,
}: {
  sessionId: string;
  idempotencyKey: string;
  document: TemplateCopilotV2DescribeDocument;
}): TemplateCopilotV2DescribeDocument {
  const stableId = createHash("sha256")
    .update(sessionId)
    .update("\0")
    .update(idempotencyKey)
    .update("\0")
    .update(document.fileName)
    .update("\0")
    .update(document.sha256)
    .digest("hex")
    .slice(0, 32);
  return Object.freeze({ ...document, id: `req-${stableId}` });
}

export type TemplateCopilotV2DescribeCommandInput = Readonly<{
  session: SupabaseClient;
  service: SupabaseClient;
  actor: Pick<ApprovalRuntimeProfile, "id">;
  sessionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  mode: TemplateCopilotV2BroadAuthoringMode;
  sourceText: string;
  document?: TemplateCopilotV2DescribeDocument;
  sectionHint?: TemplateCopilotV2ExtractionSection;
  extractCandidates: (input: TemplateCopilotV2CandidateExtractionInput) => Promise<Readonly<{
    candidates: readonly TemplateCopilotV2Candidate[];
    rejected?: readonly TemplateCopilotV2CandidateRejection[];
    recovery?: TemplateCopilotV2FocusedRecoverySummary | null;
  }>>;
  fallbackReason: (error: unknown) => string;
}>;

function boundedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function describeSourceMessageId(sessionId: string, idempotencyKey: string) {
  // Keep this in lock-step with the private SQL preparer. It is an opaque,
  // deterministic transcript key rather than the caller's command key, so a
  // refresh can recover exact evidence source turns without exposing receipt
  // identifiers in the message stream.
  return `modecmd:${createHash("md5").update(`${sessionId}:${idempotencyKey}`).digest("hex").slice(0, 24)}`;
}

function describeSourceKind({
  mode,
  document,
}: Pick<TemplateCopilotV2DescribeCommandInput, "mode" | "document">) {
  if (document) return "document" as const;
  return mode === "similar_template" ? "similar_difference" as const : "narrative" as const;
}

type PersistedDescribeMessage = Readonly<{
  id: string;
  clientMessageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}>;

async function attachPersistedDescribeMessages({ session, actor, sessionId, sourceMessageId, result }: {
  session: SupabaseClient;
  actor: Pick<ApprovalRuntimeProfile, "id">;
  sessionId: string;
  sourceMessageId: string;
  result: TemplateCopilotV2DescribeTerminal;
}) {
  if (result.outcome !== "applied" && result.outcome !== "replayed" && result.outcome !== "guided_fallback") return result;
  const { data, error } = await session
    .from("template_copilot_messages")
    .select("id,client_message_id,role,content,created_at")
    .eq("session_id", sessionId)
    .eq("owner_id", actor.id)
    .eq("client_message_id", sourceMessageId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const messages = (data || []).flatMap((row): PersistedDescribeMessage[] => {
    if (!row || typeof row !== "object") return [];
    const value = row as Record<string, unknown>;
    if ((value.role !== "user" && value.role !== "assistant")
      || typeof value.id !== "string"
      || typeof value.client_message_id !== "string"
      || value.client_message_id !== sourceMessageId
      || typeof value.content !== "string"
      || typeof value.created_at !== "string") return [];
    return [{ id: value.id, clientMessageId: value.client_message_id, role: value.role, content: value.content, createdAt: value.created_at }];
  });
  if (messages.filter((message) => message.role === "user").length !== 1
    || messages.filter((message) => message.role === "assistant").length !== 1) {
    throw new Error("The durable Describe transcript is incomplete.");
  }
  return { ...result, sourceMessageId, messages } as TemplateCopilotV2DescribeTerminal & { sourceMessageId: string; messages: readonly PersistedDescribeMessage[] };
}

function describeCommandHash({ sessionId, expectedRevision, idempotencyKey, mode, sourceText, document, sectionHint }: Omit<TemplateCopilotV2DescribeCommandInput, "session" | "service" | "actor" | "extractCandidates" | "fallbackReason">) {
  const sourceKind = describeSourceKind({ mode, document });
  return templateCopilotV2CommandHash({
    operation: "broad_mode_extraction",
    sessionId,
    expectedRevision,
    idempotencyKey,
    mode,
    sourceKind,
    sectionHint: sectionHint || (document ? "document" : "all"),
    // Never place narrative/document contents into a receipt hash or audit
    // payload.  The original source is private in its durable message row.
    sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
    document: document ? { id: document.id, fileName: document.fileName, sha256: document.sha256 } : null,
  });
}

function decorate(result: Record<string, unknown>) {
  const outcome = result.outcome;
  if (![
    "applied", "replayed", "guided_fallback", "pending", "stale_revision",
    "idempotency_conflict", "not_found", "invalid_command", "document_limit",
  ].includes(String(outcome))) {
    throw new Error("The Describe command returned an unknown outcome.");
  }
  if (!result.ledger) return result as TemplateCopilotV2DescribeTerminal;
  const ledger = templateCopilotV2LedgerSchema.parse(result.ledger);
  const interview = getTemplateCopilotV2InterviewState(ledger);
  return {
    ...result, outcome,
    ledger,
    interview,
    projection: projectTemplateCopilotV2AuthoritativeLedger(ledger, {
      inapplicableFactIds: interview.inapplicableFactIds,
      sourceRevision:
        typeof result.revision === "number" ? result.revision : undefined,
    }),
  } as TemplateCopilotV2DescribeTerminal;
}

export async function prepareTemplateCopilotV2DescribeCommand({ service, actor, sessionId, expectedRevision, idempotencyKey, mode, sourceText, document }: Omit<TemplateCopilotV2DescribeCommandInput, "session" | "extractCandidates" | "fallbackReason">): Promise<TemplateCopilotV2DescribePreparation> {
  const commandHash = describeCommandHash({ sessionId, expectedRevision, idempotencyKey, mode, sourceText, document });
  const sourceKind = describeSourceKind({ mode, document });
  const { data, error } = await service.rpc("prepare_template_copilot_v2_mode_command", {
    p_actor_id: actor.id,
    p_session_id: sessionId,
    p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey,
    p_command_hash: commandHash,
    p_mode: mode,
    p_source_kind: sourceKind,
    // Exact source text is inserted as the owner-scoped user transcript row
    // before provider extraction. The receipt's key is the evidence message ID.
    p_user_message: sourceText,
  });
  if (error) throw error;
  const result = boundedRecord(data);
  if (result.outcome !== "prepared") return decorate(result);
  const revision = boundedInteger(result.revision);
  const sourceMessageId = typeof result.sourceMessageId === "string" ? result.sourceMessageId : "";
  const claimToken = typeof result.claimToken === "string" ? result.claimToken : "";
  if (!revision || !result.ledger || !sourceMessageId || !claimToken) throw new Error("The Describe command preparation returned an invalid response.");
  return Object.freeze({
    outcome: "prepared",
    revision,
    status: typeof result.status === "string" ? result.status : "interviewing",
    ledger: templateCopilotV2LedgerSchema.parse(result.ledger),
    claimToken,
    sourceMessageId,
  });
}

async function finalizeTemplateCopilotV2DescribeCommand({ service, actor, sessionId, idempotencyKey, commandHash, claimToken, outcome, mode, ledger, candidates, rejected, detail, diagnosticTerminalCode, diagnosticAcceptedCandidateCount }: {
  service: SupabaseClient;
  actor: Pick<ApprovalRuntimeProfile, "id">;
  sessionId: string;
  idempotencyKey: string;
  commandHash: string;
  claimToken: string;
  outcome: "applied" | "no_candidates" | "guided_fallback";
  mode: TemplateCopilotV2BroadAuthoringMode | "guided";
  ledger: TemplateCopilotV2Ledger;
  candidates: readonly TemplateCopilotV2Candidate[];
  rejected: readonly TemplateCopilotV2CandidateRejection[];
  detail: Record<string, unknown>;
  diagnosticTerminalCode?: TemplateCopilotV2ExtractionTerminalCode;
  diagnosticAcceptedCandidateCount?: number;
}) {
  const extractionDiagnostics =
    summarizeTemplateCopilotV2ExtractionDiagnostics({
      acceptedCandidateCount:
        diagnosticAcceptedCandidateCount ?? candidates.length,
      rejected,
      terminalCode:
        diagnosticTerminalCode ||
        (outcome === "applied" ? "candidates_applied" : "no_candidates"),
    });
  const { data, error } = await service.rpc("finalize_template_copilot_v2_mode_command", {
    p_actor_id: actor.id,
    p_session_id: sessionId,
    p_idempotency_key: idempotencyKey,
    p_command_hash: commandHash,
    p_claim_token: claimToken,
    p_outcome: outcome,
    p_mode: mode,
    p_ledger: ledger,
    p_evidence_hash: templateCopilotV2CandidateEvidenceHash(candidates),
    p_detail: {
      ...detail,
      candidateCount: candidates.length,
      extractionDiagnostics,
    },
  });
  if (error) throw error;
  return decorate(boundedRecord(data));
}

/** Runs one prepared Describe/document command.  Provider output never writes
 * directly: candidates pass the shared projection, and only the finalizer can
 * change a revision.  A malformed/outage/configuration failure finalizes a
 * Guided branch once, preserving all existing facts/candidates/conflicts. */
export async function runTemplateCopilotV2DescribeCommand(input: TemplateCopilotV2DescribeCommandInput): Promise<TemplateCopilotV2DescribeTerminal> {
  const prepared = await prepareTemplateCopilotV2DescribeCommand(input);
  if (prepared.outcome !== "prepared") {
    return attachPersistedDescribeMessages({
      session: input.session, actor: input.actor, sessionId: input.sessionId,
      sourceMessageId: describeSourceMessageId(input.sessionId, input.idempotencyKey), result: prepared,
    });
  }
  const commandHash = describeCommandHash(input);
  const sourceKind = describeSourceKind(input);
  const documentLedger = input.document
    ? templateCopilotV2LedgerSchema.parse({
      ...prepared.ledger,
      requirementDocumentExtracts: [...prepared.ledger.requirementDocumentExtracts, input.document],
    })
    : prepared.ledger;
  let extracted: Awaited<ReturnType<TemplateCopilotV2DescribeCommandInput["extractCandidates"]>>;
  let projected: ReturnType<typeof projectTemplateCopilotV2Candidates>;
  try {
    extracted = await input.extractCandidates({
      message: input.sourceText,
      messageId: prepared.sourceMessageId,
      locale: prepared.ledger.locale,
      section: input.sectionHint || (input.document ? "document" : "all"),
    });
    projected = projectTemplateCopilotV2Candidates({ ledger: documentLedger, candidates: extracted.candidates });
  } catch (error) {
    const finalized = await finalizeTemplateCopilotV2DescribeCommand({
      service: input.service, actor: input.actor, sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey, commandHash, outcome: "guided_fallback", mode: "guided",
      claimToken: prepared.claimToken,
      // The authoritative fallback branch deliberately requires the base
      // ledger unchanged. The source document itself remains private in the
      // durable transcript; it is added to the ledger only with a successful
      // candidate projection and document provenance.
      ledger: prepared.ledger, candidates: [], rejected: [],
      diagnosticTerminalCode: "provider_failure",
      diagnosticAcceptedCandidateCount: 0,
      detail: {
        sourceKind,
        sectionHint: input.sectionHint || (input.document ? "document" : "all"),
        ...(input.document ? { document: { id: input.document.id, fileName: input.document.fileName, sha256: input.document.sha256, safety: input.document.safety } } : {}),
        fallbackReason: input.fallbackReason(error),
        assistantMessage: describeAssistantMessage(prepared.ledger.locale, "fallback"),
      },
    });
    return attachPersistedDescribeMessages({ session: input.session, actor: input.actor, sessionId: input.sessionId, sourceMessageId: prepared.sourceMessageId, result: finalized });
  }
  const noCandidateDelta = templateCopilotV2CommandHash(projected.ledger) === templateCopilotV2CommandHash(documentLedger);
  const noCandidateReason = extracted.candidates.length
    ? "no_new_candidates"
    : extracted.rejected?.length
      ? "no_usable_candidates"
      : "no_candidates";
  // Do not put finalization in the provider-failure boundary. A database or
  // network error after a successful provider result must leave the durable
  // command prepared for replay/recovery, not create a competing fallback.
  const finalized = await finalizeTemplateCopilotV2DescribeCommand({
    service: input.service, actor: input.actor, sessionId: input.sessionId,
    idempotencyKey: input.idempotencyKey, commandHash,
    outcome: noCandidateDelta ? "no_candidates" : "applied",
    mode: input.mode,
    claimToken: prepared.claimToken,
    ledger: noCandidateDelta ? documentLedger : projected.ledger,
    candidates: noCandidateDelta ? [] : extracted.candidates,
    rejected: [...(extracted.rejected || [])],
    diagnosticTerminalCode: noCandidateDelta
      ? noCandidateReason
      : "candidates_applied",
    diagnosticAcceptedCandidateCount: extracted.candidates.length,
    detail: {
      sourceKind,
      sectionHint: input.sectionHint || (input.document ? "document" : "all"),
      ...(input.document ? { document: { id: input.document.id, fileName: input.document.fileName, sha256: input.document.sha256, safety: input.document.safety } } : {}),
      ...(noCandidateDelta ? {
        noCandidateReason,
      } : {}),
      ...(extracted.recovery ? {
        focusedRecovery: extracted.recovery,
      } : {}),
      assistantMessage: describeAssistantMessage(prepared.ledger.locale, noCandidateDelta ? "no_candidates" : "candidates"),
    },
  });
  return attachPersistedDescribeMessages({ session: input.session, actor: input.actor, sessionId: input.sessionId, sourceMessageId: prepared.sourceMessageId, result: finalized });
}

function describeAssistantMessage(
  locale: TemplateCopilotV2Ledger["locale"],
  outcome: "candidates" | "no_candidates" | "fallback",
) {
  if (locale === "zh-Hant") {
    if (outcome === "candidates") return "請先審閱已擷取的建議，然後回答下一個尚未確定的簡單問題。";
    if (outcome === "no_candidates") return "沒有找到可安全提出的新增建議。請回答下一個尚未確定的簡單問題；已確認的資料沒有更改。";
    return "暫時無法分析這項描述。請繼續回答下一個簡單問題；其他資料沒有更改。";
  }
  if (locale === "zh-Hans") {
    if (outcome === "candidates") return "请先审核已提取的建议，然后回答下一个尚未确定的简单问题。";
    if (outcome === "no_candidates") return "没有找到可安全提出的新增建议。请回答下一个尚未确定的简单问题；已确认的信息没有更改。";
    return "暂时无法分析这项描述。请继续回答下一个简单问题；其他信息没有更改。";
  }
  if (outcome === "candidates") return "Review the extracted suggestions, then answer the next simple question that is still undecided.";
  if (outcome === "no_candidates") return "No safe new suggestions were found. Answer the next simple question that is still undecided; confirmed information was not changed.";
  return "The description could not be analysed. Continue with the next simple question; nothing else was changed.";
}
