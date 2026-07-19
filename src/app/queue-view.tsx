"use client";

import { useState, type ElementType } from "react";
import {
  ArrowRightLeft,
  Check,
  MessageSquare,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import {
  acceptForDocumentFormat,
  formatDocumentFormat,
} from "@/lib/workflow-documents";
import { findTemplateForTask } from "@/lib/task-display";
import { getPendingReassignmentRequest } from "@/lib/approval-state";
import {
  getQueueActionList,
  getQueueActionModeToggleState,
  shouldShowQueueContributorRequest,
  shouldShowQueueReassignActions,
  type QueueActionMode,
} from "@/lib/queue-advanced-actions-state";
import {
  filterQueueTasks,
  getQueueFilterCounts,
  queueFilters,
  type QueueFilter,
} from "@/lib/queue-filter-state";
import { findRequestDisplayValue } from "@/lib/request-builder";
import type { CurrentNodeFormCompletionIssue } from "@/lib/current-node-form-state";
import type { CurrentNodeDocumentFieldIssue } from "@/lib/current-node-document-state";
import { getRejectReturnTargetOptions } from "@/lib/reject-return-routing-state";
import type {
  ApprovalAction,
  ApprovalTask,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import { InfoTip } from "./ui-hint";
import { CurrentNodeFormsPanel } from "./current-node-forms-panel";
import { CurrentNodeDocumentDataPanel } from "./current-node-document-data-panel";
import {
  AuditTrail,
  ContributorRequestList,
  HandoffSummary,
  StatusBadge,
  UserDirectoryDatalist,
} from "./task-detail-panels";
const actionConfig: Record<
  ApprovalAction,
  { label: string; icon: ElementType; tone: string }
> = {
  approve: {
    label: "Approve",
    icon: Check,
    tone: "border-[#f7941d] bg-[#f7941d] text-[#231f20] hover:bg-[#e78310]",
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
  actionPending,
  missingCurrentDocuments,
  currentForms,
  currentFormIssues,
  currentUploadRequirements,
  currentDocumentFieldIssues,
  onSaveTaskFormValues,
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
  actionPending: boolean;
  missingCurrentDocuments: WorkflowDocumentRequirement[];
  currentForms: WorkflowDocumentRequirement[];
  currentFormIssues: CurrentNodeFormCompletionIssue[];
  currentUploadRequirements: WorkflowDocumentRequirement[];
  currentDocumentFieldIssues: CurrentNodeDocumentFieldIssue[];
  onSaveTaskFormValues: (values: Record<string, string>) => void;
  onAttachTaskDocument: (
    file: File,
    documentRequirement: WorkflowDocumentRequirement,
  ) => void;
}) {
  const [queueActionMode, setQueueActionMode] =
    useState<QueueActionMode>("normal");
  const [contributorRequestExpanded, setContributorRequestExpanded] = useState(false);
  const [rejectReturnTargetId, setRejectReturnTargetId] = useState("originator");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const filteredTasks = filterQueueTasks({
    tasks,
    filter: queueFilter,
    activeUserEmail,
  });
  const queueFilterCounts = getQueueFilterCounts({ tasks, activeUserEmail });

  if (!selectedTask) {
    return (
      <section className="rounded-md border border-[#e6e6e6] bg-white p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Inbox is empty</h2>
          <InfoTip label="Nothing is waiting for your action. Use Tracking to follow requests you submitted, approved, reassigned, or delegated." />
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
  const selectedTaskDisplayValue =
    selectedTask.value === "Pending extraction"
      ? findRequestDisplayValue(selectedTask.extractedFields || {})
      : selectedTask.value;
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
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[360px_minmax(0,1fr)_320px]">
      <section className="rounded-md border border-[#e6e6e6] bg-white">
        <div className="border-b border-[#e6e6e6] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Inbox</h2>
              <InfoTip label="Work currently waiting for your action." />
            </div>
            <span className="text-xs text-neutral-500">
              {filteredTasks.length} of {tasks.length}
            </span>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Inbox filters">
            {queueFilters.map((filter) => {
              const count = queueFilterCounts[filter.id];
              const isActive = queueFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  title={filter.description}
                  disabled={filter.id !== "all" && count === 0}
                  onClick={() => {
                    setQueueFilter(filter.id);
                    const nextTasks = filterQueueTasks({
                      tasks,
                      filter: filter.id,
                      activeUserEmail,
                    });
                    if (
                      nextTasks.length &&
                      !nextTasks.some((task) => task.id === selectedTaskId)
                    ) {
                      setSelectedTaskId(nextTasks[0].id);
                    }
                  }}
                  className={`flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    isActive
                      ? "border-[#f7941d] bg-[#fff4e5] text-[#9b5200]"
                      : "border-[#e6e6e6] bg-white text-neutral-400 hover:border-[#d2d2d2]"
                  }`}
                >
                  {filter.label}
                  <span className="rounded-md bg-[#f2f2f2] px-1.5 py-0.5 text-[11px] text-neutral-500">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="divide-y divide-white/10">
          {filteredTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              className={`block w-full p-4 text-left transition ${
                selectedTaskId === task.id
                  ? "bg-emerald-400/10"
                  : "hover:bg-[#f7f7f5]"
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
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 text-xs text-neutral-400">
                <span className="min-w-0 break-words">
                  <span className="text-neutral-500">Step: </span>
                  {task.currentStep}
                </span>
                <span className="text-right">
                  <span className="text-neutral-500">Due: </span>
                  {task.due}
                </span>
              </div>
            </button>
          ))}
          {!filteredTasks.length && (
            <div className="p-5 text-center text-sm text-neutral-500">
              No work matches this filter.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-[#e6e6e6] bg-white">
        <div className="border-b border-[#e6e6e6] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">{selectedTask.title}</h2>
              <p className="text-sm text-neutral-400">
                {selectedTask.workflow} - requested by {selectedTask.requester}
              </p>
            </div>
            <div className="rounded-md border border-[#e6e6e6] px-3 py-2 text-sm">
              {selectedTaskDisplayValue}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <HandoffSummary task={selectedTask} template={selectedTemplate} />
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">Act</h3>
            <CurrentNodeFormsPanel
              key={`${selectedTask.id}:${selectedTask.currentNodeId || "none"}:${selectedTask.lastAction}`}
              task={selectedTask}
              forms={currentForms}
              issues={currentFormIssues}
              onSave={onSaveTaskFormValues}
              onAttach={onAttachTaskDocument}
            />
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Comment"
              className="mt-3 h-32 w-full resize-none rounded-md border border-[#e6e6e6] bg-white p-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
            {missingCurrentDocuments.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                <p className="font-medium">Required</p>
                <div className="mt-2 space-y-2">
                  {missingCurrentDocuments.map((document) => (
                    <label
                      key={document.id}
                      title="Upload this document before approving the current box."
                      className="flex cursor-pointer flex-col gap-2 rounded-md border border-amber-300/20 bg-white p-2 transition hover:border-amber-300/50"
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
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <CurrentNodeDocumentDataPanel
              key={`${selectedTask.id}:${selectedTask.currentNodeId || "none"}:${selectedTask.lastAction}:document-data`}
              task={selectedTask}
              documents={currentUploadRequirements}
              onSave={onSaveTaskFormValues}
            />
            {actionError && (
              <div className="mt-3 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
                {actionError}
              </div>
            )}
            {!originatorAction && !pendingReassignmentRequest && (
              <details className="mt-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3">
                <summary
                  className="cursor-pointer text-sm font-medium text-neutral-200"
                  title="Open secondary collaboration and ownership actions."
                >
                  More actions
                </summary>
                <p className="mt-2 text-xs text-neutral-500">
                  Reassign ownership, delegate this task, or request supporting input.
                </p>
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-2">
                <label
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-neutral-200"
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
                        : "justify-start border-[#e6e6e6] bg-[#f2f2f2] text-neutral-500"
                    }`}
                  >
                    <span className="size-4 rounded-full bg-current" />
                  </span>
                </label>
                <label
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-neutral-200"
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
                        : "justify-start border-[#e6e6e6] bg-[#f2f2f2] text-neutral-500"
                    }`}
                  >
                    <span className="size-4 rounded-full bg-current" />
                  </span>
                </label>
                <label
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-neutral-200"
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
                        : "justify-start border-[#e6e6e6] bg-[#f2f2f2] text-neutral-500"
                    }`}
                  >
                    <span className="size-4 rounded-full bg-current" />
                  </span>
                </label>
              </div>
              </details>
            )}
            {pendingReassignmentRequest && (
              <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                <p className="font-medium">Reassignment request</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {pendingReassignmentRequest.fromEmail} asked you to take ownership.
                  Accept to transfer the task to your inbox, or decline to leave it with the current owner.
                </p>
              </div>
            )}
            {(showReassignActions || showContributorRequest) && (
              <div className="mt-3 space-y-3">
                {showReassignActions && (
                  <div className="rounded-md border border-[#e6e6e6] bg-white p-3">
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
                        className="h-10 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                      <UserDirectoryDatalist id="queue-user-directory" users={userDirectory} />
                    </label>
                  </div>
                )}
                {showContributorRequest && (
                  <div className="rounded-md border border-[#e6e6e6] bg-white p-3">
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
                        className="h-10 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
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
                        className="h-10 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                    </label>
                    </div>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-xs text-neutral-400">Due</span>
                      <input
                        type="datetime-local"
                        value={contributorDueAt}
                        onChange={(event) => setContributorDueAt(event.target.value)}
                        className="h-10 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none transition focus:border-emerald-400/60"
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
                        className="h-20 w-full resize-none rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
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
              <details className="mt-3 rounded-md border border-[#e6e6e6] bg-white p-3">
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
                    className="h-10 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none focus:border-emerald-400/60"
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
                const needsCurrentForms =
                  (action === "approve" || action === "approve_with_comment") &&
                  currentFormIssues.length > 0;
                const needsCurrentDocumentFields =
                  (action === "approve" || action === "approve_with_comment") &&
                  currentDocumentFieldIssues.length > 0;
                const disabled =
                  actionPending ||
                  (needsTarget && !targetEmail.trim()) ||
                  needsCurrentDocuments ||
                  needsCurrentForms ||
                  needsCurrentDocumentFields;
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
                    <span className="min-w-0 break-words">
                      {actionPending ? "Saving..." : actionConfig[action].label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-[#e6e6e6] bg-white">
        <details className="xl:hidden">
          <summary
            className="cursor-pointer p-4 font-semibold"
            title="Open the complete history for this request."
          >
            History ({selectedTask.auditTrail.length})
          </summary>
          <div className="border-t border-[#e6e6e6]">
            <AuditTrail task={selectedTask} />
          </div>
        </details>
        <div className="hidden xl:block">
          <div className="border-b border-[#e6e6e6] p-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">History</h2>
              <InfoTip label="Everyone involved can track this request's history." />
            </div>
          </div>
          <AuditTrail task={selectedTask} />
        </div>
      </section>
    </div>
  );
}
