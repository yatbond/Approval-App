"use client";

import { Plus, X } from "lucide-react";
import {
  describeConditionCase,
  getConditionDisplayName,
  getConditionNickname,
  getConditionRoutingState,
} from "@/lib/condition-routing-state";
import {
  formatNodeKind,
  getConditionContext,
} from "@/lib/workflow-condition-context";
import {
  analyzeConditionCoverage,
  updateWorkflowConditionCase,
} from "@/lib/workflow-graph";
import type {
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowRuleOperator,
} from "@/lib/types";

const ruleOperatorOptions: { value: WorkflowRuleOperator; label: string }[] = [
  { value: ">", label: "is greater than" },
  { value: ">=", label: "is greater than or equal to" },
  { value: "=", label: "equals" },
  { value: "<", label: "is less than" },
  { value: "<=", label: "is less than or equal to" },
];

export function ConditionBoxDetails({
  context,
  graph,
  conditionNode,
  coverage,
  activeOutcomeCaseId,
  onAddCase,
  onAddFallbackCase,
  onDeleteCase,
  onUpdateCase,
  onStartOutcomePick,
}: {
  context: ReturnType<typeof getConditionContext>;
  graph: WorkflowGraph;
  conditionNode: WorkflowGraphNode;
  coverage?: ReturnType<typeof analyzeConditionCoverage>;
  activeOutcomeCaseId?: string | null;
  onAddCase: () => void;
  onAddFallbackCase: () => void;
  onDeleteCase: (caseId: string) => void;
  onUpdateCase: (
    caseId: string,
    patch: Parameters<typeof updateWorkflowConditionCase>[3],
  ) => void;
  onStartOutcomePick: (caseId: string) => void;
}) {
  const { availableTargets, conditionCases } = getConditionRoutingState({
    graph,
    conditionNode,
  });

  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3">
      <p className="text-xs font-semibold text-amber-100">Condition rules</p>
      <p className="mt-1 text-[11px] text-amber-100/80">
        Build each rule as: if this approval or numeric result is true, route to these
        outcome boxes.
      </p>
      <div className="mt-3 space-y-3">
        <div className="rounded-md border border-white/10 bg-[#101214] p-2">
          <p className="text-[11px] font-semibold text-neutral-400">
            Upstream approvals
          </p>
          {context.upstreamNodes.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {context.upstreamNodes.map((node) => (
                <span
                  key={node.id}
                  className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-300"
                >
                  {node.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              No approval/review boxes connect into this condition.
            </p>
          )}
        </div>

        <div className="rounded-md border border-white/10 bg-[#101214] p-2">
          <p className="text-[11px] font-semibold text-neutral-400">
            Downstream outcome boxes
          </p>
          {context.downstreamNodes.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {context.downstreamNodes.map(({ edge, node }) => (
                <span
                  key={`${edge.id}-${node.id}`}
                  className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-300"
                >
                  {node.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              Connect this condition to outcome boxes before assigning routes.
            </p>
          )}
        </div>

        <div className="rounded-md border border-white/10 bg-[#101214] p-2">
          <p className="text-[11px] font-semibold text-neutral-400">
            Parsed numeric values
          </p>
          {context.numericFields.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {context.numericFields.map((field) => (
                <span
                  key={field.name}
                  className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-xs text-neutral-300"
                >
                  {field.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              No numeric fields are available upstream.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-semibold text-neutral-400">
              Conditions
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAddCase}
                title="Add one condition. Inside it, choose specific reviewers, approval count, numeric values, or a combination."
                className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-2 text-xs text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={12} />
                Add condition
              </button>
              <button
                type="button"
                onClick={onAddFallbackCase}
                title="Add a catch-all outcome for requests that do not match any condition above."
                className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 transition hover:bg-sky-400/20"
              >
                <Plus size={12} />
                Add fallback outcome
              </button>
            </div>
          </div>

          {coverage && (
            <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
              Missing paths for {coverage.missingApprovalCounts.join(", ")} approved upstream
              box(es). Add condition(s) for those cases or add a fallback outcome.
            </div>
          )}

          {conditionCases.length ? (
            conditionCases.map((conditionCase) => (
              <div
                key={conditionCase.id}
                className="space-y-2 rounded-md border border-white/10 bg-[#101214] p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      title="Condition names are assigned automatically so the list stays easy to count."
                      className="flex h-8 w-full items-center rounded-md border border-white/10 bg-[#121518] px-2 text-xs font-semibold text-neutral-200"
                    >
                      {getConditionDisplayName(conditionCases, conditionCase)}
                      {getConditionNickname(conditionCase)
                        ? ` - ${getConditionNickname(conditionCase)}`
                        : ""}
                    </div>
                    {!conditionCase.isFallback && (
                      <input
                        value={getConditionNickname(conditionCase)}
                        title="Optional nickname. The condition number remains automatic."
                        onChange={(event) =>
                          onUpdateCase(conditionCase.id, {
                            name:
                              event.target.value ||
                              getConditionDisplayName(conditionCases, conditionCase),
                          })
                        }
                        placeholder="Nickname (optional)"
                        className="mt-2 h-8 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                      />
                    )}
                    <p className="text-[11px] text-neutral-500">
                      {conditionCase.isFallback
                        ? "Catches every request not matched above"
                        : `Outcome: ${conditionCase.targetNodeIds.length} box(es)`}
                    </p>
                    <p className="mt-1 break-words text-[11px] text-neutral-400">
                      {describeConditionCase({ conditionCase, context })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteCase(conditionCase.id)}
                    title="Delete this condition and its outcome mapping."
                    className="flex size-7 shrink-0 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                  >
                    <X size={13} />
                  </button>
                </div>

                {!conditionCase.isFallback && context.upstreamNodes.length > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-neutral-400">
                      Approval rule
                    </span>
                    <select
                      value={
                        conditionCase.approvalRule
                          ? conditionCase.isApprovalCount
                            ? "count"
                            : "specific"
                          : "none"
                      }
                      title="Choose whether this condition checks named reviewers, an approval count, or no approval result."
                      onChange={(event) => {
                        const selectedValue = event.target.value;
                        if (selectedValue === "none") {
                          onUpdateCase(conditionCase.id, {
                            isApprovalCount: false,
                            approvalRule: undefined,
                          });
                          return;
                        }

                        if (selectedValue === "count") {
                          const upstreamNodeIds = context.upstreamNodes.map(
                            (node) => node.id,
                          );
                          onUpdateCase(conditionCase.id, {
                            isApprovalCount: true,
                            approvalRule: {
                              upstreamNodeIds,
                              minimumApproved: Math.min(
                                conditionCase.approvalRule?.minimumApproved || 1,
                                upstreamNodeIds.length,
                              ),
                              mode: conditionCase.approvalRule?.mode || "at_least",
                            },
                          });
                          return;
                        }

                        const upstreamNodeIds =
                          conditionCase.approvalRule?.upstreamNodeIds.length
                            ? conditionCase.approvalRule.upstreamNodeIds
                            : context.upstreamNodes.slice(0, 1).map((node) => node.id);
                        onUpdateCase(conditionCase.id, {
                          isApprovalCount: false,
                          approvalRule: {
                            upstreamNodeIds,
                            minimumApproved: upstreamNodeIds.length,
                            mode: "at_least",
                          },
                        });
                      }}
                      className="h-9 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                    >
                      <option value="none">Do not check approvals</option>
                      <option value="specific">Named reviewers approved</option>
                      <option value="count">Approval count</option>
                    </select>
                  </label>
                )}

                {!conditionCase.isFallback &&
                  conditionCase.approvalRule &&
                  context.upstreamNodes.length > 0 && (
                  <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                    {conditionCase.isApprovalCount ? (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-[11px] font-semibold text-neutral-400">
                            Count approvals from
                          </p>
                          <div className="space-y-1">
                            {context.upstreamNodes.map((node) => {
                              const selectedNodeIds =
                                conditionCase.approvalRule?.upstreamNodeIds || [];
                              const checked = selectedNodeIds.includes(node.id);
                              return (
                                <label
                                  key={node.id}
                                  className="flex items-center gap-2 text-xs text-neutral-300"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    title="Include this upstream approval or review box in the count."
                                    onChange={(event) => {
                                      const nextNodeIds = event.target.checked
                                        ? [...selectedNodeIds, node.id]
                                        : selectedNodeIds.filter(
                                            (nodeId) => nodeId !== node.id,
                                          );
                                      const nextMinimum = Math.min(
                                        Math.max(
                                          conditionCase.approvalRule?.minimumApproved || 1,
                                          1,
                                        ),
                                        Math.max(nextNodeIds.length, 1),
                                      );
                                      onUpdateCase(conditionCase.id, {
                                        approvalRule: nextNodeIds.length
                                          ? {
                                              upstreamNodeIds: nextNodeIds,
                                              minimumApproved: nextMinimum,
                                              mode:
                                                conditionCase.approvalRule?.mode ||
                                                "at_least",
                                            }
                                          : undefined,
                                      });
                                    }}
                                  />
                                  <span>{node.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_120px_1fr]">
                          <select
                            value={conditionCase.approvalRule?.mode || "at_least"}
                            title="Choose whether the approval count is a minimum threshold or an exact number."
                            onChange={(event) =>
                              onUpdateCase(conditionCase.id, {
                                approvalRule: {
                                  upstreamNodeIds:
                                    conditionCase.approvalRule?.upstreamNodeIds ||
                                    context.upstreamNodes.map((node) => node.id),
                                  minimumApproved:
                                    conditionCase.approvalRule?.minimumApproved || 1,
                                  mode: event.target.value as "at_least" | "exactly",
                                },
                              })
                            }
                            className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                          >
                            <option value="at_least">At least</option>
                            <option value="exactly">Exactly</option>
                          </select>
                          <input
                            type="number"
                            title="Number of selected upstream boxes that must approve for this condition to match."
                            min={1}
                            max={
                              conditionCase.approvalRule?.upstreamNodeIds.length ||
                              context.upstreamNodes.length
                            }
                            value={conditionCase.approvalRule?.minimumApproved || 1}
                            onChange={(event) => {
                              const selectedNodeIds =
                                conditionCase.approvalRule?.upstreamNodeIds ||
                                context.upstreamNodes.map((node) => node.id);
                              const maxCount = Math.max(selectedNodeIds.length, 1);
                              const nextMinimum = Math.min(
                                Math.max(Number(event.target.value) || 1, 1),
                                maxCount,
                              );
                              onUpdateCase(conditionCase.id, {
                                approvalRule: {
                                  upstreamNodeIds: selectedNodeIds,
                                  minimumApproved: nextMinimum,
                                  mode: conditionCase.approvalRule?.mode || "at_least",
                                },
                              });
                            }}
                            className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                          />
                          <div className="flex min-h-9 items-center rounded-md border border-white/10 bg-[#101214] px-2 text-xs text-neutral-300">
                            approved reviewer(s)
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mb-2 text-[11px] font-semibold text-neutral-400">
                          Required approvals
                        </p>
                        <div className="space-y-1">
                          {context.upstreamNodes.map((node) => {
                            const selectedNodeIds =
                              conditionCase.approvalRule?.upstreamNodeIds || [];
                            const checked = selectedNodeIds.includes(node.id);
                            return (
                              <label
                                key={node.id}
                                className="flex items-center gap-2 text-xs text-neutral-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  title="Require this specific upstream box to be approved."
                                  onChange={(event) => {
                                    const nextNodeIds = event.target.checked
                                      ? [...selectedNodeIds, node.id]
                                      : selectedNodeIds.filter(
                                          (nodeId) => nodeId !== node.id,
                                        );
                                    onUpdateCase(conditionCase.id, {
                                      approvalRule: nextNodeIds.length
                                        ? {
                                            upstreamNodeIds: nextNodeIds,
                                            minimumApproved: nextNodeIds.length,
                                            mode: "at_least",
                                          }
                                        : undefined,
                                    });
                                  }}
                                />
                                <span>{node.label} approved</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[11px] text-neutral-500">
                          Select multiple boxes when all selected reviewers must approve.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {!conditionCase.isFallback && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-neutral-400">
                    Numeric rule
                  </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select
                    value={conditionCase.numericRule?.field || ""}
                    title="Optional extracted numeric field to evaluate, such as invoice amount or quantity."
                    onChange={(event) =>
                      onUpdateCase(conditionCase.id, {
                        numericRule: event.target.value
                          ? {
                              field: event.target.value,
                              operator: conditionCase.numericRule?.operator || ">=",
                              value: conditionCase.numericRule?.value || "",
                            }
                          : undefined,
                      })
                    }
                    className="h-9 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    <option value="">Numeric field</option>
                    {context.numericFields.map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={conditionCase.numericRule?.operator || ">="}
                    title="Comparison to apply against the extracted numeric value."
                    onChange={(event) =>
                      onUpdateCase(conditionCase.id, {
                        numericRule: {
                          field:
                            conditionCase.numericRule?.field ||
                            context.numericFields[0]?.name ||
                            "",
                          operator: event.target.value as WorkflowRuleOperator,
                          value: conditionCase.numericRule?.value || "",
                        },
                      })
                    }
                    className="h-9 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {ruleOperatorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value}
                      </option>
                    ))}
                  </select>
                  <input
                    value={conditionCase.numericRule?.value || ""}
                    title="Numeric threshold used by this condition."
                    onChange={(event) =>
                      onUpdateCase(conditionCase.id, {
                        numericRule: {
                          field:
                            conditionCase.numericRule?.field ||
                            context.numericFields[0]?.name ||
                            "",
                          operator: conditionCase.numericRule?.operator || ">=",
                          value: event.target.value,
                        },
                      })
                    }
                    inputMode="decimal"
                    placeholder="Value"
                    className="h-9 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                  />
                </div>
                </div>
                )}

                {!conditionCase.isFallback && conditionCase.approvalRule && conditionCase.numericRule && (
                <select
                  value={conditionCase.join}
                  title="Choose how approval and numeric checks combine when both are configured."
                  onChange={(event) =>
                    onUpdateCase(conditionCase.id, {
                      join: event.target.value as "and" | "or",
                    })
                  }
                  className="h-9 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none focus:border-emerald-400/60"
                >
                  <option value="and">Approval and numeric rules must both match</option>
                  <option value="or">Either approval or numeric rule can match</option>
                </select>
                )}

                {conditionCase.isFallback && (
                  <div className="rounded-md border border-sky-400/30 bg-sky-400/10 p-2 text-xs text-sky-100">
                    This outcome is used only when none of the conditions above match.
                  </div>
                )}

                <div className="rounded-md border border-white/10 bg-[#121518] p-2">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] font-semibold text-neutral-400">
                      Then route to
                    </p>
                    <button
                      type="button"
                      onClick={() => onStartOutcomePick(conditionCase.id)}
                      title="Choose which downstream boxes this condition routes to. You can click boxes on the canvas or use the checkboxes below."
                      className={`min-h-7 rounded-md border px-2 text-xs transition ${
                        activeOutcomeCaseId === conditionCase.id
                          ? "border-sky-300/50 bg-sky-400/20 text-sky-100"
                          : "border-sky-400/40 bg-sky-400/12 text-sky-100 hover:bg-sky-400/20"
                      }`}
                    >
                      Pick on canvas
                    </button>
                  </div>
                  {conditionCase.targetNodeIds.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {conditionCase.targetNodeIds.map((targetNodeId) => {
                        const targetNode = graph.nodes.find(
                          (node) => node.id === targetNodeId,
                        );
                        return (
                          <span
                            key={targetNodeId}
                            className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100"
                          >
                            {targetNode?.label || targetNodeId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    {availableTargets.map((node) => (
                      <label
                        key={node.id}
                        className="flex items-center gap-2 text-xs text-neutral-300"
                      >
                        <input
                          type="checkbox"
                          checked={conditionCase.targetNodeIds.includes(node.id)}
                          title="Route matching requests to this downstream box."
                          onChange={(event) => {
                            const nextTargets = event.target.checked
                              ? [...conditionCase.targetNodeIds, node.id]
                              : conditionCase.targetNodeIds.filter(
                                  (targetId) => targetId !== node.id,
                                );
                            onUpdateCase(conditionCase.id, {
                              targetNodeIds: nextTargets,
                            });
                          }}
                        />
                        <span className="min-w-0 break-words">
                          {node.label} ({formatNodeKind(node.kind)})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs text-neutral-500">
              Add a condition, then select the upstream approvals and optional numeric
              value that should route to an outcome.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

