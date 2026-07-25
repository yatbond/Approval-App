"use client";

import { useEffect } from "react";
import { UploadView } from "@/app/upload-view";
import { useApprovalWorkspaceCore } from "@/app/approval-workspace-core";
import { useWorkspaceRequestPipeline } from "@/app/use-workspace-request-pipeline";
import { useWorkspaceUploadDrafts } from "@/app/use-workspace-upload-drafts";
import type { ApprovalAttachment } from "@/lib/types";

async function buildDocumentPreviewPages(file: File) {
  const {
    getPdfPreviewRenderOptions,
    isPdfFile,
    renderPdfFileToPageImages,
  } = await import("@/lib/pdf-page-images");
  const {
    buildPreviewPagesFromPdfImages,
    readImageFileAsPreviewPage,
  } = await import("@/lib/document-preview");

  if (isPdfFile(file)) {
    return buildPreviewPagesFromPdfImages(
      await renderPdfFileToPageImages(file, getPdfPreviewRenderOptions()),
    );
  }
  if (file.type.startsWith("image/")) {
    return [await readImageFileAsPreviewPage(file)];
  }
  return [];
}

export default function WorkspaceUploadTab() {
  const core = useApprovalWorkspaceCore();
  const drafts = useWorkspaceUploadDrafts({
    activeUserEmail: core.activeUser.email,
    requestConfirmation: core.requestConfirmation,
    selectedTemplateId: core.workspace.selectedTemplateId,
    setSelectedTemplateId: core.workspace.setSelectedTemplateId,
    shouldStartNewUploadRequest: core.shouldStartNewUploadRequest,
    templates: core.workspace.templates,
  });
  const pipeline = useWorkspaceRequestPipeline({
    activeUser: core.activeUser,
    buildWorkspaceSnapshot: core.workspace.buildWorkspaceSnapshot,
    deleteUploadRequestDraft: drafts.deleteUploadRequestDraft,
    editedFields: drafts.editedFields,
    fileName: drafts.fileName,
    parseResult: drafts.parseResult,
    parsedDocumentId: drafts.parsedDocumentId,
    persistWorkspaceSnapshot: core.workspace.persistWorkspaceSnapshot,
    requestParticipantEmails: drafts.requestParticipantEmails,
    resetUploadRequestDraftState: drafts.resetUploadRequestDraftState,
    selectedTemplate: drafts.selectedTemplate,
    selectedUploadDraftId: drafts.selectedUploadDraftId,
    selectedUploadRequestDraftRowId: drafts.selectedUploadRequestDraftRowId,
    setDocumentPreviewPages: drafts.setDocumentPreviewPages,
    setEditedFields: drafts.setEditedFields,
    setFileName: drafts.setFileName,
    setParsedDocumentId: drafts.setParsedDocumentId,
    setParseResult: drafts.setParseResult,
    setSelectedTaskId: core.workspace.setSelectedTaskId,
    setSelectedUploadRequestDraftRowId:
      drafts.setSelectedUploadRequestDraftRowId,
    setTasks: core.workspace.setTasks,
    setTemplates: core.workspace.setTemplates,
    setUploadedAttachments: drafts.setUploadedAttachments,
    setUploadRequestDraftRows: drafts.setUploadRequestDraftRows,
    tasks: core.workspace.tasks,
    templates: core.workspace.templates,
    uploadedAttachments: drafts.uploadedAttachments,
    uploadRequestDraftRows: drafts.uploadRequestDraftRows,
    uploadRequestDraftStorageKey: drafts.uploadRequestDraftStorageKey,
  });
  const { setDraftItemCount } = core;

  useEffect(() => {
    setDraftItemCount(drafts.uploadDraftResumeItems.length);
  }, [drafts.uploadDraftResumeItems.length, setDraftItemCount]);

  async function confirmClearUploadRequestDraftFromUi() {
    const cleared = await drafts.confirmClearUploadRequestDraft();
    if (!cleared) {
      return;
    }
    pipeline.setParseError("");
    pipeline.setSubmissionMessage("Draft cleared.");
  }

  function selectUploadRequestDraftRow(rowId: string) {
    if (!drafts.selectUploadRequestDraftRowState(rowId)) {
      return;
    }
    pipeline.setParseError("");
    pipeline.setSubmissionMessage("");
  }

  async function openUploadAttachmentForEditing(
    attachment: ApprovalAttachment,
  ) {
    const row = drafts.uploadRequestDraftRows.find((item) =>
      item.uploadedAttachments.some(
        (itemAttachment) => itemAttachment.id === attachment.id,
      ),
    );
    if (row?.documentPreviewPages.length) {
      selectUploadRequestDraftRow(row.id);
      return true;
    }
    if (!attachment.storagePath) {
      pipeline.setParseError(
        "This saved document has no stored file reference to reopen.",
      );
      return false;
    }

    pipeline.setIsParsing(true);
    pipeline.setParseError("");
    pipeline.setSubmissionMessage("");
    try {
      const { downloadWorkspaceAttachmentFile } = await import(
        "@/lib/workspace-file-api"
      );
      const storedFile = await downloadWorkspaceAttachmentFile({
        storagePath: attachment.storagePath,
        fileName: attachment.fileName,
      });
      const previewPages = await buildDocumentPreviewPages(storedFile);
      if (!previewPages.length) {
        throw new Error(
          "Extraction boxes are available for PDF and image documents.",
        );
      }

      if (row) {
        const nextRow = { ...row, documentPreviewPages: previewPages };
        drafts.setUploadRequestDraftRows((rows) =>
          rows.map((item) => (item.id === row.id ? nextRow : item)),
        );
        drafts.setSelectedUploadRequestDraftRowId(nextRow.id);
        drafts.setFileName(nextRow.fileName);
        drafts.setParseResult(nextRow.parseResult);
        drafts.setEditedFields(nextRow.editedFields);
        drafts.setUploadedAttachments(nextRow.uploadedAttachments);
        drafts.setParsedDocumentId(nextRow.parsedDocumentId);
      } else {
        drafts.setFileName(attachment.fileName);
      }
      drafts.setDocumentPreviewPages(previewPages);
      drafts.setUploadDraftMessage(
        `Opened "${attachment.fileName}" for extraction editing.`,
      );
      return true;
    } catch (error) {
      pipeline.setParseError(
        error instanceof Error
          ? error.message
          : "Unable to reopen the stored document.",
      );
      return false;
    } finally {
      pipeline.setIsParsing(false);
    }
  }

  function selectTemplateRecord(templateId: string) {
    core.workspace.setSelectedTemplateId(templateId);
    drafts.setRequestParticipantEmails({});
    void core.workspace.persistWorkspaceSnapshot(
      core.workspace.buildWorkspaceSnapshot({
        selectedTemplateId: templateId,
      }),
    );
  }

  return (
    <UploadView
      activeUserEmail={core.activeUser.email}
      fileName={drafts.fileName}
      parseResult={drafts.parseResult}
      editedFields={drafts.editedFields}
      setEditedFields={drafts.updateCurrentEditedFields}
      isParsing={pipeline.isParsing}
      parseError={pipeline.parseError}
      parseFile={pipeline.parseFile}
      documentPreviewPages={drafts.documentPreviewPages}
      onExtractHighlightedRegion={pipeline.extractHighlightedRegion}
      uploadedAttachments={drafts.uploadedAttachments}
      onEditAttachment={openUploadAttachmentForEditing}
      onRemoveAttachment={drafts.removeUploadAttachment}
      uploadDraftStatus={drafts.uploadDraftStatus}
      savedUploadDrafts={drafts.savedUploadDrafts}
      selectedUploadDraftId={drafts.selectedUploadDraftId}
      uploadDraftTitle={drafts.uploadDraftTitle}
      setUploadDraftTitle={drafts.setUploadDraftTitle}
      uploadDraftMessage={drafts.uploadDraftMessage}
      onSaveRequestDraft={drafts.saveCurrentUploadRequestDraft}
      onLoadRequestDraft={drafts.loadUploadRequestDraft}
      onDeleteRequestDraft={drafts.confirmDeleteUploadRequestDraft}
      uploadDraftRestoreToken={drafts.uploadDraftRestoreToken}
      uploadDraftResetToken={drafts.uploadDraftResetToken}
      restoredHighlightGroups={drafts.uploadHighlightGroups}
      restoredActiveHighlightGroupId={drafts.uploadActiveHighlightGroupId}
      restoredHighlightBoxCounter={drafts.uploadHighlightBoxCounter}
      onHighlightDraftChange={drafts.updateUploadHighlightDraft}
      onClearRequestDraft={confirmClearUploadRequestDraftFromUi}
      workflowTemplates={core.workspace.templates}
      selectedTemplateId={drafts.selectedTemplate?.id || ""}
      setSelectedTemplateId={selectTemplateRecord}
      participantEmails={drafts.requestParticipantEmails}
      setParticipantEmail={drafts.updateRequestParticipantEmail}
      submissionMessage={pipeline.submissionMessage}
      onSubmitRequest={pipeline.submitParsedRequest}
      requestDrafts={drafts.uploadRequestDraftRows}
      selectedRequestDraftId={drafts.selectedUploadRequestDraftRowId}
      onSelectRequestDraft={selectUploadRequestDraftRow}
      onSubmitAllRequests={pipeline.submitAllParsedRequests}
    />
  );
}
