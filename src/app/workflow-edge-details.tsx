import { getWorkflowEdgeDetailsState } from "@/lib/workflow-edge-details-state";
import type {
  WorkflowBranchRule,
  WorkflowBranchType,
  WorkflowField,
  WorkflowGraphEdge,
  WorkflowRuleOperator,
} from "@/lib/types";

const branchTypeOptions: { value: WorkflowBranchType; label: string }[] = [
  { value: "main", label: "Main" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "condition", label: "Condition" },
  { value: "for_information", label: "FYI" },
];

const ruleOperatorOptions: { value: WorkflowRuleOperator; label: string }[] = [
  { value: ">", label: "is greater than" },
  { value: ">=", label: "is greater than or equal to" },
  { value: "=", label: "equals" },
  { value: "<", label: "is less than" },
  { value: "<=", label: "is less than or equal to" },
];

export function WorkflowEdgeDetails({
  edge,
  workflowFields,
  onUpdateEdge,
  onUpdateEdgeRule,
}: {
  edge: WorkflowGraphEdge;
  workflowFields: WorkflowField[];
  onUpdateEdge: (patch: Partial<WorkflowGraphEdge>) => void;
  onUpdateEdgeRule: (key: keyof Pick<WorkflowBranchRule, "field" | "operator" | "value">, value: string) => void;
}) {
  const state = getWorkflowEdgeDetailsState({ edge, workflowFields });

  return (
    <div className="mt-4 space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-neutral-400">Type</span>
        <select
          value={edge.branchType}
          onChange={(event) =>
            onUpdateEdge({
              branchType: event.target.value as WorkflowBranchType,
            })
          }
          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
        >
          {branchTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-neutral-400">Label</span>
        <input
          value={edge.label}
          onChange={(event) => onUpdateEdge({ label: event.target.value })}
          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
        />
      </label>
      {state.showsRuleBuilder && (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="text-xs font-semibold text-amber-100">
            Rule
          </p>
          <div className="mt-2 space-y-2">
            <select
              value={state.ruleFieldValue}
              onChange={(event) =>
                onUpdateEdgeRule("field", event.target.value)
              }
              className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
            >
              {workflowFields.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.label}
                </option>
              ))}
            </select>
            <select
              value={state.ruleOperatorValue}
              onChange={(event) =>
                onUpdateEdgeRule("operator", event.target.value)
              }
              className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
            >
              {ruleOperatorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={state.ruleValue}
              onChange={(event) =>
                onUpdateEdgeRule("value", event.target.value)
              }
              placeholder="Value"
              className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={state.blocksWorkflow}
          disabled={!state.canBlockWorkflow}
          onChange={(event) =>
            onUpdateEdge({ blocking: event.target.checked })
          }
        />
        Blocking
      </label>
      {state.showsForInformationNote && (
        <p className="rounded-md border border-sky-400/30 bg-sky-400/10 p-3 text-xs text-sky-100">
          FYI only. Nonblocking.
        </p>
      )}
    </div>
  );
}
