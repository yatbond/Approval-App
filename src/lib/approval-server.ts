import "server-only";

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { ApprovalApiErrorCode } from "./approval-api-contracts.ts";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import {
  getDevelopmentAuthBypassUser,
  getLocalPerformanceAuthBypassUser,
  localPerformanceAuthHeader,
} from "./supabase/development-auth-bypass.ts";
import { createSupabaseRouteClient } from "./supabase/route.ts";
import { createSupabaseJsonResponse } from "./supabase/route-response.ts";
import { getSupabaseRouteUser } from "./supabase/route-user.ts";

export type ApprovalServerContext = {
  correlationId: string;
  cookieSource: NextResponse;
  session: SupabaseClient;
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
};

export type ApprovalServerContextResult =
  | { ok: true; context: ApprovalServerContext }
  | {
      ok: false;
      correlationId: string;
      cookieSource: NextResponse;
      status: number;
      code: ApprovalApiErrorCode;
      message: string;
    };

export async function createApprovalServerContext(
  request: NextRequest,
): Promise<ApprovalServerContextResult> {
  const correlationId = safeCorrelationId(request.headers.get("x-correlation-id"));
  const cookieSource = NextResponse.next();

  try {
    const session = createSupabaseRouteClient(request, cookieSource);
    const user = await getSupabaseRouteUser(session);
    if (!user) {
      return failure(
        cookieSource,
        correlationId,
        401,
        "authentication_required",
        "Sign in to continue.",
      );
    }

    const { data: profile, error } = await session
      .from("profiles")
      .select("id,email,full_name,role,is_admin,is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      safeApprovalLog("profile_lookup_failed", correlationId, {
        errorCode: error.code || "unknown",
      });
      return failure(
        cookieSource,
        correlationId,
        503,
        "dependency_unavailable",
        "The approval service is temporarily unavailable.",
      );
    }
    if (!profile?.is_active) {
      return failure(
        cookieSource,
        correlationId,
        403,
        "inactive_profile",
        "Your active approval profile could not be verified.",
      );
    }

    const service = createApprovalServiceClient();
    const now = new Date().toISOString();
    const { data: assignments, error: assignmentError } = await service
      .from("approval_scoped_role_assignments")
      .select(
        "role,business_unit_id,department_id,workflow_template_id,starts_at,expires_at",
      )
      .eq("profile_id", profile.id)
      .eq("is_active", true)
      .lte("starts_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (assignmentError) {
      safeApprovalLog("role_assignment_lookup_failed", correlationId, {
        errorCode: assignmentError.code || "unknown",
      });
      return failure(
        cookieSource,
        correlationId,
        503,
        "dependency_unavailable",
        "Your approval permissions could not be verified.",
      );
    }
    const effectiveRoles = Array.from(
      new Set([
        profile.role,
        ...(profile.is_admin ? ["superuser"] : []),
        ...(assignments || []).map((assignment) => assignment.role),
      ]),
    );

    return {
      ok: true,
      context: {
        correlationId,
        cookieSource,
        session,
        service,
        actor: {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          role: profile.role,
          isAdmin: profile.is_admin || effectiveRoles.includes("superuser"),
          isActive: profile.is_active,
          effectiveRoles,
          scopeAssignments: (assignments || []).map((assignment) => ({
            role: assignment.role,
            businessUnitId: assignment.business_unit_id,
            departmentId: assignment.department_id,
            workflowTemplateId: assignment.workflow_template_id,
            startsAt: assignment.starts_at,
            expiresAt: assignment.expires_at,
          })),
        },
      },
    };
  } catch (error) {
    safeApprovalLog("context_initialization_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return failure(
      cookieSource,
      correlationId,
      503,
      "dependency_unavailable",
      "The approval service is temporarily unavailable.",
    );
  }
}

export function createDevelopmentApprovalProfile(
  request?: NextRequest,
): ApprovalRuntimeProfile | null {
  const user =
    getLocalPerformanceAuthBypassUser({
      enabled: process.env.LOCAL_PERFORMANCE_AUTH_ENABLED,
      email: process.env.LOCAL_PERFORMANCE_AUTH_EMAIL,
      expectedToken: process.env.LOCAL_PERFORMANCE_AUTH_TOKEN,
      requestToken: request?.headers.get(localPerformanceAuthHeader),
      requestHost: request?.headers.get("host"),
    }) ||
    getDevelopmentAuthBypassUser({
      nodeEnv: process.env.NODE_ENV,
      email: process.env.E2E_AUTH_BYPASS_EMAIL,
    });
  return user
    ? {
        id: user.id,
        email: user.email,
        fullName: "Development E2E User",
        role: "superuser",
        isAdmin: true,
        isActive: true,
        effectiveRoles: ["superuser"],
        scopeAssignments: [],
      }
    : null;
}

export function approvalJson(
  cookieSource: NextResponse,
  correlationId: string,
  body: Record<string, unknown>,
  status = 200,
) {
  return createSupabaseJsonResponse(
    cookieSource,
    { ...body, correlationId },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Correlation-Id": correlationId,
      },
    },
  );
}

export function approvalError(
  result: Extract<ApprovalServerContextResult, { ok: false }>,
) {
  return approvalJson(
    result.cookieSource,
    result.correlationId,
    { error: { code: result.code, message: result.message } },
    result.status,
  );
}

export function safeApprovalLog(
  event: string,
  correlationId: string,
  fields: Record<string, string | number | boolean | null>,
) {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "approval-workflow",
    event,
    correlationId,
    ...fields,
  }));
}

function createApprovalServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Server approval database credentials are not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function safeCorrelationId(value: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f-]{28,40}$/i.test(value)
    ? value.slice(0, 64)
    : randomUUID();
}

function failure(
  cookieSource: NextResponse,
  correlationId: string,
  status: number,
  code: ApprovalApiErrorCode,
  message: string,
): Extract<ApprovalServerContextResult, { ok: false }> {
  return { ok: false, cookieSource, correlationId, status, code, message };
}
