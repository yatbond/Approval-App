import type {
  ApprovalAttachment,
  ApprovalTask,
  FormLibraryDefinition,
  WorkflowDocumentRequirement,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "./types.ts";
import type { ExternalFormIntake } from "./external-form-intake.ts";
import type { WorkspaceStateSnapshot } from "./workspace-persistence.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";
import {
  applyWorkflowParticipantEmails,
  getMissingWorkflowParticipantEmails,
  type WorkflowParticipantEmailMap,
} from "./workflow-participant-assignment-state.ts";

export type ExternalFormProcessingResult =
  | {
      success: true;
      snapshot: WorkspaceStateSnapshot;
      requestNo: string;
      message: string;
    }
  | {
      success: false;
      status: "failed" | "schema_changed";
      message: string;
    };

export function processExternalFormIntake({
  snapshot,
  intake,
  now = new Date(),
}: {
  snapshot: WorkspaceStateSnapshot;
  intake: ExternalFormIntake;
  now?: Date;
}): ExternalFormProcessingResult {
  const definition = snapshot.formLibrary.find(
    (item) =>
      item.formKey === intake.formKey &&
      item.version === intake.formVersion &&
      item.source === "microsoft_forms",
  );
  if (!definition) {
    return failure(
      "schema_changed",
      `Registered form ${intake.formKey} v${intake.formVersion} was not found in this workspace.`,
    );
  }
  if (definition.status !== "ready") {
    return failure("schema_changed", `Registered form version is ${definition.status}.`);
  }
  if (definition.externalFormId !== intake.externalFormId) {
    return failure("schema_changed", "The Microsoft Form ID does not match the registered form version.");
  }
  if (definition.schemaFingerprint !== intake.schemaFingerprint) {
    return failure(
      "schema_changed",
      "The form schema no longer matches the pinned library version. Register a new version before accepting responses.",
    );
  }
  if (definition.responseMode !== intake.responseMode) {
    return failure("failed", "The response mode does not match the registered form version.");
  }

  const answerValidation = validateAnswers(definition, intake.answers);
  if (!answerValidation.success) {
    return answerValidation;
  }
  const attachmentValidation = validateAttachments(definition, intake.attachments);
  if (!attachmentValidation.success) {
    return attachmentValidation;
  }

  if (intake.responseMode === "complete_node") {
    return completeRequestNode(snapshot, definition, intake, answerValidation.answers, now);
  }
  return startWorkflow(snapshot, definition, intake, answerValidation.answers, now);
}

function completeRequestNode(
  snapshot: WorkspaceStateSnapshot,
  definition: FormLibraryDefinition,
  intake: ExternalFormIntake,
  answers: Record<string, string>,
  now: Date,
): ExternalFormProcessingResult {
  const requestNo = intake.approvalRequestNo || intake.correlationToken;
  if (!requestNo) {
    return failure("failed", "Approval Request Reference is required for this form response.");
  }
  const taskIndex = snapshot.approvalTasks.findIndex((task) => task.id === requestNo);
  if (taskIndex < 0) {
    return failure("failed", `Approval request ${requestNo} was not found in this workspace.`);
  }
  const task = snapshot.approvalTasks[taskIndex];
  const requirement = findPinnedRequirement(task.workflowTemplateSnapshot, definition);
  if (!requirement) {
    return failure(
      "schema_changed",
      `Approval request ${requestNo} is not pinned to ${definition.name} v${definition.version}.`,
    );
  }
  const duplicate = task.externalFormResponses?.some(
    (response) =>
      response.provider === intake.provider &&
      response.externalResponseId === intake.externalResponseId,
  );
  if (duplicate) {
    return {
      success: true,
      snapshot,
      requestNo,
      message: "This form response was already applied to the request.",
    };
  }

  const attachments = createExternalAttachments(intake, requirement, now);
  const updatedTask: ApprovalTask = {
    ...task,
    extractedFields: { ...task.extractedFields, ...answers },
    attachments: [...(task.attachments || []), ...attachments],
    externalFormResponses: [
      ...(task.externalFormResponses || []),
      createResponseRecord(definition, intake, answers, attachments, now),
    ],
    lastAction: `${definition.name} response received`,
    auditTrail: [
      ...task.auditTrail,
      {
        id: `${task.id}-event-${task.auditTrail.length + 1}`,
        action: "amended",
        actor: intake.respondentName || "Microsoft Forms respondent",
        actorEmail: intake.respondentEmail || "microsoft-forms@external.invalid",
        timestamp: now.toISOString(),
        detail: `${definition.name} v${definition.version} response ${intake.externalResponseId} was added to this request.`,
      },
    ],
  };
  const tasks = [...snapshot.approvalTasks];
  tasks[taskIndex] = updatedTask;
  return {
    success: true,
    snapshot: { ...snapshot, approvalTasks: tasks },
    requestNo,
    message: "Form values and attachments were added. The current owner must still approve the request.",
  };
}

function startWorkflow(
  snapshot: WorkspaceStateSnapshot,
  definition: FormLibraryDefinition,
  intake: ExternalFormIntake,
  answers: Record<string, string>,
  now: Date,
): ExternalFormProcessingResult {
  const template = snapshot.workflowTemplates.find(
    (item) => item.id === definition.targetWorkflowTemplateId,
  );
  if (!template || template.isDraft === true || template.isArchived === true) {
    return failure("failed", "The published workflow linked to this form is unavailable.");
  }
  const participantEmails = resolveParticipantEmails(template, definition, intake, answers);
  const assignedTemplate = applyWorkflowParticipantEmails(template, participantEmails);
  const missingParticipants = getMissingWorkflowParticipantEmails(assignedTemplate);
  if (missingParticipants.length) {
    return failure(
      "failed",
      `Workflow cannot start until these participant emails are resolved: ${missingParticipants.join(", ")}.`,
    );
  }
  if (!intake.respondentEmail) {
    return failure("failed", "Respondent email is required to start a workflow.");
  }

  const requestNo = intake.approvalRequestNo || createExternalRequestNo(now, intake.externalResponseId);
  if (snapshot.approvalTasks.some((task) => task.id === requestNo)) {
    return failure("failed", `Approval request ${requestNo} already exists.`);
  }
  const attachments = createExternalAttachments(intake, undefined, now);
  const task = createApprovalTaskFromTemplate({
    id: requestNo,
    now,
    requester: {
      name: intake.respondentName || intake.respondentEmail,
      email: intake.respondentEmail,
    },
    template: assignedTemplate,
    sourceFileName: definition.name,
    extractedFields: answers,
    attachments,
  });
  task.externalFormResponses = [
    createResponseRecord(definition, intake, answers, attachments, now),
  ];
  return {
    success: true,
    snapshot: { ...snapshot, approvalTasks: [task, ...snapshot.approvalTasks] },
    requestNo,
    message: `Workflow started and routed to ${task.currentOwner}.`,
  };
}

function validateAnswers(
  definition: FormLibraryDefinition,
  rawAnswers: ExternalFormIntake["answers"],
):
  | { success: true; answers: Record<string, string> }
  | { success: false; status: "schema_changed"; message: string } {
  const knownKeys = new Map<string, string>();
  for (const field of definition.fields) {
    knownKeys.set(normalizeKey(field.name), field.label);
    knownKeys.set(normalizeKey(field.label), field.label);
  }
  const unknownKeys = Object.keys(rawAnswers).filter(
    (key) => !knownKeys.has(normalizeKey(key)),
  );
  if (unknownKeys.length) {
    return failure(
      "schema_changed",
      `Unexpected form question(s): ${unknownKeys.join(", ")}. Register a new form version and review workflow mappings.`,
    );
  }

  const answers: Record<string, string> = {};
  for (const field of definition.fields) {
    const entry = Object.entries(rawAnswers).find(
      ([key]) => normalizeKey(key) === normalizeKey(field.name) || normalizeKey(key) === normalizeKey(field.label),
    );
    const value = stringifyAnswer(entry?.[1]);
    if (field.required && !value) {
      return failure("schema_changed", `Required form question is missing: ${field.label}.`);
    }
    if (value) {
      answers[field.label] = value;
    }
  }
  return { success: true, answers };
}

function validateAttachments(
  definition: FormLibraryDefinition,
  attachments: ExternalFormIntake["attachments"],
): { success: true } | { success: false; status: "schema_changed"; message: string } {
  const knownNames = new Set(
    (definition.attachmentFields || []).map((field) => normalizeKey(field.name)),
  );
  const unknown = attachments.filter((item) => !knownNames.has(normalizeKey(item.fieldName)));
  if (unknown.length) {
    return failure(
      "schema_changed",
      `Unexpected attachment question(s): ${unknown.map((item) => item.fieldName).join(", ")}.`,
    );
  }
  const missing = (definition.attachmentFields || []).filter(
    (field) =>
      field.required &&
      !attachments.some((item) => normalizeKey(item.fieldName) === normalizeKey(field.name)),
  );
  return missing.length
    ? failure("schema_changed", `Required attachment is missing: ${missing.map((item) => item.label).join(", ")}.`)
    : { success: true };
}

function resolveParticipantEmails(
  template: WorkflowTemplate,
  definition: FormLibraryDefinition,
  intake: ExternalFormIntake,
  answers: Record<string, string>,
) {
  const result: WorkflowParticipantEmailMap = {};
  for (const node of template.graph?.nodes || []) {
    if (!isParticipantNode(node)) continue;
    const mapping = definition.participantMappings?.find((item) => item.nodeId === node.id);
    let email = node.assigneeEmail || "";
    if (mapping?.source === "responder") email = intake.respondentEmail || "";
    if (mapping?.source === "form_field") {
      email = findAnswer(answers, mapping.fieldName || "");
    }
    if (mapping?.source === "fixed_template") email = node.assigneeEmail || "";
    // Directory and manual mappings use a template default when one exists; otherwise preflight fails.
    result[node.id] = email;
  }
  return result;
}

function createExternalAttachments(
  intake: ExternalFormIntake,
  requirement: WorkflowDocumentRequirement | undefined,
  now: Date,
): ApprovalAttachment[] {
  return intake.attachments.map((item, index) => ({
    id: `form-${intake.externalResponseId}-${index + 1}`,
    fileName: item.fileName,
    ...(requirement ? { documentId: requirement.id } : {}),
    documentType: item.fieldName,
    format: "ad_hoc",
    ...(item.driveItemId ? { storagePath: `microsoft-drive:${item.driveItemId}` } : {}),
    ...(item.downloadUrl ? { publicUrl: item.downloadUrl } : {}),
    uploadedBy: intake.respondentEmail || "Microsoft Forms respondent",
    uploadedAt: now.toISOString(),
  }));
}

function createResponseRecord(
  definition: FormLibraryDefinition,
  intake: ExternalFormIntake,
  answers: Record<string, string>,
  attachments: ApprovalAttachment[],
  now: Date,
) {
  return {
    provider: intake.provider,
    formKey: definition.formKey,
    formVersion: definition.version,
    definitionId: definition.id,
    externalResponseId: intake.externalResponseId,
    responseMode: intake.responseMode,
    status: "applied" as const,
    answers,
    attachmentIds: attachments.map((item) => item.id),
    ...(intake.respondentEmail ? { respondentEmail: intake.respondentEmail } : {}),
    submittedAt: now.toISOString(),
  };
}

function findPinnedRequirement(
  template: WorkflowTemplate | undefined,
  definition: FormLibraryDefinition,
) {
  return template?.documents.find(
    (document) =>
      document.formLibraryRef?.formKey === definition.formKey &&
      document.formLibraryRef.version === definition.version,
  );
}

function isParticipantNode(node: WorkflowGraphNode) {
  return ["submit_request", "approval", "review", "for_information"].includes(node.kind);
}

function stringifyAnswer(value: ExternalFormIntake["answers"][string] | undefined) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ").trim();
  return String(value).trim();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function findAnswer(answers: Record<string, string>, name: string) {
  const key = normalizeKey(name);
  return Object.entries(answers).find(([label]) => normalizeKey(label) === key)?.[1] || "";
}

function createExternalRequestNo(now: Date, externalResponseId: string) {
  const suffix = externalResponseId.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(-24);
  return `APR-FORM-${Math.floor(now.getTime() / 1000)}-${suffix || "response"}`;
}

function failure<T extends "failed" | "schema_changed">(status: T, message: string) {
  return { success: false as const, status, message };
}
