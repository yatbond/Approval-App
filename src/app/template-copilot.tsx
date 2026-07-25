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
  templateCopilotSectionIds,
  type TemplateCopilotLedger,
} from "@/lib/template-copilot-ledger";

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
      businessDirectory.filter((business) => business.departments.length > 0),
    [businessDirectory],
  );
  const [businessUnitId, setBusinessUnitId] = useState(
    availableBusinesses[0]?.id || "",
  );
  const selectedBusiness = availableBusinesses.find(
    (business) => business.id === businessUnitId,
  );
  const [departmentName, setDepartmentName] = useState(
    selectedBusiness?.departments[0] || "",
  );
  const [state, setState] = useState<CopilotState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
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
    setBusy(true);
    setError("");
    try {
      const response = await api("/api/template-authoring/copilot/sessions", {
        method: "POST",
        body: JSON.stringify({
          businessUnitId,
          departmentName,
          clientMessageId: messageId("start"),
        }),
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
            "Editable draft created. Review it in Builder and Canvas, run validation and simulation, then send it for publication review.",
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
            <h3 className="font-semibold text-neutral-900">Template Copilot</h3>
            <p className="mt-1 text-sm text-neutral-600">
              A guided interview that creates an editable proposal. It cannot
              publish or activate a workflow.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-neutral-700">
                Business
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
                Department
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
              {busy ? "Starting…" : "Start guided interview"}
            </button>
            {error && <ErrorMessage message={error} />}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Template Copilot"
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
                {message.role === "assistant" ? "Copilot" : "You"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
          {busy && (
            <p className="text-sm text-neutral-500" role="status">
              Copilot is working…
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
              aria-label="Your workflow requirement answer"
              rows={3}
              className="min-h-20 flex-1 resize-y rounded-md border border-[#d8d8d8] bg-white p-3 text-sm"
              placeholder={
                state.status === "ready"
                  ? "Requirements confirmed"
                  : "Describe the requirement. Use Shift+Enter for a new line."
              }
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !draft.trim() || state.status === "ready"}
              aria-label="Send answer"
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
          Requirements {completed}/{templateCopilotSectionIds.length}
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
                <span className="capitalize text-neutral-700">
                  {id.replaceAll("_", " ")}
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
          Add requirements file
        </button>
        {state.status === "ready" && (
          <button
            type="button"
            onClick={createDraft}
            disabled={busy}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Sparkles aria-hidden="true" size={16} />
            Generate editable draft
          </button>
        )}
        <p className="mt-3 text-xs leading-5 text-neutral-500">
          Files are bounded and treated as untrusted data. PDF active content
          is rejected. Human review is always required before publication.
        </p>
      </aside>
    </section>
  );
}

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
