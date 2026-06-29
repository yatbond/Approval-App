import type {
  WorkflowConditionCase,
  WorkflowGraph,
  WorkflowGraphNode,
} from "./types.ts";

export type ConditionRoutingContext = {
  upstreamNodes: { id: string; label: string }[];
  numericFields: { name: string; label: string }[];
};

export function getOrderedConditionCases(
  conditionCases: WorkflowConditionCase[] = [],
) {
  return [
    ...conditionCases.filter((conditionCase) => !conditionCase.isFallback),
    ...conditionCases.filter((conditionCase) => conditionCase.isFallback),
  ];
}

export function getConditionDisplayName(
  conditionCases: WorkflowConditionCase[],
  conditionCase: WorkflowConditionCase,
) {
  if (conditionCase.isFallback) {
    return "Fallback";
  }

  const explicitConditionCases = conditionCases.filter(
    (item) => !item.isFallback,
  );
  return `Condition ${
    explicitConditionCases.findIndex((item) => item.id === conditionCase.id) + 1
  }`;
}

export function getConditionNickname(conditionCase: WorkflowConditionCase) {
  if (conditionCase.isFallback) {
    return "";
  }

  const nickname = conditionCase.name.trim();
  return /^condition\s+\d+$/i.test(nickname) ? "" : nickname;
}

export function describeConditionCase({
  conditionCase,
  context,
}: {
  conditionCase: WorkflowConditionCase;
  context: ConditionRoutingContext;
}) {
  if (conditionCase.isFallback) {
    return "Else route.";
  }

  const upstreamNodeLabelById = new Map(
    context.upstreamNodes.map((node) => [node.id, node.label]),
  );
  const numericFieldLabelByName = new Map(
    context.numericFields.map((field) => [field.name, field.label]),
  );
  const parts: string[] = [];
  const approvalRule = conditionCase.approvalRule;
  if (approvalRule?.upstreamNodeIds.length) {
    const reviewers = approvalRule.upstreamNodeIds
      .map((nodeId) => upstreamNodeLabelById.get(nodeId) || nodeId)
      .join(", ");
    if (conditionCase.isApprovalCount) {
      parts.push(
        `${approvalRule.mode === "exactly" ? "Exactly" : "At least"} ${
          approvalRule.minimumApproved
        } of ${approvalRule.upstreamNodeIds.length} approve (${reviewers})`,
      );
    } else {
      parts.push(`${reviewers} must approve`);
    }
  }

  const numericRule = conditionCase.numericRule;
  if (numericRule?.field) {
    parts.push(
      `${numericFieldLabelByName.get(numericRule.field) || numericRule.field} ${
        numericRule.operator
      } ${numericRule.value || "value"}`,
    );
  }

  if (!parts.length) {
    return "No rule yet.";
  }

  return parts.join(conditionCase.join === "or" ? " OR " : " AND ");
}

export function getConditionRoutingState({
  graph,
  conditionNode,
}: {
  graph: WorkflowGraph;
  conditionNode: WorkflowGraphNode;
}) {
  return {
    availableTargets: graph.nodes.filter(
      (node) => node.kind !== "start" && node.kind !== "condition",
    ),
    conditionCases: getOrderedConditionCases(conditionNode.conditionCases),
  };
}
