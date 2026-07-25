import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
} from "@/lib/approval-server";
import { templateAuthoringCapabilities } from "@/lib/template-authoring-capabilities";

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, cookieSource, correlationId } = resolved.context;

  return approvalJson(cookieSource, correlationId, {
    contractVersion: 1,
    actor: {
      id: actor.id,
      email: actor.email,
      fullName: actor.fullName,
      mode: actor.isAdmin ? "publisher" : "employee_proposal",
      canCreateProposal: true,
      canPublish: actor.isAdmin,
      canActivate: false,
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
