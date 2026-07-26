"use client";

import { useMemo, useRef, useState } from "react";
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
import {
  templateCopilotLocales,
  type TemplateCopilotLocale,
} from "@/lib/template-copilot-plan";
import { TemplateCopilotHistoryPanel } from "./template-copilot-history-panel";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type CopilotState = {
  sessionId: string;
  revision: number;
  status: "interviewing" | "ready" | "draft_created";
  ledger: TemplateCopilotLedger;
};

type DraftReviewState = {
  familyId: string;
  draftId: string;
  revision: number;
  dossier: TemplateRequirementsDossierV1;
  definition: TemplateDefinitionV1;
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
  const selectedBusiness =
    availableBusinesses.find(
      (business) => business.id === selectedBusinessUnitId,
    ) || availableBusinesses[0];
  const businessUnitId = selectedBusiness?.id || "";
  const [selectedDepartmentName, setDepartmentName] = useState("");
  const departmentName =
    selectedBusiness?.departments.includes(selectedDepartmentName)
      ? selectedDepartmentName
      : selectedBusiness?.departments[0] || "";
  const [state, setState] = useState<CopilotState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftReview, setDraftReview] = useState<DraftReviewState | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const locale = state?.ledger.locale || selectedLocale;
  const copy = templateCopilotCopy[locale];

  const completed = useMemo(
    () =>
      state
        ? templateCopilotSectionIds.filter(
            (id) => state.ledger.sections[id].status !== "missing",
          ).length
        : 0,
    [state],
  );

  async function start() {
    if (!businessUnitId || !departmentName) return;
    const command = templateCopilotStartSchema.safeParse({
      businessUnitId,
      departmentName,
      locale: selectedLocale,
      clientMessageId: messageId("start"),
    });
    if (!command.success) {
      setError(
        copy.directoryLoadingError,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await api("/api/template-authoring/copilot/sessions", {
        method: "POST",
        body: JSON.stringify(command.data),
      });
      const next = {
        sessionId: String(response.sessionId),
        revision: Number(response.revision),
        status: String(response.status) as CopilotState["status"],
        ledger: response.ledger as TemplateCopilotLedger,
      };
      setState(next);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: String(response.assistantMessage),
        },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const message = draft.trim();
    if (!state || !message || busy) return;
    const id = messageId("turn");
    setDraft("");
    setMessages((current) => [
      ...current,
      { id, role: "user", content: message },
    ]);
    setBusy(true);
    setError("");
    try {
      const response = await api(
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
        {
          id: `${id}-assistant`,
          role: "assistant",
          content: String(response.assistantMessage),
        },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (!state || busy) return;
    const form = new FormData();
    form.set("file", file);
    form.set("expectedRevision", String(state.revision));
    form.set("clientMessageId", messageId("document"));
    setBusy(true);
    setError("");
    try {
      const response = await api(
        `/api/template-authoring/copilot/sessions/${state.sessionId}/documents`,
        { method: "POST", body: form },
      );
      setState((current) =>
        current
          ? {
              ...current,
              revision: Number(response.revision),
              ledger: response.ledger as TemplateCopilotLedger,
            }
          : current,
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: `Uploaded ${file.name}`,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: String(response.assistantMessage),
        },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function createDraft() {
    if (!state || state.status !== "ready" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await api(
        `/api/template-authoring/copilot/sessions/${state.sessionId}/create-draft`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: state.revision,
            idempotencyKey: messageId("create-draft"),
          }),
        },
      );
      setDraftReview({
        familyId: String(response.familyId),
        draftId: String(response.draftId),
        revision: Number(response.authoringRevision || 1),
        dossier: response.dossier as TemplateRequirementsDossierV1,
        definition: response.definition as TemplateDefinitionV1,
      });
      setReviewDirty(false);
      setState((current) =>
        current
          ? {
              ...current,
              revision: Number(response.revision),
              status: "draft_created",
            }
          : current,
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            dossierReviewCopy[locale].reviewBeforeBuilder,
        },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveDossierReview() {
    if (!draftReview || busy) return;
    setBusy(true);
    setError("");
    try {
      const definition: TemplateDefinitionV1 = {
        ...draftReview.definition,
        template: {
          ...draftReview.definition.template,
          name: draftReview.dossier.title,
        },
        generation: {
          ...draftReview.definition.generation,
          unresolvedQuestionIds: draftReview.dossier.openQuestions
            .filter((question) => !question.answer?.trim())
            .map((question) => question.id),
        },
      };
      const response = await api(
        `/api/template-authoring/drafts/${draftReview.draftId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedRevision: draftReview.revision,
            dossier: draftReview.dossier,
            definition,
            changeReason:
              "Human-reviewed requirements dossier updated before visual workflow editing.",
            idempotencyKey: messageId("dossier-review"),
          }),
        },
      );
      setDraftReview((current) =>
        current
          ? {
              ...current,
              revision: Number(response.revision),
              definition,
            }
          : current,
      );
      setReviewDirty(false);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: dossierReviewCopy[locale].saved,
        },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
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
            <h3 className="font-semibold text-neutral-900">{copy.title}</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {copy.description}
            </p>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              {copy.historyNotice}
            </p>
            {!availableBusinesses.length && (
              <p role="status" className="mt-3 text-sm text-amber-700">
                {copy.directoryLoading}
              </p>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm text-neutral-700">
                {copy.language}
                <select
                  value={selectedLocale}
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
              disabled={busy || !businessUnitId || !departmentName}
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
              <p className="whitespace-pre-wrap">{message.content}</p>
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
          <div className="mt-3 flex gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              disabled={busy || state.status === "ready"}
              aria-label={copy.answerLabel}
              rows={3}
              className="template-copilot-control min-h-20 flex-1 resize-y rounded-md border border-[#d8d8d8] bg-white p-3 text-sm"
              placeholder={
                state.status === "ready"
                  ? copy.confirmed
                  : copy.answerPlaceholder
              }
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !draft.trim() || state.status === "ready"}
              aria-label={copy.send}
              className="min-h-11 self-end rounded-md bg-emerald-700 px-4 py-3 text-white disabled:opacity-50"
            >
              <Send aria-hidden="true" size={18} />
            </button>
          </div>
        )}
        {error && <ErrorMessage message={error} />}
      </div>
      <aside className="rounded-md border border-[#e2e8e5] bg-white p-3">
        <h4 className="font-semibold text-neutral-900">
          {copy.requirements} {completed}/{templateCopilotSectionIds.length}
        </h4>
        <ul className="mt-3 space-y-2 text-xs">
          {templateCopilotSectionIds.map((id) => {
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
        </ul>
        <input
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
          disabled={busy}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#d8d8d8] px-3 py-2 text-sm text-neutral-700 disabled:opacity-50"
        >
          <FileUp aria-hidden="true" size={16} />
          {copy.addFile}
        </button>
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
        <p className="mt-3 text-xs leading-5 text-neutral-500">
          {copy.fileBoundary}
        </p>
        <p className="mt-3 border-t border-[#e6e6e6] pt-3 text-xs leading-5 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {copy.historyNotice}
        </p>
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
          <h4 className="font-semibold text-neutral-900">{copy.title}</h4>
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
        <h5 className="text-sm font-semibold text-neutral-900">
          {copy.compiledCoverage}
        </h5>
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
          <h5 className="text-sm font-semibold text-neutral-900">
            {copy.assumptions}
          </h5>
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
          <h5 className="text-sm font-semibold text-neutral-900">
            {copy.openQuestions}
          </h5>
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
        <h5 className="text-sm font-semibold text-neutral-900">
          {copy.citations} ({dossier.citations.length})
        </h5>
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
    requirements: string;
    addFile: string;
    generate: string;
    fileBoundary: string;
    draftCreated: string;
    historyNotice: string;
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
    requirements: "Requirements",
    addFile: "Add requirements file",
    generate: "Generate editable draft",
    fileBoundary:
      "Files are bounded and treated as untrusted data. PDF active content is rejected. Human review is always required before publication.",
    draftCreated:
      "Editable draft created. Review it in Builder and Canvas, run validation and simulation, then send it for publication review.",
    historyNotice:
      "This conversation is saved with your account. You can reopen it later, and authorized IT administrators may review it to improve the Copilot.",
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
    requirements: "需求",
    addFile: "加入需求文件",
    generate: "建立可編輯草稿",
    fileBoundary:
      "文件大小及內容均受限制，並視為不受信任的資料。含主動內容的 PDF 會被拒絕。發布前必須由人員審核。",
    draftCreated:
      "可編輯草稿已建立。請在建構器及畫布中審核、執行驗證和模擬，然後提交發布審核。",
    historyNotice:
      "此對話會儲存在你的帳戶。你可日後重新開啟，而獲授權的資訊科技管理員可審閱記錄以改進流程助理。",
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
    requirements: "需求",
    addFile: "添加需求文件",
    generate: "创建可编辑草稿",
    fileBoundary:
      "文件大小和内容均受限制，并视为不受信任的数据。包含主动内容的 PDF 会被拒绝。发布前必须由人员审核。",
    draftCreated:
      "可编辑草稿已创建。请在构建器和画布中审核、运行验证和模拟，然后提交发布审核。",
    historyNotice:
      "此对话会保存在你的账户。你可日后重新打开，而获授权的信息技术管理员可审阅记录以改进流程助手。",
  },
};

async function api(path: string, init: RequestInit) {
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
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new Error(error?.message || "The Template Copilot request failed.");
  }
  return payload;
}

function messageId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
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
