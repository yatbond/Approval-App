"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  MessageSquare,
  RotateCcw,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  acceptForDocumentFormat,
  formatDocumentFormat,
} from "@/lib/workflow-documents";
import { createWorkflowGraphFromTemplate } from "@/lib/workflow-graph";
import { formatNodeKind } from "@/lib/workflow-condition-context";
import {
  findTemplateForTask,
  formatPathNodeState,
  formatTaskAccessRole,
  getPathNodeState,
} from "@/lib/task-display";
import type {
  ApprovalAction,
  ApprovalTask,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";

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

export function QueueView({
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

export function TrackingView({
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

export function UserDirectoryDatalist({
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
