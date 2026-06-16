import ApprovalWorkspace from "@/app/approval-workspace";

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

  return <ApprovalWorkspace initialTab={initialTab} />;
}
