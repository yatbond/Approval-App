"use client";

import {
  ApprovalWorkspaceCoreProvider,
  type ApprovalWorkspaceProps,
} from "@/app/approval-workspace-core";
import WorkspaceDraftsTab from "@/app/workspace-drafts-tab";

export default function WorkspaceDraftsEntry(props: ApprovalWorkspaceProps) {
  return (
    <ApprovalWorkspaceCoreProvider {...props}>
      <div data-workspace-view="drafts">
        <WorkspaceDraftsTab />
      </div>
    </ApprovalWorkspaceCoreProvider>
  );
}
