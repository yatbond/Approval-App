"use client";

import { AlertTriangle, ArrowRightLeft, RotateCcw } from "lucide-react";
import {
  getRuntimeActionItems,
  getRuntimeStatusLabel,
} from "@/lib/workflow-runtime-panel-state";
import type {
  ApprovalAction,
  ApprovalTask,
  WorkflowDocumentRequirement,
} from "@/lib/types";
import type {
  WorkflowHistoryEntry,
} from "@/lib/workflow-history";
import type {
  WorkflowRouteSimulation,
} from "@/lib/workflow-graph";

export function WorkflowRuntimePanel({
  workflowTasks,
  runtimeTask,
  workflowSimulation,
  runtimeMissingDocuments,
  selectedRuntimeTaskId,
  onSelectRuntimeTask,
  workflowUndoStack,
  workflowRedoStack,
  lastWorkflowEdit,
  onUndo,
  onRedo,
  onResetView,
  onRunWorkflowAction,
}: {
  workflowTasks: ApprovalTask[];
  runtimeTask?: ApprovalTask;
  workflowSimulation: WorkflowRouteSimulation | null;
  runtimeMissingDocuments: WorkflowDocumentRequirement[];
  selectedRuntimeTaskId: string;
  onSelectRuntimeTask: (taskId: string) => void;
  workflowUndoStack: WorkflowHistoryEntry[];
  workflowRedoStack: WorkflowHistoryEntry[];
  lastWorkflowEdit: string;
  onUndo: () => void;
  onRedo: () => void;
  onResetView: () => void;
  onRunWorkflowAction: (taskId: string, action: ApprovalAction) => void;
}) {
  const validationErrors =
    workflowSimulation?.issues.filter((issue) => issue.severity === "error") || [];
  const validationWarnings =
    workflowSimulation?.issues.filter((issue) => issue.severity === "warning") || [];
  const runtimeActions = getRuntimeActionItems({
    runtimeTask,
    missingDocuments: runtimeMissingDocuments,
  });

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-md border border-white/10 bg-[#101214] p-3 text-xs text-neutral-400 lg:flex-row lg:items-center lg:justify-between">
        <span>Runtime status: {getRuntimeStatusLabel(runtimeTask)}</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {workflowTasks.length > 0 && (
            <select
              value={runtimeTask?.id || selectedRuntimeTaskId}
              onChange={(event) => onSelectRuntimeTask(event.target.value)}
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
            onClick={onUndo}
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
            onClick={onRedo}
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
            onClick={onResetView}
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
                  Simulate the selected request through this template using the same
                  routing engine as the approval queue.
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
                  {runtimeActions.map((item) => (
                    <button
                      key={item.action}
                      type="button"
                      disabled={item.disabled}
                      title={item.title}
                      onClick={() => onRunWorkflowAction(runtimeTask.id, item.action)}
                      className="min-h-9 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-xs text-neutral-200 transition hover:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {item.label}
                    </button>
                  ))}
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
    </>
  );
}
