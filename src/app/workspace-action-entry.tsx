"use client";

import {
  ApprovalWorkspaceCoreProvider,
  type ApprovalWorkspaceProps,
} from "@/app/approval-workspace-core";
import WorkspaceActionTab from "@/app/workspace-action-tab";

export default function WorkspaceActionEntry(props: ApprovalWorkspaceProps) {
  return (
    <ApprovalWorkspaceCoreProvider {...props}>
      <div data-workspace-view={props.initialTab}>
        <WorkspaceActionTab />
      </div>
    </ApprovalWorkspaceCoreProvider>
  );
}
