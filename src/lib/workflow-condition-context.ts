import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
  WorkflowTemplate,
} from "./types.ts";

export const workflowNodeOptions: { kind: WorkflowNodeKind; label: string }[] = [
  { kind: "submit_request", label: "Submit" },
  { kind: "approval", label: "Approval" },
  { kind: "review", label: "Review" },
  { kind: "for_information", label: "FYI" },
  { kind: "condition", label: "Condition" },
  { kind: "end", label: "End" },
];

export function getConditionContext(
  graph: WorkflowGraph,
  template: WorkflowTemplate,
  conditionNode: WorkflowGraphNode,
) {
  const incomingEdges = graph.edges.filter((edge) => edge.targetId === conditionNode.id);
  const outgoingEdges = graph.edges.filter((edge) => edge.sourceId === conditionNode.id);
  const upstreamNodes = incomingEdges
    .map((edge) => graph.nodes.find((node) => node.id === edge.sourceId))
    .filter((node): node is WorkflowGraphNode => Boolean(node))
    .filter((node) => node.kind === "approval" || node.kind === "review");
  const downstreamNodes = outgoingEdges
    .map((edge) => ({
      edge,
      node: graph.nodes.find((node) => node.id === edge.targetId),
    }))
    .filter(
      (item): item is { edge: WorkflowGraphEdge; node: WorkflowGraphNode } =>
        Boolean(item.node),
    );
  const upstreamDocumentIds = new Set<string>();
  upstreamNodes.forEach((node) =>
    (node.documentIds || []).forEach((documentId) => upstreamDocumentIds.add(documentId)),
  );
  const numericFields = template.documents
    .filter(
      (document) =>
        !upstreamDocumentIds.size || upstreamDocumentIds.has(document.id),
    )
    .flatMap((document) => document.fields)
    .concat(template.fields)
    .filter((field) => field.type === "number" || field.type === "currency")
    .filter(
      (field, index, fields) =>
        fields.findIndex((candidate) => candidate.name === field.name) === index,
    );

  return {
    incomingEdges,
    outgoingEdges,
    upstreamNodes,
    downstreamNodes,
    numericFields,
  };
}

export function formatNodeKind(kind: WorkflowNodeKind) {
  if (kind === "return_reject") {
    return "Return/Reject";
  }

  return workflowNodeOptions.find((option) => option.kind === kind)?.label || "Start";
}
