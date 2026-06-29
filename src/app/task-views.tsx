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
  buildWorkflowPathStages,
  findTemplateForTask,
  formatPathNodeState,
  formatTaskAccessRole,
  getPathNodeHistoryEvents,
  getPathNodeProgressTone,
  getPathNodeState,
} from "@/lib/task-display";
import { buildTaskHandoffView } from "@/lib/task-handoff-view";
import {
  getPendingReassignmentRequest,
} from "@/lib/approval-state";
import {
  getQueueActionList,
  getQueueActionModeToggleState,
  shouldShowQueueContributorRequest,
  shouldShowQueueReassignActions,
  type QueueActionMode,
} from "@/lib/queue-advanced-actions-state";
import { getRejectReturnTargetOptions } from "@/lib/reject-return-routing-state";
import { getTrackingHandoffPanelState } from "@/lib/tracking-handoff-panel-state";
import { getCollaborationStatusPanelState } from "@/lib/collaboration-status-panel-state";
import type {
  ApprovalAction,
  ApprovalTask,
  TaskCollaborationRequest,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import { InfoTip } from "./ui-hint";

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
    label: "Approve + note",
    icon: MessageSquare,
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20",
  },
  reject: {
    label: "Reject",
    icon: X,
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
  },
  reject_with_comment: {
    label: "Reject + note",
    icon: X,
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
  },
  reassign: {
    label: "Reassign",
    icon: ArrowRightLeft,
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  },
  accept_reassignment: {
    label: "Accept reassignment",
    icon: Check,
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
  },
  decline_reassignment: {
    label: "Decline reassignment",
    icon: X,
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
  },
  delegate: {
    label: "Delegate",
    icon: UserPlus,
    tone: "border-violet-500/40 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
  },
  amend_resubmit: {
    label: "Resubmit",
    icon: Send,
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20",
  },
  cancel: {
    label: "Cancel",
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
  recordAction: (action: ApprovalAction, returnTargetNodeIds?: string[]) => void;
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
  const [queueActionMode, setQueueActionMode] =
    useState<QueueActionMode>("normal");
  const [contributorRequestExpanded, setContributorRequestExpanded] = useState(false);
  const [rejectReturnTargetId, setRejectReturnTargetId] = useState("originator");

  if (!selectedTask) {
    return (
      <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Empty</h2>
          <InfoTip label="Use Tracking to follow requests you submitted, approved, reassigned, or delegated." />
        </div>
      </section>
    );
  }

  const originatorAction = selectedTask.status === "returned" && selectedTask.currentOwner === activeUserEmail;
  const selectedTemplate = findTemplateForTask(selectedTask, workflowTemplates);
  const pendingReassignmentRequest = getPendingReassignmentRequest(
    selectedTask,
    activeUserEmail,
  );
  const showReassignActions = shouldShowQueueReassignActions({
    isOriginatorAction: originatorAction,
    isExpanded: queueActionMode === "reassign" || queueActionMode === "delegate",
  });
  const showContributorRequest = shouldShowQueueContributorRequest({
    isOriginatorAction: originatorAction,
    isExpanded: contributorRequestExpanded,
  });
  const availableActions = getQueueActionList({
    isOriginatorAction: originatorAction,
    hasPendingReassignmentRequest: Boolean(pendingReassignmentRequest),
    showReassignActions,
    actionMode: queueActionMode,
  });
  const rejectReturnTargetOptions = getRejectReturnTargetOptions({
    task: selectedTask,
    template: selectedTemplate,
  });
  const selectedRejectReturnTarget =
    rejectReturnTargetOptions.find((option) => option.id === rejectReturnTargetId) ||
    rejectReturnTargetOptions[0];
  const actionModeCopy = {
    reassign: {
      title: "Reassign request",
      targetLabel: "Proposed owner email",
      description:
        "Transfer ownership only after the proposed owner accepts. Until then, you remain responsible.",
    },
    delegate: {
      title: "Delegate task",
      targetLabel: "Delegate email",
      description:
        "Let another person act on this task while you remain the owner and can keep tracking it.",
    },
  }[queueActionMode === "normal" ? "reassign" : queueActionMode];

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr_320px]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Queue</h2>
            <InfoTip label="Pending, overdue, and escalated work." />
          </div>
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
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">Act</h3>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Comment"
              className="h-32 w-full resize-none rounded-md border border-white/10 bg-[#121518] p-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
            {missingCurrentDocuments.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                <p className="font-medium">Required</p>
                <div className="mt-2 space-y-2">
                  {missingCurrentDocuments.map((document) => (
                    <label
                      key={document.id}
                      title="Upload this document before approving the current box."
                      className="flex cursor-pointer flex-col gap-2 rounded-md border border-amber-300/20 bg-[#121518] p-2 transition hover:border-amber-300/50"
                    >
                      <span className="text-xs">
                        {document.documentType} - {formatDocumentFormat(document.format)}
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
            {!originatorAction && !pendingReassignmentRequest && (
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-2">
                <label
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm text-neutral-200"
                  title="Ask another person to become the task owner. Ownership changes only after they accept."
                >
                  <span className="min-w-0 flex-1 break-words font-medium leading-tight">
                    Reassign
                  </span>
                  <input
                    type="checkbox"
                    aria-label="Show reassign options"
                    checked={queueActionMode === "reassign"}
                    onChange={(event) => {
                      const nextState = getQueueActionModeToggleState({
                        currentMode: queueActionMode,
                        toggledMode: "reassign",
                        checked: event.target.checked,
                      });
                      setQueueActionMode(nextState.actionMode);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-300 ${
                      queueActionMode === "reassign"
                        ? "justify-end border-amber-400/40 bg-amber-400/20 text-amber-100"
                        : "justify-start border-white/10 bg-black/20 text-neutral-500"
                    }`}
                  >
                    <span className="size-4 rounded-full bg-current" />
                  </span>
                </label>
                <label
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm text-neutral-200"
                  title="Let another person act while you remain the owner and keep visibility."
                >
                  <span className="min-w-0 flex-1 break-words font-medium leading-tight">
                    Delegate
                  </span>
                  <input
                    type="checkbox"
                    aria-label="Show delegate options"
                    checked={queueActionMode === "delegate"}
                    onChange={(event) => {
                      const nextState = getQueueActionModeToggleState({
                        currentMode: queueActionMode,
                        toggledMode: "delegate",
                        checked: event.target.checked,
                      });
                      setQueueActionMode(nextState.actionMode);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-300 ${
                      queueActionMode === "delegate"
                        ? "justify-end border-violet-400/40 bg-violet-400/20 text-violet-100"
                        : "justify-start border-white/10 bg-black/20 text-neutral-500"
                    }`}
                  >
                    <span className="size-4 rounded-full bg-current" />
                  </span>
                </label>
                <label
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm text-neutral-200"
                  title="Ask another person for supporting input."
                >
                  <span className="min-w-0 flex-1 break-words font-medium leading-tight">
                    Additional contributor
                  </span>
                  <input
                    type="checkbox"
                    aria-label="Show additional contributor request options"
                    checked={contributorRequestExpanded}
                    onChange={(event) =>
                      setContributorRequestExpanded(event.target.checked)
                    }
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-300 ${
                      contributorRequestExpanded
                        ? "justify-end border-sky-400/40 bg-sky-400/20 text-sky-100"
                        : "justify-start border-white/10 bg-black/20 text-neutral-500"
                    }`}
                  >
                    <span className="size-4 rounded-full bg-current" />
                  </span>
                </label>
              </div>
            )}
            {pendingReassignmentRequest && (
              <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                <p className="font-medium">Reassignment request</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {pendingReassignmentRequest.fromEmail} asked you to take ownership.
                  Accept to transfer the task to your queue, or decline to leave it with the current owner.
                </p>
              </div>
            )}
            {(showReassignActions || showContributorRequest) && (
              <div className="mt-3 space-y-3">
                {showReassignActions && (
                  <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                    <p className="text-xs font-semibold text-neutral-300">
                      {actionModeCopy.title}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {actionModeCopy.description}
                    </p>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-xs text-neutral-400">
                        {actionModeCopy.targetLabel}
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
                      <span className="mb-1 block text-xs text-neutral-400">Due</span>
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
                        placeholder="Needed docs/info"
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
                        Block until submitted.
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
            {!originatorAction && !pendingReassignmentRequest && rejectReturnTargetOptions.length > 1 && (
              <details className="mt-3 rounded-md border border-white/10 bg-[#121518] p-3">
                <summary className="cursor-pointer text-sm font-medium text-neutral-200">
                  Return to...
                </summary>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-neutral-400">
                    Reject return target
                  </span>
                  <select
                    value={selectedRejectReturnTarget?.id || "originator"}
                    onChange={(event) => setRejectReturnTargetId(event.target.value)}
                    className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                  >
                    {rejectReturnTargetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedRejectReturnTarget?.description && (
                  <p className="mt-2 text-xs text-neutral-500">
                    {selectedRejectReturnTarget.description}
                  </p>
                )}
              </details>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {availableActions.map((action) => {
                const Icon = actionConfig[action].icon;
                const needsTarget = action === "reassign" || action === "delegate";
                const isRejectAction =
                  action === "reject" || action === "reject_with_comment";
                const needsCurrentDocuments =
                  (action === "approve" || action === "approve_with_comment") &&
                  missingCurrentDocuments.length > 0;
                const disabled = (needsTarget && !targetEmail.trim()) || needsCurrentDocuments;
                return (
                  <button
                    key={action}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      recordAction(
                        action,
                        isRejectAction
                          ? selectedRejectReturnTarget?.nodeIds || []
                          : [],
                      )
                    }
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
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Audit</h2>
            <InfoTip label="Everyone involved can track this item." />
          </div>
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
  const [handoffPanelExpanded, setHandoffPanelExpanded] = useState(false);

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Tracking</h2>
            <InfoTip label="Requests you submitted, approved, reassigned, delegated, or received." />
          </div>
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
                    Open detail
                  </Link>
                </div>
                <StatusBadge status={selectedTask.status} />
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                  <p className="text-xs text-neutral-500">Owner</p>
                  <p className="mt-1 break-words text-neutral-200">
                    {selectedTask.currentOwner || "Closed"}
                  </p>
                </div>
                <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                  <p className="text-xs text-neutral-500">Step</p>
                  <p className="mt-1 break-words text-neutral-200">{selectedTask.currentStep}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-[#121518] p-3">
                  <p className="text-xs text-neutral-500">Last</p>
                  <p className="mt-1 break-words text-neutral-200">{selectedTask.lastAction}</p>
                </div>
              </div>
              {selectedTask.pendingOwners?.length ? (
                <div className="mt-3 rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
                  <p className="text-xs text-neutral-500">Pending</p>
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
              <HandoffVisibilityPanel
                task={selectedTask}
                template={selectedTemplate}
                userByEmail={userByEmail}
                isExpanded={handoffPanelExpanded}
                onToggle={() => setHandoffPanelExpanded((isExpanded) => !isExpanded)}
                className="mt-3"
              />
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
            <TaskPathAndHistory task={selectedTask} template={selectedTemplate} />
          </>
        ) : (
          <div className="p-5 text-sm text-neutral-400">No tracked requests.</div>
        )}
      </section>
    </div>
  );
}

function HandoffVisibilityPanel({
  task,
  template,
  userByEmail,
  isExpanded,
  onToggle,
  className = "",
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  userByEmail: Map<string, UserDirectoryEntry>;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const handoff = buildTaskHandoffView({ task, template });
  const panelState = getTrackingHandoffPanelState({
    isExpanded,
    participantCount: task.participants.length,
    hiddenFieldCount: handoff.hiddenFieldCount,
    hiddenAttachmentCount: handoff.hiddenAttachmentCount,
  });

  return (
    <div
      className={`${className} rounded-md border border-white/10 bg-[#121518] p-3 text-sm`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-200">
              Handoff & visibility
            </h3>
            <InfoTip label={`${handoff.nodeLabel} - ${handoff.policyLabel}`} />
          </div>
          <p className="mt-1 break-words text-xs text-neutral-500">
            {panelState.summary}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="rounded-md border border-white/10 bg-[#101214] px-2 py-1 text-xs text-neutral-300">
            {formatStatusText(handoff.layout)}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={panelState.isVisible}
            aria-label={panelState.ariaLabel}
            onClick={onToggle}
            className={`flex min-h-9 items-center gap-2 rounded-md border px-2 py-1 text-xs transition ${
              panelState.isVisible
                ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                : "border-white/10 bg-[#101214] text-neutral-300 hover:bg-white/[0.04]"
            }`}
          >
            <span
              className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition ${
                panelState.isVisible
                  ? "justify-end border-emerald-400/40 bg-emerald-400/20"
                  : "justify-start border-white/10 bg-black/20"
              }`}
            >
              <span className="size-3 rounded-full bg-current" />
            </span>
            {panelState.toggleLabel}
          </button>
        </div>
      </div>

      {panelState.isVisible ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <VisibilityChips task={task} userByEmail={userByEmail} />
          <HandoffDetailSections handoff={handoff} />
        </div>
      ) : null}
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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-200">Handoff</h3>
            <InfoTip label={`${handoff.nodeLabel} - ${handoff.policyLabel}`} />
          </div>
        </div>
        <span className="self-start rounded-md border border-white/10 bg-[#101214] px-2 py-1 text-xs text-neutral-300">
          {formatStatusText(handoff.layout)}
        </span>
      </div>
      <HandoffDetailSections handoff={handoff} />
    </div>
  );
}

function HandoffDetailSections({
  handoff,
}: {
  handoff: ReturnType<typeof buildTaskHandoffView>;
}) {
  return (
    <>
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
            No values.
          </p>
        )}
      </div>

      {handoff.processes.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-neutral-400">
            Checks
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
            No documents.
          </p>
        )}
      </div>

      {handoff.hiddenFieldCount || handoff.hiddenAttachmentCount ? (
        <p className="mt-3 rounded-md border border-white/10 bg-[#101214] p-2 text-xs text-neutral-500">
          Hidden: {handoff.hiddenFieldCount} value(s),{" "}
          {handoff.hiddenAttachmentCount} document(s).
        </p>
      ) : null}
    </>
  );
}

function VisibilityChips({
  task,
  userByEmail,
}: {
  task: ApprovalTask;
  userByEmail: Map<string, UserDirectoryEntry>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-neutral-400">Visible to</p>
      <div className="flex flex-wrap gap-2">
        {task.participants.map((participant) => (
          <span
            key={participant}
            className="rounded-md border border-white/10 bg-[#101214] px-2 py-1 text-xs text-neutral-300"
          >
            {participant}
            {userByEmail.get(participant)?.role
              ? ` - ${userByEmail.get(participant)?.role}`
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function TaskPathAndHistory({
  task,
  template,
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
}) {
  const stages = template
    ? buildWorkflowPathStages(createWorkflowGraphFromTemplate(template))
    : [];
  const firstPathNodeId = stages[0]?.nodes[0]?.id;

  return (
    <div className="border-t border-white/10 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-neutral-300">Path and history</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Each box shows its workflow status and related history.
        </p>
      </div>

      {stages.length ? (
        <div className="space-y-4">
          {stages.map((stage) => (
            <div key={stage.stageNumber} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold uppercase tracking-wide text-neutral-400">
                  Step {stage.stageNumber}
                </span>
                {stage.isParallel && (
                  <span className="rounded border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-sky-100">
                    Parallel
                  </span>
                )}
              </div>
              <div
                className={
                  stage.isParallel
                    ? "grid gap-2 md:grid-cols-2 xl:grid-cols-3"
                    : "grid gap-2"
                }
              >
                {stage.nodes.map((node) => (
                  <PathStageCard
                    key={node.id}
                    task={task}
                    node={node}
                    isFirstPathNode={node.id === firstPathNodeId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-white/10 bg-[#121518] p-3 text-sm text-neutral-500">
          No workflow path.
        </p>
      )}
    </div>
  );
}

function PathStageCard({
  task,
  node,
  isFirstPathNode,
}: {
  task: ApprovalTask;
  node: ReturnType<typeof buildWorkflowPathStages>[number]["nodes"][number];
  isFirstPathNode: boolean;
}) {
  const state = getPathNodeState(task, node);
  const tone = getPathNodeProgressTone(state);
  const historyEvents = getPathNodeHistoryEvents(task, node, { isFirstPathNode });
  const toneClassName =
    tone === "current"
      ? "border-yellow-400/45 bg-yellow-400/10"
      : tone === "done"
        ? "border-emerald-400/35 bg-emerald-400/10"
        : tone === "rejected"
          ? "border-rose-400/35 bg-rose-400/10"
          : "border-white/10 bg-[#121518] opacity-75";
  const badgeClassName =
    tone === "current"
      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
      : tone === "done"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : tone === "rejected"
          ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
          : "border-white/10 bg-black/15 text-neutral-500";

  return (
    <div
      className={`rounded-md border p-3 ${toneClassName}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 px-2 text-xs font-semibold text-neutral-200">
            {node.pathLabel}
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-neutral-100">
              {node.label}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{formatNodeKind(node.kind)}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 text-xs ${badgeClassName}`}>
          {formatPathNodeState(state)}
        </span>
      </div>
      {node.assigneeEmail && (
        <p className="mt-2 break-words pl-10 text-xs text-neutral-400">
          {node.assigneeEmail}
        </p>
      )}
      {node.documentIds?.length ? (
        <p className="mt-2 pl-10 text-xs text-neutral-500">
          {node.documentIds.length} document requirement(s)
        </p>
      ) : null}
      <div className="mt-3 border-t border-white/10 pt-3 pl-10">
        <p className="text-xs font-semibold text-neutral-500">History</p>
        {historyEvents.length ? (
          <ol className="mt-2 space-y-2">
            {historyEvents.map((event) => (
              <li key={event.id} className="text-xs">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  <span className="font-medium text-neutral-300">{event.actor}</span>
                  <span className="text-neutral-600">{event.timestamp}</span>
                </div>
                <p className="mt-1 break-words text-neutral-400">{event.detail}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-neutral-600">No history for this step yet.</p>
        )}
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
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-neutral-300">Collab</p>
          <InfoTip label="Upstream submissions, confirmations, and corrections." />
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
        title="Required"
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
        title="Contributors"
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
        Contributors
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
                  Blocks approval.
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

function AuditTrail({ task, padded = true }: { task: ApprovalTask; padded?: boolean }) {
  return (
    <ol className={`space-y-3 ${padded ? "p-4" : ""}`}>
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
