import type { NextRequest } from "next/server";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV2ModeEnabled } from "@/lib/template-copilot-v2-feature";
import { candidatesFromTemplateCopilotV2SourceSnapshot, templateCopilotV2ModeCommandSchema } from "@/lib/template-copilot-v2-modes";
import { createTemplateCopilotV2SourceSnapshot } from "@/lib/template-copilot-v2-source-snapshot";
import {
  importTemplateCopilotV2SimilarMode,
  loadTemplateCopilotV2OwnedSession,
  replayTemplateCopilotV2SimilarModeIfCommitted,
  switchTemplateCopilotV2AuthoringMode,
} from "@/lib/template-copilot-v2-server-data";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";

/** Server-authoritative mode switching. Similar-template selection reads via
 * the caller's RLS-bound session before the service RPC rechecks ownership and
 * persists an immutable snapshot; the browser never supplies template data. */
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "v2_unavailable", message: "The Copilot v2 mode endpoint is unavailable." } }, 404);
  const body = await readBoundedJson(request, 32_000);
  const parsed = body.ok ? templateCopilotV2ModeCommandSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The authoring mode command is invalid." } }, 400);
  if (!isTemplateCopilotV2ModeEnabled(parsed.data.mode)) return approvalJson(cookieSource, correlationId, { error: { code: "mode_unavailable", message: "That authoring mode is temporarily unavailable. Your session is unchanged." } }, 404);
  try {
    const { sessionId } = await context.params;
    // Ownership is proved before even looking up a selectable source. This
    // prevents a guessed session id being used as a source-directory oracle.
    const owned = await loadTemplateCopilotV2OwnedSession(session, sessionId, actor.id);
    if (!owned || owned.ledger.schemaVersion !== 2) return templateAuthoringRpcResponse({ cookieSource, correlationId, result: { outcome: "not_found" } });
    if (parsed.data.mode === "similar_template" && parsed.data.sourceVersionId) {
      const replay = await replayTemplateCopilotV2SimilarModeIfCommitted({
        session,
        service,
        actor,
        sessionId,
        expectedRevision: parsed.data.expectedRevision,
        idempotencyKey: parsed.data.idempotencyKey,
        sourceVersionId: parsed.data.sourceVersionId,
      });
      if (replay) return templateAuthoringRpcResponse({ cookieSource, correlationId, result: replay });
    }
    let sourceSnapshot;
    if (parsed.data.sourceVersionId) {
      const { data, error } = await session
        .from("workflow_template_versions")
        .select("id,template_key,version_number,template_snapshot,created_at,updated_at,is_active,is_active_version,template_authoring_drafts!inner(status,family_id,template_authoring_families!inner(status,business_units(name),business_departments(name)))")
        .eq("id", parsed.data.sourceVersionId)
        .eq("is_active", true)
        .eq("is_active_version", true)
        .eq("template_authoring_drafts.status", "published")
        .eq("template_authoring_drafts.template_authoring_families.status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!data) return approvalJson(cookieSource, correlationId, { error: { code: "source_unavailable", message: "That template version is unavailable or you are not allowed to use it." } }, 404);
      sourceSnapshot = createTemplateCopilotV2SourceSnapshot(flattenSourceRow(data as Record<string, unknown>));
    }
    if (parsed.data.mode === "similar_template" && sourceSnapshot) {
      const imported = await importTemplateCopilotV2SimilarMode({ session, service, actor, sessionId, expectedRevision: parsed.data.expectedRevision, idempotencyKey: parsed.data.idempotencyKey, sourceSnapshot, candidates: candidatesFromTemplateCopilotV2SourceSnapshot(sourceSnapshot) });
      return templateAuthoringRpcResponse({ cookieSource, correlationId, result: imported });
    }
    const switched = await switchTemplateCopilotV2AuthoringMode({ session, service, actor, sessionId, ...parsed.data, sourceSnapshot });
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result: switched });
  } catch (error) {
    safeApprovalLog("template_copilot_v2_mode_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    const failure = classifyTemplateCopilotV2OperationError(error, "The authoring mode could not be changed.");
    return approvalJson(cookieSource, correlationId, { error: failure.error }, failure.status);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled() || !isTemplateCopilotV2ModeEnabled("similar_template")) return approvalJson(cookieSource, correlationId, { versions: [] });
  try {
    const { sessionId } = await context.params;
    const owned = await loadTemplateCopilotV2OwnedSession(session, sessionId, actor.id);
    if (!owned || owned.ledger.schemaVersion !== 2) return approvalJson(cookieSource, correlationId, { versions: [] }, 404);
    const { data, error } = await session.from("workflow_template_versions")
      .select("id,template_key,version_number,template_snapshot,created_at,updated_at,is_active,is_active_version,template_authoring_drafts!inner(status,family_id,template_authoring_families!inner(status,business_units(name),business_departments(name)))")
      .eq("is_active", true).eq("is_active_version", true)
      .eq("template_authoring_drafts.status", "published")
      .eq("template_authoring_drafts.template_authoring_families.status", "active")
      .order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    const versions = (data || []).flatMap((row) => {
      try {
        const snapshot = createTemplateCopilotV2SourceSnapshot(flattenSourceRow(row as Record<string, unknown>));
        return [{ versionId: snapshot.versionId, versionNumber: snapshot.versionNumber, templateKey: snapshot.templateKey, name: snapshot.name, businessName: snapshot.businessName, departmentName: snapshot.departmentName }];
      } catch { return []; }
    });
    return approvalJson(cookieSource, correlationId, { versions });
  } catch {
    return approvalJson(cookieSource, correlationId, { error: { code: "dependency_unavailable", message: "Similar templates are temporarily unavailable." } }, 503);
  }
}

function flattenSourceRow(row: Record<string, unknown>) {
  const draft = Array.isArray(row.template_authoring_drafts) ? row.template_authoring_drafts[0] : row.template_authoring_drafts;
  const family = draft && typeof draft === "object" && !Array.isArray(draft) ? (draft as Record<string, unknown>).template_authoring_families : undefined;
  const flattenedFamily = Array.isArray(family) ? family[0] : family;
  const business = flattenedFamily && typeof flattenedFamily === "object" && !Array.isArray(flattenedFamily) ? (flattenedFamily as Record<string, unknown>).business_units : undefined;
  const department = flattenedFamily && typeof flattenedFamily === "object" && !Array.isArray(flattenedFamily) ? (flattenedFamily as Record<string, unknown>).business_departments : undefined;
  return { ...row, business_name: objectName(business), department_name: objectName(department) };
}
function objectName(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).name === "string" ? (value as Record<string, unknown>).name : undefined; }
