import { findTemplateForTask } from "./task-display.ts";
import { createAttachmentRecord } from "./workflow-documents.ts";
import type {
  ApprovalActor,
  ApprovalTask,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "./types.ts";

export function attachDocumentToTaskState({
  tasks,
  templates,
  taskId,
  file,
  documentRequirement,
  activeUser,
  storagePath,
  publicUrl,
  idPrefix,
  uploadedAt,
}: {
  tasks: ApprovalTask[];
  templates: WorkflowTemplate[];
  taskId: string;
  file: { name: string };
  documentRequirement: WorkflowDocumentRequirement;
  activeUser: ApprovalActor;
  storagePath?: string;
  publicUrl?: string;
  idPrefix?: string;
  uploadedAt?: string;
}) {
  return tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    const template = findTemplateForTask(task, templates);
    if (!template) {
      return task;
    }

    const attachment = createAttachmentRecord({
      file,
      documentRequirement,
      template,
      uploadedBy: activeUser.email,
      storagePath,
      publicUrl,
      idPrefix,
      uploadedAt,
    });

    return {
      ...task,
      attachments: [...(task.attachments || []), attachment],
      participants: Array.from(new Set([...task.participants, activeUser.email])),
      lastAction: `Document uploaded by ${activeUser.name}`,
      auditTrail: [
        ...task.auditTrail,
        {
          id: `${task.id}-event-${task.auditTrail.length + 1}`,
          action: "amended" as const,
          actor: activeUser.name,
          actorEmail: activeUser.email,
          timestamp: uploadedAt || new Date().toISOString(),
          detail: `Uploaded ${documentRequirement.documentType}: ${file.name}.`,
        },
      ],
    };
  });
}
