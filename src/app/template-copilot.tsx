"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, FileUp, Send, Sparkles } from "lucide-react";
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
      const template = {
        ...workflowTemplateFromDefinition(
          response.definition as TemplateDefinitionV1,
        ),
        authoringFamilyId: String(response.familyId),
        authoringDraftId: String(response.draftId),
        authoringRevision: 1,
        authoringDossier:
          response.dossier as TemplateRequirementsDossierV1,
      };
      onDraftCreated(template);
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
            copy.draftCreated,
        },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <section className="rounded-md border border-[#d9e4df] bg-[#f7fbf9] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
            <Bot aria-hidden="true" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-neutral-900">{copy.title}</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {copy.description}
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
                  className="mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
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
                  className="mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
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
                  className="mt-1 min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3"
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
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={copy.title}
      className="grid gap-4 rounded-md border border-[#d9e4df] bg-[#f7fbf9] p-4 lg:grid-cols-[minmax(0,1fr)_280px]"
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
                  ? "mr-8 rounded-md bg-[#f1f6f3] p-3 text-sm text-neutral-800"
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
              className="min-h-20 flex-1 resize-y rounded-md border border-[#d8d8d8] bg-white p-3 text-sm"
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
      </aside>
    </section>
  );
}

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
