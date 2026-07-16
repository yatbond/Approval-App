"use client";

import {
  ApprovalWorkspaceCoreProvider,
  type ApprovalWorkspaceProps,
} from "@/app/approval-workspace-core";
import WorkspaceUploadTab from "@/app/workspace-upload-tab";

export default function WorkspaceUploadEntry(props: ApprovalWorkspaceProps) {
  return (
    <ApprovalWorkspaceCoreProvider {...props}>
      <div data-workspace-view="upload">
        <WorkspaceUploadTab />
      </div>
    </ApprovalWorkspaceCoreProvider>
  );
}
