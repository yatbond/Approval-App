import type {
  FormLibraryDefinition,
  FormLibraryFieldInputSource,
  FormLibraryResponseMode,
  FormLibrarySource,
  FormParticipantMapping,
  FormLayout,
  WorkflowField,
  WorkflowTemplate,
} from "./types.ts";
import { isNativeFormChoiceField } from "./workflow-native-form-state.ts";
import { addWorkflowDocumentToNode, createWorkflowGraphFromTemplate } from "./workflow-graph.ts";
import { createDefaultFormLayout, normalizeFormLayout } from "./form-layout-state.ts";

export type FormLibrarySaveMode = "draft" | "publish";

export type FormLibraryDraft = {
  name: string;
  description: string;
  business: string;
  department: string;
  source: FormLibrarySource;
  responseMode: FormLibraryResponseMode;
  responseUrl: string;
  embedUrl: string;
  targetWorkflowTemplateId: string;
  versionComment: string;
  fields: WorkflowField[];
  layout: FormLayout;
  attachmentFields: FormLibraryDefinition["attachmentFields"];
  participantMappings: FormParticipantMapping[];
};

export function createEmptyFormLibraryDraft(
  source: FormLibrarySource = "native",
  defaults: { business?: string; department?: string } = {},
): FormLibraryDraft {
  const firstField = createFormLibraryField(
    "New field",
    source === "microsoft_forms" ? "microsoft_forms" : "approval_app",
  );
  return {
    name: source === "microsoft_forms" ? "Microsoft form" : "Untitled form",
    description: "",
    business: defaults.business || "",
    department: defaults.department || "",
    source,
    responseMode: source === "microsoft_forms" ? "complete_node" : "manual",
    responseUrl: "",
    embedUrl: "",
    targetWorkflowTemplateId: "",
    versionComment: "",
    fields: [firstField],
    layout: createDefaultFormLayout([firstField]),
    attachmentFields: [],
    participantMappings: [],
  };
}

export function createFormLibraryField(
  label: string,
  inputSource: FormLibraryFieldInputSource = "approval_app",
): WorkflowField {
  const cleanLabel = label.trim() || "New field";
  return {
    name: toFieldName(cleanLabel),
    label: cleanLabel,
    type: "text",
    required: false,
    source: inputSource === "attachment_extraction" ? "ai" : "manual",
    instructions: "",
    inputSource,
    ...(inputSource === "microsoft_forms"
      ? { externalQuestionLabel: cleanLabel }
      : {}),
  };
}

export function getFormLibraryFieldInputSource(
  field: WorkflowField,
  formSource: FormLibrarySource,
): FormLibraryFieldInputSource {
  if (field.inputSource) {
    return field.inputSource;
  }
  return formSource === "microsoft_forms" ? "microsoft_forms" : "approval_app";
}

export function extractMicrosoftFormId(responseUrl: string) {
  const trimmed = responseUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    const pathId = url.pathname.match(/\/(?:r|e)\/([^/?#]+)/i)?.[1];
    return pathId || url.searchParams.get("id") || "";
  } catch {
    return "";
  }
}

export function getFormLibraryPreflightIssues(
  draft: FormLibraryDraft,
  templates: WorkflowTemplate[],
) {
  const issues: string[] = [];
  if (!draft.name.trim()) {
    issues.push("Add a form name.");
  }
  if (!draft.fields.length && !draft.attachmentFields?.length) {
    issues.push("Add at least one value or attachment field.");
  }
  draft.fields.forEach((field) => {
    const inputSource = getFormLibraryFieldInputSource(field, draft.source);
    if (
      inputSource === "approval_app" &&
      isNativeFormChoiceField(field.type) &&
      !field.options?.some((option) => option.trim())
    ) {
      issues.push(`${field.label}: add at least one choice.`);
    }
    if (draft.source === "microsoft_forms" && inputSource === "microsoft_forms") {
      if (!field.externalQuestionLabel?.trim() && !field.label.trim()) {
        issues.push(`${field.label || "Request field"}: add the Microsoft Forms question label.`);
      }
    }
    if (inputSource === "attachment_extraction") {
      const attachment = (draft.attachmentFields || []).find(
        (item) => item.name === field.attachmentFieldName,
      );
      if (!attachment) {
        issues.push(`${field.label}: choose the attachment AI should parse.`);
      } else if (field.required && !attachment.required) {
        issues.push(
          `${field.label}: mark the linked attachment "${attachment.label}" as required.`,
        );
      }
    }
  });
  if (draft.source === "microsoft_forms") {
    if (!extractMicrosoftFormId(draft.responseUrl)) {
      issues.push("Add a valid Microsoft Forms response link.");
    }
    if (draft.responseMode === "start_workflow" && !draft.targetWorkflowTemplateId) {
      issues.push("Choose the published workflow this form starts.");
    }
    if (
      draft.targetWorkflowTemplateId &&
      !templates.some(
        (template) =>
          template.id === draft.targetWorkflowTemplateId &&
          template.isDraft !== true &&
          template.isArchived !== true,
      )
    ) {
      issues.push("The selected start workflow is not published and active.");
    }
  }
  return issues;
}

export function saveFormLibraryDraft({
  library,
  draft,
  actorEmail,
  existingDefinition,
  saveMode = "publish",
  workflowTemplates = [],
  now = new Date(),
}: {
  library: FormLibraryDefinition[];
  draft: FormLibraryDraft;
  actorEmail: string;
  existingDefinition?: FormLibraryDefinition | null;
  saveMode?: FormLibrarySaveMode;
  workflowTemplates?: WorkflowTemplate[];
  now?: Date;
}) {
  const timestamp = now.toISOString();
  const formKey = existingDefinition?.formKey || `form-${toFieldName(draft.name)}-${now.getTime()}`;
  const currentVersions = library.filter((item) => item.formKey === formKey);
  const nextVersion = currentVersions.length
    ? Math.max(...currentVersions.map((item) => item.version)) + 1
    : 1;
  const isUpdatingDraft = Boolean(existingDefinition?.isDraft);
  const version = isUpdatingDraft ? existingDefinition?.version || nextVersion : nextVersion;
  const externalFormId =
    draft.source === "microsoft_forms" ? extractMicrosoftFormId(draft.responseUrl) : undefined;
  const issues = getFormLibraryPreflightIssues(draft, workflowTemplates);
  const isDraft = saveMode === "draft";
  const canPublish = !isDraft && issues.length === 0;
  const definition: FormLibraryDefinition = {
    id: isUpdatingDraft ? existingDefinition?.id || `${formKey}-v${version}` : `${formKey}-v${version}`,
    formKey,
    name: draft.name.trim(),
    description: draft.description.trim(),
    business: draft.business.trim() || undefined,
    department: draft.department.trim() || undefined,
    source: draft.source,
    version,
    versionComment: draft.versionComment.trim(),
    isDraft,
    isActiveVersion: canPublish,
    status: issues.length ? "setup_required" : "ready",
    fields: draft.fields.map((field) => {
      const inputSource = getFormLibraryFieldInputSource(field, draft.source);
      return {
        ...field,
        inputSource,
        source: inputSource === "attachment_extraction" ? ("ai" as const) : ("manual" as const),
        options: inputSource === "microsoft_forms" ? undefined : field.options,
        instructions:
          inputSource === "attachment_extraction"
            ? field.instructions.trim() || `Extract ${field.label}.`
            : field.instructions,
        ...(inputSource === "microsoft_forms"
          ? { externalQuestionLabel: field.externalQuestionLabel?.trim() || field.label }
          : {}),
      };
    }),
    layout: normalizeFormLayout(draft.layout, draft.fields),
    attachmentFields: draft.attachmentFields || [],
    responseMode: draft.responseMode,
    responseUrl: draft.responseUrl.trim() || undefined,
    embedUrl: draft.embedUrl.trim() || undefined,
    externalFormId,
    schemaFingerprint: buildFormSchemaFingerprint(draft),
    targetWorkflowTemplateId: draft.targetWorkflowTemplateId || undefined,
    participantMappings: draft.participantMappings,
    createdByEmail: existingDefinition?.createdByEmail || actorEmail,
    createdAt: existingDefinition?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  const remainingLibrary = library
    .filter((item) => item.id !== definition.id)
    .map((item) =>
      canPublish && item.formKey === formKey && item.status !== "archived"
        ? { ...item, isActiveVersion: false }
        : item,
    );
  return {
    definition,
    library: [definition, ...remainingLibrary],
  };
}

export function getLatestFormLibraryDefinitions(library: FormLibraryDefinition[]) {
  const latest = new Map<string, FormLibraryDefinition>();
  for (const definition of library) {
    const current = latest.get(definition.formKey);
    if (!current || definition.version > current.version) {
      latest.set(definition.formKey, definition);
    }
  }
  return Array.from(latest.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function getActiveFormLibraryDefinitions(library: FormLibraryDefinition[]) {
  const groups = new Map<string, FormLibraryDefinition[]>();
  library
    .filter(
      (definition) =>
        definition.status === "ready" &&
        definition.isDraft !== true,
    )
    .forEach((definition) => {
      groups.set(definition.formKey, [
        ...(groups.get(definition.formKey) || []),
        definition,
      ]);
    });
  return Array.from(groups.values())
    .map((versions) => {
      const explicit = versions.filter((version) => version.isActiveVersion === true);
      return (explicit.length ? explicit : versions).reduce((latest, version) =>
        version.version > latest.version ? version : latest,
      );
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function activateFormLibraryDefinition(
  library: FormLibraryDefinition[],
  definitionId: string,
) {
  const target = library.find((definition) => definition.id === definitionId);
  if (!target || target.isDraft === true || target.status !== "ready") {
    return library;
  }
  return library.map((definition) =>
    definition.formKey === target.formKey && definition.isDraft !== true
      ? { ...definition, isActiveVersion: definition.id === definitionId }
      : definition,
  );
}

export function archiveFormLibraryDefinition(
  library: FormLibraryDefinition[],
  definitionId: string,
) {
  return library.map((definition) =>
    definition.id === definitionId
      ? { ...definition, status: "archived" as const, updatedAt: new Date().toISOString() }
      : definition,
  );
}

export function attachLibraryFormToWorkflow({
  template,
  nodeId,
  definition,
  completionRequired = true,
}: {
  template: WorkflowTemplate;
  nodeId: string;
  definition: FormLibraryDefinition;
  completionRequired?: boolean;
}) {
  if (
    definition.status !== "ready" ||
    definition.isDraft === true ||
    definition.isActiveVersion === false
  ) {
    return {
      didUpdate: false,
      template,
      message: "Only active published forms can be added.",
    };
  }
  const graph = createWorkflowGraphFromTemplate(template);
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node || !["submit_request", "approval"].includes(node.kind)) {
    return {
      didUpdate: false,
      template,
      message: "Forms can only be added to Submit or Approval boxes.",
    };
  }

  const nextTemplate = addWorkflowDocumentToNode(template, nodeId, {
    documentType: definition.name,
    format: "text",
    inputMode: "manual_form",
    required: completionRequired,
    fields: definition.fields.map((field) => ({ ...field })),
    formLibraryRef: {
      definitionId: definition.id,
      formKey: definition.formKey,
      version: definition.version,
      source: definition.source,
      responseMode: definition.responseMode,
      responseUrl: definition.responseUrl,
      embedUrl: definition.embedUrl,
      externalFormId: definition.externalFormId,
      schemaFingerprint: definition.schemaFingerprint,
      completionRequired,
      selectedFieldNames: definition.fields.map((field) => field.name),
      selectedAttachmentNames: (definition.attachmentFields || []).map((field) => field.name),
      attachmentFields: (definition.attachmentFields || []).map((field) => ({ ...field })),
      layout: definition.layout,
    },
  });
  return {
    didUpdate: true,
    template: nextTemplate,
    message: `Added ${definition.name} v${definition.version} to ${node.label}.`,
  };
}

export function getFormParticipantNodes(template?: WorkflowTemplate | null) {
  if (!template) {
    return [];
  }
  return createWorkflowGraphFromTemplate(template).nodes.filter((node) =>
    ["submit_request", "approval", "fyi"].includes(node.kind),
  );
}

function buildFormSchemaFingerprint(draft: FormLibraryDraft) {
  return JSON.stringify({
    fields: draft.fields.map((field) => {
      const inputSource = getFormLibraryFieldInputSource(field, draft.source);
      return [
        field.name,
        field.label,
        field.type,
        field.required,
        inputSource === "microsoft_forms" ? [] : field.options || [],
        inputSource,
        field.externalQuestionLabel || "",
        field.attachmentFieldName || "",
        field.instructions || "",
      ];
    }),
    attachments: (draft.attachmentFields || []).map((field) => [
      field.name,
      field.label,
      field.required,
    ]),
    layout: normalizeFormLayout(draft.layout, draft.fields),
  });
}

function toFieldName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}
