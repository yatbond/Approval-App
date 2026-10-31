import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { templateAuthoringCapabilities } from "@/lib/template-authoring-capabilities";
import { isTemplateAuthoringActivationEnabled } from "@/lib/template-authoring-lifecycle-feature";

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const activationFeatureAvailable =
    isTemplateAuthoringActivationEnabled();
  let activationFamilyIds: string[] = [];
  if (activationFeatureAvailable) {
    const { data, error } = await service
      .from("template_authoring_memberships")
      .select("family_id,template_authoring_families!inner(status)")
      .eq("profile_id", actor.id)
      .eq("role", "publisher")
      .eq("template_authoring_families.status", "active");
    if (error) {
      safeApprovalLog(
        "template_authoring_activation_capability_failed",
        correlationId,
        { errorCode: String(error.code || "unknown") },
      );
    } else {
      activationFamilyIds = [
        ...new Set(
          (data || [])
            .map((item) => String(item.family_id || ""))
            .filter(Boolean),
        ),
      ];
    }
  }

  return approvalJson(cookieSource, correlationId, {
    contractVersion: 1,
    actor: {
      id: actor.id,
      email: actor.email,
      fullName: actor.fullName,
      mode: actor.isAdmin ? "publisher" : "employee_proposal",
      canCreateProposal: true,
      canPublish: actor.isAdmin,
      canManagePublishers: actor.isAdmin,
      activationFeatureAvailable,
      activationFamilyIds,
      canActivate: activationFamilyIds.length > 0,
    },
    defaults: {
      statusVisibility: "participants",
      notificationStrategy: "important_changes_only",
      notificationRecipients: "directly_involved",
      confirmationPolicy: "first_decision_wins",
      rejectionCreatesCorrectionLoop: true,
    },
    capabilities: templateAuthoringCapabilities,
  });
}
