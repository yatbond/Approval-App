"use client";

import { ArrowRight } from "lucide-react";
import type { buildRequestWorkflowMapState } from "@/lib/request-workflow-map-state";
import { InfoTip } from "./ui-hint";

type RequestWorkflowMapState = ReturnType<typeof buildRequestWorkflowMapState>;

export function RequestWorkflowMiniMap({
  activeNodeId,
  map,
  onSelectNode,
}: {
  activeNodeId: string;
  map: RequestWorkflowMapState;
  onSelectNode: (nodeId: string) => void;
}) {
  const activeNode = map.stages
    .flatMap((stage) => stage.nodes)
    .find((node) => node.id === activeNodeId);

  return (
    <section className="sticky top-2 z-20 min-w-0 rounded-md border border-[#e6e6e6] bg-white/95 p-3 shadow-sm backdrop-blur xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Workflow map</h2>
            <InfoTip label="The highlighted box changes as you enter participant, document, and request information." />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Current box:{" "}
            <span className="font-medium text-[#713d00]">
              {activeNode?.label || "Request"}
            </span>
          </p>
        </div>
        <span className="rounded-md border border-[#f7941d]/40 bg-[#fff4e6] px-2 py-1 text-[11px] font-semibold text-[#713d00]">
          You are here
        </span>
      </div>
      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2">
          {map.stages.map((stage, stageIndex) => (
            <div key={stage.stageNumber} className="flex items-center gap-2">
              {stageIndex > 0 && (
                <ArrowRight size={16} className="shrink-0 text-[#8a8a8a]" />
              )}
              <div className="flex max-w-[14rem] flex-col gap-1.5">
                {stage.nodes.map((node) => {
                  const active = node.id === activeNodeId;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      title={`Show ${node.label}`}
                      onClick={() => onSelectNode(node.id)}
                      className={`min-h-11 min-w-36 rounded-md border px-3 py-2 text-left transition ${
                        active
                          ? "border-[#f7941d] bg-[#fff4e6] text-[#231f20] shadow-sm"
                          : "border-[#e6e6e6] bg-white text-[#666162] hover:border-[#f7941d]/60"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase text-[#8a8a8a]">
                        {node.pathLabel} · {node.kind}
                      </span>
                      <span className="mt-0.5 block max-w-48 break-words text-xs font-semibold">
                        {node.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
