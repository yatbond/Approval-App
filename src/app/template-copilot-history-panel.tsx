"use client";

import { History, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import type {
  TemplateCopilotSessionSummary,
  TemplateCopilotTranscript,
} from "@/lib/template-copilot-history";
import { compareTemplateCopilotTimestamps } from "@/lib/template-copilot-history";
import { mergeTemplateCopilotSessionSummaries } from "@/lib/template-copilot-history";
import type { TemplateCopilotLocale } from "@/lib/template-copilot-plan";
import { fetchTemplateCopilotApi } from "@/lib/template-copilot-client";
import {
  CopilotTranscript,
  formatCopilotDateTime,
} from "./copilot-transcript";

export function TemplateCopilotHistoryPanel({
  locale,
}: {
  locale: TemplateCopilotLocale;
}) {
  const copy = historyCopy[locale];
  const formattingLocale =
    locale === "zh-Hant" ? "zh-HK" : locale === "zh-Hans" ? "zh-CN" : "en-HK";
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] =
    useState<TemplateCopilotSessionSummary[] | null>(null);
  const [sessionPage, setSessionPage] = useState<{ hasMore: boolean; nextCursor: string | null } | null>(null);
  const [selected, setSelected] =
    useState<TemplateCopilotTranscript | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory(cursor?: string) {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      const payload = await fetchTemplateCopilotApi<{
        sessions: TemplateCopilotSessionSummary[]; page?: { hasMore?: boolean; nextCursor?: string | null };
      }>(
        `/api/template-authoring/copilot/sessions?view=mine&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setSessions((current) => cursor ? mergeTemplateCopilotSessionSummaries(current || [], payload.sessions || []) : (payload.sessions || []));
      setSessionPage({ hasMore: Boolean(payload.page?.hasMore), nextCursor: payload.page?.nextCursor || null });
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }

  async function openTranscript(sessionId: string) {
    setBusy(true);
    setError("");
    try {
      const payload = await fetchTemplateCopilotApi<{
        session: TemplateCopilotTranscript;
      }>(
        `/api/template-authoring/copilot/sessions/${sessionId}?messageLimit=100`,
      );
      setSelected(payload.session);
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreTranscript() {
    if (!selected?.messagePage.hasMore || !selected.messagePage.nextCursor) return;
    setBusy(true);
    setError("");
    try {
      const payload = await fetchTemplateCopilotApi<{ session: TemplateCopilotTranscript }>(
        `/api/template-authoring/copilot/sessions/${selected.id}?messageLimit=${selected.messagePage.limit}&messageCursor=${encodeURIComponent(selected.messagePage.nextCursor)}`,
      );
      setSelected((current) => current && current.id === payload.session.id ? {
        ...payload.session,
        messages: mergeTranscriptMessages(current.messages, payload.session.messages),
      } : current);
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-md border border-[#d9e4df] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
            <History aria-hidden="true" size={17} />
            {copy.title}
          </h4>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {copy.description}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            if (sessions) {
              setOpen(true);
              return;
            }
            void loadHistory();
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d2d2d2] px-3 text-sm text-neutral-800 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-100"
        >
          {busy ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
          ) : (
            <History aria-hidden="true" size={16} />
          )}
          {open ? copy.hide : copy.open}
        </button>
      </div>

      {open ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                {copy.recent}
              </p>
              <button
                type="button"
                onClick={() => void loadHistory()}
                disabled={busy}
                aria-label={copy.refresh}
                className="flex size-10 items-center justify-center rounded-md border border-[#e6e6e6] disabled:opacity-50 dark:border-neutral-700"
              >
                <RefreshCw aria-hidden="true" size={15} />
              </button>
            </div>
            <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {(sessions || []).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void openTranscript(session.id)}
                  className={`block w-full rounded-md border p-3 text-left text-sm transition ${
                    selected?.id === session.id
                      ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-400/10"
                      : "border-[#e6e6e6] hover:border-emerald-400/60 dark:border-neutral-700"
                  }`}
                >
                  <span className="block font-medium text-neutral-900 dark:text-neutral-100">
                    {session.businessName} / {session.departmentName}
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                    {copy.status[session.status]} ·{" "}
                    {formatCopilotDateTime(
                      session.updatedAt,
                      formattingLocale,
                    )}
                  </span>
                </button>
              ))}
              {sessions && !sessions.length ? (
                <p className="rounded-md border border-dashed border-[#d2d2d2] p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  {copy.none}
                </p>
              ) : null}
              {sessionPage?.hasMore && sessionPage.nextCursor ? <button type="button" disabled={busy} onClick={() => void loadHistory(sessionPage.nextCursor || undefined)} className="w-full min-h-10 rounded-md border border-[#d2d2d2] px-3 text-sm text-neutral-800 dark:border-neutral-700 dark:text-neutral-100">{copy.loadMoreSessions}</button> : null}
            </div>
          </div>
          <div>
            {selected ? (
              <>
                <div className="mb-2">
                  <h5 className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {selected.businessName} / {selected.departmentName}
                  </h5>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {copy.readOnly} · {copy.status[selected.status]}
                  </p>
                </div>
                <CopilotTranscript
                  transcript={selected}
                  userLabel={copy.you}
                  copilotLabel={copy.copilot}
                  emptyLabel={copy.emptyTranscript}
                  locale={formattingLocale}
                />
                {selected.messagePage.hasMore ? (
                  <button type="button" disabled={busy} onClick={() => void loadMoreTranscript()} className="mt-3 inline-flex min-h-10 items-center rounded-md border border-[#d2d2d2] px-3 text-sm text-neutral-800 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-100">
                    {copy.loadMoreMessages}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="rounded-md border border-dashed border-[#d2d2d2] p-5 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                {copy.select}
              </p>
            )}
          </div>
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

const historyCopy: Record<
  TemplateCopilotLocale,
  {
    title: string;
    description: string;
    open: string;
    hide: string;
    recent: string;
    refresh: string;
    none: string;
    select: string;
    readOnly: string;
    you: string;
    copilot: string;
    emptyTranscript: string;
    loadMoreSessions: string;
    loadMoreMessages: string;
    unavailable: string;
    status: Record<TemplateCopilotSessionSummary["status"], string>;
  }
> = {
  en: {
    title: "Saved Copilot conversations",
    description:
      "Reopen your own read-only interview history, including conversations that already created a draft.",
    open: "View history",
    hide: "Hide history",
    recent: "Recent sessions",
    refresh: "Refresh saved Copilot conversations",
    none: "You do not have any saved Copilot conversations yet.",
    select: "Select a saved conversation to read its transcript.",
    readOnly: "Read-only saved transcript",
    you: "You",
    copilot: "Copilot",
    emptyTranscript: "No messages were saved for this session.",
    loadMoreSessions: "Load more conversations",
    loadMoreMessages: "Load more messages",
    unavailable: "Saved conversations are temporarily unavailable. Please try again.",
    status: {
      interviewing: "Interview in progress",
      ready: "Requirements confirmed",
      draft_created: "Draft created",
      closed: "Closed",
    },
  },
  "zh-Hant": {
    title: "已儲存的流程助理對話",
    description:
      "重新開啟你本人的唯讀訪談記錄，包括已建立草稿的對話。",
    open: "查看記錄",
    hide: "隱藏記錄",
    recent: "最近對話",
    refresh: "重新載入已儲存的流程助理對話",
    none: "你尚未有已儲存的流程助理對話。",
    select: "請選擇一個已儲存的對話以閱讀記錄。",
    readOnly: "唯讀已儲存記錄",
    you: "你",
    copilot: "流程助理",
    emptyTranscript: "此對話沒有已儲存訊息。",
    loadMoreSessions: "載入更多對話",
    loadMoreMessages: "載入更多訊息",
    unavailable: "暫時無法載入已儲存的對話，請再試一次。",
    status: {
      interviewing: "訪談進行中",
      ready: "需求已確認",
      draft_created: "草稿已建立",
      closed: "已關閉",
    },
  },
  "zh-Hans": {
    title: "已保存的流程助手对话",
    description:
      "重新打开你本人的只读访谈记录，包括已创建草稿的对话。",
    open: "查看记录",
    hide: "隐藏记录",
    recent: "最近对话",
    refresh: "重新加载已保存的流程助手对话",
    none: "你还没有已保存的流程助手对话。",
    select: "请选择一个已保存的对话以阅读记录。",
    readOnly: "只读已保存记录",
    you: "你",
    copilot: "流程助手",
    emptyTranscript: "此对话没有已保存消息。",
    loadMoreSessions: "加载更多对话",
    loadMoreMessages: "加载更多消息",
    unavailable: "暂时无法加载已保存的对话，请再试一次。",
    status: {
      interviewing: "访谈进行中",
      ready: "需求已确认",
      draft_created: "草稿已创建",
      closed: "已关闭",
    },
  },
};

function mergeTranscriptMessages(
  current: TemplateCopilotTranscript["messages"],
  incoming: TemplateCopilotTranscript["messages"],
) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => {
    const timeOrder = compareTemplateCopilotTimestamps(left.createdAt, right.createdAt);
    if (timeOrder !== 0) return timeOrder;
    if (left.clientMessageId === right.clientMessageId && left.role !== right.role) return left.role === "user" ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}
