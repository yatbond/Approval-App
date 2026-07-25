import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ApprovalRolloutMode =
  | "read_compare"
  | "cohort"
  | "authoritative"
  | "rollback_read_only";

export type ApprovalRolloutDecision = {
  mode: ApprovalRolloutMode;
  commandEnabled: boolean;
  cohortBucket: number | null;
  cohortPercentage: number;
  legacyReadFallbackAllowed: boolean;
  legacyReadFallbackUntil: string | null;
  legacyWritesFrozen: true;
};

const failClosedDecision: ApprovalRolloutDecision = {
  mode: "rollback_read_only",
  commandEnabled: false,
  cohortBucket: null,
  cohortPercentage: 0,
  legacyReadFallbackAllowed: false,
  legacyReadFallbackUntil: null,
  legacyWritesFrozen: true,
};

export async function getApprovalRolloutDecision(
  service: SupabaseClient,
  actorId: string,
): Promise<ApprovalRolloutDecision> {
  const { data, error } = await service.rpc("get_approval_rollout_decision", {
    p_actor_id: actorId,
  });
  if (error || !data || typeof data !== "object") return failClosedDecision;
  const raw = data as Record<string, unknown>;
  if (
    !["read_compare", "cohort", "authoritative", "rollback_read_only"].includes(
      String(raw.mode),
    ) ||
    raw.legacyWritesFrozen !== true
  ) {
    return failClosedDecision;
  }
  return {
    mode: raw.mode as ApprovalRolloutMode,
    commandEnabled: raw.commandEnabled === true,
    cohortBucket:
      typeof raw.cohortBucket === "number" ? raw.cohortBucket : null,
    cohortPercentage: Number(raw.cohortPercentage || 0),
    legacyReadFallbackAllowed: raw.legacyReadFallbackAllowed === true,
    legacyReadFallbackUntil:
      typeof raw.legacyReadFallbackUntil === "string"
        ? raw.legacyReadFallbackUntil
        : null,
    legacyWritesFrozen: true,
  };
}

export async function loadApprovalRolloutDecisionForServer(actorId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return failClosedDecision;
  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return getApprovalRolloutDecision(service, actorId);
}

export async function auditApprovalRuntimeProjection(
  service: SupabaseClient,
  requestNo: string,
) {
  const { data, error } = await service.rpc("audit_approval_runtime_projections", {
    p_request_no: requestNo,
    p_limit: 1,
  });
  return !error && data && typeof data === "object" ? data : null;
}
