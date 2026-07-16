import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";
import { isManualFormRequirement } from "./workflow-documents.ts";
import {
  getWorkflowFormAttachmentFields,
  isMicrosoftFormsRequirement,
  isUploadedWorkflowFormAttachment,
} from "./workflow-library-form-state.ts";
import type {
  ApprovalTask,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "./types.ts";

export type CurrentNodeFormCompletionIssue = {
  document: WorkflowDocumentRequirement;
  missingFieldLabels: string[];
  missingAttachmentLabels: string[];
  waitingForExternalResponse: boolean;
};

export function getCurrentNodeFormRequirements(
  task: ApprovalTask,
  template: WorkflowTemplate,
) {
  if (!task.currentNodeId) {
    return [];
  }
  const graph = createWorkflowGraphFromTemplate(template);
  const currentNode = graph.nodes.find((node) => node.id === task.currentNodeId);
  const currentDocumentIds = new Set(currentNode?.documentIds || []);
  return template.documents.filter(
    (document) =>
      currentDocumentIds.has(document.id) && isManualFormRequirement(document),
  );
}

export function getCurrentNodeFormCompletionIssues(
  task: ApprovalTask,
  template: WorkflowTemplate,
): CurrentNodeFormCompletionIssue[] {
  const issues: CurrentNodeFormCompletionIssue[] = [];
  for (const document of getCurrentNodeFormRequirements(task, template)) {
    const completionRequired =
      document.formLibraryRef?.completionRequired ?? document.required;
    if (!completionRequired) {
      continue;
    }

    if (isMicrosoftFormsRequirement(document)) {
      const reference = document.formLibraryRef;
      const hasResponse = Boolean(
        reference &&
          task.externalFormResponses?.some(
            (response) =>
              response.formKey === reference.formKey &&
              response.formVersion === reference.version &&
              response.definitionId === reference.definitionId &&
              (response.status === "received" || response.status === "applied"),
          ),
      );
      if (!hasResponse) {
        issues.push({
          document,
          missingFieldLabels: [],
          missingAttachmentLabels: [],
          waitingForExternalResponse: true,
        });
      }
      continue;
    }

    const missingFieldLabels = document.fields
      .filter((field) => field.required)
      .filter((field) => !getTaskFieldValue(task, field.name, field.label))
      .map((field) => field.label);
    const missingAttachmentLabels = getWorkflowFormAttachmentFields(document)
      .filter((field) => field.required)
      .filter(
        (field) =>
          !(task.attachments || []).some((attachment) =>
            isUploadedWorkflowFormAttachment(attachment, document, field),
          ),
      )
      .map((field) => field.label);

    if (missingFieldLabels.length || missingAttachmentLabels.length) {
      issues.push({
        document,
        missingFieldLabels,
        missingAttachmentLabels,
        waitingForExternalResponse: false,
      });
    }
  }
  return issues;
}

export function getTaskFieldValue(
  task: Pick<ApprovalTask, "extractedFields">,
  name: string,
  label: string,
) {
  return (task.extractedFields[label] ?? task.extractedFields[name] ?? "").trim();
}
