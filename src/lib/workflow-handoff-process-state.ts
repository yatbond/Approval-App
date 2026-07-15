import type {
  WorkflowHandoffCalculation,
  WorkflowHandoffProcess,
  WorkflowRuleOperator,
} from "./types.ts";

export type WorkflowHandoffProcessPatch = {
  type?: WorkflowHandoffProcess["type"];
  label?: string;
  leftField?: string;
  rightField?: string;
  operator?: WorkflowRuleOperator;
  calculation?: WorkflowHandoffCalculation;
};

export function getNextWorkflowHandoffProcessId(
  processes: WorkflowHandoffProcess[],
) {
  let index = processes.length + 1;
  let id = `handoff-check-${index}`;
  const existingIds = new Set(processes.map((process) => process.id));

  while (existingIds.has(id)) {
    index += 1;
    id = `handoff-check-${index}`;
  }

  return id;
}

export function applyWorkflowHandoffProcessPatch(
  process: WorkflowHandoffProcess,
  patch: WorkflowHandoffProcessPatch,
): WorkflowHandoffProcess {
  const type = patch.type || process.type;
  const label = patch.label ?? process.label;
  const leftField = patch.leftField ?? process.leftField;
  const rightField = patch.rightField ?? process.rightField;

  if (type === "calculation") {
    return {
      id: process.id,
      type,
      label,
      leftField,
      rightField,
      calculation:
        patch.calculation ||
        (process.type === "calculation" ? process.calculation : "difference"),
    };
  }

  return {
    id: process.id,
    type,
    label,
    leftField,
    rightField,
    operator:
      patch.operator || (process.type === "comparison" ? process.operator : "="),
  };
}
