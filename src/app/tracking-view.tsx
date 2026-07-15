"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { findTemplateForTask, formatTaskAccessRole } from "@/lib/task-display";
import type { ApprovalTask, WorkflowTemplate } from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import { InfoTip } from "./ui-hint";
import {
  CollaborationStatusPanel,
  ContributorRequestList,
  HandoffVisibilityPanel,
  StatusBadge,
  TaskPathAndHistory,
} from "./task-detail-panels";
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
  const [expandedHistoryTaskId, setExpandedHistoryTaskId] = useState("");
  const historyExpanded = expandedHistoryTaskId === selectedTask?.id;

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <section className="rounded-md border border-[#e6e6e6] bg-white">
        <div className="border-b border-[#e6e6e6] p-4">
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
              onClick={() => {
                setExpandedHistoryTaskId("");
                setSelectedTaskId(task.id);
              }}
              className={`block w-full p-4 text-left transition ${
                selectedTask?.id === task.id ? "bg-emerald-400/10" : "hover:bg-[#f7f7f5]"
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

      <section className="rounded-md border border-[#e6e6e6] bg-white">
        {selectedTask ? (
          <>
            <div className="border-b border-[#e6e6e6] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-semibold">{selectedTask.title}</h2>
                  <p className="text-sm text-neutral-400">
                    {selectedTask.workflow} - requested by {selectedTask.requester}
                  </p>
                  <button
                    type="button"
                    aria-controls="tracking-path-history"
                    aria-expanded={historyExpanded}
                    title={historyExpanded ? "Hide workflow history" : "View workflow history"}
                    onClick={() =>
                      setExpandedHistoryTaskId(historyExpanded ? "" : selectedTask.id)
                    }
                    className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#d2d2d2] bg-white px-3 py-2 text-sm font-medium text-neutral-200 transition hover:border-[#f7941d] hover:bg-[#fff4e5]"
                  >
                    {historyExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {historyExpanded ? "Hide history" : "View history"}
                  </button>
                </div>
                <StatusBadge status={selectedTask.status} />
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border border-[#e6e6e6] bg-white p-3">
                  <p className="text-xs text-neutral-500">Owner</p>
                  <p className="mt-1 break-words text-neutral-200">
                    {selectedTask.currentOwner || "Closed"}
                  </p>
                </div>
                <div className="rounded-md border border-[#e6e6e6] bg-white p-3">
                  <p className="text-xs text-neutral-500">Step</p>
                  <p className="mt-1 break-words text-neutral-200">{selectedTask.currentStep}</p>
                </div>
                <div className="rounded-md border border-[#e6e6e6] bg-white p-3">
                  <p className="text-xs text-neutral-500">Last</p>
                  <p className="mt-1 break-words text-neutral-200">{selectedTask.lastAction}</p>
                </div>
              </div>
              {selectedTask.pendingOwners?.length ? (
                <div className="mt-3 rounded-md border border-[#e6e6e6] bg-white p-3 text-sm">
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
            {historyExpanded ? (
              <TaskPathAndHistory
                task={selectedTask}
                template={selectedTemplate}
                onCollapse={() => setExpandedHistoryTaskId("")}
              />
            ) : null}
          </>
        ) : (
          <div className="p-5 text-sm text-neutral-400">No tracked requests.</div>
        )}
      </section>
    </div>
  );
}
