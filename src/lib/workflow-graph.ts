import type {
  WorkflowBranchRule,
  WorkflowBranchType,
  WorkflowConditionCase,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";

type LegacyDocumentNode = Omit<WorkflowGraphNode, "kind"> & { kind: "document" };
type LegacyWorkflowGraphNode = WorkflowGraphNode | LegacyDocumentNode;
type LegacyWorkflowGraph = Omit<WorkflowGraph, "nodes"> & {
  nodes: LegacyWorkflowGraphNode[];
};

type AddNodeOverrides = Partial<
  Omit<WorkflowGraphNode, "id" | "kind">
>;

type AddBranchInput = {
  sourceId: string;
  targetId: string;
  branchType: WorkflowBranchType;
  label: string;
  rule?: WorkflowBranchRule;
  blocking?: boolean;
};

type AddDocumentInput = Omit<WorkflowDocumentRequirement, "id">;
type UpdateDocumentInput = Partial<
  Pick<
    WorkflowDocumentRequirement,
    "documentType" | "format" | "inputMode" | "required"
  >
>;
type UpdateConditionCaseInput = Partial<
  Pick<
    WorkflowConditionCase,
    | "name"
    | "isFallback"
    | "isApprovalCount"
    | "approvalRule"
    | "numericRule"
    | "join"
    | "targetNodeIds"
  >
>;

export type WorkflowValidationIssue = {
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type WorkflowRouteSimulation = {
  currentNode?: WorkflowGraphNode;
  notifiedNodes: WorkflowGraphNode[];
  requiredDocuments: WorkflowDocumentRequirement[];
  issues: WorkflowValidationIssue[];
};

export type InitialWorkflowRoute = {
  currentNode?: WorkflowGraphNode;
  currentNodes: WorkflowGraphNode[];
  notifiedNodes: WorkflowGraphNode[];
  routeNodes: WorkflowGraphNode[];
  terminalNode?: WorkflowGraphNode;
  activeBranchId?: string;
};

type InitialRouteOptions = {
  extractedFields?: Record<string, string>;
  nodeDecisions?: Record<string, "approved" | "rejected">;
  allowAmbiguousCondition?: boolean;
};

export type ConditionCoverageWarning = {
  nodeId: string;
  missingApprovalCounts: number[];
};

function orderConditionCases(conditionCases: WorkflowConditionCase[]) {
  return [
    ...conditionCases.filter((conditionCase) => !conditionCase.isFallback),
    ...conditionCases.filter((conditionCase) => conditionCase.isFallback),
  ];
}

function conditionCaseDisplayName(
  conditionCases: WorkflowConditionCase[],
  conditionCase: WorkflowConditionCase,
) {
  if (conditionCase.isFallback) {
    return "All other conditions";
  }

  const explicitCases = conditionCases.filter((item) => !item.isFallback);
  const conditionNumber =
    explicitCases.findIndex((item) => item.id === conditionCase.id) + 1;
  const baseName = `Condition ${conditionNumber}`;
  const nickname = conditionCase.name.trim();

  return nickname && !/^condition\s+\d+$/i.test(nickname)
    ? `${baseName} - ${nickname}`
    : baseName;
}

export function createWorkflowGraphFromTemplate(
  template: WorkflowTemplate,
): WorkflowGraph {
  if (template.graph) {
    return collapseDocumentNodes(template.graph);
  }

  const stepNodes: WorkflowGraphNode[] = template.steps.map((step, index) => ({
    id: `step-${index + 1}`,
    kind: "approval",
    label: step.name,
    x: 320 + index * 260,
    y: 120,
    assigneeName: step.approverName,
    assigneeEmail: step.approverEmail,
    dueInHours: step.dueInHours,
    escalationName: step.escalationName,
    escalationEmail: step.escalationEmail,
    documentIds:
      index === 0 ? template.documents.map((document) => document.id) : undefined,
    blocking: true,
  }));
  const nodes: WorkflowGraphNode[] = [
    {
      id: "start",
      kind: "start",
      label: "Start",
      x: 40,
      y: 120,
      blocking: true,
    },
    ...stepNodes,
    {
      id: "end",
      kind: "end",
      label: "End",
      x: 400 + stepNodes.length * 260,
      y: 120,
      blocking: false,
    },
  ];
  const chainIds = [
    "start",
    ...stepNodes.map((node) => node.id),
    "end",
  ];
  const edges: WorkflowGraphEdge[] = chainIds.slice(0, -1).map((sourceId, index) => {
    const targetId = chainIds[index + 1];
    return {
      id: `edge-${sourceId}-${targetId}`,
      sourceId,
      targetId,
      label: index === 0 ? "Submit" : "Next",
      branchType: "main",
      blocking: true,
    };
  });

  return { nodes, edges };
}

function collapseDocumentNodes(graph: LegacyWorkflowGraph): WorkflowGraph {
  const documentNodes = graph.nodes.filter((node) => node.kind === "document");
  if (!documentNodes.length) {
    return graph as WorkflowGraph;
  }

  const documentNodeIds = new Set(documentNodes.map((node) => node.id));
  const documentIdsByTarget = new Map<string, string[]>();
  const nextEdges: WorkflowGraphEdge[] = graph.edges.filter(
    (edge) => !documentNodeIds.has(edge.sourceId) && !documentNodeIds.has(edge.targetId),
  );

  documentNodes.forEach((documentNode) => {
    const incomingEdges = graph.edges.filter((edge) => edge.targetId === documentNode.id);
    const outgoingEdges = graph.edges.filter((edge) => edge.sourceId === documentNode.id);

    outgoingEdges
      .filter((edge) => !documentNodeIds.has(edge.targetId))
      .forEach((outgoingEdge) => {
        const existingDocumentIds = documentIdsByTarget.get(outgoingEdge.targetId) || [];
        documentIdsByTarget.set(outgoingEdge.targetId, [
          ...existingDocumentIds,
          ...(documentNode.documentIds || []),
        ]);
      });

    incomingEdges
      .filter((edge) => !documentNodeIds.has(edge.sourceId))
      .forEach((incomingEdge) => {
        outgoingEdges
          .filter((edge) => !documentNodeIds.has(edge.targetId))
          .forEach((outgoingEdge) => {
            nextEdges.push({
              id: `edge-${incomingEdge.sourceId}-${outgoingEdge.targetId}`,
              sourceId: incomingEdge.sourceId,
              targetId: outgoingEdge.targetId,
              label: incomingEdge.label || outgoingEdge.label,
              branchType: incomingEdge.branchType,
              rule: incomingEdge.rule,
              blocking: incomingEdge.blocking,
            });
          });
      });
  });

  return {
    nodes: graph.nodes
      .filter((node) => node.kind !== "document")
      .map((node) => ({
        ...node,
        documentIds: uniqueStrings([
          ...(node.documentIds || []),
          ...(documentIdsByTarget.get(node.id) || []),
        ]),
      })) as WorkflowGraphNode[],
    edges: dedupeEdges(nextEdges),
  };
}

export function addWorkflowNode(
  graph: WorkflowGraph,
  kind: WorkflowNodeKind,
  overrides: AddNodeOverrides = {},
): WorkflowGraph {
  const count = graph.nodes.filter((node) => node.kind === kind).length + 1;
  const node: WorkflowGraphNode = {
    id: `${kind}-${Date.now()}-${count}`,
    kind,
    label: overrides.label || defaultNodeLabel(kind, count),
    x: 180 + count * 60,
    y: 260 + count * 40,
    blocking: kind !== "for_information" && kind !== "end" && kind !== "return_reject",
    ...overrides,
  };

  return {
    ...graph,
    nodes: [...graph.nodes, node],
  };
}

export function addWorkflowBranch(
  graph: WorkflowGraph,
  input: AddBranchInput,
): WorkflowGraph {
  const edge: WorkflowGraphEdge = {
    id: `edge-${input.sourceId}-${input.targetId}-${graph.edges.length + 1}`,
    sourceId: input.sourceId,
    targetId: input.targetId,
    label: input.label,
    branchType: input.branchType,
    rule: input.rule,
    blocking:
      input.blocking ?? (input.branchType === "for_information" ? false : true),
  };

  return {
    ...graph,
    edges: [...graph.edges, edge],
  };
}

export function updateWorkflowGraphNode(
  graph: WorkflowGraph,
  nodeId: string,
  patch: Partial<WorkflowGraphNode>,
): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...patch, id: node.id } : node,
    ),
  };
}

export function updateWorkflowGraphEdge(
  graph: WorkflowGraph,
  edgeId: string,
  patch: Partial<WorkflowGraphEdge>,
): WorkflowGraph {
  return {
    ...graph,
    edges: graph.edges.map((edge) =>
      edge.id === edgeId ? { ...edge, ...patch, id: edge.id } : edge,
    ),
  };
}

export function deleteWorkflowNode(
  graph: WorkflowGraph,
  nodeId: string,
): WorkflowGraph {
  return {
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges: graph.edges.filter(
      (edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId,
    ),
  };
}

export function deleteWorkflowBranch(
  graph: WorkflowGraph,
  edgeId: string,
): WorkflowGraph {
  return {
    ...graph,
    edges: graph.edges.filter((edge) => edge.id !== edgeId),
  };
}

export function addWorkflowConditionCase(
  graph: WorkflowGraph,
  conditionNodeId: string,
  upstreamNodeIds: string[] = [],
): WorkflowGraph {
  const node = graph.nodes.find((item) => item.id === conditionNodeId);
  if (!node || node.kind !== "condition") {
    return graph;
  }

  const explicitCaseCount = (node.conditionCases || []).filter(
    (conditionCase) => !conditionCase.isFallback,
  ).length;
  const nextCase: WorkflowConditionCase = {
    id: `case-${Date.now()}-${(node.conditionCases || []).length + 1}`,
    name: `Condition ${explicitCaseCount + 1}`,
    approvalRule: upstreamNodeIds.length
      ? {
          upstreamNodeIds: upstreamNodeIds.slice(0, 1),
          minimumApproved: 1,
          mode: "at_least",
        }
      : undefined,
    join: "and",
    targetNodeIds: [],
  };

  return updateWorkflowGraphNode(graph, conditionNodeId, {
    conditionCases: orderConditionCases([...(node.conditionCases || []), nextCase]),
  });
}

export function updateWorkflowConditionCase(
  graph: WorkflowGraph,
  conditionNodeId: string,
  caseId: string,
  patch: UpdateConditionCaseInput,
): WorkflowGraph {
  const node = graph.nodes.find((item) => item.id === conditionNodeId);
  if (!node || node.kind !== "condition") {
    return graph;
  }

  const nextConditionCases = (node.conditionCases || []).map((conditionCase) =>
    conditionCase.id === caseId
      ? { ...conditionCase, ...patch, id: conditionCase.id }
      : conditionCase,
  );

  return updateWorkflowGraphNode(graph, conditionNodeId, {
    conditionCases: orderConditionCases(nextConditionCases),
  });
}

export function deleteWorkflowConditionCase(
  graph: WorkflowGraph,
  conditionNodeId: string,
  caseId: string,
): WorkflowGraph {
  const node = graph.nodes.find((item) => item.id === conditionNodeId);
  if (!node || node.kind !== "condition") {
    return graph;
  }

  const nextConditionCases = (node.conditionCases || []).filter(
    (conditionCase) => conditionCase.id !== caseId,
  );

  return updateWorkflowGraphNode(graph, conditionNodeId, {
    conditionCases: orderConditionCases(nextConditionCases),
  });
}

export function analyzeConditionCoverage(
  graph: WorkflowGraph,
  conditionNodeId: string,
): ConditionCoverageWarning | undefined {
  const conditionNode = graph.nodes.find((node) => node.id === conditionNodeId);
  if (!conditionNode || conditionNode.kind !== "condition") {
    return undefined;
  }

  const upstreamNodeIds = graph.edges
    .filter((edge) => edge.targetId === conditionNodeId)
    .map((edge) => graph.nodes.find((node) => node.id === edge.sourceId))
    .filter((node): node is WorkflowGraphNode => Boolean(node))
    .filter((node) => node.kind === "approval" || node.kind === "review")
    .map((node) => node.id);

  if (!upstreamNodeIds.length) {
    return undefined;
  }

  if ((conditionNode.conditionCases || []).some((conditionCase) => conditionCase.isFallback)) {
    return undefined;
  }

  const coveredCounts = new Set<number>();
  (conditionNode.conditionCases || []).forEach((conditionCase) => {
    const rule = conditionCase.approvalRule;
    if (!rule || !rule.upstreamNodeIds.length) {
      return;
    }

    const denominator = rule.upstreamNodeIds.length;
    const startCount = rule.minimumApproved;
    const endCount = rule.mode === "exactly" ? rule.minimumApproved : denominator;
    for (let count = startCount; count <= endCount; count += 1) {
      coveredCounts.add(count);
    }
  });

  const missingApprovalCounts = Array.from(
    { length: upstreamNodeIds.length + 1 },
    (_, count) => count,
  ).filter((count) => !coveredCounts.has(count));

  return missingApprovalCounts.length
    ? { nodeId: conditionNodeId, missingApprovalCounts }
    : undefined;
}

export function findInitialWorkflowRoute(
  graph: WorkflowGraph,
  options: InitialRouteOptions = {},
) {
  const route = traceInitialWorkflowRoute(graph, options);

  return {
    currentNode: route.currentNode,
    currentNodes: route.currentNodes,
    notifiedNodes: route.notifiedNodes,
    routeNodes: route.routeNodes,
    terminalNode: route.terminalNode,
    activeBranchId: route.activeBranchId,
  };
}

export function validateWorkflowTemplate(
  template: WorkflowTemplate,
): WorkflowValidationIssue[] {
  const graph = createWorkflowGraphFromTemplate(template);
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const documentById = new Map(
    template.documents.map((document) => [document.id, document]),
  );
  const fieldNames = new Set([
    ...template.fields.map((field) => field.name),
    ...template.documents.flatMap((document) =>
      document.fields.map((field) => field.name),
    ),
  ]);

  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.sourceId)) {
      issues.push({
        severity: "error",
        edgeId: edge.id,
        message: `Branch "${edge.label}" starts from a missing box.`,
      });
    }

    if (!nodeIds.has(edge.targetId)) {
      issues.push({
        severity: "error",
        edgeId: edge.id,
        message: `Branch "${edge.label}" points to a missing box.`,
      });
    }
  });

  graph.nodes.forEach((node) => {
    if (
      (node.kind === "approval" || node.kind === "review") &&
      !node.assigneeEmail?.trim()
    ) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        message: `${node.label}: Person email is required.`,
      });
    }

    if (node.kind === "for_information" && !node.assigneeEmail?.trim()) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: FYI recipient email is missing.`,
      });
    }

    (node.documentIds || []).forEach((documentId) => {
      const document = documentById.get(documentId);

      if (!document) {
        issues.push({
          severity: "error",
          nodeId: node.id,
          message: `${node.label}: Attached document "${documentId}" no longer exists.`,
        });
        return;
      }

      if (document.required && document.fields.length === 0) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          message: `${node.label}: Required ${document.documentType} has no fields to extract.`,
        });
      }
    });
  });

  const route = traceInitialWorkflowRoute(graph, {
    allowAmbiguousCondition: true,
  });
  if (!route.currentNode) {
    issues.push({
      severity: "error",
      message: "No first approver was found from the start path.",
    });
  }

  graph.nodes.forEach((node) => {
    if (node.id === "start" || node.kind === "end") {
      return;
    }

    const hasConnection = graph.edges.some(
      (edge) => edge.sourceId === node.id || edge.targetId === node.id,
    );
    if (!hasConnection) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: Box is not connected to the workflow.`,
      });
    }
  });

  const reachableNodeIds = collectReachableNodeIds(graph, "start");
  graph.nodes.forEach((node) => {
    if (node.id === "start" || reachableNodeIds.has(node.id)) {
      return;
    }

    const hasConnection = graph.edges.some(
      (edge) => edge.sourceId === node.id || edge.targetId === node.id,
    );
    if (!hasConnection) {
      return;
    }

    issues.push({
      severity: "warning",
      nodeId: node.id,
      message: `${node.label}: Box is connected but cannot be reached from Start.`,
    });
  });

  graph.nodes
    .filter((node) => node.kind === "condition")
    .forEach((node) => {
      issues.push(...validateConditionOutcomes(graph, node, fieldNames));
      const coverage = analyzeConditionCoverage(graph, node.id);
      if (coverage) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          message: `${node.label}: ${coverage.missingApprovalCounts.join(", ")} approved upstream box(es) are not routed. Add condition(s) for those cases or add a fallback outcome.`,
        });
      }
    });

  return issues;
}

function validateConditionOutcomes(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  fieldNames: Set<string>,
): WorkflowValidationIssue[] {
  const conditionEdges = graph.edges.filter(
    (edge) => edge.sourceId === node.id && edge.branchType === "condition",
  );
  const issues: WorkflowValidationIssue[] = [];
  const conditionCases = orderConditionCases(node.conditionCases || []);

  conditionCases.forEach((conditionCase) => {
    const displayName = conditionCaseDisplayName(conditionCases, conditionCase);
    if (!conditionCase.targetNodeIds.length) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: ${displayName} has no outcome boxes selected.`,
      });
    }

    if (
      !conditionCase.isFallback &&
      !conditionCase.approvalRule &&
      !conditionCase.numericRule
    ) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: ${displayName} has no rule. Choose approval result, numeric value, or both.`,
      });
    }

    if (
      !conditionCase.isFallback &&
      conditionCase.numericRule?.field &&
      !fieldNames.has(conditionCase.numericRule.field)
    ) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: ${displayName} uses "${conditionCase.numericRule.field}", but no upstream document extracts that numeric field.`,
      });
    }
  });

  for (let leftIndex = 0; leftIndex < conditionCases.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < conditionCases.length;
      rightIndex += 1
    ) {
      const left = conditionCases[leftIndex];
      const right = conditionCases[rightIndex];
      if (
        !left.isFallback &&
        !right.isFallback &&
        conditionCasesCanBothMatch(left, right)
      ) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          message: `${node.label}: ${conditionCaseDisplayName(
            conditionCases,
            left,
          )} and ${conditionCaseDisplayName(
            conditionCases,
            right,
          )} can both match the same request. Make the rules exclusive or choose a fallback route.`,
        });
      }
    }
  }

  if (!conditionEdges.length) {
    if (!conditionCases.length) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: No conditions are configured. Add at least one condition or a fallback outcome.`,
      });
    }
    return issues;
  }

  const numericEdges = conditionEdges.filter((edge) => edge.rule?.field);

  numericEdges.forEach((edge) => {
    if (edge.rule?.field && !fieldNames.has(edge.rule.field)) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        edgeId: edge.id,
        message: `${node.label}: Outcome "${edge.label}" uses a numeric field that is not extracted by any document.`,
      });
    }

    if (!edge.rule?.value.trim()) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        edgeId: edge.id,
        message: `${node.label}: Outcome "${edge.label}" has an empty numeric value.`,
      });
    }
  });

  for (let leftIndex = 0; leftIndex < numericEdges.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < numericEdges.length;
      rightIndex += 1
    ) {
      const left = numericEdges[leftIndex];
      const right = numericEdges[rightIndex];
      if (
        left.rule &&
        right.rule &&
        left.rule.field === right.rule.field &&
        rulesCanBothMatch(left.rule, right.rule)
      ) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          edgeId: right.id,
          message: `${node.label}: Outcomes "${left.label}" and "${right.label}" can both match ${left.rule.field}.`,
        });
      }
    }
  }

  return issues;
}

function collectReachableNodeIds(graph: WorkflowGraph, startNodeId: string) {
  const reachableNodeIds = new Set<string>();
  const pendingNodeIds = [startNodeId];

  while (pendingNodeIds.length) {
    const nodeId = pendingNodeIds.shift();
    if (!nodeId || reachableNodeIds.has(nodeId)) {
      continue;
    }

    reachableNodeIds.add(nodeId);
    graph.edges
      .filter((edge) => edge.sourceId === nodeId)
      .forEach((edge) => pendingNodeIds.push(edge.targetId));
  }

  return reachableNodeIds;
}

function conditionCasesCanBothMatch(
  left: WorkflowConditionCase,
  right: WorkflowConditionCase,
) {
  if (
    (!left.approvalRule && !left.numericRule) ||
    (!right.approvalRule && !right.numericRule)
  ) {
    return false;
  }

  return (
    approvalRulesCanBothMatch(left.approvalRule, right.approvalRule) &&
    numericRulesCanBothMatch(left.numericRule, right.numericRule)
  );
}

function approvalRulesCanBothMatch(
  left: WorkflowConditionCase["approvalRule"],
  right: WorkflowConditionCase["approvalRule"],
) {
  if (!left || !right) {
    return true;
  }

  if (!left.upstreamNodeIds.length || !right.upstreamNodeIds.length) {
    return false;
  }

  const upstreamNodeIds = Array.from(
    new Set([...left.upstreamNodeIds, ...right.upstreamNodeIds]),
  );
  const combinationCount = 2 ** upstreamNodeIds.length;

  for (let mask = 0; mask < combinationCount; mask += 1) {
    const approvedNodeIds = new Set<string>();
    upstreamNodeIds.forEach((nodeId, index) => {
      if (mask & (1 << index)) {
        approvedNodeIds.add(nodeId);
      }
    });

    if (
      approvalRuleMatchesApprovedSet(left, approvedNodeIds) &&
      approvalRuleMatchesApprovedSet(right, approvedNodeIds)
    ) {
      return true;
    }
  }

  return false;
}

function approvalRuleMatchesApprovedSet(
  rule: NonNullable<WorkflowConditionCase["approvalRule"]>,
  approvedNodeIds: Set<string>,
) {
  const approvedCount = rule.upstreamNodeIds.filter((nodeId) =>
    approvedNodeIds.has(nodeId),
  ).length;

  return rule.mode === "exactly"
    ? approvedCount === rule.minimumApproved
    : approvedCount >= rule.minimumApproved;
}

function numericRulesCanBothMatch(
  left: WorkflowConditionCase["numericRule"],
  right: WorkflowConditionCase["numericRule"],
) {
  if (!left || !right) {
    return true;
  }

  if (left.field !== right.field) {
    return true;
  }

  return rulesCanBothMatch(left, right);
}

function rulesCanBothMatch(
  left: NonNullable<WorkflowGraphEdge["rule"]>,
  right: NonNullable<WorkflowGraphEdge["rule"]>,
) {
  const leftValue = Number(left.value);
  const rightValue = Number(right.value);
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return false;
  }

  const leftRange = numericRuleRange(left.operator, leftValue);
  const rightRange = numericRuleRange(right.operator, rightValue);
  return leftRange.min <= rightRange.max && rightRange.min <= leftRange.max;
}

function numericRuleRange(
  operator: NonNullable<WorkflowGraphEdge["rule"]>["operator"],
  value: number,
) {
  if (operator === ">") {
    return { min: nextAfter(value), max: Number.POSITIVE_INFINITY };
  }
  if (operator === ">=") {
    return { min: value, max: Number.POSITIVE_INFINITY };
  }
  if (operator === "<") {
    return { min: Number.NEGATIVE_INFINITY, max: nextBefore(value) };
  }
  if (operator === "<=") {
    return { min: Number.NEGATIVE_INFINITY, max: value };
  }
  if (operator === "=") {
    return { min: value, max: value };
  }

  return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };
}

function nextAfter(value: number) {
  return value + Number.EPSILON;
}

function nextBefore(value: number) {
  return value - Number.EPSILON;
}

export function simulateWorkflowTemplate(
  template: WorkflowTemplate,
): WorkflowRouteSimulation {
  const graph = createWorkflowGraphFromTemplate(template);
  const route = traceInitialWorkflowRoute(graph, {
    allowAmbiguousCondition: true,
  });
  const routeDocumentIds = new Set<string>();

  route.routeNodes.forEach((node) => {
    (node.documentIds || []).forEach((documentId) => routeDocumentIds.add(documentId));
  });
  (route.currentNode?.documentIds || []).forEach((documentId) =>
    routeDocumentIds.add(documentId),
  );

  return {
    currentNode: route.currentNode,
    notifiedNodes: route.notifiedNodes,
    requiredDocuments: template.documents.filter((document) =>
      routeDocumentIds.has(document.id),
    ),
    issues: validateWorkflowTemplate(template),
  };
}

function traceInitialWorkflowRoute(
  graph: WorkflowGraph,
  options: InitialRouteOptions = {},
): InitialWorkflowRoute {
  const notifiedNodes = graph.edges
    .filter((edge) => edge.sourceId === "start" && edge.branchType === "for_information")
    .map((edge) => graph.nodes.find((node) => node.id === edge.targetId))
    .filter((node): node is WorkflowGraphNode => Boolean(node));
  const routeNodes: WorkflowGraphNode[] = [];
  let currentId = graph.edges.find(
    (edge) => edge.sourceId === "start" && edge.branchType !== "for_information",
  )?.targetId;
  let activeBranchId: string | undefined;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = graph.nodes.find((item) => item.id === currentId);
    if (!node) {
      break;
    }
    routeNodes.push(node);

    if (
      (node.kind === "approval" || node.kind === "review") &&
      node.assigneeEmail?.trim()
    ) {
      return {
        currentNode: node,
        currentNodes: [node],
        notifiedNodes,
        routeNodes,
        activeBranchId,
      };
    }

    graph.edges
      .filter((edge) => edge.sourceId === node.id && edge.branchType === "for_information")
      .forEach((edge) => {
        const notified = graph.nodes.find((item) => item.id === edge.targetId);
        if (notified && !notifiedNodes.some((item) => item.id === notified.id)) {
          notifiedNodes.push(notified);
        }
      });

    if (node.kind === "return_reject") {
      return {
        currentNode: node,
        currentNodes: [node],
        notifiedNodes,
        routeNodes,
        terminalNode: node,
        activeBranchId,
      };
    }

    if (node.kind === "end") {
      return {
        currentNode: undefined,
        currentNodes: [],
        notifiedNodes,
        routeNodes,
        terminalNode: node,
        activeBranchId,
      };
    }

    if (node.kind === "condition" && node.conditionCases?.length) {
      const conditionTarget = chooseInitialConditionCaseTarget(
        graph,
        node,
        options,
        notifiedNodes,
      );
      activeBranchId = conditionTarget?.caseId || activeBranchId;
      if (conditionTarget?.currentNodes.length) {
        return {
          currentNode: conditionTarget.currentNodes[0],
          currentNodes: conditionTarget.currentNodes,
          notifiedNodes,
          routeNodes: [
            ...routeNodes,
            ...conditionTarget.currentNodes.filter(
              (targetNode) =>
                !routeNodes.some((routeNode) => routeNode.id === targetNode.id),
            ),
          ],
          activeBranchId,
        };
      }
      currentId = conditionTarget?.targetNodeId;
      continue;
    }

    const outgoingActionNodes = getOutgoingActionableNodes(graph, node.id);
    if (outgoingActionNodes.length > 1) {
      return {
        currentNode: outgoingActionNodes[0],
        currentNodes: outgoingActionNodes,
        notifiedNodes,
        routeNodes: [
          ...routeNodes,
          ...outgoingActionNodes.filter(
            (targetNode) =>
              !routeNodes.some((routeNode) => routeNode.id === targetNode.id),
          ),
        ],
        activeBranchId,
      };
    }

    const nextEdge = graph.edges.find(
      (edge) => edge.sourceId === node.id && edge.branchType !== "for_information",
    );
    activeBranchId = nextEdge?.id || activeBranchId;
    currentId = nextEdge?.targetId;
  }

  return {
    currentNode: undefined,
    currentNodes: [],
    notifiedNodes,
    routeNodes,
    activeBranchId,
  };
}

function chooseInitialConditionCaseTarget(
  graph: WorkflowGraph,
  conditionNode: WorkflowGraphNode,
  options: InitialRouteOptions,
  notifiedNodes: WorkflowGraphNode[],
) {
  const conditionCases = orderConditionCases(conditionNode.conditionCases || []);
  const specifiedCases = conditionCases.filter(
    (conditionCase) => !conditionCase.isFallback,
  );
  const fallbackCase = conditionCases.find((conditionCase) => conditionCase.isFallback);
  const extractedFields = options.extractedFields || {};
  const nodeDecisions = options.nodeDecisions || {};
  const hasEvaluationInput = Boolean(options.extractedFields || options.nodeDecisions);
  const evaluatedCase = hasEvaluationInput
    ? specifiedCases.find((conditionCase) =>
        doesConditionCaseMatch(conditionCase, extractedFields, nodeDecisions),
      ) ||
      (fallbackCase &&
      canFallbackConditionRoute(specifiedCases, extractedFields, nodeDecisions)
        ? fallbackCase
        : undefined)
    : undefined;
  const matchedCase =
    evaluatedCase ||
    (options.allowAmbiguousCondition
      ? specifiedCases.find((conditionCase) => conditionCase.targetNodeIds.length) ||
        fallbackCase
      : undefined);

  if (!matchedCase) {
    return undefined;
  }

  const targetNodes = matchedCase.targetNodeIds
    .map((targetNodeId) => graph.nodes.find((node) => node.id === targetNodeId))
    .filter((node): node is WorkflowGraphNode => Boolean(node));

  targetNodes.forEach((targetNode) => {
    if (
      targetNode.kind === "for_information" &&
      !notifiedNodes.some((node) => node.id === targetNode.id)
    ) {
      notifiedNodes.push(targetNode);
    }
  });

  const currentNodes = targetNodes.filter(isActionableRouteNode);
  const terminalNode = targetNodes.find(
    (targetNode) => targetNode.kind === "return_reject" || targetNode.kind === "end",
  );

  return {
    caseId: matchedCase.id,
    targetNodeId: currentNodes[0]?.id || terminalNode?.id,
    currentNodes,
  };
}

function getOutgoingActionableNodes(graph: WorkflowGraph, sourceId: string) {
  return graph.edges
    .filter((edge) => edge.sourceId === sourceId && edge.branchType !== "for_information")
    .map((edge) => graph.nodes.find((node) => node.id === edge.targetId))
    .filter((node): node is WorkflowGraphNode => Boolean(node))
    .filter(isActionableRouteNode);
}

function isActionableRouteNode(node: WorkflowGraphNode) {
  return (
    (node.kind === "approval" || node.kind === "review") &&
    Boolean(node.assigneeEmail?.trim())
  );
}

function canFallbackConditionRoute(
  specifiedCases: WorkflowConditionCase[],
  extractedFields: Record<string, string>,
  nodeDecisions: Record<string, "approved" | "rejected">,
) {
  return !specifiedCases.some((conditionCase) =>
    canApprovalConditionStillMatch(conditionCase, extractedFields, nodeDecisions),
  );
}

function canApprovalConditionStillMatch(
  conditionCase: WorkflowConditionCase,
  extractedFields: Record<string, string>,
  nodeDecisions: Record<string, "approved" | "rejected">,
) {
  if (!conditionCase.approvalRule) {
    return false;
  }

  const numericMatches = conditionCase.numericRule
    ? doesConditionNumericRuleMatch(conditionCase.numericRule, extractedFields)
    : undefined;

  if (conditionCase.numericRule && conditionCase.join === "and" && !numericMatches) {
    return false;
  }

  const { upstreamNodeIds, minimumApproved, mode } = conditionCase.approvalRule;
  const approvedCount = upstreamNodeIds.filter(
    (nodeId) => nodeDecisions[nodeId] === "approved",
  ).length;
  const decidedCount = upstreamNodeIds.filter((nodeId) =>
    Boolean(nodeDecisions[nodeId]),
  ).length;
  const remainingCount = Math.max(upstreamNodeIds.length - decidedCount, 0);

  if (mode === "exactly") {
    return approvedCount <= minimumApproved && minimumApproved <= approvedCount + remainingCount;
  }

  return approvedCount + remainingCount >= minimumApproved;
}

function doesConditionCaseMatch(
  conditionCase: WorkflowConditionCase,
  extractedFields: Record<string, string>,
  nodeDecisions: Record<string, "approved" | "rejected">,
) {
  if (conditionCase.isFallback) {
    return true;
  }

  const approvalMatches = conditionCase.approvalRule
    ? doesApprovalConditionRuleMatch(conditionCase.approvalRule, nodeDecisions)
    : undefined;
  const numericMatches = conditionCase.numericRule
    ? doesConditionNumericRuleMatch(conditionCase.numericRule, extractedFields)
    : undefined;

  if (approvalMatches === undefined) {
    return Boolean(numericMatches);
  }

  if (numericMatches === undefined) {
    return approvalMatches;
  }

  return conditionCase.join === "or"
    ? approvalMatches || numericMatches
    : approvalMatches && numericMatches;
}

function doesApprovalConditionRuleMatch(
  approvalRule: NonNullable<WorkflowConditionCase["approvalRule"]>,
  nodeDecisions: Record<string, "approved" | "rejected">,
) {
  const approvedCount = approvalRule.upstreamNodeIds.filter(
    (nodeId) => nodeDecisions[nodeId] === "approved",
  ).length;
  const decidedCount = approvalRule.upstreamNodeIds.filter((nodeId) =>
    Boolean(nodeDecisions[nodeId]),
  ).length;

  if (approvalRule.mode === "exactly") {
    return (
      decidedCount === approvalRule.upstreamNodeIds.length &&
      approvedCount === approvalRule.minimumApproved
    );
  }

  return approvedCount >= approvalRule.minimumApproved;
}

function doesConditionNumericRuleMatch(
  rule: NonNullable<WorkflowConditionCase["numericRule"]>,
  extractedFields: Record<string, string>,
) {
  const rawFieldValue = extractedFields[rule.field] || "";
  const fieldValue = normalizeComparableValue(rawFieldValue);
  const ruleValue = normalizeComparableValue(rule.value);

  if (rule.operator === "contains") {
    return rawFieldValue.toLowerCase().includes(rule.value.toLowerCase());
  }

  if (typeof fieldValue === "number" && typeof ruleValue === "number") {
    if (rule.operator === "=") return fieldValue === ruleValue;
    if (rule.operator === "!=") return fieldValue !== ruleValue;
    if (rule.operator === ">") return fieldValue > ruleValue;
    if (rule.operator === ">=") return fieldValue >= ruleValue;
    if (rule.operator === "<") return fieldValue < ruleValue;
    if (rule.operator === "<=") return fieldValue <= ruleValue;
  }

  if (rule.operator === "=") return rawFieldValue === rule.value;
  if (rule.operator === "!=") return rawFieldValue !== rule.value;
  return false;
}

function normalizeComparableValue(value: string) {
  const number = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && value.trim() ? number : value;
}

export function addWorkflowDocumentToNode(
  template: WorkflowTemplate,
  nodeId: string,
  document: AddDocumentInput,
): WorkflowTemplate {
  const graph = createWorkflowGraphFromTemplate(template);
  const documentId = createDocumentId(document.documentType, template.documents.length + 1);
  const nextDocument: WorkflowDocumentRequirement = {
    ...document,
    id: documentId,
    fields: document.fields.map((field) => ({
      ...field,
      documentId,
    })),
  };
  const nextGraph = updateWorkflowGraphNode(graph, nodeId, {
    documentIds: [
      ...(graph.nodes.find((node) => node.id === nodeId)?.documentIds || []),
      documentId,
    ],
  });

  return {
    ...template,
    documentTypes: Array.from(
      new Set([...template.documentTypes, nextDocument.documentType]),
    ),
    documents: [...template.documents, nextDocument],
    fields: [...template.fields, ...nextDocument.fields],
    graph: nextGraph,
  };
}

export function updateWorkflowDocumentRequirement(
  template: WorkflowTemplate,
  documentId: string,
  patch: UpdateDocumentInput,
): WorkflowTemplate {
  const documents = template.documents.map((document) =>
    document.id === documentId ? { ...document, ...patch, id: document.id } : document,
  );

  return {
    ...template,
    documentTypes: documents.map((document) => document.documentType),
    documents,
    fields: documents.flatMap((document) => document.fields),
  };
}

function createDocumentId(documentType: string, count: number) {
  const slug = documentType
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "document"}-${count}`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function dedupeEdges(edges: WorkflowGraphEdge[]) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.sourceId}-${edge.targetId}-${edge.branchType}-${edge.label}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function defaultNodeLabel(kind: WorkflowNodeKind, count: number) {
  if (kind === "submit_request") {
    return `Submit Request ${count}`;
  }
  if (kind === "approval") {
    return `Approval ${count}`;
  }
  if (kind === "review") {
    return `Review ${count}`;
  }
  if (kind === "for_information") {
    return `For information ${count}`;
  }
  if (kind === "condition") {
    return `Condition ${count}`;
  }
  if (kind === "return_reject") {
    return `Return/Reject ${count}`;
  }
  if (kind === "end") {
    return `End ${count}`;
  }
  return "Start";
}
