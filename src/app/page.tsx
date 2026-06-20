import ApprovalWorkspaceLoader from "@/app/approval-workspace-loader";
import { getDepartments, getWorkflowTemplates } from "@/lib/supabase-data";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

const allowedTabs = ["queue", "tracking", "upload", "workflow", "admin"] as const;
type Tab = (typeof allowedTabs)[number];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; request?: string }>;
}) {
  const params = await searchParams;
  const requestedTab = params.tab;
  const initialTab: Tab = allowedTabs.includes(requestedTab as Tab)
    ? (requestedTab as Tab)
    : "queue";
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
    />
  );
}
