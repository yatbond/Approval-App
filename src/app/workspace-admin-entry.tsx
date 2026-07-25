"use client";

import {
  ApprovalWorkspaceCoreProvider,
  type ApprovalWorkspaceProps,
} from "@/app/approval-workspace-core";
import WorkspaceAdminTab from "@/app/workspace-admin-tab";

export default function WorkspaceAdminEntry(props: ApprovalWorkspaceProps) {
  return (
    <ApprovalWorkspaceCoreProvider {...props}>
      <div data-workspace-view="admin">
        <WorkspaceAdminTab />
      </div>
    </ApprovalWorkspaceCoreProvider>
  );
}
