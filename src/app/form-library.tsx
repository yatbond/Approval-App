"use client";

import { FileInput, LayoutTemplate, Library, Plus, Save, Trash2, Wrench } from "lucide-react";
import { useState } from "react";
import { FormLayoutEditor } from "@/app/form-layout-editor";
import { FormVersionLibrary } from "@/app/form-version-library";
import {
  createEmptyFormLibraryDraft,
  createFormLibraryField,
  extractMicrosoftFormId,
  getFormLibraryFieldInputSource,
  getFormLibraryPreflightIssues,
  getFormParticipantNodes,
  type FormLibraryDraft,
  type FormLibrarySaveMode,
} from "@/lib/form-library-state";
import {
  normalizeFormLayout,
  renameFormLayoutField,
} from "@/lib/form-layout-state";
import {
  isNativeFormChoiceField,
  nativeFormFieldTypeOptions,
} from "@/lib/workflow-native-form-state";
import type {
  FormLibraryDefinition,
  FormLibraryFieldInputSource,
  FormParticipantResolutionSource,
  BusinessUnit,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";
import { InfoTip } from "./ui-hint";

const participantSourceOptions: {
  value: FormParticipantResolutionSource;
  label: string;
}[] = [
  { value: "fixed_template", label: "Fixed template email" },
  { value: "responder", label: "Form respondent" },
  { value: "form_field", label: "Email field in form" },
  { value: "directory_position", label: "Company position directory" },
  { value: "manual", label: "Resolve before routing" },
];

export function FormLibrary({
  definitions,
  businessDirectory,
  workflowTemplates,
  workspaceOwnerEmail,
  onSave,
  onArchive,
  onActivate,
}: {
  definitions: FormLibraryDefinition[];
  businessDirectory: BusinessUnit[];
  workflowTemplates: WorkflowTemplate[];
  workspaceOwnerEmail: string;
  onSave: (
    draft: FormLibraryDraft,
    existingDefinition: FormLibraryDefinition | null,
    saveMode?: FormLibrarySaveMode,
  ) => FormLibraryDefinition;
  onArchive: (definitionId: string) => void;
  onActivate: (definitionId: string) => void;
}) {
  const [editorTab, setEditorTab] = useState<"builder" | "layout" | "library">("builder");
  const [selectedDefinitionId, setSelectedDefinitionId] = useState("");
  const selectedDefinition =
    definitions.find((definition) => definition.id === selectedDefinitionId) || null;
  const firstBusiness = businessDirectory[0];
  const [draft, setDraft] = useState<FormLibraryDraft>(() =>
    createEmptyFormLibraryDraft("native", {
      business: firstBusiness?.name,
      department: firstBusiness?.departments[0],
    }),
  );
  const selectedBusiness = businessDirectory.find(
    (business) => business.name === draft.business,
  );
  const targetWorkflow = workflowTemplates.find(
    (template) => template.id === draft.targetWorkflowTemplateId,
  );
  const participantNodes = getFormParticipantNodes(targetWorkflow);
  const preflightIssues = getFormLibraryPreflightIssues(draft, workflowTemplates);

  function startNew(source: FormLibraryDefinition["source"]) {
    setSelectedDefinitionId("");
    setDraft(
      createEmptyFormLibraryDraft(source, {
        business: firstBusiness?.name,
        department: firstBusiness?.departments[0],
      }),
    );
    setEditorTab("builder");
  }

  function openDefinition(definition: FormLibraryDefinition) {
    setSelectedDefinitionId(definition.id);
    setDraft(definitionToDraft(definition));
    setEditorTab("builder");
  }

  function updateField(index: number, patch: Partial<WorkflowField>) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
      layout:
        patch.name && current.fields[index]?.name !== patch.name
          ? renameFormLayoutField(
              normalizeFormLayout(current.layout, current.fields),
              current.fields[index].name,
              patch.name,
            )
          : current.layout,
    }));
  }

  function save(saveMode: FormLibrarySaveMode) {
    const savedDefinition = onSave(draft, selectedDefinition, saveMode);
    setSelectedDefinitionId(savedDefinition.id);
    setDraft(definitionToDraft(savedDefinition));
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-md border border-[#e6e6e6] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Forms</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Build reusable forms, arrange native layouts, and attach published versions to workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => startNew("native")} className={newFormButtonClassName}>
              <Plus size={15} /> Native form
            </button>
            <button type="button" onClick={() => startNew("microsoft_forms")} className={newFormButtonClassName}>
              <FileInput size={15} /> Microsoft Form
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            { id: "builder", label: "Builder", icon: Wrench },
            { id: "layout", label: "Layout", icon: LayoutTemplate },
            { id: "library", label: "Library", icon: Library },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEditorTab(tab.id)}
                className={tabClassName(editorTab === tab.id)}
              >
                <Icon size={15} /> {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {editorTab === "library" && (
        <FormVersionLibrary
          definitions={definitions}
          onActivate={onActivate}
          onArchive={onArchive}
          onEdit={openDefinition}
        />
      )}

      {editorTab === "layout" && (
        <FormLayoutEditor draft={draft} setDraft={setDraft} />
      )}

      {editorTab === "builder" && (
      <section className="min-w-0 rounded-md border border-[#e6e6e6] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
                {selectedDefinition?.isDraft
                  ? `Edit ${selectedDefinition.name} draft`
                  : selectedDefinition
                    ? `Create a draft from ${selectedDefinition.name} v${selectedDefinition.version}`
                    : "New form"}
              </h2>
            <InfoTip label="Drafts update in place. Publishing creates an immutable version; workflows already using an older version stay pinned to it." />
            </div>
            {selectedDefinition && (
              <p className="mt-1 text-xs text-neutral-500">
                Based on {selectedDefinition.name} v{selectedDefinition.version}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Form name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={inputClassName}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Source</span>
            <input
              value={draft.source === "native" ? "Approval App" : "Microsoft Forms"}
              disabled
              className={`${inputClassName} disabled:bg-[#f7f7f5] disabled:text-neutral-500 dark:disabled:bg-neutral-900`}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Description (optional)</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={2}
              className={`${inputClassName} h-auto py-2`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Company</span>
            <select
              value={draft.business}
              onChange={(event) => {
                const business = businessDirectory.find(
                  (item) => item.name === event.target.value,
                );
                setDraft({
                  ...draft,
                  business: event.target.value,
                  department: business?.departments[0] || "",
                });
              }}
              className={inputClassName}
            >
              <option value="">Shared across companies</option>
              {businessDirectory.map((business) => (
                <option key={business.id} value={business.name}>
                  {business.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Department</span>
            {selectedBusiness?.departments.length ? (
              <select
                value={draft.department}
                onChange={(event) =>
                  setDraft({ ...draft, department: event.target.value })
                }
                className={inputClassName}
              >
                {selectedBusiness.departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draft.department}
                onChange={(event) =>
                  setDraft({ ...draft, department: event.target.value })
                }
                placeholder={draft.business ? "Department" : "All departments"}
                className={inputClassName}
              />
            )}
          </label>
        </div>

        {draft.source === "microsoft_forms" && (
          <div className="mt-5 border-t border-[#e6e6e6] pt-5 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Microsoft Forms connection</h3>
              <InfoTip label="The form stays in Microsoft 365. Approval App stores its link, mapped schema, and workflow rules." />
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-neutral-500">Response link</span>
                <input
                  value={draft.responseUrl}
                  onChange={(event) => setDraft({ ...draft, responseUrl: event.target.value })}
                  placeholder="https://forms.cloud.microsoft/r/..."
                  className={inputClassName}
                />
                {extractMicrosoftFormId(draft.responseUrl) && (
                  <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">
                    Form reference: {extractMicrosoftFormId(draft.responseUrl)}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Use</span>
                <select
                  value={draft.responseMode}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      responseMode: event.target.value as FormLibraryDraft["responseMode"],
                    })
                  }
                  className={inputClassName}
                >
                  <option value="complete_node">Complete an existing workflow box</option>
                  <option value="start_workflow">Start a new approval request</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Embed link (optional)</span>
                <input
                  value={draft.embedUrl}
                  onChange={(event) => setDraft({ ...draft, embedUrl: event.target.value })}
                  placeholder="Paste Microsoft Forms embed URL"
                  className={inputClassName}
                />
              </label>
              {draft.responseMode === "start_workflow" && (
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs text-neutral-500">Workflow to start</span>
                  <select
                    value={draft.targetWorkflowTemplateId}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        targetWorkflowTemplateId: event.target.value,
                        participantMappings: [],
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="">Select one published workflow</option>
                    {workflowTemplates
                      .filter(
                        (template) =>
                          template.isDraft !== true && template.isArchived !== true,
                      )
                      .map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} · {template.business} · {template.department}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
              Power Automate must send each response to the Approval App webhook. Until that connection is enabled, the mapped fields remain available as an in-app fallback.
            </p>
            {selectedDefinition?.source === "microsoft_forms" && (
              <details className="mt-3 rounded-md border border-[#d2d2d2] bg-[#f7f7f5] p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                <summary className="cursor-pointer font-medium text-neutral-900 dark:text-neutral-100">
                  Power Automate setup values
                </summary>
                <dl className="mt-3 grid min-w-0 gap-2 text-xs sm:grid-cols-[150px_minmax(0,1fr)]">
                  <dt className="text-neutral-500">Webhook</dt>
                  <dd className="min-w-0 break-all font-mono">/api/form-intake</dd>
                  <dt className="text-neutral-500">Workspace owner</dt>
                  <dd className="min-w-0 break-all font-mono">{workspaceOwnerEmail}</dd>
                  <dt className="text-neutral-500">Form key</dt>
                  <dd className="min-w-0 break-all font-mono">{selectedDefinition.formKey}</dd>
                  <dt className="text-neutral-500">Form version</dt>
                  <dd className="font-mono">{selectedDefinition.version}</dd>
                  <dt className="text-neutral-500">Schema fingerprint</dt>
                  <dd className="max-h-24 min-w-0 overflow-auto break-all rounded-md border border-[#e6e6e6] bg-white p-2 font-mono dark:border-neutral-700 dark:bg-neutral-950">
                    {selectedDefinition.schemaFingerprint}
                  </dd>
                </dl>
                <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                  Send only mapped questions in <span className="font-mono">answers</span>. For an existing request, also send its Approval Request Reference.
                </p>
              </details>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-[#e6e6e6] pt-5 dark:border-neutral-700">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Request data fields</h3>
              <InfoTip label="The complete data used by the workflow. A field can come from a form answer or be extracted by AI from an attachment." />
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  fields: [
                    ...draft.fields,
                    createFormLibraryField(
                      `Field ${draft.fields.length + 1}`,
                      draft.source === "microsoft_forms"
                        ? "microsoft_forms"
                        : "approval_app",
                    ),
                  ],
                })
              }
              className="flex min-h-9 items-center gap-2 rounded-md border border-[#f7941d]/50 bg-[#fff4e6] px-3 text-sm text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100"
            >
              <Plus size={14} /> Add data field
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {draft.fields.map((field, index) => (
              <div
                key={`mapped-value-${index}`}
                className="grid gap-3 rounded-md border border-[#e6e6e6] p-3 dark:border-neutral-700 lg:grid-cols-[minmax(0,1fr)_170px_220px_auto]"
              >
                <label>
                  <span className="mb-1 block text-xs text-neutral-500">Field label</span>
                  <input
                    value={field.label}
                    onChange={(event) =>
                      updateField(index, {
                        label: event.target.value,
                        name: toFieldName(event.target.value),
                        ...(getFormLibraryFieldInputSource(field, draft.source) ===
                          "microsoft_forms" &&
                        (!field.externalQuestionLabel ||
                          field.externalQuestionLabel === field.label)
                          ? { externalQuestionLabel: event.target.value }
                          : {}),
                      })
                    }
                    className={inputClassName}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs text-neutral-500">Type</span>
                  <select
                    value={field.type}
                    onChange={(event) => {
                      const type = event.target.value as WorkflowField["type"];
                      const inputSource = getFormLibraryFieldInputSource(
                        field,
                        draft.source,
                      );
                      updateField(index, {
                        type,
                        options:
                          inputSource === "approval_app" &&
                          isNativeFormChoiceField(type) &&
                          !field.options?.length
                            ? ["Choice 1", "Choice 2"]
                            : inputSource === "microsoft_forms"
                              ? undefined
                              : field.options,
                      });
                    }}
                    className={inputClassName}
                  >
                    {nativeFormFieldTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs text-neutral-500">Input source</span>
                  <select
                      value={getFormLibraryFieldInputSource(field, draft.source)}
                      onChange={(event) => {
                        const inputSource = event.target
                          .value as FormLibraryFieldInputSource;
                        updateField(index, {
                          inputSource,
                          source:
                            inputSource === "attachment_extraction"
                              ? "ai"
                              : "manual",
                          externalQuestionLabel:
                            inputSource === "microsoft_forms"
                              ? field.externalQuestionLabel || field.label
                              : undefined,
                          attachmentFieldName:
                            inputSource === "attachment_extraction"
                              ? field.attachmentFieldName ||
                                draft.attachmentFields?.[0]?.name
                              : undefined,
                        });
                      }}
                      className={inputClassName}
                    >
                      {draft.source === "microsoft_forms" ? (
                        <option value="microsoft_forms">Microsoft Forms answer</option>
                      ) : (
                        <option value="approval_app">User entry in Approval App</option>
                      )}
                      <option value="attachment_extraction">AI from attachment</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fields: draft.fields.filter((_, fieldIndex) => fieldIndex !== index),
                    })
                  }
                  title="Remove mapped value"
                  className="mt-5 flex size-10 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
                >
                  <Trash2 size={15} />
                </button>
                {draft.source === "microsoft_forms" &&
                  getFormLibraryFieldInputSource(field, draft.source) ===
                    "microsoft_forms" && (
                    <label className="lg:col-span-4">
                      <span className="mb-1 block text-xs text-neutral-500">
                        Microsoft Forms question
                      </span>
                      <input
                        value={field.externalQuestionLabel || field.label}
                        onChange={(event) =>
                          updateField(index, {
                            externalQuestionLabel: event.target.value,
                          })
                        }
                        placeholder="Exact question label sent by Power Automate"
                        className={inputClassName}
                      />
                    </label>
                  )}
                {getFormLibraryFieldInputSource(field, draft.source) ===
                  "attachment_extraction" && (
                  <div className="grid gap-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900 lg:col-span-4 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-xs text-neutral-500">
                        Attachment to parse
                      </span>
                      <select
                        value={field.attachmentFieldName || ""}
                        onChange={(event) =>
                          updateField(index, {
                            attachmentFieldName: event.target.value,
                          })
                        }
                        className={inputClassName}
                      >
                        <option value="">Choose attachment</option>
                        {(draft.attachmentFields || []).map((attachment) => (
                          <option key={attachment.name} value={attachment.name}>
                            {attachment.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-neutral-500">
                        AI instruction (optional)
                      </span>
                      <input
                        value={field.instructions}
                        onChange={(event) =>
                          updateField(index, { instructions: event.target.value })
                        }
                        placeholder={`Extract ${field.label}.`}
                        className={inputClassName}
                      />
                    </label>
                    {!draft.attachmentFields?.length && (
                      <p className="text-xs text-amber-800 dark:text-amber-200 md:col-span-2">
                        Add an attachment question below before saving this field.
                      </p>
                    )}
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm lg:col-span-4">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(index, { required: event.target.checked })}
                  />
                  {getFormLibraryFieldInputSource(field, draft.source) ===
                  "attachment_extraction"
                    ? "Required extracted value"
                    : draft.source === "microsoft_forms"
                      ? "Required Microsoft Forms answer"
                      : "Required response"}
                </label>
                {getFormLibraryFieldInputSource(field, draft.source) ===
                  "approval_app" &&
                  isNativeFormChoiceField(field.type) && (
                  <div className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900 lg:col-span-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          Choices
                        </p>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                          {field.type === "checkbox"
                            ? "Users may select more than one choice."
                            : "Users may select one choice."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateField(index, {
                            options: [
                              ...(field.options || []),
                              `Choice ${(field.options || []).length + 1}`,
                            ],
                          })
                        }
                        className="flex min-h-9 items-center gap-2 rounded-md border border-[#f7941d]/50 bg-[#fff4e6] px-3 text-sm text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100"
                      >
                        <Plus size={14} /> Add choice
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(field.options || []).map((option, optionIndex) => (
                        <div
                          key={`mapped-value-${index}-choice-${optionIndex}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
                        >
                          <label>
                            <span className="sr-only">Choice {optionIndex + 1}</span>
                            <input
                              value={option}
                              onChange={(event) =>
                                updateField(index, {
                                  options: (field.options || []).map((item, itemIndex) =>
                                    itemIndex === optionIndex ? event.target.value : item,
                                  ),
                                })
                              }
                              placeholder={`Choice ${optionIndex + 1}`}
                              className={inputClassName}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              updateField(index, {
                                options: (field.options || []).filter(
                                  (_, itemIndex) => itemIndex !== optionIndex,
                                ),
                              })
                            }
                            title={`Remove choice ${optionIndex + 1}`}
                            className="flex size-10 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {getFormLibraryFieldInputSource(field, draft.source) ===
                  "microsoft_forms" &&
                  isNativeFormChoiceField(field.type) && (
                    <p className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 lg:col-span-4">
                      Choices are managed in Microsoft Forms. Approval App receives the
                      selected answer through Power Automate and does not duplicate the
                      option list here.
                    </p>
                  )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 border-t border-[#e6e6e6] pt-5 dark:border-neutral-700">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Attachment questions</h3>
              <InfoTip label="Register file-upload questions. Microsoft Forms files arrive through Power Automate; Approval App forms show upload controls directly." />
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  attachmentFields: [
                    ...(draft.attachmentFields || []),
                    {
                      name: `attachment_${(draft.attachmentFields || []).length + 1}`,
                      label: "File upload",
                      required: false,
                    },
                  ],
                })
              }
              className="flex min-h-9 items-center gap-2 rounded-md border border-[#e6e6e6] px-3 text-sm text-neutral-800 hover:border-[#f7941d]/60 dark:border-neutral-700 dark:text-neutral-100"
            >
              <Plus size={14} /> Add attachment
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {(draft.attachmentFields || []).map((field, index) => (
              <div
                key={`mapped-attachment-${index}`}
                className="grid gap-3 rounded-md border border-[#e6e6e6] p-3 dark:border-neutral-700 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <label>
                  <span className="mb-1 block text-xs text-neutral-500">Upload question label</span>
                  <input
                    value={field.label}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        attachmentFields: (draft.attachmentFields || []).map(
                          (item, fieldIndex) =>
                            fieldIndex === index
                              ? {
                                  ...item,
                                  label: event.target.value,
                                  name: toFieldName(event.target.value),
                                }
                              : item,
                        ),
                      })
                    }
                    className={inputClassName}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      attachmentFields: (draft.attachmentFields || []).filter(
                        (_, fieldIndex) => fieldIndex !== index,
                      ),
                    })
                  }
                  title="Remove attachment mapping"
                  className="mt-5 flex size-10 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
                >
                  <Trash2 size={15} />
                </button>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        attachmentFields: (draft.attachmentFields || []).map(
                          (item, fieldIndex) =>
                            fieldIndex === index
                              ? { ...item, required: event.target.checked }
                              : item,
                        ),
                      })
                    }
                  />
                  Required upload
                </label>
              </div>
            ))}
            {!draft.attachmentFields?.length && (
              <p className="rounded-md border border-dashed border-[#d2d2d2] px-3 py-4 text-sm text-neutral-500 dark:border-neutral-700">
                No attachment questions registered.
              </p>
            )}
          </div>
        </div>

        {draft.source === "microsoft_forms" && draft.responseMode === "start_workflow" && targetWorkflow && (
          <div className="mt-5 border-t border-[#e6e6e6] pt-5 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Participant preflight</h3>
              <InfoTip label="Choose how each workflow participant email is resolved before automatic routing starts." />
            </div>
            <div className="mt-3 space-y-3">
              {participantNodes.map((node) => {
                const mapping = draft.participantMappings.find(
                  (item) => item.nodeId === node.id,
                ) || { nodeId: node.id, source: "directory_position" as const };
                return (
                  <div key={node.id} className="grid gap-3 rounded-md border border-[#e6e6e6] p-3 dark:border-neutral-700 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium">{node.label}</p>
                      <p className="mt-1 text-xs text-neutral-500">{node.kind.replaceAll("_", " ")}</p>
                    </div>
                    <select
                      value={mapping.source}
                      onChange={(event) => {
                        const nextSource = event.target.value as FormParticipantResolutionSource;
                        setDraft({
                          ...draft,
                          participantMappings: [
                            ...draft.participantMappings.filter((item) => item.nodeId !== node.id),
                            { nodeId: node.id, source: nextSource },
                          ],
                        });
                      }}
                      className={inputClassName}
                    >
                      {participantSourceOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {mapping.source === "form_field" && (
                      <select
                        value={mapping.fieldName || ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            participantMappings: [
                              ...draft.participantMappings.filter((item) => item.nodeId !== node.id),
                              { ...mapping, fieldName: event.target.value },
                            ],
                          })
                        }
                        className={`${inputClassName} md:col-start-2`}
                      >
                        <option value="">Select email field</option>
                        {draft.fields.filter((field) => field.type === "email").map((field) => (
                          <option key={field.name} value={field.name}>{field.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-[#e6e6e6] pt-5 dark:border-neutral-700">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Version comment (optional)</span>
            <input
              value={draft.versionComment}
              onChange={(event) => setDraft({ ...draft, versionComment: event.target.value })}
              placeholder="What changed and why"
              className={inputClassName}
            />
          </label>
          {preflightIssues.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
              <p className="font-medium">Setup needed</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {preflightIssues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={selectedDefinition?.status === "archived"}
              title="Save without making this version available to workflows."
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d2d2d2] bg-white px-4 font-medium text-neutral-900 transition hover:border-[#f7941d] disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <Save size={16} /> Save draft
            </button>
            <button
              type="button"
              onClick={() => save("publish")}
              disabled={preflightIssues.length > 0 || selectedDefinition?.status === "archived"}
              title={preflightIssues[0] || "Publish and activate this form version for new workflow attachments."}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#f7941d] bg-[#f7941d] px-4 font-medium text-[#231f20] transition hover:bg-[#df7f0a] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save size={16} /> Publish version
            </button>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}

const inputClassName =
  "min-h-10 w-full rounded-md border border-[#d2d2d2] bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#f7941d] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

function definitionToDraft(definition: FormLibraryDefinition): FormLibraryDraft {
  return {
    name: definition.name,
    description: definition.description || "",
    business: definition.business || "",
    department: definition.department || "",
    source: definition.source,
    responseMode: definition.responseMode,
    responseUrl: definition.responseUrl || "",
    embedUrl: definition.embedUrl || "",
    targetWorkflowTemplateId: definition.targetWorkflowTemplateId || "",
    versionComment: definition.isDraft === true ? definition.versionComment || "" : "",
    fields: definition.fields.map((field) => {
      const inputSource = getFormLibraryFieldInputSource(field, definition.source);
      return {
        ...field,
        inputSource,
        ...(inputSource === "microsoft_forms"
          ? { externalQuestionLabel: field.externalQuestionLabel || field.label }
          : {}),
      };
    }),
    layout: normalizeFormLayout(definition.layout, definition.fields),
    attachmentFields: definition.attachmentFields || [],
    participantMappings: definition.participantMappings || [],
  };
}

function tabClassName(active: boolean) {
  return `flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm transition ${
    active
      ? "border-[#f7941d] bg-[#fff4e6] text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100"
      : "border-[#e6e6e6] text-neutral-600 hover:border-[#f7941d]/60 dark:border-neutral-700 dark:text-neutral-300"
  }`;
}

function toFieldName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

const newFormButtonClassName =
  "flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#f7941d]/50 bg-[#fff4e6] px-3 text-sm font-medium text-neutral-900 transition hover:bg-[#ffe8cc] dark:bg-[#f7941d]/12 dark:text-neutral-100";
