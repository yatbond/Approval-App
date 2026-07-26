"use client";

import type {
  TemplateCopilotTranscript,
  TemplateCopilotTranscriptMessage,
} from "@/lib/template-copilot-history";

export function CopilotTranscript({
  transcript,
  userLabel,
  copilotLabel,
  emptyLabel,
  locale,
}: {
  transcript: TemplateCopilotTranscript;
  userLabel: string;
  copilotLabel: string;
  emptyLabel: string;
  locale: string;
}) {
  return (
    <div
      className="max-h-[520px] space-y-3 overflow-y-auto rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900"
      role="log"
      aria-label={`${transcript.businessName} / ${transcript.departmentName}`}
      tabIndex={0}
    >
      {transcript.messages.map((message) => (
        <TranscriptMessage
          key={message.id}
          message={message}
          label={message.role === "assistant" ? copilotLabel : userLabel}
          locale={locale}
        />
      ))}
      {!transcript.messages.length ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {emptyLabel}
        </p>
      ) : null}
    </div>
  );
}

function TranscriptMessage({
  message,
  label,
  locale,
}: {
  message: TemplateCopilotTranscriptMessage;
  label: string;
  locale: string;
}) {
  return (
    <article
      className={
        message.role === "assistant"
          ? "mr-6 rounded-md border border-[#e6e6e6] bg-white p-3 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
          : "ml-6 rounded-md bg-emerald-700 p-3 text-sm text-white"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase opacity-75">{label}</p>
        <time
          dateTime={message.createdAt}
          className="text-[11px] opacity-65"
        >
          {formatDateTime(message.createdAt, locale)}
        </time>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words">{message.content}</p>
    </article>
  );
}

export function formatCopilotDateTime(value: string, locale: string) {
  return formatDateTime(value, locale);
}

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
