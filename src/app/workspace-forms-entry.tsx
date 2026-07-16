"use client";

import {
  ApprovalWorkspaceCoreProvider,
  type ApprovalWorkspaceProps,
} from "@/app/approval-workspace-core";
import WorkspaceFormsTab from "@/app/workspace-forms-tab";

export default function WorkspaceFormsEntry(props: ApprovalWorkspaceProps) {
  return (
    <ApprovalWorkspaceCoreProvider {...props}>
      <div data-workspace-view="forms">
        <WorkspaceFormsTab />
      </div>
    </ApprovalWorkspaceCoreProvider>
  );
}
