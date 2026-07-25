"use client";

import { useState } from "react";
import { ExternalLink, Save, Upload } from "lucide-react";
import { normalizeFormLayout } from "@/lib/form-layout-state";
import type { CurrentNodeFormCompletionIssue } from "@/lib/current-node-form-state";
import {
  getLocallyEditableWorkflowFormFields,
  getWorkflowFormAttachmentFields,
  isMicrosoftFormsRequirement,
  isUploadedWorkflowFormAttachment,
} from "@/lib/workflow-library-form-state";
import type {
  ApprovalTask,
  WorkflowDocumentRequirement,
} from "@/lib/types";
import { NativeFormFieldInput } from "./native-form-field-input";
import { InfoTip } from "./ui-hint";

export function CurrentNodeFormsPanel({
  task,
  forms,
  issues,
  onSave,
  onAttach,
}: {
  task: ApprovalTask;
  forms: WorkflowDocumentRequirement[];
  issues: CurrentNodeFormCompletionIssue[];
  onSave: (values: Record<string, string>) => void;
  onAttach: (file: File, requirement: WorkflowDocumentRequirement) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
        forms.flatMap((document) =>
          document.fields.map((field) => [
            field.label,
            task.extractedFields[field.label] ?? task.extractedFields[field.name] ?? "",
          ]),
        ),
      ),
  );

  if (!forms.length) {
    return null;
  }

  const hasNativeFields = forms.some(
    (document) =>
      !isMicrosoftFormsRequirement(document) &&
      getLocallyEditableWorkflowFormFields(document).length > 0,
  );

  return (
    <section className="mt-3 rounded-md border border-[#f7941d]/35 bg-[#fffaf4] p-3 dark:bg-[#f7941d]/8">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Required form
        </h3>
        <InfoTip label="Complete forms attached to the current Approval box. Required form items must be received or saved before approval." />
      </div>
      <div className="mt-3 space-y-3">
        {forms.map((document) => {
          const issue = issues.find((item) => item.document.id === document.id);
          const isMicrosoft = isMicrosoftFormsRequirement(document);
          const editableFields = getLocallyEditableWorkflowFormFields(document);
          const fieldByName = new Map(editableFields.map((field) => [field.name, field]));
          const layout = normalizeFormLayout(document.formLibraryRef?.layout, editableFields);
          const attachmentFields = getWorkflowFormAttachmentFields(document);
          return (
            <div
              key={document.id}
              className="rounded-md border border-[#e2e2e2] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {document.documentType}
                </p>
                <span className={`rounded-md border px-2 py-1 text-xs font-medium ${issue ? "border-amber-400/45 bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200" : "border-emerald-400/45 bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"}`}>
                  {issue ? "Incomplete" : "Complete"}
                </span>
              </div>

              {isMicrosoft && (
                <div className="mt-3 rounded-md border border-[#e2e2e2] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-950">
                  <p className="text-sm text-neutral-800 dark:text-neutral-200">
                    {issue?.waitingForExternalResponse
                      ? "Waiting for the Microsoft Forms response."
                      : "Microsoft Forms response received."}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Approval Request Reference: <strong>{task.id}</strong>
                  </p>
                  {document.formLibraryRef?.responseUrl && (
                    <a
                      href={document.formLibraryRef.responseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-[#f7941d] bg-[#f7941d] px-3 text-sm font-medium text-[#231f20] hover:bg-[#df7f0a]"
                    >
                      <ExternalLink size={15} /> Open Microsoft Form
                    </a>
                  )}
                </div>
              )}

              {!isMicrosoft && layout.sections.map((section) => (
                <div key={section.id} className="mt-3">
                  {layout.sections.length > 1 && (
                    <p className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {section.title}
                    </p>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    {section.items.map((item) => {
                      const field = fieldByName.get(item.fieldName);
                      if (!field) return null;
                      return (
                        <div key={field.name} className={item.width === "full" ? "md:col-span-2" : ""}>
                          <NativeFormFieldInput
                            field={field}
                            idPrefix={document.id}
                            value={values[field.label] || ""}
                            onFocus={() => undefined}
                            onChange={(value) =>
                              setValues((current) => ({ ...current, [field.label]: value }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {!isMicrosoft && attachmentFields.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachmentFields.map((attachmentField) => {
                    const uploaded = (task.attachments || []).find((attachment) =>
                      isUploadedWorkflowFormAttachment(
                        attachment,
                        document,
                        attachmentField,
                      ),
                    );
                    const linkedFields = document.fields.filter(
                      (field) =>
                        field.inputSource === "attachment_extraction" &&
                        field.attachmentFieldName === attachmentField.name,
                    );
                    return (
                      <label
                        key={attachmentField.name}
                        className="flex cursor-pointer flex-col gap-2 rounded-md border border-[#e2e2e2] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-950 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-sm text-neutral-800 dark:text-neutral-200">
                          {attachmentField.label}{attachmentField.required ? " *" : ""}
                          <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                            {uploaded?.fileName || "Choose file"}
                          </span>
                        </span>
                        <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#f7941d]/55 bg-[#fff4e6] px-3 text-sm font-medium text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100">
                          <Upload size={15} /> {uploaded ? "Upload another" : "Upload"}
                        </span>
                        <input
                          type="file"
                          className="sr-only"
                          accept=".pdf,image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              onAttach(file, {
                                ...document,
                                documentType: attachmentField.label,
                                format: file.type === "application/pdf" ? "pdf" : "image",
                                fields: linkedFields,
                              });
                            }
                            event.target.value = "";
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {issue && !isMicrosoft && (
                <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
                  {[...issue.missingFieldLabels, ...issue.missingAttachmentLabels].join(", ")} required.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {hasNativeFields && (
        <button
          type="button"
          onClick={() => onSave(values)}
          className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#f7941d] bg-[#f7941d] px-3 text-sm font-medium text-[#231f20] hover:bg-[#df7f0a]"
        >
          <Save size={15} /> Save form
        </button>
      )}
    </section>
  );
}
