"use client";

import dynamic from "next/dynamic";
import type { ApprovalWorkspaceProps } from "@/app/approval-workspace-core";

function WorkspaceLoading() {
  return (
    <main className="min-h-screen bg-[#f7f7f5] p-5 text-sm text-[#666162]">
      <div aria-busy="true" data-workspace-view-loading>
        Loading workspace...
      </div>
    </main>
  );
}

const WorkspaceActionEntry = dynamic(
  () => import("@/app/workspace-action-entry"),
  { ssr: false, loading: WorkspaceLoading },
);
const WorkspaceDraftsEntry = dynamic(
  () => import("@/app/workspace-drafts-entry"),
  { ssr: false, loading: WorkspaceLoading },
);
const WorkspaceUploadEntry = dynamic(
  () => import("@/app/workspace-upload-entry"),
  { ssr: false, loading: WorkspaceLoading },
);
const WorkspaceWorkflowEntry = dynamic(
  () => import("@/app/workspace-workflow-entry"),
  { ssr: false, loading: WorkspaceLoading },
);
const WorkspaceFormsEntry = dynamic(
  () => import("@/app/workspace-forms-entry"),
  { ssr: false, loading: WorkspaceLoading },
);
const WorkspaceAdminEntry = dynamic(
  () => import("@/app/workspace-admin-entry"),
  { ssr: false, loading: WorkspaceLoading },
);

export default function ApprovalWorkspaceLoader(props: ApprovalWorkspaceProps) {
  if (props.initialTab === "queue" || props.initialTab === "tracking") {
    return <WorkspaceActionEntry {...props} />;
  }
  if (props.initialTab === "drafts") {
    return <WorkspaceDraftsEntry {...props} />;
  }
  if (props.initialTab === "upload") {
    return <WorkspaceUploadEntry {...props} />;
  }
  if (props.initialTab === "workflow") {
    return <WorkspaceWorkflowEntry {...props} />;
  }
  if (props.initialTab === "forms") {
    return <WorkspaceFormsEntry {...props} />;
  }
  return <WorkspaceAdminEntry {...props} />;
}
