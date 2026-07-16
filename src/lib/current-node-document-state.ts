import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";
import { isManualFormRequirement } from "./workflow-documents.ts";
import type {
  ApprovalTask,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "./types.ts";

export type CurrentNodeDocumentFieldIssue = {
  document: WorkflowDocumentRequirement;
  fields: WorkflowField[];
};

export function getCurrentNodeUploadRequirements(
  task: ApprovalTask,
  template: WorkflowTemplate,
) {
  if (!task.currentNodeId) return [];
  const graph = createWorkflowGraphFromTemplate(template);
  const node = graph.nodes.find((item) => item.id === task.currentNodeId);
  const documentIds = new Set(node?.documentIds || []);
  return template.documents.filter(
    (document) =>
      documentIds.has(document.id) && !isManualFormRequirement(document),
  );
}

export function getCurrentNodeDocumentFieldIssues(
  task: ApprovalTask,
  template: WorkflowTemplate,
): CurrentNodeDocumentFieldIssue[] {
  const issues: CurrentNodeDocumentFieldIssue[] = [];
  for (const document of getCurrentNodeUploadRequirements(task, template)) {
    if (!document.required) continue;
    const missingFields = document.fields.filter(
      (field) =>
        field.required &&
        !(task.extractedFields[field.label] ?? task.extractedFields[field.name] ?? "").trim(),
    );
    if (missingFields.length) {
      issues.push({ document, fields: missingFields });
    }
  }
  return issues;
}
