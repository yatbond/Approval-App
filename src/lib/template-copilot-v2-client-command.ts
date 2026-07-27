import { compareTemplateCopilotTimestamps } from "./template-copilot-history.ts";
import { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";

export type TemplateCopilotV2ClientAnswer = Readonly<{ kind: "text"; text: string } | { kind: "choice"; optionId: string }>;
export type TemplateCopilotV2PendingCommand = Readonly<{ idempotencyKey: string; expectedRevision: number; answer: TemplateCopilotV2ClientAnswer; questionId: string; primaryDecisionId: string }>;
export type TemplateCopilotV2SpecialCommand = Readonly<{ operation: "defer" } | { operation: "not_applicable"; reason: string } | { operation: "reopen"; decisionId: string }>;
export type TemplateCopilotV2PendingSpecialCommand = Readonly<{ sessionId: string; idempotencyKey: string; expectedRevision: number; command: TemplateCopilotV2SpecialCommand }>;
export type TemplateCopilotV2QuestionLibraryVersion = "v2.0" | "v2.1";
export type TemplateCopilotV2PendingStart = Readonly<{ idempotencyKey: string; businessUnitId: string; departmentName: string; locale: "en" | "zh-Hant" | "zh-Hans"; questionLibraryVersion: TemplateCopilotV2QuestionLibraryVersion; initialRequirement?: string }>;
export type TemplateCopilotClientChatMessage = Readonly<{
  id: string;
  clientMessageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}>;

export function createTemplateCopilotClientChatMessage({
  clientMessageId,
  role,
  content,
  createdAt = new Date().toISOString(),
}: {
  clientMessageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}): TemplateCopilotClientChatMessage {
  return Object.freeze({
    id: role === "assistant" ? `${clientMessageId}-assistant` : clientMessageId,
    clientMessageId,
    role,
    content,
    createdAt,
  });
}

/** Stored transcript rows retain PostgreSQL's full RFC3339 timestamp.  The
 * browser-visible ID is the durable command/role key, so an optimistic row is
 * replaced rather than duplicated when its authoritative row arrives. */
export function parseTemplateCopilotClientChatMessages(input: unknown): TemplateCopilotClientChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const byId = new Map<string, TemplateCopilotClientChatMessage>();
  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const record = value as { id?: unknown; clientMessageId?: unknown; role?: unknown; content?: unknown; createdAt?: unknown };
    if (
      typeof record.id !== "string"
      || typeof record.clientMessageId !== "string"
      || (record.role !== "user" && record.role !== "assistant")
      || typeof record.content !== "string"
      || typeof record.createdAt !== "string"
      || !record.createdAt
    ) continue;
    const message = createTemplateCopilotClientChatMessage({
      clientMessageId: record.clientMessageId,
      role: record.role,
      content: record.content,
      createdAt: record.createdAt,
    });
    byId.set(message.id, message);
  }
  return orderTemplateCopilotClientChatMessages([...byId.values()]);
}

export function orderTemplateCopilotClientChatMessages(messages: readonly TemplateCopilotClientChatMessage[]) {
  return [...messages].sort((left, right) => {
    const timeOrder = compareTemplateCopilotTimestamps(left.createdAt, right.createdAt);
    if (timeOrder !== 0) return timeOrder;
    if (left.clientMessageId === right.clientMessageId && left.role !== right.role) {
      return left.role === "user" ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });
}

export function mergeTemplateCopilotClientChatMessages(
  current: readonly TemplateCopilotClientChatMessage[],
  authoritative: readonly TemplateCopilotClientChatMessage[],
) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of authoritative) byId.set(message.id, message);
  return orderTemplateCopilotClientChatMessages([...byId.values()]);
}

export function parseTemplateCopilotV2PendingSpecialCommand(value: unknown): TemplateCopilotV2PendingSpecialCommand | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TemplateCopilotV2PendingSpecialCommand>;
  if (typeof candidate.sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.sessionId) || typeof candidate.idempotencyKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(candidate.idempotencyKey) || !Number.isInteger(candidate.expectedRevision) || Number(candidate.expectedRevision) < 1 || !candidate.command || typeof candidate.command !== "object") return null;
  const command = candidate.command as Partial<TemplateCopilotV2SpecialCommand>;
  if (command.operation === "defer") return Object.freeze({ sessionId: candidate.sessionId, idempotencyKey: candidate.idempotencyKey, expectedRevision: Number(candidate.expectedRevision), command: Object.freeze({ operation: "defer" as const }) });
  if (command.operation === "not_applicable" && typeof command.reason === "string" && command.reason.trim() && templateCopilotUnicodeCodePointCount(command.reason.trim()) <= 500) return Object.freeze({ sessionId: candidate.sessionId, idempotencyKey: candidate.idempotencyKey, expectedRevision: Number(candidate.expectedRevision), command: Object.freeze({ operation: "not_applicable" as const, reason: command.reason.trim() }) });
  if (command.operation === "reopen" && typeof command.decisionId === "string" && /^decision\.[a-z][a-z0-9_.-]{2,95}$/.test(command.decisionId)) return Object.freeze({ sessionId: candidate.sessionId, idempotencyKey: candidate.idempotencyKey, expectedRevision: Number(candidate.expectedRevision), command: Object.freeze({ operation: "reopen" as const, decisionId: command.decisionId }) });
  return null;
}

/** Pending starts created before Step 4 have no library pin. Treat that
 * persisted shape as v2.0 forever: a response-lost retry must retain both its
 * original intent and the original server-side command hash after deployment. */
export function parseTemplateCopilotV2PendingStart(value: unknown): TemplateCopilotV2PendingStart | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TemplateCopilotV2PendingStart>;
  if (
    typeof candidate.idempotencyKey !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(candidate.idempotencyKey)
    || typeof candidate.businessUnitId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.businessUnitId)
    || typeof candidate.departmentName !== "string"
    || !candidate.departmentName.trim()
    || !["en", "zh-Hant", "zh-Hans"].includes(String(candidate.locale))
    || (candidate.initialRequirement !== undefined && typeof candidate.initialRequirement !== "string")
  ) return null;
  return Object.freeze({
    idempotencyKey: candidate.idempotencyKey,
    businessUnitId: candidate.businessUnitId,
    departmentName: candidate.departmentName,
    locale: candidate.locale as TemplateCopilotV2PendingStart["locale"],
    questionLibraryVersion: candidate.questionLibraryVersion === "v2.1" ? "v2.1" : "v2.0",
    ...(candidate.initialRequirement?.trim() ? { initialRequirement: candidate.initialRequirement } : {}),
  });
}

/** A start is also an immutable command.  Retaining its complete intent means
 * a lost 201 is retried with exactly the same durable key; changing scope or
 * language is an explicit new command, never an accidental replay. */
export function nextTemplateCopilotV2PendingStart({ pending, businessUnitId, departmentName, locale, questionLibraryVersion = "v2.1", initialRequirement, createKey }: {
  pending: TemplateCopilotV2PendingStart | null; businessUnitId: string; departmentName: string; locale: TemplateCopilotV2PendingStart["locale"]; questionLibraryVersion?: TemplateCopilotV2QuestionLibraryVersion; initialRequirement?: string; createKey: () => string;
}) {
  const normalized = { businessUnitId, departmentName, locale, questionLibraryVersion, ...(initialRequirement ? { initialRequirement } : {}) };
  if (pending) {
    if (pending.businessUnitId === normalized.businessUnitId && pending.departmentName === normalized.departmentName && pending.locale === normalized.locale && pending.questionLibraryVersion === normalized.questionLibraryVersion && pending.initialRequirement === normalized.initialRequirement) return pending;
    throw new Error("Retry or resolve the previous Copilot start before changing its scope.");
  }
  return Object.freeze({ idempotencyKey: createKey(), ...normalized });
}

export function resolveTemplateCopilotV2StartFailure({ status, command, currentPending }: { status: number | null; command: TemplateCopilotV2PendingStart; currentPending: TemplateCopilotV2PendingStart | null }) {
  const ambiguous = status === null || status >= 500;
  return { retain: ambiguous, pending: ambiguous ? (currentPending?.idempotencyKey === command.idempotencyKey ? command : currentPending) : (currentPending?.idempotencyKey === command.idempotencyKey ? null : currentPending) };
}

export type TemplateCopilotStartSchemaVersion = 1 | 2;
export type TemplateCopilotStartIntent = Readonly<{
  businessUnitId: string;
  departmentName: string;
  locale: "en" | "zh-Hant" | "zh-Hans";
  questionLibraryVersion?: TemplateCopilotV2QuestionLibraryVersion;
  initialRequirement?: string;
}>;
export type TemplateCopilotStartRequest = TemplateCopilotStartIntent & Readonly<{ clientMessageId: string }>;

export type TemplateCopilotV2LifecycleLease = Readonly<{
  epoch: number;
  isCurrent: () => boolean;
  commit: (effect: () => void) => boolean;
}>;

export type TemplateCopilotV2LifecycleFence = Readonly<{
  capture: () => TemplateCopilotV2LifecycleLease;
  invalidateCurrent: () => number;
  currentEpoch: () => number;
}>;

/** A lifecycle lease is an authority token for one mounted v2 generation.
 * Rollback, superseding operations, and component teardown invalidate every
 * previously captured lease synchronously. Effects must use commit(), including
 * deferred React updater callbacks, so an old promise cannot restore state or
 * browser storage after its lifecycle no longer owns the client. */
export function createTemplateCopilotV2LifecycleFence(): TemplateCopilotV2LifecycleFence {
  let epoch = 0;
  const currentEpoch = () => epoch;
  return Object.freeze({
    currentEpoch,
    capture: () => {
      const capturedEpoch = epoch;
      const isCurrent = () => epoch === capturedEpoch;
      return Object.freeze({
        epoch: capturedEpoch,
        isCurrent,
        commit: (effect: () => void) => {
          if (!isCurrent()) return false;
          effect();
          return true;
        },
      });
    },
    invalidateCurrent: () => {
      if (epoch >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Template Copilot v2 lifecycle epoch exhausted.");
      }
      epoch += 1;
      return epoch;
    },
  });
}

export type TemplateCopilotV2RollbackCleanup = Readonly<{
  hasLoadedV2: () => boolean;
  advanceLifecycleEpoch: () => void;
  markReleased: () => void;
  clearPendingStart: () => void;
  clearPendingSpecial: () => void;
  clearPendingAnswer: () => void;
  clearCommandTracking: () => void;
  clearInterviewAndMessages: () => void;
  clearLocks: () => void;
}>;

/** Release every client-owned part of an already-loaded v2 interview as one
 * transaction. Clean v1 pages return before any setter or storage callback is
 * touched, preserving the strict legacy isolation contract. */
export function releaseTemplateCopilotV2ClientAfterRollback(
  cleanup: TemplateCopilotV2RollbackCleanup,
) {
  if (!cleanup.hasLoadedV2()) return false;
  // This is deliberately the first loaded-v2 mutation. Every continuation
  // captured before rollback becomes stale before any state or lock is reset.
  cleanup.advanceLifecycleEpoch();
  cleanup.markReleased();
  cleanup.clearPendingStart();
  cleanup.clearPendingSpecial();
  cleanup.clearPendingAnswer();
  cleanup.clearCommandTracking();
  cleanup.clearInterviewAndMessages();
  cleanup.clearLocks();
  return true;
}

/** Capability discovery owns access to every v2-only recovery store. Keeping
 * the lazy loaders behind this function means schema 1 never reads a v2 store.
 * Its shared release callback only clears v2 state that this mounted client
 * already knows it loaded before the server rolled back the capability. */
export async function discoverTemplateCopilotV2Recovery({
  lifecycle,
  discoverSchemaVersion,
  releaseLoadedV2AfterRollback,
  loadPendingV2Start,
  loadPendingV2Special,
}: {
  lifecycle: TemplateCopilotV2LifecycleLease;
  discoverSchemaVersion: () => Promise<TemplateCopilotStartSchemaVersion>;
  releaseLoadedV2AfterRollback: () => void;
  loadPendingV2Start: () => TemplateCopilotV2PendingStart | null;
  loadPendingV2Special: () => TemplateCopilotV2PendingSpecialCommand | null;
}) {
  const schemaVersion = await discoverSchemaVersion();
  if (!lifecycle.isCurrent()) return null;
  if (schemaVersion === 1) {
    releaseLoadedV2AfterRollback();
    return Object.freeze({
      schemaVersion,
      pendingStart: null,
      pendingSpecial: null,
    });
  }
  return Object.freeze({
    schemaVersion,
    pendingStart: loadPendingV2Start(),
    pendingSpecial: loadPendingV2Special(),
  });
}

export function selectTemplateCopilotStartIntent(
  fallback: TemplateCopilotStartIntent,
  pending: TemplateCopilotV2PendingStart | null,
): TemplateCopilotStartIntent {
  if (!pending) return Object.freeze({ ...fallback });
  return Object.freeze({
    businessUnitId: pending.businessUnitId,
    departmentName: pending.departmentName,
    locale: pending.locale,
    questionLibraryVersion: pending.questionLibraryVersion,
    ...(pending.initialRequirement
      ? { initialRequirement: pending.initialRequirement }
      : {}),
  });
}

/** Execute start only after a read-only server capability check.  The legacy
 * branch deliberately does not read, reduce, persist, replay, or scope-lock a
 * v2 pending command.  V2 retains its existing exact-key recovery contract. */
export async function executeTemplateCopilotStart<Response>({
  lifecycle,
  schemaVersion,
  intent,
  loadPendingV2,
  installPendingV2,
  createKey,
  request,
}: {
  lifecycle: TemplateCopilotV2LifecycleLease;
  schemaVersion: TemplateCopilotStartSchemaVersion;
  intent: TemplateCopilotStartIntent;
  loadPendingV2: () => TemplateCopilotV2PendingStart | null;
  installPendingV2: (pending: TemplateCopilotV2PendingStart | null) => void;
  createKey: () => string;
  request: (request: TemplateCopilotStartRequest, expectedSchemaVersion: TemplateCopilotStartSchemaVersion) => Promise<Response>;
}) {
  if (!lifecycle.isCurrent()) return null;
  if (schemaVersion === 1) {
    const clientMessageId = createKey();
    const legacyIntent = {
      businessUnitId: intent.businessUnitId,
      departmentName: intent.departmentName,
      locale: intent.locale,
      ...(intent.initialRequirement ? { initialRequirement: intent.initialRequirement } : {}),
    };
    const response = await request({ ...legacyIntent, clientMessageId }, 1);
    if (!lifecycle.isCurrent()) return null;
    return { schemaVersion, clientMessageId, response } as const;
  }

  const command = nextTemplateCopilotV2PendingStart({
    pending: loadPendingV2(),
    businessUnitId: intent.businessUnitId,
    departmentName: intent.departmentName,
    locale: intent.locale,
    questionLibraryVersion: intent.questionLibraryVersion,
    initialRequirement: intent.initialRequirement,
    createKey,
  });
  installPendingV2(command);
  try {
    const response = await request({ ...intent, questionLibraryVersion: command.questionLibraryVersion, clientMessageId: command.idempotencyKey }, 2);
    if (!lifecycle.isCurrent()) return null;
    installPendingV2(null);
    return { schemaVersion, clientMessageId: command.idempotencyKey, response } as const;
  } catch (error) {
    if (!lifecycle.isCurrent()) return null;
    const status = typeof error === "object"
      && error !== null
      && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;
    const failure = resolveTemplateCopilotV2StartFailure({
      status,
      command,
      currentPending: loadPendingV2(),
    });
    installPendingV2(failure.pending);
    throw error;
  }
}

/** Browser-only command reducer. A retry is the same immutable command, never
 * a new answer aimed at whatever question happens to be visible later. */
export function nextTemplateCopilotV2PendingCommand({ pending, questionId, primaryDecisionId, revision, answer, createKey }: {
  pending: TemplateCopilotV2PendingCommand | null; questionId: string; primaryDecisionId: string; revision: number; answer: TemplateCopilotV2ClientAnswer; createKey: () => string;
}): TemplateCopilotV2PendingCommand {
  if (pending) {
    if (pending.questionId !== questionId || JSON.stringify(pending.answer) !== JSON.stringify(answer)) throw new Error("Retry or reload the previous answer before changing it.");
    return pending;
  }
  return Object.freeze({ idempotencyKey: createKey(), expectedRevision: revision, answer, questionId, primaryDecisionId });
}

/** Special actions are durable commands too.  A missed response must replay
 * the same action at its original revision, never create a second defer/N/A
 * against whatever question happens to be visible now. */
export function nextTemplateCopilotV2PendingSpecialCommand({ pending, sessionId, revision, command, createKey }: {
  pending: TemplateCopilotV2PendingSpecialCommand | null; sessionId: string; revision: number; command: TemplateCopilotV2SpecialCommand; createKey: () => string;
}): TemplateCopilotV2PendingSpecialCommand {
  if (pending) {
    if (pending.sessionId !== sessionId || JSON.stringify(pending.command) !== JSON.stringify(command)) throw new Error("Retry or resolve the previous Copilot action before changing it.");
    return pending;
  }
  const created = parseTemplateCopilotV2PendingSpecialCommand({ sessionId, idempotencyKey: createKey(), expectedRevision: revision, command });
  if (!created) throw new Error("The Copilot action is invalid.");
  return created;
}

export function templateCopilotV2InterviewMutationBlocked({ pendingAnswer, pendingSpecial }: { pendingAnswer: TemplateCopilotV2PendingCommand | null; pendingSpecial: TemplateCopilotV2PendingSpecialCommand | null }) {
  return Boolean(pendingAnswer || pendingSpecial);
}

export type TemplateCopilotV2SpecialReconcileOutcome = "committed" | "missing" | "idempotency_conflict" | "not_found" | "v2_unavailable" | "unavailable";

/** Resolves an ambiguous special action without guessing from the mutable
 * ledger. Only an exact receipt proves commit. A missing receipt is terminal
 * after an explicit 409, but remains ambiguous after a lost/5xx transport. */
export function resolveTemplateCopilotV2SpecialReconciliation({ transportStatus, outcome, command, currentPending }: {
  transportStatus: number | null;
  outcome: TemplateCopilotV2SpecialReconcileOutcome;
  command: TemplateCopilotV2PendingSpecialCommand;
  currentPending: TemplateCopilotV2PendingSpecialCommand | null;
}) {
  const ownsPending = currentPending?.idempotencyKey === command.idempotencyKey;
  if (outcome === "committed") return { pending: ownsPending ? null : currentPending, terminal: true, result: "committed" as const };
  if (outcome === "idempotency_conflict") return { pending: ownsPending ? null : currentPending, terminal: true, result: "conflict" as const };
  if (outcome === "not_found") return { pending: ownsPending ? null : currentPending, terminal: true, result: "not_found" as const };
  if (outcome === "v2_unavailable") return { pending: ownsPending ? null : currentPending, terminal: true, result: "v2_unavailable" as const };
  if (outcome === "missing" && transportStatus === 409) return { pending: ownsPending ? null : currentPending, terminal: true, result: "stale" as const };
  if (outcome === "missing" || outcome === "unavailable") return { pending: currentPending?.idempotencyKey === command.idempotencyKey ? command : currentPending, terminal: false, result: "ambiguous" as const };
  return { pending: currentPending, terminal: false, result: "ambiguous" as const };
}

export function templateCopilotV2FailureNeedsReconcile(status: number | null) {
  return status === null || status === 409 || status >= 500;
}

/** Known validation failures cannot have committed. Drop only that stale
 * command and let the user correct it; ambiguous outcomes retain it for the
 * exact same-key reconciliation/replay path. */
export function resolveTemplateCopilotV2Failure({ status, command, currentPending }: {
  status: number | null;
  command: TemplateCopilotV2PendingCommand;
  currentPending: TemplateCopilotV2PendingCommand | null;
}) {
  if (templateCopilotV2FailureNeedsReconcile(status)) return { shouldReconcile: true, pending: currentPending, restoreText: null, markResolved: false };
  const commandIsStillCurrent = currentPending === null || currentPending.idempotencyKey === command.idempotencyKey;
  return {
    shouldReconcile: false,
    pending: currentPending?.idempotencyKey === command.idempotencyKey ? null : currentPending,
    // A late error from an older tab/attempt must never replace text the user
    // has begun entering for a newer command.
    restoreText: commandIsStillCurrent && command.answer.kind === "text" ? command.answer.text : null,
    markResolved: true,
  };
}

/** An explicit 409 definitely reached the server. If GET finds no exact
 * receipt/decision, the old revision/key cannot safely be replayed. The UI
 * clears it and either restores a rebaseable text answer for the current
 * question or asks the user to review an advanced interview. */
export function resolveTemplateCopilotV2ExplicitConflict({ command, currentPending, currentQuestionId, currentPrimaryDecisionId }: {
  command: TemplateCopilotV2PendingCommand;
  currentPending: TemplateCopilotV2PendingCommand | null;
  currentQuestionId?: string;
  currentPrimaryDecisionId?: string;
}) {
  const sameQuestion = currentQuestionId === command.questionId && currentPrimaryDecisionId === command.primaryDecisionId;
  return {
    pending: currentPending?.idempotencyKey === command.idempotencyKey ? null : currentPending,
    markResolved: true,
    canRebase: sameQuestion,
    restoreText: sameQuestion && command.answer.kind === "text" ? command.answer.text : null,
  };
}

/** A late callback may restore text only if the same command still owns the
 * composer and no edit/clear/new command has advanced its draft generation.
 * A null active command is deliberately never treated as ownership. */
export function canRestoreTemplateCopilotV2Draft({ command, activeCommand, commandDraftGeneration, currentDraftGeneration }: {
  command: TemplateCopilotV2PendingCommand;
  activeCommand: TemplateCopilotV2PendingCommand | null;
  commandDraftGeneration: number | undefined;
  currentDraftGeneration: number;
}) {
  return activeCommand?.idempotencyKey === command.idempotencyKey && commandDraftGeneration === currentDraftGeneration;
}

/** A late recovery snapshot may never roll a session backwards. */
export function selectNewerTemplateCopilotV2Snapshot<T extends { sessionId: string; revision: number }>(current: T | null, candidate: T) {
  return current?.sessionId === candidate.sessionId && current.revision > candidate.revision ? current : candidate;
}

/** A stale recovery GET may never replace the transcript belonging to a
 * newer in-memory revision, even when the old command itself was committed. */
export function canReplaceTemplateCopilotV2Transcript({ installedRevision, snapshotRevision, outcome }: {
  installedRevision: number;
  snapshotRevision: number;
  outcome: "committed" | "already_committed" | "replay_required" | "superseded" | "conflict";
}) {
  return snapshotRevision === installedRevision && (outcome === "committed" || outcome === "already_committed");
}

type AtomicDecisionForReconciliation = Readonly<{
  answer?: unknown;
  kind?: unknown;
  optionId?: unknown;
  provenance?: unknown;
}>;

function decisionMatchesCommand(decision: AtomicDecisionForReconciliation, command: TemplateCopilotV2PendingCommand) {
  const ownedByCommand = Array.isArray(decision.provenance) && decision.provenance.some((entry) => Boolean(entry) && typeof entry === "object" && (entry as { kind?: unknown }).kind === "human_editor" && (entry as { sourceId?: unknown }).sourceId === `answer:${command.idempotencyKey}`);
  if (!ownedByCommand) return false;
  if (command.answer.kind === "text") return decision.kind === "text" && decision.answer === command.answer.text.trim();
  return decision.kind === "choice" && decision.answer === command.answer.optionId && decision.optionId === command.answer.optionId;
}

function decisionHasSameValue(decision: AtomicDecisionForReconciliation, command: TemplateCopilotV2PendingCommand) {
  return command.answer.kind === "text"
    ? decision.kind === "text" && decision.answer === command.answer.text.trim()
    : decision.kind === "choice" && decision.answer === command.answer.optionId && decision.optionId === command.answer.optionId;
}

export function reconcileTemplateCopilotV2PendingCommand<T extends { atomicDecisions: Record<string, unknown> }>({ pending, ledger }: { pending: TemplateCopilotV2PendingCommand | null; ledger: T }) {
  const decision = pending ? ledger.atomicDecisions[pending.primaryDecisionId] as AtomicDecisionForReconciliation | undefined : undefined;
  if (pending && decision && decisionMatchesCommand(decision, pending)) return { pending: null, outcome: "committed" as const };
  if (pending && decision) return { pending: null, outcome: decisionHasSameValue(decision, pending) ? "superseded" as const : "conflict" as const };
  return { pending, outcome: "replay_required" as const };
}

/** Reconciliation is intentionally based on the immutable command captured by
 * submit, rather than a React state value that may still be stale immediately
 * after setPending.  Once committed, that key is terminal and cannot be
 * requeued by a later render or duplicate recovery callback. */
export function applyTemplateCopilotV2Reconciliation<T extends { atomicDecisions: Record<string, unknown> }>({ command, currentPending, resolvedCommandKeys, ledger }: {
  command: TemplateCopilotV2PendingCommand;
  currentPending: TemplateCopilotV2PendingCommand | null;
  resolvedCommandKeys: ReadonlySet<string>;
  ledger: T;
}) {
  if (resolvedCommandKeys.has(command.idempotencyKey)) return { outcome: "already_committed" as const, pending: currentPending, markResolved: false };
  const result = reconcileTemplateCopilotV2PendingCommand({ pending: command, ledger });
  if (result.outcome === "committed" || result.outcome === "superseded" || result.outcome === "conflict") {
    return {
      outcome: result.outcome,
      pending: currentPending?.idempotencyKey === command.idempotencyKey ? null : currentPending,
      markResolved: true,
    };
  }
  // Preserve the captured command only while it remains the active command.
  // A newer command must never be overwritten by an old recovery callback.
  return {
    outcome: "replay_required" as const,
    pending: currentPending === null || currentPending.idempotencyKey === command.idempotencyKey ? command : currentPending,
    markResolved: false,
  };
}
