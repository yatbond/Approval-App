import type {
  BusinessUnit,
  WorkflowTemplate,
} from "./types.ts";

export function getWorkflowTemplateLoadState({
  template,
  businessDirectory,
  currentBusinessId,
}: {
  template: WorkflowTemplate;
  businessDirectory: BusinessUnit[];
  currentBusinessId: string;
}) {
  const nextBusiness = businessDirectory.find(
    (business) => business.name === template.business,
  );

  return {
    templateName: template.name,
    businessId: nextBusiness?.id || currentBusinessId,
    shouldSetBusinessId: Boolean(nextBusiness),
    departmentName: template.department,
    selectedTemplateId: template.id,
    workflowEditorTab: "canvas" as const,
    shouldResetCanvasView: true,
  };
}
