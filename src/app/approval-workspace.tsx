"use client";

import { useMemo, useState } from "react";
import {
  notifications,
} from "@/lib/mock-data";
import {
  parseWorkspaceFile,
  type ParsedWorkspaceFilePayload,
  uploadWorkspaceAttachmentFile,
} from "@/lib/workspace-file-api";
import {
  getWorkspaceParseFileStartState,
  getWorkspaceParseFileStoredAttachmentState,
  getWorkspaceParseFileSuccessState,
} from "@/lib/workspace-parse-file-state";
import {
  buildTaskNotifications,
} from "@/lib/workflow-system";
import { useApprovalWorkspaceState } from "@/app/use-approval-workspace-state";
import {
  QueueView,
  TrackingView,
} from "@/app/task-views";
import { UploadView } from "@/app/upload-view";
import { AdminView } from "@/app/admin-view";
import { WorkflowView } from "@/app/workflow-view";
import {
  WorkspaceShell,
  type WorkspaceTab,
} from "@/app/workspace-shell";
import { getWorkspaceShellState } from "@/lib/workspace-shell-state";
import {
  getCreatedTemplateRecordState,
  getDeletedTemplateRecordState,
  getUpdatedTemplateRecordState,
} from "@/lib/workspace-template-record-state";
import {
  getAdminRecordDeleteFailureState,
  getAdminRecordDeleteSyncState,
  getUpdatedBusinessDirectoryRecordState,
  getUpdatedRoleAssignmentRecordState,
} from "@/lib/workspace-admin-record-state";
import { getWorkspaceRequestSubmissionState } from "@/lib/workspace-request-submission-state";
import { getApprovalWorkspaceTaskState } from "@/lib/approval-workspace-task-state";
import { attachDocumentToTaskState } from "@/lib/task-document-attachment-state";
import {
  getWorkspaceRecordTaskActionState,
  getWorkspaceRunnerTaskActionState,
} from "@/lib/workspace-task-action-state";
import { deactivateRemoteWorkspaceAdminRecord } from "@/lib/workspace-sync";
import type {
  ApprovalAction,
  ApprovalAttachment,
  BusinessUnit,
  WorkflowTemplate,
  WorkflowDocumentRequirement,
  UserRoleAssignment,
} from "@/lib/types";

type Tab = WorkspaceTab;

export type ApprovalWorkspaceProps = {
  initialTab: Tab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
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
}: {
  initialTab: Tab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
}) {
  const activeTab = initialTab;
  const activeUser = useMemo(
    () => ({
      name: sessionUser.includes("@") ? sessionUser.split("@")[0] : sessionUser,
      email: sessionUser.includes("@") ? sessionUser : "derrick@example.com",
      role: "superuser" as const,
    }),
    [sessionUser],
  );
  const {
    businessDirectory,
    buildWorkspaceSnapshot,
    effectiveRoleAssignments,
    persistWorkspaceSnapshot,
    selectedTaskId,
    selectedTemplateId,
    setBusinessDirectory,
    setRoleAssignments,
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
  const [comment, setComment] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<ParsedWorkspaceFilePayload | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [adminRecordError, setAdminRecordError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<ApprovalAttachment[]>([]);
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ||
      templates[0],
    [selectedTemplateId, templates],
  );

  const {
    actionableTasks,
    selectedTask,
    selectedTaskMissingDocuments,
    trackingTasks,
  } = taskState;

  const taskNotifications = useMemo(() => buildTaskNotifications(tasks), [tasks]);
  const shellState = useMemo(
    () =>
      getWorkspaceShellState({
        baseNotifications: notifications,
        taskNotifications,
        workspaceSyncMode,
      }),
    [taskNotifications, workspaceSyncMode],
  );

  function recordAction(action: ApprovalAction) {
    const nextState = getWorkspaceRecordTaskActionState({
      tasks,
      selectedTask,
      templates,
      activeUser,
      action,
      comment,
      targetEmail,
    });

    if (!nextState.didApply) {
      if (nextState.actionError) {
        setActionError(nextState.actionError);
      }
      return;
    }

    setTasks(nextState.tasks);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextState.tasks }),
    );
    if (nextState.shouldClearInputs) {
      setComment("");
      setTargetEmail("");
    }
    setActionError(nextState.actionError);
  }

  async function attachTaskDocument(
    taskId: string,
    file: File,
    documentRequirement: WorkflowDocumentRequirement,
  ) {
    try {
      const storage = await uploadWorkspaceAttachmentFile({
        file,
        documentRequirement,
      });
      const nextTasks = attachDocumentToTaskState({
        tasks,
        templates,
        taskId,
        file,
        documentRequirement,
        activeUser,
        storagePath: storage.storagePath,
        publicUrl: storage.publicUrl,
      });
      setTasks(nextTasks);
      void persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
      );
      setActionError("");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to upload document.",
      );
    }
  }

  function runWorkflowAction(taskId: string, action: ApprovalAction) {
    const nextState = getWorkspaceRunnerTaskActionState({
      tasks,
      templates,
      taskId,
      action,
      fallbackEmail: activeUser.email,
    });
    if (!nextState.didApply) {
      return;
    }

    setTasks(nextState.tasks);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextState.tasks }),
    );
    if (nextState.selectedTaskId) {
      setSelectedTaskId(nextState.selectedTaskId);
    }
  }

  async function parseFile(
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
  ) {
    const startState = getWorkspaceParseFileStartState(file);
    setFileName(startState.fileName);
    setParseError(startState.parseError);
    setSubmissionMessage(startState.submissionMessage);
    setIsParsing(startState.isParsing);
    setParseResult(startState.parseResult);
    setEditedFields(startState.editedFields);
    let storage: Awaited<ReturnType<typeof uploadWorkspaceAttachmentFile>> | null = null;
    try {
      storage = await uploadWorkspaceAttachmentFile({
        file,
        documentRequirement,
      });
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to store document.",
      );
      setIsParsing(false);
      return;
    }

    setUploadedAttachments((items) =>
      getWorkspaceParseFileStoredAttachmentState({
        uploadedAttachments: items,
        selectedTemplate,
        file,
        documentRequirement,
        activeUser,
        storagePath: storage?.storagePath,
        publicUrl: storage?.publicUrl,
      }).uploadedAttachments,
    );

    try {
      const payload = await parseWorkspaceFile({ file });
      const successState = getWorkspaceParseFileSuccessState(payload);
      setParseResult(successState.parseResult);
      setEditedFields(successState.editedFields);
      setIsParsing(successState.isParsing);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unable to parse file.");
    } finally {
      setIsParsing(false);
    }
  }

  function submitParsedRequest() {
    const nextState = getWorkspaceRequestSubmissionState({
      selectedTemplate,
      parseResult,
      activeUser,
      fileName,
      editedFields,
      uploadedAttachments,
      tasks,
    });
    if (!nextState.didSubmit) {
      if (nextState.submissionMessage) {
        setSubmissionMessage(nextState.submissionMessage);
      }
      return;
    }

    setTasks(nextState.tasks);
    setSelectedTaskId(nextState.selectedTaskId);
    if (nextState.shouldClearUploadedAttachments) {
      setUploadedAttachments([]);
    }
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextState.tasks }),
    );
    setSubmissionMessage(nextState.submissionMessage);
  }

  function createTemplateRecord(template: WorkflowTemplate) {
    const nextState = getCreatedTemplateRecordState({ templates, template });
    setTemplates(nextState.templates);
    setSelectedTemplateId(nextState.selectedTemplateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        selectedTemplateId: nextState.selectedTemplateId,
      }),
    );
  }

  function updateTemplateRecord(template: WorkflowTemplate) {
    const nextState = getUpdatedTemplateRecordState({ templates, template });
    setTemplates(nextState.templates);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ workflowTemplates: nextState.templates }),
    );
  }

  async function deleteTemplateRecord(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    const didDeactivate = template
      ? await deactivateAdminRecord({
          type: "template",
          templateKey: template.id,
          versionNumber: template.version || latestTaskVersionForTemplate(template.id),
        })
      : true;
    if (!didDeactivate) {
      return;
    }

    const nextState = getDeletedTemplateRecordState({
      templates,
      selectedTemplateId,
      templateId,
    });
    setTemplates(nextState.templates);
    setSelectedTemplateId(nextState.selectedTemplateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        selectedTemplateId: nextState.selectedTemplateId,
      }),
    );
  }

  async function deactivateAdminRecord(
    record: Parameters<typeof deactivateRemoteWorkspaceAdminRecord>[0],
  ) {
    const syncState = getAdminRecordDeleteSyncState({ workspaceSyncMode });
    if (!syncState.canContinue) {
      setAdminRecordError(syncState.error);
      return false;
    }

    if (!syncState.shouldDeactivateRemote) {
      setAdminRecordError("");
      return true;
    }

    const result = await deactivateRemoteWorkspaceAdminRecord(record);
    if (result.mode !== "supabase") {
      const failureState = getAdminRecordDeleteFailureState({
        record,
        reason: result.reason || "",
      });
      setAdminRecordError(failureState.error);
      return failureState.canContinue;
    }

    setAdminRecordError("");
    return true;
  }

  function latestTaskVersionForTemplate(templateId: string) {
    return tasks.reduce((version, task) => {
      if (task.workflowTemplateId !== templateId) {
        return version;
      }

      return Math.max(version, task.workflowTemplateVersion || 1);
    }, 1);
  }

  function updateRoleAssignmentRecords(
    updater: (items: UserRoleAssignment[]) => UserRoleAssignment[],
  ) {
    const nextState = getUpdatedRoleAssignmentRecordState({
      roleAssignments: effectiveRoleAssignments,
      updater,
    });
    setRoleAssignments(nextState.roleAssignments);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ userRoleAssignments: nextState.roleAssignments }),
    );
  }

  function updateBusinessDirectoryRecords(
    updater: (items: BusinessUnit[]) => BusinessUnit[],
  ) {
    const nextState = getUpdatedBusinessDirectoryRecordState({
      businessDirectory,
      updater,
    });
    setBusinessDirectory(nextState.businessDirectory);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ businessDirectory: nextState.businessDirectory }),
    );
  }

  function selectTemplateRecord(templateId: string) {
    setSelectedTemplateId(templateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ selectedTemplateId: templateId }),
    );
  }

  return (
    <WorkspaceShell
      activeTab={activeTab}
      sessionUser={sessionUser}
      sidebarCollapsed={sidebarCollapsed}
      syncLabel={shellState.syncLabel}
      unreadCount={shellState.unreadCount}
      onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
    >
            {activeTab === "queue" && (
              <QueueView
                selectedTask={selectedTask}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                tasks={actionableTasks}
                comment={comment}
                setComment={setComment}
                targetEmail={targetEmail}
                setTargetEmail={setTargetEmail}
                recordAction={recordAction}
                activeUserEmail={activeUser.email}
                userDirectory={userDirectory}
                actionError={actionError}
                missingCurrentDocuments={selectedTaskMissingDocuments}
                onAttachTaskDocument={(file, documentRequirement) =>
                  selectedTask &&
                  attachTaskDocument(selectedTask.id, file, documentRequirement)
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
              />
            )}

            {activeTab === "upload" && (
              <UploadView
                fileName={fileName}
                parseResult={parseResult}
                editedFields={editedFields}
                setEditedFields={setEditedFields}
                isParsing={isParsing}
                parseError={parseError}
                parseFile={parseFile}
                uploadedAttachments={uploadedAttachments}
                workflowTemplates={templates}
                selectedTemplateId={selectedTemplate?.id || ""}
                setSelectedTemplateId={selectTemplateRecord}
                submissionMessage={submissionMessage}
                onSubmitRequest={submitParsedRequest}
              />
            )}

            {activeTab === "workflow" && (
              <WorkflowView
                businessDirectory={businessDirectory}
                tasks={tasks}
                workflowTemplates={templates}
                selectedTemplateId={selectedTemplate?.id || ""}
                setSelectedTemplateId={selectTemplateRecord}
                onDeleteTemplate={deleteTemplateRecord}
                adminRecordError={adminRecordError}
                onCreateTemplate={createTemplateRecord}
                onUpdateTemplate={updateTemplateRecord}
                userDirectory={userDirectory}
                onRunWorkflowAction={runWorkflowAction}
              />
            )}

            {activeTab === "admin" && (
              <AdminView
                businessDirectory={businessDirectory}
                adminRecordError={adminRecordError}
                setBusinessDirectory={updateBusinessDirectoryRecords}
                onDeactivateBusinessRecord={(business) =>
                  deactivateAdminRecord({
                    type: "business",
                    businessId: business.id,
                  })
                }
                onDeactivateDepartmentRecord={(business, departmentName) =>
                  deactivateAdminRecord({
                    type: "department",
                    businessId: business.id,
                    departmentName,
                  })
                }
                legacyDepartments={departments}
                userDirectory={userDirectory}
                taskNotifications={taskNotifications}
                roleAssignments={effectiveRoleAssignments}
                setRoleAssignments={updateRoleAssignmentRecords}
              />
            )}
    </WorkspaceShell>
  );
}
