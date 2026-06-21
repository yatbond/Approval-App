"use client";

import {
  ArrowRightLeft,
  Plus,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  notifications,
} from "@/lib/mock-data";
import {
  applyTaskAction,
} from "@/lib/approval-state";
import {
  createApprovalTaskFromTemplate,
  getMissingRequiredCurrentNodeDocuments,
  getMissingRequiredSubmissionDocuments,
} from "@/lib/request-builder";
import {
  analyzeConditionCoverage,
  createWorkflowGraphFromTemplate,
  simulateWorkflowTemplate,
} from "@/lib/workflow-graph";
import {
  shouldHandleCanvasDeleteKey,
  shouldHandleCanvasRedoKey,
  shouldHandleCanvasUndoKey,
} from "@/lib/workflow-keyboard";
import {
  createAttachmentRecord,
  documentFormatOptions,
} from "@/lib/workflow-documents";
import {
  getConditionContext,
  workflowNodeOptions,
} from "@/lib/workflow-condition-context";
import {
  getWorkflowHistory,
  type WorkflowHistoryById,
} from "@/lib/workflow-history";
import {
  buildTaskNotifications,
} from "@/lib/workflow-system";
import {
  findTemplateForTask,
} from "@/lib/task-display";
import {
  type UserDirectoryEntry,
} from "@/lib/user-directory";
import { useApprovalWorkspaceState } from "@/app/use-approval-workspace-state";
import {
  QueueView,
  TrackingView,
  UserDirectoryDatalist,
} from "@/app/task-views";
import { UploadView } from "@/app/upload-view";
import { AdminView } from "@/app/admin-view";
import { ConditionBoxDetails } from "@/app/condition-box-details";
import { WorkflowTemplateLibrary } from "@/app/workflow-template-library";
import { WorkflowTemplateBuilder } from "@/app/workflow-template-builder";
import { getWorkflowTemplateBuilderBusinessState } from "@/lib/workflow-template-builder-state";
import { WorkflowRuntimePanel } from "@/app/workflow-runtime-panel";
import { getSelectedRuntimeTask } from "@/lib/workflow-runtime-panel-state";
import { WorkflowCanvasToolbar } from "@/app/workflow-canvas-toolbar";
import { WorkflowEdgeDetails } from "@/app/workflow-edge-details";
import {
  getWorkflowUpdateSelectedEdgeRuleState,
  getWorkflowUpdateSelectedEdgeState,
} from "@/lib/workflow-edge-update-state";
import {
  WorkspaceShell,
  type WorkspaceTab,
} from "@/app/workspace-shell";
import { getWorkspaceShellState } from "@/lib/workspace-shell-state";
import { getTaskActionPreflightState } from "@/lib/task-action-state";
import {
  getCreatedTemplateRecordState,
  getDeletedTemplateRecordState,
  getUpdatedTemplateRecordState,
} from "@/lib/workspace-template-record-state";
import { getWorkflowCanvasSelectionState } from "@/lib/workflow-canvas-selection-state";
import { getWorkflowCanvasInstanceKey } from "@/lib/workflow-canvas-instance-state";
import { getWorkflowCanvasDeleteState } from "@/lib/workflow-canvas-delete-state";
import { getWorkflowCanvasResetState } from "@/lib/workflow-canvas-reset-state";
import { getApprovalWorkspaceTaskState } from "@/lib/approval-workspace-task-state";
import { attachDocumentToTaskState } from "@/lib/task-document-attachment-state";
import { getWorkflowRunnerActionActor } from "@/lib/workflow-runner-action-state";
import {
  addWorkflowDocumentField,
  removeWorkflowDocumentField,
  updateWorkflowDocumentField,
} from "@/lib/workflow-document-field-state";
import {
  getWorkflowAddOutcomeTargetState,
  getWorkflowAddConditionCaseState,
  getWorkflowAddFallbackConditionCaseState,
  getWorkflowDeleteConditionCaseState,
  getWorkflowUpdateConditionCaseState,
} from "@/lib/workflow-condition-case-state";
import {
  getWorkflowConnectNodesState,
  getWorkflowCreateNodeState,
} from "@/lib/workflow-canvas-edit-state";
import { getWorkflowAddBoxDocumentState } from "@/lib/workflow-box-document-state";
import {
  getWorkflowTemplateDocumentState,
  getWorkflowUpdateDocumentRequirementState,
} from "@/lib/workflow-template-document-state";
import { getWorkflowTemplateLoadState } from "@/lib/workflow-template-load-state";
import { getWorkflowTemplateSaveState } from "@/lib/workflow-template-save-state";
import {
  getWorkflowCreateTemplateActionState,
  getWorkflowPublishTemplateActionState,
} from "@/lib/workflow-template-action-state";
import {
  getWorkflowRedoActionState,
  getWorkflowUndoActionState,
} from "@/lib/workflow-history-action-state";
import {
  getWorkflowMoveNodeState,
  getWorkflowUpdateSelectedNodeState,
} from "@/lib/workflow-node-patch-state";
import type {
  ApprovalAction,
  ApprovalAttachment,
  ApprovalTask,
  BusinessUnit,
  DocumentFormat,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
  WorkflowField,
  WorkflowTemplate,
  WorkflowDocumentRequirement,
  UserRoleAssignment,
} from "@/lib/types";

type Tab = WorkspaceTab;
type WorkflowEditorTab = "canvas" | "builder" | "library";

const WorkflowCanvas = dynamic(() => import("@/app/workflow-canvas"), {
  loading: () => (
    <div className="grid h-[68vh] min-h-[420px] place-items-center rounded-md border border-white/10 bg-[#0d1013] text-sm text-neutral-500 lg:h-[calc(100vh-250px)] lg:min-h-[640px]">
      Loading workflow canvas...
    </div>
  ),
  ssr: false,
});

type ParseResult = {
  strategy: string;
  fields: Record<string, string>;
  confidence: Record<string, string>;
  notes: string[];
  tables?: { sheetName: string; rows: Record<string, unknown>[] }[];
};

const workflowEditorTabs: { id: WorkflowEditorTab; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "builder", label: "Template Builder" },
  { id: "library", label: "Template Library" },
];

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
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [actionError, setActionError] = useState("");
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

  async function uploadAttachmentFile(
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentId", documentRequirement?.id || "ad-hoc");
    formData.append("documentType", documentRequirement?.documentType || "Ad hoc document");

    const response = await fetch("/api/attachments/upload", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as {
      storagePath?: string;
      publicUrl?: string;
      error?: string;
    };
    if (!response.ok || !payload.storagePath) {
      throw new Error(payload.error || "Unable to store document in Supabase.");
    }
    return payload;
  }

  function recordAction(action: ApprovalAction) {
    if (!selectedTask) {
      return;
    }

    const selectedTemplateForTask = findTemplateForTask(selectedTask, templates);
    const missingCurrentDocuments =
      selectedTemplateForTask &&
      (action === "approve" || action === "approve_with_comment")
        ? getMissingRequiredCurrentNodeDocuments(
            selectedTask,
            selectedTemplateForTask,
          )
        : [];
    const preflight = getTaskActionPreflightState({
      action,
      targetEmail,
      missingCurrentDocuments,
    });
    if (!preflight.canProceed) {
      if (preflight.errorMessage) {
        setActionError(preflight.errorMessage);
      }
      return;
    }

    const nextTask = applyTaskAction(selectedTask, {
      action,
      actor: activeUser,
      comment,
      targetEmail,
      template: selectedTemplateForTask,
    });

    const nextTasks = tasks.map((task) =>
      task.id === selectedTask.id ? nextTask : task,
    );
    setTasks(nextTasks);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
    );
    setComment("");
    setTargetEmail("");
    setActionError("");
  }

  async function attachTaskDocument(
    taskId: string,
    file: File,
    documentRequirement: WorkflowDocumentRequirement,
  ) {
    try {
      const storage = await uploadAttachmentFile(file, documentRequirement);
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
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    const template = findTemplateForTask(task, templates);
    const actor = getWorkflowRunnerActionActor({
      task,
      action,
      fallbackEmail: activeUser.email,
    });
    const nextTask = applyTaskAction(task, {
      action,
      actor,
      comment: "Workflow runner simulation",
      template,
    });

    const nextTasks = tasks.map((item) => (item.id === taskId ? nextTask : item));
    setTasks(nextTasks);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
    );
    setSelectedTaskId(taskId);
  }

  async function parseFile(
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
  ) {
    setFileName(file.name);
    setParseError("");
    setSubmissionMessage("");
    setIsParsing(true);
    setParseResult(null);
    setEditedFields({});
    let storage: Awaited<ReturnType<typeof uploadAttachmentFile>> | null = null;
    try {
      storage = await uploadAttachmentFile(file, documentRequirement);
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to store document.",
      );
      setIsParsing(false);
      return;
    }

    if (selectedTemplate) {
      setUploadedAttachments((items) => [
        ...items,
        createAttachmentRecord({
          file,
          documentRequirement,
          template: selectedTemplate,
          uploadedBy: activeUser.email,
          storagePath: storage?.storagePath,
          publicUrl: storage?.publicUrl,
        }),
      ]);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("languageHint", "mixed English, Traditional Chinese, Simplified Chinese");

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to parse file.");
      }

      setParseResult(payload);
      setEditedFields(payload.fields || {});
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unable to parse file.");
    } finally {
      setIsParsing(false);
    }
  }

  function submitParsedRequest() {
    if (!selectedTemplate || !parseResult) {
      return;
    }

    const missingRequiredDocuments = getMissingRequiredSubmissionDocuments(
      selectedTemplate,
      uploadedAttachments,
    );
    if (missingRequiredDocuments.length) {
      setSubmissionMessage(
        `Missing required upload(s): ${missingRequiredDocuments
          .map((document) => document.documentType)
          .join(", ")}.`,
      );
      return;
    }

    const task = createApprovalTaskFromTemplate({
      requester: activeUser,
      template: selectedTemplate,
      sourceFileName: fileName,
      extractedFields: editedFields,
      attachments: uploadedAttachments,
    });

    const nextTasks = [task, ...tasks];
    setTasks(nextTasks);
    setSelectedTaskId(task.id);
    setUploadedAttachments([]);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
    );
    setSubmissionMessage(
      `${task.id} submitted and routed to ${task.currentOwner}. It is now visible in Tracking.`,
    );
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

  function deleteTemplateRecord(templateId: string) {
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

  function updateRoleAssignmentRecords(
    updater: (items: UserRoleAssignment[]) => UserRoleAssignment[],
  ) {
    const nextAssignments = updater(effectiveRoleAssignments);
    setRoleAssignments(nextAssignments);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ userRoleAssignments: nextAssignments }),
    );
  }

  function updateBusinessDirectoryRecords(
    updater: (items: BusinessUnit[]) => BusinessUnit[],
  ) {
    const nextBusinessDirectory = updater(businessDirectory);
    setBusinessDirectory(nextBusinessDirectory);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ businessDirectory: nextBusinessDirectory }),
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
                onCreateTemplate={createTemplateRecord}
                onUpdateTemplate={updateTemplateRecord}
                userDirectory={userDirectory}
                onRunWorkflowAction={runWorkflowAction}
              />
            )}

            {activeTab === "admin" && (
              <AdminView
                businessDirectory={businessDirectory}
                setBusinessDirectory={updateBusinessDirectoryRecords}
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
function WorkflowView({
  businessDirectory,
  tasks,
  workflowTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  onDeleteTemplate,
  onCreateTemplate,
  onUpdateTemplate,
  userDirectory,
  onRunWorkflowAction,
}: {
  businessDirectory: BusinessUnit[];
  tasks: ApprovalTask[];
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onCreateTemplate: (template: WorkflowTemplate) => void;
  onUpdateTemplate: (template: WorkflowTemplate) => void;
  userDirectory: UserDirectoryEntry[];
  onRunWorkflowAction: (taskId: string, action: ApprovalAction) => void;
}) {
  const workflow =
    workflowTemplates.find((template) => template.id === selectedTemplateId) ||
    workflowTemplates[0];
  const persistedWorkflowGraph = useMemo(
    () => (workflow ? createWorkflowGraphFromTemplate(workflow) : { nodes: [], edges: [] }),
    [workflow],
  );
  const workflowGraph = persistedWorkflowGraph;
  const workflowTasks = useMemo(
    () =>
      workflow
        ? tasks.filter(
            (task) =>
              task.workflowTemplateId === workflow.id || task.workflow === workflow.name,
          )
        : [],
    [tasks, workflow],
  );
  const [selectedRuntimeTaskId, setSelectedRuntimeTaskId] = useState("");
  const runtimeTask = useMemo(
    () => getSelectedRuntimeTask(workflowTasks, selectedRuntimeTaskId),
    [selectedRuntimeTaskId, workflowTasks],
  );
  const workflowSimulation = useMemo(
    () => (workflow ? simulateWorkflowTemplate(workflow) : null),
    [workflow],
  );
  const runtimeMissingDocuments = useMemo(
    () =>
      runtimeTask && workflow
        ? getMissingRequiredCurrentNodeDocuments(runtimeTask, workflow)
        : [],
    [runtimeTask, workflow],
  );
  const activeWorkflowHistoryId = workflow?.id || "";
  const [workflowHistoryById, setWorkflowHistoryById] =
    useState<WorkflowHistoryById>({});
  const workflowHistory = getWorkflowHistory(
    workflowHistoryById,
    activeWorkflowHistoryId,
  );
  const workflowUndoStack = workflow ? workflowHistory.undoStack : [];
  const workflowRedoStack = workflow ? workflowHistory.redoStack : [];
  const lastWorkflowEdit = workflow ? workflowHistory.lastEdit : "";
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectFromNodeId, setConnectFromNodeId] = useState<string | null>(null);
  const [conditionOutcomeCaseId, setConditionOutcomeCaseId] = useState<string | null>(null);
  const {
    activeOutcomeTargetIds,
    connectFromNode,
    selectedGraphEdge,
    selectedGraphNode,
  } = useMemo(
    () =>
      getWorkflowCanvasSelectionState({
        graph: workflowGraph,
        selectedNodeId,
        selectedEdgeId,
        connectFromNodeId,
        conditionOutcomeCaseId,
      }),
    [
      conditionOutcomeCaseId,
      connectFromNodeId,
      selectedEdgeId,
      selectedNodeId,
      workflowGraph,
    ],
  );
  const [canvasViewResetNonce, setCanvasViewResetNonce] = useState(0);
  const canvasInstanceKey = useMemo(
    () =>
      getWorkflowCanvasInstanceKey({
        workflowId: workflow?.id || "",
        resetNonce: canvasViewResetNonce,
        graph: workflowGraph,
        runtimeTask,
      }),
    [canvasViewResetNonce, runtimeTask, workflow?.id, workflowGraph],
  );
  const [workflowEditorTab, setWorkflowEditorTab] =
    useState<WorkflowEditorTab>("canvas");
  const [boxDocumentType, setBoxDocumentType] = useState("Supporting document");
  const [boxDocumentFormat, setBoxDocumentFormat] =
    useState<DocumentFormat>("pdf");
  const [boxDocumentRequired, setBoxDocumentRequired] = useState(true);
  const firstBusiness = businessDirectory[0];
  const [templateName, setTemplateName] = useState("General document approval");
  const [businessId, setBusinessId] = useState(firstBusiness?.id || "");
  const { selectedBusiness } = getWorkflowTemplateBuilderBusinessState({
    businessDirectory,
    businessId,
  });
  const [departmentName, setDepartmentName] = useState(
    selectedBusiness?.departments[0] || "",
  );

  function createTemplate() {
    const nextState = getWorkflowCreateTemplateActionState({
      templateName,
      selectedBusinessName: selectedBusiness?.name || null,
      departmentName,
    });
    if (!nextState.didCreate || !nextState.template) {
      return;
    }

    onCreateTemplate(nextState.template);
  }

  function publishSelectedTemplate() {
    const nextState = getWorkflowPublishTemplateActionState({
      template: workflow,
    });
    if (!nextState.didCreate || !nextState.template) {
      return;
    }

    onCreateTemplate(nextState.template);
  }

  function loadTemplateIntoBuilder(template: WorkflowTemplate) {
    const nextState = getWorkflowTemplateLoadState({
      template,
      businessDirectory,
      currentBusinessId: businessId,
    });
    setTemplateName(nextState.templateName);
    if (nextState.shouldSetBusinessId) {
      setBusinessId(nextState.businessId);
    }
    setDepartmentName(nextState.departmentName);
  }

  function saveWorkflowTemplate(
    nextTemplate: WorkflowTemplate,
    label = "Updated workflow",
  ) {
    if (!workflow) {
      return;
    }

    const previewState = getWorkflowTemplateSaveState({
      currentTemplate: workflow,
      nextTemplate,
      label,
      historyById: workflowHistoryById,
      historyId: activeWorkflowHistoryId,
    });
    if (!previewState.didUpdate) {
      return;
    }

    setWorkflowHistoryById((historyById) => {
      const nextState = getWorkflowTemplateSaveState({
        currentTemplate: workflow,
        nextTemplate,
        label,
        historyById,
        historyId: activeWorkflowHistoryId,
      });
      return nextState.historyById;
    });
    onUpdateTemplate(nextTemplate);
  }

  function saveWorkflowGraph(nextGraph: WorkflowGraph, label = "Updated workflow") {
    if (!workflow) {
      return;
    }

    saveWorkflowTemplate({
      ...workflow,
      graph: nextGraph,
    }, label);
  }

  function createCanvasNode(kind: WorkflowNodeKind) {
    const nextState = getWorkflowCreateNodeState({
      graph: workflowGraph,
      kind,
    });
    saveWorkflowGraph(nextState.graph, nextState.label);
    setSelectedNodeId(nextState.selectedNodeId || null);
    setSelectedEdgeId(nextState.selectedEdgeId || null);
  }

  function connectWorkflowNodes(sourceId: string, targetId: string) {
    const nextState = getWorkflowConnectNodesState({
      graph: workflowGraph,
      sourceId,
      targetId,
    });
    if (!nextState.didUpdate) {
      return;
    }

    saveWorkflowGraph(nextState.graph, nextState.label);
    setConnectFromNodeId(nextState.connectFromNodeId || null);
    setSelectedNodeId(nextState.selectedNodeId || null);
    setSelectedEdgeId(nextState.selectedEdgeId || null);
  }

  function resetCanvasView() {
    const nextState = getWorkflowCanvasResetState({ canvasViewResetNonce });
    setSelectedNodeId(nextState.selectedNodeId);
    setSelectedEdgeId(nextState.selectedEdgeId);
    setConnectFromNodeId(nextState.connectFromNodeId);
    setConditionOutcomeCaseId(nextState.conditionOutcomeCaseId);
    setCanvasViewResetNonce(
      (nonce) =>
        getWorkflowCanvasResetState({ canvasViewResetNonce: nonce })
          .canvasViewResetNonce,
    );
  }

  function undoWorkflowChange() {
    const nextState = getWorkflowUndoActionState({
      workflow,
      historyById: workflowHistoryById,
      historyId: activeWorkflowHistoryId,
      undoStack: workflowUndoStack,
    });
    if (!nextState.didUpdate || !nextState.template) {
      return;
    }

    setWorkflowHistoryById(nextState.historyById);
    onUpdateTemplate(nextState.template);
    if (nextState.shouldResetCanvas) {
      resetCanvasView();
    }
  }

  function redoWorkflowChange() {
    const nextState = getWorkflowRedoActionState({
      workflow,
      historyById: workflowHistoryById,
      historyId: activeWorkflowHistoryId,
      redoStack: workflowRedoStack,
    });
    if (!nextState.didUpdate || !nextState.template) {
      return;
    }

    setWorkflowHistoryById(nextState.historyById);
    onUpdateTemplate(nextState.template);
    if (nextState.shouldResetCanvas) {
      resetCanvasView();
    }
  }

  function addConditionCaseToSelectedBox() {
    if (!selectedGraphNode) {
      return;
    }

    const context = workflow
      ? getConditionContext(workflowGraph, workflow, selectedGraphNode)
      : null;
    const nextState = getWorkflowAddConditionCaseState({
      graph: workflowGraph,
      selectedNodeId,
      upstreamNodeIds: context?.upstreamNodes.map((node) => node.id) || [],
    });
    if (nextState.didUpdate) {
      saveWorkflowGraph(nextState.graph, nextState.label);
    }
  }

  function addFallbackConditionCaseToSelectedBox() {
    const nextState = getWorkflowAddFallbackConditionCaseState({
      graph: workflowGraph,
      selectedNodeId,
      fallbackCaseId: `case-${Date.now()}-fallback`,
    });
    if (nextState.didUpdate) {
      saveWorkflowGraph(nextState.graph, nextState.label);
    }
  }

  function moveWorkflowNode(nodeId: string, x: number, y: number) {
    const nextState = getWorkflowMoveNodeState({
      graph: workflowGraph,
      nodeId,
      x,
      y,
    });
    saveWorkflowGraph(nextState.graph, nextState.label);
  }

  function updateSelectedNode(patch: Partial<WorkflowGraphNode>) {
    const nextState = getWorkflowUpdateSelectedNodeState({
      graph: workflowGraph,
      selectedNode: selectedGraphNode,
      patch,
    });
    if (!nextState.didUpdate) {
      return;
    }

    saveWorkflowGraph(nextState.graph, nextState.label);
  }

  function addDocumentToSelectedBox() {
    if (!workflow || !selectedGraphNode) {
      return;
    }

    const nextState = getWorkflowAddBoxDocumentState({
      template: workflow,
      selectedNodeId,
      selectedNodeLabel: selectedGraphNode.label,
      documentType: boxDocumentType,
      format: boxDocumentFormat,
      required: boxDocumentRequired,
    });
    if (!nextState.didUpdate || !nextState.resetForm) {
      return;
    }

    saveWorkflowTemplate(nextState.template, nextState.label);
    setBoxDocumentType(nextState.resetForm.documentType);
    setBoxDocumentFormat(nextState.resetForm.format);
    setBoxDocumentRequired(nextState.resetForm.required);
  }

  function updateTemplateDocuments(
    updater: (documents: WorkflowTemplate["documents"]) => WorkflowTemplate["documents"],
  ) {
    if (!workflow) {
      return;
    }

    const nextDocuments = updater(workflow.documents);
    const nextState = getWorkflowTemplateDocumentState({
      template: workflow,
      documents: nextDocuments,
    });
    saveWorkflowTemplate(nextState.template, nextState.label);
  }

  function updateBoxDocumentRequirement(
    documentId: string,
    patch: Parameters<typeof getWorkflowUpdateDocumentRequirementState>[0]["patch"],
  ) {
    if (!workflow) {
      return;
    }

    const nextState = getWorkflowUpdateDocumentRequirementState({
      template: workflow,
      documentId,
      patch,
    });
    saveWorkflowTemplate(nextState.template, nextState.label);
  }

  function updateBoxDocumentField(
    documentId: string,
    fieldIndex: number,
    patch: Partial<Pick<WorkflowField, "label" | "instructions" | "required">>,
  ) {
    updateTemplateDocuments((documents) =>
      updateWorkflowDocumentField(documents, documentId, fieldIndex, patch),
    );
  }

  function addBoxDocumentField(documentId: string) {
    updateTemplateDocuments((documents) =>
      addWorkflowDocumentField(documents, documentId),
    );
  }

  function removeBoxDocumentField(documentId: string, fieldIndex: number) {
    updateTemplateDocuments((documents) =>
      removeWorkflowDocumentField(documents, documentId, fieldIndex),
    );
  }

  function deleteSelectedCanvasItem() {
    const deleteState = getWorkflowCanvasDeleteState({
      graph: workflowGraph,
      selectedNodeId,
      selectedEdgeId,
      connectFromNodeId,
    });
    if (!deleteState.didDelete) {
      return;
    }

    saveWorkflowGraph(deleteState.graph, deleteState.label);
    setSelectedNodeId(deleteState.selectedNodeId);
    setSelectedEdgeId(deleteState.selectedEdgeId);
    setConnectFromNodeId(deleteState.connectFromNodeId);
  }

  useEffect(() => {
    function handleCanvasKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const targetElement = target instanceof Element ? target : null;
      const isContentEditable =
        target instanceof HTMLElement
          ? target.isContentEditable ||
            Boolean(target.closest("[contenteditable='true']"))
          : false;
      const shouldUndo = shouldHandleCanvasUndoKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        hasUndoHistory: workflowUndoStack.length > 0,
        targetTagName: targetElement?.tagName,
        isContentEditable,
      });

      if (shouldUndo) {
        event.preventDefault();
        undoWorkflowChange();
        return;
      }

      const shouldRedo = shouldHandleCanvasRedoKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        hasRedoHistory: workflowRedoStack.length > 0,
        targetTagName: targetElement?.tagName,
        isContentEditable,
      });

      if (shouldRedo) {
        event.preventDefault();
        redoWorkflowChange();
        return;
      }

      const shouldDelete = shouldHandleCanvasDeleteKey({
        key: event.key,
        hasSelection: Boolean(selectedGraphNode || selectedGraphEdge),
        targetTagName: targetElement?.tagName,
        isContentEditable,
      });

      if (!shouldDelete) {
        return;
      }

      event.preventDefault();
      deleteSelectedCanvasItem();
    }

    window.addEventListener("keydown", handleCanvasKeyDown);
    return () => window.removeEventListener("keydown", handleCanvasKeyDown);
  });

  function updateSelectedEdge(patch: Partial<WorkflowGraphEdge>) {
    const result = getWorkflowUpdateSelectedEdgeState({
      graph: workflowGraph,
      selectedEdge: selectedGraphEdge,
      patch,
    });
    if (!result.didUpdate) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
  }

  function updateSelectedEdgeRule(
    key: "field" | "operator" | "value",
    value: string,
  ) {
    const result = getWorkflowUpdateSelectedEdgeRuleState({
      graph: workflowGraph,
      selectedEdge: selectedGraphEdge,
      workflowFields: workflow?.fields || [],
      key,
      value,
    });
    if (!result.didUpdate) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
  }

  function updateSelectedConditionCase(
    caseId: string,
    patch: Parameters<typeof getWorkflowUpdateConditionCaseState>[0]["patch"],
  ) {
    const result = getWorkflowUpdateConditionCaseState({
      graph: workflowGraph,
      selectedNodeId: selectedGraphNode?.id || null,
      caseId,
      patch,
    });
    if (!result.didUpdate) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
  }

  function deleteSelectedConditionCase(caseId: string) {
    const result = getWorkflowDeleteConditionCaseState({
      graph: workflowGraph,
      selectedNodeId: selectedGraphNode?.id || null,
      caseId,
      activeOutcomeCaseId: conditionOutcomeCaseId,
    });
    if (!result.didUpdate) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
    setConditionOutcomeCaseId(result.activeOutcomeCaseId);
  }

  function addClickedOutcomeToConditionCase(targetNodeId: string) {
    const result = getWorkflowAddOutcomeTargetState({
      graph: workflowGraph,
      selectedNodeId: selectedGraphNode?.id || null,
      activeOutcomeCaseId: conditionOutcomeCaseId,
      targetNodeId,
    });
    if (!result.didUpdate) {
      return false;
    }

    saveWorkflowGraph(result.graph, result.label);
    return true;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">
            {workflow ? workflow.name : "No workflow templates yet"}
          </h2>
          <p className="text-sm text-neutral-400">
            {workflow
              ? `${workflow.business} - ${workflow.department} - ${workflow.documentTypes.join(", ")}`
              : "Create the first template from the builder."}
          </p>
          {workflow && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-neutral-300">
                Version {workflow.version || 1}
              </span>
              <span
                className={`rounded-md border px-2 py-1 ${
                  workflow.isDraft === false
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                }`}
              >
                {workflow.isDraft === false ? "Published" : "Draft"}
              </span>
              {workflow.publishedAt && (
                <span className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-neutral-400">
                  Published {new Date(workflow.publishedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {workflowEditorTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkflowEditorTab(tab.id)}
                className={`min-h-9 rounded-md border px-3 py-2 text-sm transition ${
                  workflowEditorTab === tab.id
                    ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-100"
                    : "border-white/10 bg-[#121518] text-neutral-300 hover:border-white/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {workflow && (
              <button
                type="button"
                onClick={publishSelectedTemplate}
                title="Create a published version from the current template."
                className="min-h-9 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
              >
                Publish version
              </button>
            )}
          </div>
        </div>
        {workflow && workflowEditorTab === "canvas" && (
          <div className="p-4">
            <div className="relative min-w-0">
              <WorkflowCanvasToolbar
                connectFromNode={connectFromNode}
                selectedNode={selectedGraphNode}
                conditionOutcomeCaseId={conditionOutcomeCaseId}
                onCreateNode={createCanvasNode}
                onCancelConnect={() => setConnectFromNodeId(null)}
                onDoneOutcomePick={() => setConditionOutcomeCaseId(null)}
              />

              <WorkflowRuntimePanel
                workflowTasks={workflowTasks}
                runtimeTask={runtimeTask}
                workflowSimulation={workflowSimulation}
                runtimeMissingDocuments={runtimeMissingDocuments}
                selectedRuntimeTaskId={selectedRuntimeTaskId}
                onSelectRuntimeTask={setSelectedRuntimeTaskId}
                workflowUndoStack={workflowUndoStack}
                workflowRedoStack={workflowRedoStack}
                lastWorkflowEdit={lastWorkflowEdit}
                onUndo={undoWorkflowChange}
                onRedo={redoWorkflowChange}
                onResetView={resetCanvasView}
                onRunWorkflowAction={onRunWorkflowAction}
              />
              <WorkflowCanvas
                graph={workflowGraph}
                runtimeTask={runtimeTask}
                highlightedNodeIds={Array.from(activeOutcomeTargetIds)}
                selectedEdgeId={selectedEdgeId}
                canvasInstanceKey={canvasInstanceKey}
                connectFromNodeId={connectFromNodeId}
                onConnect={connectWorkflowNodes}
                onMoveNode={moveWorkflowNode}
                onNodeSelect={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedEdgeId(null);
                }}
                onEdgeSelect={(edgeId) => {
                  setSelectedEdgeId(edgeId);
                  setSelectedNodeId(null);
                }}
                onClearSelection={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
                onOutcomeTargetClick={addClickedOutcomeToConditionCase}
              />

              {(selectedGraphNode || selectedGraphEdge) && (
                <aside className="fixed inset-x-3 bottom-3 top-24 z-40 overflow-y-auto rounded-md border border-white/10 bg-[#121518] p-4 shadow-2xl md:absolute md:inset-y-4 md:left-auto md:right-4 md:w-[380px]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-neutral-300">
                      {selectedGraphNode ? "Box details" : "Branch details"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={deleteSelectedCanvasItem}
                        disabled={selectedGraphNode?.id === "start"}
                        title={
                          selectedGraphNode?.id === "start"
                            ? "The start box cannot be deleted."
                            : "Delete the selected box or branch from the workflow canvas."
                        }
                        className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 text-xs text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <X size={13} />
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(null);
                          setSelectedEdgeId(null);
                        }}
                        title="Close the details panel."
                        className="flex size-8 items-center justify-center rounded-md border border-white/10 text-neutral-300 transition hover:bg-white/5"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>

                  {selectedGraphNode && (
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Box type</span>
                    <select
                      value={selectedGraphNode.kind}
                      title="Choose what this box does in the workflow: approval, review, FYI, condition, return/reject, or end."
                      onChange={(event) =>
                        updateSelectedNode({
                          kind: event.target.value as WorkflowNodeKind,
                          blocking: event.target.value !== "for_information",
                        })
                      }
                      className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                    >
                      <option value="start">Start</option>
                      {workflowNodeOptions.map((option) => (
                        <option key={option.kind} value={option.kind}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Box name</span>
                    <input
                      value={selectedGraphNode.label}
                      title="Display name shown inside this workflow box on the canvas."
                      onChange={(event) => updateSelectedNode({ label: event.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </label>
                  {["approval", "review", "for_information"].includes(
                    selectedGraphNode.kind,
                  ) && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">
                          Person name
                        </span>
                        <input
                          value={selectedGraphNode.assigneeName || ""}
                          title="Name of the person responsible for this approval, review, or information step."
                          onChange={(event) =>
                            updateSelectedNode({ assigneeName: event.target.value })
                          }
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">
                          Person email
                        </span>
                        <input
                          value={selectedGraphNode.assigneeEmail || ""}
                          title="Email address that this workflow step will route to."
                          onChange={(event) =>
                            updateSelectedNode({ assigneeEmail: event.target.value })
                          }
                          type="email"
                          list="workflow-user-directory"
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                        />
                      </label>
                    </>
                  )}
                  {selectedGraphNode.kind !== "for_information" &&
                    selectedGraphNode.kind !== "end" && (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-xs text-neutral-400">
                            Due hours
                          </span>
                          <input
                            value={selectedGraphNode.dueInHours || 24}
                            title="Number of hours before this step becomes due."
                            onChange={(event) =>
                              updateSelectedNode({
                                dueInHours:
                                  Number.parseInt(event.target.value, 10) || 0,
                              })
                            }
                            inputMode="numeric"
                            className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                          />
                        </label>
                        {["approval", "review"].includes(selectedGraphNode.kind) && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1 block text-xs text-neutral-400">
                                Escalation name
                              </span>
                              <input
                                value={selectedGraphNode.escalationName || ""}
                                title="Name of the person who receives the task if this step is overdue."
                                onChange={(event) =>
                                  updateSelectedNode({
                                    escalationName: event.target.value,
                                  })
                                }
                                className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-neutral-400">
                                Escalation email
                              </span>
                              <input
                                value={selectedGraphNode.escalationEmail || ""}
                                title="Email address that receives the task when escalation is triggered."
                                onChange={(event) =>
                                  updateSelectedNode({
                                    escalationEmail: event.target.value,
                                  })
                                }
                                type="email"
                                list="workflow-user-directory"
                                className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                              />
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  {selectedGraphNode.kind === "for_information" && (
                    <label className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedGraphNode.acknowledgementRequired)}
                        title="Require the FYI recipient to acknowledge that they have seen this item."
                        onChange={(event) =>
                          updateSelectedNode({
                            acknowledgementRequired: event.target.checked,
                          })
                        }
                      />
                      Acknowledgement required
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedGraphNode.blocking)}
                      disabled={selectedGraphNode.kind === "for_information"}
                      title="When enabled, the workflow waits here before continuing. FYI boxes are non-blocking."
                      onChange={(event) =>
                        updateSelectedNode({ blocking: event.target.checked })
                      }
                    />
                    Blocking step
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setConnectFromNodeId(selectedGraphNode.id);
                      setSelectedEdgeId(null);
                    }}
                    title="Start drawing a connection from this box to another box on the canvas."
                    className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                      connectFromNodeId === selectedGraphNode.id
                        ? "border-sky-400/50 bg-sky-400/15 text-sky-100"
                        : "border-sky-400/40 bg-sky-400/12 text-sky-100 hover:bg-sky-400/20"
                    }`}
                  >
                    <ArrowRightLeft size={15} />
                    {connectFromNodeId === selectedGraphNode.id
                      ? "Click target box"
                      : "Connect from this box"}
                  </button>
                  {selectedGraphNode.kind === "condition" && workflow && (
                    <ConditionBoxDetails
                      context={getConditionContext(
                        workflowGraph,
                        workflow,
                        selectedGraphNode,
                      )}
                      graph={workflowGraph}
                      conditionNode={selectedGraphNode}
                      coverage={analyzeConditionCoverage(
                        workflowGraph,
                        selectedGraphNode.id,
                      )}
                      activeOutcomeCaseId={conditionOutcomeCaseId}
                      onAddCase={addConditionCaseToSelectedBox}
                      onAddFallbackCase={addFallbackConditionCaseToSelectedBox}
                      onDeleteCase={deleteSelectedConditionCase}
                      onUpdateCase={updateSelectedConditionCase}
                      onStartOutcomePick={(caseId) =>
                        setConditionOutcomeCaseId((activeCaseId) =>
                          activeCaseId === caseId ? null : caseId,
                        )
                      }
                    />
                  )}
                  {["approval", "review"].includes(selectedGraphNode.kind) && (
                      <div className="rounded-md border border-white/10 bg-[#101214] p-3">
                        <p className="text-xs font-semibold text-neutral-400">
                          Document requirements for this box
                        </p>
                        <div className="mt-2 space-y-2">
                          {workflow.documents
                            .filter((document) =>
                              selectedGraphNode.documentIds?.includes(document.id),
                            )
                            .map((document) => (
                              <div
                                key={document.id}
                                className="rounded-md border border-white/10 bg-[#121518] p-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] text-neutral-500">
                                        Document type
                                      </span>
                                      <input
                                        value={document.documentType}
                                        title="Business meaning of this document, such as Invoice, Doctor slip, or Delivery note."
                                        onChange={(event) =>
                                          updateBoxDocumentRequirement(document.id, {
                                            documentType: event.target.value,
                                          })
                                        }
                                        className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-sm outline-none focus:border-emerald-400/60"
                                      />
                                    </label>
                                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                                      <label className="block">
                                        <span className="mb-1 block text-[11px] text-neutral-500">
                                          Document format
                                        </span>
                                        <select
                                          value={document.format}
                                          title="File format expected for this document upload."
                                          onChange={(event) =>
                                            updateBoxDocumentRequirement(document.id, {
                                              format: event.target.value as DocumentFormat,
                                            })
                                          }
                                          className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-sm outline-none focus:border-emerald-400/60"
                                        >
                                          {documentFormatOptions.map((option) => (
                                            <option
                                              key={option.value}
                                              value={option.value}
                                            >
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="flex h-9 items-center gap-2 text-xs text-neutral-300">
                                        <input
                                          type="checkbox"
                                          checked={document.required}
                                          title="Require this document before the workflow can proceed through this box."
                                          onChange={(event) =>
                                            updateBoxDocumentRequirement(document.id, {
                                              required: event.target.checked,
                                            })
                                          }
                                        />
                                        Required
                                      </label>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSelectedNode({
                                        documentIds: (
                                          selectedGraphNode.documentIds || []
                                        ).filter((id) => id !== document.id),
                                      })
                                    }
                                    title="Remove this document requirement from the selected box."
                                    className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition hover:border-rose-400/40 hover:text-rose-100"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-neutral-400">
                                      Fields to extract
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => addBoxDocumentField(document.id)}
                                      title="Add another field to extract from this document."
                                      className="flex min-h-7 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 transition hover:bg-sky-400/20"
                                    >
                                      <Plus size={12} />
                                      Add field
                                    </button>
                                  </div>
                                  {document.fields.map((field, fieldIndex) => (
                                    <div
                                      key={`${document.id}-${field.name}-${fieldIndex}`}
                                      className="space-y-2 rounded-md border border-white/10 bg-[#101214] p-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <input
                                          value={field.label}
                                          title="Field name shown to users, such as Amount, Invoice date, or Quantity."
                                          onChange={(event) =>
                                            updateBoxDocumentField(
                                              document.id,
                                              fieldIndex,
                                              { label: event.target.value },
                                            )
                                          }
                                          className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-[#121518] px-2 text-sm outline-none focus:border-emerald-400/60"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeBoxDocumentField(
                                              document.id,
                                              fieldIndex,
                                            )
                                          }
                                          title="Remove this extracted field from the document requirement."
                                          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                                        >
                                          <X size={13} />
                                        </button>
                                      </div>
                                      <input
                                        value={field.instructions}
                                        title="Instruction for the extractor, for example where to find the value or how to interpret it."
                                        onChange={(event) =>
                                          updateBoxDocumentField(
                                            document.id,
                                            fieldIndex,
                                            { instructions: event.target.value },
                                          )
                                        }
                                        placeholder="Extraction instruction"
                                        className="h-9 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                                      />
                                      <label className="flex items-center gap-2 text-xs text-neutral-400">
                                        <input
                                          type="checkbox"
                                          checked={field.required}
                                          title="Require this extracted field to be present before continuing."
                                          onChange={(event) =>
                                            updateBoxDocumentField(
                                              document.id,
                                              fieldIndex,
                                              { required: event.target.checked },
                                            )
                                          }
                                        />
                                        Required field
                                      </label>
                                    </div>
                                  ))}
                                  {!document.fields.length && (
                                    <p className="text-xs text-neutral-500">
                                      No extraction fields configured.
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          {!selectedGraphNode.documentIds?.length && (
                            <p className="text-xs text-neutral-500">
                              No documents are required at this box yet.
                            </p>
                          )}
                        </div>
                        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                          <input
                            value={boxDocumentType}
                            title="Name the new document requirement to add to this box."
                            onChange={(event) => setBoxDocumentType(event.target.value)}
                            placeholder="Document type, e.g. Doctor slip"
                            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                          />
                          <select
                            value={boxDocumentFormat}
                            title="Choose the file format expected for the new document requirement."
                            onChange={(event) =>
                              setBoxDocumentFormat(event.target.value as DocumentFormat)
                            }
                            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
                          >
                            {documentFormatOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-sm text-neutral-300">
                            <input
                              type="checkbox"
                              checked={boxDocumentRequired}
                              title="Mark the new document requirement as mandatory for this box."
                              onChange={(event) =>
                                setBoxDocumentRequired(event.target.checked)
                              }
                            />
                            Required upload
                          </label>
                          <button
                            type="button"
                            onClick={addDocumentToSelectedBox}
                            title="Add this document upload requirement to the selected workflow box."
                            className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
                          >
                            <Plus size={15} />
                            Add requirement
                          </button>
                        </div>
                      </div>
                  )}
                    </div>
                  )}

                  {selectedGraphEdge && (
                    <WorkflowEdgeDetails
                      edge={selectedGraphEdge}
                      workflowFields={workflow.fields}
                      onUpdateEdge={updateSelectedEdge}
                      onUpdateEdgeRule={updateSelectedEdgeRule}
                    />
                  )}
                </aside>
              )}
              <UserDirectoryDatalist
                id="workflow-user-directory"
                users={userDirectory}
              />
            </div>
          </div>
        )}

        {workflowEditorTab === "library" && (
          <WorkflowTemplateLibrary
            workflowTemplates={workflowTemplates}
            selectedTemplateId={workflow?.id || ""}
            onSelectTemplate={setSelectedTemplateId}
            onLoadTemplate={loadTemplateIntoBuilder}
            onDeleteTemplate={onDeleteTemplate}
          />
        )}
      </section>

      {workflowEditorTab === "builder" && (
        <WorkflowTemplateBuilder
          templateName={templateName}
          setTemplateName={setTemplateName}
          businessDirectory={businessDirectory}
          businessId={businessId}
          setBusinessId={setBusinessId}
          departmentName={departmentName}
          setDepartmentName={setDepartmentName}
          onCreateTemplate={createTemplate}
        />
      )}
    </div>
  );
}
