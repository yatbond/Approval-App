"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronUp,
  RotateCcw,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { createWorkflowGraphFromTemplate } from "@/lib/workflow-graph";
import { formatNodeKind } from "@/lib/workflow-condition-context";
import {
  buildWorkflowPathStages,
  formatPathNodeState,
  getPathNodeHistoryEvents,
  getPathNodeProgressTone,
  getPathNodeState,
} from "@/lib/task-display";
import { buildTaskHandoffView } from "@/lib/task-handoff-view";
import { getTrackingHandoffPanelState } from "@/lib/tracking-handoff-panel-state";
import { getCollaborationStatusPanelState } from "@/lib/collaboration-status-panel-state";
import type {
  ApprovalTask,
  TaskCollaborationRequest,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import { InfoTip } from "./ui-hint";
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
      className={`${className} rounded-md border border-[#e6e6e6] bg-white p-3 text-sm`}
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
          <span className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 py-1 text-xs text-neutral-300">
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
                : "border-[#e6e6e6] bg-[#f7f7f5] text-neutral-300 hover:bg-[#f7f7f5]"
            }`}
          >
            <span
              className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition ${
                panelState.isVisible
                  ? "justify-end border-emerald-400/40 bg-emerald-400/20"
                  : "justify-start border-[#e6e6e6] bg-[#f2f2f2]"
              }`}
            >
              <span className="size-3 rounded-full bg-current" />
            </span>
            {panelState.toggleLabel}
          </button>
        </div>
      </div>

      {panelState.isVisible ? (
        <div className="mt-3 border-t border-[#e6e6e6] pt-3">
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
    <>
      <details
        className={`${className} rounded-md border border-[#e6e6e6] bg-white text-sm md:hidden`}
      >
        <summary
          className="cursor-pointer p-3 font-semibold text-neutral-200"
          title={`${handoff.nodeLabel} - ${handoff.policyLabel}`}
        >
          Request information ({handoff.fields.length} values, {handoff.attachments.length} documents)
        </summary>
        <div className="border-t border-[#e6e6e6] p-3">
          <HandoffDetailSections handoff={handoff} />
        </div>
      </details>
      <div
        className={`${className} hidden rounded-md border border-[#e6e6e6] bg-white p-3 text-sm md:block`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-neutral-200">
                Request information
              </h3>
              <InfoTip label={`${handoff.nodeLabel} - ${handoff.policyLabel}`} />
            </div>
          </div>
          <span className="self-start rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 py-1 text-xs text-neutral-300">
            {formatStatusText(handoff.layout)}
          </span>
        </div>
        <HandoffDetailSections handoff={handoff} />
      </div>
    </>
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
              className="grid min-h-11 grid-cols-1 gap-1 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 py-2 text-sm sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3"
            >
              <span className="break-words text-neutral-400">{field.label}</span>
              <span className="min-w-0 break-words text-neutral-100">
                {field.value}
              </span>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs text-neutral-500">
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
                      : "border-[#e6e6e6] bg-[#f7f7f5] text-neutral-300"
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
              className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs"
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
          <p className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs text-neutral-500">
            No documents.
          </p>
        )}
      </div>

      {handoff.hiddenFieldCount || handoff.hiddenAttachmentCount ? (
        <p className="mt-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs text-neutral-500">
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
            className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 py-1 text-xs text-neutral-300"
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
  onCollapse,
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  onCollapse: () => void;
}) {
  const stages = template
    ? buildWorkflowPathStages(createWorkflowGraphFromTemplate(template))
    : [];
  const firstPathNodeId = stages[0]?.nodes[0]?.id;
  const workflowNodes = stages.flatMap((stage) => stage.nodes);

  return (
    <div id="tracking-path-history" className="scroll-mt-4 border-t border-[#e6e6e6] p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-300">History</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Each workflow box shows its status and related history.
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Hide workflow history"
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-md border border-[#d2d2d2] bg-white px-3 py-2 text-sm font-medium text-neutral-200 transition hover:border-[#f7941d] hover:bg-[#fff4e5]"
        >
          <ChevronUp size={16} />
          Hide history
        </button>
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
                    ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-3"
                    : "grid gap-2"
                }
              >
                {stage.nodes.map((node) => (
                  <PathStageCard
                    key={node.id}
                    task={task}
                    node={node}
                    isFirstPathNode={node.id === firstPathNodeId}
                    workflowNodes={workflowNodes}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-[#e6e6e6] bg-white p-3 text-sm text-neutral-500">
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
  workflowNodes,
}: {
  task: ApprovalTask;
  node: ReturnType<typeof buildWorkflowPathStages>[number]["nodes"][number];
  isFirstPathNode: boolean;
  workflowNodes: WorkflowGraphNode[];
}) {
  const state = getPathNodeState(task, node);
  const tone = getPathNodeProgressTone(state);
  const historyEvents = getPathNodeHistoryEvents(task, node, {
    isFirstPathNode,
    workflowNodes,
  });
  const toneClassName =
    tone === "current"
      ? "border-yellow-400/45 bg-yellow-400/10"
      : tone === "done"
        ? "border-sky-400/35 bg-sky-400/10"
        : tone === "rejected"
          ? "border-rose-400/35 bg-rose-400/10"
          : "border-[#e6e6e6] bg-white opacity-75";
  const badgeClassName =
    tone === "current"
      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
      : tone === "done"
        ? "border-sky-400/30 bg-sky-400/10 text-sky-100"
        : tone === "rejected"
          ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
          : "border-[#e6e6e6] bg-[#f2f2f2] text-neutral-500";

  return (
    <div
      className={`min-w-0 rounded-md border p-3 ${toneClassName}`}
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
        <span className="row-span-2 flex h-7 min-w-7 shrink-0 items-center justify-center self-start rounded-md border border-[#e6e6e6] bg-[#f2f2f2] px-2 text-xs font-semibold text-neutral-200">
          {node.pathLabel}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-100">
            {node.label}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{formatNodeKind(node.kind)}</p>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-xs ${badgeClassName}`}>
          {formatPathNodeState(state)}
        </span>
      </div>
      {node.assigneeEmail && (
        <p className="mt-3 [overflow-wrap:anywhere] text-xs text-neutral-400 sm:pl-10">
          {node.assigneeEmail}
        </p>
      )}
      {node.documentIds?.length ? (
        <p className="mt-2 text-xs text-neutral-500 sm:pl-10">
          {node.documentIds.length} document requirement(s)
        </p>
      ) : null}
      <div className="mt-3 min-w-0 border-t border-[#e6e6e6] pt-3 sm:pl-10">
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
  onSubmitSharedFulfillmentUpload,
  onDecideSharedFulfillment,
  onSubmitCorrectionUpload,
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  activeUserEmail: string;
  onSubmitSharedFulfillmentUpload: (input: {
    taskId: string;
    requirementNodeId: string;
    documentId: string;
    assignedSubmitterEmail: string;
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
    <div className="mt-3 rounded-md border border-[#e6e6e6] bg-white p-3 text-sm">
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
      <div className="mt-2 space-y-2">
        {state.requiredSubmissions
          .filter(
            (item) => item.canAct && item.requirementNodeId && item.documentId,
          )
          .map((item) => (
            <label
              key={`shared-upload-${item.id}`}
              className="flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs text-sky-100 transition hover:bg-sky-400/20"
            >
              <Upload size={14} />
              Fulfill {item.label} for {item.assignedEmail}
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.txt,.md"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && item.requirementNodeId && item.documentId) {
                    onSubmitSharedFulfillmentUpload({
                      taskId: task.id,
                      requirementNodeId: item.requirementNodeId,
                      documentId: item.documentId,
                      assignedSubmitterEmail: item.assignedEmail,
                      file,
                    });
                  }
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ))}
      </div>
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
                    className="h-9 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-xs outline-none focus:border-rose-400/60"
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
            className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs"
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
          className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs"
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
      <span className="self-start rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-300">
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
    <div className="mt-3 rounded-md border border-[#e6e6e6] bg-white p-3 text-sm">
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
              className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs"
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
                <div className="mt-2 space-y-1 rounded-md border border-[#e6e6e6] bg-white p-2">
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
      <span className="flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs text-sky-100">
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
export {
  AuditTrail,
  CollaborationStatusPanel,
  ContributorRequestList,
  HandoffSummary,
  HandoffVisibilityPanel,
  StatusBadge,
  TaskPathAndHistory,
};
