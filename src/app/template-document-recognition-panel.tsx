"use client";

import { Image as ImageIcon, Loader2, Maximize2, Plus, Sparkles, Upload, X } from "lucide-react";
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
import {
  buildSampleRecognitionPageImages,
  readRecognizedSampleField,
} from "@/lib/sample-recognition-state";
import { parseWorkspaceFile, type ParsedWorkspaceFilePayload } from "@/lib/workspace-file-api";
import { createWorkflowFieldFromRecognition } from "@/lib/template-recognition-state";
import { acceptForDocumentFormat } from "@/lib/workflow-documents";
import {
  buildWorkflowDocumentSample,
  getSamplePageImages,
  getSamplePreviewPages,
} from "@/lib/workflow-document-sample-state";
import type {
  ExtractionTrainingExample,
  WorkflowDocumentRequirement,
  WorkflowDocumentSample,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";
import { InfoTip } from "./ui-hint";

const NEW_FIELD_VALUE = "__new_field__";

type TrainingAnchor = NonNullable<ExtractionTrainingExample["anchor"]>;
type SavedSampleField = {
  fieldName: string;
  label: string;
  value: string;
  hasAnchor: boolean;
};

export function TemplateDocumentRecognitionPanel({
  document,
  template,
  onAddField,
  onSaveSample,
}: {
  document: WorkflowDocumentRequirement;
  template: WorkflowTemplate;
  onAddField: (field: WorkflowField, example?: ExtractionTrainingExample) => void;
  onSaveSample: (sample: WorkflowDocumentSample) => void;
}) {
  const [fileName, setFileName] = useState(document.sample?.fileName || "");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [samplePageImages, setSamplePageImages] = useState<
    Awaited<ReturnType<typeof renderPdfFileToPageImages>>
  >(() => getSamplePageImages(document.sample));
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parseResult, setParseResult] = useState<ParsedWorkspaceFilePayload | null>(null);
  const [previewPages, setPreviewPages] = useState<DocumentPreviewPage[]>(() =>
    getSamplePreviewPages(document.sample),
  );
  const [selectedPreviewPageId, setSelectedPreviewPageId] = useState(
    () => getSamplePreviewPages(document.sample)[0]?.id || "",
  );
  const [selectedFieldName, setSelectedFieldName] = useState(
    document.fields[0]?.name || NEW_FIELD_VALUE,
  );
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [fieldInstructions, setFieldInstructions] = useState(
    document.fields[0]?.instructions || "",
  );
  const [fieldValue, setFieldValue] = useState("");
  const [fieldEvidence, setFieldEvidence] = useState("");
  const [fieldAnchor, setFieldAnchor] = useState<TrainingAnchor | null>(null);
  const [savedSampleFields, setSavedSampleFields] = useState<SavedSampleField[]>([]);
  const [isBoxSelectorOpen, setIsBoxSelectorOpen] = useState(false);
  const [boxSelectorZoom, setBoxSelectorZoom] = useState(180);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionCurrent, setSelectionCurrent] = useState<{
    point: Point;
    bounds: { width: number; height: number };
  } | null>(null);
  const [highlightRect, setHighlightRect] = useState<NormalizedRect | null>(null);

  const selectedFieldStillExists = document.fields.some(
    (field) => field.name === selectedFieldName,
  );
  const effectiveSelectedFieldName =
    selectedFieldName === NEW_FIELD_VALUE || selectedFieldStillExists
      ? selectedFieldName
      : document.fields[0]?.name || NEW_FIELD_VALUE;
  const selectedExistingField = document.fields.find(
    (field) => field.name === effectiveSelectedFieldName,
  );
  const isNewField = selectedFieldName === NEW_FIELD_VALUE || !selectedExistingField;
  const activeFieldLabel = isNewField
    ? newFieldLabel.trim()
    : selectedExistingField.label;
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
  const boxSelectorImageStyle = buildPreviewImageStyle({
    contrast: 210,
    brightness: 88,
    zoom: boxSelectorZoom,
  });
  const documentExtractionExamples = (template.extractionExamples || []).filter(
    (example) => example.documentId === document.id,
  );

  function selectTrainingField(fieldName: string) {
    const selected = document.fields.find((field) => field.name === fieldName);
    setSelectedFieldName(fieldName);
    setFieldInstructions(selected?.instructions || "");
    setFieldValue("");
    setFieldEvidence("");
    setFieldAnchor(null);
    setHighlightRect(null);
  }

  function selectNextUnsavedField(currentFieldName: string) {
    const savedNames = new Set([
      ...savedSampleFields.map((field) => field.fieldName),
      currentFieldName,
    ]);
    const nextField = document.fields.find((field) => !savedNames.has(field.name));

    if (nextField) {
      selectTrainingField(nextField.name);
      return;
    }

    setFieldValue("");
    setFieldEvidence("");
    setFieldAnchor(null);
    setHighlightRect(null);
  }

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

  function startSelection(event: MouseEvent<HTMLDivElement>) {
    const point = pointFromPreviewEvent(event);
    setSelectionStart({ x: point.x, y: point.y });
    setSelectionCurrent({ point: { x: point.x, y: point.y }, bounds: point.bounds });
  }

  function moveSelection(event: MouseEvent<HTMLDivElement>) {
    if (!selectionStart) {
      return;
    }
    const point = pointFromPreviewEvent(event);
    setSelectionCurrent({ point: { x: point.x, y: point.y }, bounds: point.bounds });
  }

  function finishSelection(event: MouseEvent<HTMLDivElement>) {
    if (!selectionStart) {
      return;
    }
    const point = pointFromPreviewEvent(event);
    setHighlightRect(
      normalizeSelectionRect(selectionStart, { x: point.x, y: point.y }, point.bounds),
    );
    setSelectionStart(null);
    setSelectionCurrent(null);
  }

  async function parseSampleFile(file: File) {
    setFileName(file.name);
    setSampleFile(file);
    setSamplePageImages([]);
    setIsParsing(true);
    setParseError("");
    setParseResult(null);
    setPreviewPages([]);
    setHighlightRect(null);
    setFieldAnchor(null);
    setSavedSampleFields([]);
    try {
      const pdfPreviewImages = isPdfFile(file)
        ? await renderPdfFileToPageImages(file, getPdfPreviewRenderOptions())
        : [];
      const pageImages = shouldRenderPdfForVision(file)
        ? await renderPdfFileToPageImages(file, getPdfOcrRenderOptions())
        : [];
      setSamplePageImages(pageImages);
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
        extractionExamples: documentExtractionExamples,
      });
      setParseResult(payload);
      onSaveSample(
        buildWorkflowDocumentSample({
          file,
          previewPages: pdfPreviewImages.length
            ? buildPreviewPagesFromPdfImages(pdfPreviewImages)
            : file.type.startsWith("image/")
              ? [await readImageFileAsPreviewPage(file)]
              : [],
          pageImages,
        }),
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to parse sample document.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  function resolveField(): WorkflowField | null {
    if (selectedExistingField) {
      return {
        ...selectedExistingField,
        instructions: fieldInstructions.trim() || selectedExistingField.instructions,
      };
    }

    if (!newFieldLabel.trim()) {
      return null;
    }

    return createWorkflowFieldFromRecognition({
      documentId: document.id,
      label: newFieldLabel,
      instructions: fieldInstructions,
      existingFields: document.fields,
    });
  }

  function buildExample({
    field,
    value,
    evidence = "",
    anchor,
  }: {
    field: WorkflowField;
    value: string;
    evidence?: string;
    anchor?: TrainingAnchor | null;
  }): ExtractionTrainingExample | undefined {
    if (!value.trim()) {
      return undefined;
    }

    return {
      id: createTemplateSampleExampleId(document.id, field.name, fileName),
      templateId: template.id,
      documentId: document.id,
      documentType: document.documentType,
      fieldLabel: field.label,
      originalValue: "",
      correctedValue: value,
      evidence,
      anchor: anchor || undefined,
      sourceFileName: fileName,
      createdByEmail: template.updatedByEmail || template.createdByEmail || "",
      createdAt: new Date().toISOString(),
    };
  }

  function saveFieldSample() {
    const field = resolveField();
    if (!field) {
      return;
    }
    const example = buildExample({
      field,
      value: fieldValue,
      evidence: fieldEvidence,
      anchor: fieldAnchor,
    });

    onAddField(field, example);
    if (example) {
      setSavedSampleFields((current) => [
        ...current.filter((item) => item.fieldName !== field.name),
        {
          fieldName: field.name,
          label: field.label,
          value: example.correctedValue,
          hasAnchor: Boolean(example.anchor),
        },
      ]);
    }
    selectNextUnsavedField(field.name);
  }

  function addFieldFromSuggestion({
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
    onAddField(field, buildExample({ field, value, evidence }));
  }

  async function recognizeSampleField() {
    const field = resolveField();
    const recognitionFile =
      sampleFile || createPlaceholderFileFromSavedSample(document.sample);
    if (!recognitionFile || !field) {
      return;
    }

    setIsParsing(true);
    setParseError("");
    try {
      const payload = await parseWorkspaceFile({
        file: recognitionFile,
        adHocFields: [field],
        pageImages: buildSampleRecognitionPageImages({
          selectedPreviewPage,
          samplePageImages,
        }),
        extractionExamples: documentExtractionExamples,
      });
      const recognized = readRecognizedSampleField(payload, field);
      setFieldValue(recognized.value);
      setFieldEvidence(recognized.evidence);
      setFieldAnchor(null);
      if (!recognized.value) {
        setParseError(
          [
            "AI did not recognize a value for this field. Adjust the instruction or use Extract box.",
            formatParseDiagnosticId(payload),
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to recognize sample value.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  async function extractHighlightedSample() {
    const field = resolveField();
    if (!selectedPreviewPage || !highlightRect || !field) {
      return;
    }

    setIsParsing(true);
    setParseError("");
    try {
      const cropFile = await cropPreviewPageToFile({
        page: selectedPreviewPage,
        rect: highlightRect,
        fileName: `${field.name}-sample.png`,
      });
      const payload = await parseWorkspaceFile({
        file: cropFile,
        adHocFields: [field],
        extractionExamples: documentExtractionExamples,
      });
      const recognized = readRecognizedSampleField(payload, field);
      setFieldValue(recognized.value);
      setFieldEvidence(recognized.evidence);
      setFieldAnchor({
        pageNumber: selectedPreviewPage.pageNumber,
        rect: highlightRect,
        nearbyText: recognized.evidence,
      });
      setIsBoxSelectorOpen(false);
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
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-neutral-300">Sample</p>
            <InfoTip label="Upload a sample, choose a configured field, then save the correct sample value or a boxed extraction example." />
          </div>
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
          <p className="text-xs font-semibold text-sky-100">Suggestions</p>
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
                      addFieldFromSuggestion({
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
          <div className="mb-3 rounded-md border border-white/10 bg-[#0d1012] p-2">
            <p className="text-xs font-semibold text-neutral-300">
              Saved sample fields
            </p>
            {savedSampleFields.length ? (
              <div className="mt-2 space-y-2">
                {savedSampleFields.map((field) => (
                  <div
                    key={field.fieldName}
                    className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1"
                  >
                    <p className="text-xs font-medium text-emerald-100">
                      {field.label}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-emerald-50/80">
                      {field.value}
                    </p>
                    {field.hasAnchor && (
                      <p className="mt-0.5 text-[11px] text-emerald-100/70">
                        Includes box location hint
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">
                No sample fields saved yet.
              </p>
            )}
          </div>
          <p className="text-xs font-semibold text-neutral-300">Add fields</p>
          {previewPages.length > 1 && (
            <select
              value={selectedPreviewPage.id}
              onChange={(event) => {
                setSelectedPreviewPageId(event.target.value);
                setHighlightRect(null);
                setFieldAnchor(null);
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
              {fieldAnchor?.pageNumber === selectedPreviewPage.pageNumber && (
                <div
                  className="pointer-events-none absolute border-2 border-emerald-300 bg-emerald-300/20"
                  style={normalizedRectToPercentStyle(fieldAnchor.rect)}
                />
              )}
            </div>
          </div>
          <div className="mt-2 grid gap-2">
            <label className="grid gap-1 text-xs text-neutral-400">
              <span>Field to train</span>
              <select
                value={effectiveSelectedFieldName}
                onChange={(event) => selectTrainingField(event.target.value)}
                className="h-8 rounded-md border border-white/10 bg-[#121518] px-2 text-xs text-neutral-100 outline-none"
              >
                {document.fields.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.label}
                  </option>
                ))}
                <option value={NEW_FIELD_VALUE}>+ New field</option>
              </select>
            </label>
            {isNewField && (
              <input
                value={newFieldLabel}
                onChange={(event) => setNewFieldLabel(event.target.value)}
                placeholder="New field name"
                className="h-8 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none"
              />
            )}
            <label className="grid gap-1 text-xs text-neutral-400">
              <span className="inline-flex items-center gap-1">
                Instruction
                <InfoTip label="Optional guidance for the AI, for example: extract the final payable amount in HKD, not the subtotal." />
              </span>
              <input
                value={fieldInstructions}
                onChange={(event) => setFieldInstructions(event.target.value)}
                placeholder="Instruction"
                className="h-8 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs text-neutral-400">
              <span className="inline-flex items-center gap-1">
                Sample value
                <InfoTip label="The correct answer from this sample document, used as a training example for future uploads." />
              </span>
              <input
                value={fieldValue}
                onChange={(event) => setFieldValue(event.target.value)}
                placeholder="Sample value"
                className="h-8 rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none"
              />
            </label>
            {fieldAnchor && (
              <p className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">
                Box saved as a location hint, not an exact rule.
              </p>
            )}
            <div className="grid gap-2">
              <button
                type="button"
                onClick={recognizeSampleField}
                disabled={!(sampleFile || document.sample) || !activeFieldLabel || isParsing}
                title="Recognize the selected field from the uploaded sample using the current instruction."
                className="flex min-h-9 items-center justify-center gap-1 whitespace-normal rounded-md border border-violet-400/40 bg-violet-400/12 px-2 py-2 text-center text-xs leading-tight text-violet-100 disabled:opacity-40"
              >
                {isParsing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI Recognize
              </button>
              <button
                type="button"
                onClick={saveFieldSample}
                disabled={!activeFieldLabel}
                className="flex min-h-9 items-center justify-center gap-1 whitespace-normal rounded-md border border-emerald-400/40 bg-emerald-400/12 px-2 py-2 text-center text-xs leading-tight text-emerald-100 disabled:opacity-40"
              >
                <Plus size={12} />
                Save and next field
              </button>
              <button
                type="button"
                onClick={() => setIsBoxSelectorOpen(true)}
                disabled={!selectedPreviewPage || !activeFieldLabel}
                className="flex min-h-9 items-center justify-center gap-1 whitespace-normal rounded-md border border-sky-400/40 bg-sky-400/12 px-2 py-2 text-center text-xs leading-tight text-sky-100 disabled:opacity-40"
              >
                <Maximize2 size={12} />
                Extract box
              </button>
            </div>
          </div>
        </div>
      )}

      {isBoxSelectorOpen && selectedPreviewPage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Large extraction selector"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-md border border-white/10 bg-[#101214] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
              <div>
                <p className="text-sm font-semibold text-neutral-100">
                  Large extraction selector
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Use this large view to zoom, pan, and draw the sample box.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBoxSelectorOpen(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:bg-white/5"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3">
              {previewPages.length > 1 && (
                <select
                  value={selectedPreviewPage.id}
                  onChange={(event) => {
                    setSelectedPreviewPageId(event.target.value);
                    setHighlightRect(null);
                  }}
                  className="h-8 rounded-md border border-white/10 bg-[#0d1012] px-2 text-xs outline-none"
                >
                  {previewPages.map((page) => (
                    <option key={page.id} value={page.id}>
                      Page {page.pageNumber}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                Zoom
                <input
                  type="range"
                  min="100"
                  max="220"
                  value={boxSelectorZoom}
                  onChange={(event) => setBoxSelectorZoom(Number(event.target.value))}
                />
                <span className="w-10 text-right">{boxSelectorZoom}%</span>
              </label>
              <p className="text-xs text-neutral-500">
                The saved box is a soft location hint, not an exact rule.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div
                className="relative overflow-hidden"
                style={{
                  width: boxSelectorImageStyle.width,
                  maxWidth: boxSelectorImageStyle.maxWidth,
                }}
                onMouseDown={startSelection}
                onMouseMove={moveSelection}
                onMouseUp={finishSelection}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedPreviewPage.dataUrl}
                  alt={`Template sample page ${selectedPreviewPage.pageNumber}`}
                  draggable={false}
                  className="block select-none"
                  style={{
                    filter: boxSelectorImageStyle.filter,
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
            <div className="grid gap-2 border-t border-white/10 p-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsBoxSelectorOpen(false)}
                className="flex h-9 items-center justify-center rounded-md border border-white/10 text-xs text-neutral-200 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={extractHighlightedSample}
                disabled={!highlightRect || isParsing}
                className="flex h-9 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 disabled:opacity-40"
              >
                {isParsing ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                Extract selected box
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

function createPlaceholderFileFromSavedSample(sample?: WorkflowDocumentSample) {
  if (!sample) {
    return null;
  }

  const fileName = sample.fileName.toLowerCase().endsWith(".pdf")
    ? sample.fileName
    : `${sample.fileName || "sample"}.pdf`;
  return new File(["Saved workflow sample text"], fileName, {
    type: "application/pdf",
  });
}

function formatParseDiagnosticId(payload: ParsedWorkspaceFilePayload) {
  return payload.diagnostics?.requestId
    ? `Diagnostic ID: ${payload.diagnostics.requestId}.`
    : "";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
