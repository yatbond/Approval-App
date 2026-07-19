import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  createDevelopmentApprovalProfile,
} from "@/lib/approval-server";

export async function GET(request: NextRequest) {
  const developmentProfile = createDevelopmentApprovalProfile();
  if (developmentProfile) {
    return approvalJson(NextResponse.next(), randomUUID(), {
      profile: developmentProfile,
      effectiveRoles: developmentProfile.effectiveRoles,
      scopeAssignments: developmentProfile.scopeAssignments,
      scope: { business: null, department: null },
    });
  }

  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, service, cookieSource, correlationId } = resolved.context;
  let department: Record<string, unknown> | null = null;
  if (actor.id) {
    const { data: profile } = await service
      .from("profiles")
      .select("department_id,departments(id,name)")
      .eq("id", actor.id)
      .maybeSingle();
    const related = profile?.departments;
    department = Array.isArray(related) ? related[0] || null : related || null;
  }
  return approvalJson(cookieSource, correlationId, {
    profile: actor,
    effectiveRoles: actor.effectiveRoles || [actor.role],
    scopeAssignments: actor.scopeAssignments || [],
    scope: { department },
  });
}
