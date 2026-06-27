"use client";

import { Image as ImageIcon, Loader2, Plus, Upload } from "lucide-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import {
  buildPreviewPagesFromPdfImages,
  buildPreviewImageStyle,
  cropPreviewPageToFile,
  getActiveSelectionRect,
  normalizedRectToPercentStyle,
  normalizeSelectionRect,
  readImageFileAsPreviewPage,
  type DocumentPreviewPage,
  type NormalizedRect,
  type Point,
} from "@/lib/document-preview";
import {
  getPdfOcrRenderOptions,
  getPdfPreviewRenderOptions,
  isPdfFile,
  renderPdfFileToPageImages,
  shouldRenderPdfForVision,
} from "@/lib/pdf-page-images";
import { parseWorkspaceFile, type ParsedWorkspaceFilePayload } from "@/lib/workspace-file-api";
import { createWorkflowFieldFromRecognition } from "@/lib/template-recognition-state";
import { acceptForDocumentFormat } from "@/lib/workflow-documents";
import type {
  ExtractionTrainingExample,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";

export function TemplateDocumentRecognitionPanel({
  document,
  template,
  onAddField,
}: {
  document: WorkflowDocumentRequirement;
  template: WorkflowTemplate;
  onAddField: (field: WorkflowField, example?: ExtractionTrainingExample) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parseResult, setParseResult] = useState<ParsedWorkspaceFilePayload | null>(null);
  const [previewPages, setPreviewPages] = useState<DocumentPreviewPage[]>([]);
  const [selectedPreviewPageId, setSelectedPreviewPageId] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldInstructions, setFieldInstructions] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionCurrent, setSelectionCurrent] = useState<{
    point: Point;
    bounds: { width: number; height: number };
  } | null>(null);
  const [highlightRect, setHighlightRect] = useState<NormalizedRect | null>(null);

  const selectedPreviewPage =
    previewPages.find((page) => page.id === selectedPreviewPageId) ||
    previewPages[0];
  const activeSelectionRect = getActiveSelectionRect({
    committedRect: highlightRect,
    selectionStart,
    currentPoint: selectionCurrent?.point || null,
    bounds: selectionCurrent?.bounds || null,
  });
  const previewImageStyle = buildPreviewImageStyle({
    contrast: 210,
    brightness: 88,
    zoom: 135,
  });

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

  async function parseSampleFile(file: File) {
    setFileName(file.name);
    setIsParsing(true);
    setParseError("");
    setParseResult(null);
    setPreviewPages([]);
    setHighlightRect(null);
    try {
      const pdfPreviewImages = isPdfFile(file)
        ? await renderPdfFileToPageImages(file, getPdfPreviewRenderOptions())
        : [];
      const pageImages = shouldRenderPdfForVision(file)
        ? await renderPdfFileToPageImages(file, getPdfOcrRenderOptions())
        : [];
      if (pdfPreviewImages.length) {
        const pages = buildPreviewPagesFromPdfImages(pdfPreviewImages);
        setPreviewPages(pages);
        setSelectedPreviewPageId(pages[0]?.id || "");
      } else if (file.type.startsWith("image/")) {
        const page = await readImageFileAsPreviewPage(file);
        setPreviewPages([page]);
        setSelectedPreviewPageId(page.id);
      }

      const payload = await parseWorkspaceFile({
        file,
        documentRequirement: document,
        pageImages,
        extractionExamples: (template.extractionExamples || []).filter(
          (example) => example.documentId === document.id,
        ),
      });
      setParseResult(payload);
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to parse sample document.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  function addFieldFromValues({
    label,
    instructions,
    value = "",
    evidence = "",
  }: {
    label: string;
    instructions?: string;
    value?: string;
    evidence?: string;
  }) {
    const field = createWorkflowFieldFromRecognition({
      documentId: document.id,
      label,
      instructions,
      existingFields: document.fields,
    });
    onAddField(
      field,
      value
        ? {
            id: createTemplateSampleExampleId(document.id, field.name, fileName),
            templateId: template.id,
            documentId: document.id,
            documentType: document.documentType,
            fieldLabel: field.label,
            originalValue: "",
            correctedValue: value,
            evidence,
            sourceFileName: fileName,
            createdByEmail: template.updatedByEmail || template.createdByEmail || "",
            createdAt: new Date().toISOString(),
          }
        : undefined,
    );
  }

  async function extractHighlightedSample() {
    if (!selectedPreviewPage || !highlightRect || !fieldLabel.trim()) {
      return;
    }

    setIsParsing(true);
    setParseError("");
    try {
      const field = createWorkflowFieldFromRecognition({
        documentId: document.id,
        label: fieldLabel,
        instructions: fieldInstructions,
        existingFields: document.fields,
      });
      const cropFile = await cropPreviewPageToFile({
        page: selectedPreviewPage,
        rect: highlightRect,
        fileName: `${field.name}-sample.png`,
      });
      const payload = await parseWorkspaceFile({
        file: cropFile,
        adHocFields: [field],
        extractionExamples: template.extractionExamples || [],
      });
      const value =
        payload.fields[field.label] ||
        payload.fields[field.name] ||
        Object.values(payload.fields || {})[0] ||
        "";
      const evidence =
        payload.evidence?.[field.label] ||
        payload.evidence?.[field.name] ||
        Object.values(payload.evidence || {})[0] ||
        "";
      setFieldValue(value);
      onAddField(field, {
        id: createTemplateSampleExampleId(document.id, field.name, fileName),
        templateId: template.id,
        documentId: document.id,
        documentType: document.documentType,
        fieldLabel: field.label,
        originalValue: "",
        correctedValue: value,
        evidence,
        sourceFileName: fileName,
        createdByEmail: template.updatedByEmail || template.createdByEmail || "",
        createdAt: new Date().toISOString(),
      });
      setHighlightRect(null);
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to extract highlighted sample.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-white/10 bg-[#0d1012] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-neutral-300">
            Sample recognition
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Upload a sample, accept suggested fields, or box a value to create template fields.
          </p>
        </div>
        <label className="flex min-h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-2 text-xs text-emerald-100 transition hover:bg-emerald-400/20">
          {isParsing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Sample
          <input
            type="file"
            className="sr-only"
            accept={acceptForDocumentFormat(document.format)}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void parseSampleFile(file);
              }
            }}
          />
        </label>
      </div>

      {fileName && (
        <p className="mt-2 break-words text-xs text-neutral-500">{fileName}</p>
      )}
      {parseError && (
        <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
          {parseError}
        </p>
      )}

      {parseResult?.suggestedFields?.length ? (
        <div className="mt-3 rounded-md border border-sky-500/25 bg-sky-500/10 p-2">
          <p className="text-xs font-semibold text-sky-100">
            Step 1: Suggested fields
          </p>
          <div className="mt-2 space-y-2">
            {parseResult.suggestedFields.map((suggestion, index) => (
              <div
                key={`${suggestion.name}-${index}`}
                className="rounded-md border border-white/10 bg-[#101214] p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-xs text-neutral-100">
                      {suggestion.label}
                    </p>
                    <p className="mt-1 break-words text-xs text-neutral-400">
                      {suggestion.value}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addFieldFromValues({
                        label: suggestion.label,
                        instructions: suggestion.instructions,
                        value: suggestion.value,
                        evidence: suggestion.evidence,
                      })
                    }
                    className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100"
                  >
                    <Plus size={12} />
                    Use
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedPreviewPage && (
        <div className="mt-3 rounded-md border border-white/10 bg-[#101214] p-2">
          <p className="text-xs font-semibold text-neutral-300">
            Step 2: Add / correct fields
          </p>
          {previewPages.length > 1 && (
            <select
              value={selectedPreviewPage.id}
              onChange={(event) => {
                setSelectedPreviewPageId(event.target.value);
                setHighlightRect(null);
              }}
              className="mt-2 h-8 rounded-md border border-white/10 bg-[#0d1012] px-2 text-xs outline-none"
            >
              {previewPages.map((page) => (
                <option key={page.id} value={page.id}>
                  Page {page.pageNumber}
                </option>
              ))}
            </select>
          )}
          <div className="mt-2 max-h-80 overflow-auto rounded-md border border-white/10 bg-black/20 p-2">
            <div
              className="relative overflow-hidden"
              style={{ width: previewImageStyle.width, maxWidth: previewImageStyle.maxWidth }}
              onMouseDown={(event) => {
                const point = pointFromPreviewEvent(event);
                setSelectionStart({ x: point.x, y: point.y });
                setSelectionCurrent({ point: { x: point.x, y: point.y }, bounds: point.bounds });
              }}
              onMouseMove={(event) => {
                if (!selectionStart) {
                  return;
                }
                const point = pointFromPreviewEvent(event);
                setSelectionCurrent({ point: { x: point.x, y: point.y }, bounds: point.bounds });
              }}
              onMouseUp={(event) => {
                if (!selectionStart) {
                  return;
                }
                const point = pointFromPreviewEvent(event);
                setHighlightRect(
                  normalizeSelectionRect(
                    selectionStart,
                    { x: point.x, y: point.y },
                    point.bounds,
                  ),
                );
                setSelectionStart(null);
                setSelectionCurrent(null);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPreviewPage.dataUrl}
                alt={`Template sample page ${selectedPreviewPage.pageNumber}`}
                draggable={false}
                className="block select-none"
                style={{
                  filter: previewImageStyle.filter,
                  maxWidth: "none",
                  width: "100%",
                }}
              />
              {activeSelectionRect && (
                <div
                  className="pointer-events-none absolute border-2 border-emerald-300 bg-emerald-300/20"
                  style={normalizedRectToPercentStyle(activeSelectionRect)}
                />
              )}
            </div>
          </div>
          <div className="mt-2 grid gap-2">
            <input
              value={fieldLabel}
              onChange={(event) => setFieldLabel(event.target.value)}
              placeholder="Field name, e.g. Invoice total"
              className="h-8 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none"
            />
            <input
              value={fieldInstructions}
              onChange={(event) => setFieldInstructions(event.target.value)}
              placeholder="Instruction, optional"
              className="h-8 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none"
            />
            <input
              value={fieldValue}
              onChange={(event) => setFieldValue(event.target.value)}
              placeholder="Sample value, optional"
              className="h-8 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  addFieldFromValues({
                    label: fieldLabel,
                    instructions: fieldInstructions,
                    value: fieldValue,
                  })
                }
                disabled={!fieldLabel.trim()}
                className="flex h-8 items-center justify-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-2 text-xs text-emerald-100 disabled:opacity-40"
              >
                <Plus size={12} />
                Add template field
              </button>
              <button
                type="button"
                onClick={extractHighlightedSample}
                disabled={!highlightRect || !fieldLabel.trim() || isParsing}
                className="flex h-8 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 disabled:opacity-40"
              >
                {isParsing ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                Extract box
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function createTemplateSampleExampleId(
  documentId: string,
  fieldName: string,
  fileName: string,
) {
  return `template-sample-${documentId}-${fieldName}-${slugify(fileName) || "sample"}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
