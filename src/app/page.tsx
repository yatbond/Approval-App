import ApprovalWorkspace from "@/app/approval-workspace";
import { getSessionUser } from "@/lib/auth";
import { getDepartments, getWorkflowTemplates } from "@/lib/supabase-data";
import { redirect } from "next/navigation";

const allowedTabs = ["queue", "upload", "workflow", "admin"] as const;
type Tab = (typeof allowedTabs)[number];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const requestedTab = params.tab;
  const initialTab: Tab = allowedTabs.includes(requestedTab as Tab)
    ? (requestedTab as Tab)
    : "queue";
  const session = await getSessionUser();

  if (!session) {
    redirect("/login");
  }

  const [departments, workflowTemplates] = await Promise.all([
    getDepartments(),
    getWorkflowTemplates(),
  ]);

  return (
    <ApprovalWorkspace
      initialTab={initialTab}
      sessionUser={session.username}
      departments={departments}
      workflowTemplates={workflowTemplates}
    />
  );
}
