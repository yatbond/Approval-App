"use client";

import {
  FileSpreadsheet,
  FileText,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  Send,
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
  type SavedUploadRequestDraft,
  type UploadRequestDraftStatus,
} from "@/lib/upload-request-draft-state";
import {
  type WorkflowParticipantEmailMap,
} from "@/lib/workflow-participant-assignment-state";
import {
  getLocallyEditableWorkflowFormFields,
  getLocallyUploadableWorkflowFormAttachments,
  getWorkflowFormAttachmentFields,
  getWorkflowFormFieldSourceLabel,
  isMicrosoftFormsRequirement,
} from "@/lib/workflow-library-form-state";
import {
  buildRequestWorkflowMapState,
  getWorkflowMapNodeIdForParticipantField,
} from "@/lib/request-workflow-map-state";
import type {
  ApprovalAttachment,
  FormLibraryAttachmentField,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";
import { InfoTip } from "./ui-hint";
import { NativeFormFieldInput } from "./native-form-field-input";
import { RequestWorkflowMiniMap } from "./request-workflow-mini-map";
import { UploadDraftControls } from "./upload-draft-controls";
import {
  UploadRequestSetupPanel,
  type UploadRequestDraftRowView,
} from "./upload-request-setup-panel";

type ParseFileOptions = {
  preserveExistingRequestData?: boolean;
  mergeIntoCurrentRequest?: boolean;
  skipExtraction?: boolean;
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
  onEditAttachment,
  onRemoveAttachment,
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
  participantEmails,
  setParticipantEmail,
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
    options?: ParseFileOptions,
  ) => void;
  documentPreviewPages: DocumentPreviewPage[];
  onExtractHighlightedRegion: (
    file: File,
    field: WorkflowField,
  ) => Promise<ParsedWorkspaceFilePayload>;
  uploadedAttachments: ApprovalAttachment[];
  onEditAttachment: (attachment: ApprovalAttachment) => Promise<boolean>;
  onRemoveAttachment: (attachment: ApprovalAttachment) => Promise<void>;
  uploadDraftStatus: UploadRequestDraftStatus;
  savedUploadDrafts: SavedUploadRequestDraft[];
  selectedUploadDraftId: string;
  uploadDraftTitle: string;
  setUploadDraftTitle: (title: string) => void;
  uploadDraftMessage: string;
  onSaveRequestDraft: (options?: { asNew?: boolean }) => void;
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
  participantEmails: WorkflowParticipantEmailMap;
  setParticipantEmail: (nodeId: string, email: string) => void;
  submissionMessage: string;
  onSubmitRequest: (participantEmails: WorkflowParticipantEmailMap) => void;
  requestDrafts: UploadRequestDraftRowView[];
  selectedRequestDraftId: string;
  onSelectRequestDraft: (rowId: string) => void;
  onSubmitAllRequests: (participantEmails: WorkflowParticipantEmailMap) => void;
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
  const [previewContrast, setPreviewContrast] = useState(100);
  const [previewBrightness, setPreviewBrightness] = useState(100);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewEnhancementMode, setPreviewEnhancementMode] =
    useState<PreviewEnhancementMode>("original");
  const [activeWorkflowNodeId, setActiveWorkflowNodeId] = useState("");
  const [fieldInputMode, setFieldInputMode] = useState<
    "suggested" | "boxed" | "manual"
  >("suggested");
  const [openingAttachmentId, setOpeningAttachmentId] = useState("");
  const currentRequestInformationRef = useRef<HTMLElement>(null);
  const lastRestoredDraftToken = useRef("");
  const lastResetToken = useRef(uploadDraftResetToken);
  const [enhancedPreview, setEnhancedPreview] = useState({
    key: "",
    dataUrl: "",
    error: "",
  });
  const uploadViewState = getUploadViewState({
    workflowTemplates,
    selectedTemplateId,
    uploadedAttachments,
    activeUserEmail,
  });
  const { selectedTemplate, manualFormDocuments, missingRequiredDocuments } =
    uploadViewState;
  const requestWorkflowMap = selectedTemplate
    ? buildRequestWorkflowMapState(selectedTemplate, activeWorkflowNodeId)
    : null;
  const activeRequestWorkflowNodeId = requestWorkflowMap?.activeNodeId || "";
  const requestSubmitNodeId = requestWorkflowMap?.stages
    .flatMap((stage) => stage.nodes)
    .find((node) => node.kind === "submit_request")?.id || activeRequestWorkflowNodeId;
  const requestWorkflowNodeByDocumentId = new Map<string, string>();
  requestWorkflowMap?.stages.forEach((stage) => {
    stage.nodes.forEach((node) => {
      (node.documentIds || []).forEach((documentId) => {
        requestWorkflowNodeByDocumentId.set(documentId, node.id);
      });
    });
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
  const missingRequiredNativeFields = Array.from(
    new Set(
      manualFormDocuments.flatMap((document) =>
        getLocallyEditableWorkflowFormFields(document)
          .filter((field) => field.required)
          .filter((field) => {
            const value =
              editedFields[field.label] ?? editedFields[field.name] ?? "";
            return !value.trim();
          })
          .map((field) => field.label),
      ),
    ),
  );
  const missingRequiredNativeAttachments = manualFormDocuments.flatMap((document) =>
    getLocallyUploadableWorkflowFormAttachments(document)
      .filter((field) => field.required)
      .filter(
        (field) =>
          !uploadedAttachments.some((attachment) =>
            isUploadedFormAttachment(attachment, document, field),
          ),
      )
      .map((field) => field.label),
  );

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
      setHighlightError("Add a value box first.");
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

  async function editAttachmentExtraction(attachment: ApprovalAttachment) {
    setOpeningAttachmentId(attachment.id);
    try {
      const didOpen = await onEditAttachment(attachment);
      if (!didOpen) {
        return;
      }
      setFieldInputMode("boxed");
      window.setTimeout(() => {
        currentRequestInformationRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
    } finally {
      setOpeningAttachmentId("");
    }
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {requestWorkflowMap && requestWorkflowMap.stages.length > 0 && (
        <RequestWorkflowMiniMap
          map={requestWorkflowMap}
          activeNodeId={activeRequestWorkflowNodeId}
          onSelectNode={setActiveWorkflowNodeId}
        />
      )}
      <UploadDraftControls
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
      <UploadRequestSetupPanel
        viewState={uploadViewState}
        participantEmails={participantEmails}
        onSelectTemplate={(templateId) => {
          setActiveWorkflowNodeId("");
          setSelectedTemplateId(templateId);
        }}
        onFocusParticipant={(nodeId) =>
          setActiveWorkflowNodeId(getWorkflowMapNodeIdForParticipantField(nodeId))
        }
        onSetParticipantEmail={setParticipantEmail}
        uploadedAttachments={uploadedAttachments}
        openingAttachmentId={openingAttachmentId}
        onEditAttachmentExtraction={(attachment) =>
          void editAttachmentExtraction(attachment)
        }
        onRemoveAttachment={(attachment) => void onRemoveAttachment(attachment)}
        requestDrafts={requestDrafts}
        selectedRequestDraftId={selectedRequestDraftId}
        onSelectRequestDraft={onSelectRequestDraft}
        missingRequiredNativeFields={missingRequiredNativeFields}
        missingRequiredNativeAttachments={missingRequiredNativeAttachments}
        isParsing={isParsing}
        fileName={fileName}
        parseError={parseError}
        parseFile={parseFile}
        onActivateDocument={(documentId) =>
          setActiveWorkflowNodeId(
            requestWorkflowNodeByDocumentId.get(documentId) || requestSubmitNodeId,
          )
        }
      />
      <section
        ref={currentRequestInformationRef}
        className="scroll-mt-40 rounded-md border border-[#e6e6e6] bg-white"
      >
        <div className="border-b border-[#e6e6e6] p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Current request information</h2>
            <InfoTip label="Corrections here become training examples for workflow-specific extraction." />
          </div>
        </div>

        <div className="p-4">
          {selectedPreviewPage && (
            <div className="mb-4 rounded-md border border-[#e6e6e6] bg-white p-3">
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
                    className="h-9 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-xs outline-none focus:border-emerald-400/60"
                  >
                    {documentPreviewPages.map((page) => (
                      <option key={page.id} value={page.id}>
                        Page {page.pageNumber}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">
                    Preview mode
                  </span>
                  <select
                    value={previewEnhancementMode}
                    onChange={(event) =>
                      setPreviewEnhancementMode(event.target.value as PreviewEnhancementMode)
                    }
                    className="h-9 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-xs text-neutral-100 outline-none focus:border-emerald-400/60"
                  >
                    <option value="black-text">Black</option>
                    <option value="enhanced">Enhanced</option>
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
                className="mt-3 max-h-[70vh] overflow-auto rounded-md border border-[#e6e6e6] bg-neutral-950 p-3"
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
                    ["suggested", "Suggested"],
                    ["boxed", "Boxed"],
                    ["manual", "Manual"],
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
                          : "border-[#e6e6e6] bg-[#f7f7f5] text-neutral-300 hover:bg-[#eeeeec]"
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
                        className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3"
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
                              Box if needed.
                            </p>
                          </div>
                          <span className="shrink-0 rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-300">
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
                          className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-[#e6e6e6] bg-white text-xs font-medium text-neutral-300 transition hover:bg-[#eeeeec]"
                        >
                          <X size={13} />
                          Dismiss
                        </button>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 py-2 text-xs text-neutral-400">
                    No suggestions.
                  </p>
                )}
                  </>
                )}
              </div>

              {fieldInputMode !== "suggested" && (
          <div className="mt-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3">
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
                          ? "Create a field, draw boxes, then extract only those areas."
                          : "Create a field and type or paste the value directly."
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
                        Add to {activeHighlightGroup.fieldLabel.trim() || "active field"}
                      </button>
                    ) : fieldInputMode === "boxed" ? (
                      <span className="flex min-h-9 items-center rounded-md border border-[#e6e6e6] px-3 text-xs text-neutral-500">
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
                            : "border-[#e6e6e6] bg-[#f7f7f5]"
                        }`}
                      >
                        <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-400">
                              Field name
                            </span>
                            <input
                              value={group.fieldLabel}
                              onFocus={() => {
                                setActiveHighlightGroupId(group.id);
                                setActiveWorkflowNodeId(requestSubmitNodeId);
                              }}
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
                              className="h-10 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-400">
                              Data value(s)
                            </span>
                            <textarea
                              value={groupedValue}
                              onFocus={() => {
                                setActiveHighlightGroupId(group.id);
                                setActiveWorkflowNodeId(requestSubmitNodeId);
                              }}
                              onChange={(event) => {
                                if (!fieldLabel) {
                                  return;
                                }
                                setEditedFields({
                                  ...editedFields,
                                  [fieldLabel]: event.target.value,
                                });
                              }}
                              placeholder="One per line"
                              rows={Math.max(2, Math.min(5, group.boxes.length || 2))}
                              className="min-h-10 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 py-2 text-sm outline-none transition focus:border-emerald-400/60"
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
                            <p className="rounded-md border border-dashed border-[#e6e6e6] px-3 py-2 text-xs text-neutral-500">
                              Draw box, then add.
                            </p>
                          ) : (
                            group.boxes.map((box, boxIndex) => (
                              <div
                                key={box.id}
                                className="grid gap-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs text-neutral-300 sm:grid-cols-[1fr_auto]"
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
                            isUploadedFormAttachment(
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
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {getLocallyEditableWorkflowFormFields(document).map((field) => {
                        const value =
                          editedFields[field.label] ?? editedFields[field.name] ?? "";

                        return (
                          <NativeFormFieldInput
                            key={field.name}
                            field={field}
                            value={value}
                            onFocus={() =>
                              setActiveWorkflowNodeId(
                                requestWorkflowNodeByDocumentId.get(document.id) ||
                                  requestSubmitNodeId,
                              )
                            }
                            onChange={(nextValue) =>
                              setEditedFields({
                                ...editedFields,
                                [field.label]: nextValue,
                              })
                            }
                          />
                        );
                      })}
                    </div>
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
                        <span
                          className="rounded-md border border-[#e6e6e6] bg-white px-2 py-0.5 text-neutral-300"
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
                      onFocus={() => setActiveWorkflowNodeId(requestSubmitNodeId)}
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

          {hasSubmissionDraft && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onSubmitRequest(participantEmails)}
                disabled={
                  missingRequiredDocuments.length > 0 ||
                  missingRequiredNativeFields.length > 0 ||
                  missingRequiredNativeAttachments.length > 0
                }
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send size={16} />
                Submit request
              </button>
              {hasBatchDrafts && (
                <button
                  type="button"
                  onClick={() => onSubmitAllRequests(participantEmails)}
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
function isUploadedFormAttachment(
  attachment: ApprovalAttachment,
  document: WorkflowDocumentRequirement,
  field: FormLibraryAttachmentField,
) {
  const documentType = attachment.documentType.trim().toLowerCase();
  return (
    attachment.documentId === document.id &&
    (documentType === field.name.trim().toLowerCase() ||
      documentType === field.label.trim().toLowerCase())
  );
}
