import type { WorkflowTemplate } from "./types.ts";
import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";

export type WorkflowHandoffDocumentOption = {
  id: string;
  documentType: string;
  label: string;
};

export function getWorkflowHandoffDocumentOptions({
  template,
  nodeId,
}: {
  template: WorkflowTemplate;
  nodeId: string;
}): WorkflowHandoffDocumentOption[] {
  const graph = createWorkflowGraphFromTemplate(template);
  const relevantNodeIds = getUpstreamAndCurrentNodeIds(template, nodeId);
  const ownerLabelsByDocumentId = new Map<string, string[]>();

  graph.nodes
    .filter((node) => relevantNodeIds.has(node.id))
    .forEach((node) => {
      (node.documentIds || []).forEach((documentId) => {
        const ownerLabels = ownerLabelsByDocumentId.get(documentId) || [];
        ownerLabelsByDocumentId.set(documentId, [...ownerLabels, node.label]);
      });
    });

  return template.documents
    .filter((document) => ownerLabelsByDocumentId.has(document.id))
    .map((document) => {
      const ownerLabels = ownerLabelsByDocumentId.get(document.id) || [];
      return {
        id: document.id,
        documentType: document.documentType,
        label: `${document.documentType} - ${ownerLabels.join(", ")}`,
      };
    });
}

function getUpstreamAndCurrentNodeIds(template: WorkflowTemplate, nodeId: string) {
  const graph = createWorkflowGraphFromTemplate(template);
  const relevantNodeIds = new Set<string>();
  const stack = [nodeId];

  while (stack.length) {
    const currentNodeId = stack.pop();
    if (!currentNodeId || relevantNodeIds.has(currentNodeId)) {
      continue;
    }

    relevantNodeIds.add(currentNodeId);
    graph.edges
      .filter((edge) => edge.targetId === currentNodeId)
      .forEach((edge) => stack.push(edge.sourceId));
  }

  return relevantNodeIds;
}
