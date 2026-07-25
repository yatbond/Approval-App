"use client";

import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
import { getExtractionFieldSourceLabel, type HighlightFieldGroup } from "@/lib/upload-view-state";
import type { ParsedWorkspaceFilePayload } from "@/lib/workspace-file-api";
import {
  getLocallyEditableWorkflowFormFields,
  getWorkflowFormAttachmentFields,
  getWorkflowFormFieldSourceLabel,
  isMicrosoftFormsRequirement,
  isUploadedWorkflowFormAttachment,
} from "@/lib/workflow-library-form-state";
import type {
  ApprovalAttachment,
  WorkflowDocumentRequirement,
  WorkflowField,
} from "@/lib/types";
import { NativeFormFieldInput } from "./native-form-field-input";
import { normalizeFormLayout } from "@/lib/form-layout-state";
import { InfoTip } from "./ui-hint";

type ParseFileOptions = {
  preserveExistingRequestData?: boolean;
  mergeIntoCurrentRequest?: boolean;
  skipExtraction?: boolean;
};

type UploadRequestDataPanelProps = {
  manualFormDocuments: WorkflowDocumentRequirement[];
  uploadedAttachments: ApprovalAttachment[];
  editedFields: Record<string, string>;
  setEditedFields: (fields: Record<string, string>) => void;
  isParsing: boolean;
  parseResult: ParsedWorkspaceFilePayload | null;
  highlightGroups: HighlightFieldGroup[];
  parseFile: (
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
    adHocFields?: WorkflowField[],
    options?: ParseFileOptions,
  ) => void;
  onFocusDocument: (documentId: string) => void;
  onFocusParsedFields: () => void;
};

export function UploadRequestDataPanel({
  manualFormDocuments,
  uploadedAttachments,
  editedFields,
  setEditedFields,
  isParsing,
  parseResult,
  highlightGroups,
  parseFile,
  onFocusDocument,
  onFocusParsedFields,
}: UploadRequestDataPanelProps) {
  const hasManualFormDocuments = manualFormDocuments.length > 0;

  return (
    <>
      {hasManualFormDocuments && (
        <div className="mb-4 rounded-md border border-[#f7941d]/35 bg-[#fffaf4] p-4 dark:bg-[#f7941d]/8">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Request form
            </h3>
            <InfoTip label="Complete the form defined in this workflow's Submit box. Required fields must be filled before submission." />
          </div>
          <div className="mt-3 space-y-4">
            {manualFormDocuments.map((document) => {
              const isMicrosoftForms = isMicrosoftFormsRequirement(document);
              return (
                <div
                  key={document.id}
                  className="rounded-md border border-[#e6e6e6] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {document.documentType}
                    </p>
                    <span className="rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                      {document.formLibraryRef
                        ? `Library v${document.formLibraryRef.version}`
                        : `${document.fields.length} field(s)`}
                    </span>
                  </div>
                  {isMicrosoftForms && (
                    <div className="mt-3 rounded-md border border-[#f7941d]/35 bg-[#fffaf4] p-3 dark:bg-[#f7941d]/10">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            Complete in Microsoft Forms
                          </p>
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                            {document.formLibraryRef?.responseMode === "start_workflow"
                              ? "Submitting this form starts the linked workflow after automatic response delivery is connected."
                              : "For an existing request, include its Approval Request Reference. Answers and attachments return through Power Automate."}
                          </p>
                        </div>
                        {document.formLibraryRef?.responseUrl && (
                          <a
                            href={document.formLibraryRef.responseUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open this registered Microsoft Form in a new tab."
                            className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[#f7941d] bg-[#f7941d] px-3 text-sm font-medium text-[#231f20] transition hover:bg-[#df7f0a]"
                          >
                            <ExternalLink size={15} /> Open form
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {getWorkflowFormAttachmentFields(document).length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase text-neutral-500">
                          Attachments
                        </p>
                        <InfoTip
                          label={
                            isMicrosoftForms
                              ? "These files are uploaded in Microsoft Forms and delivered through Power Automate."
                              : "Upload each requested file. Linked fields are extracted automatically and remain editable below."
                          }
                        />
                      </div>
                      {getWorkflowFormAttachmentFields(document).map((attachmentField) => {
                        const linkedFields = document.fields.filter(
                          (field) =>
                            field.inputSource === "attachment_extraction" &&
                            field.attachmentFieldName === attachmentField.name,
                        );
                        const uploaded = uploadedAttachments.find((attachment) =>
                          isUploadedWorkflowFormAttachment(
                            attachment,
                            document,
                            attachmentField,
                          ),
                        );
                        return (
                          <div
                            key={attachmentField.name}
                            className="flex flex-col gap-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-950 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                {attachmentField.label}
                                {attachmentField.required ? " *" : ""}
                              </p>
                              <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400">
                                {uploaded
                                  ? uploaded.fileName
                                  : linkedFields.length
                                    ? `${linkedFields.length} field(s) will be extracted by AI.`
                                    : "The file will be attached without AI extraction."}
                              </p>
                            </div>
                            {isMicrosoftForms ? (
                              <span className="flex min-h-10 items-center justify-center rounded-md border border-[#d2d2d2] bg-white px-3 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                                Uploaded in Microsoft Forms
                              </span>
                            ) : (
                              <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#f7941d]/55 bg-[#fff4e6] px-3 text-sm font-medium text-neutral-900 transition hover:border-[#f7941d] dark:bg-[#f7941d]/12 dark:text-neutral-100">
                                <Upload size={15} />
                                {uploaded ? "Upload another" : "Upload file"}
                                <input
                                  type="file"
                                  accept=".pdf,image/*"
                                  disabled={isParsing}
                                  className="sr-only"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    const parsingRequirement: WorkflowDocumentRequirement = {
                                      ...document,
                                      documentType: attachmentField.label,
                                      fields: linkedFields,
                                    };
                                    parseFile(file, parsingRequirement, [], {
                                      preserveExistingRequestData: true,
                                      mergeIntoCurrentRequest: true,
                                      skipExtraction: linkedFields.length === 0,
                                    });
                                    event.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isMicrosoftForms && document.fields.length > 0 && (
                    <div className="mt-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-950">
                      <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                        Data received from Microsoft Forms
                      </p>
                      <div className="mt-2 space-y-2">
                        {document.fields.map((field) => {
                          const value =
                            editedFields[field.label] ?? editedFields[field.name] ?? "";
                          return (
                            <div
                              key={field.name}
                              className="flex flex-col gap-1 rounded-md border border-[#e6e6e6] bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="break-words font-medium text-neutral-900 dark:text-neutral-100">
                                {field.label}{field.required ? " *" : ""}
                              </span>
                              <span className="break-words text-xs text-neutral-500 dark:text-neutral-400 sm:text-right">
                                {value || getWorkflowFormFieldSourceLabel(document, field)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(() => {
                    const editableFields = getLocallyEditableWorkflowFormFields(document);
                    const fieldByName = new Map(
                      editableFields.map((field) => [field.name, field]),
                    );
                    const layout = normalizeFormLayout(
                      document.formLibraryRef?.layout,
                      editableFields,
                    );
                    return (
                      <div className="mt-3 space-y-4">
                        {layout.sections.map((section) => (
                          <section
                            key={section.id}
                            className="rounded-md border border-[#e6e6e6] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                              {section.title}
                            </h4>
                            {section.description && (
                              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                {section.description}
                              </p>
                            )}
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              {section.items.map((item) => {
                                const field = fieldByName.get(item.fieldName);
                                if (!field) return null;
                                const value =
                                  editedFields[field.label] ??
                                  editedFields[field.name] ??
                                  "";
                                return (
                                  <div
                                    key={field.name}
                                    className={item.width === "full" ? "md:col-span-2" : ""}
                                  >
                                    <NativeFormFieldInput
                                      field={field}
                                      value={value}
                                      onFocus={() => onFocusDocument(document.id)}
                                      onChange={(nextValue) =>
                                        setEditedFields({
                                          ...editedFields,
                                          [field.label]: nextValue,
                                        })
                                      }
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    );
                  })()}
                  {!document.fields.length && (
                    <p className="mt-3 rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-xs text-neutral-500">
                      No fields yet.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!parseResult && !isParsing && !hasManualFormDocuments && (
        <div className="grid min-h-72 place-items-center rounded-md border border-[#e6e6e6] bg-white text-center text-sm text-neutral-500">
          <div>
            <div className="mb-3 flex justify-center gap-2">
              <ImageIcon size={22} />
              <FileText size={22} />
              <FileSpreadsheet size={22} />
            </div>
            Upload to start.
          </div>
        </div>
      )}

      {parseResult && (
        <div className="space-y-4">
          <details className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 text-sm">
            <summary
              className="cursor-pointer font-medium text-neutral-300"
              title="Open technical details about how the uploaded document was processed."
            >
              Extraction details
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-[#e6e6e6] bg-white px-3 py-1">
                Method: {parseResult.strategy}
              </span>
              {parseResult.notes.map((note, index) => (
                <span
                  key={`${note}-${index}`}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-100"
                >
                  {note}
                </span>
              ))}
            </div>
          </details>

          <div>
            <p className="mb-2 text-sm font-semibold text-neutral-200">
              Selected fields
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(editedFields).map(([label, value]) => (
                <label key={label} className="block">
                  <span className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-400">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span>{label}</span>
                      <span className="rounded-md border border-[#e6e6e6] bg-white px-2 py-0.5 text-neutral-300">
                        {getExtractionFieldSourceLabel({
                          label,
                          parseFields: parseResult.fields || {},
                          highlightGroups,
                        })}
                      </span>
                    </span>
                    {parseResult.confidence?.[label] && (
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 ${
                          parseResult.confidence[label] === "high"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                            : parseResult.confidence[label] === "medium"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-100"
                        }`}
                      >
                        {parseResult.confidence[label]} confidence
                      </span>
                    )}
                  </span>
                  <input
                    value={value}
                    onFocus={onFocusParsedFields}
                    onChange={(event) =>
                      setEditedFields({
                        ...editedFields,
                        [label]: event.target.value,
                      })
                    }
                    className="h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none transition focus:border-emerald-400/60"
                  />
                  {parseResult.evidence?.[label] && (
                    <p className="mt-1 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 py-1 text-xs text-neutral-500">
                      Evidence: {parseResult.evidence[label]}
                    </p>
                  )}
                </label>
              ))}
            </div>
          </div>

          {parseResult.tables?.[0] && (
            <div className="overflow-hidden rounded-md border border-[#e6e6e6]">
              <div className="border-b border-[#e6e6e6] bg-white px-3 py-2 text-sm">
                {parseResult.tables[0].sheetName}
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <tbody>
                    {parseResult.tables[0].rows.slice(0, 8).map((row, index) => (
                      <tr key={index} className="border-b border-[#e6e6e6] last:border-0">
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
        </div>
      )}
    </>
  );
}
