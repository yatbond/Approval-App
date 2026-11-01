import type { TemplateCopilotFactId, TemplateCopilotFactStatus } from "./template-copilot-facts.ts";
import { normalizeTemplateCopilotCommittedValue } from "./template-copilot-v2-canonical-values.ts";

export type TemplateCopilotV2MapIntent =
  | Readonly<{ action: "save"; canonicalValue: unknown }>
  | Readonly<{ action: "unknown" }>
  | Readonly<{ action: "not_applicable"; reason: string }>;

export type TemplateCopilotV2MapOperation =
  | "human_commit"
  | "human_replace"
  | "resolve_conflict"
  | "mark_unknown"
  | "mark_not_applicable";

export type PendingTemplateCopilotV2MapCommand = Readonly<{
  sessionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  factId: TemplateCopilotFactId;
  operation: TemplateCopilotV2MapOperation;
  canonicalValue?: unknown;
  reason?: string;
}>;

const mapFactIds = new Set<string>([
  "workflow.name", "workflow.purpose", "workflow.scope",
  "request.initiator_policy", "request.fields", "attachments.requirements",
  "workflow.stages", "workflow.conditions", "workflow.rejection_policy",
  "collaboration.policy", "timing.rules", "visibility.policy",
  "notifications.rules", "governance.owner", "governance.policies",
  "governance.retention",
]);

export function createPendingTemplateCopilotV2MapCommand({
  sessionId,
  expectedRevision,
  idempotencyKey,
  factId,
  factStatus,
  intent,
}: {
  sessionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  factId: TemplateCopilotFactId;
  factStatus: TemplateCopilotFactStatus;
  intent: TemplateCopilotV2MapIntent;
}): PendingTemplateCopilotV2MapCommand {
  const operation: TemplateCopilotV2MapOperation = intent.action === "unknown"
    ? "mark_unknown"
    : intent.action === "not_applicable"
      ? "mark_not_applicable"
      : factStatus === "conflicting"
        ? "resolve_conflict"
        : factStatus === "committed" || factStatus === "not_applicable"
          ? "human_replace"
          : "human_commit";
  const canonicalValue = intent.action === "save"
    ? normalizeTemplateCopilotCommittedValue(factId, intent.canonicalValue)
    : undefined;
  return Object.freeze({
    sessionId,
    expectedRevision,
    idempotencyKey,
    factId,
    operation,
    ...(intent.action === "save" ? { canonicalValue } : {}),
    ...(intent.action === "not_applicable" ? { reason: intent.reason } : {}),
  });
}

export function templateCopilotV2PendingMapCommandBody(command: PendingTemplateCopilotV2MapCommand) {
  const transition = command.operation === "mark_unknown"
    ? { operation: command.operation }
    : command.operation === "mark_not_applicable"
      ? { operation: command.operation, reason: command.reason }
      : {
          operation: command.operation,
          payload: {
            canonicalValue: command.canonicalValue,
            provenance: [{
              kind: "human_editor",
              sourceId: `map:${command.idempotencyKey}`,
              sourceMessageIds: [],
            }],
          },
        };
  return {
    expectedRevision: command.expectedRevision,
    idempotencyKey: command.idempotencyKey,
    factId: command.factId,
    transition,
  } as const;
}

export function parsePendingTemplateCopilotV2MapCommand(value: unknown): PendingTemplateCopilotV2MapCommand | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const operations: readonly TemplateCopilotV2MapOperation[] = ["human_commit", "human_replace", "resolve_conflict", "mark_unknown", "mark_not_applicable"];
  if (
    typeof candidate.sessionId !== "string"
    || !Number.isInteger(candidate.expectedRevision)
    || Number(candidate.expectedRevision) < 1
    || typeof candidate.idempotencyKey !== "string"
    || candidate.idempotencyKey.length === 0
    || typeof candidate.factId !== "string"
    || !mapFactIds.has(candidate.factId)
    || typeof candidate.operation !== "string"
    || !operations.includes(candidate.operation as TemplateCopilotV2MapOperation)
  ) return null;
  if (candidate.operation === "mark_not_applicable" && typeof candidate.reason !== "string") return null;
  if (!["mark_unknown", "mark_not_applicable"].includes(candidate.operation) && !Object.hasOwn(candidate, "canonicalValue")) return null;
  let canonicalValue: unknown;
  if (!["mark_unknown", "mark_not_applicable"].includes(candidate.operation)) {
    try {
      canonicalValue = normalizeTemplateCopilotCommittedValue(candidate.factId as TemplateCopilotFactId, candidate.canonicalValue);
    } catch {
      return null;
    }
  }
  return Object.freeze({
    sessionId: candidate.sessionId,
    expectedRevision: Number(candidate.expectedRevision),
    idempotencyKey: candidate.idempotencyKey,
    factId: candidate.factId as TemplateCopilotFactId,
    operation: candidate.operation as TemplateCopilotV2MapOperation,
    ...(!["mark_unknown", "mark_not_applicable"].includes(candidate.operation) ? { canonicalValue } : {}),
    ...(candidate.operation === "mark_not_applicable" ? { reason: candidate.reason as string } : {}),
  });
}
