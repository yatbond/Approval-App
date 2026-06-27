import type {
  ApprovalAttachment,
  ApprovalTask,
  WorkflowGraphNode,
  WorkflowHandoffDocumentVisibility,
  WorkflowHandoffFieldVisibility,
  WorkflowHandoffProcess,
  WorkflowRuleOperator,
  WorkflowTemplate,
} from "./types.ts";
import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";

export type TaskHandoffField = {
  label: string;
  value: string;
};

export type TaskHandoffAttachment = ApprovalAttachment & {
  storageLabel?: string;
};

export type TaskHandoffProcessResult = {
  id: string;
  label: string;
  tone: "pass" | "fail" | "unknown";
  result: string;
  detail: string;
};

export type TaskHandoffViewModel = {
  nodeId?: string;
  nodeLabel: string;
  layout: "standard" | "compact" | "comparison";
  policyLabel: "Default pass-through" | "Custom handoff view";
  fields: TaskHandoffField[];
  attachments: TaskHandoffAttachment[];
  processes: TaskHandoffProcessResult[];
  hiddenFieldCount: number;
  hiddenAttachmentCount: number;
};

export function buildTaskHandoffView({
  task,
  template,
  nodeId = task.currentNodeId,
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  nodeId?: string;
}): TaskHandoffViewModel {
  const node = findHandoffNode(template, nodeId);
  const policy = node?.handoffView;
  const allFields = Object.entries(task.extractedFields || {}).map(
    ([label, value]) => ({
      label,
      value,
    }),
  );
  const allAttachments = (task.attachments || []).map((attachment) => ({
    ...attachment,
    storageLabel: attachment.storagePath
      ? `Stored in Supabase: ${attachment.storagePath}`
      : undefined,
  }));
  const fields = filterFields(allFields, policy?.fieldVisibility);
  const attachments = filterAttachments(
    allAttachments,
    policy?.documentVisibility,
    node,
  );

  return {
    nodeId: node?.id || nodeId,
    nodeLabel: node?.label || task.currentStep,
    layout: policy?.layout || "standard",
    policyLabel: isCustomPolicy(policy)
      ? "Custom handoff view"
      : "Default pass-through",
    fields,
    attachments,
    processes: evaluateProcesses(policy?.processes || [], task.extractedFields || {}),
    hiddenFieldCount: allFields.length - fields.length,
    hiddenAttachmentCount: allAttachments.length - attachments.length,
  };
}

function findHandoffNode(template?: WorkflowTemplate, nodeId?: string) {
  if (!template || !nodeId) {
    return undefined;
  }

  return createWorkflowGraphFromTemplate(template).nodes.find(
    (node) => node.id === nodeId,
  );
}

function filterFields(
  fields: TaskHandoffField[],
  visibility?: WorkflowHandoffFieldVisibility,
) {
  if (!visibility || visibility.mode === "all") {
    return fields;
  }

  const configuredNames = new Set((visibility.fieldNames || []).map(normalizeName));
  if (!configuredNames.size) {
    return visibility.mode === "hidden" ? fields : [];
  }

  return fields.filter((field) => {
    const isConfigured = configuredNames.has(normalizeName(field.label));
    return visibility.mode === "selected" ? isConfigured : !isConfigured;
  });
}

function filterAttachments(
  attachments: TaskHandoffAttachment[],
  visibility: WorkflowHandoffDocumentVisibility | undefined,
  node?: WorkflowGraphNode,
) {
  if (!visibility || visibility.mode === "all") {
    return attachments;
  }

  if (visibility.mode === "none") {
    return [];
  }

  const documentIds =
    visibility.mode === "required_for_node"
      ? node?.documentIds || []
      : visibility.documentIds || [];
  const configuredIds = new Set(documentIds.map(normalizeName));
  if (!configuredIds.size) {
    return [];
  }

  return attachments.filter((attachment) => {
    return (
      configuredIds.has(normalizeName(attachment.documentId || "")) ||
      configuredIds.has(normalizeName(attachment.documentType))
    );
  });
}

function evaluateProcesses(
  processes: WorkflowHandoffProcess[],
  fields: Record<string, string>,
) {
  return processes.map((process) => evaluateComparisonProcess(process, fields));
}

function evaluateComparisonProcess(
  process: WorkflowHandoffProcess,
  fields: Record<string, string>,
): TaskHandoffProcessResult {
  const leftValue = fields[process.leftField];
  const rightValue = fields[process.rightField];
  const comparison = compareValues(leftValue, rightValue, process.operator);

  if (comparison === undefined) {
    return {
      id: process.id,
      label: process.label,
      tone: "unknown",
      result: "Needs review",
      detail: `${process.leftField} or ${process.rightField} is unavailable.`,
    };
  }

  return {
    id: process.id,
    label: process.label,
    tone: comparison ? "pass" : "fail",
    result: comparison ? "Matched" : "Not matched",
    detail: `${process.leftField} ${leftValue} ${comparison ? "is" : "is not"} ${process.operator} ${process.rightField} ${rightValue}.`,
  };
}

function compareValues(
  leftValue: string | undefined,
  rightValue: string | undefined,
  operator: WorkflowRuleOperator,
) {
  if (leftValue === undefined || rightValue === undefined) {
    return undefined;
  }

  if (operator === "contains") {
    return normalizeName(leftValue).includes(normalizeName(rightValue));
  }

  const leftNumber = parseComparableNumber(leftValue);
  const rightNumber = parseComparableNumber(rightValue);
  if (leftNumber !== undefined && rightNumber !== undefined) {
    if (operator === "=") return leftNumber === rightNumber;
    if (operator === "!=") return leftNumber !== rightNumber;
    if (operator === ">") return leftNumber > rightNumber;
    if (operator === ">=") return leftNumber >= rightNumber;
    if (operator === "<") return leftNumber < rightNumber;
    if (operator === "<=") return leftNumber <= rightNumber;
  }

  if (operator === "=") return normalizeName(leftValue) === normalizeName(rightValue);
  if (operator === "!=") return normalizeName(leftValue) !== normalizeName(rightValue);

  return undefined;
}

function parseComparableNumber(value: string) {
  const normalized = value.replace(/[^\d.-]/g, "");
  if (!/\d/.test(normalized)) {
    return undefined;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function isCustomPolicy(policy: WorkflowGraphNode["handoffView"]) {
  return Boolean(
    policy &&
      (policy.layout ||
        policy.fieldVisibility ||
        policy.documentVisibility ||
        policy.processes?.length),
  );
}
