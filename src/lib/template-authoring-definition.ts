import type { WorkflowTemplate } from "./types.ts";
import {
  templateDefinitionV1Schema,
  templateAuthoringContractVersion,
  type TemplateDefinitionV1,
} from "./template-authoring-contracts.ts";
import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";

export function createTemplateDefinitionV1({
  template,
  sourceDossierId,
  mode,
  generatedAt,
  generatedByEmail,
  unresolvedQuestionIds = [],
}: {
  template: WorkflowTemplate;
  sourceDossierId: string;
  mode: "manual" | "copilot" | "external_agent";
  generatedAt: string;
  generatedByEmail: string;
  unresolvedQuestionIds?: string[];
}): TemplateDefinitionV1 {
  return templateDefinitionV1Schema.parse({
    schemaVersion: templateAuthoringContractVersion,
    sourceDossierId,
    template: {
      id: template.id,
      name: template.name,
      business: template.business,
      department: template.department,
      version: template.version || 1,
      isDraft: template.isDraft !== false,
      documentTypes: template.documentTypes,
      documents: template.documents,
      languages: template.languages,
      fields: template.fields,
      extractionExamples: template.extractionExamples,
      steps: template.steps,
      graph: createWorkflowGraphFromTemplate(template),
    },
    generation: {
      mode,
      generatedAt,
      generatedByEmail,
      unresolvedQuestionIds,
    },
  });
}

export function workflowTemplateFromDefinition(
  definition: TemplateDefinitionV1,
): WorkflowTemplate {
  const parsed = templateDefinitionV1Schema.parse(definition);
  return {
    ...parsed.template,
    graph: parsed.template.graph,
    steps: parsed.template.steps as WorkflowTemplate["steps"],
  };
}
