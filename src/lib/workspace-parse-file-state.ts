import { createAttachmentRecord } from "./workflow-documents.ts";
import type { ParsedWorkspaceFilePayload } from "./workspace-file-api.ts";
import type {
  ApprovalActor,
  ApprovalAttachment,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "./types.ts";

export function getWorkspaceParseFileStartState(file: File) {
  return {
    fileName: file.name,
    parseError: "",
    submissionMessage: "",
    isParsing: true,
    parseResult: null,
    editedFields: {},
  };
}

export function getWorkspaceParseFileStoredAttachmentState({
  uploadedAttachments,
  selectedTemplate,
  file,
  documentRequirement,
  activeUser,
  storagePath,
  publicUrl,
}: {
  uploadedAttachments: ApprovalAttachment[];
  selectedTemplate?: WorkflowTemplate;
  file: File;
  documentRequirement?: WorkflowDocumentRequirement;
  activeUser: ApprovalActor;
  storagePath?: string;
  publicUrl?: string;
}) {
  if (!selectedTemplate) {
    return { uploadedAttachments };
  }

  return {
    uploadedAttachments: [
      ...uploadedAttachments,
      createAttachmentRecord({
        file,
        documentRequirement,
        template: selectedTemplate,
        uploadedBy: activeUser.email,
        storagePath,
        publicUrl,
      }),
    ],
  };
}

export function getWorkspaceParseFileSuccessState(
  parseResult: ParsedWorkspaceFilePayload,
) {
  return {
    parseResult,
    editedFields: parseResult.fields || {},
    isParsing: false,
  };
}
