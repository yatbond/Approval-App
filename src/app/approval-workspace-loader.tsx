"use client";

import ApprovalWorkspace, {
  type ApprovalWorkspaceProps,
} from "@/app/approval-workspace";

export default function ApprovalWorkspaceLoader(props: ApprovalWorkspaceProps) {
  return <ApprovalWorkspace {...props} />;
}
