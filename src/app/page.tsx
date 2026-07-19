import ApprovalWorkspaceLoader from "@/app/approval-workspace-loader";
import { getDepartments, getWorkflowTemplates } from "@/lib/supabase-data";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadApprovalRolloutDecisionForServer } from "@/lib/approval-rollout";
import {
  getInitialWorkspaceTab,
  isNewRequestStartRequested,
  type WorkspaceTab,
} from "@/lib/workspace-tabs-state";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; request?: string; new?: string }>;
}) {
  const params = await searchParams;
  const initialTab: WorkspaceTab = getInitialWorkspaceTab(params.tab);
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [departments, workflowTemplates, rollout] = await Promise.all([
    getDepartments(),
    getWorkflowTemplates(),
    loadApprovalRolloutDecisionForServer(user.id),
  ]);

  return (
    <ApprovalWorkspaceLoader
      initialTab={initialTab}
      sessionUser={user.email || "Signed in"}
      departments={departments}
      workflowTemplates={workflowTemplates}
      allowLegacyReadFallback={rollout.legacyReadFallbackAllowed}
      requestId={params.request || ""}
      startNewRequest={isNewRequestStartRequested(params.new)}
    />
  );
}
