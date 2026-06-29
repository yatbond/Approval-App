"use client";

import { Plus } from "lucide-react";
import { getWorkflowCanvasToolbarState } from "@/lib/workflow-canvas-toolbar-state";
import {
  workflowNodeOptions,
} from "@/lib/workflow-condition-context";
import type {
  WorkflowGraphNode,
  WorkflowNodeKind,
} from "@/lib/types";
import { InfoTip } from "./ui-hint";

export function WorkflowCanvasToolbar({
  connectFromNode,
  selectedNode,
  conditionOutcomeCaseId,
  onCreateNode,
  onCancelConnect,
  onDoneOutcomePick,
}: {
  connectFromNode?: WorkflowGraphNode | null;
  selectedNode?: WorkflowGraphNode | null;
  conditionOutcomeCaseId?: string | null;
  onCreateNode: (kind: WorkflowNodeKind) => void;
  onCancelConnect: () => void;
  onDoneOutcomePick: () => void;
}) {
  const { connectMessage, outcomeMessage } = getWorkflowCanvasToolbarState({
    connectFromNode,
    selectedNode,
    conditionOutcomeCaseId,
  });

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-300">Canvas</h3>
            <InfoTip label="Add boxes, connect paths, and select any box or line to edit it." />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {workflowNodeOptions.map((option) => (
            <button
              key={option.kind}
              type="button"
              onClick={() => onCreateNode(option.kind)}
              className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-200 transition hover:border-emerald-400/50"
            >
              <Plus size={13} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {connectMessage && (
        <div className="mb-3 flex flex-col gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-3 text-sm text-sky-100 sm:flex-row sm:items-center sm:justify-between">
          <span>{connectMessage}</span>
          <button
            type="button"
            onClick={onCancelConnect}
            className="self-start rounded-md border border-sky-300/40 px-3 py-1 text-xs transition hover:bg-sky-300/10 sm:self-auto"
          >
            Cancel
          </button>
        </div>
      )}

      {outcomeMessage && (
        <div className="mb-3 flex flex-col gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-3 text-sm text-sky-100 sm:flex-row sm:items-center sm:justify-between">
          <span>{outcomeMessage}</span>
          <button
            type="button"
            onClick={onDoneOutcomePick}
            className="self-start rounded-md border border-sky-300/40 px-3 py-1 text-xs transition hover:bg-sky-300/10 sm:self-auto"
          >
            Done
          </button>
        </div>
      )}
    </>
  );
}
