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
  required: boolean;
};

export type WorkflowParticipantEmailMap = Record<string, string>;

export function getWorkflowParticipantEmailFields(
  template: WorkflowTemplate,
  options: { editableOnly?: boolean } = {},
): WorkflowParticipantEmailField[] {
  return (template.graph?.nodes || []).filter(isParticipantNode).flatMap((node) => {
    const fields: WorkflowParticipantEmailField[] = [];
    if (!options.editableOnly || !node.assigneeEmailFixed) {
      fields.push({
        nodeId: node.id,
        label: node.label,
        kind: node.kind,
        email: node.assigneeEmail || "",
        inputLabel: getParticipantEmailInputLabel(node.kind),
        isFixed: Boolean(node.assigneeEmailFixed),
        required: true,
      });
    }

    if (["approval", "review"].includes(node.kind)) {
      const escalationField = {
        nodeId: getEscalationParticipantEmailFieldId(node.id),
        label: `${node.label} escalation`,
        kind: node.kind,
        email: node.escalationEmail || "",
        inputLabel: "Escalation email (optional)",
        isFixed: Boolean(node.escalationEmailFixed),
        required: false,
      };
      if (!options.editableOnly || !escalationField.isFixed) {
        fields.push(escalationField);
      }
    }

    return fields;
  });
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
              ...(["approval", "review"].includes(node.kind)
                ? {
                    escalationEmail: node.escalationEmailFixed
                      ? getOptionalParticipantEmail(node.escalationEmail)
                      : getOptionalParticipantEmail(
                          participantEmails[
                            getEscalationParticipantEmailFieldId(node.id)
                          ] ?? node.escalationEmail,
                        ),
                  }
                : {}),
            }
          : node,
      ),
    },
  };
}

export function getMissingWorkflowParticipantEmails(template: WorkflowTemplate) {
  return getWorkflowParticipantEmailFields(template)
    .filter((field) => field.required && !field.email.trim())
    .map((field) => field.label);
}

export function getEscalationParticipantEmailFieldId(nodeId: string) {
  return `${nodeId}:escalation`;
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

function getOptionalParticipantEmail(email: string | undefined) {
  const trimmed = (email || "").trim();
  return trimmed || undefined;
}
