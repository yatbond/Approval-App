import type { NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/bounded-request";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";

const rolloutModes = new Set([
  "read_compare",
  "cohort",
  "authoritative",
  "rollback_read_only",
]);

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, service, cookieSource, correlationId } = resolved.context;
  if (!actor.isAdmin) {
    return approvalJson(cookieSource, correlationId, {
      error: { code: "forbidden", message: "Administrator access is required." },
    }, 403);
  }

  const [setting, events, mismatches, unresolved] = await Promise.all([
    service.from("approval_rollout_settings").select("*").eq("singleton", true).single(),
    service.from("approval_rollout_events").select("*").order("created_at", { ascending: false }).limit(25),
    service.from("approval_read_comparison_mismatches").select("*").order("last_seen_at", { ascending: false }).limit(50),
    service.from("approval_read_comparison_mismatches").select("id", { count: "exact", head: true }).is("resolved_at", null),
  ]);
  const failure = [setting.error, events.error, mismatches.error, unresolved.error].find(Boolean);
  if (failure) {
    safeApprovalLog("rollout_status_failed", correlationId, { errorCode: failure?.code || "unknown" });
    return approvalJson(cookieSource, correlationId, {
      error: { code: "dependency_unavailable", message: "Rollout status is temporarily unavailable." },
    }, 503);
  }
  return approvalJson(cookieSource, correlationId, {
    setting: setting.data,
    recentEvents: events.data || [],
    recentMismatches: mismatches.data || [],
    unresolvedMismatchCount: unresolved.count || 0,
  });
}

export async function POST(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, service, cookieSource, correlationId } = resolved.context;
  if (!actor.isAdmin) {
    return approvalJson(cookieSource, correlationId, {
      error: { code: "forbidden", message: "Administrator access is required." },
    }, 403);
  }
  const bounded = await readBoundedJson(request, 16_000);
  if (!bounded.ok || !bounded.value || typeof bounded.value !== "object" || Array.isArray(bounded.value)) {
    return invalid(cookieSource, correlationId);
  }
  const body = bounded.value as Record<string, unknown>;
  let result;
  if (body.action === "set_state") {
    const mode = String(body.mode || "");
    const cohortPercentage = Number(body.cohortPercentage);
    const reason = String(body.reason || "").trim();
    const fallbackUntil = body.legacyReadFallbackUntil === null
      ? null
      : String(body.legacyReadFallbackUntil || "");
    if (
      !rolloutModes.has(mode) || !Number.isInteger(cohortPercentage) ||
      cohortPercentage < 0 || cohortPercentage > 100 ||
      reason.length < 8 || reason.length > 1000 ||
      (fallbackUntil !== null && !Number.isFinite(Date.parse(fallbackUntil)))
    ) return invalid(cookieSource, correlationId);
    result = await service.rpc("set_approval_rollout_state", {
      p_mode: mode,
      p_cohort_percentage: cohortPercentage,
      p_legacy_read_fallback_until: fallbackUntil,
      p_actor_id: actor.id,
      p_reason: reason,
    });
  } else if (body.action === "audit") {
    const requestNo = body.requestNo ? String(body.requestNo).trim() : null;
    const limit = Number(body.limit ?? 500);
    if ((requestNo?.length || 0) > 100 || !Number.isInteger(limit) || limit < 1 || limit > 5000) {
      return invalid(cookieSource, correlationId);
    }
    result = await service.rpc("audit_approval_runtime_projections", {
      p_request_no: requestNo,
      p_limit: limit,
    });
  } else if (body.action === "reconcile") {
    const limit = Number(body.limit ?? 1000);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      return invalid(cookieSource, correlationId);
    }
    result = await service.rpc("reconcile_approval_legacy_runtime", { p_limit: limit });
  } else {
    return invalid(cookieSource, correlationId);
  }
  if (result.error) {
    safeApprovalLog("rollout_operation_failed", correlationId, {
      action: String(body.action), errorCode: result.error.code || "unknown",
    });
    return approvalJson(cookieSource, correlationId, {
      error: { code: "dependency_unavailable", message: "The rollout operation did not complete." },
    }, 503);
  }
  return approvalJson(cookieSource, correlationId, { result: result.data });
}

function invalid(cookieSource: Parameters<typeof approvalJson>[0], correlationId: string) {
  return approvalJson(cookieSource, correlationId, {
    error: { code: "invalid_request", message: "The rollout operation is invalid." },
  }, 400);
}
