"use client";

import { AlertTriangle, ArrowRightLeft, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  getRuntimeActionItems,
  getRuntimeNextActionLabel,
  getRuntimeStatusLabel,
} from "@/lib/workflow-runtime-panel-state";
import type { WorkflowTestRequestResult } from "@/lib/workflow-test-request-state";
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
import { InfoTip } from "./ui-hint";

export function WorkflowRuntimePanel({
  runtimeTask,
  workflowSimulation,
  runtimeMissingDocuments,
  workflowUndoStack,
  workflowRedoStack,
  lastWorkflowEdit,
  onUndo,
  onRedo,
  onResetView,
  onRunWorkflowAction,
  onStartWorkflowTest,
}: {
  runtimeTask?: ApprovalTask;
  workflowSimulation: WorkflowRouteSimulation | null;
  runtimeMissingDocuments: WorkflowDocumentRequirement[];
  workflowUndoStack: WorkflowHistoryEntry[];
  workflowRedoStack: WorkflowHistoryEntry[];
  lastWorkflowEdit: string;
  onUndo: () => void;
  onRedo: () => void;
  onResetView: () => void;
  onRunWorkflowAction: (taskId: string, action: ApprovalAction) => void;
  onStartWorkflowTest: (testerEmail: string) => WorkflowTestRequestResult;
}) {
  const [testerEmail, setTesterEmail] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const validationErrors =
    workflowSimulation?.issues.filter((issue) => issue.severity === "error") || [];
  const validationWarnings =
    workflowSimulation?.issues.filter((issue) => issue.severity === "warning") || [];
  const runtimeActions = getRuntimeActionItems({
    runtimeTask,
    missingDocuments: runtimeMissingDocuments,
  });
  const nextAction = getRuntimeNextActionLabel(runtimeTask);

  function startWorkflowTest() {
    const result = onStartWorkflowTest(testerEmail);
    setTestMessage(result.message);
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 text-xs text-neutral-400 lg:flex-row lg:items-center lg:justify-between">
        <span>Canvas tools</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onUndo}
            disabled={!workflowUndoStack.length}
            title={
              workflowUndoStack.length
                ? `Undo ${workflowUndoStack.at(-1)?.label}. Keyboard: Ctrl+Z.`
                : "Nothing to undo."
            }
            className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#e6e6e6] bg-white px-2 text-xs text-neutral-200 transition hover:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#e6e6e6]"
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
                : "Nothing to redo."
            }
            className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#e6e6e6] bg-white px-2 text-xs text-neutral-200 transition hover:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#e6e6e6]"
          >
            <ArrowRightLeft size={13} />
            Redo
          </button>
          <button
            type="button"
            onClick={onResetView}
            className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#e6e6e6] bg-white px-2 text-xs text-neutral-200 transition hover:border-emerald-400/50"
          >
            <RotateCcw size={13} />
            Reset
          </button>
          <div className="flex flex-wrap gap-3">
            {lastWorkflowEdit && (
              <span className="flex min-w-0 items-center gap-1.5 break-words text-neutral-300">
                Last: {lastWorkflowEdit}
              </span>
            )}
          </div>
        </div>
      </div>

      {workflowSimulation && (
        <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-3">
          <div className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-300">
                Validation
              </h3>
              <span
                className={`rounded-md border px-2 py-1 text-xs ${
                  validationErrors.length
                    ? "validation-error"
                    : "validation-ready"
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
                        ? "validation-error"
                        : "validation-warning"
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                    <span>{issue.message}</span>
                  </div>
                ))
              ) : (
                <p className="text-neutral-400">
                  Ready.
                </p>
              )}
              {workflowSimulation.issues.length > 4 && (
                <p className="text-neutral-500">
                  +{workflowSimulation.issues.length - 4} more issue(s)
                </p>
              )}
              {!validationErrors.length && validationWarnings.length > 0 && (
                <p className="validation-warning rounded-md border p-2">
                  {validationWarnings.length} warning(s) should be reviewed.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-300">
                Route
              </h3>
              <span className="rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-400">
                Saved
              </span>
            </div>
            <div className="mt-3 space-y-2 text-xs text-neutral-400">
              <p>
                First task:{" "}
                <span className="text-neutral-100">
                  {workflowSimulation.currentNode
                    ? workflowSimulation.currentNode.assigneeEmail?.trim()
                      ? `${workflowSimulation.currentNode.label} (${workflowSimulation.currentNode.assigneeEmail})`
                      : `${workflowSimulation.currentNode.label} (assigned when request starts)`
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

          <div className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 xl:col-span-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-neutral-300">
                Test this workflow
              </h3>
              <InfoTip label="Creates a separate test request from this draft. It does not change a live request." />
            </div>
            <p className="mt-1 max-w-3xl text-xs text-neutral-500">
              Enter an Approval App user&apos;s email. That person will receive a test
              request with the workflow, current position, latest decision, and next
              action. Every workflow role is assigned to the tester, so no real
              participant is contacted.
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs text-neutral-400">
                  Tester email
                </span>
                <input
                  type="email"
                  value={testerEmail}
                  onChange={(event) => setTesterEmail(event.target.value)}
                  placeholder="tester@company.com"
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm text-neutral-200 outline-none focus:border-orange-400"
                />
              </label>
              <button
                type="button"
                onClick={startWorkflowTest}
                disabled={validationErrors.length > 0}
                title={
                  validationErrors.length
                    ? "Resolve validation errors before starting a test."
                    : "Create a new routing test and email the tester."
                }
                className="min-h-10 rounded-md border border-orange-400 bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {runtimeTask ? "Start new test" : "Start test"}
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              The tester must be able to sign in to Approval App with this email.
            </p>
            {testMessage && (
              <p className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-2 text-xs text-orange-900">
                {testMessage}
              </p>
            )}

            {runtimeTask && (
              <div className="mt-4 border-t border-[#e6e6e6] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-neutral-300">
                      Active test request
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {getRuntimeStatusLabel(runtimeTask)}
                    </p>
                  </div>
                  <span className="rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-900">
                    Test only
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 text-xs">
                  <div className="rounded-md border border-[#e6e6e6] bg-white p-2">
                    <p className="text-neutral-500">Status</p>
                    <p className="mt-1 break-words capitalize text-neutral-200">
                      {runtimeTask.status}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#e6e6e6] bg-white p-2">
                    <p className="text-neutral-500">Current position</p>
                    <p className="mt-1 break-words text-neutral-200">
                      {runtimeTask.currentStep}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#e6e6e6] bg-white p-2">
                    <p className="text-neutral-500">Tester</p>
                    <p className="mt-1 break-words text-neutral-200">
                      {runtimeTask.requesterEmail}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#e6e6e6] bg-white p-2">
                    <p className="text-neutral-500">Latest update</p>
                    <p className="mt-1 break-words text-neutral-200">
                      {runtimeTask.auditTrail.at(-1)?.detail || runtimeTask.lastAction}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-xs text-orange-950">
                  <span className="font-semibold">Next action: </span>
                  {nextAction}
                </div>

                {runtimeActions.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {runtimeActions.map((item) => (
                      <button
                        key={item.action}
                        type="button"
                        disabled={item.disabled}
                        title={item.title}
                        onClick={() => onRunWorkflowAction(runtimeTask.id, item.action)}
                        className="min-h-10 rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-neutral-200 transition hover:border-orange-400 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-neutral-500">
                    This test is finished. Start a new test to run the workflow again.
                  </p>
                )}
              </div>
            )}
            {runtimeMissingDocuments.length > 0 && (
              <p className="mt-3 rounded-md border border-[#e6e6e6] bg-white p-2 text-xs text-neutral-500">
                Document requirements are not enforced in this routing test:{" "}
                {runtimeMissingDocuments
                  .map((document) => document.documentType)
                  .join(", ")}. Test uploads and AI parsing from New request.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
