import { ExternalLink, X } from "lucide-react";
import {
  getLibraryFormSourceLabel,
  getWorkflowFormAttachmentFields,
  getWorkflowFormFieldSourceLabel,
  isMicrosoftFormsRequirement,
} from "@/lib/workflow-library-form-state";
import { isNativeFormChoiceField, nativeFormFieldTypeOptions } from "@/lib/workflow-native-form-state";
import type { WorkflowDocumentRequirement, WorkflowField } from "@/lib/types";

export function WorkflowLibraryFormSummary({
  document,
  onRemove,
}: {
  document: WorkflowDocumentRequirement;
  onRemove: () => void;
}) {
  const sourceLabel = getLibraryFormSourceLabel(document);
  const isMicrosoftForms = isMicrosoftFormsRequirement(document);
  const attachments = getWorkflowFormAttachmentFields(document);

  return (
    <div className="rounded-md border border-[#e6e6e6] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {document.documentType}
            </p>
            <span className="rounded-md border border-[#f7941d]/40 bg-[#fff4e6] px-2 py-1 text-[11px] font-semibold text-[#713d00] dark:bg-[#f7941d]/12 dark:text-[#ffd29a]">
              {sourceLabel} · v{document.formLibraryRef?.version}
            </span>
            {document.required && (
              <span className="rounded-md border border-[#d2d2d2] px-2 py-1 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                Required
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            This workflow is pinned to the library version above. Edit fields, choices,
            and attachments in the Form Library, then attach a new version when needed.
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          title="Remove this form from the selected workflow box."
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
        >
          <X size={14} />
        </button>
      </div>

      {isMicrosoftForms && document.formLibraryRef?.responseUrl && (
        <a
          href={document.formLibraryRef.responseUrl}
          target="_blank"
          rel="noreferrer"
          title="Open the pinned Microsoft Form."
          className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-[#f7941d]/50 bg-[#fff4e6] px-3 text-sm font-medium text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100"
        >
          <ExternalLink size={14} /> Open Microsoft Form
        </a>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
          Form data
        </p>
        <div className="mt-2 space-y-2">
          {document.fields.map((field) => (
            <div
              key={field.name}
              className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-950"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {field.label}{field.required ? " *" : ""}
                </p>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatFieldType(field)} · {getWorkflowFormFieldSourceLabel(document, field)}
                </span>
              </div>
              {isMicrosoftForms && isNativeFormChoiceField(field.type) && (
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Choices are managed in Microsoft Forms.
                </p>
              )}
              {!isMicrosoftForms &&
                isNativeFormChoiceField(field.type) &&
                Boolean(field.options?.length) && (
                  <p className="mt-2 break-words text-xs text-neutral-500 dark:text-neutral-400">
                    Choices: {field.options?.join(", ")}
                  </p>
                )}
            </div>
          ))}
          {!document.fields.length && (
            <p className="rounded-md border border-dashed border-[#d2d2d2] p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              No data fields are registered.
            </p>
          )}
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
            Attachment questions
          </p>
          <div className="mt-2 space-y-2">
            {attachments.map((attachment) => {
              const linkedFields = document.fields.filter(
                (field) =>
                  field.inputSource === "attachment_extraction" &&
                  field.attachmentFieldName === attachment.name,
              );
              return (
                <div
                  key={attachment.name}
                  className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                >
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {attachment.label}{attachment.required ? " *" : ""}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {isMicrosoftForms ? "Uploaded in Microsoft Forms." : "Uploaded in Approval App."}
                    {linkedFields.length
                      ? ` AI extracts: ${linkedFields.map((field) => field.label).join(", ")}.`
                      : " No AI fields are linked."}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatFieldType(field: WorkflowField) {
  return (
    nativeFormFieldTypeOptions.find((option) => option.value === field.type)?.label ||
    field.type
  );
}
