import type { WorkflowTemplate } from "./types.ts";

export function getCreatedTemplateRecordState({
  templates,
  template,
}: {
  templates: WorkflowTemplate[];
  template: WorkflowTemplate;
}) {
  return {
    templates: [template, ...templates],
    selectedTemplateId: template.id,
  };
}

export function getUpdatedTemplateRecordState({
  templates,
  template,
}: {
  templates: WorkflowTemplate[];
  template: WorkflowTemplate;
}) {
  return {
    templates: templates.map((item) => (item.id === template.id ? template : item)),
  };
}

export function getDeletedTemplateRecordState({
  templates,
  selectedTemplateId,
  templateId,
}: {
  templates: WorkflowTemplate[];
  selectedTemplateId: string;
  templateId: string;
}) {
  const nextTemplates = templates.filter((template) => template.id !== templateId);

  return {
    templates: nextTemplates,
    selectedTemplateId:
      selectedTemplateId === templateId
        ? nextTemplates[0]?.id || ""
        : selectedTemplateId,
  };
}
