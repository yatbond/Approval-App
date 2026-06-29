import type {
  WorkflowGraphNode,
  WorkflowNodeKind,
  WorkflowTemplate,
} from "./types";

const participantNodeKinds = new Set<WorkflowNodeKind>([
  "submit_request",
  "approval",
  "review",
  "for_information",
]);

export type WorkflowParticipantEmailField = {
  nodeId: string;
  label: string;
  kind: WorkflowNodeKind;
  email: string;
  inputLabel: string;
  isFixed: boolean;
};

export type WorkflowParticipantEmailMap = Record<string, string>;

export function getWorkflowParticipantEmailFields(
  template: WorkflowTemplate,
  options: { editableOnly?: boolean } = {},
): WorkflowParticipantEmailField[] {
  return (template.graph?.nodes || [])
    .filter(isParticipantNode)
    .filter((node) => !options.editableOnly || !node.assigneeEmailFixed)
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      email: node.assigneeEmail || "",
      inputLabel: getParticipantEmailInputLabel(node.kind),
      isFixed: Boolean(node.assigneeEmailFixed),
    }));
}

export function applyWorkflowParticipantEmails(
  template: WorkflowTemplate,
  participantEmails: WorkflowParticipantEmailMap,
): WorkflowTemplate {
  if (!template.graph) {
    return template;
  }

  return {
    ...template,
    graph: {
      ...template.graph,
      nodes: template.graph.nodes.map((node) =>
        isParticipantNode(node)
          ? {
              ...node,
              assigneeEmail: node.assigneeEmailFixed
                ? (node.assigneeEmail || "").trim()
                : (participantEmails[node.id] ?? node.assigneeEmail ?? "").trim(),
            }
          : node,
      ),
    },
  };
}

export function getMissingWorkflowParticipantEmails(template: WorkflowTemplate) {
  return getWorkflowParticipantEmailFields(template)
    .filter((field) => !field.email.trim())
    .map((field) => field.label);
}

function isParticipantNode(node: WorkflowGraphNode) {
  return participantNodeKinds.has(node.kind);
}

function getParticipantEmailInputLabel(kind: WorkflowNodeKind) {
  if (kind === "submit_request") {
    return "Submitter email";
  }

  if (kind === "for_information") {
    return "FYI email";
  }

  return "Person email";
}
