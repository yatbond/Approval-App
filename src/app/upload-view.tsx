"use client";

import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Send,
  Save,
  X,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  buildPreviewImageStyle,
  createEnhancedPreviewDataUrl,
  cropPreviewPageToFile,
  getActiveSelectionRect,
  normalizedRectToPercentStyle,
  normalizeSelectionRect,
  type DocumentPreviewPage,
  type PreviewEnhancementMode,
  type NormalizedRect,
  type Point,
} from "@/lib/document-preview";
import {
  acceptForDocumentFormat,
  formatDocumentFormat,
} from "@/lib/workflow-documents";
import {
  addBoxToHighlightFieldGroup,
  createHighlightFieldGroup,
  createHighlightValueBox,
  createHighlightedExtractionField,
  getExtractionFieldSourceLabel,
  getUploadSubmissionMessageTone,
  getUploadViewState,
  mergeHighlightedFieldValue,
  removeHighlightValueBox,
  updateHighlightFieldGroupLabel,
  updateHighlightValueBox,
  type HighlightFieldGroup,
} from "@/lib/upload-view-state";
import type { ParsedWorkspaceFilePayload } from "@/lib/workspace-file-api";
import {
  shouldRestoreUploadRequestDraftHighlightState,
  getUploadWorkInProgressItems,
  type SavedUploadRequestDraft,
  type UploadRequestDraftStatus,
} from "@/lib/upload-request-draft-state";
import type {
  ApprovalAttachment,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";
import { InfoTip } from "./ui-hint";

type UploadRequestDraftRowView = {
  id: string;
  fileName: string;
  parseResult: ParsedWorkspaceFilePayload | null;
  editedFields: Record<string, string>;
  uploadedAttachments: ApprovalAttachment[];
};

export function UploadView({
  activeUserEmail,
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
  uploadDraftStatus,
  savedUploadDrafts,
  selectedUploadDraftId,
  uploadDraftTitle,
  setUploadDraftTitle,
  uploadDraftMessage,
  onSaveRequestDraft,
  onLoadRequestDraft,
  onDeleteRequestDraft,
  uploadDraftRestoreToken,
  uploadDraftResetToken,
  restoredHighlightGroups,
  restoredActiveHighlightGroupId,
  restoredHighlightBoxCounter,
  onHighlightDraftChange,
  onClearRequestDraft,
  workflowTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  submissionMessage,
  onSubmitRequest,
  requestDrafts,
  selectedRequestDraftId,
  onSelectRequestDraft,
  onSubmitAllRequests,
}: {
  activeUserEmail: string;
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
  ) => Promise<ParsedWorkspaceFilePayload>;
  uploadedAttachments: ApprovalAttachment[];
  uploadDraftStatus: UploadRequestDraftStatus;
  savedUploadDrafts: SavedUploadRequestDraft[];
  selectedUploadDraftId: string;
  uploadDraftTitle: string;
  setUploadDraftTitle: (title: string) => void;
  uploadDraftMessage: string;
  onSaveRequestDraft: () => void;
  onLoadRequestDraft: (draft: SavedUploadRequestDraft) => void;
  onDeleteRequestDraft: (draftId: string) => void;
  uploadDraftRestoreToken: string;
  uploadDraftResetToken: number;
  restoredHighlightGroups: HighlightFieldGroup[];
  restoredActiveHighlightGroupId: string;
  restoredHighlightBoxCounter: number;
  onHighlightDraftChange: (draft: {
    highlightGroups: HighlightFieldGroup[];
    activeHighlightGroupId: string;
    highlightBoxCounter: number;
  }) => void;
  onClearRequestDraft: () => void;
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  submissionMessage: string;
  onSubmitRequest: () => void;
  requestDrafts: UploadRequestDraftRowView[];
  selectedRequestDraftId: string;
  onSelectRequestDraft: (rowId: string) => void;
  onSubmitAllRequests: () => void;
}) {
  const [selectedPreviewPageId, setSelectedPreviewPageId] = useState("");
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionCurrent, setSelectionCurrent] = useState<{
    point: Point;
    bounds: { width: number; height: number };
  } | null>(null);
  const [highlightRect, setHighlightRect] = useState<NormalizedRect | null>(null);
  const [highlightGroups, setHighlightGroups] = useState<HighlightFieldGroup[]>(
    () =>
      restoredHighlightGroups.length
        ? restoredHighlightGroups
        : [createHighlightFieldGroup(1)],
  );
  const [activeHighlightGroupId, setActiveHighlightGroupId] =
    useState(restoredActiveHighlightGroupId || "highlight-field-1");
  const [highlightBoxCounter, setHighlightBoxCounter] = useState(
    restoredHighlightBoxCounter || 1,
  );
  const [highlightError, setHighlightError] = useState("");
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = useState<string[]>([]);
  const [previewContrast, setPreviewContrast] = useState(210);
  const [previewBrightness, setPreviewBrightness] = useState(88);
  const [previewZoom, setPreviewZoom] = useState(145);
  const [previewEnhancementMode, setPreviewEnhancementMode] =
    useState<PreviewEnhancementMode>("black-text");
  const [fieldInputMode, setFieldInputMode] = useState<
    "suggested" | "boxed" | "manual"
  >("suggested");
  const lastRestoredDraftToken = useRef("");
  const lastResetToken = useRef(uploadDraftResetToken);
  const [enhancedPreview, setEnhancedPreview] = useState({
    key: "",
    dataUrl: "",
    error: "",
  });
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
  } = getUploadViewState({
    workflowTemplates,
    selectedTemplateId,
    uploadedAttachments,
    activeUserEmail,
  });
  const selectedPreviewPage =
    documentPreviewPages.find((page) => page.id === selectedPreviewPageId) ||
    documentPreviewPages[0];
  const activeHighlightGroup =
    highlightGroups.find((group) => group.id === activeHighlightGroupId) ||
    highlightGroups[0];
  const activeSelectionRect = getActiveSelectionRect({
    committedRect: highlightRect,
    selectionStart,
    currentPoint: selectionCurrent?.point || null,
    bounds: selectionCurrent?.bounds || null,
  });
  const highlightStyle = activeSelectionRect
    ? normalizedRectToPercentStyle(activeSelectionRect)
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
  const previewEnhancementKey = selectedPreviewPage
    ? `${selectedPreviewPage.id}:${previewEnhancementMode}`
    : "";
  const hasCurrentEnhancedPreview =
    enhancedPreview.key === previewEnhancementKey && Boolean(enhancedPreview.dataUrl);
  const currentPreviewEnhancementError =
    enhancedPreview.key === previewEnhancementKey ? enhancedPreview.error : "";
  const displayedPreviewDataUrl =
    previewEnhancementMode === "original"
      ? selectedPreviewPage?.dataUrl
      : hasCurrentEnhancedPreview
        ? enhancedPreview.dataUrl
        : selectedPreviewPage?.dataUrl;
  const visibleSuggestedFields = (parseResult?.suggestedFields || [])
    .map((suggestion, index) => ({
      suggestion,
      suggestionKey: `${suggestion.name}-${index}`,
    }))
    .filter((item) => !dismissedSuggestionKeys.includes(item.suggestionKey));
  const submissionMessageTone = getUploadSubmissionMessageTone(submissionMessage);
  const hasManualFormDocuments = manualFormDocuments.length > 0;
  const hasSubmissionDraft = Boolean(parseResult) || hasManualFormDocuments;
  const hasBatchDrafts = requestDrafts.length > 1;
  const assignedUploadsHeading = sharedFulfillmentEnabled
    ? "Your assigned uploads"
    : "Required uploads";

  useEffect(() => {
    if (selectedTemplate && selectedTemplate.id !== selectedTemplateId) {
      setSelectedTemplateId(selectedTemplate.id);
    }
  }, [selectedTemplate, selectedTemplateId, setSelectedTemplateId]);

  useEffect(() => {
    if (
      !shouldRestoreUploadRequestDraftHighlightState({
        restoreToken: uploadDraftRestoreToken,
        lastRestoredToken: lastRestoredDraftToken.current,
      })
    ) {
      return;
    }

    let didCancel = false;
    queueMicrotask(() => {
      if (didCancel) {
        return;
      }

      lastRestoredDraftToken.current = uploadDraftRestoreToken;
      setHighlightGroups(
        restoredHighlightGroups.length
          ? restoredHighlightGroups
          : [createHighlightFieldGroup(1)],
      );
      setActiveHighlightGroupId(
        restoredActiveHighlightGroupId || restoredHighlightGroups[0]?.id || "highlight-field-1",
      );
      setHighlightBoxCounter(restoredHighlightBoxCounter || 1);
      setHighlightRect(null);
      setSelectionStart(null);
      setSelectionCurrent(null);
    });

    return () => {
      didCancel = true;
    };
  }, [
    restoredActiveHighlightGroupId,
    restoredHighlightBoxCounter,
    restoredHighlightGroups,
    uploadDraftRestoreToken,
  ]);

  useEffect(() => {
    if (lastResetToken.current === uploadDraftResetToken) {
      return;
    }

    let didCancel = false;
    queueMicrotask(() => {
      if (didCancel) {
        return;
      }

      lastResetToken.current = uploadDraftResetToken;
      setHighlightGroups([createHighlightFieldGroup(1)]);
      setActiveHighlightGroupId("highlight-field-1");
      setHighlightBoxCounter(1);
      setHighlightRect(null);
      setSelectionStart(null);
      setSelectionCurrent(null);
    });

    return () => {
      didCancel = true;
    };
  }, [uploadDraftResetToken]);

  useEffect(() => {
    onHighlightDraftChange({
      highlightGroups,
      activeHighlightGroupId,
      highlightBoxCounter,
    });
  }, [
    activeHighlightGroupId,
    highlightBoxCounter,
    highlightGroups,
    onHighlightDraftChange,
  ]);

  useEffect(() => {
    let isCancelled = false;

    if (!selectedPreviewPage || previewEnhancementMode === "original") {
      return () => {
        isCancelled = true;
      };
    }

    createEnhancedPreviewDataUrl(selectedPreviewPage, previewEnhancementMode)
      .then((dataUrl) => {
        if (!isCancelled) {
          setEnhancedPreview({
            key: `${selectedPreviewPage.id}:${previewEnhancementMode}`,
            dataUrl,
            error: "",
          });
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setEnhancedPreview({
            key: `${selectedPreviewPage.id}:${previewEnhancementMode}`,
            dataUrl: "",
            error: "Could not enhance this preview. Showing the original scan.",
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedPreviewPage, previewEnhancementMode]);

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

  function addHighlightFieldGroup() {
    const nextGroup = createHighlightFieldGroup(highlightGroups.length + 1);
    setHighlightGroups((groups) => [...groups, nextGroup]);
    setActiveHighlightGroupId(nextGroup.id);
    setHighlightRect(null);
    setHighlightError("");
  }

  function addSelectedBoxToActiveGroup() {
    if (!selectedPreviewPage || !highlightRect || !activeHighlightGroup) {
      setHighlightError("Draw a value box first.");
      return;
    }

    setHighlightGroups((groups) =>
      addBoxToHighlightFieldGroup(
        groups,
        activeHighlightGroup.id,
        createHighlightValueBox(highlightBoxCounter, {
          pageId: selectedPreviewPage.id,
          pageNumber: selectedPreviewPage.pageNumber,
          rect: highlightRect,
        }),
      ),
    );
    setHighlightBoxCounter((value) => value + 1);
    setHighlightRect(null);
    setHighlightError("");
  }

  async function extractHighlightGroup(group: HighlightFieldGroup) {
    const fieldLabel = group.fieldLabel.trim();
    if (!fieldLabel) {
      setHighlightError("Enter a field name first.");
      return;
    }
    if (!group.boxes.length) {
      setHighlightError("Add at least one value box for this field.");
      return;
    }

    try {
      const field = createHighlightedExtractionField(
        fieldLabel,
        Object.keys(editedFields).length + 1,
      );
      const extractedValues: string[] = [];

      for (const box of group.boxes) {
        const page = documentPreviewPages.find((item) => item.id === box.pageId);
        if (!page) {
          setHighlightGroups((groups) =>
            updateHighlightValueBox(groups, group.id, box.id, {
              status: "error",
              error: "Preview page is no longer available.",
            }),
          );
          continue;
        }

        setHighlightGroups((groups) =>
          updateHighlightValueBox(groups, group.id, box.id, {
            status: "extracting",
            error: "",
          }),
        );
        const cropFile = await cropPreviewPageToFile({
          page,
          rect: box.rect,
          fileName: `${field.name}-${box.id}.png`,
        });
        const payload = await onExtractHighlightedRegion(cropFile, field);
        const payloadFields = payload.fields || {};
        const extractedValue =
          payloadFields[field.label] ||
          payloadFields[field.name] ||
          Object.values(payloadFields)[0] ||
          "";
        const confidence =
          payload.confidence?.[field.label] ||
          payload.confidence?.[field.name] ||
          Object.values(payload.confidence || {})[0];
        const evidence =
          payload.evidence?.[field.label] ||
          payload.evidence?.[field.name] ||
          Object.values(payload.evidence || {})[0] ||
          "";

        extractedValues.push(extractedValue);
        setHighlightGroups((groups) =>
          updateHighlightValueBox(groups, group.id, box.id, {
            value: extractedValue,
            confidence,
            evidence,
            status: "done",
            error: "",
          }),
        );
      }

      setEditedFields(
        mergeHighlightedFieldValue(editedFields, fieldLabel, extractedValues),
      );
      setHighlightError("");
    } catch (error) {
      setHighlightError(
        error instanceof Error
          ? error.message
          : "Unable to extract highlighted field.",
      );
    }
  }

  function renderUploadDocumentRequirement(
    document: WorkflowDocumentRequirement,
    helperText?: string,
  ) {
    return (
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
            {helperText && (
              <p className="mt-1 text-xs text-sky-200/75">{helperText}</p>
            )}
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
    );
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">New request</h2>
          <InfoTip label="Choose a template, then upload each required or optional document." />
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-neutral-400">Template</span>
          <select
            value={selectedTemplate?.id || ""}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="min-h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
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

        <UploadDraftPanel
          uploadDraftStatus={uploadDraftStatus}
          savedUploadDrafts={savedUploadDrafts}
          selectedUploadDraftId={selectedUploadDraftId}
          uploadDraftTitle={uploadDraftTitle}
          setUploadDraftTitle={setUploadDraftTitle}
          uploadDraftMessage={uploadDraftMessage}
          onSaveRequestDraft={onSaveRequestDraft}
          onLoadRequestDraft={onLoadRequestDraft}
          onDeleteRequestDraft={onDeleteRequestDraft}
          onClearRequestDraft={onClearRequestDraft}
        />

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
              <div className="rounded-md border border-white/10 bg-[#121518] p-3 text-sm text-neutral-400">
                No document requirements are attached to the starting route.
              </div>
            )}
            {(assignedManualFormDocuments.length > 0 ||
              sharedManualFormDocuments.length > 0) && (
              <div className="rounded-md border border-sky-500/25 bg-sky-500/10 p-3">
                <p className="text-sm font-semibold text-sky-100">
                  Manual form
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
                      {" "}available for shared fulfillment
                    </p>
                  ))}
                </div>
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

        {requestDrafts.length > 0 && (
          <div className="mt-4 rounded-md border border-white/10 bg-[#121518] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-200">
                  Drafts
                </p>
                <InfoTip label="Each uploaded document will submit as a separate request." />
              </div>
              <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400">
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
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-50"
                        : "border-white/10 bg-[#101214] text-neutral-300 hover:border-white/20"
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
            Missing required upload(s):{" "}
            {missingRequiredDocuments
              .map((document) => document.documentType)
              .join(", ")}
          </div>
        )}

        <label className="mt-4 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-[#121518] p-6 text-center transition hover:border-emerald-400/60 hover:bg-emerald-400/5">
          {isParsing ? (
            <Loader2 className="mb-3 animate-spin text-emerald-200" size={28} />
          ) : (
            <Upload className="mb-3 text-neutral-300" size={28} />
          )}
          <span className="text-sm font-medium">
            {isParsing ? "Parsing document" : "Choose a file"}
          </span>
          <span className="mt-1 text-xs text-neutral-500">PDF, image, Excel, or CSV</span>
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
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Draft</h2>
            <InfoTip label="Corrections here become training examples for workflow-specific extraction." />
          </div>
        </div>

        <div className="p-4">
          {selectedPreviewPage && (
            <div className="mb-4 rounded-md border border-white/10 bg-[#121518] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">
                    Preview
                  </p>
                  <InfoTip label="Drag over a value, name the field, then extract just that area." />
                </div>
                {documentPreviewPages.length > 1 && (
                  <select
                    value={selectedPreviewPage.id}
                    onChange={(event) => {
                      setSelectedPreviewPageId(event.target.value);
                      setHighlightRect(null);
                      setSelectionStart(null);
                      setSelectionCurrent(null);
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

              <div className="mt-3 grid gap-3 rounded-md border border-white/10 bg-[#101214] p-3 md:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">
                    Preview mode
                  </span>
                  <select
                    value={previewEnhancementMode}
                    onChange={(event) =>
                      setPreviewEnhancementMode(event.target.value as PreviewEnhancementMode)
                    }
                    className="h-9 w-full rounded-md border border-white/10 bg-[#0d1012] px-3 text-xs text-neutral-100 outline-none focus:border-emerald-400/60"
                  >
                    <option value="black-text">Black text</option>
                    <option value="enhanced">Enhanced grey</option>
                    <option value="original">Original</option>
                  </select>
                </label>
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
              {previewEnhancementMode !== "original" &&
                !hasCurrentEnhancedPreview &&
                !currentPreviewEnhancementError && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Enhancing preview for faint scan text...
                  </p>
                )}
              {currentPreviewEnhancementError && (
                <p className="mt-2 text-xs text-amber-200">
                  {currentPreviewEnhancementError}
                </p>
              )}

              <div
                className="mt-3 max-h-[70vh] overflow-auto rounded-md border border-white/10 bg-neutral-950 p-3"
              >
                <div
                  className="relative inline-block"
                  style={previewStageStyle}
                  onMouseDown={(event) => {
                    const point = pointFromPreviewEvent(event);
                    setSelectionStart({ x: point.x, y: point.y });
                    setSelectionCurrent({
                      point: { x: point.x, y: point.y },
                      bounds: point.bounds,
                    });
                  }}
                  onMouseMove={(event) => {
                    if (!selectionStart) {
                      return;
                    }

                    const point = pointFromPreviewEvent(event);
                    setSelectionCurrent({
                      point: { x: point.x, y: point.y },
                      bounds: point.bounds,
                    });
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
                    setSelectionCurrent(null);
                  }}
                  onMouseLeave={() => {
                    setSelectionStart(null);
                    setSelectionCurrent(null);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayedPreviewDataUrl}
                    alt={`Document preview page ${selectedPreviewPage.pageNumber}`}
                    draggable={false}
                    className="block select-none"
                    style={readablePreviewImageStyle}
                  />
                  {highlightGroups.flatMap((group) =>
                    group.boxes
                      .filter((box) => box.pageId === selectedPreviewPage.id)
                      .map((box, index) => (
                        <div
                          key={box.id}
                          className={`pointer-events-none absolute border-2 ${
                            group.id === activeHighlightGroup?.id
                              ? "border-emerald-300 bg-emerald-300/15"
                              : "border-sky-300 bg-sky-300/10"
                          }`}
                          style={normalizedRectToPercentStyle(box.rect)}
                        >
                          <span className="absolute -left-px -top-6 rounded-sm bg-black/80 px-1.5 py-0.5 text-[10px] text-white">
                            {group.fieldLabel.trim() || `Field ${index + 1}`}
                          </span>
                        </div>
                      )),
                  )}
                  {highlightStyle && (
                    <div
                      className="pointer-events-none absolute border-2 border-emerald-300 bg-emerald-300/20"
                      style={highlightStyle}
                    />
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-md border border-sky-500/25 bg-sky-500/10 p-3">
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    ["suggested", "Suggested fields"],
                    ["boxed", "Box from preview"],
                    ["manual", "Manual values"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        setFieldInputMode(mode as "suggested" | "boxed" | "manual")
                      }
                      className={`min-h-9 rounded-md border px-3 py-2 text-xs font-medium transition ${
                        fieldInputMode === mode
                          ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                          : "border-white/10 bg-[#101214] text-neutral-300 hover:bg-white/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {fieldInputMode === "suggested" && (
                  <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-sky-100">
                      Suggestions
                    </p>
                    <InfoTip label="Review fields the parser found first. Use boxed or manual fields only when something is missing or needs correction." />
                  </div>
                </div>
                {visibleSuggestedFields.length ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {visibleSuggestedFields.map(({ suggestion, suggestionKey }) => {
                      return (
                      <div
                        key={suggestionKey}
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
                            <p className="mt-1 text-xs text-sky-100/60">
                              Box and correct this field if needed.
                            </p>
                          </div>
                          <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300">
                            {suggestion.confidence}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setEditedFields({
                              ...editedFields,
                              [suggestion.label]: suggestion.value,
                            })
                          }
                          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 text-xs font-medium text-sky-100 transition hover:bg-sky-500/20"
                        >
                          <Plus size={14} />
                          Use field
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDismissedSuggestionKeys((keys) => [
                              ...keys,
                              suggestionKey,
                            ])
                          }
                          className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] text-xs font-medium text-neutral-300 transition hover:bg-white/10"
                        >
                          <X size={13} />
                          Dismiss
                        </button>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border border-white/10 bg-[#101214] px-3 py-2 text-xs text-neutral-400">
                    No suggestions yet. Use boxed or manual fields if needed.
                  </p>
                )}
                  </>
                )}
              </div>

              {fieldInputMode !== "suggested" && (
          <div className="mt-3 rounded-md border border-white/10 bg-[#101214] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-200">
                      {fieldInputMode === "boxed"
                        ? "Boxed"
                        : "Manual"}
                    </p>
                    <InfoTip
                      label={
                        fieldInputMode === "boxed"
                          ? "Create a field, draw one or more value boxes, then extract only those highlighted areas."
                          : "Create a field and type or paste the value directly when the parser and boxing are not enough."
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fieldInputMode === "boxed" && highlightRect && activeHighlightGroup ? (
                      <button
                        type="button"
                        onClick={addSelectedBoxToActiveGroup}
                        className="flex h-9 items-center justify-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 text-xs font-medium text-sky-100 transition hover:bg-sky-500/20"
                      >
                        <Plus size={14} />
                        Add box to {activeHighlightGroup.fieldLabel.trim() || "active field"}
                      </button>
                    ) : fieldInputMode === "boxed" ? (
                      <span className="flex min-h-9 items-center rounded-md border border-white/10 px-3 text-xs text-neutral-500">
                        Draw a box first.
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={addHighlightFieldGroup}
                      className="flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/20"
                    >
                      <Plus size={14} />
                      New field
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  {highlightGroups.map((group, groupIndex) => {
                    const fieldLabel = group.fieldLabel.trim();
                    const groupedValue =
                      (fieldLabel ? editedFields[fieldLabel] : "") ||
                      group.boxes
                        .map((box) => box.value)
                        .filter(Boolean)
                        .join("\n");

                    return (
                      <div
                        key={group.id}
                        className={`rounded-md border p-3 ${
                          group.id === activeHighlightGroup?.id
                            ? "border-emerald-400/50 bg-emerald-400/5"
                            : "border-white/10 bg-[#0d1012]"
                        }`}
                      >
                        <div className="grid gap-2 lg:grid-cols-[1fr_1.2fr_auto]">
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-400">
                              Field name
                            </span>
                            <input
                              value={group.fieldLabel}
                              onFocus={() => setActiveHighlightGroupId(group.id)}
                              onChange={(event) => {
                                setHighlightGroups((groups) =>
                                  updateHighlightFieldGroupLabel(
                                    groups,
                                    group.id,
                                    event.target.value,
                                  ),
                                );
                              }}
                              placeholder={`Field ${groupIndex + 1}, e.g. variation order`}
                              className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-400">
                              Data value(s)
                            </span>
                            <textarea
                              value={groupedValue}
                              onFocus={() => setActiveHighlightGroupId(group.id)}
                              onChange={(event) => {
                                if (!fieldLabel) {
                                  return;
                                }
                                setEditedFields({
                                  ...editedFields,
                                  [fieldLabel]: event.target.value,
                                });
                              }}
                              placeholder="Extracted values appear here, one per line"
                              rows={Math.max(2, Math.min(5, group.boxes.length || 2))}
                              className="min-h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 py-2 text-sm outline-none transition focus:border-emerald-400/60"
                            />
                          </label>
                          {fieldInputMode === "boxed" && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveHighlightGroupId(group.id);
                                void extractHighlightGroup(group);
                              }}
                              disabled={isParsing}
                              className="flex h-10 self-end items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isParsing ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <ImageIcon size={14} />
                              )}
                              Extract field
                            </button>
                          )}
                        </div>

                        {fieldInputMode === "boxed" && (
                          <div className="mt-3 space-y-2">
                          {group.boxes.length === 0 ? (
                            <p className="rounded-md border border-dashed border-white/10 px-3 py-2 text-xs text-neutral-500">
                              Draw a rectangle on the preview, then add it as a value box.
                            </p>
                          ) : (
                            group.boxes.map((box, boxIndex) => (
                              <div
                                key={box.id}
                                className="grid gap-2 rounded-md border border-white/10 bg-[#101214] p-2 text-xs text-neutral-300 sm:grid-cols-[1fr_auto]"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-neutral-200">
                                    Box {boxIndex + 1} - Page {box.pageNumber} -{" "}
                                    {box.status}
                                  </p>
                                  {box.value && (
                                    <p className="mt-1 break-words text-neutral-400">
                                      {box.value}
                                    </p>
                                  )}
                                  {box.evidence && (
                                    <p className="mt-1 break-words text-neutral-500">
                                      Evidence: {box.evidence}
                                    </p>
                                  )}
                                  {box.error && (
                                    <p className="mt-1 break-words text-rose-100">
                                      {box.error}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHighlightGroups((groups) =>
                                      removeHighlightValueBox(
                                        groups,
                                        group.id,
                                        box.id,
                                      ),
                                    )
                                  }
                                  className="flex h-8 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 text-rose-100 transition hover:bg-rose-500/20"
                                >
                                  <X size={13} />
                                  Remove
                                </button>
                              </div>
                            ))
                          )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
              {highlightError && (
                <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {highlightError}
                </p>
              )}
            </div>
          )}

          {manualFormDocuments.length > 0 && (
            <div className="mb-4 rounded-md border border-sky-500/25 bg-sky-500/10 p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-sky-100">
                  Manual fields
                </h3>
                <InfoTip label="Enter these values directly. They will be routed and validated like OCR fields." />
              </div>
              <div className="mt-3 space-y-4">
                {manualFormDocuments.map((document) => (
                  <div
                    key={document.id}
                    className="rounded-md border border-white/10 bg-[#101214] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-100">
                        {document.documentType}
                      </p>
                      <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400">
                        {document.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {document.fields.map((field) => {
                        const value =
                          editedFields[field.label] ?? editedFields[field.name] ?? "";

                        return (
                          <label key={field.name} className="block">
                            <span className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                              <span>{field.label}</span>
                              {field.required && (
                                <span className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-100">
                                  Required
                                </span>
                              )}
                            </span>
                            <textarea
                              value={value}
                              onChange={(event) =>
                                setEditedFields({
                                  ...editedFields,
                                  [field.label]: event.target.value,
                                })
                              }
                              placeholder={field.instructions || "Enter value"}
                              rows={2}
                              className="min-h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
                            />
                            {field.instructions && (
                              <p className="mt-1 text-xs text-neutral-500">
                                {field.instructions}
                              </p>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {!document.fields.length && (
                      <p className="mt-3 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-xs text-neutral-500">
                        This manual form has no fields yet. Add fields in the workflow template.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!parseResult && !isParsing && !hasManualFormDocuments && (
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
                        <span
                          className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-neutral-300"
                        >
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

            </div>
          )}

          {hasSubmissionDraft && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onSubmitRequest}
                disabled={missingRequiredDocuments.length > 0}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send size={16} />
                Submit current
              </button>
              {hasBatchDrafts && (
                <button
                  type="button"
                  onClick={onSubmitAllRequests}
                  disabled={isParsing}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Send size={16} />
                  Submit all ({requestDrafts.length})
                </button>
              )}
            </div>
          )}

          {submissionMessage && (
            <div
              className={`mt-4 rounded-md border p-3 text-sm ${
                submissionMessageTone === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  : submissionMessageTone === "warning"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-100"
              }`}
            >
              {submissionMessage}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function UploadDraftPanel({
  uploadDraftStatus,
  savedUploadDrafts,
  selectedUploadDraftId,
  uploadDraftTitle,
  setUploadDraftTitle,
  uploadDraftMessage,
  onSaveRequestDraft,
  onLoadRequestDraft,
  onDeleteRequestDraft,
  onClearRequestDraft,
}: {
  uploadDraftStatus: UploadRequestDraftStatus;
  savedUploadDrafts: SavedUploadRequestDraft[];
  selectedUploadDraftId: string;
  uploadDraftTitle: string;
  setUploadDraftTitle: (title: string) => void;
  uploadDraftMessage: string;
  onSaveRequestDraft: () => void;
  onLoadRequestDraft: (draft: SavedUploadRequestDraft) => void;
  onDeleteRequestDraft: (draftId: string) => void;
  onClearRequestDraft: () => void;
}) {
  const workInProgressItems = getUploadWorkInProgressItems({
    activeDraftId: selectedUploadDraftId,
    currentDraftStatus: uploadDraftStatus,
    savedDrafts: savedUploadDrafts,
  });

  return (
    <div className="mt-3 rounded-md border border-white/10 bg-[#121518] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-neutral-200">
            Work
          </p>
          <InfoTip label="Autosave keeps the current screen. Save a named draft when you want to return later." />
        </div>
        <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-neutral-400">
          {workInProgressItems.length} item(s)
        </span>
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-[#101214] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Autosave
            </p>
            <p className="mt-1 text-sm text-neutral-200">{uploadDraftStatus.label}</p>
          </div>
          {uploadDraftStatus.hasDraft && (
            <button
              type="button"
              onClick={onClearRequestDraft}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
            >
              <X size={13} />
              Clear
            </button>
          )}
        </div>

        {uploadDraftStatus.hasDraft && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Draft name</span>
              <input
                value={uploadDraftTitle}
                onChange={(event) => setUploadDraftTitle(event.target.value)}
                placeholder="Example: Gleneagles final account"
                className="min-h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
              />
            </label>
            <button
              type="button"
              onClick={onSaveRequestDraft}
              className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20"
            >
              <Save size={13} />
              Save
            </button>
          </div>
        )}
      </div>

      {uploadDraftMessage && (
        <p className="mt-2 rounded-md border border-white/10 bg-[#101214] px-3 py-2 text-xs text-neutral-300">
          {uploadDraftMessage}
        </p>
      )}

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Saved
        </p>
        {savedUploadDrafts.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-white/10 bg-[#101214] px-3 py-2 text-xs text-neutral-500">
            No named drafts yet.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {savedUploadDrafts.map((draft) => {
              const summary = workInProgressItems.find((item) => item.id === draft.id);
              return (
                <div
                  key={draft.id}
                  className={`rounded-md border p-3 text-sm ${
                    draft.id === selectedUploadDraftId
                      ? "border-emerald-400/50 bg-emerald-400/5"
                      : "border-white/10 bg-[#101214]"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-neutral-100">
                        {draft.title}
                      </p>
                      <p className="mt-1 text-neutral-500">
                        {summary?.detail}
                      </p>
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={() => onLoadRequestDraft(draft)}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-sky-500/30 bg-sky-500/10 px-3 font-medium text-sky-100 transition hover:bg-sky-500/20"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRequestDraft(draft.id)}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 px-3 font-medium text-rose-100 transition hover:bg-rose-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
