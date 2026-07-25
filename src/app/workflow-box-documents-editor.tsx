"use client";

import { FilePlus2, Library, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { TemplateDocumentRecognitionPanel } from "@/app/template-document-recognition-panel";
import { InfoTip } from "@/app/ui-hint";
import { WorkflowLibraryFormSummary } from "@/app/workflow-library-form-summary";
import {
  getActiveFormLibraryDefinitions,
} from "@/lib/form-library-state";
import {
  documentFormatOptions,
  isManualFormRequirement,
} from "@/lib/workflow-documents";
import { isLibraryFormRequirement } from "@/lib/workflow-library-form-state";
import type {
  DocumentFormat,
  ExtractionTrainingExample,
  FormLibraryDefinition,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "@/lib/types";

export type WorkflowBoxDocumentDraft = {
  documentType: string;
  format: DocumentFormat;
  required: boolean;
};

type WorkflowDocumentPatch = Partial<
  Pick<
    WorkflowDocumentRequirement,
    "documentType" | "format" | "inputMode" | "required" | "sample"
  >
>;

type WorkflowDocumentFieldPatch = Partial<
  Pick<
    WorkflowField,
    | "label"
    | "type"
    | "instructions"
    | "placeholder"
    | "options"
    | "required"
  >
>;

export function WorkflowBoxDocumentsEditor({
  node,
  template,
  formLibrary,
  onAddRequirement,
  onAttachLibraryForm,
  onUpdateRequirement,
  onRemoveRequirement,
  onAddField,
  onUpdateField,
  onRemoveField,
  onAddRecognizedField,
}: {
  node: WorkflowGraphNode;
  template: WorkflowTemplate;
  formLibrary: FormLibraryDefinition[];
  onAddRequirement: (
    draft: WorkflowBoxDocumentDraft,
  ) => WorkflowBoxDocumentDraft | null;
  onAttachLibraryForm: (definition: FormLibraryDefinition) => boolean;
  onUpdateRequirement: (documentId: string, patch: WorkflowDocumentPatch) => void;
  onRemoveRequirement: (documentId: string) => void;
  onAddField: (documentId: string) => void;
  onUpdateField: (
    documentId: string,
    fieldIndex: number,
    patch: WorkflowDocumentFieldPatch,
  ) => void;
  onRemoveField: (documentId: string, fieldIndex: number) => void;
  onAddRecognizedField: (
    documentId: string,
    field: WorkflowField,
    example?: ExtractionTrainingExample,
  ) => void;
}) {
  const [requirementDraft, setRequirementDraft] = useState<WorkflowBoxDocumentDraft>({
    documentType: "Supporting document",
    format: "pdf",
    required: true,
  });
  const [selectedLibraryFormId, setSelectedLibraryFormId] = useState("");
  const [addRequirementType, setAddRequirementType] = useState<
    "form" | "document" | null
  >(null);
  const availableLibraryForms = useMemo(
    () =>
      getActiveFormLibraryDefinitions(formLibrary).filter(
        (definition) => definition.status === "ready",
      ),
    [formLibrary],
  );
  const documents = template.documents.filter((document) =>
    node.documentIds?.includes(document.id),
  );

  function addLibraryForm() {
    const definition = availableLibraryForms.find(
      (item) => item.id === selectedLibraryFormId,
    );
    if (definition && onAttachLibraryForm(definition)) {
      setSelectedLibraryFormId("");
    }
  }

  function addRequirement() {
    const resetDraft = onAddRequirement(requirementDraft);
    if (resetDraft) {
      setRequirementDraft(resetDraft);
    }
  }

  return (
    <details className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3">
      <summary
        className="cursor-pointer text-xs font-semibold text-neutral-400"
        title={
          node.kind === "submit_request"
            ? "Configure documents and fields shown when the request starts."
            : "Configure documents and fields required at this approval step."
        }
      >
        {node.kind === "submit_request"
          ? "Request requirements"
          : "Documents and data extraction"}
      </summary>
      <div className="mt-2 space-y-2">
        {documents.length > 0 && (
          <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
            Current requirements
          </p>
        )}
        {documents.map((document) => {
          if (isLibraryFormRequirement(document)) {
            return (
              <WorkflowLibraryFormSummary
                key={document.id}
                document={document}
                onRemove={() => onRemoveRequirement(document.id)}
              />
            );
          }
          const isManualForm = isManualFormRequirement(document);

          if (isManualForm) {
            return (
              <div
                key={document.id}
                className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/35 dark:bg-amber-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {document.documentType}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                      Legacy embedded form. New forms can only be attached from the Form Library.
                    </p>
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {document.fields.length} field(s). Remove this requirement and attach its published Form Library version to replace it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveRequirement(document.id)}
                    title="Remove this legacy embedded form from the selected workflow box."
                    aria-label={`Remove ${document.documentType}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={document.id}
              className="rounded-md border border-[#e6e6e6] bg-white p-2"
            >
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                Document requirement
              </p>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">
                      Document type
                    </span>
                    <input
                      value={document.documentType}
                      title="Business meaning of this document, such as Invoice, Doctor slip, or Delivery note."
                      onChange={(event) =>
                        onUpdateRequirement(document.id, {
                          documentType: event.target.value,
                        })
                      }
                      className="h-9 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-500">
                          Format
                        </span>
                        <select
                          value={document.format}
                          title="File format expected for this document upload."
                          onChange={(event) =>
                            onUpdateRequirement(document.id, {
                              format: event.target.value as DocumentFormat,
                            })
                          }
                          className="h-9 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 text-sm outline-none focus:border-emerald-400/60"
                        >
                          {documentFormatOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex h-9 items-center gap-2 text-xs text-neutral-300">
                        <input
                          type="checkbox"
                          checked={document.required}
                          title="Require this document before the workflow can proceed through this box."
                          onChange={(event) =>
                            onUpdateRequirement(document.id, {
                              required: event.target.checked,
                            })
                          }
                        />
                        Required upload
                      </label>
                  </div>
                  <p className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-2 py-1 text-xs text-neutral-500">
                    Requester uploads this document. AI/OCR can extract the configured fields.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveRequirement(document.id)}
                  title="Remove this document requirement from the selected box."
                  aria-label={`Remove ${document.documentType}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] text-neutral-400 transition hover:border-rose-400/40 hover:text-rose-100"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="mt-3 space-y-3 border-t border-[#e6e6e6] pt-3">
                <div className="rounded-md border border-sky-500/20 bg-sky-500/10 p-2">
                  <p className="text-xs font-semibold text-sky-100">
                    Extraction fields
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-neutral-400">
                    Edit fields
                  </p>
                  <button
                    type="button"
                    onClick={() => onAddField(document.id)}
                    title="Add another field to extract from this document."
                    className="flex min-h-7 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 transition hover:bg-sky-400/20"
                  >
                    <Plus size={12} /> Add field
                  </button>
                </div>
                {document.fields.map((field, fieldIndex) => (
                  <div
                    key={`${document.id}-${field.name}-${fieldIndex}`}
                    className="space-y-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={field.label}
                        title="Field name shown to users, such as Amount, Invoice date, or Quantity."
                        onChange={(event) =>
                          onUpdateField(document.id, fieldIndex, {
                            label: event.target.value,
                          })
                        }
                        className="h-9 min-w-0 flex-1 rounded-md border border-[#e6e6e6] bg-white px-2 text-sm outline-none focus:border-emerald-400/60"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveField(document.id, fieldIndex)}
                        title="Remove this field from the requirement."
                        aria-label={`Remove ${field.label}`}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <input
                      value={field.instructions}
                      title="Instruction for the extractor, for example where to find the value or how to interpret it."
                      onChange={(event) =>
                        onUpdateField(document.id, fieldIndex, {
                          instructions: event.target.value,
                        })
                      }
                      placeholder="Extraction instruction"
                      className="h-9 w-full rounded-md border border-[#e6e6e6] bg-white px-2 text-xs outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                    />
                    <label className="flex items-center gap-2 text-xs text-neutral-400">
                      <input
                        type="checkbox"
                        checked={field.required}
                        title="Require this field to be present before continuing."
                        onChange={(event) =>
                          onUpdateField(document.id, fieldIndex, {
                            required: event.target.checked,
                          })
                        }
                      />
                      Required
                    </label>
                  </div>
                ))}
                {!document.fields.length && (
                  <p className="text-xs text-neutral-500">No fields yet.</p>
                )}
                <TemplateDocumentRecognitionPanel
                  document={document}
                  template={template}
                  onAddField={(field, example) =>
                    onAddRecognizedField(document.id, field, example)
                  }
                  onSaveSample={(sample) =>
                    onUpdateRequirement(document.id, { sample })
                  }
                />
              </div>
            </div>
          );
        })}
        {!node.documentIds?.length && (
          <p className="rounded-md border border-dashed border-[#d2d2d2] p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No requirements added.
          </p>
        )}
      </div>
      <div className="mt-3 space-y-2 border-t border-[#e6e6e6] pt-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Add a requirement
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Attach a published Form Library version or add a document upload requirement.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={addRequirementType === "form"}
              onClick={() =>
                setAddRequirementType((current) =>
                  current === "form" ? null : "form",
                )
              }
              title="Choose an active form version from the Form Library."
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
                addRequirementType === "form"
                  ? "border-[#f7941d] bg-[#fff4e6] text-neutral-900 dark:bg-[#f7941d]/15 dark:text-neutral-100"
                  : "border-[#d2d2d2] bg-white text-neutral-700 hover:border-[#f7941d] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              }`}
            >
              <Library size={16} /> Attach form from Library
            </button>
            <button
              type="button"
              aria-pressed={addRequirementType === "document"}
              onClick={() =>
                setAddRequirementType((current) =>
                  current === "document" ? null : "document",
                )
              }
              title="Add a document that the requester must upload."
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
                addRequirementType === "document"
                  ? "border-[#f7941d] bg-[#fff4e6] text-neutral-900 dark:bg-[#f7941d]/15 dark:text-neutral-100"
                  : "border-[#d2d2d2] bg-white text-neutral-700 hover:border-[#f7941d] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              }`}
            >
              <FilePlus2 size={16} /> Add document upload
            </button>
          </div>
        </div>

        {addRequirementType === "form" && (
          <div className="rounded-md border border-[#f7941d]/35 bg-[#fffaf4] p-3 dark:bg-[#f7941d]/8">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Attach form from library
              </p>
              <InfoTip label="Attach a pinned copy of a reusable form to this workflow box." />
            </div>
            {availableLibraryForms.length > 0 ? (
              <>
                <select
                  aria-label="Form Library version"
                  value={selectedLibraryFormId}
                  onChange={(event) => setSelectedLibraryFormId(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-[#d2d2d2] bg-white px-3 text-sm text-neutral-900 outline-none focus:border-[#f7941d] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                >
                  <option value="">Select published form</option>
                  {availableLibraryForms.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.name} · v{definition.version} ·{" "}
                      {definition.source === "native"
                        ? "Approval App"
                        : "Microsoft Forms"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addLibraryForm}
                  disabled={!selectedLibraryFormId}
                  title="Attach this published form version to the selected workflow box."
                  className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-[#f7941d] bg-[#f7941d] px-3 text-sm font-medium text-[#231f20] transition hover:bg-[#df7f0a] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus size={15} /> Attach selected form
                </button>
              </>
            ) : (
              <p className="mt-2 rounded-md border border-dashed border-[#d2d2d2] p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                No published forms are available. Create and publish a form under Forms first.
              </p>
            )}
          </div>
        )}

        {addRequirementType === "document" && (
          <div className="space-y-3 rounded-md border border-[#e6e6e6] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Add document requirement
            </p>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Document name</span>
              <input
                value={requirementDraft.documentType}
                title="Name the document the requester must upload."
                onChange={(event) =>
                  setRequirementDraft((current) => ({
                    ...current,
                    documentType: event.target.value,
                  }))
                }
                placeholder="Document type, e.g. Invoice"
                className="h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">
                File format
              </span>
              <select
                value={requirementDraft.format}
                title="Choose the file format expected for the new document requirement."
                onChange={(event) =>
                  setRequirementDraft((current) => ({
                    ...current,
                    format: event.target.value as DocumentFormat,
                  }))
                }
                className="h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
              >
                {documentFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={requirementDraft.required}
                title="Mark the new upload as mandatory for this box."
                onChange={(event) =>
                  setRequirementDraft((current) => ({
                    ...current,
                    required: event.target.checked,
                  }))
                }
              />
              Required upload
            </label>
            <button
              type="button"
              onClick={addRequirement}
              title="Add this document requirement to the selected workflow box."
              className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-[#f7941d] bg-[#fff4e6] px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-[#ffe7c7] dark:bg-[#f7941d]/15 dark:text-neutral-100"
            >
              <FilePlus2 size={15} /> Add document requirement
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
