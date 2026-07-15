"use client";

import { Plus, X } from "lucide-react";
import { toggleWorkflowHandoffFieldName } from "@/lib/workflow-handoff-fields-state";
import type { WorkflowHandoffDocumentOption } from "@/lib/workflow-handoff-document-options-state";
import type { WorkflowHandoffProcessPatch } from "@/lib/workflow-handoff-process-state";
import type {
  WorkflowGraphNode,
  WorkflowHandoffCalculation,
  WorkflowHandoffProcess,
  WorkflowRuleOperator,
} from "@/lib/types";

const fieldVisibilityOptions = [
  { value: "all", label: "All values" },
  { value: "selected", label: "Selected values" },
  { value: "hidden", label: "Hide selected" },
] as const;

const documentVisibilityOptions = [
  { value: "all", label: "All documents" },
  { value: "selected", label: "Selected documents" },
  { value: "none", label: "No documents" },
] as const;

const layoutOptions = [
  { value: "standard", label: "Standard" },
  { value: "compact", label: "Compact" },
  { value: "comparison", label: "Compare" },
] as const;

const comparisonOperators: WorkflowRuleOperator[] = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "contains",
];

const processTypeOptions = [
  { value: "comparison", label: "Compare" },
  { value: "calculation", label: "Calculate" },
] as const;

const calculationOptions = [
  { value: "difference", label: "Difference" },
  { value: "percentage_difference", label: "% difference" },
] as const;

type HandoffViewPatch = Partial<
  NonNullable<WorkflowGraphNode["handoffView"]>
>;

export function WorkflowHandoffEditor({
  node,
  fieldNames,
  documentOptions,
  onUpdateView,
  onAddProcess,
  onUpdateProcess,
  onRemoveProcess,
}: {
  node: WorkflowGraphNode;
  fieldNames: string[];
  documentOptions: WorkflowHandoffDocumentOption[];
  onUpdateView: (patch: HandoffViewPatch) => void;
  onAddProcess: () => void;
  onUpdateProcess: (
    processId: string,
    patch: WorkflowHandoffProcessPatch,
  ) => void;
  onRemoveProcess: (processId: string) => void;
}) {
  const fieldVisibility = node.handoffView?.fieldVisibility;
  const documentVisibility = node.handoffView?.documentVisibility;
  const selectedDocumentIds =
    documentVisibility?.mode === "required_for_node"
      ? node.documentIds || []
      : documentVisibility?.documentIds || [];

  return (
    <details className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3">
      <summary
        className="cursor-pointer text-xs font-semibold text-neutral-300"
        title="Choose which values and documents the next participant receives. The default passes everything."
      >
        Information sharing (advanced)
      </summary>
      <div className="mt-3 space-y-3">
        <p className="mt-2 rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
          Preview only. Actual access follows server permissions.
        </p>
        <datalist id="workflow-handoff-field-names">
          {fieldNames.map((fieldName) => (
            <option key={fieldName} value={fieldName} />
          ))}
        </datalist>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Values</span>
            <select
              value={fieldVisibility?.mode || "all"}
              onChange={(event) =>
                onUpdateView({
                  fieldVisibility: {
                    mode: event.target.value as NonNullable<
                      NonNullable<
                        WorkflowGraphNode["handoffView"]
                      >["fieldVisibility"]
                    >["mode"],
                    fieldNames: fieldVisibility?.fieldNames || [],
                  },
                })
              }
              className="h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
            >
              {fieldVisibilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Format</span>
            <select
              value={node.handoffView?.layout || "standard"}
              onChange={(event) =>
                onUpdateView({
                  layout: event.target.value as NonNullable<
                    WorkflowGraphNode["handoffView"]
                  >["layout"],
                })
              }
              className="h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
            >
              {layoutOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {fieldVisibility?.mode && fieldVisibility.mode !== "all" ? (
          <div className="space-y-2 rounded-md border border-[#e6e6e6] bg-white p-2">
            <p className="text-xs font-semibold text-neutral-400">
              {fieldVisibility.mode === "hidden"
                ? "Values to hide"
                : "Values to show"}
            </p>
            {fieldNames.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {fieldNames.map((fieldName) => (
                  <label
                    key={fieldName}
                    className="flex min-h-9 items-start gap-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 py-2 text-xs text-neutral-300"
                  >
                    <input
                      type="checkbox"
                      checked={(fieldVisibility.fieldNames || []).includes(
                        fieldName,
                      )}
                      onChange={(event) =>
                        onUpdateView({
                          fieldVisibility: {
                            mode: fieldVisibility.mode,
                            fieldNames: toggleWorkflowHandoffFieldName(
                              fieldVisibility.fieldNames,
                              fieldName,
                              event.target.checked,
                            ),
                          },
                        })
                      }
                      className="mt-0.5"
                    />
                    <span className="min-w-0 break-words">{fieldName}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs text-neutral-500">
                Add workflow fields or document extraction fields first.
              </p>
            )}
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Documents</span>
          <select
            value={
              documentVisibility?.mode === "required_for_node"
                ? "selected"
                : documentVisibility?.mode || "all"
            }
            onChange={(event) =>
              onUpdateView({
                documentVisibility: {
                  mode: event.target.value as NonNullable<
                    NonNullable<
                      WorkflowGraphNode["handoffView"]
                    >["documentVisibility"]
                  >["mode"],
                  documentIds: selectedDocumentIds,
                },
              })
            }
            className="h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            {documentVisibilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {["selected", "required_for_node"].includes(
          documentVisibility?.mode || "",
        ) ? (
          <div className="space-y-2 rounded-md border border-[#e6e6e6] bg-white p-2">
            {documentOptions.map((document) => (
              <label
                key={document.id}
                className="flex items-start gap-2 text-xs text-neutral-300"
              >
                <input
                  type="checkbox"
                  checked={selectedDocumentIds.includes(document.id)}
                  onChange={(event) =>
                    onUpdateView({
                      documentVisibility: {
                        mode: "selected",
                        documentIds: event.target.checked
                          ? [...selectedDocumentIds, document.id]
                          : selectedDocumentIds.filter(
                              (id) => id !== document.id,
                            ),
                      },
                    })
                  }
                  className="mt-0.5"
                />
                <span>{document.label}</span>
              </label>
            ))}
            {!documentOptions.length ? (
              <p className="text-xs text-neutral-500">
                No upstream or current documents yet.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 border-t border-[#e6e6e6] pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-neutral-400">Checks</p>
            <button
              type="button"
              onClick={onAddProcess}
              className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/20"
            >
              <Plus size={13} />
              Add
            </button>
          </div>

          {(node.handoffView?.processes || []).map((process) => (
            <div
              key={process.id}
              className="space-y-2 rounded-md border border-[#e6e6e6] bg-white p-2"
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                <input
                  value={process.label}
                  onChange={(event) =>
                    onUpdateProcess(process.id, { label: event.target.value })
                  }
                  className="h-9 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-xs outline-none focus:border-emerald-400/60"
                />
                <select
                  value={process.type}
                  onChange={(event) =>
                    onUpdateProcess(process.id, {
                      type: event.target.value as WorkflowHandoffProcess["type"],
                    })
                  }
                  className="h-9 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-xs outline-none focus:border-emerald-400/60"
                >
                  {processTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title={`Remove ${process.label || "check"}`}
                  aria-label={`Remove ${process.label || "check"}`}
                  onClick={() => onRemoveProcess(process.id)}
                  className="flex h-9 items-center justify-center rounded-md border border-[#e6e6e6] px-2 text-neutral-400 transition hover:border-rose-400/40 hover:text-rose-100"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
                <input
                  value={process.leftField}
                  list="workflow-handoff-field-names"
                  onChange={(event) =>
                    onUpdateProcess(process.id, {
                      leftField: event.target.value,
                    })
                  }
                  className="h-9 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-xs outline-none focus:border-emerald-400/60"
                />
                {process.type === "calculation" ? (
                  <select
                    value={process.calculation}
                    onChange={(event) =>
                      onUpdateProcess(process.id, {
                        calculation: event.target
                          .value as WorkflowHandoffCalculation,
                      })
                    }
                    className="h-9 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {calculationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={process.operator}
                    onChange={(event) =>
                      onUpdateProcess(process.id, {
                        operator: event.target.value as WorkflowRuleOperator,
                      })
                    }
                    className="h-9 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {comparisonOperators.map((operator) => (
                      <option key={operator} value={operator}>
                        {operator}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  value={process.rightField}
                  list="workflow-handoff-field-names"
                  onChange={(event) =>
                    onUpdateProcess(process.id, {
                      rightField: event.target.value,
                    })
                  }
                  className="h-9 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-xs outline-none focus:border-emerald-400/60"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
