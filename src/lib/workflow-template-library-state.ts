import type { WorkflowTemplate } from "./types.ts";

export function getWorkflowTemplateLibraryItems({
  workflowTemplates,
  selectedTemplateId,
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
}) {
  const selectedTemplate =
    workflowTemplates.find((template) => template.id === selectedTemplateId) ||
    workflowTemplates[0];

  return workflowTemplates.map((template) => ({
    id: template.id,
    template,
    isSelected: template.id === selectedTemplate?.id,
    businessDepartmentLabel: `${template.business} - ${template.department}`,
    countsLabel: `${template.documents.length} document(s), ${template.fields.length} field(s), ${template.steps.length} step(s)`,
    openActionLabel: "Open in Canvas",
    duplicateActionLabel: "Duplicate as New Template",
  }));
}
