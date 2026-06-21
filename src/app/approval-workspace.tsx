"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  CalendarClock,
  Check,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  approvalTasks,
  notifications,
} from "@/lib/mock-data";
import {
  addBusiness,
  addDepartment,
  deleteBusiness,
  deleteDepartment,
  seededBusinessDirectory,
  updateBusiness,
  updateDepartment,
} from "@/lib/business-directory";
import {
  applyTaskAction,
  isActionableBy,
  isVisibleToParticipant,
} from "@/lib/approval-state";
import { applyEscalationChecks } from "@/lib/approval-escalation";
import {
  createWorkflowTemplateFromDraft,
} from "@/lib/template-builder";
import {
  createApprovalTaskFromTemplate,
  getMissingRequiredCurrentNodeDocuments,
  getMissingRequiredSubmissionDocuments,
  getSubmissionDocumentRequirements,
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
  acceptForDocumentFormat,
  createAttachmentRecord,
  documentFormatOptions,
  fieldSourceForDocumentFormat,
  formatDocumentFormat,
} from "@/lib/workflow-documents";
import {
  getWorkflowHistory,
  recordWorkflowHistoryEdit,
  redoWorkflowHistory,
  undoWorkflowHistory,
  type WorkflowHistoryById,
} from "@/lib/workflow-history";
import {
  parseWorkspaceState,
  serializeWorkspaceState,
} from "@/lib/workspace-persistence";
import {
  loadRemoteWorkspaceState,
  saveRemoteWorkspaceState,
} from "@/lib/workspace-sync";
import {
  buildTaskNotifications,
  publishWorkflowTemplateVersion,
  type TaskNotification,
} from "@/lib/workflow-system";
import {
  buildDefaultRoleAssignments,
  buildUserDirectory,
  type UserDirectoryEntry,
} from "@/lib/user-directory";
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

const userRoleOptions: UserDirectoryEntry["role"][] = [
  "superuser",
  "originator",
  "approver",
  "reviewer",
  "fyi",
  "current actor",
  "previous actor",
  "participant",
];

const workflowEditorTabs: { id: WorkflowEditorTab; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "builder", label: "Template Builder" },
  { id: "library", label: "Template Library" },
];

const workflowNodeOptions: { kind: WorkflowNodeKind; label: string }[] = [
  { kind: "approval", label: "Approval" },
  { kind: "review", label: "Review" },
  { kind: "for_information", label: "For Information" },
  { kind: "condition", label: "Condition" },
  { kind: "return_reject", label: "Return/Reject" },
  { kind: "end", label: "End" },
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

const workspaceStorageKey = "approval-workflow-workspace-v1";
const remoteAutosaveDelayMs = 30_000;

function readSavedWorkspaceState() {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(workspaceStorageKey);
  return saved ? parseWorkspaceState(saved) : null;
}

const actionConfig: Record<
  ApprovalAction,
  { label: string; icon: React.ElementType; tone: string }
> = {
  approve: {
    label: "Approve",
    icon: Check,
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
  },
  approve_with_comment: {
    label: "Approve with comment",
    icon: MessageSquare,
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20",
  },
  reject: {
    label: "Reject",
    icon: X,
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
  },
  reject_with_comment: {
    label: "Reject with comment",
    icon: X,
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
  },
  reassign: {
    label: "Reassign",
    icon: ArrowRightLeft,
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  },
  delegate: {
    label: "Delegate",
    icon: UserPlus,
    tone: "border-violet-500/40 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
  },
  amend_resubmit: {
    label: "Amend and resubmit",
    icon: Send,
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20",
  },
  cancel: {
    label: "Cancel request",
    icon: X,
    tone: "border-neutral-500/40 bg-neutral-500/10 text-neutral-100 hover:bg-neutral-500/20",
  },
};

function personalizeTask(task: ApprovalTask, activeUserEmail: string): ApprovalTask {
  const replaceSeedUser = (email: string) =>
    email === "derrick@example.com" ? activeUserEmail : email;

  return {
    ...task,
    currentOwner: replaceSeedUser(task.currentOwner),
    participants: task.participants.map(replaceSeedUser),
    auditTrail: task.auditTrail.map((event) => ({
      ...event,
      actorEmail: replaceSeedUser(event.actorEmail),
      targetEmail: event.targetEmail ? replaceSeedUser(event.targetEmail) : undefined,
    })),
  };
}

function findTemplateForTask(
  task: ApprovalTask,
  templates: WorkflowTemplate[],
) {
  if (task.workflowTemplateSnapshot) {
    return task.workflowTemplateSnapshot;
  }

  return templates.find(
    (template) =>
      template.id === task.workflowTemplateId || template.name === task.workflow,
  );
}

function getConditionContext(
  graph: WorkflowGraph,
  template: WorkflowTemplate,
  conditionNode: WorkflowGraphNode,
) {
  const incomingEdges = graph.edges.filter((edge) => edge.targetId === conditionNode.id);
  const outgoingEdges = graph.edges.filter((edge) => edge.sourceId === conditionNode.id);
  const upstreamNodes = incomingEdges
    .map((edge) => graph.nodes.find((node) => node.id === edge.sourceId))
    .filter((node): node is WorkflowGraphNode => Boolean(node))
    .filter((node) => node.kind === "approval" || node.kind === "review");
  const downstreamNodes = outgoingEdges
    .map((edge) => ({
      edge,
      node: graph.nodes.find((node) => node.id === edge.targetId),
    }))
    .filter(
      (item): item is { edge: WorkflowGraphEdge; node: WorkflowGraphNode } =>
        Boolean(item.node),
    );
  const upstreamDocumentIds = new Set<string>();
  upstreamNodes.forEach((node) =>
    (node.documentIds || []).forEach((documentId) => upstreamDocumentIds.add(documentId)),
  );
  const numericFields = template.documents
    .filter(
      (document) =>
        !upstreamDocumentIds.size || upstreamDocumentIds.has(document.id),
    )
    .flatMap((document) => document.fields)
    .concat(template.fields)
    .filter((field) => field.type === "number" || field.type === "currency")
    .filter(
      (field, index, fields) =>
        fields.findIndex((candidate) => candidate.name === field.name) === index,
    );

  return {
    incomingEdges,
    outgoingEdges,
    upstreamNodes,
    downstreamNodes,
    numericFields,
  };
}

function formatNodeKind(kind: WorkflowNodeKind) {
  return workflowNodeOptions.find((option) => option.kind === kind)?.label || "Start";
}

function subscribeToHydrationStore() {
  return () => {};
}

function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydrationStore,
    () => true,
    () => false,
  );
}

function WorkspaceHydrationShell({
  sessionUser,
}: {
  sessionUser: string;
}) {
  return (
    <div className="min-h-screen bg-[#0f1113] text-neutral-100">
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-md border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-semibold">Approval App</p>
          <p className="mt-2 text-sm text-neutral-400">
            Loading workspace for {sessionUser}
          </p>
        </div>
      </div>
    </div>
  );
}

export type ApprovalWorkspaceProps = {
  initialTab: Tab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
};

export default function ApprovalWorkspace(props: ApprovalWorkspaceProps) {
  const hasHydrated = useHasHydrated();

  if (!hasHydrated) {
    return <WorkspaceHydrationShell sessionUser={props.sessionUser} />;
  }

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
  const [savedWorkspaceState] = useState(() => readSavedWorkspaceState());
  const [tasks, setTasks] = useState<ApprovalTask[]>(() =>
    savedWorkspaceState?.approvalTasks.length
      ? savedWorkspaceState.approvalTasks
      : approvalTasks.map((task) => personalizeTask(task, activeUser.email)),
  );
  const [businessDirectory, setBusinessDirectory] = useState<BusinessUnit[]>(
    () => savedWorkspaceState?.businessDirectory || seededBusinessDirectory,
  );
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(
    () => savedWorkspaceState?.workflowTemplates || workflowTemplates,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    () =>
      savedWorkspaceState?.selectedTemplateId ||
      savedWorkspaceState?.workflowTemplates[0]?.id ||
      workflowTemplates[0]?.id ||
      "",
  );
  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>(
    () =>
      savedWorkspaceState?.userRoleAssignments.length
        ? savedWorkspaceState.userRoleAssignments
        : buildDefaultRoleAssignments(
            buildUserDirectory(tasks, templates, activeUser),
            businessDirectory,
          ),
  );
  const actionableTasks = useMemo(
    () => tasks.filter((task) => isActionableBy(task, activeUser.email)),
    [activeUser.email, tasks],
  );
  const trackingTasks = useMemo(
    () => tasks.filter((task) => isVisibleToParticipant(task, activeUser.email)),
    [activeUser.email, tasks],
  );
  const [selectedTaskId, setSelectedTaskId] = useState(
    () => requestId || savedWorkspaceState?.approvalTasks[0]?.id || approvalTasks[0]?.id,
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
  const [workspaceSyncMode, setWorkspaceSyncMode] = useState<"loading" | "supabase" | "local">(
    savedWorkspaceState ? "local" : "loading",
  );
  const [remoteWorkspaceReady, setRemoteWorkspaceReady] = useState(Boolean(savedWorkspaceState));
  const lastRemoteSnapshotRef = useRef<string | null>(
    savedWorkspaceState ? serializeWorkspaceState(savedWorkspaceState) : null,
  );
  const localWorkspaceDirtyRef = useRef(false);

  useEffect(() => {
    if (savedWorkspaceState) {
      return;
    }

    let cancelled = false;
    let loadTimerId: number | undefined;
    let idleCallbackId: number | undefined;
    const windowWithIdle = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    async function loadWorkspace() {
      const result = await loadRemoteWorkspaceState();
      if (cancelled) {
        return;
      }

      if (result.mode === "supabase" && result.snapshot) {
        const remoteSnapshot = serializeWorkspaceState(result.snapshot);
        if (!localWorkspaceDirtyRef.current) {
          lastRemoteSnapshotRef.current = remoteSnapshot;
          setTasks(result.snapshot.approvalTasks);
          setBusinessDirectory(result.snapshot.businessDirectory);
          setTemplates(result.snapshot.workflowTemplates);
          setRoleAssignments(result.snapshot.userRoleAssignments || []);
          setSelectedTemplateId(result.snapshot.selectedTemplateId);
        }
      }
      setWorkspaceSyncMode(result.mode);
      setRemoteWorkspaceReady(true);
    }

    const startLoad = () => {
      void loadWorkspace();
    };

    if (windowWithIdle.requestIdleCallback) {
      idleCallbackId = windowWithIdle.requestIdleCallback(startLoad, { timeout: 2500 });
    } else {
      loadTimerId = window.setTimeout(startLoad, 1200);
    }

    return () => {
      cancelled = true;
      if (idleCallbackId !== undefined) {
        windowWithIdle.cancelIdleCallback?.(idleCallbackId);
      }
      if (loadTimerId !== undefined) {
        window.clearTimeout(loadTimerId);
      }
    };
  }, [savedWorkspaceState]);

  useEffect(() => {
    const applyChecks = () => {
      setTasks((items) => applyEscalationChecks(items, templates));
    };
    applyChecks();
    const intervalId = window.setInterval(applyChecks, 60_000);
    return () => window.clearInterval(intervalId);
  }, [templates]);

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
  const userDirectory = useMemo(
    () => buildUserDirectory(tasks, templates, activeUser),
    [activeUser, tasks, templates],
  );
  const effectiveRoleAssignments = useMemo(() => {
    const knownEmails = new Set(roleAssignments.map((assignment) => assignment.email));
    const missingUsers = userDirectory.filter((user) => !knownEmails.has(user.email));
    return missingUsers.length
      ? [
          ...roleAssignments,
          ...buildDefaultRoleAssignments(missingUsers, businessDirectory),
        ]
      : roleAssignments;
  }, [businessDirectory, roleAssignments, userDirectory]);

  useEffect(() => {
    const snapshot = {
      approvalTasks: tasks,
      businessDirectory,
      workflowTemplates: templates,
      userRoleAssignments: effectiveRoleAssignments,
      selectedTemplateId,
    };
    const serializedSnapshot = serializeWorkspaceState(snapshot);
    window.localStorage.setItem(workspaceStorageKey, serializedSnapshot);

    if (!remoteWorkspaceReady) {
      return;
    }

    if (lastRemoteSnapshotRef.current === serializedSnapshot) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const result = await saveRemoteWorkspaceState(snapshot);
      setWorkspaceSyncMode(result.mode);
      if (result.mode === "supabase") {
        lastRemoteSnapshotRef.current = serializedSnapshot;
      }
    }, remoteAutosaveDelayMs);
    return () => window.clearTimeout(timeoutId);
  }, [businessDirectory, effectiveRoleAssignments, remoteWorkspaceReady, selectedTemplateId, tasks, templates]);
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

  function buildWorkspaceSnapshot(
    patch: Partial<{
      approvalTasks: ApprovalTask[];
      businessDirectory: BusinessUnit[];
      workflowTemplates: WorkflowTemplate[];
      userRoleAssignments: UserRoleAssignment[];
      selectedTemplateId: string;
    }> = {},
  ) {
    return {
      approvalTasks: patch.approvalTasks ?? tasks,
      businessDirectory: patch.businessDirectory ?? businessDirectory,
      workflowTemplates: patch.workflowTemplates ?? templates,
      userRoleAssignments: patch.userRoleAssignments ?? effectiveRoleAssignments,
      selectedTemplateId: patch.selectedTemplateId ?? selectedTemplateId,
    };
  }

  async function persistWorkspaceSnapshot(
    snapshot: ReturnType<typeof buildWorkspaceSnapshot>,
  ) {
    localWorkspaceDirtyRef.current = true;
    const serializedSnapshot = serializeWorkspaceState(snapshot);
    window.localStorage.setItem(workspaceStorageKey, serializedSnapshot);
    const result = await saveRemoteWorkspaceState(snapshot);
    setWorkspaceSyncMode(result.mode);
    if (result.mode === "supabase") {
      lastRemoteSnapshotRef.current = serializedSnapshot;
    }
  }

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

function QueueView({
  selectedTask,
  selectedTaskId,
  setSelectedTaskId,
  tasks,
  comment,
  setComment,
  targetEmail,
  setTargetEmail,
  recordAction,
  activeUserEmail,
  userDirectory,
  actionError,
  missingCurrentDocuments,
  onAttachTaskDocument,
}: {
  selectedTask?: ApprovalTask;
  selectedTaskId: string;
  setSelectedTaskId: (id: string) => void;
  tasks: ApprovalTask[];
  comment: string;
  setComment: (value: string) => void;
  targetEmail: string;
  setTargetEmail: (value: string) => void;
  recordAction: (action: ApprovalAction) => void;
  activeUserEmail: string;
  userDirectory: UserDirectoryEntry[];
  actionError: string;
  missingCurrentDocuments: WorkflowDocumentRequirement[];
  onAttachTaskDocument: (
    file: File,
    documentRequirement: WorkflowDocumentRequirement,
  ) => void;
}) {
  if (!selectedTask) {
    return (
      <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-semibold">No items need your action</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Use Tracking to follow requests you submitted, approved, reassigned, or delegated.
        </p>
      </section>
    );
  }

  const originatorAction = selectedTask.status === "returned" && selectedTask.currentOwner === activeUserEmail;
  const availableActions: ApprovalAction[] = originatorAction
    ? ["amend_resubmit", "cancel"]
    : ["approve", "approve_with_comment", "reject", "reject_with_comment", "reassign", "delegate"];

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr_320px]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Approval queue</h2>
          <p className="text-sm text-neutral-400">Pending, overdue, and escalated work.</p>
        </div>
        <div className="divide-y divide-white/10">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              className={`block w-full p-4 text-left transition ${
                selectedTaskId === task.id
                  ? "bg-emerald-400/10"
                  : "hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {task.id} - {task.department}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                <span>{task.currentStep}</span>
                <span>{task.due}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">{selectedTask.title}</h2>
              <p className="text-sm text-neutral-400">
                {selectedTask.workflow} - requested by {selectedTask.requester}
              </p>
            </div>
            <div className="rounded-md border border-white/10 px-3 py-2 text-sm">
              {selectedTask.value}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">Extracted draft</h3>
            <div className="space-y-2">
              {Object.entries(selectedTask.extractedFields).map(([label, value]) => (
                <div
                  key={label}
                  className="grid min-h-12 grid-cols-1 gap-1 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3"
                >
                  <span className="text-neutral-400">{label}</span>
                  <span className="min-w-0 break-words">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">Decision</h3>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Comment for approval, rejection, reassignment, or delegation"
              className="h-32 w-full resize-none rounded-md border border-white/10 bg-[#121518] p-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
            {missingCurrentDocuments.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                <p className="font-medium">Required before approval</p>
                <div className="mt-2 space-y-2">
                  {missingCurrentDocuments.map((document) => (
                    <label
                      key={document.id}
                      className="flex cursor-pointer flex-col gap-2 rounded-md border border-amber-300/20 bg-[#121518] p-2 transition hover:border-amber-300/50"
                    >
                      <span className="text-xs">
                        {document.documentType} - {formatDocumentFormat(document.format)}
                      </span>
                      <span className="text-[11px] text-amber-100/70">
                        Upload this document before approving the current box.
                      </span>
                      <input
                        type="file"
                        className="sr-only"
                        accept={acceptForDocumentFormat(document.format)}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            onAttachTaskDocument(file, document);
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {actionError && (
              <div className="mt-3 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
                {actionError}
              </div>
            )}
            {!originatorAction && (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs text-neutral-400">
                  Target email for reassign or delegate
                </span>
                <input
                  type="email"
                  list="queue-user-directory"
                  value={targetEmail}
                  onChange={(event) => setTargetEmail(event.target.value)}
                  placeholder="colleague@example.com"
                  className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                />
                <UserDirectoryDatalist id="queue-user-directory" users={userDirectory} />
              </label>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {availableActions.map((action) => {
                const Icon = actionConfig[action].icon;
                const needsTarget = action === "reassign" || action === "delegate";
                const needsCurrentDocuments =
                  (action === "approve" || action === "approve_with_comment") &&
                  missingCurrentDocuments.length > 0;
                const disabled = (needsTarget && !targetEmail.trim()) || needsCurrentDocuments;
                return (
                  <button
                    key={action}
                    type="button"
                    disabled={disabled}
                    onClick={() => recordAction(action)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-sm leading-tight transition disabled:cursor-not-allowed disabled:opacity-45 ${actionConfig[action].tone}`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="min-w-0 break-words">{actionConfig[action].label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Audit trail</h2>
          <p className="text-sm text-neutral-400">Everyone involved can track this item.</p>
        </div>
        <AuditTrail task={selectedTask} />
      </section>
    </div>
  );
}

function TrackingView({
  tasks,
  selectedTaskId,
  setSelectedTaskId,
  workflowTemplates,
  activeUserEmail,
  userDirectory,
}: {
  tasks: ApprovalTask[];
  selectedTaskId: string;
  setSelectedTaskId: (id: string) => void;
  workflowTemplates: WorkflowTemplate[];
  activeUserEmail: string;
  userDirectory: UserDirectoryEntry[];
}) {
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks[0];
  const selectedTemplate = selectedTask
    ? findTemplateForTask(selectedTask, workflowTemplates)
    : undefined;
  const userByEmail = new Map(userDirectory.map((user) => [user.email, user]));

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Tracked requests</h2>
          <p className="text-sm text-neutral-400">
            Requests you submitted, approved, reassigned, delegated, or received.
          </p>
        </div>
        <div className="divide-y divide-white/10">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              className={`block w-full p-4 text-left transition ${
                selectedTask?.id === task.id ? "bg-emerald-400/10" : "hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {task.id} - owner {task.currentOwner || "Closed"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Your role: {formatTaskAccessRole(task, activeUserEmail)}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </div>
              <p className="mt-3 break-words text-xs text-neutral-400">{task.lastAction}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        {selectedTask ? (
          <>
            <div className="border-b border-white/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-semibold">{selectedTask.title}</h2>
                  <p className="text-sm text-neutral-400">
                    {selectedTask.workflow} - requested by {selectedTask.requester}
                  </p>
                  <Link
                    href={`/?tab=tracking&request=${encodeURIComponent(selectedTask.id)}`}
                    className="mt-2 inline-flex min-h-8 items-center rounded-md border border-sky-400/40 bg-sky-400/12 px-2 py-1 text-xs text-sky-100 transition hover:bg-sky-400/20"
                  >
                    Open request detail page
                  </Link>
                </div>
                <StatusBadge status={selectedTask.status} />
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                  <p className="text-xs text-neutral-500">Current owner</p>
                  <p className="mt-1 break-words text-neutral-200">
                    {selectedTask.currentOwner || "Closed"}
                  </p>
                </div>
                <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                  <p className="text-xs text-neutral-500">Current step</p>
                  <p className="mt-1 break-words text-neutral-200">{selectedTask.currentStep}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                  <p className="text-xs text-neutral-500">Last action</p>
                  <p className="mt-1 break-words text-neutral-200">{selectedTask.lastAction}</p>
                </div>
              </div>
              {selectedTask.pendingOwners?.length ? (
                <div className="mt-3 rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
                  <p className="text-xs text-neutral-500">Pending actors</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedTask.pendingOwners.map((owner) => (
                      <span
                        key={owner}
                        className="rounded-md border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-xs text-yellow-100"
                      >
                        {owner}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
                  <p className="text-xs text-neutral-500">People who can track this</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedTask.participants.map((participant) => (
                      <span
                        key={participant}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          participant === activeUserEmail
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                            : "border-white/10 bg-[#101214] text-neutral-300"
                        }`}
                      >
                        {participant}
                        {userByEmail.get(participant)?.role
                          ? ` - ${userByEmail.get(participant)?.role}`
                          : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
                  <p className="text-xs text-neutral-500">Uploaded documents</p>
                  {selectedTask.attachments?.length ? (
                    <div className="mt-2 space-y-2">
                      {selectedTask.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs"
                        >
                          <p className="break-words text-neutral-200">
                            {attachment.fileName}
                          </p>
                          <p className="mt-1 break-words text-neutral-500">
                            {attachment.documentType}
                            {attachment.workflowNodeId
                              ? ` - used at ${attachment.workflowNodeId}`
                              : ""}
                          </p>
                          {attachment.storagePath && (
                            <p className="mt-1 break-words text-[11px] text-emerald-200">
                              Stored in Supabase: {attachment.storagePath}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-500">
                      No files have been attached to this request.
                    </p>
                  )}
                </div>
              </div>
            </div>
            {selectedTemplate && (
              <TaskPathSummary task={selectedTask} template={selectedTemplate} />
            )}
            <AuditTrail task={selectedTask} />
          </>
        ) : (
          <div className="p-5 text-sm text-neutral-400">No tracked requests yet.</div>
        )}
      </section>
    </div>
  );
}

function TaskPathSummary({
  task,
  template,
}: {
  task: ApprovalTask;
  template: WorkflowTemplate;
}) {
  const graph = createWorkflowGraphFromTemplate(template);
  const nodes = graph.nodes.filter((node) => node.kind !== "start");

  return (
    <div className="border-b border-white/10 p-4">
      <h3 className="mb-3 text-sm font-semibold text-neutral-300">Workflow path</h3>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => {
          const state = getPathNodeState(task, node);
          return (
            <div
              key={node.id}
              className={`rounded-md border p-3 ${
                state === "current"
                  ? "border-yellow-400/40 bg-yellow-400/10"
                  : state === "approved"
                    ? "border-emerald-400/30 bg-emerald-400/10"
                    : state === "rejected"
                      ? "border-rose-400/30 bg-rose-400/10"
                      : state === "completed"
                        ? "border-emerald-400/30 bg-emerald-400/10"
                    : state === "notified"
                      ? "border-sky-400/30 bg-sky-400/10"
                      : "border-white/10 bg-[#121518]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-neutral-100">
                    {node.label}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{formatNodeKind(node.kind)}</p>
                </div>
                <span className="rounded border border-white/10 px-2 py-1 text-[11px] text-neutral-300">
                  {formatPathNodeState(state)}
                </span>
              </div>
              {node.assigneeEmail && (
                <p className="mt-2 break-words text-xs text-neutral-400">
                  {node.assigneeEmail}
                </p>
              )}
              {node.documentIds?.length ? (
                <p className="mt-2 text-xs text-neutral-500">
                  {node.documentIds.length} document requirement(s)
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConditionBoxDetails({
  context,
  graph,
  conditionNode,
  coverage,
  activeOutcomeCaseId,
  onAddCase,
  onAddFallbackCase,
  onDeleteCase,
  onUpdateCase,
  onStartOutcomePick,
}: {
  context: ReturnType<typeof getConditionContext>;
  graph: WorkflowGraph;
  conditionNode: WorkflowGraphNode;
  coverage?: ReturnType<typeof analyzeConditionCoverage>;
  activeOutcomeCaseId?: string | null;
  onAddCase: () => void;
  onAddFallbackCase: () => void;
  onDeleteCase: (caseId: string) => void;
  onUpdateCase: (
    caseId: string,
    patch: Parameters<typeof updateWorkflowConditionCase>[3],
  ) => void;
  onStartOutcomePick: (caseId: string) => void;
}) {
  const availableTargets = graph.nodes.filter(
    (node) => node.kind !== "start" && node.kind !== "condition",
  );
  const conditionCases = [
    ...(conditionNode.conditionCases || []).filter(
      (conditionCase) => !conditionCase.isFallback,
    ),
    ...(conditionNode.conditionCases || []).filter(
      (conditionCase) => conditionCase.isFallback,
    ),
  ];
  const explicitConditionCases = conditionCases.filter(
    (conditionCase) => !conditionCase.isFallback,
  );
  const upstreamNodeLabelById = new Map(
    context.upstreamNodes.map((node) => [node.id, node.label]),
  );
  const numericFieldLabelByName = new Map(
    context.numericFields.map((field) => [field.name, field.label]),
  );
  const getConditionDisplayName = (conditionCase: (typeof conditionCases)[number]) =>
    conditionCase.isFallback
      ? "All other conditions"
      : `Condition ${
          explicitConditionCases.findIndex((item) => item.id === conditionCase.id) + 1
        }`;
  const getConditionNickname = (conditionCase: (typeof conditionCases)[number]) => {
    if (conditionCase.isFallback) {
      return "";
    }

    const nickname = conditionCase.name.trim();
    return /^condition\s+\d+$/i.test(nickname) ? "" : nickname;
  };
  const describeConditionCase = (conditionCase: (typeof conditionCases)[number]) => {
    if (conditionCase.isFallback) {
      return "Routes every request that does not match a numbered condition.";
    }

    const parts: string[] = [];
    const approvalRule = conditionCase.approvalRule;
    if (approvalRule?.upstreamNodeIds.length) {
      const reviewers = approvalRule.upstreamNodeIds
        .map((nodeId) => upstreamNodeLabelById.get(nodeId) || nodeId)
        .join(", ");
      if (conditionCase.isApprovalCount) {
        parts.push(
          `${approvalRule.mode === "exactly" ? "Exactly" : "At least"} ${
            approvalRule.minimumApproved
          } of ${approvalRule.upstreamNodeIds.length} approve (${reviewers})`,
        );
      } else {
        parts.push(`${reviewers} must approve`);
      }
    }

    const numericRule = conditionCase.numericRule;
    if (numericRule?.field) {
      parts.push(
        `${numericFieldLabelByName.get(numericRule.field) || numericRule.field} ${
          numericRule.operator
        } ${numericRule.value || "value"}`,
      );
    }

    if (!parts.length) {
      return "No rule configured yet.";
    }

    return parts.join(conditionCase.join === "or" ? " OR " : " AND ");
  };

  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3">
      <p className="text-xs font-semibold text-amber-100">Condition rules</p>
      <p className="mt-1 text-[11px] text-amber-100/80">
        Build each rule as: if this approval or numeric result is true, route to these
        outcome boxes.
      </p>
      <div className="mt-3 space-y-3">
        <div className="rounded-md border border-white/10 bg-[#101214] p-2">
          <p className="text-[11px] font-semibold text-neutral-400">
            Upstream approvals
          </p>
          {context.upstreamNodes.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {context.upstreamNodes.map((node) => (
                <span
                  key={node.id}
                  className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-300"
                >
                  {node.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              No approval/review boxes connect into this condition.
            </p>
          )}
        </div>

        <div className="rounded-md border border-white/10 bg-[#101214] p-2">
          <p className="text-[11px] font-semibold text-neutral-400">
            Downstream outcome boxes
          </p>
          {context.downstreamNodes.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {context.downstreamNodes.map(({ edge, node }) => (
                <span
                  key={`${edge.id}-${node.id}`}
                  className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-300"
                >
                  {node.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              Connect this condition to outcome boxes before assigning routes.
            </p>
          )}
        </div>

        <div className="rounded-md border border-white/10 bg-[#101214] p-2">
          <p className="text-[11px] font-semibold text-neutral-400">
            Parsed numeric values
          </p>
          {context.numericFields.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {context.numericFields.map((field) => (
                <span
                  key={field.name}
                  className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-300"
                >
                  {field.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              No numeric fields are available upstream.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-semibold text-neutral-400">
              Conditions
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAddCase}
                title="Add one condition. Inside it, choose specific reviewers, approval count, numeric values, or a combination."
                className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-2 text-xs text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={12} />
                Add condition
              </button>
              <button
                type="button"
                onClick={onAddFallbackCase}
                title="Add a catch-all outcome for requests that do not match any condition above."
                className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 transition hover:bg-sky-400/20"
              >
                <Plus size={12} />
                Add fallback outcome
              </button>
            </div>
          </div>

          {coverage && (
            <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
              Missing paths for {coverage.missingApprovalCounts.join(", ")} approved upstream
              box(es). Add condition(s) for those cases or add a fallback outcome.
            </div>
          )}

          {conditionCases.length ? (
            conditionCases.map((conditionCase) => (
              <div
                key={conditionCase.id}
                className="space-y-2 rounded-md border border-white/10 bg-[#101214] p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      title="Condition names are assigned automatically so the list stays easy to count."
                      className="flex h-8 w-full items-center rounded-md border border-white/10 bg-[#121518] px-2 text-xs font-semibold text-neutral-200"
                    >
                      {getConditionDisplayName(conditionCase)}
                      {getConditionNickname(conditionCase)
                        ? ` - ${getConditionNickname(conditionCase)}`
                        : ""}
                    </div>
                    {!conditionCase.isFallback && (
                      <input
                        value={getConditionNickname(conditionCase)}
                        title="Optional nickname. The condition number remains automatic."
                        onChange={(event) =>
                          onUpdateCase(conditionCase.id, {
                            name: event.target.value || getConditionDisplayName(conditionCase),
                          })
                        }
                        placeholder="Nickname (optional)"
                        className="mt-2 h-8 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                    )}
                    <p className="text-[11px] text-neutral-500">
                      {conditionCase.isFallback
                        ? "Catches every request not matched above"
                        : `Outcome: ${conditionCase.targetNodeIds.length} box(es)`}
                    </p>
                    <p className="mt-1 break-words text-[11px] text-neutral-400">
                      {describeConditionCase(conditionCase)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteCase(conditionCase.id)}
                    title="Delete this condition and its outcome mapping."
                    className="flex size-7 shrink-0 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                  >
                    <X size={13} />
                  </button>
                </div>

                {!conditionCase.isFallback && context.upstreamNodes.length > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-neutral-400">
                      Approval rule
                    </span>
                    <select
                      value={
                        conditionCase.approvalRule
                          ? conditionCase.isApprovalCount
                            ? "count"
                            : "specific"
                          : "none"
                      }
                      title="Choose whether this condition checks named reviewers, an approval count, or no approval result."
                      onChange={(event) => {
                        const selectedValue = event.target.value;
                        if (selectedValue === "none") {
                          onUpdateCase(conditionCase.id, {
                            isApprovalCount: false,
                            approvalRule: undefined,
                          });
                          return;
                        }

                        if (selectedValue === "count") {
                          const upstreamNodeIds = context.upstreamNodes.map(
                            (node) => node.id,
                          );
                          onUpdateCase(conditionCase.id, {
                            isApprovalCount: true,
                            approvalRule: {
                              upstreamNodeIds,
                              minimumApproved: Math.min(
                                conditionCase.approvalRule?.minimumApproved || 1,
                                upstreamNodeIds.length,
                              ),
                              mode: conditionCase.approvalRule?.mode || "at_least",
                            },
                          });
                          return;
                        }

                        const upstreamNodeIds =
                          conditionCase.approvalRule?.upstreamNodeIds.length
                            ? conditionCase.approvalRule.upstreamNodeIds
                            : context.upstreamNodes.slice(0, 1).map((node) => node.id);
                        onUpdateCase(conditionCase.id, {
                          isApprovalCount: false,
                          approvalRule: {
                            upstreamNodeIds,
                            minimumApproved: upstreamNodeIds.length,
                            mode: "at_least",
                          },
                        });
                      }}
                      className="h-9 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                    >
                      <option value="none">Do not check approvals</option>
                      <option value="specific">Named reviewers approved</option>
                      <option value="count">Approval count</option>
                    </select>
                  </label>
                )}

                {!conditionCase.isFallback &&
                  conditionCase.approvalRule &&
                  context.upstreamNodes.length > 0 && (
                  <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                    {conditionCase.isApprovalCount ? (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-[11px] font-semibold text-neutral-400">
                            Count approvals from
                          </p>
                          <div className="space-y-1">
                            {context.upstreamNodes.map((node) => {
                              const selectedNodeIds =
                                conditionCase.approvalRule?.upstreamNodeIds || [];
                              const checked = selectedNodeIds.includes(node.id);
                              return (
                                <label
                                  key={node.id}
                                  className="flex items-center gap-2 text-xs text-neutral-300"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    title="Include this upstream approval or review box in the count."
                                    onChange={(event) => {
                                      const nextNodeIds = event.target.checked
                                        ? [...selectedNodeIds, node.id]
                                        : selectedNodeIds.filter(
                                            (nodeId) => nodeId !== node.id,
                                          );
                                      const nextMinimum = Math.min(
                                        Math.max(
                                          conditionCase.approvalRule?.minimumApproved || 1,
                                          1,
                                        ),
                                        Math.max(nextNodeIds.length, 1),
                                      );
                                      onUpdateCase(conditionCase.id, {
                                        approvalRule: nextNodeIds.length
                                          ? {
                                              upstreamNodeIds: nextNodeIds,
                                              minimumApproved: nextMinimum,
                                              mode:
                                                conditionCase.approvalRule?.mode ||
                                                "at_least",
                                            }
                                          : undefined,
                                      });
                                    }}
                                  />
                                  <span>{node.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_120px_1fr]">
                          <select
                            value={conditionCase.approvalRule?.mode || "at_least"}
                            title="Choose whether the approval count is a minimum threshold or an exact number."
                            onChange={(event) =>
                              onUpdateCase(conditionCase.id, {
                                approvalRule: {
                                  upstreamNodeIds:
                                    conditionCase.approvalRule?.upstreamNodeIds ||
                                    context.upstreamNodes.map((node) => node.id),
                                  minimumApproved:
                                    conditionCase.approvalRule?.minimumApproved || 1,
                                  mode: event.target.value as "at_least" | "exactly",
                                },
                              })
                            }
                            className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                          >
                            <option value="at_least">At least</option>
                            <option value="exactly">Exactly</option>
                          </select>
                          <input
                            type="number"
                            title="Number of selected upstream boxes that must approve for this condition to match."
                            min={1}
                            max={
                              conditionCase.approvalRule?.upstreamNodeIds.length ||
                              context.upstreamNodes.length
                            }
                            value={conditionCase.approvalRule?.minimumApproved || 1}
                            onChange={(event) => {
                              const selectedNodeIds =
                                conditionCase.approvalRule?.upstreamNodeIds ||
                                context.upstreamNodes.map((node) => node.id);
                              const maxCount = Math.max(selectedNodeIds.length, 1);
                              const nextMinimum = Math.min(
                                Math.max(Number(event.target.value) || 1, 1),
                                maxCount,
                              );
                              onUpdateCase(conditionCase.id, {
                                approvalRule: {
                                  upstreamNodeIds: selectedNodeIds,
                                  minimumApproved: nextMinimum,
                                  mode: conditionCase.approvalRule?.mode || "at_least",
                                },
                              });
                            }}
                            className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                          />
                          <div className="flex min-h-9 items-center rounded-md border border-white/10 bg-[#101214] px-2 text-xs text-neutral-300">
                            approved reviewer(s)
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mb-2 text-[11px] font-semibold text-neutral-400">
                          Required approvals
                        </p>
                        <div className="space-y-1">
                          {context.upstreamNodes.map((node) => {
                            const selectedNodeIds =
                              conditionCase.approvalRule?.upstreamNodeIds || [];
                            const checked = selectedNodeIds.includes(node.id);
                            return (
                              <label
                                key={node.id}
                                className="flex items-center gap-2 text-xs text-neutral-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  title="Require this specific upstream box to be approved."
                                  onChange={(event) => {
                                    const nextNodeIds = event.target.checked
                                      ? [...selectedNodeIds, node.id]
                                      : selectedNodeIds.filter(
                                          (nodeId) => nodeId !== node.id,
                                        );
                                    onUpdateCase(conditionCase.id, {
                                      approvalRule: nextNodeIds.length
                                        ? {
                                            upstreamNodeIds: nextNodeIds,
                                            minimumApproved: nextNodeIds.length,
                                            mode: "at_least",
                                          }
                                        : undefined,
                                    });
                                  }}
                                />
                                <span>{node.label} approved</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[11px] text-neutral-500">
                          Select multiple boxes when all selected reviewers must approve.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {!conditionCase.isFallback && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-neutral-400">
                    Numeric rule
                  </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select
                    value={conditionCase.numericRule?.field || ""}
                    title="Optional extracted numeric field to evaluate, such as invoice amount or quantity."
                    onChange={(event) =>
                      onUpdateCase(conditionCase.id, {
                        numericRule: event.target.value
                          ? {
                              field: event.target.value,
                              operator: conditionCase.numericRule?.operator || ">=",
                              value: conditionCase.numericRule?.value || "",
                            }
                          : undefined,
                      })
                    }
                    className="h-9 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    <option value="">Numeric field</option>
                    {context.numericFields.map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={conditionCase.numericRule?.operator || ">="}
                    title="Comparison to apply against the extracted numeric value."
                    onChange={(event) =>
                      onUpdateCase(conditionCase.id, {
                        numericRule: {
                          field:
                            conditionCase.numericRule?.field ||
                            context.numericFields[0]?.name ||
                            "",
                          operator: event.target.value as WorkflowRuleOperator,
                          value: conditionCase.numericRule?.value || "",
                        },
                      })
                    }
                    className="h-9 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {ruleOperatorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value}
                      </option>
                    ))}
                  </select>
                  <input
                    value={conditionCase.numericRule?.value || ""}
                    title="Numeric threshold used by this condition."
                    onChange={(event) =>
                      onUpdateCase(conditionCase.id, {
                        numericRule: {
                          field:
                            conditionCase.numericRule?.field ||
                            context.numericFields[0]?.name ||
                            "",
                          operator: conditionCase.numericRule?.operator || ">=",
                          value: event.target.value,
                        },
                      })
                    }
                    inputMode="decimal"
                    placeholder="Value"
                    className="h-9 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                  />
                </div>
                </div>
                )}

                {!conditionCase.isFallback && conditionCase.approvalRule && conditionCase.numericRule && (
                <select
                  value={conditionCase.join}
                  title="Choose how approval and numeric checks combine when both are configured."
                  onChange={(event) =>
                    onUpdateCase(conditionCase.id, {
                      join: event.target.value as "and" | "or",
                    })
                  }
                  className="h-9 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                >
                  <option value="and">Approval and numeric rules must both match</option>
                  <option value="or">Either approval or numeric rule can match</option>
                </select>
                )}

                {conditionCase.isFallback && (
                  <div className="rounded-md border border-sky-400/30 bg-sky-400/10 p-2 text-xs text-sky-100">
                    This outcome is used only when none of the conditions above match.
                  </div>
                )}

                <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] font-semibold text-neutral-400">
                      Then route to
                    </p>
                    <button
                      type="button"
                      onClick={() => onStartOutcomePick(conditionCase.id)}
                      title="Choose which downstream boxes this condition routes to. You can click boxes on the canvas or use the checkboxes below."
                      className={`min-h-7 rounded-md border px-2 text-xs transition ${
                        activeOutcomeCaseId === conditionCase.id
                          ? "border-sky-300/50 bg-sky-400/20 text-sky-100"
                          : "border-sky-400/40 bg-sky-400/12 text-sky-100 hover:bg-sky-400/20"
                      }`}
                    >
                      Pick on canvas
                    </button>
                  </div>
                  {conditionCase.targetNodeIds.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {conditionCase.targetNodeIds.map((targetNodeId) => {
                        const targetNode = graph.nodes.find(
                          (node) => node.id === targetNodeId,
                        );
                        return (
                          <span
                            key={targetNodeId}
                            className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100"
                          >
                            {targetNode?.label || targetNodeId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    {availableTargets.map((node) => (
                      <label
                        key={node.id}
                        className="flex items-center gap-2 text-xs text-neutral-300"
                      >
                        <input
                          type="checkbox"
                          checked={conditionCase.targetNodeIds.includes(node.id)}
                          title="Route matching requests to this downstream box."
                          onChange={(event) => {
                            const nextTargets = event.target.checked
                              ? [...conditionCase.targetNodeIds, node.id]
                              : conditionCase.targetNodeIds.filter(
                                  (targetId) => targetId !== node.id,
                                );
                            onUpdateCase(conditionCase.id, {
                              targetNodeIds: nextTargets,
                            });
                          }}
                        />
                        <span className="min-w-0 break-words">
                          {node.label} ({formatNodeKind(node.kind)})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs text-neutral-500">
              Add a condition, then select the upstream approvals and optional numeric
              value that should route to an outcome.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function getPathNodeState(task: ApprovalTask, node: WorkflowGraphNode) {
  if (task.nodeDecisions?.[node.id] === "approved") {
    return "approved";
  }

  if (task.nodeDecisions?.[node.id] === "rejected") {
    return "rejected";
  }

  if (task.pendingNodeIds?.includes(node.id)) {
    return "current";
  }

  if (task.currentNodeId === node.id || (!task.currentNodeId && task.currentStep === node.label)) {
    return "current";
  }

  if (task.completedNodeIds?.includes(node.id)) {
    return "completed";
  }

  if (task.notifiedNodeIds?.includes(node.id)) {
    return "notified";
  }

  return "waiting";
}

function formatPathNodeState(state: string) {
  if (state === "current") return "Current";
  if (state === "approved") return "Approved";
  if (state === "rejected") return "Rejected";
  if (state === "completed") return "Done";
  if (state === "notified") return "FYI";
  return "Waiting";
}

function formatTaskAccessRole(task: ApprovalTask, activeUserEmail: string) {
  if (task.requesterEmail === activeUserEmail) {
    return "originator";
  }

  if (task.currentOwner === activeUserEmail) {
    return "current actor";
  }

  if (task.auditTrail.some((event) => event.actorEmail === activeUserEmail)) {
    return "previous actor";
  }

  return "participant";
}

function UserDirectoryDatalist({
  id,
  users,
}: {
  id: string;
  users: UserDirectoryEntry[];
}) {
  return (
    <datalist id={id}>
      {users.map((user) => (
        <option key={user.email} value={user.email}>
          {user.name} - {user.role}
        </option>
      ))}
    </datalist>
  );
}

function AuditTrail({ task }: { task: ApprovalTask }) {
  return (
    <ol className="space-y-3 p-4">
      {task.auditTrail.map((event) => (
        <li key={event.id} className="flex gap-3 text-sm">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-300" />
          <div className="min-w-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-neutral-200">{event.actor}</p>
              <p className="text-xs text-neutral-500">{event.timestamp}</p>
            </div>
            <p className="mt-1 break-words text-neutral-300">{event.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function UploadView({
  fileName,
  parseResult,
  editedFields,
  setEditedFields,
  isParsing,
  parseError,
  parseFile,
  uploadedAttachments,
  workflowTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  submissionMessage,
  onSubmitRequest,
}: {
  fileName: string;
  parseResult: ParseResult | null;
  editedFields: Record<string, string>;
  setEditedFields: (fields: Record<string, string>) => void;
  isParsing: boolean;
  parseError: string;
  parseFile: (
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
  ) => void;
  uploadedAttachments: ApprovalAttachment[];
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  submissionMessage: string;
  onSubmitRequest: () => void;
}) {
  const selectedTemplate =
    workflowTemplates.find((template) => template.id === selectedTemplateId) ||
    workflowTemplates[0];
  const uploadDocuments = selectedTemplate
    ? getSubmissionDocumentRequirements(selectedTemplate)
    : [];
  const uploadedDocumentIds = new Set(
    uploadedAttachments
      .map((attachment) => attachment.documentId)
      .filter((documentId): documentId is string => Boolean(documentId)),
  );
  const missingRequiredDocuments = selectedTemplate
    ? getMissingRequiredSubmissionDocuments(selectedTemplate, uploadedAttachments)
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-semibold">Upload request documents</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Choose a template, then upload each required or optional document.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-neutral-400">Workflow template</span>
          <select
            value={selectedTemplate?.id || ""}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            {workflowTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        {selectedTemplate && (
          <div className="mt-4 space-y-3">
            {uploadDocuments.map((document) => (
              <label
                key={document.id}
                className="block cursor-pointer rounded-md border border-white/10 bg-[#121518] p-3 transition hover:border-emerald-400/60"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {document.documentType}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {formatDocumentFormat(document.format)} -{" "}
                      {document.required ? "Required" : "Optional"} -{" "}
                      {document.fields.length} field(s)
                    </p>
                  </div>
                  <span className="self-start rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400">
                    {uploadedDocumentIds.has(document.id) ? "Attached" : "Upload"}
                  </span>
                </div>
                <input
                  type="file"
                  className="sr-only"
                  accept={acceptForDocumentFormat(document.format)}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      parseFile(file, document);
                    }
                  }}
                />
              </label>
            ))}
            {!uploadDocuments.length && (
              <div className="rounded-md border border-white/10 bg-[#121518] p-3 text-sm text-neutral-400">
                No document requirements are attached to the starting route.
              </div>
            )}
            </div>
        )}

        {uploadedAttachments.length > 0 && (
          <div className="mt-4 rounded-md border border-white/10 bg-[#121518] p-3">
            <p className="text-sm font-semibold text-neutral-200">Attached files</p>
            <div className="mt-2 space-y-2">
              {uploadedAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs"
                >
                  <p className="break-words text-neutral-200">{attachment.fileName}</p>
                  <p className="mt-1 text-neutral-500">
                    {attachment.documentType}
                    {attachment.workflowNodeId
                      ? ` - ${attachment.workflowNodeId}`
                      : ""}
                  </p>
                  {attachment.storagePath && (
                    <p className="mt-1 break-words text-emerald-200">
                      Stored in Supabase: {attachment.storagePath}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {missingRequiredDocuments.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Missing required upload(s):{" "}
            {missingRequiredDocuments
              .map((document) => document.documentType)
              .join(", ")}
          </div>
        )}

        <label className="mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-[#121518] p-6 text-center transition hover:border-emerald-400/60 hover:bg-emerald-400/5">
          {isParsing ? (
            <Loader2 className="mb-3 animate-spin text-emerald-200" size={28} />
          ) : (
            <Upload className="mb-3 text-neutral-300" size={28} />
          )}
          <span className="text-sm font-medium">
            {isParsing ? "Parsing document" : "Choose a file"}
          </span>
          <span className="mt-1 text-xs text-neutral-500">Ad hoc PDF, image, Excel, or CSV</span>
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
            onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    parseFile(file);
              }
            }}
          />
        </label>

        {fileName && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
            <FileText size={16} className="text-emerald-200" />
            <span className="truncate">{fileName}</span>
          </div>
        )}

        {parseError && (
          <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
            {parseError}
          </div>
        )}
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Extraction draft</h2>
          <p className="text-sm text-neutral-400">
            Corrections here become training examples for workflow-specific extraction.
          </p>
        </div>

        <div className="p-4">
          {!parseResult && !isParsing && (
            <div className="grid min-h-72 place-items-center rounded-md border border-white/10 bg-[#121518] text-center text-sm text-neutral-500">
              <div>
                <div className="mb-3 flex justify-center gap-2">
                  <ImageIcon size={22} />
                  <FileText size={22} />
                  <FileSpreadsheet size={22} />
                </div>
                Upload a document to create an editable extraction draft.
              </div>
            </div>
          )}

          {parseResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-md border border-white/10 bg-[#121518] px-3 py-1">
                  Strategy: {parseResult.strategy}
                </span>
                {parseResult.notes.map((note) => (
                  <span
                    key={note}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-100"
                  >
                    {note}
                  </span>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(editedFields).map(([label, value]) => (
                  <label key={label} className="block">
                    <span className="mb-1 block text-xs text-neutral-400">{label}</span>
                    <input
                      value={value}
                      onChange={(event) =>
                        setEditedFields({
                          ...editedFields,
                          [label]: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                    />
                  </label>
                ))}
              </div>

              {parseResult.tables?.[0] && (
                <div className="overflow-hidden rounded-md border border-white/10">
                  <div className="border-b border-white/10 bg-[#121518] px-3 py-2 text-sm">
                    {parseResult.tables[0].sheetName}
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <tbody>
                        {parseResult.tables[0].rows.slice(0, 8).map((row, index) => (
                          <tr key={index} className="border-b border-white/10 last:border-0">
                            {Object.values(row)
                              .slice(0, 6)
                              .map((value, cellIndex) => (
                                <td key={cellIndex} className="px-3 py-2 text-neutral-300">
                                  {String(value)}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onSubmitRequest}
                disabled={missingRequiredDocuments.length > 0}
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send size={16} />
                Submit for review
              </button>

              {submissionMessage && (
                <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                  {submissionMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
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
    () =>
      workflowTasks.find((task) => task.id === selectedRuntimeTaskId) ||
      workflowTasks[0],
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
  const validationErrors =
    workflowSimulation?.issues.filter((issue) => issue.severity === "error") || [];
  const validationWarnings =
    workflowSimulation?.issues.filter((issue) => issue.severity === "warning") || [];
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
  const selectedBusiness =
    businessDirectory.find((business) => business.id === businessId) || firstBusiness;
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

              <div className="mb-3 flex flex-col gap-2 rounded-md border border-white/10 bg-[#101214] p-3 text-xs text-neutral-400 lg:flex-row lg:items-center lg:justify-between">
                <span>
                  Runtime status:{" "}
                  {runtimeTask
                    ? `${runtimeTask.title} is at ${runtimeTask.currentStep}`
                    : "no active request is linked to this template yet"}
                </span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {workflowTasks.length > 0 && (
                    <select
                      value={runtimeTask?.id || ""}
                      onChange={(event) => setSelectedRuntimeTaskId(event.target.value)}
                      className="h-9 rounded-md border border-white/10 bg-[#121518] px-2 text-xs text-neutral-200 outline-none focus:border-emerald-400/60"
                    >
                      {workflowTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.id} - {task.currentStep}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={undoWorkflowChange}
                    disabled={!workflowUndoStack.length}
                    title={
                      workflowUndoStack.length
                        ? `Undo ${workflowUndoStack.at(-1)?.label}. Keyboard: Ctrl+Z.`
                        : "No workflow edit to undo."
                    }
                    className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#121518] px-2 text-xs text-neutral-200 transition hover:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-white/10"
                  >
                    <RotateCcw size={13} />
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={redoWorkflowChange}
                    disabled={!workflowRedoStack.length}
                    title={
                      workflowRedoStack.length
                        ? `Redo ${workflowRedoStack.at(-1)?.label}. Keyboard: Ctrl+Shift+Z or Ctrl+Y.`
                        : "No workflow edit to redo."
                    }
                    className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#121518] px-2 text-xs text-neutral-200 transition hover:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-white/10"
                  >
                    <ArrowRightLeft size={13} />
                    Redo
                  </button>
                  <button
                    type="button"
                    onClick={resetCanvasView}
                    className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#121518] px-2 text-xs text-neutral-200 transition hover:border-emerald-400/50"
                  >
                    <RotateCcw size={13} />
                    Reset view
                  </button>
                  <div className="flex flex-wrap gap-3">
                    {lastWorkflowEdit && (
                      <span className="flex min-w-0 items-center gap-1.5 break-words text-neutral-300">
                        Last edit: {lastWorkflowEdit}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-yellow-400" />
                      Current
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      Completed
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-sky-400" />
                      FYI sent
                    </span>
                  </div>
                </div>
              </div>

              {workflowSimulation && (
                <div className="mb-3 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-md border border-white/10 bg-[#101214] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-300">
                        Validation
                      </h3>
                      <span
                        className={`rounded-md border px-2 py-1 text-xs ${
                          validationErrors.length
                            ? "border-rose-400/40 bg-rose-400/10 text-rose-100"
                            : "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                        }`}
                      >
                        {validationErrors.length
                          ? `${validationErrors.length} error(s)`
                          : "Ready"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                      {workflowSimulation.issues.length ? (
                        workflowSimulation.issues.slice(0, 4).map((issue, issueIndex) => (
                          <div
                            key={`${issue.nodeId || issue.edgeId || "template"}-${issueIndex}`}
                            className={`flex gap-2 rounded-md border p-2 ${
                              issue.severity === "error"
                                ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                                : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                            }`}
                          >
                            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                            <span>{issue.message}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-neutral-400">
                          No blocking configuration issues found.
                        </p>
                      )}
                      {workflowSimulation.issues.length > 4 && (
                        <p className="text-neutral-500">
                          +{workflowSimulation.issues.length - 4} more issue(s)
                        </p>
                      )}
                      {!validationErrors.length && validationWarnings.length > 0 && (
                        <p className="text-amber-100">
                          {validationWarnings.length} warning(s) should be reviewed.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-[#101214] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-300">
                        Route simulation
                      </h3>
                      <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400">
                        Autosaved
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-neutral-400">
                      <p>
                        First task:{" "}
                        <span className="text-neutral-100">
                          {workflowSimulation.currentNode
                            ? `${workflowSimulation.currentNode.label} (${workflowSimulation.currentNode.assigneeEmail})`
                            : "not configured"}
                        </span>
                      </p>
                      <p>
                        FYI:{" "}
                        <span className="text-neutral-100">
                          {workflowSimulation.notifiedNodes.length
                            ? workflowSimulation.notifiedNodes
                                .map((node) => node.assigneeEmail || node.label)
                                .join(", ")
                            : "none"}
                        </span>
                      </p>
                      <p>
                        Documents:{" "}
                        <span className="text-neutral-100">
                          {workflowSimulation.requiredDocuments.length
                            ? workflowSimulation.requiredDocuments
                                .map((document) => document.documentType)
                                .join(", ")
                            : "none on starting route"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-[#101214] p-3 xl:col-span-2">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-neutral-300">
                          Workflow runner
                        </h3>
                        <p className="mt-1 text-xs text-neutral-500">
                          Simulate the selected request through this template using the
                          same routing engine as the approval queue.
                        </p>
                        {runtimeTask ? (
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                            <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                              <p className="text-neutral-500">Status</p>
                              <p className="mt-1 break-words text-neutral-200">
                                {runtimeTask.status}
                              </p>
                            </div>
                            <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                              <p className="text-neutral-500">Owner</p>
                              <p className="mt-1 break-words text-neutral-200">
                                {runtimeTask.currentOwner || "Closed"}
                              </p>
                            </div>
                            <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                              <p className="text-neutral-500">Node</p>
                              <p className="mt-1 break-words text-neutral-200">
                                {runtimeTask.currentNodeId || "none"}
                              </p>
                            </div>
                            <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                              <p className="text-neutral-500">Last event</p>
                              <p className="mt-1 break-words text-neutral-200">
                                {runtimeTask.auditTrail.at(-1)?.detail || runtimeTask.lastAction}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-neutral-500">
                            Submit a request for this template before running it.
                          </p>
                        )}
                      </div>
                      {runtimeTask && (
                        <div className="grid min-w-48 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                          {[
                            ["approve", "Approve"],
                            ["reject_with_comment", "Reject"],
                            ["amend_resubmit", "Resubmit"],
                            ["cancel", "Cancel"],
                          ].map(([action, label]) => {
                            const approvalBlocked =
                              action === "approve" && runtimeMissingDocuments.length > 0;
                            return (
                              <button
                                key={action}
                                type="button"
                                disabled={approvalBlocked}
                                title={
                                  approvalBlocked
                                    ? `Upload ${runtimeMissingDocuments
                                        .map((document) => document.documentType)
                                        .join(", ")} before approving.`
                                    : `Simulate ${label.toLowerCase()} for this request.`
                                }
                                onClick={() =>
                                  onRunWorkflowAction(
                                    runtimeTask.id,
                                    action as ApprovalAction,
                                  )
                                }
                                className="min-h-9 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-xs text-neutral-200 transition hover:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {runtimeMissingDocuments.length > 0 && (
                      <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
                        Current node requires:{" "}
                        {runtimeMissingDocuments
                          .map((document) => document.documentType)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              )}

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
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-300">
            Template library
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {workflowTemplates.map((template) => (
              <div
                key={template.id}
                className={`rounded-md border p-3 text-left transition ${
                  workflow?.id === template.id
                    ? "border-emerald-400/40 bg-emerald-400/10"
                    : "border-white/10 bg-[#121518] hover:border-white/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className="block w-full text-left"
                >
                  <p className="break-words text-sm font-medium">{template.name}</p>
                  <p className="mt-1 break-words text-xs text-neutral-400">
                    {template.business} - {template.department}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    {template.documents.length} document(s),{" "}
                    {template.fields.length} field(s), {template.steps.length} step(s)
                  </p>
                </button>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => loadTemplateIntoBuilder(template)}
                    className="flex min-h-8 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 py-1 text-xs text-sky-100 transition hover:bg-sky-400/20"
                  >
                    <RotateCcw size={13} />
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTemplate(template.id)}
                    className="flex min-h-8 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 transition hover:bg-rose-500/20"
                  >
                    <X size={13} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </section>

      {workflowEditorTab === "builder" && (
      <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
        <h2 className="font-semibold">Template builder</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Template name</span>
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Business</span>
            <select
              value={businessId}
              onChange={(event) => {
                const nextBusiness = businessDirectory.find(
                  (business) => business.id === event.target.value,
                );
                setBusinessId(event.target.value);
                setDepartmentName(nextBusiness?.departments[0] || "");
              }}
              className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
            >
              {businessDirectory.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Department</span>
            {selectedBusiness?.departments.length ? (
              <select
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              >
                {selectedBusiness.departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
                placeholder="Add department name"
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
              />
            )}
          </label>
          <div className="rounded-md border border-sky-400/30 bg-sky-400/10 p-3 text-sm text-sky-100">
            Add approval, review, and for-information boxes on the Canvas tab.
            Select a box to set people, due hours, escalation, and document uploads.
          </div>
          <button
            type="button"
            onClick={createTemplate}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
          >
            <Plus size={16} />
            Create template
          </button>
        </div>
      </section>
      )}
    </div>
  );
}

function AdminView({
  businessDirectory,
  setBusinessDirectory,
  legacyDepartments,
  userDirectory,
  taskNotifications,
  roleAssignments,
  setRoleAssignments,
}: {
  businessDirectory: BusinessUnit[];
  setBusinessDirectory: (updater: (items: BusinessUnit[]) => BusinessUnit[]) => void;
  legacyDepartments: string[];
  userDirectory: UserDirectoryEntry[];
  taskNotifications: TaskNotification[];
  roleAssignments: UserRoleAssignment[];
  setRoleAssignments: (
    updater: (items: UserRoleAssignment[]) => UserRoleAssignment[],
  ) => void;
}) {
  const firstBusiness = businessDirectory[0];
  const [selectedBusinessId, setSelectedBusinessId] = useState(firstBusiness?.id || "");
  const selectedBusiness =
    businessDirectory.find((business) => business.id === selectedBusinessId) ||
    firstBusiness;
  const [newBusinessName, setNewBusinessName] = useState("");
  const [businessNameDraft, setBusinessNameDraft] = useState(selectedBusiness?.name || "");
  const [newDepartmentName, setNewDepartmentName] = useState("");

  function selectBusiness(business: BusinessUnit) {
    setSelectedBusinessId(business.id);
    setBusinessNameDraft(business.name);
    setNewDepartmentName("");
  }

  function createBusiness() {
    const next = addBusiness(businessDirectory, newBusinessName);
    const created = next.at(-1);
    setBusinessDirectory(() => next);
    setNewBusinessName("");
    if (created) {
      selectBusiness(created);
    }
  }

  function saveBusinessName() {
    if (!selectedBusiness) {
      return;
    }

    setBusinessDirectory((items) =>
      updateBusiness(items, selectedBusiness.id, businessNameDraft),
    );
  }

  function removeBusiness() {
    if (!selectedBusiness) {
      return;
    }

    const next = deleteBusiness(businessDirectory, selectedBusiness.id);
    setBusinessDirectory(() => next);
    const replacement = next[0];
    setSelectedBusinessId(replacement?.id || "");
    setBusinessNameDraft(replacement?.name || "");
  }

  function createDepartment() {
    if (!selectedBusiness) {
      return;
    }

    setBusinessDirectory((items) =>
      addDepartment(items, selectedBusiness.id, newDepartmentName),
    );
    setNewDepartmentName("");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr_360px]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Businesses</h2>
          <p className="text-sm text-neutral-400">
            Superuser master list for workflow template ownership.
          </p>
        </div>
        <div className="space-y-2 p-4">
          {businessDirectory.map((business) => (
            <button
              key={business.id}
              type="button"
              onClick={() => selectBusiness(business)}
              className={`block w-full rounded-md border p-3 text-left text-sm transition ${
                selectedBusiness?.id === business.id
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-white/10 bg-[#121518] hover:border-white/20"
              }`}
            >
              <span className="block break-words font-medium">{business.name}</span>
              <span className="mt-1 block text-xs text-neutral-500">
                {business.departments.length} department(s)
              </span>
            </button>
          ))}
          <div className="grid gap-2 pt-2 sm:grid-cols-[1fr_auto]">
            <input
              value={newBusinessName}
              onChange={(event) => setNewBusinessName(event.target.value)}
              placeholder="New business"
              className="h-10 min-w-0 rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
            <button
              type="button"
              onClick={createBusiness}
              className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Departments</h2>
          <p className="break-words text-sm text-neutral-400">
            {selectedBusiness
              ? `Editing departments for ${selectedBusiness.name}.`
              : "Select a business to edit departments."}
          </p>
        </div>
        {selectedBusiness && (
          <div className="space-y-4 p-4">
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <input
                value={businessNameDraft}
                onChange={(event) => setBusinessNameDraft(event.target.value)}
                className="h-10 min-w-0 rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={saveBusinessName}
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
              >
                <Check size={16} />
                Save
              </button>
              <button
                type="button"
                onClick={removeBusiness}
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
              >
                <X size={16} />
                Delete
              </button>
            </div>

            <div className="space-y-2">
              {selectedBusiness.departments.map((department, index) => (
                <div
                  key={`${selectedBusiness.id}-${department}-${index}`}
                  className="grid gap-2 rounded-md border border-white/10 bg-[#121518] p-3 md:grid-cols-[1fr_auto]"
                >
                  <input
                    defaultValue={department}
                    onBlur={(event) =>
                      setBusinessDirectory((items) =>
                        updateDepartment(
                          items,
                          selectedBusiness.id,
                          index,
                          event.target.value,
                        ),
                      )
                    }
                    className="h-10 min-w-0 rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setBusinessDirectory((items) =>
                        deleteDepartment(items, selectedBusiness.id, index),
                      )
                    }
                    className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
                  >
                    <X size={16} />
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                placeholder="New department"
                className="h-10 min-w-0 rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={createDepartment}
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={16} />
                Add department
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">User directory</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Lightweight roles inferred from requests and workflow templates.
          </p>
          <div className="mt-3 space-y-2">
            {userDirectory.slice(0, 10).map((user) => (
              <div
                key={user.email}
                className="rounded-md border border-white/10 bg-[#121518] p-2 text-sm"
              >
                <p className="break-words text-neutral-200">{user.name}</p>
                <p className="mt-1 break-words text-xs text-neutral-500">
                  {user.email} - {user.role}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">Role management</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Assign business, department, and workflow role for routing.
          </p>
          <div className="mt-3 space-y-3">
            {roleAssignments.slice(0, 8).map((assignment, index) => {
              const assignedBusiness =
                businessDirectory.find(
                  (business) => business.id === assignment.businessId,
                ) || firstBusiness;
              return (
                <div
                  key={assignment.email}
                  className="space-y-2 rounded-md border border-white/10 bg-[#121518] p-3"
                >
                  <p className="break-words text-sm font-medium text-neutral-200">
                    {assignment.name}
                  </p>
                  <p className="break-words text-xs text-neutral-500">
                    {assignment.email}
                  </p>
                  <select
                    value={assignment.role}
                    title="Role used for workflow routing and administration."
                    onChange={(event) =>
                      setRoleAssignments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                role: event.target.value as UserDirectoryEntry["role"],
                              }
                            : item,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {userRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignment.businessId}
                    title="Business this user is assigned to."
                    onChange={(event) => {
                      const nextBusiness = businessDirectory.find(
                        (business) => business.id === event.target.value,
                      );
                      setRoleAssignments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                businessId: event.target.value,
                                department: nextBusiness?.departments[0] || "",
                              }
                            : item,
                        ),
                      );
                    }}
                    className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {businessDirectory.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignment.department}
                    title="Department this user is assigned to."
                    onChange={(event) =>
                      setRoleAssignments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, department: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {(assignedBusiness?.departments || []).map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">Legacy departments</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {legacyDepartments.length} existing department label(s) are still available to older mock data.
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">In-app notifications</h2>
          <div className="mt-3 space-y-2">
            {taskNotifications.slice(0, 12).map((item) => (
              <Link
                key={item.id}
                href={`/?tab=tracking&request=${encodeURIComponent(item.requestId)}`}
                className="block rounded-md border border-white/10 bg-[#121518] p-3 transition hover:border-sky-400/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.unread && <span className="size-2 rounded-full bg-amber-300" />}
                </div>
                <p className="mt-1 text-xs text-neutral-400">{item.body}</p>
                <p className="mt-2 break-words text-xs text-neutral-500">
                  {item.kind} - {item.recipientEmail}
                </p>
              </Link>
            ))}
            {notifications.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-white/10 bg-[#121518] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.unread && <span className="size-2 rounded-full bg-amber-300" />}
                </div>
                <p className="mt-1 text-xs text-neutral-400">{item.body}</p>
                <p className="mt-2 text-xs text-neutral-500">{item.time}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">Delegation</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Delegate to</span>
              <input
                defaultValue="Alex Ho"
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Period</span>
              <input
                defaultValue="2026-06-19 to 2026-06-26"
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
            </label>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 text-sm text-sky-100 transition hover:bg-sky-400/20"
            >
              <CalendarClock size={16} />
              Save delegation
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalTask["status"] }) {
  if (status === "overdue") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
        <AlertTriangle size={12} />
        Overdue
      </span>
    );
  }

  if (status === "escalated") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
        <RotateCcw size={12} />
        Escalated
      </span>
    );
  }

  if (status === "returned") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs text-sky-100">
        <RotateCcw size={12} />
        Returned
      </span>
    );
  }

  if (status === "reassigned") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
        <ArrowRightLeft size={12} />
        Reassigned
      </span>
    );
  }

  if (status === "delegated") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-xs text-violet-100">
        <UserPlus size={12} />
        Delegated
      </span>
    );
  }

  if (status === "cancelled") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-neutral-500/40 bg-neutral-500/10 px-2 py-1 text-xs text-neutral-200">
        <X size={12} />
        Cancelled
      </span>
    );
  }

  if (status === "approved") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
        <Check size={12} />
        Approved
      </span>
    );
  }

  return (
    <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
      Pending
    </span>
  );
}
