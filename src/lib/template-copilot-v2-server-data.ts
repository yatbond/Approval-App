import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import {
  applyTemplateCopilotV2FactTransition,
  approveLegacyTemplateCopilotUpgrade,
  createTemplateCopilotV2Ledger,
  previewLegacyTemplateCopilotUpgrade,
  templateCopilotV2LedgerSchema,
  templateCopilotStoredLedgerSchema,
  type TemplateCopilotFactId,
  type V2FactTransition,
} from "./template-copilot-facts.ts";
import { getTemplateCopilotReadiness } from "./template-copilot-readiness.ts";
import { requireTemplateCopilotV2, type TemplateCopilotV2Flag } from "./template-copilot-v2-feature.ts";

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
  const commandHash = templateCopilotV2CommandHash({ operation: "create_session", clientMessageId, ledger });
  const { data, error } = await service.rpc("create_template_copilot_v2_session", {
    p_actor_id: actor.id, p_client_message_id: clientMessageId, p_command_hash: commandHash,
    p_ledger: ledger, p_assistant_message: "Copilot v2 field ledger started. Continue through the v2 interview path.",
  });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  if (result.ledger) templateCopilotV2LedgerSchema.parse(result.ledger);
  return result;
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
  if (replay) return replay;
  const stored = await loadV2StoredSession(session, sessionId);
  if (!stored || stored.ledger.schemaVersion !== 2) return { outcome: "not_found" };
  const confirmedAt = new Date().toISOString();
  const nextLedger = applyTemplateCopilotV2FactTransition({ ledger: stored.ledger, factId, transition, actorId: actor.id, confirmedAt, flag });
  const readiness = getTemplateCopilotReadiness(nextLedger, { compilerValid: false, publishedRevisionMatches: false });
  const { data, error } = await service.rpc("mutate_template_copilot_v2_fact", {
    p_actor_id: actor.id, p_session_id: sessionId, p_expected_revision: expectedRevision,
    p_idempotency_key: idempotencyKey, p_command_hash: commandHash, p_operation: transition.operation,
    p_fact_id: factId, p_fact_entry: nextLedger.facts[factId], p_readiness: readiness,
  });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  if (result.ledger) templateCopilotV2LedgerSchema.parse(result.ledger);
  return result;
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
  if (replay) return replay;
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
  if (result.ledger) templateCopilotV2LedgerSchema.parse(result.ledger);
  return result;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortJson(child)]));
  return value;
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
