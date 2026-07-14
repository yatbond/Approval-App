"use client";

import {
  ArrowRight,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Plus,
  Send,
  Save,
  ScanSearch,
  Trash2,
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
  getNativeFormFieldPlaceholder,
} from "@/lib/workflow-native-form-state";
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
import {
  getWorkflowParticipantEmailFields,
  type WorkflowParticipantEmailMap,
} from "@/lib/workflow-participant-assignment-state";
import {
  buildRequestWorkflowMapState,
  getWorkflowMapNodeIdForParticipantField,
} from "@/lib/request-workflow-map-state";
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

type RequestWorkflowMapState = ReturnType<typeof buildRequestWorkflowMapState>;

function NativeFormFieldInput({
  field,
  value,
  onChange,
  onFocus,
}: {
  field: WorkflowField;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const fieldId = `native-form-${field.name}`;
  const options = (field.options || [])
    .map((option) => option.trim())
    .filter(Boolean);
  const isWide =
    field.type === "long_text" ||
    field.type === "radio" ||
    field.type === "checkbox";
  const heading = (
    <span className="mb-1 flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200">
      <span className="break-words">{field.label}</span>
      {field.required && (
        <span className="rounded-sm border border-[#f7941d]/35 bg-[#fff4e6] px-1.5 py-0.5 text-[10px] font-semibold text-[#713d00] dark:bg-[#f7941d]/15 dark:text-[#ffd29a]">
          Required
        </span>
      )}
    </span>
  );
  const helpText = field.instructions?.trim() ? (
    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
      {field.instructions}
    </p>
  ) : null;
  const wrapperClass = isWide ? "block md:col-span-2" : "block";
  const inputClass =
    "min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#f7941d] focus:ring-2 focus:ring-[#f7941d]/15 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600";

  if (field.type === "checkbox") {
    return (
      <div className={wrapperClass}>
        <label
          htmlFor={fieldId}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-[#d8d8d8] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-950"
        >
          <input
            id={fieldId}
            type="checkbox"
            checked={value === "Yes"}
            onFocus={onFocus}
            onChange={(event) => onChange(event.target.checked ? "Yes" : "")}
            className="mt-0.5 size-4 accent-[#f7941d]"
          />
          <span className="min-w-0">
            {heading}
            {helpText}
          </span>
        </label>
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <fieldset className={wrapperClass} onFocus={onFocus}>
        <legend>{heading}</legend>
        <div className="grid gap-2 rounded-md border border-[#d8d8d8] bg-white p-3 sm:grid-cols-2 dark:border-neutral-700 dark:bg-neutral-950">
          {options.map((option) => (
            <label
              key={option}
              className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200"
            >
              <input
                type="radio"
                name={fieldId}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="accent-[#f7941d]"
              />
              <span className="break-words">{option}</span>
            </label>
          ))}
          {!options.length && (
            <p className="text-xs text-rose-600 dark:text-rose-300">
              No choices configured.
            </p>
          )}
        </div>
        {helpText}
      </fieldset>
    );
  }

  if (field.type === "select") {
    return (
      <label className={wrapperClass} htmlFor={fieldId}>
        {heading}
        <select
          id={fieldId}
          value={value}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          <option value="">
            {getNativeFormFieldPlaceholder(field)}
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {helpText}
      </label>
    );
  }

  if (field.type === "long_text") {
    return (
      <label className={wrapperClass} htmlFor={fieldId}>
        {heading}
        <textarea
          id={fieldId}
          value={value}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          placeholder={getNativeFormFieldPlaceholder(field)}
          rows={4}
          className={`${inputClass} py-2`}
        />
        {helpText}
      </label>
    );
  }

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "email"
        ? "email"
        : field.type === "number" || field.type === "currency"
          ? "number"
          : "text";

  return (
    <label className={wrapperClass} htmlFor={fieldId}>
      {heading}
      <input
        id={fieldId}
        type={inputType}
        step={field.type === "currency" ? "0.01" : undefined}
        inputMode={
          field.type === "number" || field.type === "currency"
            ? "decimal"
            : undefined
        }
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={getNativeFormFieldPlaceholder(field)}
        className={inputClass}
      />
      {helpText}
    </label>
  );
}

function RequestWorkflowMiniMap({
  activeNodeId,
  map,
  onSelectNode,
}: {
  activeNodeId: string;
  map: RequestWorkflowMapState;
  onSelectNode: (nodeId: string) => void;
}) {
  const activeNode = map.stages
    .flatMap((stage) => stage.nodes)
    .find((node) => node.id === activeNodeId);

  return (
    <section className="sticky top-2 z-20 min-w-0 rounded-md border border-[#e6e6e6] bg-white/95 p-3 shadow-sm backdrop-blur xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Workflow map</h2>
            <InfoTip label="The highlighted box changes as you enter participant, document, and request information." />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Current box: <span className="font-medium text-[#713d00]">{activeNode?.label || "Request"}</span>
          </p>
        </div>
        <span className="rounded-md border border-[#f7941d]/40 bg-[#fff4e6] px-2 py-1 text-[11px] font-semibold text-[#713d00]">
          You are here
        </span>
      </div>
      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2">
          {map.stages.map((stage, stageIndex) => (
            <div key={stage.stageNumber} className="flex items-center gap-2">
              {stageIndex > 0 && <ArrowRight size={16} className="shrink-0 text-[#8a8a8a]" />}
              <div className="flex max-w-[14rem] flex-col gap-1.5">
                {stage.nodes.map((node) => {
                  const active = node.id === activeNodeId;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      title={`Show ${node.label}`}
                      onClick={() => onSelectNode(node.id)}
                      className={`min-h-11 min-w-36 rounded-md border px-3 py-2 text-left transition ${
                        active
                          ? "border-[#f7941d] bg-[#fff4e6] text-[#231f20] shadow-sm"
                          : "border-[#e6e6e6] bg-white text-[#666162] hover:border-[#f7941d]/60"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase text-[#8a8a8a]">
                        {node.pathLabel} · {node.kind}
                      </span>
                      <span className="mt-0.5 block max-w-48 break-words text-xs font-semibold">
                        {node.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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
  const assignedUploadsHeading = sharedFulfillmentEnabled
    ? "Assigned"
    : "Required";
  const participantEmailFields = selectedTemplate
    ? getWorkflowParticipantEmailFields(selectedTemplate)
    : [];
  const missingRequiredNativeFields = Array.from(
    new Set(
      manualFormDocuments.flatMap((document) =>
        document.fields
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

  function renderUploadDocumentRequirement(
    document: WorkflowDocumentRequirement,
    helperText?: string,
  ) {
    return (
      <label
        key={document.id}
        onClick={() => setActiveWorkflowNodeId(requestWorkflowNodeByDocumentId.get(document.id) || requestSubmitNodeId)}
        className="block cursor-pointer rounded-md border border-[#e6e6e6] bg-white p-3 transition hover:border-emerald-400/60"
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
          <span className="self-start rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-400">
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
      <section className="min-w-0 rounded-md border border-[#e6e6e6] bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Request setup</h2>
          <InfoTip label="Choose a template, then upload each required or optional document." />
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-neutral-400">Template</span>
          <select
            value={selectedTemplate?.id || ""}
            onChange={(event) => {
              setActiveWorkflowNodeId("");
              setSelectedTemplateId(event.target.value);
            }}
            className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            {requestTemplates.length === 0 && (
              <option value="">No templates</option>
            )}
            {requestTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        {participantEmailFields.length > 0 && (
          <div className="mt-4 rounded-md border border-[#e6e6e6] bg-white p-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-neutral-200">
                Participants
              </p>
              <InfoTip label="Template emails are optional. Fill or change unlocked emails before starting this request. Fixed emails come from the template and cannot be changed here." />
            </div>
            <div className="mt-3 space-y-3">
              {participantEmailFields.map((field) => {
                const value = field.isFixed
                  ? field.email
                  : participantEmails[field.nodeId] ?? field.email;
                return (
                  <label
                    key={field.nodeId}
                    className="block min-w-0 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3"
                  >
                    <span className="flex min-w-0 items-center justify-between gap-2 text-xs text-neutral-400">
                      <span className="min-w-0 break-words">
                        {field.label} - {field.inputLabel}
                      </span>
                      {field.isFixed && (
                        <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">
                          Fixed
                        </span>
                      )}
                    </span>
                    <input
                      type="email"
                      value={value}
                      disabled={field.isFixed}
                      placeholder="name@example.com"
                      onFocus={() => setActiveWorkflowNodeId(
                        getWorkflowMapNodeIdForParticipantField(field.nodeId),
                      )}
                      onChange={(event) =>
                        setParticipantEmail(field.nodeId, event.target.value)
                      }
                      className="mt-2 h-10 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none transition focus:border-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-65"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
              <div className="rounded-md border border-[#e6e6e6] bg-white p-3 text-sm text-neutral-400">
                No requirements.
              </div>
            )}
            {(assignedManualFormDocuments.length > 0 ||
              sharedManualFormDocuments.length > 0) && (
              <div className="rounded-md border border-sky-500/25 bg-sky-500/10 p-3">
                <p className="text-sm font-semibold text-sky-100">
                  Native form
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
                      {" "}shared
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {uploadedAttachments.length > 0 && (
          <div className="mt-4 rounded-md border border-[#e6e6e6] bg-white p-3">
            <p className="text-sm font-semibold text-neutral-200">Files</p>
            <div className="mt-2 space-y-2">
              {uploadedAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-2 text-xs"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-neutral-200">
                        {attachment.fileName}
                      </p>
                      <p className="mt-1 text-neutral-500">
                        {attachment.documentType}
                        {attachment.workflowNodeId
                          ? ` - ${attachment.workflowNodeId}`
                          : ""}
                      </p>
                      {attachment.storagePath && (
                        <p className="mt-1 break-words text-emerald-200">
                          Stored: {attachment.storagePath}
                        </p>
                      )}
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        title="Reopen the stored document and edit its extraction boxes."
                        onClick={() => void editAttachmentExtraction(attachment)}
                        disabled={Boolean(openingAttachmentId)}
                        className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 font-medium text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {openingAttachmentId === attachment.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ScanSearch size={14} />
                        )}
                        Edit extraction
                      </button>
                      <button
                        type="button"
                        title="Remove this document and its extracted values from the draft."
                        onClick={() => void onRemoveAttachment(attachment)}
                        disabled={Boolean(openingAttachmentId)}
                        className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 font-medium text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {requestDrafts.length > 0 && (
          <div className="mt-4 rounded-md border border-[#e6e6e6] bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-200">
                  Requests in this upload
                </p>
                <InfoTip label="Each uploaded document will submit as a separate request." />
              </div>
              <span className="shrink-0 rounded-md border border-[#e6e6e6] px-2 py-1 text-xs text-neutral-400">
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
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
                        : "border-[#e6e6e6] bg-[#f7f7f5] text-neutral-300 hover:border-[#d2d2d2]"
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
            Missing uploads:{" "}
            {missingRequiredDocuments
              .map((document) => document.documentType)
              .join(", ")}
          </div>
        )}

        {missingRequiredNativeFields.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-900 dark:text-amber-100">
            Complete required form fields: {missingRequiredNativeFields.join(", ")}
          </div>
        )}

        <label className="mt-4 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#d2d2d2] bg-white p-6 text-center transition hover:border-emerald-400/60 hover:bg-emerald-400/5">
          {isParsing || openingAttachmentId ? (
            <Loader2 className="mb-3 animate-spin text-emerald-200" size={28} />
          ) : (
            <Upload className="mb-3 text-neutral-300" size={28} />
          )}
          <span className="text-sm font-medium">
            {openingAttachmentId
              ? "Opening saved file"
              : isParsing
                ? "Parsing"
                : "Choose file"}
          </span>
          <span className="mt-1 text-xs text-neutral-500">PDF, image, Excel, or CSV</span>
          <input
            type="file"
            disabled={isParsing || Boolean(openingAttachmentId)}
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
          <div className="mt-4 flex items-center gap-2 rounded-md border border-[#e6e6e6] bg-white p-3 text-sm">
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
                {manualFormDocuments.map((document) => (
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
                    {document.formLibraryRef?.source === "microsoft_forms" && (
                      <div className="mt-3 rounded-md border border-[#f7941d]/35 bg-[#fffaf4] p-3 dark:bg-[#f7941d]/10">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              Complete in Microsoft Forms
                            </p>
                            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                              {document.formLibraryRef.responseMode === "start_workflow"
                                ? "Submitting this form starts the linked workflow after automatic response delivery is connected."
                                : "For an existing request, include its Approval Request Reference in the form response. The mapped values below remain available as a manual fallback."}
                            </p>
                          </div>
                          {document.formLibraryRef.responseUrl && (
                            <a
                              href={document.formLibraryRef.responseUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open this registered Microsoft Form in a new tab."
                              className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[#f7941d] bg-[#f7941d] px-3 text-sm font-medium text-white transition hover:bg-[#df7f0a]"
                            >
                              <ExternalLink size={15} /> Open form
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {document.fields.map((field) => {
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
                ))}
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
                  missingRequiredNativeFields.length > 0
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

function UploadDraftControls({
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
  onSaveRequestDraft: (options?: { asNew?: boolean }) => void;
  onLoadRequestDraft: (draft: SavedUploadRequestDraft) => void;
  onDeleteRequestDraft: (draftId: string) => void;
  onClearRequestDraft: () => void;
}) {
  const workInProgressItems = getUploadWorkInProgressItems({
    activeDraftId: selectedUploadDraftId,
    currentDraftStatus: uploadDraftStatus,
    savedDrafts: savedUploadDrafts,
  });
  const draftMenuRef = useRef<HTMLDetailsElement>(null);
  const autosaveDetail = uploadDraftStatus.label.replace(/^Autosaved\s*/, "");

  return (
    <section className="relative min-w-0 rounded-md border border-[#e6e6e6] bg-white p-3 shadow-sm xl:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-200">Draft controls</h2>
            <InfoTip label="This request is saved automatically. Open the draft list to switch drafts, save a named copy, or discard the current work." />
          </div>
          <p className="mt-1 break-words text-xs text-neutral-500">
            {uploadDraftStatus.hasDraft
              ? `Saved automatically - ${autosaveDetail}`
              : "Your progress will be saved automatically after you add information."}
          </p>
        </div>

        <details ref={draftMenuRef} className="relative w-full sm:w-auto">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-[#d2d2d2] bg-white px-3 text-sm font-medium text-neutral-200 transition hover:border-[#f7941d] hover:bg-[#fff4e5] sm:min-w-32">
            Drafts ({workInProgressItems.length})
            <ChevronDown size={16} />
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-[min(30rem,calc(100vw-2rem))] rounded-md border border-[#d2d2d2] bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-200">Available drafts</h3>
              <span className="text-xs text-neutral-500">
                {workInProgressItems.length} total
              </span>
            </div>

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {workInProgressItems.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#e6e6e6] bg-[#f7f7f5] px-3 py-2 text-sm text-neutral-500">
                  No draft content yet.
                </p>
              ) : null}

              {workInProgressItems.some((item) => item.type === "current") ? (
                <div className="rounded-md border border-[#f7941d]/50 bg-[#fff4e5] p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-100">Current work</p>
                      <p className="mt-1 break-words text-xs text-neutral-500">
                        {uploadDraftStatus.label}
                      </p>
                    </div>
                    <span className="rounded-md border border-[#f7941d]/40 bg-white px-2 py-1 text-xs font-medium text-[#713d00]">
                      Currently open
                    </span>
                  </div>
                </div>
              ) : null}

              {savedUploadDrafts.map((draft) => {
                const summary = workInProgressItems.find((item) => item.id === draft.id);
                const isOpen = draft.id === selectedUploadDraftId;
                return (
                  <div
                    key={draft.id}
                    className={`rounded-md border p-3 text-sm ${
                      isOpen
                        ? "border-[#f7941d]/50 bg-[#fff4e5]"
                        : "border-[#e6e6e6] bg-[#f7f7f5]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-medium text-neutral-100">
                            {draft.title}
                          </p>
                          <span className="rounded-md border border-[#d2d2d2] bg-white px-2 py-0.5 text-[11px] text-neutral-500">
                            Saved draft
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">{summary?.detail}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isOpen ? (
                          <span className="rounded-md border border-[#f7941d]/40 bg-white px-2 py-1 text-xs font-medium text-[#713d00]">
                            Currently open
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onLoadRequestDraft(draft);
                              draftMenuRef.current?.removeAttribute("open");
                            }}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20"
                          >
                            <FolderOpen size={15} />
                            Open
                          </button>
                        )}
                        <button
                          type="button"
                          title={`Delete saved draft ${draft.title}`}
                          aria-label={`Delete saved draft ${draft.title}`}
                          onClick={() => onDeleteRequestDraft(draft.id)}
                          className="inline-flex size-10 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {uploadDraftStatus.hasDraft ? (
              <div className="mt-3 border-t border-[#e6e6e6] pt-3">
                <h3 className="text-sm font-semibold text-neutral-200">Save as new draft</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="block">
                    <span className="sr-only">New draft name</span>
                    <input
                      value={uploadDraftTitle}
                      onChange={(event) => setUploadDraftTitle(event.target.value)}
                      placeholder="Draft name"
                      className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none transition focus:border-emerald-400/60"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onSaveRequestDraft({ asNew: true })}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20"
                  >
                    <Save size={15} />
                    Save as new
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClearRequestDraft}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
                >
                  <X size={15} />
                  Discard current work
                </button>
              </div>
            ) : null}
          </div>
        </details>
      </div>

      {uploadDraftMessage ? (
        <p className="mt-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 py-2 text-xs text-neutral-300">
          {uploadDraftMessage}
        </p>
      ) : null}
    </section>
  );
}
