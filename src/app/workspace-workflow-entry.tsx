"use client";

import {
  ApprovalWorkspaceCoreProvider,
  type ApprovalWorkspaceProps,
} from "@/app/approval-workspace-core";
import WorkspaceWorkflowTab from "@/app/workspace-workflow-tab";

export default function WorkspaceWorkflowEntry(props: ApprovalWorkspaceProps) {
  return (
    <ApprovalWorkspaceCoreProvider {...props}>
      <div data-workspace-view="workflow">
        <WorkspaceWorkflowTab />
      </div>
    </ApprovalWorkspaceCoreProvider>
  );
}
