import type {
  DocumentFormat,
  WorkflowDocumentInputMode,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "./types.ts";
import { addWorkflowDocumentToNode } from "./workflow-graph.ts";
import { fieldSourceForDocumentFormat } from "./workflow-documents.ts";

type WorkflowAddBoxDocumentStateInput = {
  template: WorkflowTemplate;
  selectedNodeId: string | null;
  selectedNodeLabel: string;
  documentType: string;
  format: DocumentFormat;
  inputMode?: WorkflowDocumentInputMode;
  required: boolean;
};

export function getWorkflowAddBoxDocumentState({
  template,
  selectedNodeId,
  selectedNodeLabel,
  documentType,
  format,
  inputMode = "upload",
  required,
}: WorkflowAddBoxDocumentStateInput) {
  const trimmedDocumentType = documentType.trim();
  if (!selectedNodeId || !trimmedDocumentType) {
    return {
      didUpdate: false,
      template,
      label: "",
      resetForm: null,
    };
  }

  const isManualForm = inputMode === "manual_form";

  return {
    didUpdate: true,
    template: addWorkflowDocumentToNode(template, selectedNodeId, {
      documentType: trimmedDocumentType,
      format,
      inputMode,
      required,
      fields: [
        {
          name: `${trimmedDocumentType.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_field`,
          label: "New field",
          type: "text",
          required: false,
          source: isManualForm ? "manual" : fieldSourceForDocumentFormat(format),
          instructions: isManualForm
            ? "Describe what the requester should enter for this form field."
            : "Describe what should be extracted from this document.",
        },
      ],
    }),
    label: `Added document to ${selectedNodeLabel}`,
    resetForm: {
      documentType: "Supporting document",
      format: "pdf" as DocumentFormat,
      inputMode: "upload" as WorkflowDocumentInputMode,
      required: true,
    },
  };
}

export function getWorkflowRemoveBoxDocumentState({
  template,
  nodeId,
  documentId,
}: {
  template: WorkflowTemplate;
  nodeId: string;
  documentId: string;
}) {
  if (!template.graph) {
    return {
      didUpdate: false,
      template,
      label: "",
    };
  }

  const targetNode = template.graph.nodes.find((node) => node.id === nodeId);
  if (!targetNode?.documentIds?.includes(documentId)) {
    return {
      didUpdate: false,
      template,
      label: "",
    };
  }

  const detachedGraph = {
    ...template.graph,
    nodes: template.graph.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            documentIds: (node.documentIds || []).filter((id) => id !== documentId),
          }
        : node,
    ),
  };
  const isStillUsed = detachedGraph.nodes.some((node) =>
    (node.documentIds || []).includes(documentId),
  );
  const nextTemplate = isStillUsed
    ? { ...template, graph: detachedGraph }
    : rebuildTemplateDocuments({
        template: {
          ...template,
          graph: removeDocumentFromHandoffSelections(detachedGraph, documentId),
        },
        documents: template.documents.filter((document) => document.id !== documentId),
      });

  return {
    didUpdate: true,
    template: nextTemplate,
    label: "Removed document requirement",
  };
}

export function pruneUnusedWorkflowDocuments(template: WorkflowTemplate) {
  if (!template.graph) {
    return template;
  }

  const usedDocumentIds = new Set(
    template.graph.nodes.flatMap((node) => node.documentIds || []),
  );
  const documents = template.documents.filter((document) =>
    usedDocumentIds.has(document.id),
  );
  const validDocumentIds = new Set(documents.map((document) => document.id));
  const nextGraph = {
    ...template.graph,
    nodes: template.graph.nodes.map((node) =>
      filterNodeHandoffDocumentSelections(node, validDocumentIds),
    ),
  };

  if (
    documents.length === template.documents.length &&
    JSON.stringify(nextGraph) === JSON.stringify(template.graph)
  ) {
    return template;
  }

  return rebuildTemplateDocuments({
    template: {
      ...template,
      graph: nextGraph,
    },
    documents,
  });
}

function removeDocumentFromHandoffSelections(
  graph: WorkflowGraph,
  documentId: string,
) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const documentVisibility = node.handoffView?.documentVisibility;
      if (!documentVisibility?.documentIds?.includes(documentId)) {
        return node;
      }

      return {
        ...node,
        handoffView: {
          ...node.handoffView,
          documentVisibility: {
            ...documentVisibility,
            documentIds: documentVisibility.documentIds.filter(
              (id) => id !== documentId,
            ),
          },
        },
      };
    }),
  };
}

function filterNodeHandoffDocumentSelections(
  node: WorkflowGraphNode,
  validDocumentIds: Set<string>,
) {
  const documentVisibility = node.handoffView?.documentVisibility;
  if (!documentVisibility?.documentIds) {
    return node;
  }

  const documentIds = documentVisibility.documentIds.filter((documentId) =>
    validDocumentIds.has(documentId),
  );
  if (documentIds.length === documentVisibility.documentIds.length) {
    return node;
  }

  return {
    ...node,
    handoffView: {
      ...node.handoffView,
      documentVisibility: {
        ...documentVisibility,
        documentIds,
      },
    },
  };
}

function rebuildTemplateDocuments({
  template,
  documents,
}: {
  template: WorkflowTemplate;
  documents: WorkflowTemplate["documents"];
}) {
  return {
    ...template,
    documentTypes: documents.map((document) => document.documentType),
    documents,
    fields: documents.flatMap((document) => document.fields),
  };
}
