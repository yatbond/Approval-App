"use client";

import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Send,
  Upload,
} from "lucide-react";
import {
  acceptForDocumentFormat,
  formatDocumentFormat,
} from "@/lib/workflow-documents";
import { getUploadViewState } from "@/lib/upload-view-state";
import type {
  ApprovalAttachment,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";

type ParseResult = {
  strategy: string;
  fields: Record<string, string>;
  confidence: Record<string, string>;
  notes: string[];
  tables?: { sheetName: string; rows: Record<string, unknown>[] }[];
};

export function UploadView({
  fileName,
  parseResult,
  editedFields,
  setEditedFields,
  isParsing,
  parseError,
  parseFile,
  uploadedAttachments,
  workflowTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  submissionMessage,
  onSubmitRequest,
}: {
  fileName: string;
  parseResult: ParseResult | null;
  editedFields: Record<string, string>;
  setEditedFields: (fields: Record<string, string>) => void;
  isParsing: boolean;
  parseError: string;
  parseFile: (
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
  ) => void;
  uploadedAttachments: ApprovalAttachment[];
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  submissionMessage: string;
  onSubmitRequest: () => void;
}) {
  const {
    selectedTemplate,
    uploadDocuments,
    uploadedDocumentIds,
    missingRequiredDocuments,
  } = getUploadViewState({
    workflowTemplates,
    selectedTemplateId,
    uploadedAttachments,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-semibold">Upload request documents</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Choose a template, then upload each required or optional document.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-neutral-400">Workflow template</span>
          <select
            value={selectedTemplate?.id || ""}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            {workflowTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        {selectedTemplate && (
          <div className="mt-4 space-y-3">
            {uploadDocuments.map((document) => (
              <label
                key={document.id}
                className="block cursor-pointer rounded-md border border-white/10 bg-[#121518] p-3 transition hover:border-emerald-400/60"
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
                  </div>
                  <span className="self-start rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400">
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
                  }}
                />
              </label>
            ))}
            {!uploadDocuments.length && (
              <div className="rounded-md border border-white/10 bg-[#121518] p-3 text-sm text-neutral-400">
                No document requirements are attached to the starting route.
              </div>
            )}
          </div>
        )}

        {uploadedAttachments.length > 0 && (
          <div className="mt-4 rounded-md border border-white/10 bg-[#121518] p-3">
            <p className="text-sm font-semibold text-neutral-200">Attached files</p>
            <div className="mt-2 space-y-2">
              {uploadedAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="rounded-md border border-white/10 bg-[#101214] p-2 text-xs"
                >
                  <p className="break-words text-neutral-200">{attachment.fileName}</p>
                  <p className="mt-1 text-neutral-500">
                    {attachment.documentType}
                    {attachment.workflowNodeId
                      ? ` - ${attachment.workflowNodeId}`
                      : ""}
                  </p>
                  {attachment.storagePath && (
                    <p className="mt-1 break-words text-emerald-200">
                      Stored in Supabase: {attachment.storagePath}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {missingRequiredDocuments.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Missing required upload(s):{" "}
            {missingRequiredDocuments
              .map((document) => document.documentType)
              .join(", ")}
          </div>
        )}

        <label className="mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-[#121518] p-6 text-center transition hover:border-emerald-400/60 hover:bg-emerald-400/5">
          {isParsing ? (
            <Loader2 className="mb-3 animate-spin text-emerald-200" size={28} />
          ) : (
            <Upload className="mb-3 text-neutral-300" size={28} />
          )}
          <span className="text-sm font-medium">
            {isParsing ? "Parsing document" : "Choose a file"}
          </span>
          <span className="mt-1 text-xs text-neutral-500">Ad hoc PDF, image, Excel, or CSV</span>
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                parseFile(file);
              }
            }}
          />
        </label>

        {fileName && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
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

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Extraction draft</h2>
          <p className="text-sm text-neutral-400">
            Corrections here become training examples for workflow-specific extraction.
          </p>
        </div>

        <div className="p-4">
          {!parseResult && !isParsing && (
            <div className="grid min-h-72 place-items-center rounded-md border border-white/10 bg-[#121518] text-center text-sm text-neutral-500">
              <div>
                <div className="mb-3 flex justify-center gap-2">
                  <ImageIcon size={22} />
                  <FileText size={22} />
                  <FileSpreadsheet size={22} />
                </div>
                Upload a document to create an editable extraction draft.
              </div>
            </div>
          )}

          {parseResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-md border border-white/10 bg-[#121518] px-3 py-1">
                  Strategy: {parseResult.strategy}
                </span>
                {parseResult.notes.map((note) => (
                  <span
                    key={note}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-100"
                  >
                    {note}
                  </span>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(editedFields).map(([label, value]) => (
                  <label key={label} className="block">
                    <span className="mb-1 block text-xs text-neutral-400">{label}</span>
                    <input
                      value={value}
                      onChange={(event) =>
                        setEditedFields({
                          ...editedFields,
                          [label]: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                    />
                  </label>
                ))}
              </div>

              {parseResult.tables?.[0] && (
                <div className="overflow-hidden rounded-md border border-white/10">
                  <div className="border-b border-white/10 bg-[#121518] px-3 py-2 text-sm">
                    {parseResult.tables[0].sheetName}
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <tbody>
                        {parseResult.tables[0].rows.slice(0, 8).map((row, index) => (
                          <tr key={index} className="border-b border-white/10 last:border-0">
                            {Object.values(row)
                              .slice(0, 6)
                              .map((value, cellIndex) => (
                                <td key={cellIndex} className="px-3 py-2 text-neutral-300">
                                  {String(value)}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onSubmitRequest}
                disabled={missingRequiredDocuments.length > 0}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send size={16} />
                Submit request
              </button>
            </div>
          )}

          {submissionMessage && (
            <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              {submissionMessage}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
