"use client";

import {
  FileText,
  Loader2,
  ScanSearch,
  Trash2,
  Upload,
} from "lucide-react";
import type { getUploadViewState } from "@/lib/upload-view-state";
import {
  acceptForDocumentFormat,
  formatDocumentFormat,
} from "@/lib/workflow-documents";
import {
  getWorkflowParticipantEmailFields,
  type WorkflowParticipantEmailMap,
} from "@/lib/workflow-participant-assignment-state";
import type { ParsedWorkspaceFilePayload } from "@/lib/workspace-file-api";
import type {
  ApprovalAttachment,
  WorkflowDocumentRequirement,
  WorkflowField,
} from "@/lib/types";
import { InfoTip } from "./ui-hint";

export type UploadRequestDraftRowView = {
  id: string;
  fileName: string;
  parseResult: ParsedWorkspaceFilePayload | null;
  editedFields: Record<string, string>;
  uploadedAttachments: ApprovalAttachment[];
};

type ParseFileOptions = {
  preserveExistingRequestData?: boolean;
  mergeIntoCurrentRequest?: boolean;
  skipExtraction?: boolean;
};

type UploadRequestSetupPanelProps = {
  viewState: ReturnType<typeof getUploadViewState>;
  participantEmails: WorkflowParticipantEmailMap;
  onSelectTemplate: (templateId: string) => void;
  onFocusParticipant: (nodeId: string) => void;
  onSetParticipantEmail: (nodeId: string, email: string) => void;
  uploadedAttachments: ApprovalAttachment[];
  openingAttachmentId: string;
  onEditAttachmentExtraction: (attachment: ApprovalAttachment) => void;
  onRemoveAttachment: (attachment: ApprovalAttachment) => void;
  requestDrafts: UploadRequestDraftRowView[];
  selectedRequestDraftId: string;
  onSelectRequestDraft: (rowId: string) => void;
  missingRequiredNativeFields: string[];
  missingRequiredNativeAttachments: string[];
  isParsing: boolean;
  fileName: string;
  parseError: string;
  parseFile: (
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
    adHocFields?: WorkflowField[],
    options?: ParseFileOptions,
  ) => void;
  onActivateDocument: (documentId: string) => void;
};

export function UploadRequestSetupPanel({
  viewState,
  participantEmails,
  onSelectTemplate,
  onFocusParticipant,
  onSetParticipantEmail,
  uploadedAttachments,
  openingAttachmentId,
  onEditAttachmentExtraction,
  onRemoveAttachment,
  requestDrafts,
  selectedRequestDraftId,
  onSelectRequestDraft,
  missingRequiredNativeFields,
  missingRequiredNativeAttachments,
  isParsing,
  fileName,
  parseError,
  parseFile,
  onActivateDocument,
}: UploadRequestSetupPanelProps) {
  const {
    requestTemplates,
    selectedTemplate,
    uploadDocuments,
    manualFormDocuments,
    assignedUploadDocuments,
    sharedUploadDocuments,
    assignedManualFormDocuments,
    sharedManualFormDocuments,
    sharedFulfillmentEnabled,
    uploadedDocumentIds,
    missingRequiredDocuments,
  } = viewState;
  const assignedUploadsHeading = sharedFulfillmentEnabled
    ? "Assigned"
    : "Required";
  const participantEmailFields = selectedTemplate
    ? getWorkflowParticipantEmailFields(selectedTemplate)
    : [];
  function renderUploadDocumentRequirement(
    document: WorkflowDocumentRequirement,
    helperText?: string,
  ) {
    return (
      <label
        key={document.id}
        onClick={() => onActivateDocument(document.id)}
        className="block cursor-pointer rounded-md border border-[#e6e6e6] bg-white p-3 transition hover:border-emerald-400/60"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">
              {document.documentType}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {formatDocumentFormat(document.format)} -{" "}
              {document.required ? "Required" : "Optional"} -{" "}
              {document.fields.length} field(s)
            </p>
            {helperText && (
              <p className="mt-1 text-xs text-sky-200/75">{helperText}</p>
            )}
          </div>
          <span className="self-start rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-400">
            {uploadedDocumentIds.has(document.id) ? "Attached" : "Upload"}
          </span>
        </div>
        <input
          type="file"
          className="sr-only"
          accept={acceptForDocumentFormat(document.format)}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              parseFile(file, document);
            }
            event.currentTarget.value = "";
          }}
        />
      </label>
    );
  }

  return (
      <section className="min-w-0 rounded-md border border-[#e6e6e6] bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Request setup</h2>
          <InfoTip label="Choose a template, then upload each required or optional document." />
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-neutral-400">Template</span>
          <select
            value={selectedTemplate?.id || ""}
            onChange={(event) => {
              onSelectTemplate(event.target.value);
            }}
            className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            {requestTemplates.length === 0 && (
              <option value="">No templates</option>
            )}
            {requestTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        {participantEmailFields.length > 0 && (
          <div className="mt-4 rounded-md border border-[#e6e6e6] bg-white p-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-neutral-200">
                Participants
              </p>
              <InfoTip label="Template emails are optional. Fill or change unlocked emails before starting this request. Fixed emails come from the template and cannot be changed here." />
            </div>
            <div className="mt-3 space-y-3">
              {participantEmailFields.map((field) => {
                const value = field.isFixed
                  ? field.email
                  : participantEmails[field.nodeId] ?? field.email;
                return (
                  <label
                    key={field.nodeId}
                    className="block min-w-0 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3"
                  >
                    <span className="flex min-w-0 items-center justify-between gap-2 text-xs text-neutral-400">
                      <span className="min-w-0 break-words">
                        {field.label} - {field.inputLabel}
                      </span>
                      {field.isFixed && (
                        <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">
                          Fixed
                        </span>
                      )}
                    </span>
                    <input
                      type="email"
                      value={value}
                      disabled={field.isFixed}
                      placeholder="name@example.com"
                      onFocus={() => onFocusParticipant(field.nodeId)}
                      onChange={(event) =>
                        onSetParticipantEmail(field.nodeId, event.target.value)
                      }
                      className="mt-2 h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none transition focus:border-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-65"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {selectedTemplate && (
          <div className="mt-4 space-y-3">
            {assignedUploadDocuments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-neutral-200">
                  {assignedUploadsHeading}
                </p>
                {assignedUploadDocuments.map((document) =>
                  renderUploadDocumentRequirement(document),
                )}
              </div>
            )}
            {sharedUploadDocuments.length > 0 && (
              <div className="space-y-2 rounded-md border border-sky-500/25 bg-sky-500/10 p-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-sky-100">
                    Shared uploads
                  </p>
                  <InfoTip label="Uploading here records you as the uploader while keeping the original submit box visible in tracking." />
                </div>
                {sharedUploadDocuments.map((document) =>
                  renderUploadDocumentRequirement(
                    document,
                    "Shared fulfillment for another submitter's requirement.",
                  ),
                )}
              </div>
            )}
            {!uploadDocuments.length && !manualFormDocuments.length && (
              <div className="rounded-md border border-[#e6e6e6] bg-white p-3 text-sm text-neutral-400">
                No requirements.
              </div>
            )}
            {(assignedManualFormDocuments.length > 0 ||
              sharedManualFormDocuments.length > 0) && (
              <div className="rounded-md border border-sky-500/25 bg-sky-500/10 p-3">
                <p className="text-sm font-semibold text-sky-100">
                  Native form
                </p>
                <div className="mt-2 space-y-1 text-xs text-sky-100/80">
                  {assignedManualFormDocuments.map((document) => (
                    <p key={document.id}>
                      {document.documentType} - {document.fields.length} field(s)
                    </p>
                  ))}
                  {sharedManualFormDocuments.map((document) => (
                    <p key={document.id}>
                      {document.documentType} - {document.fields.length} field(s)
                      {" "}shared
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {uploadedAttachments.length > 0 && (
          <div className="mt-4 rounded-md border border-[#e6e6e6] bg-white p-3">
            <p className="text-sm font-semibold text-neutral-200">Files</p>
            <div className="mt-2 space-y-2">
              {uploadedAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-neutral-200">
                        {attachment.fileName}
                      </p>
                      <p className="mt-1 text-neutral-500">
                        {attachment.documentType}
                        {attachment.workflowNodeId
                          ? ` - ${attachment.workflowNodeId}`
                          : ""}
                      </p>
                      {attachment.storagePath && (
                        <p className="mt-1 break-words text-emerald-200">
                          Stored: {attachment.storagePath}
                        </p>
                      )}
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        title="Reopen the stored document and edit its extraction boxes."
                        onClick={() => void onEditAttachmentExtraction(attachment)}
                        disabled={Boolean(openingAttachmentId)}
                        className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 font-medium text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {openingAttachmentId === attachment.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ScanSearch size={14} />
                        )}
                        Edit extraction
                      </button>
                      <button
                        type="button"
                        title="Remove this document and its extracted values from the draft."
                        onClick={() => void onRemoveAttachment(attachment)}
                        disabled={Boolean(openingAttachmentId)}
                        className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 font-medium text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {requestDrafts.length > 0 && (
          <div className="mt-4 rounded-md border border-[#e6e6e6] bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-200">
                  Requests in this upload
                </p>
                <InfoTip label="Each uploaded document will submit as a separate request." />
              </div>
              <span className="shrink-0 rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-400">
                {requestDrafts.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {requestDrafts.map((draft, index) => {
                const fieldCount = Object.keys(draft.editedFields).length;
                const isSelected = draft.id === selectedRequestDraftId;
                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => onSelectRequestDraft(draft.id)}
                    className={`w-full rounded-md border p-2 text-left text-xs transition ${
                      isSelected
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
                        : "border-[#e6e6e6] bg-[#f7f7f5] text-neutral-300 hover:border-[#d2d2d2]"
                    }`}
                  >
                    <span className="block truncate font-medium">
                      Request {index + 1}: {draft.fileName}
                    </span>
                    <span className="mt-1 block text-neutral-500">
                      {fieldCount} field(s), {draft.uploadedAttachments.length} attachment(s)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {missingRequiredDocuments.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Missing uploads:{" "}
            {missingRequiredDocuments
              .map((document) => document.documentType)
              .join(", ")}
          </div>
        )}

        {missingRequiredNativeFields.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-900 dark:text-amber-100">
            Complete required form fields: {missingRequiredNativeFields.join(", ")}
          </div>
        )}

        {missingRequiredNativeAttachments.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-900 dark:text-amber-100">
            Upload required form attachments:{" "}
            {Array.from(new Set(missingRequiredNativeAttachments)).join(", ")}
          </div>
        )}

        <label className="mt-4 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#d2d2d2] bg-white p-6 text-center transition hover:border-emerald-400/60 hover:bg-emerald-400/5">
          {isParsing || openingAttachmentId ? (
            <Loader2 className="mb-3 animate-spin text-emerald-200" size={28} />
          ) : (
            <Upload className="mb-3 text-neutral-300" size={28} />
          )}
          <span className="text-sm font-medium">
            {openingAttachmentId
              ? "Opening saved file"
              : isParsing
                ? "Parsing"
                : "Choose file"}
          </span>
          <span className="mt-1 text-xs text-neutral-500">PDF, image, Excel, or CSV</span>
          <input
            type="file"
            disabled={isParsing || Boolean(openingAttachmentId)}
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                parseFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </label>

        {fileName && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-[#e6e6e6] bg-white p-3 text-sm">
            <FileText size={16} className="text-emerald-200" />
            <span className="truncate">{fileName}</span>
          </div>
        )}

        {parseError && (
          <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
            {parseError}
          </div>
        )}
      </section>
  );
}
