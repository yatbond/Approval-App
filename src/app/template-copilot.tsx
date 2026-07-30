"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Bot, FileText, FileUp, Save, Send, Sparkles } from "lucide-react";
import type { BusinessUnit, WorkflowTemplate } from "@/lib/types";
import { workflowTemplateFromDefinition } from "@/lib/template-authoring-definition";
import type {
  TemplateDefinitionV1,
  TemplateRequirementsDossierV1,
} from "@/lib/template-authoring-contracts";
import {
  getTemplateCopilotSectionLabel,
  templateCopilotSectionIds,
  templateCopilotStartSchema,
  type TemplateCopilotLedger,
} from "@/lib/template-copilot-ledger";
import type { TemplateCopilotFactId, TemplateCopilotV2Ledger } from "@/lib/template-copilot-facts";
import { templateCopilotUnicodeCodePointCount } from "@/lib/template-copilot-unicode";
import type { TemplateCopilotV2InterviewState, TemplateCopilotV2SpecialReviewItem } from "@/lib/template-copilot-question-library";
import { applyTemplateCopilotV2Reconciliation, canReplaceTemplateCopilotV2Transcript, canRestoreTemplateCopilotV2Draft, createTemplateCopilotClientChatMessage, createTemplateCopilotV2LifecycleFence, discoverTemplateCopilotV2Recovery, executeTemplateCopilotStart, mergeTemplateCopilotClientChatMessages, nextTemplateCopilotV2PendingCommand, nextTemplateCopilotV2PendingSpecialCommand, parseTemplateCopilotClientChatMessages, parseTemplateCopilotV2PendingSpecialCommand, parseTemplateCopilotV2PendingStart, releaseTemplateCopilotV2ClientAfterRollback, resolveTemplateCopilotV2ExplicitConflict, resolveTemplateCopilotV2Failure, resolveTemplateCopilotV2SpecialReconciliation, selectNewerTemplateCopilotV2Snapshot, selectTemplateCopilotStartIntent, templateCopilotV2FailureNeedsReconcile, templateCopilotV2InterviewMutationBlocked, type TemplateCopilotClientChatMessage, type TemplateCopilotStartSchemaVersion, type TemplateCopilotV2LifecycleLease, type TemplateCopilotV2PendingCommand, type TemplateCopilotV2PendingSpecialCommand, type TemplateCopilotV2PendingStart, type TemplateCopilotV2SpecialCommand } from "@/lib/template-copilot-v2-client-command";
import { getTemplateCopilotAnswerLimit, getTemplateCopilotComposerRenderContract, getTemplateCopilotV2InputMode, getTemplateCopilotV2Step4RenderContract } from "@/lib/template-copilot-v2-ui-contract";
import { templateCopilotApiErrorCode, templateCopilotApiErrorFromResponse, templateCopilotApiErrorStatus } from "@/lib/template-copilot-api-error";
import {
  formatTemplateCopilotV2ReviewValue,
  selectTemplateCopilotV2OpenExtractionReview,
  templateCopilotV2ReviewFactLabel,
  templateCopilotV2ReviewPanelCopy,
} from "@/lib/template-copilot-v2-review-display";
import {
  templateCopilotLocales,
  type TemplateCopilotLocale,
} from "@/lib/template-copilot-plan";
import { TemplateCopilotHistoryPanel } from "./template-copilot-history-panel";
import type { TemplateCopilotV2AuthoritativeProjection } from "@/lib/template-copilot-v2-authoritative-projection";
import { TemplateCopilotV2AuthoritativeMap, type TemplateCopilotV2MapTransition } from "./template-copilot-v2-authoritative-map";
import { createPendingTemplateCopilotV2MapCommand, parsePendingTemplateCopilotV2MapCommand, templateCopilotV2PendingMapCommandBody, type PendingTemplateCopilotV2MapCommand } from "@/lib/template-copilot-v2-map-command";
import { templateCopilotV2AuthoringModes, templateCopilotV2ModeCopy, type TemplateCopilotV2AuthoringMode, type TemplateCopilotV2ModeState } from "@/lib/template-copilot-v2-mode-contract";
import { nextTemplateCopilotV2PendingModeCommand, parseTemplateCopilotV2PendingModeCommand, templateCopilotDocumentIdentity, templateCopilotV2PendingModeCommandFailureDisposition, templateCopilotV2PendingModeCommandRequest, type TemplateCopilotV2PendingModeCommand } from "@/lib/template-copilot-v2-mode-command";
import { getTemplateCopilotTranscriptPresentation, getTemplateCopilotV2ModeUiContract, shouldSubmitTemplateCopilotComposerKey, templateCopilotV2ModeUiCopy } from "@/lib/template-copilot-v2-mode-ui";
import { TemplateCopilotConceptHelp } from "./template-copilot-concept-help";
import { getTemplateCopilotPreferredQuestionLibraryVersion } from "@/lib/template-copilot-v2-step8-rollout";

type ChatMessage = TemplateCopilotClientChatMessage;

function TemplateCopilotTranscriptContent({
  content,
  locale,
}: {
  content: string;
  locale: TemplateCopilotLocale;
}) {
  const presentation = getTemplateCopilotTranscriptPresentation(content);
  if (!presentation.collapsed) return <p className="whitespace-pre-wrap">{content}</p>;
  const copy = templateCopilotV2ModeUiCopy(locale);
  return <div>
    <p className="whitespace-pre-wrap">{presentation.preview}</p>
    <details className="mt-2" aria-live="off">
      <summary className="min-h-11 cursor-pointer content-center underline underline-offset-2">{copy.showFullMessage} ({presentation.count.toLocaleString(locale)})</summary>
      <p className="mt-2 whitespace-pre-wrap break-words">{content}</p>
    </details>
  </div>;
}

const pendingTemplateCopilotV2MapEditStorageKey = "approval-template-copilot-v2-pending-map-edit";
function loadPendingTemplateCopilotV2MapEdit(): PendingTemplateCopilotV2MapCommand | null {
  if (typeof window === "undefined") return null;
  try { return parsePendingTemplateCopilotV2MapCommand(JSON.parse(window.sessionStorage.getItem(pendingTemplateCopilotV2MapEditStorageKey) || "null")); } catch { return null; }
}
function persistPendingTemplateCopilotV2MapEdit(value: PendingTemplateCopilotV2MapCommand | null) {
  if (typeof window === "undefined") return;
  try { if (value) window.sessionStorage.setItem(pendingTemplateCopilotV2MapEditStorageKey, JSON.stringify(value)); else window.sessionStorage.removeItem(pendingTemplateCopilotV2MapEditStorageKey); } catch { /* recovery aid only */ }
}

const pendingTemplateCopilotV2StartStorageKey = "approval-template-copilot-v2-pending-start";
function loadPendingTemplateCopilotV2Start(): TemplateCopilotV2PendingStart | null {
  if (typeof window === "undefined") return null;
  try {
    return parseTemplateCopilotV2PendingStart(JSON.parse(window.sessionStorage.getItem(pendingTemplateCopilotV2StartStorageKey) || "null"));
  } catch { return null; }
}
function persistPendingTemplateCopilotV2Start(value: TemplateCopilotV2PendingStart | null) {
  if (typeof window === "undefined") return;
  try { if (value) window.sessionStorage.setItem(pendingTemplateCopilotV2StartStorageKey, JSON.stringify(value)); else window.sessionStorage.removeItem(pendingTemplateCopilotV2StartStorageKey); } catch { /* storage is a resilience aid, never authority */ }
}

const pendingTemplateCopilotV2SpecialStorageKey = "approval-template-copilot-v2-pending-special";
function loadPendingTemplateCopilotV2Special(): TemplateCopilotV2PendingSpecialCommand | null {
  if (typeof window === "undefined") return null;
  try {
    return parseTemplateCopilotV2PendingSpecialCommand(JSON.parse(window.sessionStorage.getItem(pendingTemplateCopilotV2SpecialStorageKey) || "null"));
  } catch { return null; }
}
function persistPendingTemplateCopilotV2Special(value: TemplateCopilotV2PendingSpecialCommand | null) {
  if (typeof window === "undefined") return;
  try { if (value) window.sessionStorage.setItem(pendingTemplateCopilotV2SpecialStorageKey, JSON.stringify(value)); else window.sessionStorage.removeItem(pendingTemplateCopilotV2SpecialStorageKey); } catch { /* best-effort recovery only */ }
}

const pendingTemplateCopilotV2ModeStorageKey = "approval-template-copilot-v2-pending-mode";
function loadPendingTemplateCopilotV2Mode(): TemplateCopilotV2PendingModeCommand | null {
  if (typeof window === "undefined") return null;
  try {
    return parseTemplateCopilotV2PendingModeCommand(JSON.parse(window.sessionStorage.getItem(pendingTemplateCopilotV2ModeStorageKey) || "null"));
  } catch { return null; }
}
function persistPendingTemplateCopilotV2Mode(value: TemplateCopilotV2PendingModeCommand | null) {
  if (typeof window === "undefined") return;
  try { if (value) window.sessionStorage.setItem(pendingTemplateCopilotV2ModeStorageKey, JSON.stringify(value)); else window.sessionStorage.removeItem(pendingTemplateCopilotV2ModeStorageKey); } catch { /* recovery aid only; the server receipt remains authoritative */ }
}

type V1CopilotState = {
  sessionId: string;
  revision: number;
  status: "interviewing" | "ready" | "draft_created";
  ledger: TemplateCopilotLedger;
};
type V2CopilotState = Omit<V1CopilotState, "ledger"> & {
  ledger: TemplateCopilotV2Ledger;
  interview: TemplateCopilotV2InterviewState;
  specialReview: readonly TemplateCopilotV2SpecialReviewItem[];
  step4Enabled?: boolean;
  step5EditingEnabled?: boolean;
  projection?: TemplateCopilotV2AuthoritativeProjection;
  modeState?: TemplateCopilotV2ModeState;
  modeFlags?: { guided: boolean; describeEverything: boolean; similarTemplate: boolean };
  structuredEditorFlags?: { attachments: boolean; conditions: boolean; notifications: boolean };
};
type CopilotState = V1CopilotState | V2CopilotState;
function isV2State(state: CopilotState): state is V2CopilotState {
  return state.ledger.schemaVersion === 2;
}
function structuredEditorFlagsFrom(value: unknown): V2CopilotState["structuredEditorFlags"] {
  if (!value || typeof value !== "object") return undefined;
  const flags = (value as { structuredEditorFlags?: unknown }).structuredEditorFlags;
  if (!flags || typeof flags !== "object") return undefined;
  const candidate = flags as Record<string, unknown>;
  if (!["attachments", "conditions", "notifications"].every((key) => typeof candidate[key] === "boolean")) return undefined;
  return {
    attachments: candidate.attachments as boolean,
    conditions: candidate.conditions as boolean,
    notifications: candidate.notifications as boolean,
  };
}

type TemplateCopilotV2ExtractionCandidate = TemplateCopilotV2Ledger["extractionEvidence"]["candidates"][number];
type TemplateCopilotV2ExtractionConflict = TemplateCopilotV2Ledger["extractionEvidence"]["conflicts"][number];

function extractionEvidenceCopy(locale: TemplateCopilotLocale) {
  return locale === "zh-Hant"
    ? { details: "查看來源依據", evidence: "來源依據", completeValue: "完整值", field: "欄位", exactText: "原文", reference: "訊息／字元位置", rule: "轉換規則", codePoints: "字元", item: "項目" }
    : locale === "zh-Hans"
      ? { details: "查看来源依据", evidence: "来源依据", completeValue: "完整值", field: "字段", exactText: "原文", reference: "消息／字符位置", rule: "转换规则", codePoints: "字符", item: "项目" }
      : { details: "View source evidence", evidence: "Source evidence", completeValue: "Complete value", field: "Field", exactText: "Exact text", reference: "Message / character range", rule: "Normalization rule", codePoints: "code points", item: "item" };
}

function extractionEvidencePathLabel(path: string, locale: TemplateCopilotLocale) {
  const copy = extractionEvidenceCopy(locale);
  if (path === "/") return copy.completeValue;
  const readablePath = path.slice(1).split("/").map((segment) => {
    const decoded = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (/^\d+$/u.test(decoded)) return `${copy.item} ${Number(decoded) + 1}`;
    return decoded.replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/[-_]/gu, " ");
  }).join(" / ");
  return `${copy.field}: ${readablePath}`;
}

function ExtractionEvidenceDisclosure({ candidate, locale }: {
  candidate: TemplateCopilotV2ExtractionCandidate;
  locale: TemplateCopilotLocale;
}) {
  const copy = extractionEvidenceCopy(locale);
  return <details className="mt-2 rounded border border-sky-200 bg-white/70 px-2 py-1 text-xs text-sky-950 dark:border-sky-800 dark:bg-neutral-900/50 dark:text-sky-100">
    <summary className="min-h-8 cursor-pointer content-center font-medium underline underline-offset-2">{copy.details} ({candidate.evidence.length})</summary>
    <ul className="mt-1 space-y-2" aria-label={`${copy.evidence}: ${candidate.factId}`}>
      {candidate.evidence.map((item, index) => <li key={`${item.path}:${item.messageId}:${item.startCodePoint}:${item.endCodePoint}:${index}`} className="rounded border border-sky-100 bg-sky-50/70 p-2 dark:border-sky-900 dark:bg-neutral-950/70">
        <p><span className="font-medium">{extractionEvidencePathLabel(item.path, locale)}</span> <span className="font-mono text-[11px] text-sky-800 dark:text-sky-200">{item.path}</span></p>
        <p className="mt-1"><span className="font-medium">{copy.exactText}:</span> <q className="break-words">{item.exactText}</q></p>
        <p className="mt-1 break-all"><span className="font-medium">{copy.reference}:</span> {item.messageId} · {item.startCodePoint}–{item.endCodePoint} {copy.codePoints}</p>
        {item.normalizationRule && <p className="mt-1"><span className="font-medium">{copy.rule}:</span> <span className="font-mono text-[11px]">{item.normalizationRule}</span></p>}
      </li>)}
    </ul>
  </details>;
}

function ExtractionTypedValue({ factId, value, locale, variant }: {
  factId: TemplateCopilotV2ExtractionCandidate["factId"];
  value: unknown;
  locale: TemplateCopilotLocale;
  variant: "candidate" | "current" | "proposed";
}) {
  const copy = templateCopilotV2ReviewPanelCopy(locale);
  const label = templateCopilotV2ReviewFactLabel(factId, locale);
  return <div className="mt-2 rounded border border-sky-200 bg-white/70 p-2 text-sm text-sky-950 dark:border-sky-800 dark:bg-neutral-900/50 dark:text-sky-100" aria-label={`${copy[variant]}: ${label}`}>
    <p className="font-medium">{copy[variant]} · {label}</p>
    <p className="mt-1 break-words"><span className="font-medium">{copy.value}:</span> {formatTemplateCopilotV2ReviewValue(factId, value, locale)}</p>
  </div>;
}

function extractionCandidateReviewBlockReason(ledger: TemplateCopilotV2Ledger, candidate: TemplateCopilotV2ExtractionCandidate, locale: TemplateCopilotLocale) {
  if (candidate.ambiguity !== "none") return locale === "zh-Hant" ? "需要澄清後才能確認。" : locale === "zh-Hans" ? "需要澄清后才能确认。" : "Needs clarification before it can be confirmed.";
  if (ledger.extractionEvidence.conflicts.some((conflict) => conflict.state === "open" && conflict.factId === candidate.factId)) return locale === "zh-Hant" ? "此資料正等待差異審閱，暫時不能確認。" : locale === "zh-Hans" ? "此信息正在等待差异审核，暂时不能确认。" : "This suggestion is held while a conflict is reviewed.";
  if (ledger.facts[candidate.factId].status !== "candidate") return locale === "zh-Hant" ? "此建議已不是目前可確認的資料。" : locale === "zh-Hans" ? "此建议已不是当前可确认的信息。" : "This suggestion is no longer the current confirmable fact.";
  return null;
}

function extractionExistingProvenanceSummary(conflict: TemplateCopilotV2ExtractionConflict, locale: TemplateCopilotLocale) {
  if (conflict.existing.confirmation) return locale === "zh-Hant" ? "目前資料已由人員確認。" : locale === "zh-Hans" ? "当前信息已由人员确认。" : "The current information was confirmed by a person.";
  if (conflict.existing.provenance.some((item) => item.kind === "human_editor")) return locale === "zh-Hant" ? "目前資料由人員輸入。" : locale === "zh-Hans" ? "当前信息由人员输入。" : "The current information was entered by a person.";
  if (conflict.existing.provenance.some((item) => item.kind === "message")) return locale === "zh-Hant" ? "目前資料保留了先前的訊息來源。" : locale === "zh-Hans" ? "当前信息保留了先前的消息来源。" : "The current information retains earlier message provenance.";
  return locale === "zh-Hant" ? "目前資料保留了既有來源紀錄。" : locale === "zh-Hans" ? "当前信息保留了现有来源记录。" : "The current information retains its recorded provenance.";
}

function stableExtractionRecoveryValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableExtractionRecoveryValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableExtractionRecoveryValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) || "undefined";
}

type DraftReviewState = {
  familyId: string;
  draftId: string;
  revision: number;
  dossier: TemplateRequirementsDossierV1;
  definition: TemplateDefinitionV1;
  sourceSessionId: string;
  lifecycle: TemplateCopilotV2LifecycleLease | null;
};

export function TemplateCopilot({
  businessDirectory,
  onDraftCreated,
}: {
  businessDirectory: BusinessUnit[];
  onDraftCreated: (template: WorkflowTemplate) => void;
}) {
  const availableBusinesses = useMemo(
    () =>
      businessDirectory.filter(
        (business) =>
          business.departments.length > 0 &&
          templateCopilotStartSchema.shape.businessUnitId.safeParse(business.id)
            .success,
      ),
    [businessDirectory],
  );
  const [selectedBusinessUnitId, setBusinessUnitId] = useState("");
  const [selectedLocale, setSelectedLocale] =
    useState<TemplateCopilotLocale>("en");
  const [pendingV2Start, setPendingV2Start] = useState<TemplateCopilotV2PendingStart | null>(null);
  const startLocale = pendingV2Start?.locale || selectedLocale;
  const startBusinessUnitId = pendingV2Start?.businessUnitId || selectedBusinessUnitId;
  const selectedBusiness =
    availableBusinesses.find(
      (business) => business.id === startBusinessUnitId,
    ) || availableBusinesses[0];
  const businessUnitId = pendingV2Start?.businessUnitId || selectedBusiness?.id || "";
  const [selectedDepartmentName, setDepartmentName] = useState("");
  const departmentName =
    pendingV2Start?.departmentName ||
    (selectedBusiness?.departments.includes(selectedDepartmentName)
      ? selectedDepartmentName
      : selectedBusiness?.departments[0] || "");
  const [state, setState] = useState<CopilotState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedChoiceOptionId, setSelectedChoiceOptionId] = useState<string | null>(null);
  const [questionHelpVisible, setQuestionHelpVisible] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [notApplicableReason, setNotApplicableReason] = useState("");
  const [extractionRationale, setExtractionRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [similarTemplates, setSimilarTemplates] = useState<Array<{ versionId: string; versionNumber: number; templateKey: string; name: string }>>([]);
  const [selectedSimilarVersionId, setSelectedSimilarVersionId] = useState("");
  const [pendingV2Command, setPendingV2Command] = useState<TemplateCopilotV2PendingCommand | null>(null);
  const [pendingV2SpecialCommand, setPendingV2SpecialCommand] = useState<TemplateCopilotV2PendingSpecialCommand | null>(null);
  const [pendingMapEdit, setPendingMapEdit] = useState<PendingTemplateCopilotV2MapCommand | null>(null);
  const [pendingModeCommand, setPendingModeCommand] = useState<TemplateCopilotV2PendingModeCommand | null>(null);
  const [draftReview, setDraftReview] = useState<DraftReviewState | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);
  const v2QuestionHeadingRef = useRef<HTMLHeadingElement>(null);
  const resolvedV2CommandKeys = useRef(new Set<string>());
  const activeV2CommandRef = useRef<TemplateCopilotV2PendingCommand | null>(null);
  const draftGenerationRef = useRef(0);
  const v2CommandDraftGenerationRef = useRef(new Map<string, number>());
  const v2SubmitInFlightRef = useRef(false);
  const v2SpecialInFlightRef = useRef(false);
  const v2StartInFlightRef = useRef(false);
  // Do not inspect v2 start storage at mount.  A server-authoritative,
  // read-only capability probe must select v2 before this ref/storage is read.
  const pendingV2StartRef = useRef<TemplateCopilotV2PendingStart | null>(null);
  const pendingV2SpecialRef = useRef<TemplateCopilotV2PendingSpecialCommand | null>(null);
  const pendingMapEditRef = useRef<PendingTemplateCopilotV2MapCommand | null>(null);
  const pendingModeCommandRef = useRef<TemplateCopilotV2PendingModeCommand | null>(null);
  const latestV2StateRef = useRef<V2CopilotState | null>(null);
  const v2LifecycleEpochRef = useRef<ReturnType<typeof createTemplateCopilotV2LifecycleFence> | null>(null);
  if (v2LifecycleEpochRef.current === null) {
    v2LifecycleEpochRef.current = createTemplateCopilotV2LifecycleFence();
  }
  // This marker is set only after this client has actually loaded or created
  // v2 state. Schema 1 can therefore release a rolled-back v2 interview
  // without reading or mutating a clean legacy page.
  const v2ClientResidueRef = useRef(false);

  function captureV2LifecycleLease() {
    return v2LifecycleEpochRef.current!.capture();
  }

  function commitV2ReactState<Value>(
    lifecycle: TemplateCopilotV2LifecycleLease,
    setter: Dispatch<SetStateAction<Value>>,
    update: (current: Value) => Value,
  ) {
    return lifecycle.commit(() => {
      // React may evaluate a functional updater after rollback. Recheck the
      // same lease inside that deferred callback instead of relying only on
      // the guard that scheduled it.
      setter((current) => lifecycle.isCurrent() ? update(current) : current);
    });
  }

  function installPendingV2Special(
    lifecycle: TemplateCopilotV2LifecycleLease,
    next: TemplateCopilotV2PendingSpecialCommand | null,
  ) {
    return lifecycle.commit(() => {
      if (next) v2ClientResidueRef.current = true;
      pendingV2SpecialRef.current = next;
      setPendingV2SpecialCommand((current) => lifecycle.isCurrent() ? next : current);
      persistPendingTemplateCopilotV2Special(next);
    });
  }

  function installPendingV2Start(
    lifecycle: TemplateCopilotV2LifecycleLease,
    next: TemplateCopilotV2PendingStart | null,
  ) {
    return lifecycle.commit(() => {
      if (next) v2ClientResidueRef.current = true;
      pendingV2StartRef.current = next;
      setPendingV2Start((current) => lifecycle.isCurrent() ? next : current);
      persistPendingTemplateCopilotV2Start(next);
    });
  }

  function installPendingMapEdit(next: PendingTemplateCopilotV2MapCommand | null) {
    pendingMapEditRef.current = next;
    setPendingMapEdit(next);
    persistPendingTemplateCopilotV2MapEdit(next);
  }

  function installPendingModeCommand(
    lifecycle: TemplateCopilotV2LifecycleLease,
    next: TemplateCopilotV2PendingModeCommand | null,
  ) {
    return lifecycle.commit(() => {
      if (next) v2ClientResidueRef.current = true;
      pendingModeCommandRef.current = next;
      setPendingModeCommand((current) => lifecycle.isCurrent() ? next : current);
      persistPendingTemplateCopilotV2Mode(next);
    });
  }

  const releaseV2AfterRollbackFromEffect = useEffectEvent(releaseV2AfterRollback);
  useEffect(() => { installPendingMapEdit(loadPendingTemplateCopilotV2MapEdit()); }, []);
  useEffect(() => {
    let active = true;
    const mountLifecycle = captureV2LifecycleLease();
    // Restore v2-only commands only after the authenticated server capability
    // probe selects v2. A v1 page never inspects either v2 storage key.
    void discoverTemplateCopilotV2Recovery({
      lifecycle: mountLifecycle,
      discoverSchemaVersion: discoverTemplateCopilotStartSchemaVersion,
      releaseLoadedV2AfterRollback: releaseV2AfterRollbackFromEffect,
      loadPendingV2Start: () => pendingV2StartRef.current || loadPendingTemplateCopilotV2Start(),
      loadPendingV2Special: () => pendingV2SpecialRef.current || loadPendingTemplateCopilotV2Special(),
    })
      .then((recovery) => {
        if (
          !active
          || !mountLifecycle.isCurrent()
          || !recovery
          || recovery.schemaVersion !== 2
          || v2StartInFlightRef.current
        ) return;
        const storedModeCommand = loadPendingTemplateCopilotV2Mode();
        if (storedModeCommand && !pendingModeCommandRef.current) {
          installPendingModeCommand(mountLifecycle, storedModeCommand);
        }
        if (recovery.pendingSpecial && !pendingV2SpecialRef.current) {
          installPendingV2Special(mountLifecycle, recovery.pendingSpecial);
        } else if (recovery.pendingStart && !pendingV2StartRef.current) {
          installPendingV2Start(mountLifecycle, recovery.pendingStart);
        }
      })
      .catch(() => {
        // Capability discovery is retried by Start; no mutation has occurred.
      });
    return () => {
      active = false;
      // Teardown invalidates whichever operation currently owns this component,
      // not only the mount probe. Durable pending storage is deliberately kept
      // for authoritative recovery by a later mount.
      v2LifecycleEpochRef.current?.invalidateCurrent();
    };
  }, []);
  const locale = state?.ledger.locale || startLocale;
  const copy = templateCopilotCopy[locale];
  const v2InputMode = state && isV2State(state) ? getTemplateCopilotV2InputMode(state.interview) : null;
  const extractionReview = state && isV2State(state)
    ? selectTemplateCopilotV2OpenExtractionReview(state.ledger.extractionEvidence)
    : null;
  const extractionReviewCopy = templateCopilotV2ReviewPanelCopy(locale);
  const composer = state ? getTemplateCopilotComposerRenderContract({ schemaVersion: isV2State(state) ? 2 : 1, status: state.status, ...(isV2State(state) ? { interview: state.interview } : {}) }) : null;
  const answerLimit = getTemplateCopilotAnswerLimit(state && isV2State(state) ? 2 : 1);
  const activeV2Mode = state && isV2State(state) ? state.modeState?.mode || "guided" : null;
  const v2ModeContract = state && isV2State(state)
    ? getTemplateCopilotV2ModeUiContract({
        mode: activeV2Mode || "guided",
        flags: state.modeFlags,
        hasSourceSnapshot: Boolean(state.modeState?.sourceSnapshot),
      })
    : null;
  const broadMode = v2ModeContract?.broadMode === true;
  const activeModeDisabled = Boolean(activeV2Mode && !v2ModeContract?.availableModes.includes(activeV2Mode));
  const composerLimit = v2ModeContract?.composerLimit || answerLimit;
  const modeUiCopy = templateCopilotV2ModeUiCopy(locale);
  const broadModeKind = state && isV2State(state) && broadMode ? state.modeState?.mode : undefined;
  const broadComposerLabel = broadModeKind === "similar_template" ? modeUiCopy.similarLabel : modeUiCopy.describeLabel;
  const broadComposerPlaceholder = broadModeKind === "similar_template" ? modeUiCopy.similarPlaceholder : modeUiCopy.describePlaceholder;
  const broadComposerExample = broadModeKind === "similar_template" ? modeUiCopy.similarExample : modeUiCopy.describeExample;
  const v2ReplayPending = Boolean(state && isV2State(state) && (templateCopilotV2InterviewMutationBlocked({ pendingAnswer: pendingV2Command, pendingSpecial: pendingV2SpecialCommand }) || pendingModeCommand?.sessionId === state.sessionId));
  const v2SpecialReview = state && isV2State(state) ? state.specialReview : [];
  const v2StoredInteraction = state && isV2State(state) ? state.interview.nextQuestion?.interaction : undefined;
  const step4Render = getTemplateCopilotV2Step4RenderContract({ schemaVersion: state && isV2State(state) ? 2 : 1, hasInteraction: Boolean(v2StoredInteraction), enabled: Boolean(state && isV2State(state) && state.step4Enabled) });
  const v2Interaction = step4Render.enhanced ? v2StoredInteraction : undefined;
  const v2PlainTypedFallback = step4Render.plainTypedFallback;
  const v2Examples = state && isV2State(state) && state.interview.nextQuestion
    ? [state.interview.nextQuestion.example, ...(v2Interaction?.alternateExamples || [])].filter((example): example is string => Boolean(example))
    : [];
  const v2VisibleExample = v2Examples[Math.min(exampleIndex, Math.max(v2Examples.length - 1, 0))];

  useEffect(() => {
    if (!state || !isV2State(state) || v2InputMode !== "answerable" || pendingV2Command || pendingV2SpecialCommand) return;
    const frame = window.requestAnimationFrame(() => {
      const question = state.interview.nextQuestion;
      const target = question?.answerType === "choice" && !v2PlainTypedFallback
        ? v2QuestionHeadingRef.current
        : answerInputRef.current;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state, v2InputMode, v2PlainTypedFallback, pendingV2Command, pendingV2SpecialCommand]);

  const completed = useMemo(
    () =>
      state && !isV2State(state)
        ? templateCopilotSectionIds.filter(
            (id) => state.ledger.sections[id].status !== "missing",
          ).length
        : 0,
    [state],
  );

  function installV2State(
    lifecycle: TemplateCopilotV2LifecycleLease,
    next: V2CopilotState,
  ) {
    if (!lifecycle.isCurrent()) return null;
    const candidate = {
      ...next,
      modeFlags: next.modeFlags || latestV2StateRef.current?.modeFlags,
      modeState: next.modeState || latestV2StateRef.current?.modeState,
      structuredEditorFlags:
        next.structuredEditorFlags ||
        latestV2StateRef.current?.structuredEditorFlags,
    } satisfies V2CopilotState;
    const selected = selectNewerTemplateCopilotV2Snapshot(latestV2StateRef.current, candidate);
    const installed = lifecycle.commit(() => {
      const priorQuestionId = latestV2StateRef.current?.interview.nextQuestion?.questionId;
      if (priorQuestionId !== selected.interview.nextQuestion?.questionId) {
        setSelectedChoiceOptionId(null);
        setQuestionHelpVisible(false);
        setExampleIndex(0);
      }
      v2ClientResidueRef.current = true;
      latestV2StateRef.current = selected;
      if (selected.modeState?.sourceSnapshot) {
        setSelectedSimilarVersionId(selected.modeState.sourceSnapshot.versionId);
      }
      setState((current) => {
        if (!lifecycle.isCurrent()) return current;
        return current && isV2State(current)
          ? selectNewerTemplateCopilotV2Snapshot(current, selected)
          : selected;
      });
    });
    return installed ? selected : null;
  }

  async function saveAuthoritativeMapFact(factId: TemplateCopilotFactId, requestedTransition: TemplateCopilotV2MapTransition): Promise<string | null> {
    if (!state || !isV2State(state) || !state.step5EditingEnabled || busy) return "Editing is not currently available.";
    const pending = createPendingTemplateCopilotV2MapCommand({
      sessionId: state.sessionId,
      expectedRevision: state.revision,
      idempotencyKey: messageId("map-edit"),
      factId,
      factStatus: state.ledger.facts[factId].status,
      intent: requestedTransition,
    });
    installPendingMapEdit(pending);
    return executePendingMapCommand(pending);
  }

  async function executePendingMapCommand(pending: PendingTemplateCopilotV2MapCommand): Promise<string | null> {
    if (!state || !isV2State(state) || !state.step5EditingEnabled || busy || state.sessionId !== pending.sessionId) return "Editing is not currently available.";
    const lifecycle = captureV2LifecycleLease();
    if (!lifecycle.commit(() => { setBusy(true); setError(""); })) return "This view has changed. Please try again.";
    installPendingMapEdit(pending);
    const body = templateCopilotV2PendingMapCommandBody(pending);
    try {
      const response = await api(`/api/template-authoring/copilot/sessions/${pending.sessionId}/facts`, { method: "POST", body: JSON.stringify(body) });
      if (!lifecycle.isCurrent()) return "This view has changed. Please try again.";
      const interview = response.interview as TemplateCopilotV2InterviewState | undefined;
      if ((response.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !interview) return "The saved result was incomplete. Refresh and review the latest map.";
      if (!installV2State(lifecycle, { sessionId: state.sessionId, revision: Number(response.revision), status: String(response.status) as V2CopilotState["status"], ledger: response.ledger as TemplateCopilotV2Ledger, interview, specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: response.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: response.step4Enabled === true, step5EditingEnabled: response.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(response) })) return "This view has changed. Please try again.";
      installPendingMapEdit(null);
      return null;
    } catch (caught) {
      // A stale revision never wins locally. Re-read the authoritative session
      // so focus remains in the map and the user can reconcile from reality.
      if (templateCopilotApiErrorStatus(caught) === 409) {
        let reloaded = false;
        try {
          const snapshot = await api(`/api/template-authoring/copilot/sessions/${state.sessionId}?messageDirection=tail&messageLimit=100`, { method: "GET" });
          const saved = snapshot.session as { revision?: unknown; status?: unknown; ledger?: unknown; interview?: unknown; specialReview?: unknown; projection?: unknown; step4Enabled?: unknown; step5EditingEnabled?: unknown };
          if ((saved.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion === 2 && saved.interview) {
            const installed = installV2State(lifecycle, { sessionId: state.sessionId, revision: Number(saved.revision), status: String(saved.status) as V2CopilotState["status"], ledger: saved.ledger as TemplateCopilotV2Ledger, interview: saved.interview as TemplateCopilotV2InterviewState, specialReview: Array.isArray(saved.specialReview) ? saved.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: saved.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: saved.step4Enabled === true, step5EditingEnabled: saved.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(saved) });
            if (installed) { installPendingMapEdit(null); reloaded = true; }
          }
        } catch {
          return "Another edit may have been saved first, but the authoritative map could not be reloaded. Your exact pending edit is retained; retry after refresh.";
        }
        return reloaded
          ? "Another edit was saved first. The latest authoritative map has been loaded; review it and try again."
          : "Another edit may have been saved first, but the authoritative map response was incomplete. Your exact pending edit is retained; refresh and retry.";
      }
      if (templateCopilotApiErrorStatus(caught) === 404) {
        installPendingMapEdit(null);
        const structuredRollback =
          templateCopilotApiErrorCode(caught) === "structured_editor_unavailable";
        lifecycle.commit(() => setState((current) => {
          if (!current || !isV2State(current) || current.sessionId !== pending.sessionId) return current;
          if (!structuredRollback) return { ...current, step5EditingEnabled: false };
          const flags = current.structuredEditorFlags || {
            attachments: false,
            conditions: false,
            notifications: false,
          };
          return {
            ...current,
            structuredEditorFlags: {
              ...flags,
              ...(pending.factId === "attachments.requirements"
                ? { attachments: false }
                : pending.factId === "workflow.conditions"
                  ? { conditions: false }
                  : pending.factId === "notifications.rules"
                    ? { notifications: false }
                    : {}),
            },
          };
        }));
        return structuredRollback
          ? "This editor has been turned off. Its saved setting remains read-only."
          : "Map editing has been turned off. Your saved map is still read-only.";
      }
      return "The change was not confirmed. Retry the same saved edit.";
    } finally {
      lifecycle.commit(() => setBusy(false));
    }
  }

  async function start() {
    if (!businessUnitId || !departmentName || v2StartInFlightRef.current) return;
    const validIntent = templateCopilotStartSchema.safeParse({
      businessUnitId,
      departmentName,
      locale: startLocale,
      questionLibraryVersion: getTemplateCopilotPreferredQuestionLibraryVersion(),
      // Validate the directory intent before creating either a v1 request key
      // or a persisted v2 command.
      clientMessageId: "start:validation",
    });
    if (!validIntent.success) {
      setError(
        copy.directoryLoadingError,
      );
      return;
    }
    // A clicked Start supersedes the mount-time capability probe. Give this
    // user action a fresh epoch before its first mutation so a late mount HEAD
    // response cannot roll back or restore over the interview being started.
    v2LifecycleEpochRef.current?.invalidateCurrent();
    const capabilityLifecycle = captureV2LifecycleLease();
    let operationLifecycle = capabilityLifecycle;
    if (!operationLifecycle.commit(() => {
      v2StartInFlightRef.current = true;
      setBusy((current) => operationLifecycle.isCurrent() ? true : current);
      setError((current) => operationLifecycle.isCurrent() ? "" : current);
    })) return;
    let discoveredSchemaVersion: TemplateCopilotStartSchemaVersion | null = null;
    try {
      const recovery = await discoverTemplateCopilotV2Recovery({
        lifecycle: capabilityLifecycle,
        discoverSchemaVersion: discoverTemplateCopilotStartSchemaVersion,
        releaseLoadedV2AfterRollback: releaseV2AfterRollback,
        loadPendingV2Start: () => pendingV2StartRef.current || loadPendingTemplateCopilotV2Start(),
        loadPendingV2Special: () => pendingV2SpecialRef.current || loadPendingTemplateCopilotV2Special(),
      });
      if (!recovery) return;
      discoveredSchemaVersion = recovery.schemaVersion;
      if (recovery.schemaVersion === 1) {
        // Complete rollback cleanup releases stale locks, including this shared
        // ref. Adopt the post-cleanup lifecycle and re-acquire only this
        // current legacy Start operation before POST.
        operationLifecycle = captureV2LifecycleLease();
        if (!operationLifecycle.commit(() => {
          v2StartInFlightRef.current = true;
          setBusy((current) => operationLifecycle.isCurrent() ? true : current);
        })) return;
      } else if (!operationLifecycle.isCurrent()) {
        return;
      }
      if (recovery.pendingSpecial) {
        installPendingV2Special(operationLifecycle, recovery.pendingSpecial);
        commitV2ReactState(operationLifecycle, setError, () => `${copy.temporaryAnswerError} ${copy.retrySameAnswer}`);
        return;
      }
      if (recovery.pendingStart) installPendingV2Start(operationLifecycle, recovery.pendingStart);
      const startIntent = selectTemplateCopilotStartIntent({
        businessUnitId,
        departmentName,
        locale: startLocale,
        questionLibraryVersion: getTemplateCopilotPreferredQuestionLibraryVersion(),
      }, recovery.pendingStart);
      const started = await executeTemplateCopilotStart({
        lifecycle: operationLifecycle,
        schemaVersion: discoveredSchemaVersion,
        intent: startIntent,
        // Capability discovery has already restored the v2 command. The v1
        // branch never invokes this callback.
        loadPendingV2: () => pendingV2StartRef.current,
        installPendingV2: (pending) => {
          installPendingV2Start(operationLifecycle, pending);
        },
        createKey: () => messageId("start"),
        request: async (request, expectedSchemaVersion) => {
          const response = await startApi("/api/template-authoring/copilot/sessions", {
            method: "POST",
            headers: {
              "X-Template-Copilot-Expected-Schema-Version": String(expectedSchemaVersion),
            },
            body: JSON.stringify(request),
          });
          if (!operationLifecycle.isCurrent()) return response;
          const responseLedger = response.ledger as { schemaVersion?: unknown } | undefined;
          const responseInterview = response.interview as TemplateCopilotV2InterviewState | undefined;
          if (
            expectedSchemaVersion === 2
            && (
              responseLedger?.schemaVersion !== 2
              || !responseInterview
              || responseInterview.state !== "question"
              || !responseInterview.nextQuestion?.prompt
            )
          ) {
            throw new Error(copy.startInterviewInvalid);
          }
          if (expectedSchemaVersion === 1 && responseLedger?.schemaVersion === 2) {
            const versionChanged = new Error(copy.requestError) as Error & { status?: number };
            versionChanged.status = 409;
            throw versionChanged;
          }
          return response;
        },
      });
      if (!started || !operationLifecycle.isCurrent()) return;
      const response = started.response;
      const responseLedger = response.ledger as { schemaVersion?: unknown } | undefined;
      const responseInterview = response.interview as TemplateCopilotV2InterviewState | undefined;
      const next = responseLedger?.schemaVersion === 2 ? {
        sessionId: String(response.sessionId),
        revision: Number(response.revision),
        status: String(response.status) as V2CopilotState["status"],
        ledger: response.ledger as TemplateCopilotV2Ledger,
        interview: responseInterview as TemplateCopilotV2InterviewState,
        specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [],
        projection: response.projection as TemplateCopilotV2AuthoritativeProjection,
        step4Enabled: response.step4Enabled === true,
        step5EditingEnabled: response.step5EditingEnabled === true,
        modeFlags: response.modeFlags as V2CopilotState["modeFlags"],
        structuredEditorFlags: structuredEditorFlagsFrom(response),
      } satisfies V2CopilotState : {
        sessionId: String(response.sessionId), revision: Number(response.revision),
        status: String(response.status) as V1CopilotState["status"], ledger: response.ledger as TemplateCopilotLedger,
      } satisfies V1CopilotState;
      if (isV2State(next)) {
        if (!installV2State(operationLifecycle, next)) return;
      } else {
        commitV2ReactState<CopilotState | null>(operationLifecycle, setState, () => next);
      }
      commitV2ReactState(operationLifecycle, setMessages, () => [
          createTemplateCopilotClientChatMessage({
            // V2 persists its initial prompt with the start command key.  Keeping
            // the same client ID prevents an ambiguous start/reload from showing
            // both an optimistic prompt and the durable prompt.
            clientMessageId: started.clientMessageId,
            role: "assistant",
            content: String(response.assistantMessage || (isV2State(next) ? next.interview.nextQuestion?.prompt : "") || ""),
          }),
        ]);
    } catch (caught) {
      if (!operationLifecycle.isCurrent()) return;
      commitV2ReactState(operationLifecycle, setError, () =>
        caught instanceof Error && caught.message === copy.startInterviewInvalid
          ? copy.startInterviewInvalid
          : discoveredSchemaVersion === 1
            ? errorMessage(caught)
            : copy.requestError,
      );
    } finally {
      operationLifecycle.commit(() => {
        v2StartInFlightRef.current = false;
        setBusy((current) => operationLifecycle.isCurrent() ? false : current);
      });
    }
  }

  async function reconcileV2(
    lifecycle: TemplateCopilotV2LifecycleLease,
    sessionId: string,
    command: TemplateCopilotV2PendingCommand,
    retainReplay = true,
  ) {
    if (!lifecycle.isCurrent()) return null;
    const response = await api(`/api/template-authoring/copilot/sessions/${sessionId}?messageDirection=tail&messageLimit=100`, { method: "GET" });
    if (!lifecycle.isCurrent()) return null;
    const saved = response.session as { revision?: unknown; status?: unknown; ledger?: unknown; interview?: unknown; messages?: unknown };
    if (!saved || (saved.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !saved.interview) throw new Error(copy.reloadInterviewError);
    const serverState = {
      sessionId,
      revision: Number(saved.revision),
      status: String(saved.status) as V2CopilotState["status"],
      ledger: saved.ledger as TemplateCopilotV2Ledger,
      interview: saved.interview as TemplateCopilotV2InterviewState,
      specialReview: Array.isArray((saved as { specialReview?: unknown }).specialReview) ? (saved as { specialReview: TemplateCopilotV2SpecialReviewItem[] }).specialReview : [],
      projection: (saved as { projection?: unknown }).projection as TemplateCopilotV2AuthoritativeProjection,
      step4Enabled: (saved as { step4Enabled?: unknown }).step4Enabled === true,
      step5EditingEnabled: (saved as { step5EditingEnabled?: unknown }).step5EditingEnabled === true,
      structuredEditorFlags: structuredEditorFlagsFrom(saved),
    } satisfies V2CopilotState;
    const authoritative = installV2State(lifecycle, serverState);
    if (!authoritative || !lifecycle.isCurrent()) return null;
    const authoritativeMessages = chatMessagesFromStored(saved.messages);
    const ledger = authoritative.ledger;
    const savedInterview = authoritative.interview;
    const reconciliation = applyTemplateCopilotV2Reconciliation({ command, currentPending: pendingV2Command, resolvedCommandKeys: resolvedV2CommandKeys.current, ledger });
    if (reconciliation.markResolved) {
      lifecycle.commit(() => {
        resolvedV2CommandKeys.current.add(command.idempotencyKey);
        if (activeV2CommandRef.current?.idempotencyKey === command.idempotencyKey) activeV2CommandRef.current = null;
        v2CommandDraftGenerationRef.current.delete(command.idempotencyKey);
        setPendingV2Command((current) => lifecycle.isCurrent() && current?.idempotencyKey === command.idempotencyKey ? null : current);
      });
    } else if (reconciliation.outcome === "replay_required" && retainReplay) {
      commitV2ReactState(lifecycle, setPendingV2Command, (current) => current === null || current.idempotencyKey === command.idempotencyKey ? command : current);
    }
    if (authoritativeMessages) {
      if (canReplaceTemplateCopilotV2Transcript({ installedRevision: authoritative.revision, snapshotRevision: serverState.revision, outcome: reconciliation.outcome })) {
        commitV2ReactState(lifecycle, setMessages, () => authoritativeMessages);
      } else {
        commitV2ReactState(lifecycle, setMessages, (current) => mergeChatMessages(current, authoritativeMessages));
      }
    }
    if (reconciliation.outcome === "superseded" || reconciliation.outcome === "conflict") {
      // This command is conclusively not the durable answer.  Do not leave a
      // retryable-looking optimistic bubble beside the newer server transcript.
      commitV2ReactState(lifecycle, setMessages, (current) => current.filter((message) => message.id !== command.idempotencyKey && message.id !== `${command.idempotencyKey}-assistant`));
      commitV2ReactState(lifecycle, setError, () => reconciliation.outcome === "conflict" ? copy.concurrentChangeConflict : copy.concurrentChangeSuperseded);
    }
    return { outcome: reconciliation.outcome, questionId: savedInterview.nextQuestion?.questionId, primaryDecisionId: savedInterview.nextQuestion?.primaryDecisionId };
  }

  /** Owner-scoped snapshot recovery for an extraction action whose mutation
   * response was lost or ambiguous. It installs only an authoritative v2
   * snapshot and is guarded by the same operation lease as the mutation. */
  async function reloadV2ExtractionReviewState(lifecycle: TemplateCopilotV2LifecycleLease, sessionId: string) {
    if (!lifecycle.isCurrent()) return null;
    const response = await api(`/api/template-authoring/copilot/sessions/${sessionId}?messageDirection=tail&messageLimit=100`, { method: "GET" });
    if (!lifecycle.isCurrent()) return null;
    const saved = response.session as { revision?: unknown; status?: unknown; ledger?: unknown; interview?: unknown; specialReview?: unknown } | undefined;
    if (!saved || (saved.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !saved.interview) throw new Error(copy.reloadInterviewError);
    return installV2State(lifecycle, {
      sessionId,
      revision: Number(saved.revision),
      status: String(saved.status) as V2CopilotState["status"],
      ledger: saved.ledger as TemplateCopilotV2Ledger,
      interview: saved.interview as TemplateCopilotV2InterviewState,
      specialReview: Array.isArray(saved.specialReview) ? saved.specialReview as TemplateCopilotV2SpecialReviewItem[] : [],
      projection: (saved as { projection?: unknown }).projection as TemplateCopilotV2AuthoritativeProjection,
      step4Enabled: (saved as { step4Enabled?: unknown }).step4Enabled === true,
      step5EditingEnabled: (saved as { step5EditingEnabled?: unknown }).step5EditingEnabled === true,
      structuredEditorFlags: structuredEditorFlagsFrom(saved),
    });
  }

  async function submitV2(
    answer: TemplateCopilotV2PendingCommand["answer"],
    onAccepted?: (command: TemplateCopilotV2PendingCommand, lifecycle: TemplateCopilotV2LifecycleLease) => void,
  ) {
    if (!state || !isV2State(state) || activeModeDisabled || busy || pendingV2SpecialRef.current || v2SubmitInFlightRef.current) return false;
    const lifecycle = captureV2LifecycleLease();
    let command: TemplateCopilotV2PendingCommand;
    try {
      command = nextTemplateCopilotV2PendingCommand({ pending: pendingV2Command, questionId: state.interview.nextQuestion?.questionId || "", primaryDecisionId: state.interview.nextQuestion?.primaryDecisionId || "", revision: state.revision, answer, createKey: () => messageId("turn") });
    } catch {
      commitV2ReactState(lifecycle, setError, () => copy.retryPreviousRequired);
      return false;
    }
    const isExactRetry = command === pendingV2Command;
    if (!lifecycle.commit(() => {
      v2SubmitInFlightRef.current = true;
      if (!isExactRetry) {
        activeV2CommandRef.current = command;
        v2CommandDraftGenerationRef.current.set(command.idempotencyKey, draftGenerationRef.current);
        setPendingV2Command((current) => lifecycle.isCurrent() ? command : current);
      }
      onAccepted?.(command, lifecycle);
      setBusy((current) => lifecycle.isCurrent() ? true : current);
      setError((current) => lifecycle.isCurrent() ? "" : current);
    })) return false;
    try {
      const response = await api(`/api/template-authoring/copilot/sessions/${state.sessionId}/answers`, { method: "POST", body: JSON.stringify({ expectedRevision: command.expectedRevision, idempotencyKey: command.idempotencyKey, answer: command.answer }) });
      if (!lifecycle.isCurrent()) return false;
      const interview = response.interview as TemplateCopilotV2InterviewState | undefined;
      if ((response.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !interview) throw new Error(copy.invalidInterviewUpdate);
      if (!installV2State(lifecycle, { sessionId: state.sessionId, revision: Number(response.revision), status: String(response.status) as V2CopilotState["status"], ledger: response.ledger as TemplateCopilotV2Ledger, interview, specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: response.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: response.step4Enabled === true, step5EditingEnabled: response.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(response) })) return false;
      lifecycle.commit(() => {
        resolvedV2CommandKeys.current.add(command.idempotencyKey);
        if (activeV2CommandRef.current?.idempotencyKey === command.idempotencyKey) activeV2CommandRef.current = null;
        v2CommandDraftGenerationRef.current.delete(command.idempotencyKey);
        setPendingV2Command((current) => lifecycle.isCurrent() && current?.idempotencyKey === command.idempotencyKey ? null : current);
      });
      const canonicalAssistantMessage = String(response.assistantMessage || interview.nextQuestion?.prompt || (interview.state === "complete" ? copy.interviewComplete : copy.interviewBlocked));
      commitV2ReactState(lifecycle, setMessages, (current) => current.some((message) => message.id === `${command.idempotencyKey}-assistant`)
        ? current
        : [...current, createTemplateCopilotClientChatMessage({ clientMessageId: command.idempotencyKey, role: "assistant", content: canonicalAssistantMessage })]);
    } catch (caught) {
      if (!lifecycle.isCurrent()) return false;
      const status = templateCopilotApiErrorStatus(caught);
      if (status === 404 && templateCopilotApiErrorCode(caught) === "v2_unavailable") {
        const rollback = releaseV2AfterRollback();
        if (rollback.released) {
          commitV2ReactState(rollback.lifecycle, setError, () => copy.v2RollbackNotice);
        }
        return false;
      }
      const failure = resolveTemplateCopilotV2Failure({ status, command, currentPending: pendingV2Command });
      if (!failure.shouldReconcile) {
        // A definite non-409 client error is known not to have committed.
        // Never strand an invalid immutable payload; restore it for editing.
        const ownsDraft = canRestoreTemplateCopilotV2Draft({ command, activeCommand: activeV2CommandRef.current, commandDraftGeneration: v2CommandDraftGenerationRef.current.get(command.idempotencyKey), currentDraftGeneration: draftGenerationRef.current });
        lifecycle.commit(() => {
          resolvedV2CommandKeys.current.add(command.idempotencyKey);
          v2CommandDraftGenerationRef.current.delete(command.idempotencyKey);
          setPendingV2Command((current) => lifecycle.isCurrent() && current?.idempotencyKey === command.idempotencyKey ? null : current);
          if (failure.restoreText !== null && ownsDraft) {
            activeV2CommandRef.current = null;
            setDraft((current) => lifecycle.isCurrent() ? failure.restoreText! : current);
          }
          setMessages((current) => lifecycle.isCurrent()
            ? current.filter((message) => message.id !== command.idempotencyKey && message.id !== `${command.idempotencyKey}-assistant`)
            : current);
          setError((current) => lifecycle.isCurrent() ? copy.validationAnswerError : current);
        });
        return false;
      }
      // The server may have committed just before a network/ambiguous response
      // was lost. Keep this exact command; never apply it to a later question.
      let recovered: { outcome: "committed" | "replay_required" | "already_committed" | "superseded" | "conflict"; questionId?: string; primaryDecisionId?: string } | null = null;
      if (templateCopilotV2FailureNeedsReconcile(status)) {
        try {
          recovered = await reconcileV2(lifecycle, state.sessionId, command, status !== 409);
        } catch {
          if (!lifecycle.isCurrent()) return false;
          // The exact immutable command remains retryable.
        }
      }
      if (!lifecycle.isCurrent()) return false;
      if (status === 409 && recovered?.outcome === "replay_required") {
        const conflict = resolveTemplateCopilotV2ExplicitConflict({ command, currentPending: pendingV2Command, currentQuestionId: recovered.questionId, currentPrimaryDecisionId: recovered.primaryDecisionId });
        const ownsDraft = canRestoreTemplateCopilotV2Draft({ command, activeCommand: activeV2CommandRef.current, commandDraftGeneration: v2CommandDraftGenerationRef.current.get(command.idempotencyKey), currentDraftGeneration: draftGenerationRef.current });
        lifecycle.commit(() => {
          resolvedV2CommandKeys.current.add(command.idempotencyKey);
          if (activeV2CommandRef.current?.idempotencyKey === command.idempotencyKey) activeV2CommandRef.current = null;
          v2CommandDraftGenerationRef.current.delete(command.idempotencyKey);
          setPendingV2Command((current) => lifecycle.isCurrent() && current?.idempotencyKey === command.idempotencyKey ? null : current);
          setMessages((current) => lifecycle.isCurrent()
            ? current.filter((message) => message.id !== command.idempotencyKey && message.id !== `${command.idempotencyKey}-assistant`)
            : current);
          if (conflict.restoreText !== null && ownsDraft) {
            setDraft((current) => lifecycle.isCurrent() ? conflict.restoreText! : current);
          }
          setError((current) => lifecycle.isCurrent() ? (conflict.canRebase ? copy.staleAnswerRebased : copy.staleAnswerNeedsReview) : current);
        });
        return false;
      }
      if (recovered?.outcome !== "committed" && recovered?.outcome !== "already_committed" && recovered?.outcome !== "superseded" && recovered?.outcome !== "conflict") {
        commitV2ReactState(lifecycle, setError, () => `${copy.temporaryAnswerError} ${copy.retrySameAnswer}`);
      }
    } finally {
      lifecycle.commit(() => {
        v2SubmitInFlightRef.current = false;
        setBusy((current) => lifecycle.isCurrent() ? false : current);
      });
    }
    return lifecycle.isCurrent();
  }

  async function confirmExtractionCandidate(candidateId: string) {
    if (!state || !isV2State(state) || busy) return;
    const attemptedCandidate = state.ledger.extractionEvidence.candidates.find((candidate) => candidate.candidateId === candidateId);
    const factId = attemptedCandidate?.factId;
    const attemptedValue = attemptedCandidate && stableExtractionRecoveryValue(attemptedCandidate.value);
    const lifecycle = captureV2LifecycleLease();
    if (!lifecycle.commit(() => { setBusy(true); setError(""); })) return;
    try {
      const response = await api(`/api/template-authoring/copilot/sessions/${state.sessionId}/extraction-candidates`, { method: "POST", body: JSON.stringify({ candidateId, expectedRevision: state.revision, idempotencyKey: messageId("extract-confirm") }) });
      if (!lifecycle.isCurrent()) return;
      const interview = response.interview as TemplateCopilotV2InterviewState | undefined;
      if ((response.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !interview) throw new Error(copy.invalidInterviewUpdate);
      installV2State(lifecycle, { sessionId: state.sessionId, revision: Number(response.revision), status: String(response.status) as V2CopilotState["status"], ledger: response.ledger as TemplateCopilotV2Ledger, interview, specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: response.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: response.step4Enabled === true, step5EditingEnabled: response.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(response) });
    } catch {
      if (!lifecycle.isCurrent()) return;
      try {
        const recovered = await reloadV2ExtractionReviewState(lifecycle, state.sessionId);
        if (!lifecycle.isCurrent()) return;
        const candidate = recovered?.ledger.extractionEvidence.candidates.find((item) => item.candidateId === candidateId);
        const confirmedByHistory = Boolean(factId && attemptedValue && recovered?.ledger.extractionEvidence.history.some((item) => item.kind === "candidate_confirmed" && item.candidateId === candidateId && item.factId === factId && item.incoming?.candidateId === candidateId && stableExtractionRecoveryValue(item.incoming.value) === attemptedValue && stableExtractionRecoveryValue(recovered.ledger.facts[factId].canonicalValue) === attemptedValue));
        if (candidate?.state === "confirmed" || confirmedByHistory) return;
        if (factId && recovered?.ledger.facts[factId].status === "committed") {
          commitV2ReactState(lifecycle, setError, () => (locale === "zh-Hant" ? "另一個工作階段已更新此資料。請審閱目前資料後再處理此建議。" : locale === "zh-Hans" ? "另一个会话已更新此信息。请审核当前信息后再处理此建议。" : "Another session updated this fact. Review the current information before acting on this suggestion.") as string);
          return;
        }
      } catch {
        if (!lifecycle.isCurrent()) return;
      }
      if (!lifecycle.isCurrent()) return;
      commitV2ReactState(lifecycle, setError, () => (locale === "zh-Hant" ? "未能確認此建議資料。請重新載入後再試。" : locale === "zh-Hans" ? "无法确认此建议信息。请重新加载后重试。" : "This suggestion could not be confirmed. Reload and try again.") as string);
    } finally {
      lifecycle.commit(() => setBusy((current) => lifecycle.isCurrent() ? false : current));
    }
  }
  async function resolveExtractionConflict(conflictId: string, choice: "keep_existing" | "commit_incoming") {
    if (!state || !isV2State(state) || busy) return;
    const lifecycle = captureV2LifecycleLease();
    if (!lifecycle.commit(() => { setBusy(true); setError(""); })) return;
    try {
      const response = await api(`/api/template-authoring/copilot/sessions/${state.sessionId}/extraction-conflicts`, { method: "POST", body: JSON.stringify({ conflictId, choice, rationale: extractionRationale.trim() || undefined, expectedRevision: state.revision, idempotencyKey: messageId("extract-resolve") }) });
      if (!lifecycle.isCurrent()) return;
      const interview = response.interview as TemplateCopilotV2InterviewState | undefined;
      if ((response.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !interview) throw new Error(copy.invalidInterviewUpdate);
      installV2State(lifecycle, { sessionId: state.sessionId, revision: Number(response.revision), status: String(response.status) as V2CopilotState["status"], ledger: response.ledger as TemplateCopilotV2Ledger, interview, specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: response.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: response.step4Enabled === true, step5EditingEnabled: response.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(response) });
    } catch {
      if (!lifecycle.isCurrent()) return;
      try {
        const recovered = await reloadV2ExtractionReviewState(lifecycle, state.sessionId);
        if (!lifecycle.isCurrent()) return;
        if (recovered?.ledger.extractionEvidence.conflicts.some((item) => item.conflictId === conflictId && item.state === "closed")) return;
      } catch {
        if (!lifecycle.isCurrent()) return;
      }
      if (!lifecycle.isCurrent()) return;
      commitV2ReactState(lifecycle, setError, () => (locale === "zh-Hant" ? "未能處理此差異。請重新載入後再試。" : locale === "zh-Hans" ? "无法处理此差异。请重新加载后重试。" : "This conflict could not be resolved. Reload and try again.") as string);
    }
    finally { lifecycle.commit(() => setBusy((current) => lifecycle.isCurrent() ? false : current)); }
  }

  function releaseV2AfterRollback() {
    // The same complete release is used by mount/Start capability rollback and
    // explicit v2 endpoint rollback. Its loaded marker makes clean v1 a no-op.
    let cleanupLifecycle = captureV2LifecycleLease();
    const released = releaseTemplateCopilotV2ClientAfterRollback({
      hasLoadedV2: () => v2ClientResidueRef.current,
      advanceLifecycleEpoch: () => {
        // releaseTemplateCopilotV2ClientAfterRollback guarantees that this is
        // the first loaded-v2 cleanup action.
        v2LifecycleEpochRef.current!.invalidateCurrent();
        cleanupLifecycle = captureV2LifecycleLease();
      },
      markReleased: () => {
        cleanupLifecycle.commit(() => {
          v2ClientResidueRef.current = false;
        });
      },
      clearPendingStart: () => installPendingV2Start(cleanupLifecycle, null),
      clearPendingSpecial: () => installPendingV2Special(cleanupLifecycle, null),
      clearPendingAnswer: () => {
        cleanupLifecycle.commit(() => {
          activeV2CommandRef.current = null;
          pendingModeCommandRef.current = null;
          setPendingV2Command((current) => cleanupLifecycle.isCurrent() ? null : current);
          setPendingModeCommand((current) => cleanupLifecycle.isCurrent() ? null : current);
          persistPendingTemplateCopilotV2Mode(null);
        });
      },
      clearCommandTracking: () => {
        cleanupLifecycle.commit(() => {
          draftGenerationRef.current = 0;
          v2CommandDraftGenerationRef.current.clear();
          resolvedV2CommandKeys.current.clear();
        });
      },
      clearInterviewAndMessages: () => {
        cleanupLifecycle.commit(() => {
          latestV2StateRef.current = null;
          setState((current) => cleanupLifecycle.isCurrent() && current && isV2State(current) ? null : current);
          setMessages((current) => cleanupLifecycle.isCurrent() ? [] : current);
          setDraft((current) => cleanupLifecycle.isCurrent() ? "" : current);
          setNotApplicableReason((current) => cleanupLifecycle.isCurrent() ? "" : current);
          setDraftReview((current) => cleanupLifecycle.isCurrent() ? null : current);
          setReviewDirty((current) => cleanupLifecycle.isCurrent() ? false : current);
          setError((current) => cleanupLifecycle.isCurrent() ? "" : current);
          if (fileRef.current) fileRef.current.value = "";
        });
      },
      clearLocks: () => {
        cleanupLifecycle.commit(() => {
          v2SubmitInFlightRef.current = false;
          v2SpecialInFlightRef.current = false;
          v2StartInFlightRef.current = false;
          setBusy((current) => cleanupLifecycle.isCurrent() ? false : current);
        });
      },
    });
    return { released, lifecycle: cleanupLifecycle } as const;
  }

  async function reconcileV2Special(
    lifecycle: TemplateCopilotV2LifecycleLease,
    sessionId: string,
    command: TemplateCopilotV2PendingSpecialCommand,
    transportStatus: number | null,
  ) {
    if (!lifecycle.isCurrent()) return null;
    let outcome: "committed" | "missing" | "idempotency_conflict" | "not_found" | "v2_unavailable" | "unavailable" = "unavailable";
    try {
      const reconciled = await api(`/api/template-authoring/copilot/sessions/${sessionId}/special/reconcile`, { method: "POST", body: JSON.stringify({ expectedRevision: command.expectedRevision, idempotencyKey: command.idempotencyKey, command: command.command }) });
      if (!lifecycle.isCurrent()) return null;
      outcome = ["committed", "missing", "idempotency_conflict", "not_found"].includes(String(reconciled.outcome)) ? String(reconciled.outcome) as typeof outcome : "unavailable";
      if ((reconciled.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion === 2 && reconciled.interview) {
        if (!installV2State(lifecycle, { sessionId, revision: Number(reconciled.revision), status: String(reconciled.status) as V2CopilotState["status"], ledger: reconciled.ledger as TemplateCopilotV2Ledger, interview: reconciled.interview as TemplateCopilotV2InterviewState, specialReview: Array.isArray(reconciled.specialReview) ? reconciled.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: reconciled.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: reconciled.step4Enabled === true, step5EditingEnabled: reconciled.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(reconciled) })) return null;
      }
      const reconciledMessages = chatMessagesFromStored(reconciled.messages);
      if (reconciledMessages) {
        commitV2ReactState(lifecycle, setMessages, (current) => mergeChatMessages(current, reconciledMessages));
      }
      if ((outcome as string) === "committed") {
        try {
          const snapshot = await api(`/api/template-authoring/copilot/sessions/${sessionId}?messageDirection=tail&messageLimit=100`, { method: "GET" });
          if (!lifecycle.isCurrent()) return null;
          const saved = snapshot.session as { revision?: unknown; status?: unknown; ledger?: unknown; interview?: unknown; specialReview?: unknown; projection?: unknown; step4Enabled?: unknown; step5EditingEnabled?: unknown; messages?: unknown };
          if ((saved?.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion === 2 && saved.interview) {
            if (!installV2State(lifecycle, { sessionId, revision: Number(saved.revision), status: String(saved.status) as V2CopilotState["status"], ledger: saved.ledger as TemplateCopilotV2Ledger, interview: saved.interview as TemplateCopilotV2InterviewState, specialReview: Array.isArray(saved.specialReview) ? saved.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: saved.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: saved.step4Enabled === true, step5EditingEnabled: saved.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(saved) })) return null;
            const authoritativeMessages = chatMessagesFromStored(saved.messages);
            if (authoritativeMessages) {
              commitV2ReactState(lifecycle, setMessages, (current) => mergeChatMessages(current, authoritativeMessages));
            }
          }
        } catch {
          if (!lifecycle.isCurrent()) return null;
          // The exact receipt is terminal even if transcript refresh fails.
        }
      }
    } catch (caught) {
      if (!lifecycle.isCurrent()) return null;
      // Only an explicit route/flag 404 proves that the v2 recovery contract
      // has been rolled back. Network, timeout, and 5xx failures stay pending.
      outcome = templateCopilotApiErrorStatus(caught) === 404
        && templateCopilotApiErrorCode(caught) === "v2_unavailable"
        ? "v2_unavailable"
        : "unavailable";
    }
    if (!lifecycle.isCurrent()) return null;
    const resolution = resolveTemplateCopilotV2SpecialReconciliation({ transportStatus, outcome, command, currentPending: pendingV2SpecialRef.current });
    installPendingV2Special(lifecycle, resolution.pending);
    if (resolution.result === "committed") commitV2ReactState(lifecycle, setError, () => "");
    else if (resolution.result === "stale") commitV2ReactState(lifecycle, setError, () => copy.staleAnswerNeedsReview);
    else if (resolution.result === "conflict") commitV2ReactState(lifecycle, setError, () => copy.concurrentChangeConflict);
    else if (resolution.result === "not_found") commitV2ReactState(lifecycle, setError, () => copy.reloadInterviewError);
    else if (resolution.result === "v2_unavailable") {
      const rollback = releaseV2AfterRollback();
      if (rollback.released) {
        commitV2ReactState(rollback.lifecycle, setError, () => copy.v2RollbackNotice);
      }
    }
    else commitV2ReactState(lifecycle, setError, () => `${copy.temporaryAnswerError} ${copy.retrySameAnswer}`);
    return resolution;
  }

  async function submitV2Special(requested: TemplateCopilotV2SpecialCommand) {
    if (!state || !isV2State(state) || activeModeDisabled || busy || pendingV2Command || activeV2CommandRef.current || v2SubmitInFlightRef.current || v2SpecialInFlightRef.current) return;
    const lifecycle = captureV2LifecycleLease();
    let command: TemplateCopilotV2PendingSpecialCommand;
    try {
      command = nextTemplateCopilotV2PendingSpecialCommand({ pending: pendingV2SpecialRef.current, sessionId: state.sessionId, revision: state.revision, command: requested, createKey: () => messageId("special") });
    } catch {
      commitV2ReactState(lifecycle, setError, () => copy.retryPreviousRequired);
      return;
    }
    if (!lifecycle.commit(() => {
      v2SpecialInFlightRef.current = true;
      if (command !== pendingV2SpecialRef.current) installPendingV2Special(lifecycle, command);
      setBusy((current) => lifecycle.isCurrent() ? true : current);
      setError((current) => lifecycle.isCurrent() ? "" : current);
    })) return;
    try {
      const response = await api(`/api/template-authoring/copilot/sessions/${state.sessionId}/special`, { method: "POST", body: JSON.stringify({ expectedRevision: command.expectedRevision, idempotencyKey: command.idempotencyKey, command: command.command }) });
      if (!lifecycle.isCurrent()) return;
      const interview = response.interview as TemplateCopilotV2InterviewState | undefined;
      if ((response.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !interview) throw new Error(copy.invalidInterviewUpdate);
      if (!installV2State(lifecycle, { sessionId: state.sessionId, revision: Number(response.revision), status: String(response.status) as V2CopilotState["status"], ledger: response.ledger as TemplateCopilotV2Ledger, interview, specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [], projection: response.projection as TemplateCopilotV2AuthoritativeProjection, step4Enabled: response.step4Enabled === true, step5EditingEnabled: response.step5EditingEnabled === true, structuredEditorFlags: structuredEditorFlagsFrom(response) })) return;
      installPendingV2Special(lifecycle, pendingV2SpecialRef.current?.idempotencyKey === command.idempotencyKey ? null : pendingV2SpecialRef.current);
      // These are confirmed, durable transcript rows.  A retry keeps the
      // stable command/role IDs so an eventual authoritative history merge
      // cannot duplicate either turn.
      commitV2ReactState(lifecycle, setMessages, (current) => {
        const authoritative = parseTemplateCopilotClientChatMessages(response.messages);
        if (authoritative) return mergeTemplateCopilotClientChatMessages(current, authoritative);
        const createdAt = new Date().toISOString();
        const user = createTemplateCopilotClientChatMessage({ clientMessageId: command.idempotencyKey, role: "user", content: String(response.userMessage || ""), createdAt });
        const assistant = createTemplateCopilotClientChatMessage({ clientMessageId: command.idempotencyKey, role: "assistant", content: String(response.assistantMessage || ""), createdAt });
        return mergeTemplateCopilotClientChatMessages(current, [user, assistant]);
      });
      commitV2ReactState(lifecycle, setNotApplicableReason, () => "");
    } catch (caught) {
      if (!lifecycle.isCurrent()) return;
      const status = templateCopilotApiErrorStatus(caught);
      if (status === 404 && templateCopilotApiErrorCode(caught) === "v2_unavailable") {
        const rollback = releaseV2AfterRollback();
        if (rollback.released) {
          commitV2ReactState(rollback.lifecycle, setError, () => copy.v2RollbackNotice);
        }
      } else if (status === 409 || status === null || status >= 500) {
        await reconcileV2Special(lifecycle, state.sessionId, command, status);
        if (!lifecycle.isCurrent()) return;
      }
      else {
        installPendingV2Special(lifecycle, pendingV2SpecialRef.current?.idempotencyKey === command.idempotencyKey ? null : pendingV2SpecialRef.current);
        commitV2ReactState(lifecycle, setError, () => copy.requestError);
      }
    } finally {
      lifecycle.commit(() => {
        v2SpecialInFlightRef.current = false;
        setBusy((current) => lifecycle.isCurrent() ? false : current);
      });
    }
  }

  async function recoverStoredV2Special() {
    const command = pendingV2SpecialRef.current;
    if (!command || busy || v2SpecialInFlightRef.current) return;
    const lifecycle = captureV2LifecycleLease();
    if (!lifecycle.commit(() => {
      v2SpecialInFlightRef.current = true;
      setBusy((current) => lifecycle.isCurrent() ? true : current);
      setError((current) => lifecycle.isCurrent() ? "" : current);
    })) return;
    try {
      await reconcileV2Special(lifecycle, command.sessionId, command, null);
      if (!lifecycle.isCurrent()) return;
    } finally {
      lifecycle.commit(() => {
        v2SpecialInFlightRef.current = false;
        setBusy((current) => lifecycle.isCurrent() ? false : current);
      });
    }
  }

  async function loadSimilarTemplates() {
    if (!state || !isV2State(state) || busy) return;
    try {
      const response = await api(`/api/template-authoring/copilot/sessions/${state.sessionId}/modes`, { method: "GET" });
      const versions = Array.isArray(response.versions) ? response.versions : [];
      setSimilarTemplates(versions.filter((item): item is { versionId: string; versionNumber: number; templateKey: string; name: string } => Boolean(item) && typeof item === "object" && typeof (item as { versionId?: unknown }).versionId === "string" && typeof (item as { versionNumber?: unknown }).versionNumber === "number" && typeof (item as { name?: unknown }).name === "string"));
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function switchV2Mode(mode: TemplateCopilotV2AuthoringMode, sourceVersionId?: string) {
    if (!state || !isV2State(state) || busy) return;
    try {
      const lifecycle = captureV2LifecycleLease();
      if (activeModeDisabled) installPendingModeCommand(lifecycle, null);
      const pending = nextTemplateCopilotV2PendingModeCommand({
        pending: !activeModeDisabled && pendingModeCommandRef.current?.sessionId === state.sessionId ? pendingModeCommandRef.current : null,
        requested: {
          sessionId: state.sessionId,
          expectedRevision: state.revision,
          idempotencyKey: messageId("mode"),
          operation: { kind: "switch_mode", mode, ...(sourceVersionId ? { sourceVersionId } : {}) },
        },
      });
      installPendingModeCommand(lifecycle, pending);
      await executePendingModeCommand(pending);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function submitDescribeEverything(message: string, mode: "describe_everything" | "similar_template") {
    if (!state || !isV2State(state) || activeModeDisabled || busy) return;
    try {
      const pending = nextTemplateCopilotV2PendingModeCommand({
        pending: pendingModeCommandRef.current?.sessionId === state.sessionId ? pendingModeCommandRef.current : null,
        requested: {
          sessionId: state.sessionId,
          expectedRevision: state.revision,
          idempotencyKey: messageId(mode === "similar_template" ? "similar-differences" : "describe"),
          operation: { kind: "describe", mode, message },
        },
      });
      const lifecycle = captureV2LifecycleLease();
      installPendingModeCommand(lifecycle, pending);
      await executePendingModeCommand(pending);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function executePendingModeCommand(command: TemplateCopilotV2PendingModeCommand) {
    if (!state || !isV2State(state) || busy || state.sessionId !== command.sessionId) return;
    if (command.operation.kind === "document") {
      fileRef.current?.click();
      return;
    }
    const lifecycle = captureV2LifecycleLease();
    if (!lifecycle.commit(() => { setBusy(true); setError(""); })) return;
    try {
      const request = templateCopilotV2PendingModeCommandRequest(command);
      const response = await api(`/api/template-authoring/copilot/sessions/${command.sessionId}/${request.path}`, {
        method: "POST",
        body: JSON.stringify(request.body),
      });
      const interview = response.interview as TemplateCopilotV2InterviewState | undefined;
      if ((response.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !interview) throw new Error(copy.invalidInterviewUpdate);
      installV2State(lifecycle, {
        sessionId: command.sessionId,
        revision: Number(response.revision),
        status: String(response.status) as V2CopilotState["status"],
        ledger: response.ledger as TemplateCopilotV2Ledger,
        interview,
        specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [],
        projection: response.projection as TemplateCopilotV2AuthoritativeProjection,
        step4Enabled: response.step4Enabled === true,
        step5EditingEnabled: response.step5EditingEnabled === true,
        structuredEditorFlags: structuredEditorFlagsFrom(response),
        modeFlags: response.modeFlags as V2CopilotState["modeFlags"],
        modeState: response.modeState as TemplateCopilotV2ModeState | undefined,
      });
      if (command.operation.kind === "describe") {
        commitV2ReactState(lifecycle, setDraft, () => "");
        const authoritative = parseTemplateCopilotClientChatMessages(response.messages);
        if (authoritative) {
          commitV2ReactState(lifecycle, setMessages, (current) => mergeTemplateCopilotClientChatMessages(current, authoritative));
        }
      } else {
        const selectedSourceVersionId = command.operation.sourceVersionId || "";
        commitV2ReactState(lifecycle, setSelectedSimilarVersionId, () => selectedSourceVersionId);
      }
      installPendingModeCommand(lifecycle, null);
      if (response.fallback === "guided") {
        commitV2ReactState(lifecycle, setError, () => String(response.message || templateCopilotV2ModeCopy(locale).fallback));
      }
    } catch (caught) {
      if (!lifecycle.isCurrent()) return;
      const status = templateCopilotApiErrorStatus(caught);
      const errorCode = templateCopilotApiErrorCode(caught);
      const disposition = templateCopilotV2PendingModeCommandFailureDisposition(status, errorCode);
      if (status === 404 && errorCode === "v2_unavailable") {
        const rollback = releaseV2AfterRollback();
        if (rollback.released) commitV2ReactState(rollback.lifecycle, setError, () => copy.v2RollbackNotice);
      } else if (disposition === "reload") {
        try {
          const recovered = await reloadV2ExtractionReviewState(lifecycle, command.sessionId);
          if (recovered) {
            installPendingModeCommand(lifecycle, null);
            commitV2ReactState(lifecycle, setError, () => copy.concurrentChangeSuperseded);
          }
        } catch {
          commitV2ReactState(lifecycle, setError, () => copy.reloadInterviewError);
        }
      } else if (disposition === "clear") {
        installPendingModeCommand(lifecycle, null);
        commitV2ReactState(lifecycle, setError, () => errorMessage(caught));
      } else {
        commitV2ReactState(lifecycle, setError, () => `${errorMessage(caught)} ${copy.retrySameAnswer}`);
      }
    }
    finally { lifecycle.commit(() => setBusy((current) => lifecycle.isCurrent() ? false : current)); }
  }

  async function send() {
    const message = draft.trim();
    if (!state || !message || busy) return;
    if (isV2State(state) && activeModeDisabled) return;
    const id = messageId("turn");
    if (isV2State(state)) {
      if (state.modeState?.mode === "describe_everything" || state.modeState?.mode === "similar_template") {
        if (templateCopilotUnicodeCodePointCount(message) > 80_000) { setError(modeUiCopy.tooLong); return; }
        void submitDescribeEverything(message, state.modeState.mode);
        return;
      }
      if (activeModeDisabled) return;
      if (v2InputMode !== "answerable") return;
      if (templateCopilotUnicodeCodePointCount(message) > 8_000) {
        setError(copy.answerTooLong);
        return;
      }
      const choice = state.interview.nextQuestion?.answerType === "choice"
        ? state.interview.nextQuestion.options?.find((option) => option.optionId.toLocaleLowerCase("en") === message.toLocaleLowerCase("en") || option.label.toLocaleLowerCase(locale) === message.toLocaleLowerCase(locale))
        : undefined;
      if (state.interview.nextQuestion?.answerType === "choice" && (!v2PlainTypedFallback || !choice)) {
        setError(copy.chooseListedOption);
        return;
      }
      const answer = choice ? { kind: "choice" as const, optionId: choice.optionId } : { kind: "text" as const, text: message };
      void submitV2(answer, (command, lifecycle) => {
        lifecycle.commit(() => {
          draftGenerationRef.current += 1;
        });
        commitV2ReactState(lifecycle, setDraft, () => "");
        commitV2ReactState(lifecycle, setMessages, (current) => current.some((item) => item.id === command.idempotencyKey)
          ? current
          : [...current, createTemplateCopilotClientChatMessage({ clientMessageId: command.idempotencyKey, role: "user", content: choice?.label || message })]);
      });
      return;
    }
    draftGenerationRef.current += 1;
    setDraft("");
    setMessages((current) => [
      ...current,
      createTemplateCopilotClientChatMessage({ clientMessageId: id, role: "user", content: message }),
    ]);
    setBusy(true);
    setError("");
    try {
      const response = await legacyApi(
        `/api/template-authoring/copilot/sessions/${state.sessionId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: state.revision,
            message,
            clientMessageId: id,
          }),
        },
      );
      setState((current) =>
        current
          ? {
              ...current,
              revision: Number(response.revision),
              status: String(response.status) as CopilotState["status"],
              ledger: response.ledger as TemplateCopilotLedger,
            }
          : current,
      );
      setMessages((current) => [
        ...current,
        createTemplateCopilotClientChatMessage({
          clientMessageId: id,
          role: "assistant",
          content: String(response.assistantMessage),
        }),
      ]);
    } catch (caught) {
      if (isV2State(state)) setDraft(message);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (
      !state
      || busy
      || (isV2State(state) && !v2ModeContract?.allowRequirementsDocument)
    ) return;
    const lifecycle = isV2State(state) ? captureV2LifecycleLease() : null;
    setBusy(true);
    setError("");
    try {
      let documentCommandId = messageId("document");
      if (isV2State(state)) {
        const documentIdentity = await templateCopilotDocumentIdentity(file);
        const pending = nextTemplateCopilotV2PendingModeCommand({
          pending: pendingModeCommandRef.current?.sessionId === state.sessionId ? pendingModeCommandRef.current : null,
          requested: {
            sessionId: state.sessionId,
            expectedRevision: state.revision,
            idempotencyKey: documentCommandId,
            operation: { kind: "document", ...documentIdentity },
          },
        });
        if (!lifecycle?.isCurrent()) return;
        installPendingModeCommand(lifecycle, pending);
        documentCommandId = pending.idempotencyKey;
      }
      const form = new FormData();
      form.set("file", file);
      form.set("expectedRevision", String(isV2State(state) && pendingModeCommandRef.current?.idempotencyKey === documentCommandId ? pendingModeCommandRef.current.expectedRevision : state.revision));
      form.set("clientMessageId", documentCommandId);
      const response = await (isV2State(state) ? api : legacyApi)(
        `/api/template-authoring/copilot/sessions/${state.sessionId}/documents`,
        { method: "POST", body: form },
      );
      if (isV2State(state)) {
        const interview = response.interview as TemplateCopilotV2InterviewState | undefined;
        if ((response.ledger as { schemaVersion?: unknown } | undefined)?.schemaVersion !== 2 || !interview || !lifecycle) throw new Error(copy.invalidInterviewUpdate);
        installV2State(lifecycle, {
          sessionId: state.sessionId,
          revision: Number(response.revision),
          status: String(response.status) as V2CopilotState["status"],
          ledger: response.ledger as TemplateCopilotV2Ledger,
          interview,
          specialReview: Array.isArray(response.specialReview) ? response.specialReview as TemplateCopilotV2SpecialReviewItem[] : [],
          projection: response.projection as TemplateCopilotV2AuthoritativeProjection,
          step4Enabled: response.step4Enabled === true,
          step5EditingEnabled: response.step5EditingEnabled === true,
          structuredEditorFlags: structuredEditorFlagsFrom(response),
          modeFlags: response.modeFlags as V2CopilotState["modeFlags"],
          modeState: response.modeState as TemplateCopilotV2ModeState | undefined,
        });
        if (response.fallback === "guided" || response.outcome === "guided_fallback") {
          commitV2ReactState(lifecycle, setError, () => String(response.message || templateCopilotV2ModeCopy(locale).fallback));
        }
        installPendingModeCommand(lifecycle, null);
      } else {
        setState((current) =>
          current
            ? {
                ...current,
                revision: Number(response.revision),
                ledger: response.ledger as TemplateCopilotLedger,
              }
            : current,
        );
      }
      const authoritative = isV2State(state)
        ? parseTemplateCopilotClientChatMessages(response.messages)
        : null;
      const createdAt = new Date().toISOString();
      const uploadedMessages = authoritative || [
          createTemplateCopilotClientChatMessage({
            clientMessageId: documentCommandId,
            role: "user",
            content: `Uploaded ${file.name}`,
            createdAt,
          }),
          createTemplateCopilotClientChatMessage({
            clientMessageId: documentCommandId,
            role: "assistant",
            content: typeof response.assistantMessage === "string"
              ? response.assistantMessage
              : typeof response.message === "string"
                ? response.message
                : "",
            createdAt,
          }),
        ].filter((message) => message.content);
      if (lifecycle) {
        commitV2ReactState(lifecycle, setMessages, (current) => mergeTemplateCopilotClientChatMessages(current, uploadedMessages));
      } else {
        setMessages((current) => mergeTemplateCopilotClientChatMessages(current, uploadedMessages));
      }
    } catch (caught) {
      if (!lifecycle || lifecycle.isCurrent()) {
        const errorCode = templateCopilotApiErrorCode(caught);
        const status = templateCopilotApiErrorStatus(caught);
        const disposition = templateCopilotV2PendingModeCommandFailureDisposition(status, errorCode);
        if (lifecycle && status === 404 && errorCode === "v2_unavailable") {
          const rollback = releaseV2AfterRollback();
          if (rollback.released) commitV2ReactState(rollback.lifecycle, setError, () => copy.v2RollbackNotice);
          return;
        }
        if (lifecycle && disposition === "reload") {
          try {
            const recovered = await reloadV2ExtractionReviewState(lifecycle, state.sessionId);
            if (recovered) {
              installPendingModeCommand(lifecycle, null);
              setError(copy.concurrentChangeSuperseded);
            }
          } catch {
            setError(copy.reloadInterviewError);
          }
          return;
        }
        if (lifecycle && disposition === "clear") {
          installPendingModeCommand(lifecycle, null);
        }
        if (errorCode === "too_many_documents") {
          setError(modeUiCopy.documentLimit);
          return;
        }
        const retryHelp = lifecycle && pendingModeCommandRef.current?.operation.kind === "document"
          ? (locale === "zh-Hant" ? " 請重新選擇同一檔案，以安全檢查或重試。" : locale === "zh-Hans" ? " 请重新选择同一文件，以安全检查或重试。" : " Reselect the same file to safely check or retry.")
          : "";
        setError(`${errorMessage(caught)}${retryHelp}`);
      }
    } finally {
      if (lifecycle) lifecycle.commit(() => setBusy((current) => lifecycle.isCurrent() ? false : current));
      else setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function createDraft() {
    if (!state || state.status !== "ready" || busy) return;
    const sourceState = state;
    const lifecycle = isV2State(sourceState) ? captureV2LifecycleLease() : null;
    if (lifecycle) {
      if (!lifecycle.commit(() => {
        setBusy((current) => lifecycle.isCurrent() ? true : current);
        setError((current) => lifecycle.isCurrent() ? "" : current);
      })) return;
    } else {
      setBusy(true);
      setError("");
    }
    try {
      const response = await legacyApi(
        `/api/template-authoring/copilot/sessions/${sourceState.sessionId}/create-draft`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: sourceState.revision,
            idempotencyKey: messageId("create-draft"),
          }),
        },
      );
      if (lifecycle && !lifecycle.isCurrent()) return;
      const nextReview: DraftReviewState = {
        familyId: String(response.familyId),
        draftId: String(response.draftId),
        revision: Number(response.authoringRevision || 1),
        dossier: response.dossier as TemplateRequirementsDossierV1,
        definition: response.definition as TemplateDefinitionV1,
        sourceSessionId: sourceState.sessionId,
        lifecycle,
      };
      const applySuccess = () => {
        setDraftReview((current) => !lifecycle || lifecycle.isCurrent() ? nextReview : current);
        setReviewDirty((current) => !lifecycle || lifecycle.isCurrent() ? false : current);
        setState((current) =>
          current?.sessionId === sourceState.sessionId
          && (!lifecycle || (lifecycle.isCurrent() && isV2State(current)))
            ? {
              ...current,
              revision: Number(response.revision),
              status: "draft_created",
            }
            : current,
        );
        setMessages((current) => !lifecycle || lifecycle.isCurrent()
          ? [
              ...current,
              createTemplateCopilotClientChatMessage({
                clientMessageId: messageId("dossier-review"),
                role: "assistant",
                content:
                  dossierReviewCopy[locale].reviewBeforeBuilder,
              }),
            ]
          : current);
      };
      if (lifecycle) lifecycle.commit(applySuccess);
      else applySuccess();
    } catch (caught) {
      if (lifecycle) {
        if (!lifecycle.isCurrent()) return;
        commitV2ReactState(lifecycle, setError, () => errorMessage(caught));
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      if (lifecycle) {
        lifecycle.commit(() => {
          setBusy((current) => lifecycle.isCurrent() ? false : current);
        });
      } else {
        setBusy(false);
      }
    }
  }

  async function saveDossierReview() {
    if (!draftReview || busy) return;
    const review = draftReview;
    const lifecycle = review.lifecycle;
    if (lifecycle) {
      if (!lifecycle.commit(() => {
        setBusy((current) => lifecycle.isCurrent() ? true : current);
        setError((current) => lifecycle.isCurrent() ? "" : current);
      })) return;
    } else {
      setBusy(true);
      setError("");
    }
    try {
      const definition: TemplateDefinitionV1 = {
        ...review.definition,
        template: {
          ...review.definition.template,
          name: review.dossier.title,
        },
        generation: {
          ...review.definition.generation,
          unresolvedQuestionIds: review.dossier.openQuestions
            .filter((question) => !question.answer?.trim())
            .map((question) => question.id),
        },
      };
      const response = await legacyApi(
        `/api/template-authoring/drafts/${review.draftId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedRevision: review.revision,
            dossier: review.dossier,
            definition,
            changeReason:
              "Human-reviewed requirements dossier updated before visual workflow editing.",
            idempotencyKey: messageId("dossier-review"),
          }),
        },
      );
      if (lifecycle && !lifecycle.isCurrent()) return;
      const applySuccess = () => {
        setDraftReview((current) =>
          current?.draftId === review.draftId
          && current.sourceSessionId === review.sourceSessionId
          && (!lifecycle || lifecycle.isCurrent())
          ? {
              ...current,
              revision: Number(response.revision),
              definition,
            }
          : current,
        );
        setReviewDirty((current) => !lifecycle || lifecycle.isCurrent() ? false : current);
        setMessages((current) => !lifecycle || lifecycle.isCurrent()
          ? [
              ...current,
              createTemplateCopilotClientChatMessage({
                clientMessageId: messageId("dossier-review"),
                role: "assistant",
                content: dossierReviewCopy[locale].saved,
              }),
            ]
          : current);
      };
      if (lifecycle) lifecycle.commit(applySuccess);
      else applySuccess();
    } catch (caught) {
      if (lifecycle) {
        if (!lifecycle.isCurrent()) return;
        commitV2ReactState(lifecycle, setError, () => errorMessage(caught));
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      if (lifecycle) {
        lifecycle.commit(() => {
          setBusy((current) => lifecycle.isCurrent() ? false : current);
        });
      } else {
        setBusy(false);
      }
    }
  }

  function continueToBuilder() {
    if (!draftReview || reviewDirty || busy) return;
    onDraftCreated({
      ...workflowTemplateFromDefinition(draftReview.definition),
      authoringFamilyId: draftReview.familyId,
      authoringDraftId: draftReview.draftId,
      authoringRevision: draftReview.revision,
      authoringDossier: draftReview.dossier,
    });
  }

  function updateReviewedDossier(dossier: TemplateRequirementsDossierV1) {
    setDraftReview((current) => (current ? { ...current, dossier } : current));
    setReviewDirty(true);
  }

  if (!state) {
    return (
      <section className="rounded-md border border-[#d9e4df] bg-[#f7fbf9] p-5 dark:border-neutral-700 dark:bg-neutral-950">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
            <Bot aria-hidden="true" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-neutral-900">{copy.title}</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {copy.description}
            </p>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              {copy.historyNotice}
            </p>
            {pendingV2SpecialCommand && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                <p role="status">{copy.temporaryAnswerError} {copy.retrySameAnswer}</p>
                <button type="button" disabled={busy} onClick={() => void recoverStoredV2Special()} className="mt-2 min-h-10 rounded-md border border-amber-500 px-3 text-sm disabled:opacity-50">{copy.retryPreviousAnswer}</button>
              </div>
            )}
            {!availableBusinesses.length && (
              <p role="status" className="mt-3 text-sm text-amber-700">
                {copy.directoryLoading}
              </p>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm text-neutral-700">
                {copy.language}
                <select
                  value={startLocale}
                  disabled={busy || Boolean(pendingV2SpecialCommand) || Boolean(pendingV2Start)}
                  onChange={(event) =>
                    setSelectedLocale(
                      event.target.value as TemplateCopilotLocale,
                    )
                  }
                  className="template-copilot-control mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
                >
                  {templateCopilotLocales.map((item) => (
                    <option key={item} value={item}>
                      {templateCopilotCopy[item].languageName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-700">
                {copy.business}
                <select
                  value={businessUnitId}
                  disabled={busy || Boolean(pendingV2SpecialCommand) || Boolean(pendingV2Start)}
                  onChange={(event) => {
                    const id = event.target.value;
                    const business = availableBusinesses.find(
                      (item) => item.id === id,
                    );
                    setBusinessUnitId(id);
                    setDepartmentName(business?.departments[0] || "");
                  }}
                  className="template-copilot-control mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
                >
                  {availableBusinesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-700">
                {copy.department}
                <select
                  value={departmentName}
                  disabled={busy || Boolean(pendingV2SpecialCommand) || Boolean(pendingV2Start)}
                  onChange={(event) => setDepartmentName(event.target.value)}
                  className="template-copilot-control mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
                >
                  {(selectedBusiness?.departments || []).map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={start}
              disabled={busy || Boolean(pendingV2SpecialCommand) || !businessUnitId || !departmentName}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Sparkles aria-hidden="true" size={16} />
              {busy ? copy.starting : copy.start}
            </button>
            {error && <ErrorMessage message={error} />}
            <TemplateCopilotHistoryPanel locale={selectedLocale} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={copy.title}
      className="grid gap-4 rounded-md border border-[#d9e4df] bg-[#f7fbf9] p-4 dark:border-neutral-700 dark:bg-neutral-950 lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      <h2 className="sr-only">{copy.title}</h2>
      <div className="min-w-0">
        <div
          aria-live="polite"
          className="max-h-[520px] space-y-3 overflow-y-auto rounded-md border border-[#e2e8e5] bg-white p-3"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "assistant"
                  ? "mr-8 rounded-md bg-[#f1f6f3] p-3 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-white"
                  : "ml-8 rounded-md bg-emerald-700 p-3 text-sm text-white"
              }
            >
              <p className="mb-1 text-xs font-semibold uppercase opacity-70">
                {message.role === "assistant" ? copy.copilot : copy.you}
              </p>
              <TemplateCopilotTranscriptContent content={message.content} locale={locale} />
            </div>
          ))}
          {busy && (
            <p className="text-sm text-neutral-500" role="status">
              {copy.working}
            </p>
          )}
        </div>
        {draftReview && (
          <DossierReviewEditor
            locale={locale}
            dossier={draftReview.dossier}
            dirty={reviewDirty}
            busy={busy}
            onChange={updateReviewedDossier}
            onSave={saveDossierReview}
            onContinue={continueToBuilder}
          />
        )}
        {state.status !== "draft_created" && (
          <div className="mt-3 space-y-3">
            {broadMode && <><h3 id="copilot-current-question" className="w-full text-sm font-semibold text-neutral-900 dark:text-white">{broadComposerLabel}</h3><p id="copilot-broad-mode-example" className="w-full rounded-md border border-sky-300 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-700 dark:bg-neutral-800 dark:text-white">{broadComposerExample}</p></>}
            {!broadMode && isV2State(state) && v2InputMode === "answerable" && state.interview.nextQuestion && <h3 ref={v2QuestionHeadingRef} id="copilot-current-question" tabIndex={-1} className="w-full text-sm font-semibold text-neutral-900 dark:text-white">{state.interview.nextQuestion.prompt}</h3>}
            {activeModeDisabled && <p className="w-full rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-neutral-800 dark:text-amber-100">{modeUiCopy.modeReadOnly}</p>}
            {!broadMode && isV2State(state) && v2InputMode === "answerable" && v2VisibleExample && (
              <div className="mb-2 w-full rounded-md border border-sky-300 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-700 dark:bg-neutral-800 dark:text-white">
                <p className="font-semibold">{v2Interaction?.labels.exampleOnly || state.interview.nextQuestion?.exampleLabel}</p>
                <p className="mt-1">{v2VisibleExample}</p>
                {v2Interaction && v2Examples.length > 1 && <button type="button" onClick={() => setExampleIndex((current) => (current + 1) % v2Examples.length)} className="mt-2 min-h-11 rounded-md border border-sky-500 px-3 text-sm font-medium text-sky-950 dark:text-sky-100">{v2Interaction.labels.showAnotherExample}</button>}
              </div>
            )}
            {!broadMode && isV2State(state) && v2InputMode === "answerable" && state.interview.nextQuestion?.helpConceptRef && (
              state.interview.nextQuestion.helpDetail
                ? <TemplateCopilotConceptHelp detail={state.interview.nextQuestion.helpDetail} open={questionHelpVisible} onToggle={() => setQuestionHelpVisible((current) => !current)} />
                : v2Interaction
                  ? <div className="mb-2 w-full"><button type="button" aria-expanded={questionHelpVisible} aria-controls="copilot-current-question-help" onClick={() => setQuestionHelpVisible((current) => !current)} className="min-h-11 rounded-md border border-neutral-500 px-3 text-sm text-neutral-800 dark:text-neutral-100">{v2Interaction.labels.whyAsking}</button>{questionHelpVisible && <p id="copilot-current-question-help" className="mt-2 text-xs text-neutral-700 dark:text-neutral-200">{state.interview.nextQuestion.helpBody}</p>}</div>
                  : <p id="copilot-current-question-help" className="mb-2 w-full text-xs text-neutral-600 dark:text-neutral-300" aria-label={state.interview.nextQuestion.helpLabel}>{state.interview.nextQuestion.helpLabel}: {state.interview.nextQuestion.helpBody}</p>
            )}
            {activeModeDisabled ? null : !broadMode && isV2State(state) && v2InputMode === "complete" ? (
              <p className="w-full rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{copy.interviewComplete} {copy.interviewCompleteNextAction}</p>
            ) : !broadMode && isV2State(state) && v2InputMode === "blocked" ? (
              <p className="w-full rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{copy.interviewBlocked} {copy.interviewBlockedSupport}</p>
            ) : !broadMode && isV2State(state) && composer?.showChoiceButtons && !v2PlainTypedFallback && state.interview.nextQuestion?.options ? (
              <div className="flex w-full flex-wrap gap-2">
                <fieldset className="contents" aria-describedby={v2Interaction ? (questionHelpVisible ? "copilot-current-question-help" : undefined) : "copilot-current-question-help"}>
                  <legend className="sr-only">{state.interview.nextQuestion.prompt}</legend>
                  <div className="flex flex-wrap gap-2">
                    {state.interview.nextQuestion.options.map((option) => <button key={option.optionId} type="button" disabled={busy || v2ReplayPending} aria-pressed={v2Interaction?.requiresExplicitContinue ? selectedChoiceOptionId === option.optionId : undefined} onClick={() => {
                      if (v2Interaction?.requiresExplicitContinue) setSelectedChoiceOptionId(option.optionId);
                      else void submitV2({ kind: "choice", optionId: option.optionId }, (command, lifecycle) => commitV2ReactState(lifecycle, setMessages, (current) => {
                        const id = command.idempotencyKey;
                        return current.some((message) => message.id === id) ? current : [...current, createTemplateCopilotClientChatMessage({ clientMessageId: id, role: "user", content: option.label })];
                      }));
                    }} className={`min-h-11 rounded-md border px-3 text-sm dark:bg-neutral-800 dark:text-white ${v2Interaction?.requiresExplicitContinue && selectedChoiceOptionId === option.optionId ? "border-emerald-700 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600 dark:bg-emerald-950 dark:text-emerald-100" : "border-sky-400 bg-white text-sky-900"}`}>{option.label}</button>)}
                    {v2Interaction?.requiresExplicitContinue && <button type="button" disabled={busy || v2ReplayPending || !selectedChoiceOptionId} onClick={() => {
                      const option = state.interview.nextQuestion?.options?.find((item) => item.optionId === selectedChoiceOptionId);
                      if (!option || !selectedChoiceOptionId) return;
                      void submitV2({ kind: "choice", optionId: selectedChoiceOptionId }, (command, lifecycle) => commitV2ReactState(lifecycle, setMessages, (current) => {
                        const id = command.idempotencyKey;
                        return current.some((message) => message.id === id) ? current : [...current, createTemplateCopilotClientChatMessage({ clientMessageId: id, role: "user", content: option.label })];
                      }));
                    }} className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50">{v2Interaction.labels.continue}</button>}
                    {state.interview.nextQuestion.uncertainty.notSure && <button type="button" disabled={busy || v2ReplayPending} onClick={() => void submitV2Special({ operation: "defer" })} className="min-h-11 rounded-md border border-amber-500 px-3 text-sm text-amber-900 dark:text-amber-200">{copy.notSure}</button>}
                    {state.interview.nextQuestion.uncertainty.notApplicable === "when_optional" && <><label className="sr-only" htmlFor="copilot-not-applicable-reason">{copy.notApplicableReason}</label><input id="copilot-not-applicable-reason" value={notApplicableReason} disabled={busy || v2ReplayPending} onChange={(event) => { if (templateCopilotUnicodeCodePointCount(event.target.value) <= 500) setNotApplicableReason(event.target.value); }} maxLength={1000} className="template-copilot-control min-h-11 rounded-md border border-neutral-400 bg-white px-3 text-sm dark:bg-neutral-800 dark:text-white" placeholder={copy.notApplicableReason} /><button type="button" disabled={busy || v2ReplayPending || !notApplicableReason.trim()} onClick={() => void submitV2Special({ operation: "not_applicable", reason: notApplicableReason.trim() })} className="min-h-11 rounded-md border border-neutral-400 px-3 text-sm text-neutral-700 dark:text-neutral-200">{copy.notApplicable}</button></>}
                  </div>
                </fieldset>
              </div>
            ) : (broadMode || composer?.showTextComposer || v2PlainTypedFallback) ? <div className="flex w-full flex-wrap items-end gap-2">
            {!broadMode && isV2State(state) && v2Interaction && <div className="flex w-full flex-wrap gap-2" aria-label={state.interview.nextQuestion?.prompt}>
              {v2Interaction.suggestions.map((suggestion) => <button key={suggestion.id} type="button" disabled={busy || v2ReplayPending} onClick={() => { draftGenerationRef.current += 1; setDraft(suggestion.text); }} className="min-h-11 rounded-md border border-sky-500 bg-white px-3 text-sm text-sky-950 dark:bg-neutral-800 dark:text-sky-100">{suggestion.text}</button>)}
              <button type="button" disabled={busy || v2ReplayPending} onClick={() => { draftGenerationRef.current += 1; setDraft(""); }} className="min-h-11 rounded-md border border-neutral-500 px-3 text-sm text-neutral-800 dark:text-neutral-100">{v2Interaction.labels.somethingElse}</button>
            </div>}
            <textarea
              ref={answerInputRef}
              value={draft}
              onChange={(event) => {
                if (isV2State(state) && templateCopilotUnicodeCodePointCount(event.target.value) > composerLimit) return;
                draftGenerationRef.current += 1;
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (shouldSubmitTemplateCopilotComposerKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) {
                  event.preventDefault();
                  void send();
                }
              }}
              disabled={busy || v2ReplayPending || (!isV2State(state) && state.status === "ready")}
              aria-label={broadMode ? broadComposerLabel : copy.answerLabel}
              aria-describedby={broadMode ? "template-copilot-answer-length copilot-broad-mode-example" : v2Interaction && questionHelpVisible ? "template-copilot-answer-length copilot-current-question-help" : "template-copilot-answer-length"}
              maxLength={isV2State(state) ? composerLimit * 2 : composerLimit}
              rows={3}
              className="template-copilot-control min-h-20 flex-1 resize-y rounded-md border border-[#d8d8d8] bg-white p-3 text-sm"
              placeholder={
                !isV2State(state) && state.status === "ready"
                  ? copy.confirmed
                  : broadMode
                    ? broadComposerPlaceholder
                    : copy.answerPlaceholder
              }
            />
            <p id="template-copilot-answer-length" className="self-end text-xs text-neutral-600 dark:text-neutral-300" aria-live="polite">{copy.answerLength.replace("{count}", String(isV2State(state) ? templateCopilotUnicodeCodePointCount(draft.trim()) : draft.length)).replace("{limit}", String(composerLimit))}</p>
            <button
              type="button"
              onClick={send}
              disabled={busy || v2ReplayPending || !draft.trim() || (!isV2State(state) && state.status === "ready")}
              aria-label={copy.send}
              className="min-h-11 self-end rounded-md bg-emerald-700 px-4 py-3 text-white disabled:opacity-50"
            >
              <Send aria-hidden="true" size={18} />
            </button>
            {!broadMode && isV2State(state) && state.interview.nextQuestion?.uncertainty.notSure && <button type="button" disabled={busy || v2ReplayPending} onClick={() => void submitV2Special({ operation: "defer" })} className="min-h-11 self-end rounded-md border border-amber-500 px-3 text-sm text-amber-900 dark:text-amber-200">{copy.notSure}</button>}
            {!broadMode && isV2State(state) && state.interview.nextQuestion?.uncertainty.notApplicable === "when_optional" && <><label className="sr-only" htmlFor="copilot-not-applicable-reason-text">{copy.notApplicableReason}</label><input id="copilot-not-applicable-reason-text" value={notApplicableReason} disabled={busy || v2ReplayPending} onChange={(event) => { if (templateCopilotUnicodeCodePointCount(event.target.value) <= 500) setNotApplicableReason(event.target.value); }} maxLength={1000} className="template-copilot-control min-h-11 self-end rounded-md border border-neutral-400 bg-white px-3 text-sm dark:bg-neutral-800 dark:text-white" placeholder={copy.notApplicableReason} /><button type="button" disabled={busy || v2ReplayPending || !notApplicableReason.trim()} onClick={() => void submitV2Special({ operation: "not_applicable", reason: notApplicableReason.trim() })} className="min-h-11 self-end rounded-md border border-neutral-400 px-3 text-sm text-neutral-700 dark:text-neutral-200">{copy.notApplicable}</button></>}
            </div> : null}
          </div>
        )}
        {pendingV2Command && !pendingV2SpecialCommand && isV2State(state) && !activeModeDisabled && v2InputMode === "answerable" && (
          <button type="button" onClick={() => void submitV2(pendingV2Command.answer)} disabled={busy} className="mt-2 min-h-11 rounded-md border border-amber-500 px-3 text-sm text-amber-900 dark:text-amber-200">{copy.retryPreviousAnswer}</button>
        )}
        {pendingV2SpecialCommand && !pendingV2Command && isV2State(state) && !activeModeDisabled && <button type="button" onClick={() => void submitV2Special(pendingV2SpecialCommand.command)} disabled={busy} className="mt-2 min-h-11 rounded-md border border-amber-500 px-3 text-sm text-amber-900 dark:text-amber-200">{copy.retryPreviousAnswer}</button>}
        {pendingMapEdit && isV2State(state) && pendingMapEdit.sessionId === state.sessionId && <button type="button" onClick={() => void executePendingMapCommand(pendingMapEdit)} disabled={busy} className="mt-2 min-h-11 rounded-md border border-amber-500 px-3 text-sm text-amber-900 dark:text-amber-200">{locale === "en" ? "Retry the saved map edit" : locale === "zh-Hant" ? "重試已儲存的地圖編輯" : "重试已保存的地图编辑"}</button>}
        {pendingModeCommand && isV2State(state) && !activeModeDisabled && pendingModeCommand.sessionId === state.sessionId && <button type="button" onClick={() => pendingModeCommand.operation.kind === "document" ? fileRef.current?.click() : void executePendingModeCommand(pendingModeCommand)} disabled={busy} className="mt-2 min-h-11 rounded-md border border-amber-500 px-3 text-sm text-amber-900 dark:text-amber-200">{pendingModeCommand.operation.kind === "document" ? modeUiCopy.reselectDocument : locale === "en" ? "Check or retry the saved mode action" : locale === "zh-Hant" ? "檢查或重試已儲存的模式操作" : "检查或重试已保存的模式操作"}</button>}
        {v2SpecialReview.length > 0 && <section className="mt-3 space-y-2 rounded-md border border-amber-300 p-3" aria-label={copy.reopen}>
          {v2SpecialReview.map(({ decisionId, kind, reason, prompt }) => <div id={`copilot-special-${decisionId}`} key={decisionId} className="flex flex-wrap items-center gap-2 text-sm text-neutral-800 dark:text-neutral-100"><span className="min-w-48">{prompt}</span><span>{kind === "unknown" ? copy.notSure : `${copy.notApplicable}${reason ? `: ${reason}` : ""}`}</span><button type="button" disabled={activeModeDisabled || busy || v2ReplayPending} onClick={() => void submitV2Special({ operation: "reopen", decisionId })} className="min-h-9 rounded-md border border-amber-500 px-2 text-sm text-amber-900 dark:text-amber-200">{copy.reopen}</button></div>)}
        </section>}
        {error && <ErrorMessage message={error} />}
      </div>
      <aside className="rounded-md border border-[#e2e8e5] bg-white p-3">
        <h3 className="font-semibold text-neutral-900">
          {isV2State(state) ? copy.currentDecision : `${copy.requirements} ${completed}/${templateCopilotSectionIds.length}`}
        </h3>
        <ul className="mt-3 space-y-2 text-xs">
          {!isV2State(state) && templateCopilotSectionIds.map((id) => {
            const section = state.ledger.sections[id];
            return (
              <li key={id} className="flex items-start gap-2">
                <span
                  className={
                    section.status === "answered"
                      ? "text-emerald-700"
                      : section.status === "unknown"
                        ? "text-amber-700"
                        : "text-neutral-400"
                  }
                  aria-hidden="true"
                >
                  {section.status === "answered"
                    ? "●"
                    : section.status === "unknown"
                      ? "?"
                      : "○"}
                </span>
                <span className="text-neutral-700">
                  {getTemplateCopilotSectionLabel(id, locale)}
                </span>
              </li>
            );
          })}
          {isV2State(state) && <li className="text-neutral-700">{v2InputMode === "answerable" ? state.interview.nextQuestion?.prompt : v2InputMode === "complete" ? copy.interviewComplete : copy.interviewBlocked}</li>}
        </ul>
        {isV2State(state) && (() => {
          const modeCopy = templateCopilotV2ModeCopy(locale);
          const selectedMode = state.modeState?.mode || "guided";
          return <section className="mt-4 rounded-md border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900 dark:bg-neutral-900" aria-label={modeCopy.switch}>
            <p className="font-medium">{modeCopy.switch}</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={modeCopy.switch}>
              {templateCopilotV2AuthoringModes.filter((mode) => mode !== "similar_template" && v2ModeContract?.availableModes.includes(mode)).map((mode) => <button key={mode} type="button" disabled={busy || (!activeModeDisabled && v2ReplayPending) || selectedMode === mode} onClick={() => void switchV2Mode(mode)} aria-pressed={selectedMode === mode} className="min-h-11 rounded border border-violet-400 px-3 text-left disabled:opacity-50">{mode === "guided" ? modeCopy.guide : modeCopy.describe}</button>)}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {v2ModeContract?.availableModes.includes("similar_template") && <><button type="button" disabled={busy || (!activeModeDisabled && v2ReplayPending)} onClick={() => void loadSimilarTemplates()} className="min-h-11 rounded border border-violet-400 px-3">{modeUiCopy.findSources}</button>{similarTemplates.length > 0 && <><label className="sr-only" htmlFor="copilot-similar-template">{modeCopy.source}</label><select id="copilot-similar-template" value={selectedSimilarVersionId} onChange={(event) => setSelectedSimilarVersionId(event.target.value)} disabled={busy || (!activeModeDisabled && v2ReplayPending)} className="min-h-11 max-w-full rounded border border-violet-400 bg-white px-2 dark:bg-neutral-800 dark:text-white"><option value="">{modeCopy.source}</option>{similarTemplates.map((source) => <option key={source.versionId} value={source.versionId}>{source.name} · v{source.versionNumber}</option>)}</select><button type="button" disabled={busy || (!activeModeDisabled && v2ReplayPending) || !selectedSimilarVersionId} onClick={() => void switchV2Mode("similar_template", selectedSimilarVersionId)} className="min-h-11 rounded bg-violet-700 px-3 text-white disabled:opacity-50">{modeUiCopy.useSource}</button></>}</>}
            </div>
            {v2ModeContract?.showSourceSnapshot && state.modeState?.sourceSnapshot && <p className="mt-2 text-xs" aria-label={modeUiCopy.sourceRetained}>{modeUiCopy.sourceRetained}: {state.modeState.sourceSnapshot.name} · v{state.modeState.sourceSnapshot.versionNumber}</p>}
            {selectedMode === "similar_template" && <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-200">{modeUiCopy.similarLabel}</p>}
          </section>;
        })()}
        {isV2State(state) && <div className="mt-4"><TemplateCopilotV2AuthoritativeMap ledger={state.ledger} projection={state.projection} editingEnabled={state.step5EditingEnabled === true} structuredEditorFlags={state.structuredEditorFlags} busy={busy} onTransition={saveAuthoritativeMapFact} /></div>}
        {isV2State(state) && extractionReview && extractionReview.candidates.length > 0 && (
          <section className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-neutral-800 dark:text-sky-100" aria-label={extractionReviewCopy.candidateSectionAria}>
            <p className="font-medium">{extractionReviewCopy.candidateHeading}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {extractionReview.candidates.map((candidate) => {
                const blockedReason = extractionCandidateReviewBlockReason(state.ledger, candidate, locale);
                const factLabel = templateCopilotV2ReviewFactLabel(candidate.factId, locale);
                return <li key={candidate.candidateId} className="min-h-11">
                  <ExtractionTypedValue factId={candidate.factId} value={candidate.value} locale={locale} variant="candidate" />
                  <p className="mt-1 text-xs"><span className="font-medium">{locale === "zh-Hant" ? "原文：" : locale === "zh-Hans" ? "原文：" : "Source wording: "}</span>{candidate.originalWording} <span>· {locale === "zh-Hant" ? "僅供參考，請先核對來源" : locale === "zh-Hans" ? "仅供参考，请先核对来源" : "Suggestion only — check the source"}</span></p>
                  <ExtractionEvidenceDisclosure candidate={candidate} locale={locale} />
                  {blockedReason ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-200" aria-label={locale === "zh-Hant" ? `建議目前不可確認：${factLabel}` : locale === "zh-Hans" ? `建议目前不可确认：${factLabel}` : `Suggestion is currently not confirmable: ${factLabel}`}>{blockedReason}</p> : <button type="button" disabled={busy} onClick={() => void confirmExtractionCandidate(candidate.candidateId)} aria-label={`${extractionReviewCopy.confirm}: ${factLabel}`} className="mt-1 min-h-11 underline disabled:opacity-50">{extractionReviewCopy.confirm}</button>}
                </li>;
              })}
            </ul>
          </section>
        )}
        {isV2State(state) && extractionReview && extractionReview.conflicts.length > 0 && (
          <section className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-neutral-800 dark:text-amber-100" aria-label={extractionReviewCopy.conflictSectionAria}>
            <p className="font-medium">{extractionReviewCopy.conflictHeading}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {extractionReview.conflicts.map((conflict) => {
                const factLabel = templateCopilotV2ReviewFactLabel(conflict.factId, locale);
                return <li key={conflict.conflictId} className="min-h-11">
                  {conflict.existing.candidate ? <div className="mt-1"><ExtractionTypedValue factId={conflict.factId} value={conflict.existing.candidate.value} locale={locale} variant="current" /><p className="mt-1 text-xs">{locale === "zh-Hant" ? "原文：" : locale === "zh-Hans" ? "原文：" : "Source wording: "}{conflict.existing.candidate.originalWording}</p><ExtractionEvidenceDisclosure candidate={conflict.existing.candidate} locale={locale} /></div> : <div className="mt-1"><ExtractionTypedValue factId={conflict.factId} value={conflict.existing.value} locale={locale} variant="current" /><p className="mt-1 text-xs text-neutral-700 dark:text-neutral-200">{extractionExistingProvenanceSummary(conflict, locale)}</p></div>}
                  <div className="mt-2"><ExtractionTypedValue factId={conflict.factId} value={conflict.incoming.value} locale={locale} variant="proposed" /><p className="mt-1 text-xs">{locale === "zh-Hant" ? "原文：" : locale === "zh-Hans" ? "原文：" : "Source wording: "}{conflict.incoming.originalWording}</p><ExtractionEvidenceDisclosure candidate={conflict.incoming} locale={locale} /></div>
                  <div className="mt-1 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void resolveExtractionConflict(conflict.conflictId, "keep_existing")} aria-label={`${extractionReviewCopy.keepExisting}: ${factLabel}`} className="min-h-11 underline disabled:opacity-50">{extractionReviewCopy.keepExisting}</button><button type="button" disabled={busy} onClick={() => void resolveExtractionConflict(conflict.conflictId, "commit_incoming")} aria-label={`${extractionReviewCopy.useProposed}: ${factLabel}`} className="min-h-11 underline disabled:opacity-50">{extractionReviewCopy.useProposed}</button></div>
                </li>;
              })}
            </ul>
            <label className="mt-2 block text-xs">{locale === "zh-Hant" ? "處理原因（選填）" : locale === "zh-Hans" ? "处理原因（选填）" : "Reason (optional)"}<input value={extractionRationale} maxLength={1000} disabled={busy} onChange={(event) => setExtractionRationale(event.target.value)} className="template-copilot-control mt-1 min-h-11 w-full rounded-md border px-2 dark:bg-neutral-800" /></label>
          </section>
        )}
        {(!isV2State(state) || v2ModeContract?.allowRequirementsDocument) && <>
        <input
          id="template-copilot-requirements-file"
          ref={fileRef}
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || (v2ReplayPending && pendingModeCommand?.operation.kind !== "document")}
          aria-controls="template-copilot-requirements-file"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#d8d8d8] px-3 py-2 text-sm text-neutral-700 disabled:opacity-50"
        >
          <FileUp aria-hidden="true" size={16} />
          {copy.addFile}
        </button>
        </>}
        {state.status === "ready" && (
          <button
            type="button"
            onClick={createDraft}
            disabled={busy}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Sparkles aria-hidden="true" size={16} />
            {copy.generate}
          </button>
        )}
        {(!isV2State(state) || v2ModeContract?.allowRequirementsDocument) && <p className="mt-3 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          {isV2State(state) ? `${modeUiCopy.describeFileOnly} ${copy.fileBoundary}` : copy.fileBoundary}
        </p>}
        <p className="mt-3 border-t border-[#e6e6e6] pt-3 text-xs leading-5 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {copy.historyNotice}
        </p>
        {isV2State(state) ? <p className="mt-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{copy.recoveryTranscriptNotice}</p> : null}
      </aside>
    </section>
  );
}

function DossierReviewEditor({
  locale,
  dossier,
  dirty,
  busy,
  onChange,
  onSave,
  onContinue,
}: {
  locale: TemplateCopilotLocale;
  dossier: TemplateRequirementsDossierV1;
  dirty: boolean;
  busy: boolean;
  onChange: (dossier: TemplateRequirementsDossierV1) => void;
  onSave: () => void;
  onContinue: () => void;
}) {
  const copy = dossierReviewCopy[locale];
  return (
    <section className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <FileText
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-sky-700"
          size={20}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-neutral-900">{copy.title}</h3>
          <p className="mt-1 text-sm text-neutral-600">{copy.description}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm text-neutral-700">
          {copy.workflowTitle}
          <input
            value={dossier.title}
            maxLength={200}
            onChange={(event) =>
              onChange({ ...dossier, title: event.target.value })
            }
            className="template-copilot-control mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
          />
        </label>
        <label className="text-sm text-neutral-700">
          {copy.classification}
          <select
            value={dossier.businessScope.dataClassification}
            onChange={(event) =>
              onChange({
                ...dossier,
                businessScope: {
                  ...dossier.businessScope,
                  dataClassification: event.target.value as
                    | "internal"
                    | "confidential"
                    | "restricted",
                },
              })
            }
            className="template-copilot-control mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
          >
            <option value="internal">{copy.internal}</option>
            <option value="confidential">{copy.confidential}</option>
            <option value="restricted">{copy.restricted}</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block text-sm text-neutral-700">
        {copy.purpose}
        <textarea
          value={dossier.purpose}
          maxLength={4_000}
          rows={3}
          onChange={(event) =>
            onChange({ ...dossier, purpose: event.target.value })
          }
          className="template-copilot-control mt-1 w-full rounded-md border border-[#d8d8d8] bg-white p-3"
        />
      </label>
      <label className="mt-3 block max-w-xs text-sm text-neutral-700">
        {copy.retention}
        <input
          type="number"
          min={1}
          max={3_650}
          value={dossier.governance.retentionDays}
          onChange={(event) =>
            onChange({
              ...dossier,
              governance: {
                ...dossier.governance,
                retentionDays: Number(event.target.value),
              },
            })
          }
          className="template-copilot-control mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
        />
      </label>

      <div className="mt-4 rounded-md border border-sky-100 bg-white p-3">
        <h4 className="text-sm font-semibold text-neutral-900">
          {copy.compiledCoverage}
        </h4>
        <p className="mt-1 text-xs leading-5 text-neutral-600">
          {copy.coverageSummary
            .replace("{fields}", String(dossier.initiation.requestFields.length))
            .replace(
              "{attachments}",
              String(dossier.attachmentRequirements.length),
            )
            .replace("{stages}", String(dossier.stages.length))
            .replace("{routes}", String(dossier.routes.length))}
        </p>
      </div>

      {dossier.assumptions.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-neutral-900">
            {copy.assumptions}
          </h4>
          <div className="mt-2 space-y-2">
            {dossier.assumptions.map((assumption, index) => (
              <div
                key={assumption.id}
                className="grid gap-2 rounded-md border border-sky-100 bg-white p-2 md:grid-cols-[1fr_150px]"
              >
                <textarea
                  aria-label={`${copy.assumption} ${index + 1}`}
                  value={assumption.statement}
                  maxLength={4_000}
                  rows={2}
                  onChange={(event) =>
                    onChange({
                      ...dossier,
                      assumptions: dossier.assumptions.map((item) =>
                        item.id === assumption.id
                          ? { ...item, statement: event.target.value }
                          : item,
                      ),
                    })
                  }
                  className="template-copilot-control rounded-md border border-[#d8d8d8] p-2 text-sm"
                />
                <select
                  aria-label={`${copy.status} ${index + 1}`}
                  value={assumption.status}
                  onChange={(event) =>
                    onChange({
                      ...dossier,
                      assumptions: dossier.assumptions.map((item) =>
                        item.id === assumption.id
                          ? {
                              ...item,
                              status: event.target.value as
                                | "proposed"
                                | "confirmed"
                                | "rejected",
                            }
                          : item,
                      ),
                    })
                  }
                  className="template-copilot-control min-h-11 rounded-md border border-[#d8d8d8] bg-white px-2 text-sm"
                >
                  <option value="proposed">{copy.proposed}</option>
                  <option value="confirmed">{copy.confirmed}</option>
                  <option value="rejected">{copy.rejected}</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {dossier.openQuestions.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-neutral-900">
            {copy.openQuestions}
          </h4>
          <div className="mt-2 space-y-2">
            {dossier.openQuestions.map((question, index) => (
              <label
                key={question.id}
                className="block rounded-md border border-sky-100 bg-white p-3 text-sm text-neutral-700"
              >
                {question.question}
                <textarea
                  aria-label={`${copy.answer} ${index + 1}`}
                  value={question.answer || ""}
                  maxLength={4_000}
                  rows={2}
                  placeholder={copy.answerPlaceholder}
                  onChange={(event) =>
                    onChange({
                      ...dossier,
                      openQuestions: dossier.openQuestions.map((item) =>
                        item.id === question.id
                          ? { ...item, answer: event.target.value }
                          : item,
                      ),
                    })
                  }
                  className="template-copilot-control mt-2 w-full rounded-md border border-[#d8d8d8] p-2"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <h4 className="text-sm font-semibold text-neutral-900">
          {copy.citations} ({dossier.citations.length})
        </h4>
        {dossier.citations.length ? (
          <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
            {dossier.citations.map((citation) => (
              <li
                key={citation.id}
                className="rounded-md border border-sky-100 bg-white p-3 text-xs leading-5 text-neutral-600"
              >
                <p className="font-semibold text-neutral-800">
                  {citation.targetPath}
                </p>
                {citation.source.type === "interview" ? (
                  <p>
                    {copy.interviewSource}: {citation.source.sectionId} ·{" "}
                    {citation.source.messageIds.length} {copy.messages}
                  </p>
                ) : (
                  <>
                    <p>
                      {citation.source.fileName}
                      {citation.source.pageNumber
                        ? ` · ${copy.page} ${citation.source.pageNumber}`
                        : ""}
                      {" · "}
                      SHA-256 {citation.source.sha256.slice(0, 12)}…
                    </p>
                    <p className="mt-1 text-neutral-700">
                      “{citation.source.excerpt}”
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">{copy.noCitations}</p>
        )}
      </div>

      <p className="mt-4 text-xs leading-5 text-neutral-500">
        {copy.structuralEditing}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !dirty}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Save aria-hidden="true" size={16} />
          {busy ? copy.saving : dirty ? copy.save : copy.savedButton}
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={busy || dirty}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-800 disabled:opacity-50"
        >
          <Sparkles aria-hidden="true" size={16} />
          {dirty ? copy.saveFirst : copy.continue}
        </button>
      </div>
    </section>
  );
}

const dossierReviewCopy: Record<
  TemplateCopilotLocale,
  {
    title: string;
    description: string;
    reviewBeforeBuilder: string;
    workflowTitle: string;
    classification: string;
    internal: string;
    confidential: string;
    restricted: string;
    purpose: string;
    retention: string;
    compiledCoverage: string;
    coverageSummary: string;
    assumptions: string;
    assumption: string;
    status: string;
    proposed: string;
    confirmed: string;
    rejected: string;
    openQuestions: string;
    answer: string;
    answerPlaceholder: string;
    citations: string;
    interviewSource: string;
    messages: string;
    page: string;
    noCitations: string;
    structuralEditing: string;
    save: string;
    saving: string;
    saved: string;
    savedButton: string;
    saveFirst: string;
    continue: string;
  }
> = {
  en: {
    title: "Editable requirements dossier",
    description:
      "Review the human-readable source of truth before opening the generated workflow.",
    reviewBeforeBuilder:
      "The draft is valid. Review and save its requirements dossier before continuing to Builder and Canvas.",
    workflowTitle: "Workflow title",
    classification: "Data classification",
    internal: "Internal",
    confidential: "Confidential",
    restricted: "Restricted",
    purpose: "Purpose and scope",
    retention: "Retention period (days)",
    compiledCoverage: "Compiled workflow coverage",
    coverageSummary:
      "{fields} request fields · {attachments} attachment/form requirements · {stages} dossier stages · {routes} routes",
    assumptions: "Requirements and assumptions",
    assumption: "Requirement or assumption",
    status: "Status",
    proposed: "Proposed",
    confirmed: "Confirmed",
    rejected: "Rejected",
    openQuestions: "Open questions",
    answer: "Answer",
    answerPlaceholder: "Record the reviewed answer",
    citations: "Source citations",
    interviewSource: "Interview section",
    messages: "source message(s)",
    page: "page",
    noCitations: "No source citations were recorded.",
    structuralEditing:
      "Edit workflow structure, fields, attachments, stages, and routes in Builder and Canvas after this dossier review.",
    save: "Save dossier review",
    saving: "Saving…",
    saved: "The reviewed dossier was saved as a new authoritative revision.",
    savedButton: "Dossier saved",
    saveFirst: "Save changes first",
    continue: "Continue to Builder & Canvas",
  },
  "zh-Hant": {
    title: "可編輯需求檔案",
    description: "開啟已生成流程前，請審核這份供人閱讀的需求依據。",
    reviewBeforeBuilder:
      "草稿已通過驗證。請先審核並儲存需求檔案，然後再前往建構器及畫布。",
    workflowTitle: "流程名稱",
    classification: "資料分類",
    internal: "內部",
    confidential: "機密",
    restricted: "受限制",
    purpose: "目的及範圍",
    retention: "保留期限（日）",
    compiledCoverage: "已編譯流程涵蓋範圍",
    coverageSummary:
      "{fields} 個申請欄位 · {attachments} 項附件／表格要求 · {stages} 個需求階段 · {routes} 條路徑",
    assumptions: "需求及假設",
    assumption: "需求或假設",
    status: "狀態",
    proposed: "建議",
    confirmed: "已確認",
    rejected: "已拒絕",
    openQuestions: "待決問題",
    answer: "答案",
    answerPlaceholder: "記錄經審核的答案",
    citations: "來源引證",
    interviewSource: "訪談章節",
    messages: "則來源訊息",
    page: "第",
    noCitations: "沒有記錄來源引證。",
    structuralEditing:
      "完成需求檔案審核後，請在建構器及畫布編輯流程結構、欄位、附件、階段和路徑。",
    save: "儲存需求檔案審核",
    saving: "正在儲存……",
    saved: "已將審核後的需求檔案儲存為新的權威修訂。",
    savedButton: "需求檔案已儲存",
    saveFirst: "請先儲存變更",
    continue: "前往建構器及畫布",
  },
  "zh-Hans": {
    title: "可编辑需求档案",
    description: "打开已生成流程前，请审核这份供人阅读的需求依据。",
    reviewBeforeBuilder:
      "草稿已通过验证。请先审核并保存需求档案，然后再前往构建器及画布。",
    workflowTitle: "流程名称",
    classification: "数据分类",
    internal: "内部",
    confidential: "机密",
    restricted: "受限制",
    purpose: "目的及范围",
    retention: "保留期限（天）",
    compiledCoverage: "已编译流程涵盖范围",
    coverageSummary:
      "{fields} 个申请字段 · {attachments} 项附件／表单要求 · {stages} 个需求阶段 · {routes} 条路径",
    assumptions: "需求及假设",
    assumption: "需求或假设",
    status: "状态",
    proposed: "建议",
    confirmed: "已确认",
    rejected: "已拒绝",
    openQuestions: "待决问题",
    answer: "答案",
    answerPlaceholder: "记录经审核的答案",
    citations: "来源引用",
    interviewSource: "访谈章节",
    messages: "条来源消息",
    page: "第",
    noCitations: "没有记录来源引用。",
    structuralEditing:
      "完成需求档案审核后，请在构建器及画布编辑流程结构、字段、附件、阶段和路径。",
    save: "保存需求档案审核",
    saving: "正在保存……",
    saved: "已将审核后的需求档案保存为新的权威修订。",
    savedButton: "需求档案已保存",
    saveFirst: "请先保存更改",
    continue: "前往构建器及画布",
  },
};

const templateCopilotCopy: Record<
  TemplateCopilotLocale,
  {
    title: string;
    description: string;
    language: string;
    languageName: string;
    business: string;
    department: string;
    directoryLoading: string;
    directoryLoadingError: string;
    start: string;
    starting: string;
    copilot: string;
    you: string;
    working: string;
    answerLabel: string;
    answerPlaceholder: string;
    confirmed: string;
    send: string;
    chooseListedOption: string;
    notSure: string;
    notApplicable: string;
    notApplicableReason: string;
    deferred: string;
    reopened: string;
    reopen: string;
    previousAnswerSaved: string;
    retrySameAnswer: string;
    retryPreviousAnswer: string;
    interviewComplete: string;
    interviewCompleteNextAction: string;
    interviewBlocked: string;
    interviewBlockedSupport: string;
    concurrentChangeSuperseded: string;
    concurrentChangeConflict: string;
    validationAnswerError: string;
    answerLength: string;
    currentDecision: string;
    requestError: string;
    startInterviewInvalid: string;
    reloadInterviewError: string;
    invalidInterviewUpdate: string;
    retryPreviousRequired: string;
    temporaryAnswerError: string;
    staleAnswerRebased: string;
    staleAnswerNeedsReview: string;
    answerTooLong: string;
    requirements: string;
    addFile: string;
    generate: string;
    fileBoundary: string;
    draftCreated: string;
    historyNotice: string;
    recoveryTranscriptNotice: string;
    v2RollbackNotice: string;
  }
> = {
  en: {
    title: "Template Copilot",
    description:
      "A guided interview that creates an editable proposal. It cannot publish or activate a workflow.",
    language: "Language",
    languageName: "English",
    business: "Business",
    department: "Department",
    directoryLoading: "Loading the authenticated business directory…",
    directoryLoadingError:
      "The authenticated business directory is still loading. Please try again.",
    start: "Start guided interview",
    starting: "Starting…",
    copilot: "Copilot",
    you: "You",
    working: "Copilot is working…",
    answerLabel: "Your workflow requirement answer",
    answerPlaceholder:
      "Describe the requirement. Use Shift+Enter for a new line.",
    confirmed: "Requirements confirmed",
    send: "Send answer",
    chooseListedOption: "Choose one of the listed options for this question.",
    notSure: "Not sure",
    notApplicable: "Not applicable",
    notApplicableReason: "Why is this not applicable?",
    deferred: "This decision is marked as not yet known. Reopen it to continue.",
    reopened: "This decision and its dependent answers have been reopened.",
    reopen: "Reopen this decision",
    previousAnswerSaved: "Your previous answer was saved.",
    retrySameAnswer: "Retry the same answer, or reload the latest interview.",
    retryPreviousAnswer: "Retry previous answer",
    interviewComplete: "All applicable decisions are complete.",
    interviewCompleteNextAction: "Review the requirements before creating an editable draft.",
    interviewBlocked: "This interview needs to be reloaded before it can continue.",
    interviewBlockedSupport: "Reload the page or contact support if it remains blocked.",
    concurrentChangeSuperseded: "Another person completed this step first. The latest interview has been loaded; review it before continuing.",
    concurrentChangeConflict: "Another person completed this step with a different answer. The latest interview has been loaded; review the change before continuing.",
    validationAnswerError: "That answer could not be accepted. Please correct it and try again.",
    answerLength: "{count}/{limit} characters",
    currentDecision: "Current decision",
    requestError: "The Copilot request could not be completed. Please try again.",
    startInterviewInvalid: "The Copilot could not start the first question. Please try again.",
    reloadInterviewError: "The latest interview could not be reloaded. Please try again.",
    invalidInterviewUpdate: "The Copilot returned an invalid interview update. Please reload and try again.",
    retryPreviousRequired: "Finish or reload the previous answer before changing it.",
    temporaryAnswerError: "The answer could not be confirmed yet.",
    staleAnswerRebased: "The interview changed before this answer was saved. Please review and send the restored answer again.",
    staleAnswerNeedsReview: "The interview changed before this answer was saved. Please review the latest question before continuing.",
    answerTooLong: "Please keep this answer to 8,000 characters or fewer.",
    requirements: "Requirements",
    addFile: "Add requirements file",
    generate: "Generate editable draft",
    fileBoundary:
      "Files are bounded and treated as untrusted data. PDF active content is rejected. Human review is always required before publication.",
    draftCreated:
      "Editable draft created. Review it in Builder and Canvas, run validation and simulation, then send it for publication review.",
    historyNotice:
      "This conversation is saved with your account. You can reopen it later, and authorized IT administrators may review it to improve the Copilot.",
    recoveryTranscriptNotice:
      "During recovery, long conversations show the latest saved page. The full saved conversation is available in history to authorized reviewers.",
    v2RollbackNotice:
      "The newer Copilot interview is no longer enabled. Its pending recovery action was safely released; you can start a standard guided interview.",
  },
  "zh-Hant": {
    title: "流程範本助理",
    description:
      "透過引導式訪談建立可編輯方案。助理不能發布或啟用流程。",
    language: "語言",
    languageName: "繁體中文",
    business: "業務單位",
    department: "部門",
    directoryLoading: "正在載入已驗證的業務目錄……",
    directoryLoadingError: "業務目錄仍在載入，請稍後再試。",
    start: "開始引導式訪談",
    starting: "正在開始……",
    copilot: "流程助理",
    you: "你",
    working: "流程助理正在處理……",
    answerLabel: "你的流程需求答案",
    answerPlaceholder: "請描述需求。按 Shift+Enter 換行。",
    confirmed: "需求已確認",
    send: "傳送答案",
    chooseListedOption: "請從此問題列出的選項中選擇一項。",
    notSure: "未能確定",
    notApplicable: "不適用",
    notApplicableReason: "為何不適用？",
    deferred: "此決定已標記為未能確定。重新開啟後才可繼續。",
    reopened: "此決定及其相關答案已重新開啟。",
    reopen: "重新開啟此決定",
    previousAnswerSaved: "你先前的答案已儲存。",
    retrySameAnswer: "請重試相同答案，或重新載入最新訪談。",
    retryPreviousAnswer: "重試先前答案",
    interviewComplete: "所有適用的決定已完成。",
    interviewCompleteNextAction: "建立可編輯草稿前，請先審閱需求。",
    interviewBlocked: "此訪談需要重新載入後才能繼續。",
    interviewBlockedSupport: "請重新載入頁面；如仍被阻擋，請聯絡支援人員。",
    concurrentChangeSuperseded: "另一位使用者已先完成此步驟。已載入最新訪談，請先審閱後再繼續。",
    concurrentChangeConflict: "另一位使用者以不同答案完成此步驟。已載入最新訪談，請先審閱更改後再繼續。",
    validationAnswerError: "無法接受此答案。請更正後再試。",
    answerLength: "{count}/{limit} 個字元",
    currentDecision: "目前決定",
    requestError: "無法完成流程助理的請求。請再試一次。",
    startInterviewInvalid: "流程助理無法開始第一條問題。請再試一次。",
    reloadInterviewError: "無法重新載入最新訪談。請再試一次。",
    invalidInterviewUpdate: "流程助理返回了無效的訪談更新。請重新載入後再試。",
    retryPreviousRequired: "請先完成或重新載入先前的答案，然後再更改。",
    temporaryAnswerError: "暫時無法確認此答案。",
    staleAnswerRebased: "儲存此答案前訪談已有更改。請審閱後再次傳送已還原的答案。",
    staleAnswerNeedsReview: "儲存此答案前訪談已有更改。請先審閱最新問題再繼續。",
    answerTooLong: "請將答案限制在 8,000 個字元以內。",
    requirements: "需求",
    addFile: "加入需求文件",
    generate: "建立可編輯草稿",
    fileBoundary:
      "文件大小及內容均受限制，並視為不受信任的資料。含主動內容的 PDF 會被拒絕。發布前必須由人員審核。",
    draftCreated:
      "可編輯草稿已建立。請在建構器及畫布中審核、執行驗證和模擬，然後提交發布審核。",
    historyNotice:
      "此對話會儲存在你的帳戶。你可日後重新開啟，而獲授權的資訊科技管理員可審閱記錄以改進流程助理。",
    recoveryTranscriptNotice:
      "復原期間，較長的對話會顯示最新已儲存頁面。獲授權審閱者可在記錄中查看完整對話。",
    v2RollbackNotice:
      "新版流程助理訪談現已停用。待復原的操作已安全解除；你可以開始標準引導式訪談。",
  },
  "zh-Hans": {
    title: "流程模板助手",
    description:
      "通过引导式访谈创建可编辑方案。助手不能发布或启用流程。",
    language: "语言",
    languageName: "简体中文",
    business: "业务单位",
    department: "部门",
    directoryLoading: "正在加载已验证的业务目录……",
    directoryLoadingError: "业务目录仍在加载，请稍后重试。",
    start: "开始引导式访谈",
    starting: "正在开始……",
    copilot: "流程助手",
    you: "你",
    working: "流程助手正在处理……",
    answerLabel: "你的流程需求答案",
    answerPlaceholder: "请描述需求。按 Shift+Enter 换行。",
    confirmed: "需求已确认",
    send: "发送答案",
    chooseListedOption: "请从此问题列出的选项中选择一项。",
    notSure: "暂不确定",
    notApplicable: "不适用",
    notApplicableReason: "为何不适用？",
    deferred: "此决定已标记为暂不确定。重新打开后才可继续。",
    reopened: "此决定及其相关答案已重新打开。",
    reopen: "重新打开此决定",
    previousAnswerSaved: "你之前的答案已保存。",
    retrySameAnswer: "请重试相同答案，或重新加载最新访谈。",
    retryPreviousAnswer: "重试之前的答案",
    interviewComplete: "所有适用的决定已完成。",
    interviewCompleteNextAction: "创建可编辑草稿前，请先审核需求。",
    interviewBlocked: "此访谈需要重新加载后才能继续。",
    interviewBlockedSupport: "请重新加载页面；如仍被阻挡，请联系支持人员。",
    concurrentChangeSuperseded: "另一位用户已先完成此步骤。已加载最新访谈，请先审核后再继续。",
    concurrentChangeConflict: "另一位用户以不同答案完成此步骤。已加载最新访谈，请先审核更改后再继续。",
    validationAnswerError: "无法接受此答案。请更正后再试。",
    answerLength: "{count}/{limit} 个字符",
    currentDecision: "当前决定",
    requestError: "无法完成流程助手的请求。请再试一次。",
    startInterviewInvalid: "流程助手无法开始第一个问题。请再试一次。",
    reloadInterviewError: "无法重新加载最新访谈。请再试一次。",
    invalidInterviewUpdate: "流程助手返回了无效的访谈更新。请重新加载后再试。",
    retryPreviousRequired: "请先完成或重新加载之前的答案，然后再更改。",
    temporaryAnswerError: "暂时无法确认此答案。",
    staleAnswerRebased: "保存此答案前访谈已有更改。请审核后再次发送已还原的答案。",
    staleAnswerNeedsReview: "保存此答案前访谈已有更改。请先审核最新问题再继续。",
    answerTooLong: "请将答案限制在 8,000 个字符以内。",
    requirements: "需求",
    addFile: "添加需求文件",
    generate: "创建可编辑草稿",
    fileBoundary:
      "文件大小和内容均受限制，并视为不受信任的数据。包含主动内容的 PDF 会被拒绝。发布前必须由人员审核。",
    draftCreated:
      "可编辑草稿已创建。请在构建器和画布中审核、运行验证和模拟，然后提交发布审核。",
    historyNotice:
      "此对话会保存在你的账户。你可日后重新打开，而获授权的信息技术管理员可审阅记录以改进流程助手。",
    recoveryTranscriptNotice:
      "恢复期间，较长的对话会显示最新已保存页面。获授权审阅者可在记录中查看完整对话。",
    v2RollbackNotice:
      "新版流程助手访谈现已停用。待恢复的操作已安全解除；你可以开始标准引导式访谈。",
  },
};

async function templateCopilotApiResponse(path: string, init: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers:
      init.body instanceof FormData
        ? init.headers
        : { "content-type": "application/json", ...init.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { response, payload };
}

async function discoverTemplateCopilotStartSchemaVersion(): Promise<TemplateCopilotStartSchemaVersion> {
  const response = await fetch("/api/template-authoring/copilot/sessions", {
    method: "HEAD",
    cache: "no-store",
  });
  const declared = response.headers.get("X-Template-Copilot-Schema-Version");
  if (!response.ok || (declared !== "1" && declared !== "2")) {
    const error = new Error("The Template Copilot start mode could not be confirmed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return declared === "2" ? 2 : 1;
}

/** V2 uses a bounded error surface because failures can be replayed or
 * reconciled.  Keep this path separate from the established v1 UI contract. */
async function api(path: string, init: RequestInit) {
  const { response, payload } = await templateCopilotApiResponse(path, init);
  if (!response.ok) {
    throw templateCopilotApiErrorFromResponse(response.status, payload);
  }
  return payload;
}

/** Exact legacy error behavior for v1-only endpoints.  The old Copilot showed
 * the route's safe message, rather than replacing it with a new v2 sentence. */
async function legacyApi(path: string, init: RequestInit) {
  const { response, payload } = await templateCopilotApiResponse(path, init);
  if (!response.ok) {
    const error = payload.error as { message?: unknown } | undefined;
    throw new Error(typeof error?.message === "string" ? error.message : "The Template Copilot request failed.");
  }
  return payload;
}

/** The POST repeats the server-owned schema header so a rollout race between
 * the read-only capability probe and mutation still selects safe v1/v2 error
 * handling without allowing a client write opt-in. */
async function startApi(path: string, init: RequestInit) {
  const { response, payload } = await templateCopilotApiResponse(path, init);
  if (!response.ok) {
    if (response.headers.get("X-Template-Copilot-Schema-Version") === "1") {
      const error = payload.error as { message?: unknown } | undefined;
      const legacyError = new Error(typeof error?.message === "string" ? error.message : "The Template Copilot request failed.") as Error & { status?: number };
      legacyError.status = response.status;
      throw legacyError;
    }
    throw templateCopilotApiErrorFromResponse(response.status, payload);
  }
  return payload;
}

function messageId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function chatMessagesFromStored(input: unknown): ChatMessage[] | null {
  return parseTemplateCopilotClientChatMessages(input);
}

function mergeChatMessages(current: ChatMessage[], authoritative: ChatMessage[]) {
  return mergeTemplateCopilotClientChatMessages(current, authoritative);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"
    >
      {message}
    </p>
  );
}
