"use client";

import { useEffect } from "react";
import { UploadDraftsView } from "@/app/upload-drafts-view";
import { useApprovalWorkspaceCore } from "@/app/approval-workspace-core";
import { useWorkspaceUploadDrafts } from "@/app/use-workspace-upload-drafts";

export default function WorkspaceDraftsTab() {
  const core = useApprovalWorkspaceCore();
  const drafts = useWorkspaceUploadDrafts({
    activeUserEmail: core.activeUser.email,
    requestConfirmation: core.requestConfirmation,
    selectedTemplateId: core.workspace.selectedTemplateId,
    setSelectedTemplateId: core.workspace.setSelectedTemplateId,
    shouldStartNewUploadRequest: false,
    templates: core.workspace.templates,
  });
  const { setDraftItemCount } = core;

  useEffect(() => {
    setDraftItemCount(drafts.uploadDraftResumeItems.length);
  }, [drafts.uploadDraftResumeItems.length, setDraftItemCount]);

  return (
    <UploadDraftsView
      resumeItems={drafts.uploadDraftResumeItems}
      savedUploadDrafts={drafts.savedUploadDrafts}
      selectedUploadDraftId={drafts.selectedUploadDraftId}
      onResumeSavedDraft={drafts.resumeUploadRequestDraft}
      onClearCurrentDraft={() => {
        void drafts.confirmClearUploadRequestDraft();
      }}
      onDeleteRequestDraft={(draftId) => {
        void drafts.confirmDeleteUploadRequestDraft(draftId);
      }}
    />
  );
}
