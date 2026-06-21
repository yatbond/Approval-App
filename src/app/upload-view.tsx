"use client";

import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Send,
  X,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import {
  buildPreviewImageStyle,
  cropPreviewPageToFile,
  normalizedRectToPercentStyle,
  normalizeSelectionRect,
  type DocumentPreviewPage,
  type NormalizedRect,
  type Point,
} from "@/lib/document-preview";
import {
  acceptForDocumentFormat,
  formatDocumentFormat,
} from "@/lib/workflow-documents";
import {
  buildAdHocExtractionFields,
  createAdHocFieldDraft,
  createFieldDraftFromSuggestion,
  createHighlightedExtractionField,
  getUploadViewState,
  type AdHocFieldDraft,
} from "@/lib/upload-view-state";
import type { ParsedWorkspaceFilePayload } from "@/lib/workspace-file-api";
import type {
  ApprovalAttachment,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";

export function UploadView({
  fileName,
  parseResult,
  editedFields,
  setEditedFields,
  isParsing,
  parseError,
  parseFile,
  documentPreviewPages,
  onExtractHighlightedRegion,
  uploadedAttachments,
  workflowTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  submissionMessage,
  onSubmitRequest,
}: {
  fileName: string;
  parseResult: ParsedWorkspaceFilePayload | null;
  editedFields: Record<string, string>;
  setEditedFields: (fields: Record<string, string>) => void;
  isParsing: boolean;
  parseError: string;
  parseFile: (
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
    adHocFields?: WorkflowField[],
  ) => void;
  documentPreviewPages: DocumentPreviewPage[];
  onExtractHighlightedRegion: (
    file: File,
    field: WorkflowField,
  ) => Promise<void>;
  uploadedAttachments: ApprovalAttachment[];
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  submissionMessage: string;
  onSubmitRequest: () => void;
}) {
  const [adHocFieldDrafts, setAdHocFieldDrafts] = useState<AdHocFieldDraft[]>([
    createAdHocFieldDraft(1),
  ]);
  const [selectedPreviewPageId, setSelectedPreviewPageId] = useState("");
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [highlightRect, setHighlightRect] = useState<NormalizedRect | null>(null);
  const [highlightFieldLabel, setHighlightFieldLabel] = useState("");
  const [highlightError, setHighlightError] = useState("");
  const [previewContrast, setPreviewContrast] = useState(210);
  const [previewBrightness, setPreviewBrightness] = useState(88);
  const [previewZoom, setPreviewZoom] = useState(145);
  const {
    requestTemplates,
    selectedTemplate,
    uploadDocuments,
    uploadedDocumentIds,
    missingRequiredDocuments,
  } = getUploadViewState({
    workflowTemplates,
    selectedTemplateId,
    uploadedAttachments,
  });
  const adHocFields = buildAdHocExtractionFields(adHocFieldDrafts);
  const selectedPreviewPage =
    documentPreviewPages.find((page) => page.id === selectedPreviewPageId) ||
    documentPreviewPages[0];
  const highlightStyle = highlightRect
    ? normalizedRectToPercentStyle(highlightRect)
    : null;
  const previewImageStyle = buildPreviewImageStyle({
    contrast: previewContrast,
    brightness: previewBrightness,
    zoom: previewZoom,
  });
  const previewStageStyle = {
    width: previewImageStyle.width,
    maxWidth: previewImageStyle.maxWidth,
  };
  const readablePreviewImageStyle = {
    filter: previewImageStyle.filter,
    maxWidth: "none",
    width: "100%",
  };

  useEffect(() => {
    if (selectedTemplate && selectedTemplate.id !== selectedTemplateId) {
      setSelectedTemplateId(selectedTemplate.id);
    }
  }, [selectedTemplate, selectedTemplateId, setSelectedTemplateId]);

  function pointFromPreviewEvent(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      bounds: {
        width: rect.width,
        height: rect.height,
      },
    };
  }

  async function extractHighlightedField() {
    if (!selectedPreviewPage || !highlightRect || !highlightFieldLabel.trim()) {
      setHighlightError("Highlight an area and enter a field name first.");
      return;
    }

    setHighlightError("");
    try {
      const field = createHighlightedExtractionField(
        highlightFieldLabel,
        Object.keys(editedFields).length + 1,
      );
      const cropFile = await cropPreviewPageToFile({
        page: selectedPreviewPage,
        rect: highlightRect,
        fileName: `${field.name}.png`,
      });
      await onExtractHighlightedRegion(cropFile, field);
      setHighlightFieldLabel("");
      setHighlightRect(null);
    } catch (error) {
      setHighlightError(
        error instanceof Error
          ? error.message
          : "Unable to extract highlighted field.",
      );
    }
  }

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
            {requestTemplates.length === 0 && (
              <option value="">No published templates</option>
            )}
            {requestTemplates.map((template) => (
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

        <div className="mt-5 rounded-md border border-white/10 bg-[#121518] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-200">
                Fields to extract
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Used for ad hoc uploads and Qwen visual OCR.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setAdHocFieldDrafts((drafts) => [
                  ...drafts,
                  createAdHocFieldDraft(drafts.length + 1),
                ])
              }
              className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/20"
            >
              <Plus size={14} />
              Add field
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {adHocFieldDrafts.map((draft, index) => (
              <div key={draft.id} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <input
                  value={draft.label}
                  placeholder="Field name, e.g. invoice total"
                  onChange={(event) =>
                    setAdHocFieldDrafts((drafts) =>
                      drafts.map((item) =>
                        item.id === draft.id
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className="h-10 min-w-0 rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                />
                <input
                  value={draft.instructions}
                  placeholder="Optional instruction"
                  onChange={(event) =>
                    setAdHocFieldDrafts((drafts) =>
                      drafts.map((item) =>
                        item.id === draft.id
                          ? { ...item, instructions: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className="h-10 min-w-0 rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                />
                <button
                  type="button"
                  onClick={() =>
                    setAdHocFieldDrafts((drafts) =>
                      drafts.length === 1
                        ? [createAdHocFieldDraft(1)]
                        : drafts.filter((item) => item.id !== draft.id),
                    )
                  }
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 text-xs text-rose-100 transition hover:bg-rose-500/20"
                  aria-label={`Remove extraction field ${index + 1}`}
                >
                  <X size={14} />
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="mt-4 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-[#121518] p-6 text-center transition hover:border-emerald-400/60 hover:bg-emerald-400/5">
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
                parseFile(file, undefined, adHocFields);
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
          {selectedPreviewPage && (
            <div className="mb-4 rounded-md border border-white/10 bg-[#121518] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">
                    Document preview
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Drag over a value, name the field, then extract just that area.
                  </p>
                </div>
                {documentPreviewPages.length > 1 && (
                  <select
                    value={selectedPreviewPage.id}
                    onChange={(event) => {
                      setSelectedPreviewPageId(event.target.value);
                      setHighlightRect(null);
                    }}
                    className="h-9 rounded-md border border-white/10 bg-[#101214] px-3 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {documentPreviewPages.map((page) => (
                      <option key={page.id} value={page.id}>
                        Page {page.pageNumber}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-3 grid gap-3 rounded-md border border-white/10 bg-[#101214] p-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                    <span>Zoom</span>
                    <span>{previewZoom}%</span>
                  </span>
                  <input
                    type="range"
                    min="75"
                    max="220"
                    step="5"
                    value={previewZoom}
                    onChange={(event) => setPreviewZoom(Number(event.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                    <span>Contrast</span>
                    <span>{previewContrast}%</span>
                  </span>
                  <input
                    type="range"
                    min="100"
                    max="260"
                    step="5"
                    value={previewContrast}
                    onChange={(event) => setPreviewContrast(Number(event.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                    <span>Brightness</span>
                    <span>{previewBrightness}%</span>
                  </span>
                  <input
                    type="range"
                    min="70"
                    max="120"
                    step="2"
                    value={previewBrightness}
                    onChange={(event) => setPreviewBrightness(Number(event.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>
              </div>

              <div
                className="mt-3 max-h-[70vh] overflow-auto rounded-md border border-white/10 bg-neutral-950 p-3"
              >
                <div
                  className="relative inline-block"
                  style={previewStageStyle}
                  onMouseDown={(event) => {
                    const point = pointFromPreviewEvent(event);
                    setSelectionStart({ x: point.x, y: point.y });
                  }}
                  onMouseUp={(event) => {
                    if (!selectionStart) {
                      return;
                    }

                    const point = pointFromPreviewEvent(event);
                    const rect = normalizeSelectionRect(selectionStart, point, point.bounds);
                    if (rect.width >= 0.01 && rect.height >= 0.01) {
                      setHighlightRect(rect);
                    }
                    setSelectionStart(null);
                  }}
                  onMouseLeave={() => setSelectionStart(null)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedPreviewPage.dataUrl}
                    alt={`Document preview page ${selectedPreviewPage.pageNumber}`}
                    draggable={false}
                    className="block select-none"
                    style={readablePreviewImageStyle}
                  />
                  {highlightStyle && (
                    <div
                      className="pointer-events-none absolute border-2 border-emerald-300 bg-emerald-300/20"
                      style={highlightStyle}
                    />
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={highlightFieldLabel}
                  onChange={(event) => setHighlightFieldLabel(event.target.value)}
                  placeholder="Highlighted field name"
                  className="h-10 rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                />
                <button
                  type="button"
                  onClick={extractHighlightedField}
                  disabled={isParsing}
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isParsing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ImageIcon size={16} />
                  )}
                  Extract highlight
                </button>
              </div>
              {highlightError && (
                <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {highlightError}
                </p>
              )}
            </div>
          )}

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
                {parseResult.notes.map((note, index) => (
                  <span
                    key={`${note}-${index}`}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-100"
                  >
                    {note}
                  </span>
                ))}
              </div>

              {parseResult.suggestedFields?.length ? (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-sky-100">
                        Suggested fields
                      </p>
                      <p className="mt-1 text-xs text-sky-100/70">
                        Add useful values the parser found but the workflow did not request.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {parseResult.suggestedFields.map((suggestion, index) => (
                      <div
                        key={`${suggestion.name}-${index}`}
                        className="rounded-md border border-white/10 bg-[#101214] p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium text-neutral-100">
                              {suggestion.label}
                            </p>
                            <p className="mt-1 break-words text-sm text-neutral-300">
                              {suggestion.value}
                            </p>
                            {suggestion.evidence && (
                              <p className="mt-1 break-words text-xs text-neutral-500">
                                Evidence: {suggestion.evidence}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300">
                            {suggestion.confidence}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAdHocFieldDrafts((drafts) => [
                              ...drafts,
                              createFieldDraftFromSuggestion(
                                suggestion,
                                drafts.length + 1,
                              ),
                            ]);
                            setEditedFields({
                              ...editedFields,
                              [suggestion.label]: suggestion.value,
                            });
                          }}
                          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 text-xs font-medium text-sky-100 transition hover:bg-sky-500/20"
                        >
                          <Plus size={14} />
                          Include
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(editedFields).map(([label, value]) => (
                  <label key={label} className="block">
                    <span className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-400">
                      <span>{label}</span>
                      {parseResult.confidence?.[label] && (
                        <span
                          className={`rounded-md border px-2 py-0.5 ${
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
                      onChange={(event) =>
                        setEditedFields({
                          ...editedFields,
                          [label]: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                    />
                    {parseResult.evidence?.[label] && (
                      <p className="mt-1 rounded-md border border-white/10 bg-[#101214] px-2 py-1 text-xs text-neutral-500">
                        Evidence: {parseResult.evidence[label]}
                      </p>
                    )}
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
