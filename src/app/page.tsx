import ApprovalWorkspaceLoader from "@/app/approval-workspace-loader";
import { getDepartments, getWorkflowTemplates } from "@/lib/supabase-data";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
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

  const [departments, workflowTemplates] = await Promise.all([
    getDepartments(),
    getWorkflowTemplates(),
  ]);

  return (
    <ApprovalWorkspaceLoader
      initialTab={initialTab}
      sessionUser={user.email || "Signed in"}
      departments={departments}
      workflowTemplates={workflowTemplates}
      requestId={params.request || ""}
      startNewRequest={isNewRequestStartRequested(params.new)}
    />
  );
}
