"use client";

import { useState, type ElementType } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  MessageSquare,
  RotateCcw,
  Send,
  Upload,
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
import { buildTaskHandoffView } from "@/lib/task-handoff-view";
import {
  getQueueActionList,
  shouldShowQueueContributorRequest,
  shouldShowQueueReassignActions,
} from "@/lib/queue-advanced-actions-state";
import { getCollaborationStatusPanelState } from "@/lib/collaboration-status-panel-state";
import type {
  ApprovalAction,
  ApprovalTask,
  TaskCollaborationRequest,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";

const actionConfig: Record<
  ApprovalAction,
  { label: string; icon: ElementType; tone: string }
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
  contributorName,
  setContributorName,
  contributorEmail,
  setContributorEmail,
  contributorRequestNote,
  setContributorRequestNote,
  contributorDueAt,
  setContributorDueAt,
  contributorBlocksApproval,
  setContributorBlocksApproval,
  contributorRequestError,
  onRequestContributor,
  recordAction,
  activeUserEmail,
  userDirectory,
  workflowTemplates,
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
  contributorName: string;
  setContributorName: (value: string) => void;
  contributorEmail: string;
  setContributorEmail: (value: string) => void;
  contributorRequestNote: string;
  setContributorRequestNote: (value: string) => void;
  contributorDueAt: string;
  setContributorDueAt: (value: string) => void;
  contributorBlocksApproval: boolean;
  setContributorBlocksApproval: (value: boolean) => void;
  contributorRequestError: string;
  onRequestContributor: () => void;
  recordAction: (action: ApprovalAction) => void;
  activeUserEmail: string;
  userDirectory: UserDirectoryEntry[];
  workflowTemplates: WorkflowTemplate[];
  actionError: string;
  missingCurrentDocuments: WorkflowDocumentRequirement[];
  onAttachTaskDocument: (
    file: File,
    documentRequirement: WorkflowDocumentRequirement,
  ) => void;
}) {
  const [reassignActionsExpanded, setReassignActionsExpanded] = useState(false);
  const [contributorRequestExpanded, setContributorRequestExpanded] = useState(false);

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
  const selectedTemplate = findTemplateForTask(selectedTask, workflowTemplates);
  const showReassignActions = shouldShowQueueReassignActions({
    isOriginatorAction: originatorAction,
    isExpanded: reassignActionsExpanded,
  });
  const showContributorRequest = shouldShowQueueContributorRequest({
    isOriginatorAction: originatorAction,
    isExpanded: contributorRequestExpanded,
  });
  const availableActions = getQueueActionList({
    isOriginatorAction: originatorAction,
    showReassignActions,
  });

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
            <HandoffSummary task={selectedTask} template={selectedTemplate} />
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
                      <span className="text-xs text-amber-100/70">
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
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm text-neutral-200"
                  title="Show reassign and delegate actions."
                >
                  <span className="min-w-0 font-medium">Reassign</span>
                  <input
                    type="checkbox"
                    aria-label="Show reassign options"
                    checked={reassignActionsExpanded}
                    onChange={(event) =>
                      setReassignActionsExpanded(event.target.checked)
                    }
                    className="size-4 shrink-0"
                  />
                </label>
                <label
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm text-neutral-200"
                  title="Ask another person for supporting input."
                >
                  <span className="min-w-0 font-medium">Contributor</span>
                  <input
                    type="checkbox"
                    aria-label="Show contributor request options"
                    checked={contributorRequestExpanded}
                    onChange={(event) =>
                      setContributorRequestExpanded(event.target.checked)
                    }
                    className="size-4 shrink-0"
                  />
                </label>
              </div>
            )}
            {(showReassignActions || showContributorRequest) && (
              <div className="mt-3 space-y-3">
                {showReassignActions && (
                  <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                    <p className="text-xs font-semibold text-neutral-300">
                      Reassign
                    </p>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-xs text-neutral-400">
                        Target email
                      </span>
                      <input
                        type="email"
                        list="queue-user-directory"
                        value={targetEmail}
                        onChange={(event) => setTargetEmail(event.target.value)}
                        placeholder="colleague@example.com"
                        className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                      <UserDirectoryDatalist id="queue-user-directory" users={userDirectory} />
                    </label>
                  </div>
                )}
                {showContributorRequest && (
                  <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                    <p className="text-xs font-semibold text-neutral-300">
                      Contributor
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-400">
                        Contributor name
                      </span>
                      <input
                        value={contributorName}
                        onChange={(event) => setContributorName(event.target.value)}
                        placeholder="Optional"
                        className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-400">
                        Contributor email
                      </span>
                      <input
                        type="email"
                        list="queue-user-directory"
                        value={contributorEmail}
                        onChange={(event) => setContributorEmail(event.target.value)}
                        placeholder="person@example.com"
                        className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                    </label>
                    </div>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-xs text-neutral-400">Due date</span>
                      <input
                        type="datetime-local"
                        value={contributorDueAt}
                        onChange={(event) => setContributorDueAt(event.target.value)}
                        className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                      />
                    </label>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-xs text-neutral-400">
                        Requested information
                      </span>
                      <textarea
                        value={contributorRequestNote}
                        onChange={(event) =>
                          setContributorRequestNote(event.target.value)
                        }
                        placeholder="Tell the contributor what documents or information are needed."
                        className="h-20 w-full resize-none rounded-md border border-white/10 bg-[#101214] p-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                    </label>
                    <label className="mt-2 flex items-start gap-2 text-xs text-neutral-300">
                      <input
                        type="checkbox"
                        checked={contributorBlocksApproval}
                        onChange={(event) =>
                          setContributorBlocksApproval(event.target.checked)
                        }
                        className="mt-0.5"
                      />
                      <span>
                        Block approval until this contributor submits the requested
                        information.
                      </span>
                    </label>
                    {contributorRequestError && (
                      <div className="mt-2 rounded-md border border-rose-400/30 bg-rose-400/10 p-2 text-xs text-rose-100">
                        {contributorRequestError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={onRequestContributor}
                      className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
                    >
                      <UserPlus size={15} />
                      Request input
                    </button>
                  </div>
                )}
              </div>
            )}
            {selectedTask.collaborationRequests?.length ? (
              <ContributorRequestList
                taskId={selectedTask.id}
                requests={selectedTask.collaborationRequests}
                activeUserEmail={activeUserEmail}
              />
            ) : null}
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
  onSubmitContributorUpload,
  onDecideSharedFulfillment,
  onSubmitCorrectionUpload,
}: {
  tasks: ApprovalTask[];
  selectedTaskId: string;
  setSelectedTaskId: (id: string) => void;
  workflowTemplates: WorkflowTemplate[];
  activeUserEmail: string;
  userDirectory: UserDirectoryEntry[];
  onSubmitContributorUpload: (input: {
    taskId: string;
    collaborationRequestId: string;
    requestNote: string;
    file: File;
  }) => void;
  onDecideSharedFulfillment: (input: {
    taskId: string;
    fulfillmentId: string;
    decision: "confirm" | "reject";
    note?: string;
  }) => void;
  onSubmitCorrectionUpload: (input: {
    taskId: string;
    correctionRequestId: string;
    file: File;
  }) => void;
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
                    className="mt-2 inline-flex min-h-11 items-center rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
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
              <HandoffSummary
                task={selectedTask}
                template={selectedTemplate}
                className="mt-3"
              />
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
              </div>
              {selectedTask.collaborationRequests?.length ? (
                <ContributorRequestList
                  taskId={selectedTask.id}
                  requests={selectedTask.collaborationRequests}
                  activeUserEmail={activeUserEmail}
                  onSubmitContributorUpload={onSubmitContributorUpload}
                />
              ) : null}
              <CollaborationStatusPanel
                task={selectedTask}
                template={selectedTemplate}
                activeUserEmail={activeUserEmail}
                onDecideSharedFulfillment={onDecideSharedFulfillment}
                onSubmitCorrectionUpload={onSubmitCorrectionUpload}
              />
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

function HandoffSummary({
  task,
  template,
  className = "",
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  className?: string;
}) {
  const handoff = buildTaskHandoffView({ task, template });

  return (
    <div
      className={`${className} rounded-md border border-white/10 bg-[#121518] p-3 text-sm`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">Handoff packet</h3>
          <p className="mt-1 break-words text-xs text-neutral-500">
            {handoff.nodeLabel} - {handoff.policyLabel}
          </p>
        </div>
        <span className="self-start rounded-md border border-white/10 bg-[#101214] px-2 py-1 text-xs text-neutral-300">
          {formatStatusText(handoff.layout)}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-xs font-semibold text-neutral-400">Values</p>
        {handoff.fields.length ? (
          handoff.fields.map((field) => (
            <div
              key={field.label}
              className="grid min-h-11 grid-cols-1 gap-1 rounded-md border border-white/10 bg-[#101214] px-3 py-2 text-sm sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3"
            >
              <span className="break-words text-neutral-400">{field.label}</span>
              <span className="min-w-0 break-words text-neutral-100">
                {field.value}
              </span>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs text-neutral-500">
            No values are available in this handoff.
          </p>
        )}
      </div>

      {handoff.processes.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-neutral-400">
            Checks and calculations
          </p>
          {handoff.processes.map((process) => (
            <div
              key={process.id}
              className={`rounded-md border p-2 text-xs ${
                process.tone === "pass"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : process.tone === "fail"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    : process.tone === "info"
                      ? "border-sky-400/30 bg-sky-400/10 text-sky-100"
                      : "border-white/10 bg-[#101214] text-neutral-300"
              }`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="break-words font-medium">{process.label}</p>
                <span className="self-start rounded-md border border-current/20 px-2 py-1">
                  {process.result}
                </span>
              </div>
              <p className="mt-1 break-words opacity-80">{process.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <p className="text-xs font-semibold text-neutral-400">Documents</p>
        {handoff.attachments.length ? (
          handoff.attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-neutral-200">
                    {attachment.fileName}
                  </p>
                  <p className="mt-1 break-words text-neutral-500">
                    {attachment.documentType}
                    {attachment.workflowNodeId
                      ? ` - used at ${attachment.workflowNodeId}`
                      : ""}
                  </p>
                </div>
                {attachment.publicUrl ? (
                  <a
                    href={attachment.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="self-start rounded-md border border-sky-400/40 bg-sky-400/12 px-2 py-1 text-sky-100 transition hover:bg-sky-400/20"
                  >
                    Open
                  </a>
                ) : null}
              </div>
              {attachment.storageLabel && (
                <p className="mt-1 break-words text-emerald-200">
                  {attachment.storageLabel}
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs text-neutral-500">
            No documents are available in this handoff.
          </p>
        )}
      </div>

      {handoff.hiddenFieldCount || handoff.hiddenAttachmentCount ? (
        <p className="mt-3 rounded-md border border-white/10 bg-[#101214] p-2 text-xs text-neutral-500">
          Hidden by handoff policy: {handoff.hiddenFieldCount} value(s),{" "}
          {handoff.hiddenAttachmentCount} document(s).
        </p>
      ) : null}
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
                <span className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-300">
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

function CollaborationStatusPanel({
  task,
  template,
  activeUserEmail,
  onDecideSharedFulfillment,
  onSubmitCorrectionUpload,
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  activeUserEmail: string;
  onDecideSharedFulfillment: (input: {
    taskId: string;
    fulfillmentId: string;
    decision: "confirm" | "reject";
    note?: string;
  }) => void;
  onSubmitCorrectionUpload: (input: {
    taskId: string;
    correctionRequestId: string;
    file: File;
  }) => void;
}) {
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const state = getCollaborationStatusPanelState({
    task,
    template,
    activeUserEmail,
  });
  const hasRows =
    state.requiredSubmissions.length ||
    state.pendingConfirmations.length ||
    state.corrections.length ||
    state.contributorRequests.length ||
    state.blockingReasons.length;

  if (!hasRows) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-neutral-300">
            Collaboration status
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Upstream submissions, confirmations, and corrections.
          </p>
        </div>
        {state.blockingReasons.length ? (
          <span className="self-start rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
            Blocking approval
          </span>
        ) : null}
      </div>
      {state.blockingReasons.length ? (
        <div className="mt-3 space-y-1 rounded-md border border-amber-400/25 bg-amber-400/10 p-2 text-xs text-amber-100">
          {state.blockingReasons.map((reason) => (
            <p key={reason} className="break-words">
              {reason}
            </p>
          ))}
        </div>
      ) : null}
      <StatusPanelGroup
        title="Required submissions"
        rows={state.requiredSubmissions}
      />
      <div className="mt-3 space-y-2">
        {state.pendingConfirmations.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-sky-400/25 bg-sky-400/10 p-2 text-xs"
          >
            <StatusPanelRow item={item} />
            {item.canAct ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    onDecideSharedFulfillment({
                      taskId: task.id,
                      fulfillmentId: item.id,
                      decision: "confirm",
                    })
                  }
                  className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-emerald-100 transition hover:bg-emerald-400/20"
                >
                  <Check size={14} />
                  Confirm
                </button>
                <div className="space-y-2">
                  <input
                    value={rejectionNotes[item.id] || ""}
                    onChange={(event) =>
                      setRejectionNotes((notes) => ({
                        ...notes,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Rejection note"
                    className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-rose-400/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onDecideSharedFulfillment({
                        taskId: task.id,
                        fulfillmentId: item.id,
                        decision: "reject",
                        note: rejectionNotes[item.id] || "",
                      })
                    }
                    className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-rose-100 transition hover:bg-rose-400/20"
                  >
                    <X size={14} />
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {state.corrections.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs"
          >
            <StatusPanelRow item={item} />
            {item.canAct ? (
              <label className="mt-2 flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-emerald-100 transition hover:bg-emerald-400/20">
                <Upload size={14} />
                Upload correction
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.txt,.md"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onSubmitCorrectionUpload({
                        taskId: task.id,
                        correctionRequestId: item.id,
                        file,
                      });
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>
        ))}
      </div>
      <StatusPanelGroup
        title="Contributor requests"
        rows={state.contributorRequests}
      />
    </div>
  );
}

function StatusPanelGroup({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    label: string;
    assignedEmail: string;
    actualActorEmail: string;
    status: string;
    detail: string;
    dueAt?: string;
  }>;
}) {
  if (!rows.length) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-neutral-400">{title}</p>
      {rows.map((item) => (
        <div
          key={item.id}
          className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs"
        >
          <StatusPanelRow item={item} />
        </div>
      ))}
    </div>
  );
}

function StatusPanelRow({
  item,
}: {
  item: {
    label: string;
    assignedEmail: string;
    actualActorEmail: string;
    status: string;
    detail: string;
    dueAt?: string;
  };
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="break-words font-medium text-neutral-200">{item.label}</p>
        <p className="mt-1 break-words text-neutral-500">
          Assigned {item.assignedEmail}
          {item.actualActorEmail && item.actualActorEmail !== item.assignedEmail
            ? ` - uploaded by ${item.actualActorEmail}`
            : ""}
        </p>
        {item.detail ? (
          <p className="mt-1 break-words text-neutral-400">{item.detail}</p>
        ) : null}
        {item.dueAt ? (
          <p className="mt-1 break-words text-neutral-500">Due {item.dueAt}</p>
        ) : null}
      </div>
      <span className="self-start rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300">
        {formatStatusText(item.status)}
      </span>
    </div>
  );
}

function formatStatusText(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ContributorRequestList({
  taskId,
  requests,
  activeUserEmail,
  onSubmitContributorUpload,
}: {
  taskId?: string;
  requests: TaskCollaborationRequest[];
  activeUserEmail?: string;
  onSubmitContributorUpload?: (input: {
    taskId: string;
    collaborationRequestId: string;
    requestNote: string;
    file: File;
  }) => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
      <p className="text-xs font-semibold text-neutral-300">
        Contributor requests
      </p>
      <div className="mt-2 space-y-2">
        {requests.map((request) => {
          const canSubmitUpload =
            taskId &&
            onSubmitContributorUpload &&
            request.status === "requested" &&
            request.contributorEmail === activeUserEmail;
          const extractedFieldEntries = Object.entries(
            request.extractedFields || {},
          );

          return (
            <div
              key={request.id}
              className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-medium text-neutral-200">
                    {request.contributorName || request.contributorEmail}
                  </p>
                  <p className="mt-1 break-words text-neutral-500">
                    {request.contributorEmail}
                  </p>
                </div>
                <span className="self-start rounded-md border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-sky-100">
                  {request.status}
                </span>
              </div>
              <p className="mt-2 break-words text-neutral-300">
                {request.requestNote}
              </p>
              <p className="mt-2 break-words text-neutral-500">
                Requested by {request.requestedByEmail}
                {request.dueAt ? ` - due ${request.dueAt}` : ""}
              </p>
              {request.blocksApproval !== false &&
              request.status === "requested" ? (
                <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-amber-100">
                  Blocks approval until submitted
                </p>
              ) : null}
              {request.submittedAt ? (
                <p className="mt-2 break-words text-emerald-200">
                  Submitted {request.submittedAt}
                </p>
              ) : null}
              {extractedFieldEntries.length ? (
                <div className="mt-2 space-y-1 rounded-md border border-white/10 bg-[#121518] p-2">
                  {extractedFieldEntries.map(([field, value]) => (
                    <div
                      key={field}
                      className="grid gap-1 sm:grid-cols-[120px_1fr]"
                    >
                      <span className="break-words text-neutral-500">
                        {field}
                      </span>
                      <span className="break-words text-neutral-200">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {canSubmitUpload ? (
                <label className="mt-2 flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-emerald-100 transition hover:bg-emerald-400/20">
                  <Upload size={14} />
                  Submit upload
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.txt,.md"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file && taskId && onSubmitContributorUpload) {
                        onSubmitContributorUpload({
                          taskId,
                          collaborationRequestId: request.id,
                          requestNote: request.requestNote,
                          file,
                        });
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
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
