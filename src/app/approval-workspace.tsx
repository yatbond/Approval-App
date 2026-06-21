"use client";

import {
  ArrowRightLeft,
  Bell,
  ClipboardList,
  History,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  notifications,
} from "@/lib/mock-data";
import {
  applyTaskAction,
  isActionableBy,
  isVisibleToParticipant,
} from "@/lib/approval-state";
import {
  createWorkflowTemplateFromDraft,
} from "@/lib/template-builder";
import {
  createApprovalTaskFromTemplate,
  getMissingRequiredCurrentNodeDocuments,
  getMissingRequiredSubmissionDocuments,
} from "@/lib/request-builder";
import {
  addWorkflowBranch,
  addWorkflowConditionCase,
  addWorkflowDocumentToNode,
  addWorkflowNode,
  analyzeConditionCoverage,
  deleteWorkflowConditionCase,
  createWorkflowGraphFromTemplate,
  deleteWorkflowBranch,
  deleteWorkflowNode,
  simulateWorkflowTemplate,
  updateWorkflowConditionCase,
  updateWorkflowDocumentRequirement,
  updateWorkflowGraphEdge,
  updateWorkflowGraphNode,
} from "@/lib/workflow-graph";
import {
  shouldHandleCanvasDeleteKey,
  shouldHandleCanvasRedoKey,
  shouldHandleCanvasUndoKey,
} from "@/lib/workflow-keyboard";
import {
  createAttachmentRecord,
  documentFormatOptions,
  fieldSourceForDocumentFormat,
} from "@/lib/workflow-documents";
import {
  formatNodeKind,
  getConditionContext,
  workflowNodeOptions,
} from "@/lib/workflow-condition-context";
import {
  getWorkflowHistory,
  recordWorkflowHistoryEdit,
  redoWorkflowHistory,
  undoWorkflowHistory,
  type WorkflowHistoryById,
} from "@/lib/workflow-history";
import {
  buildTaskNotifications,
  publishWorkflowTemplateVersion,
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
import type {
  ApprovalAction,
  ApprovalAttachment,
  ApprovalTask,
  BusinessUnit,
  DocumentFormat,
  WorkflowBranchType,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
  WorkflowField,
  WorkflowRuleOperator,
  WorkflowTemplate,
  WorkflowDocumentRequirement,
  UserRoleAssignment,
} from "@/lib/types";

type Tab = "queue" | "tracking" | "upload" | "workflow" | "admin";
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

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "queue", label: "Queue", icon: ClipboardList },
  { id: "tracking", label: "Tracking", icon: History },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "workflow", label: "Workflow", icon: Settings },
  { id: "admin", label: "Admin", icon: ShieldCheck },
];

const workflowEditorTabs: { id: WorkflowEditorTab; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "builder", label: "Template Builder" },
  { id: "library", label: "Template Library" },
];

const branchTypeOptions: { value: WorkflowBranchType; label: string }[] = [
  { value: "main", label: "Main path" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "condition", label: "Condition" },
  { value: "for_information", label: "For information" },
];

const ruleOperatorOptions: { value: WorkflowRuleOperator; label: string }[] = [
  { value: ">", label: "is greater than" },
  { value: ">=", label: "is greater than or equal to" },
  { value: "=", label: "equals" },
  { value: "<", label: "is less than" },
  { value: "<=", label: "is less than or equal to" },
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
  const actionableTasks = useMemo(
    () => tasks.filter((task) => isActionableBy(task, activeUser.email)),
    [activeUser.email, tasks],
  );
  const trackingTasks = useMemo(
    () => tasks.filter((task) => isVisibleToParticipant(task, activeUser.email)),
    [activeUser.email, tasks],
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

  const selectedTask = useMemo(
    () =>
      actionableTasks.find((task) => task.id === selectedTaskId) ||
      actionableTasks[0] ||
      trackingTasks.find((task) => task.id === selectedTaskId) ||
      trackingTasks[0],
    [actionableTasks, selectedTaskId, trackingTasks],
  );
  const selectedTaskTemplate = useMemo(
    () => (selectedTask ? findTemplateForTask(selectedTask, templates) : undefined),
    [selectedTask, templates],
  );
  const selectedTaskMissingDocuments = useMemo(
    () =>
      selectedTask && selectedTaskTemplate
        ? getMissingRequiredCurrentNodeDocuments(selectedTask, selectedTaskTemplate)
        : [],
    [selectedTask, selectedTaskTemplate],
  );

  const taskNotifications = useMemo(() => buildTaskNotifications(tasks), [tasks]);
  const unreadCount =
    notifications.filter((item) => item.unread).length +
    taskNotifications.filter((item) => item.unread).length;

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

    if ((action === "reassign" || action === "delegate") && !targetEmail.trim()) {
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
    if (missingCurrentDocuments.length) {
      setActionError(
        `Upload required document(s) before approving: ${missingCurrentDocuments
          .map((document) => document.documentType)
          .join(", ")}.`,
      );
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
      const nextTasks = tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const template = findTemplateForTask(task, templates);
        if (!template) {
          return task;
        }

        const attachment = createAttachmentRecord({
          file,
          documentRequirement,
          template,
          uploadedBy: activeUser.email,
          storagePath: storage.storagePath,
          publicUrl: storage.publicUrl,
        });

        return {
          ...task,
          attachments: [...(task.attachments || []), attachment],
          participants: Array.from(new Set([...task.participants, activeUser.email])),
          lastAction: `Document uploaded by ${activeUser.name}`,
          auditTrail: [
            ...task.auditTrail,
            {
              id: `${task.id}-event-${task.auditTrail.length + 1}`,
              action: "amended" as const,
              actor: activeUser.name,
              actorEmail: activeUser.email,
              timestamp: new Date().toISOString(),
              detail: `Uploaded ${documentRequirement.documentType}: ${file.name}.`,
            },
          ],
        };
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
    const actorEmail =
      action === "amend_resubmit" || action === "cancel"
        ? task.requesterEmail
        : task.currentOwner || task.pendingOwners?.[0] || activeUser.email;
    const actor = {
      email: actorEmail,
      name: actorEmail === task.requesterEmail ? task.requester : actorEmail,
    };
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
    const nextTemplates = [template, ...templates];
    setTemplates(nextTemplates);
    setSelectedTemplateId(template.id);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextTemplates,
        selectedTemplateId: template.id,
      }),
    );
  }

  function updateTemplateRecord(template: WorkflowTemplate) {
    const nextTemplates = templates.map((item) =>
      item.id === template.id ? template : item,
    );
    setTemplates(nextTemplates);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ workflowTemplates: nextTemplates }),
    );
  }

  function deleteTemplateRecord(templateId: string) {
    const nextTemplates = templates.filter((template) => template.id !== templateId);
    const nextSelectedTemplateId =
      selectedTemplateId === templateId
        ? nextTemplates[0]?.id || ""
        : selectedTemplateId;
    setTemplates(nextTemplates);
    setSelectedTemplateId(nextSelectedTemplateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextTemplates,
        selectedTemplateId: nextSelectedTemplateId,
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
    <main className="min-h-screen bg-[#101214] text-neutral-100">
      <div
        className={`min-h-screen lg:grid ${
          sidebarCollapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[244px_1fr]"
        }`}
      >
        <aside className="border-b border-white/10 bg-[#171a1d] lg:border-b-0 lg:border-r">
          <div
            className={`flex min-h-16 items-center justify-center gap-2 border-b border-white/10 px-3 ${
              sidebarCollapsed ? "lg:justify-center" : "lg:justify-start lg:px-5"
            }`}
          >
            <div className="flex size-10 items-center justify-center rounded-md bg-emerald-500 text-[#101214]">
              <ShieldCheck size={22} />
            </div>
            <div className={`hidden lg:block ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <p className="text-sm font-semibold">Approval App</p>
              <p className="text-xs text-neutral-400">MVP workspace</p>
            </div>
            <button
              type="button"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarCollapsed((value) => !value)}
              className={`hidden size-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.07] lg:flex ${
                sidebarCollapsed ? "" : "ml-auto"
              }`}
            >
              <ArrowRightLeft size={15} />
            </button>
          </div>

          <nav className="flex gap-2 overflow-x-auto p-2 lg:block lg:space-y-1 lg:p-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={`/?tab=${tab.id}`}
                  title={tab.label}
                  className={`flex h-11 min-w-16 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm transition lg:w-full lg:flex-none ${
                    sidebarCollapsed ? "lg:justify-center lg:px-2" : "lg:justify-start"
                  } ${
                    active
                      ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-100"
                      : "border-transparent text-neutral-400 hover:border-white/10 hover:bg-white/5 hover:text-neutral-100"
                  }`}
                >
                  <Icon size={18} />
                  <span className={`hidden lg:inline ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-16 flex-col justify-center gap-3 border-b border-white/10 bg-[#15181b] px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h1 className="text-xl font-semibold tracking-normal md:text-2xl">
                General approval workflow
              </h1>
              <p className="text-sm text-neutral-400">
                Dynamic departments, AI/OCR parsing, approvals, delegation, deadlines, and escalation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm">
                <Bell size={16} className="text-amber-200" />
                <span>{unreadCount} unread</span>
              </div>
              <div className="hidden h-10 items-center rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-neutral-300 md:flex">
                {sessionUser}
              </div>
              <div className="hidden h-10 items-center rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-neutral-400 xl:flex">
                {workspaceSyncMode === "loading"
                  ? "Sync checking"
                  : workspaceSyncMode === "supabase"
                    ? "Saved to Supabase"
                    : "Saved locally"}
              </div>
              <Link
                href="/logout"
                title="Sign out"
                className="flex size-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                <LogOut size={16} />
              </Link>
              <Link
                href="/?tab=upload"
                className="flex h-10 items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={16} />
                New request
              </Link>
            </div>
          </header>

          <div className="p-4 md:p-6">
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
          </div>
        </section>
      </div>
    </main>
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
  const activeOutcomeTargetIds = useMemo(() => {
    if (!conditionOutcomeCaseId || !selectedNodeId) {
      return new Set<string>();
    }

    const selectedNode = workflowGraph.nodes.find((node) => node.id === selectedNodeId);
    const conditionCase = selectedNode?.conditionCases?.find(
      (item) => item.id === conditionOutcomeCaseId,
    );
    return new Set(conditionCase?.targetNodeIds || []);
  }, [conditionOutcomeCaseId, selectedNodeId, workflowGraph]);
  const [canvasViewResetNonce, setCanvasViewResetNonce] = useState(0);
  const canvasInstanceKey = useMemo(
    () =>
      `${workflow?.id || "empty"}:${JSON.stringify({
        reset: canvasViewResetNonce,
        nodes: workflowGraph.nodes.map((node) => ({
          id: node.id,
          kind: node.kind,
          label: node.label,
          assigneeEmail: node.assigneeEmail,
          documentIds: node.documentIds,
        })),
        edges: workflowGraph.edges.map((edge) => ({
          id: edge.id,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          label: edge.label,
          branchType: edge.branchType,
        })),
        runtime: {
          taskId: runtimeTask?.id,
          currentNodeId: runtimeTask?.currentNodeId,
          completedNodeIds: runtimeTask?.completedNodeIds,
          notifiedNodeIds: runtimeTask?.notifiedNodeIds,
        },
      })}`,
    [canvasViewResetNonce, runtimeTask, workflow?.id, workflowGraph],
  );
  const [workflowEditorTab, setWorkflowEditorTab] =
    useState<WorkflowEditorTab>("canvas");
  const [boxDocumentType, setBoxDocumentType] = useState("Supporting document");
  const [boxDocumentFormat, setBoxDocumentFormat] =
    useState<DocumentFormat>("pdf");
  const [boxDocumentRequired, setBoxDocumentRequired] = useState(true);
  const selectedGraphNode =
    workflowGraph.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedGraphEdge =
    workflowGraph.edges.find((edge) => edge.id === selectedEdgeId) || null;
  const connectFromNode =
    workflowGraph.nodes.find((node) => node.id === connectFromNodeId) || null;
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
    const cleanName = templateName.trim();
    const cleanDepartment = departmentName.trim();
    if (!cleanName || !selectedBusiness || !cleanDepartment) {
      return;
    }

    onCreateTemplate(
      createWorkflowTemplateFromDraft({
        name: cleanName,
        business: selectedBusiness.name,
        department: cleanDepartment,
        documents: [],
        steps: [],
      }),
    );
  }

  function publishSelectedTemplate() {
    if (!workflow) {
      return;
    }

    const publishedTemplate = publishWorkflowTemplateVersion(workflow);
    onCreateTemplate(publishedTemplate);
  }

  function loadTemplateIntoBuilder(template: WorkflowTemplate) {
    const nextBusiness = businessDirectory.find(
      (business) => business.name === template.business,
    );
    setTemplateName(template.name);
    if (nextBusiness) {
      setBusinessId(nextBusiness.id);
    }
    setDepartmentName(template.department);
  }

  function saveWorkflowTemplate(
    nextTemplate: WorkflowTemplate,
    label = "Updated workflow",
  ) {
    if (!workflow) {
      return;
    }

    if (JSON.stringify(workflow) === JSON.stringify(nextTemplate)) {
      return;
    }

    setWorkflowHistoryById((historyById) =>
      recordWorkflowHistoryEdit(historyById, activeWorkflowHistoryId, workflow, label),
    );
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
    const nextGraph = addWorkflowNode(workflowGraph, kind, {
      blocking: kind !== "for_information" && kind !== "end",
      assigneeName:
        kind === "approval" || kind === "review" || kind === "for_information"
          ? "New owner"
          : undefined,
      assigneeEmail:
        kind === "approval" || kind === "review" || kind === "for_information"
          ? "owner@example.com"
          : undefined,
    });
    const created = nextGraph.nodes.at(-1);
    saveWorkflowGraph(nextGraph, `Added ${formatNodeKind(kind)} box`);
    if (created) {
      setSelectedNodeId(created.id);
      setSelectedEdgeId(null);
    }
  }

  function connectWorkflowNodes(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }

    const nextGraph = addWorkflowBranch(workflowGraph, {
      sourceId,
      targetId,
      branchType: "main",
      label: "Next",
      blocking: true,
    });
    const createdEdge = nextGraph.edges.at(-1);

    saveWorkflowGraph(nextGraph, "Connected workflow boxes");
    setConnectFromNodeId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(createdEdge?.id || null);
  }

  function resetCanvasView() {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectFromNodeId(null);
    setConditionOutcomeCaseId(null);
    setCanvasViewResetNonce((nonce) => nonce + 1);
  }

  function undoWorkflowChange() {
    if (!workflow) {
      return;
    }

    const previousEntry = workflowUndoStack.at(-1);
    if (!previousEntry) {
      return;
    }

    const result = undoWorkflowHistory(
      workflowHistoryById,
      activeWorkflowHistoryId,
      workflow,
    );
    if (!result.template) {
      return;
    }

    setWorkflowHistoryById(result.historyById);
    onUpdateTemplate(result.template);
    resetCanvasView();
  }

  function redoWorkflowChange() {
    if (!workflow) {
      return;
    }

    const nextEntry = workflowRedoStack.at(-1);
    if (!nextEntry) {
      return;
    }

    const result = redoWorkflowHistory(
      workflowHistoryById,
      activeWorkflowHistoryId,
      workflow,
    );
    if (!result.template) {
      return;
    }

    setWorkflowHistoryById(result.historyById);
    onUpdateTemplate(result.template);
    resetCanvasView();
  }

  function addConditionCaseToSelectedBox() {
    if (!selectedGraphNode || selectedGraphNode.kind !== "condition") {
      return;
    }

    const context = workflow
      ? getConditionContext(workflowGraph, workflow, selectedGraphNode)
      : null;
    saveWorkflowGraph(
      addWorkflowConditionCase(
        workflowGraph,
        selectedGraphNode.id,
        context?.upstreamNodes.map((node) => node.id) || [],
      ),
      "Added condition",
    );
  }

  function addFallbackConditionCaseToSelectedBox() {
    if (!selectedGraphNode || selectedGraphNode.kind !== "condition") {
      return;
    }

    const existingCases = selectedGraphNode.conditionCases || [];
    if (existingCases.some((conditionCase) => conditionCase.isFallback)) {
      return;
    }

    saveWorkflowGraph(
      updateWorkflowGraphNode(workflowGraph, selectedGraphNode.id, {
        conditionCases: [
          ...existingCases,
          {
            id: `case-${Date.now()}-fallback`,
            name: "All other conditions",
            isFallback: true,
            join: "and",
            targetNodeIds: [],
          },
        ],
      }),
      "Added all other outcome",
    );
  }

  function moveWorkflowNode(nodeId: string, x: number, y: number) {
    saveWorkflowGraph(
      updateWorkflowGraphNode(workflowGraph, nodeId, {
        x,
        y,
      }),
      "Moved workflow box",
    );
  }

  function updateSelectedNode(patch: Partial<WorkflowGraphNode>) {
    if (!selectedGraphNode) {
      return;
    }

    saveWorkflowGraph(
      updateWorkflowGraphNode(workflowGraph, selectedGraphNode.id, patch),
      `Updated ${selectedGraphNode.label}`,
    );
  }

  function addDocumentToSelectedBox() {
    if (!workflow || !selectedGraphNode || !boxDocumentType.trim()) {
      return;
    }

    const updatedTemplate = addWorkflowDocumentToNode(workflow, selectedGraphNode.id, {
      documentType: boxDocumentType.trim(),
      format: boxDocumentFormat,
      required: boxDocumentRequired,
      fields: [
        {
          name: `${boxDocumentType.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}_field`,
          label: "New field",
          type: "text",
          required: false,
          source: fieldSourceForDocumentFormat(boxDocumentFormat),
          instructions: "Describe what should be extracted from this document.",
        },
      ],
    });
    saveWorkflowTemplate(updatedTemplate, `Added document to ${selectedGraphNode.label}`);
    setBoxDocumentType("Supporting document");
    setBoxDocumentFormat("pdf");
    setBoxDocumentRequired(true);
  }

  function updateTemplateDocuments(
    updater: (documents: WorkflowTemplate["documents"]) => WorkflowTemplate["documents"],
  ) {
    if (!workflow) {
      return;
    }

    const nextDocuments = updater(workflow.documents);
    saveWorkflowTemplate({
      ...workflow,
      documentTypes: nextDocuments.map((document) => document.documentType),
      documents: nextDocuments,
      fields: nextDocuments.flatMap((document) => document.fields),
    }, "Updated document requirements");
  }

  function updateBoxDocumentRequirement(
    documentId: string,
    patch: Parameters<typeof updateWorkflowDocumentRequirement>[2],
  ) {
    if (!workflow) {
      return;
    }

    saveWorkflowTemplate(
      updateWorkflowDocumentRequirement(workflow, documentId, patch),
      "Updated document requirement",
    );
  }

  function updateBoxDocumentField(
    documentId: string,
    fieldIndex: number,
    patch: Partial<Pick<WorkflowField, "label" | "instructions" | "required">>,
  ) {
    updateTemplateDocuments((documents) =>
      documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              fields: document.fields.map((field, index) =>
                index === fieldIndex ? { ...field, ...patch } : field,
              ),
            }
          : document,
      ),
    );
  }

  function addBoxDocumentField(documentId: string) {
    updateTemplateDocuments((documents) =>
      documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              fields: [
                ...document.fields,
                {
                  name: `${document.id}-field-${document.fields.length + 1}`,
                  label: "New field",
                  type: "text",
                  required: false,
                  source: fieldSourceForDocumentFormat(document.format),
                  instructions:
                    "Describe what should be extracted from this document.",
                  documentId: document.id,
                },
              ],
            }
          : document,
      ),
    );
  }

  function removeBoxDocumentField(documentId: string, fieldIndex: number) {
    updateTemplateDocuments((documents) =>
      documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              fields: document.fields.filter((_, index) => index !== fieldIndex),
            }
          : document,
      ),
    );
  }

  function deleteSelectedCanvasItem() {
    if (selectedGraphNode && selectedGraphNode.id !== "start") {
      saveWorkflowGraph(
        deleteWorkflowNode(workflowGraph, selectedGraphNode.id),
        `Deleted ${selectedGraphNode.label}`,
      );
      setSelectedNodeId(null);
      if (connectFromNodeId === selectedGraphNode.id) {
        setConnectFromNodeId(null);
      }
      return;
    }

    if (selectedGraphEdge) {
      saveWorkflowGraph(
        deleteWorkflowBranch(workflowGraph, selectedGraphEdge.id),
        `Deleted ${selectedGraphEdge.label} branch`,
      );
      setSelectedEdgeId(null);
    }
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
    if (!selectedGraphEdge) {
      return;
    }

    const nextPatch =
      patch.branchType === "for_information"
        ? { ...patch, blocking: false, label: patch.label || "For information" }
        : patch;
    saveWorkflowGraph(
      updateWorkflowGraphEdge(workflowGraph, selectedGraphEdge.id, nextPatch),
      `Updated ${selectedGraphEdge.label} branch`,
    );
  }

  function updateSelectedEdgeRule(
    key: "field" | "operator" | "value",
    value: string,
  ) {
    if (!selectedGraphEdge) {
      return;
    }

    updateSelectedEdge({
      rule: {
        field: selectedGraphEdge.rule?.field || workflow?.fields[0]?.name || "",
        operator: selectedGraphEdge.rule?.operator || "=",
        value: selectedGraphEdge.rule?.value || "",
        [key]: value,
      },
    });
  }

  function updateSelectedConditionCase(
    caseId: string,
    patch: Parameters<typeof updateWorkflowConditionCase>[3],
  ) {
    if (!selectedGraphNode || selectedGraphNode.kind !== "condition") {
      return;
    }

    saveWorkflowGraph(
      updateWorkflowConditionCase(
        workflowGraph,
        selectedGraphNode.id,
        caseId,
        patch,
      ),
      "Updated condition",
    );
  }

  function deleteSelectedConditionCase(caseId: string) {
    if (!selectedGraphNode || selectedGraphNode.kind !== "condition") {
      return;
    }

    saveWorkflowGraph(
      deleteWorkflowConditionCase(workflowGraph, selectedGraphNode.id, caseId),
      "Deleted condition",
    );
    if (conditionOutcomeCaseId === caseId) {
      setConditionOutcomeCaseId(null);
    }
  }

  function addClickedOutcomeToConditionCase(targetNodeId: string) {
    if (
      !selectedGraphNode ||
      selectedGraphNode.kind !== "condition" ||
      !conditionOutcomeCaseId ||
      targetNodeId === selectedGraphNode.id ||
      targetNodeId === "start"
    ) {
      return false;
    }

    const conditionCase = selectedGraphNode.conditionCases?.find(
      (item) => item.id === conditionOutcomeCaseId,
    );
    if (!conditionCase) {
      return false;
    }

    updateSelectedConditionCase(conditionOutcomeCaseId, {
      targetNodeIds: Array.from(
        new Set([...conditionCase.targetNodeIds, targetNodeId]),
      ),
    });
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
              <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-300">
                    Workflow canvas
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Add boxes, connect paths, and select any box or line to edit it.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workflowNodeOptions.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() => createCanvasNode(option.kind)}
                      className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-200 transition hover:border-emerald-400/50"
                    >
                      <Plus size={13} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {connectFromNode && (
                <div className="mb-3 flex flex-col gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-3 text-sm text-sky-100 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Connecting from <strong>{connectFromNode.label}</strong>. Click another
                    box to create the branch.
                  </span>
                  <button
                    type="button"
                    onClick={() => setConnectFromNodeId(null)}
                    className="self-start rounded-md border border-sky-300/40 px-3 py-1 text-xs transition hover:bg-sky-300/10 sm:self-auto"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {conditionOutcomeCaseId && selectedGraphNode?.kind === "condition" && (
                <div className="mb-3 flex flex-col gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-3 text-sm text-sky-100 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Assigning outcomes for <strong>{selectedGraphNode.label}</strong>. Click
                    downstream boxes to add them to the selected condition case.
                  </span>
                  <button
                    type="button"
                    onClick={() => setConditionOutcomeCaseId(null)}
                    className="self-start rounded-md border border-sky-300/40 px-3 py-1 text-xs transition hover:bg-sky-300/10 sm:self-auto"
                  >
                    Done
                  </button>
                </div>
              )}

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
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">
                      Branch type
                    </span>
                    <select
                      value={selectedGraphEdge.branchType}
                      onChange={(event) =>
                        updateSelectedEdge({
                          branchType: event.target.value as WorkflowBranchType,
                        })
                      }
                      className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                    >
                      {branchTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">
                      Branch label
                    </span>
                    <input
                      value={selectedGraphEdge.label}
                      onChange={(event) => updateSelectedEdge({ label: event.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </label>
                  {selectedGraphEdge.branchType === "condition" && (
                    <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3">
                      <p className="text-xs font-semibold text-amber-100">
                        Rule builder
                      </p>
                      <div className="mt-2 space-y-2">
                        <select
                          value={selectedGraphEdge.rule?.field || workflow.fields[0]?.name || ""}
                          onChange={(event) =>
                            updateSelectedEdgeRule("field", event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                        >
                          {workflow.fields.map((field) => (
                            <option key={field.name} value={field.name}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={selectedGraphEdge.rule?.operator || "="}
                          onChange={(event) =>
                            updateSelectedEdgeRule("operator", event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                        >
                          {ruleOperatorOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={selectedGraphEdge.rule?.value || ""}
                          onChange={(event) =>
                            updateSelectedEdgeRule("value", event.target.value)
                          }
                          placeholder="Value"
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                        />
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedGraphEdge.blocking)}
                      disabled={selectedGraphEdge.branchType === "for_information"}
                      onChange={(event) =>
                        updateSelectedEdge({ blocking: event.target.checked })
                      }
                    />
                    Blocks the main workflow
                  </label>
                  {selectedGraphEdge.branchType === "for_information" && (
                    <p className="rounded-md border border-sky-400/30 bg-sky-400/10 p-3 text-xs text-sky-100">
                      For-information branches send visibility only and do not block the
                      approval path.
                    </p>
                  )}
                </div>
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
