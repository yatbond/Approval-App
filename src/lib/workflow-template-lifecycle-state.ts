import type { WorkflowTemplate } from "./types.ts";

export function getWorkflowTemplateLifecycleState(template: WorkflowTemplate | null) {
  if (!template) {
    return {
      statusLabel: "No template",
      statusTone: "empty",
      detail: "Create or select a workflow template before editing.",
      canPublish: false,
      publishLabel: "Publish version",
      publishTitle: "Select a draft workflow before publishing.",
    };
  }

  if (template.isArchived === true) {
    return {
      statusLabel: "Archived",
      statusTone: "archived",
      detail: "Kept for history. Archived workflows cannot create new requests.",
      canPublish: false,
      publishLabel: "Archived",
      publishTitle: "Archived workflows are read-only.",
    };
  }

  if (template.isDraft === false) {
    return {
      statusLabel: "Published",
      statusTone: "published",
      detail: "Available for new requests. Published versions are locked; duplicate to revise.",
      canPublish: false,
      publishLabel: "Already published",
      publishTitle: "Duplicate this workflow to create an editable draft.",
    };
  }

  return {
    statusLabel: "Draft",
    statusTone: "draft",
    detail: "Editable draft. Publish when the workflow is ready for new requests.",
    canPublish: true,
    publishLabel: "Publish version",
    publishTitle: "Publish this draft as a locked version for new requests.",
  };
}
