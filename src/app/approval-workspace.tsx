"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { downloadWorkspaceAttachmentFile } from "@/lib/workspace-file-api";
import {
  buildPreviewPagesFromPdfImages,
  readImageFileAsPreviewPage,
} from "@/lib/document-preview";
import {
  getPdfPreviewRenderOptions,
  isPdfFile,
  renderPdfFileToPageImages,
} from "@/lib/pdf-page-images";
import { buildTaskNotifications } from "@/lib/workflow-system";
import { useApprovalWorkspaceState } from "@/app/use-approval-workspace-state";
import { useWorkspaceAdminRecords } from "@/app/use-workspace-admin-records";
import { useWorkspaceEmailDelivery } from "@/app/use-workspace-email-delivery";
import { useWorkspaceRequestPipeline } from "@/app/use-workspace-request-pipeline";
import { useWorkspaceUploadDrafts } from "@/app/use-workspace-upload-drafts";
import { useWorkspaceTaskActions } from "@/app/use-workspace-task-actions";
import { QueueView, TrackingView } from "@/app/task-views";
import { UploadView } from "@/app/upload-view";
import { AdminView } from "@/app/admin-view";
import { WorkflowView } from "@/app/workflow-view";
import { WorkspaceShell } from "@/app/workspace-shell";
import { UploadDraftsView } from "@/app/upload-drafts-view";
import { ConfirmationModal } from "@/app/confirmation-modal";
import {
  getWorkspaceNavigationActiveTab,
  type WorkspaceTab,
} from "@/lib/workspace-tabs-state";
import {
  getUserWorkspaceNotifications,
  getWorkspaceShellState,
} from "@/lib/workspace-shell-state";
import {
  getSignOutConfirmation,
  type ConfirmationRequest,
} from "@/lib/confirmation-policy";
import { getApprovalWorkspaceTaskState } from "@/lib/approval-workspace-task-state";
import type {
  ApprovalAttachment,
  WorkflowTemplate,
} from "@/lib/types";

type Tab = WorkspaceTab;

async function buildDocumentPreviewPages(file: File) {
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

export type ApprovalWorkspaceProps = {
  initialTab: Tab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
  startNewRequest?: boolean;
};

export default function ApprovalWorkspace(props: ApprovalWorkspaceProps) {
  return <ApprovalWorkspaceBody {...props} />;
}
function ApprovalWorkspaceBody({
  initialTab,
  sessionUser,
  departments,
  workflowTemplates,
  requestId = "",
  startNewRequest = false,
}: {
  initialTab: Tab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
  startNewRequest?: boolean;
}) {
  const activeTab = initialTab;
  const shouldStartNewUploadRequest = activeTab === "upload" && startNewRequest;
  const navigationActiveTab = getWorkspaceNavigationActiveTab({
    activeTab,
    isNewRequest: shouldStartNewUploadRequest,
  });
  const activeUser = useMemo(
    () => ({
      name: sessionUser.includes("@") ? sessionUser.split("@")[0] : sessionUser,
      email: sessionUser.includes("@") ? sessionUser : "derrick@example.com",
      role: "superuser" as const,
    }),
    [sessionUser],
  );
  const {
    adminAuditEvents,
    businessDirectory,
    buildWorkspaceSnapshot,
    effectiveRoleAssignments,
    formLibrary,
    persistWorkspaceSnapshot,
    selectedTaskId,
    selectedTemplateId,
    setBusinessDirectory,
    setRoleAssignments,
    setAdminAuditEvents,
    setFormLibrary,
    setSelectedTaskId,
    setSelectedTemplateId,
    setTasks,
    setTemplates,
    tasks,
    templates,
    userDirectory,
    workspaceSyncMode,
  } = useApprovalWorkspaceState({
    activeUser,
    requestId,
    workflowTemplates,
  });
  const taskState = useMemo(
    () =>
      getApprovalWorkspaceTaskState({
        tasks,
        templates,
        selectedTaskId,
        activeUserEmail: activeUser.email,
      }),
    [activeUser.email, selectedTaskId, tasks, templates],
  );
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const requestConfirmation = useCallback((request: ConfirmationRequest) => {
    confirmationResolverRef.current?.(false);
    setConfirmationRequest(request);
    return new Promise<boolean>((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  }, []);

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    const resolver = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmationRequest(null);
    resolver?.(confirmed);
  }, []);
  const {
    emailDeliveryMessage,
    emailOutboxEntries,
    sendTestEmail,
    sendWorkflowEmailNotifications,
  } = useWorkspaceEmailDelivery({ requestConfirmation });
  const {
    activateTemplateVersionRecord,
    adminRecordError,
    archiveFormLibraryRecord,
    confirmDeactivateBusinessRecord,
    confirmDeactivateDepartmentRecord,
    confirmDeleteTemplateRecord,
    createTemplateRecord,
    saveFormLibraryRecord,
    updateBusinessDirectoryRecords,
    updateRoleAssignmentRecords,
    updateTemplateRecord,
    updateTemplateVersionCommentRecord,
  } = useWorkspaceAdminRecords({
    activeUser,
    adminAuditEvents,
    businessDirectory,
    buildWorkspaceSnapshot,
    effectiveRoleAssignments,
    formLibrary,
    persistWorkspaceSnapshot,
    requestConfirmation,
    selectedTemplateId,
    setAdminAuditEvents,
    setBusinessDirectory,
    setFormLibrary,
    setRoleAssignments,
    setSelectedTemplateId,
    setTemplates,
    tasks,
    templates,
    workspaceSyncMode,
  });
  const {
    confirmClearUploadRequestDraft,
    confirmDeleteUploadRequestDraft,
    deleteUploadRequestDraft,
    documentPreviewPages,
    editedFields,
    fileName,
    loadUploadRequestDraft,
    parseResult,
    parsedDocumentId,
    removeUploadAttachment,
    requestParticipantEmails,
    resetUploadRequestDraftState,
    resumeUploadRequestDraft,
    saveCurrentUploadRequestDraft,
    savedUploadDrafts,
    selectedTemplate,
    selectedUploadDraftId,
    selectedUploadRequestDraftRowId,
    selectUploadRequestDraftRowState,
    setDocumentPreviewPages,
    setEditedFields,
    setFileName,
    setParsedDocumentId,
    setParseResult,
    setRequestParticipantEmails,
    setSelectedUploadRequestDraftRowId,
    setUploadedAttachments,
    setUploadDraftMessage,
    setUploadDraftTitle,
    setUploadRequestDraftRows,
    updateCurrentEditedFields,
    updateRequestParticipantEmail,
    updateUploadHighlightDraft,
    uploadActiveHighlightGroupId,
    uploadDraftMessage,
    uploadDraftResetToken,
    uploadDraftRestoreToken,
    uploadDraftResumeItems,
    uploadDraftStatus,
    uploadDraftTitle,
    uploadHighlightBoxCounter,
    uploadHighlightGroups,
    uploadedAttachments,
    uploadRequestDraftRows,
    uploadRequestDraftStorageKey,
  } = useWorkspaceUploadDrafts({
    activeUserEmail: activeUser.email,
    requestConfirmation,
    selectedTemplateId,
    setSelectedTemplateId,
    shouldStartNewUploadRequest,
    templates,
  });

  const {
    actionableTasks,
    selectedActionableTask,
    selectedTask,
    selectedTaskMissingDocuments,
    trackingTasks,
  } = taskState;
  const {
    actionError,
    actionSubmissionTaskId,
    attachTaskDocument,
    comment,
    confirmRecordAction,
    contributorBlocksApproval,
    contributorDueAt,
    contributorEmail,
    contributorName,
    contributorRequestError,
    contributorRequestNote,
    createWorkflowTestRequest,
    decideSharedFulfillment,
    requestTaskContributor,
    runWorkflowAction,
    setComment,
    setContributorBlocksApproval,
    setContributorDueAt,
    setContributorEmail,
    setContributorName,
    setContributorRequestNote,
    setTargetEmail,
    submitContributorRequestUpload,
    submitCorrectionUpload,
    targetEmail,
  } = useWorkspaceTaskActions({
    activeUser,
    buildWorkspaceSnapshot,
    persistWorkspaceSnapshot,
    requestConfirmation,
    selectedTask,
    sendWorkflowEmailNotifications,
    setSelectedTaskId,
    setTasks,
    tasks,
    templates,
  });
  const {
    extractHighlightedRegion,
    isParsing,
    parseError,
    parseFile,
    setIsParsing,
    setParseError,
    setSubmissionMessage,
    submissionMessage,
    submitAllParsedRequests,
    submitParsedRequest,
  } = useWorkspaceRequestPipeline({
    activeUser,
    buildWorkspaceSnapshot,
    deleteUploadRequestDraft,
    editedFields,
    fileName,
    parseResult,
    parsedDocumentId,
    persistWorkspaceSnapshot,
    requestParticipantEmails,
    resetUploadRequestDraftState,
    selectedTemplate,
    selectedUploadDraftId,
    selectedUploadRequestDraftRowId,
    sendWorkflowEmailNotifications,
    setDocumentPreviewPages,
    setEditedFields,
    setFileName,
    setParsedDocumentId,
    setParseResult,
    setSelectedTaskId,
    setSelectedUploadRequestDraftRowId,
    setTasks,
    setTemplates,
    setUploadedAttachments,
    setUploadRequestDraftRows,
    tasks,
    templates,
    uploadedAttachments,
    uploadRequestDraftRows,
    uploadRequestDraftStorageKey,
  });

  const taskNotifications = useMemo(() => buildTaskNotifications(tasks), [tasks]);
  const userTaskNotifications = useMemo(
    () => getUserWorkspaceNotifications(taskNotifications, activeUser.email),
    [activeUser.email, taskNotifications],
  );
  const shellState = useMemo(
    () =>
      getWorkspaceShellState({
        baseNotifications: [],
        draftItemCount: uploadDraftResumeItems.length,
        taskNotifications: userTaskNotifications,
        workspaceSyncMode,
      }),
    [uploadDraftResumeItems.length, userTaskNotifications, workspaceSyncMode],
  );

  async function confirmClearUploadRequestDraftFromUi() {
    const cleared = await confirmClearUploadRequestDraft();
    if (!cleared) {
      return;
    }

    setParseError("");
    setSubmissionMessage("Draft cleared.");
  }
  function selectUploadRequestDraftRow(rowId: string) {
    if (!selectUploadRequestDraftRowState(rowId)) {
      return;
    }

    setParseError("");
    setSubmissionMessage("");
  }

  async function openUploadAttachmentForEditing(
    attachment: ApprovalAttachment,
  ) {
    const row = uploadRequestDraftRows.find((item) =>
      item.uploadedAttachments.some(
        (itemAttachment) => itemAttachment.id === attachment.id,
      ),
    );
    if (row?.documentPreviewPages.length) {
      selectUploadRequestDraftRow(row.id);
      return true;
    }
    if (!attachment.storagePath) {
      setParseError("This saved document has no stored file reference to reopen.");
      return false;
    }

    setIsParsing(true);
    setParseError("");
    setSubmissionMessage("");
    try {
      const storedFile = await downloadWorkspaceAttachmentFile({
        storagePath: attachment.storagePath,
        fileName: attachment.fileName,
      });
      const previewPages = await buildDocumentPreviewPages(storedFile);
      if (!previewPages.length) {
        throw new Error("Extraction boxes are available for PDF and image documents.");
      }

      if (row) {
        const nextRow = { ...row, documentPreviewPages: previewPages };
        setUploadRequestDraftRows((rows) =>
          rows.map((item) => (item.id === row.id ? nextRow : item)),
        );
        setSelectedUploadRequestDraftRowId(nextRow.id);
        setFileName(nextRow.fileName);
        setParseResult(nextRow.parseResult);
        setEditedFields(nextRow.editedFields);
        setUploadedAttachments(nextRow.uploadedAttachments);
        setParsedDocumentId(nextRow.parsedDocumentId);
      } else {
        setFileName(attachment.fileName);
      }
      setDocumentPreviewPages(previewPages);
      setUploadDraftMessage(
        `Opened "${attachment.fileName}" for extraction editing.`,
      );
      return true;
    } catch (error) {
      setParseError(
        error instanceof Error
          ? error.message
          : "Unable to reopen the stored document.",
      );
      return false;
    } finally {
      setIsParsing(false);
    }
  }

  async function confirmSignOut() {
    const confirmed = await requestConfirmation(getSignOutConfirmation());
    if (confirmed) {
      window.location.href = "/logout";
    }
  }

  function selectTemplateRecord(templateId: string) {
    setSelectedTemplateId(templateId);
    setRequestParticipantEmails({});
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ selectedTemplateId: templateId }),
    );
  }

  return (
    <>
    <WorkspaceShell
      activeTab={navigationActiveTab}
      sessionUser={sessionUser}
      sidebarCollapsed={sidebarCollapsed}
      syncLabel={shellState.syncLabel}
      draftItemCount={shellState.draftItemCount}
      notifications={userTaskNotifications}
      onRequestSignOut={() => void confirmSignOut()}
      onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
    >
            {activeTab === "queue" && (
              <QueueView
                selectedTask={selectedActionableTask}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                tasks={actionableTasks}
                comment={comment}
                setComment={setComment}
                targetEmail={targetEmail}
                setTargetEmail={setTargetEmail}
                contributorName={contributorName}
                setContributorName={setContributorName}
                contributorEmail={contributorEmail}
                setContributorEmail={setContributorEmail}
                contributorRequestNote={contributorRequestNote}
                setContributorRequestNote={setContributorRequestNote}
                contributorDueAt={contributorDueAt}
                setContributorDueAt={setContributorDueAt}
                contributorBlocksApproval={contributorBlocksApproval}
                setContributorBlocksApproval={setContributorBlocksApproval}
                contributorRequestError={contributorRequestError}
                onRequestContributor={requestTaskContributor}
                recordAction={confirmRecordAction}
                activeUserEmail={activeUser.email}
                userDirectory={userDirectory}
                workflowTemplates={templates}
                actionError={actionError}
                actionPending={
                  actionSubmissionTaskId === selectedActionableTask?.id
                }
                missingCurrentDocuments={selectedTaskMissingDocuments}
                onAttachTaskDocument={(file, documentRequirement) =>
                  selectedActionableTask &&
                  attachTaskDocument(
                    selectedActionableTask.id,
                    file,
                    documentRequirement,
                  )
                }
              />
            )}

            {activeTab === "tracking" && (
              <TrackingView
                tasks={trackingTasks}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                workflowTemplates={templates}
                activeUserEmail={activeUser.email}
                userDirectory={userDirectory}
                onSubmitContributorUpload={submitContributorRequestUpload}
                onDecideSharedFulfillment={decideSharedFulfillment}
                onSubmitCorrectionUpload={submitCorrectionUpload}
              />
            )}

            {activeTab === "upload" && (
              <UploadView
                activeUserEmail={activeUser.email}
                fileName={fileName}
                parseResult={parseResult}
                editedFields={editedFields}
                setEditedFields={updateCurrentEditedFields}
                isParsing={isParsing}
                parseError={parseError}
                parseFile={parseFile}
                documentPreviewPages={documentPreviewPages}
                onExtractHighlightedRegion={extractHighlightedRegion}
                uploadedAttachments={uploadedAttachments}
                onEditAttachment={openUploadAttachmentForEditing}
                onRemoveAttachment={removeUploadAttachment}
                uploadDraftStatus={uploadDraftStatus}
                savedUploadDrafts={savedUploadDrafts}
                selectedUploadDraftId={selectedUploadDraftId}
                uploadDraftTitle={uploadDraftTitle}
                setUploadDraftTitle={setUploadDraftTitle}
                uploadDraftMessage={uploadDraftMessage}
                onSaveRequestDraft={saveCurrentUploadRequestDraft}
                onLoadRequestDraft={loadUploadRequestDraft}
                onDeleteRequestDraft={confirmDeleteUploadRequestDraft}
                uploadDraftRestoreToken={uploadDraftRestoreToken}
                uploadDraftResetToken={uploadDraftResetToken}
                restoredHighlightGroups={uploadHighlightGroups}
                restoredActiveHighlightGroupId={uploadActiveHighlightGroupId}
                restoredHighlightBoxCounter={uploadHighlightBoxCounter}
                onHighlightDraftChange={updateUploadHighlightDraft}
                onClearRequestDraft={confirmClearUploadRequestDraftFromUi}
                workflowTemplates={templates}
                selectedTemplateId={selectedTemplate?.id || ""}
                setSelectedTemplateId={selectTemplateRecord}
                participantEmails={requestParticipantEmails}
                setParticipantEmail={updateRequestParticipantEmail}
                submissionMessage={submissionMessage}
                onSubmitRequest={submitParsedRequest}
                requestDrafts={uploadRequestDraftRows}
                selectedRequestDraftId={selectedUploadRequestDraftRowId}
                onSelectRequestDraft={selectUploadRequestDraftRow}
                onSubmitAllRequests={submitAllParsedRequests}
              />
            )}

            {activeTab === "drafts" && (
              <UploadDraftsView
                resumeItems={uploadDraftResumeItems}
                savedUploadDrafts={savedUploadDrafts}
                selectedUploadDraftId={selectedUploadDraftId}
                onResumeSavedDraft={resumeUploadRequestDraft}
                onClearCurrentDraft={confirmClearUploadRequestDraftFromUi}
                onDeleteRequestDraft={confirmDeleteUploadRequestDraft}
              />
            )}

            {activeTab === "workflow" && (
              <WorkflowView
                businessDirectory={businessDirectory}
                tasks={tasks}
                workflowTemplates={templates}
                formLibrary={formLibrary}
                selectedTemplateId={selectedTemplate?.id || ""}
                setSelectedTemplateId={selectTemplateRecord}
                onDeleteTemplate={confirmDeleteTemplateRecord}
                requestConfirmation={requestConfirmation}
                adminRecordError={adminRecordError}
                onCreateTemplate={createTemplateRecord}
                onUpdateTemplate={updateTemplateRecord}
                onActivateTemplateVersion={activateTemplateVersionRecord}
                onUpdateTemplateVersionComment={updateTemplateVersionCommentRecord}
                userDirectory={userDirectory}
                activeUser={activeUser}
                onRunWorkflowAction={runWorkflowAction}
                onCreateWorkflowTestRequest={createWorkflowTestRequest}
                onSaveFormLibrary={saveFormLibraryRecord}
                onArchiveFormLibrary={archiveFormLibraryRecord}
              />
            )}

            {activeTab === "admin" && (
              <AdminView
                businessDirectory={businessDirectory}
                adminRecordError={adminRecordError}
                setBusinessDirectory={updateBusinessDirectoryRecords}
                onDeactivateBusinessRecord={confirmDeactivateBusinessRecord}
                onDeactivateDepartmentRecord={confirmDeactivateDepartmentRecord}
                legacyDepartments={departments}
                userDirectory={userDirectory}
                taskNotifications={taskNotifications}
                roleAssignments={effectiveRoleAssignments}
                setRoleAssignments={updateRoleAssignmentRecords}
                adminAuditEvents={adminAuditEvents}
                activeUserEmail={activeUser.email}
                emailDeliveryMessage={emailDeliveryMessage}
                emailOutboxEntries={emailOutboxEntries}
                onSendTestEmail={sendTestEmail}
              />
            )}
    </WorkspaceShell>
    <ConfirmationModal
      request={confirmationRequest}
      onCancel={() => resolveConfirmation(false)}
      onConfirm={() => resolveConfirmation(true)}
    />
    </>
  );
}
