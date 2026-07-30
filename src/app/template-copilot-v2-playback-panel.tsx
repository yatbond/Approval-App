"use client";

import type {
  TemplateCopilotV2Playback,
  TemplateCopilotV2PlaybackIssue,
} from "@/lib/template-copilot-v2-playback";

type Locale = "en" | "zh-Hant" | "zh-Hans";

export function TemplateCopilotV2PlaybackPanel({
  playback,
  locale,
}: {
  playback: TemplateCopilotV2Playback;
  locale: Locale;
}) {
  const copy = copyFor(locale);
  const readiness = [
    ["interview", copy.interview, playback.interview.state],
    ["draft", copy.draft, playback.readiness.draft],
    ["publication", copy.publication, playback.readiness.publication],
    ["activation", copy.activation, playback.readiness.activation],
  ] as const;
  const issueGroups = [
    [copy.assumptions, playback.assumptions, copy.noAssumptions],
    [copy.notApplicable, playback.notApplicable, copy.none],
    [copy.conflicts, playback.conflicts, copy.none],
    [copy.unresolved, playback.unresolved, copy.none],
    [copy.compilerErrors, playback.compilerErrors, copy.none],
    [copy.warnings, playback.warnings, copy.none],
  ] as const;

  return (
    <section
      aria-labelledby="copilot-final-playback-title"
      className="mt-4 space-y-4 rounded-md border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-neutral-950"
    >
      <div>
        <h3
          id="copilot-final-playback-title"
          className="font-semibold text-neutral-900 dark:text-white"
        >
          {copy.title}
        </h3>
        <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
          {copy.description}
        </p>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
          {playback.sourceRevision === null
            ? copy.revisionUnavailable
            : `${copy.exactRevision}: ${playback.sourceRevision}`}
          {" · "}
          {copy.savedDecisions.replace(
            "{count}",
            String(playback.interview.answeredDecisionCount),
          )}
        </p>
      </div>

      <div
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        aria-label={copy.readiness}
      >
        {readiness.map(([id, label, state]) => (
          <div
            key={id}
            className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              {label}
            </p>
            <p
              className={`mt-1 text-sm font-semibold ${
                state === "ready" || state === "complete"
                  ? "text-emerald-800 dark:text-emerald-200"
                  : state === "blocked"
                    ? "text-rose-800 dark:text-rose-200"
                    : "text-amber-800 dark:text-amber-200"
              }`}
            >
              {readinessLabel(state, copy)}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {playback.sections.map((section) => (
          <section
            key={section.id}
            className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <h4 className="font-medium text-neutral-900 dark:text-white">
              {section.title}
            </h4>
            <ol className="mt-2 space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
              {section.items.map((item, index) => (
                <li key={`${item.factId}:${index}`}>
                  <p className="whitespace-pre-wrap break-words">
                    {item.text}
                  </p>
                  <p className="mt-0.5 break-all text-xs text-neutral-500 dark:text-neutral-400">
                    {copy.evidence}:{" "}
                    {item.evidence.length === 0
                      ? copy.none
                      : item.evidence.map((evidence, evidenceIndex) => (
                          <span key={`${evidence.kind}:${evidence.sourceId}`}>
                            {evidenceIndex > 0 ? ", " : ""}
                            {evidence.sourceMessageIds.length > 0
                              ? evidence.sourceMessageIds.map(
                                  (messageId, messageIndex) => (
                                    <span key={messageId}>
                                      {messageIndex > 0 ? ", " : ""}
                                      <a
                                        href={`#copilot-message-${messageId}`}
                                        className="underline decoration-dotted underline-offset-2"
                                      >
                                        {evidence.kind}:{evidence.sourceId}
                                      </a>
                                    </span>
                                  ),
                                )
                              : `${evidence.kind}:${evidence.sourceId}`}
                            {evidence.excerpt
                              ? ` — ${evidence.excerpt}`
                              : ""}
                          </span>
                        ))}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {issueGroups.map(([title, items, empty]) => (
          <IssueGroup
            key={title}
            title={title}
            items={items}
            empty={empty}
          />
        ))}
      </div>

      <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-800 dark:bg-neutral-900 dark:text-amber-100">
        {copy.lifecycleBoundary}
      </p>
    </section>
  );
}

function IssueGroup({
  title,
  items,
  empty,
}: {
  title: string;
  items: readonly TemplateCopilotV2PlaybackIssue[];
  empty: string;
}) {
  return (
    <section className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="font-medium text-neutral-900 dark:text-white">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          {empty}
        </p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
          {items.map((item, index) => (
            <li key={`${item.factId || "global"}:${item.code}:${index}`}>
              <span className="font-medium">{item.label}</span>
              {": "}
              {item.detail}
              <span className="sr-only"> ({item.code})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function readinessLabel(
  state: "question" | "complete" | "ready" | "blocked" | "not_ready",
  copy: ReturnType<typeof copyFor>,
) {
  if (state === "complete") return copy.complete;
  if (state === "question") return copy.inProgress;
  if (state === "ready") return copy.ready;
  if (state === "blocked") return copy.blocked;
  return copy.notReady;
}

function copyFor(locale: Locale) {
  if (locale === "zh-Hant") {
    return {
      title: "最終流程預覽及就緒狀態",
      description:
        "以下內容只來自已儲存的權威事實。建議、未知資料及模型文字不會成為可執行規則。",
      readiness: "就緒狀態",
      interview: "訪談進度",
      draft: "可建立草稿",
      publication: "可發佈",
      activation: "可啟用",
      ready: "可進行",
      complete: "已完成",
      inProgress: "進行中",
      blocked: "受阻",
      notReady: "尚未就緒",
      assumptions: "假設",
      noAssumptions: "沒有系統建立的假設。",
      notApplicable: "不適用決定",
      conflicts: "衝突",
      unresolved: "未解決項目",
      compilerErrors: "編譯錯誤",
      warnings: "提示",
      none: "沒有",
      evidence: "來源",
      exactRevision: "目前精確修訂",
      revisionUnavailable: "未提供修訂資料",
      savedDecisions: "已儲存 {count} 個訪談決定",
      lifecycleBoundary:
        "完成訪談不代表已發佈或啟用。建立草稿、提交發佈審核、批准、發佈及啟用，均須由獲授權人員針對當時的精確修訂明確執行。",
    };
  }
  if (locale === "zh-Hans") {
    return {
      title: "最终流程预览及就绪状态",
      description:
        "以下内容只来自已保存的权威事实。建议、未知信息及模型文字不会成为可执行规则。",
      readiness: "就绪状态",
      interview: "访谈进度",
      draft: "可创建草稿",
      publication: "可发布",
      activation: "可启用",
      ready: "可以继续",
      complete: "已完成",
      inProgress: "进行中",
      blocked: "已阻塞",
      notReady: "尚未就绪",
      assumptions: "假设",
      noAssumptions: "没有系统创建的假设。",
      notApplicable: "不适用决定",
      conflicts: "冲突",
      unresolved: "未解决项目",
      compilerErrors: "编译错误",
      warnings: "提示",
      none: "没有",
      evidence: "来源",
      exactRevision: "当前精确修订",
      revisionUnavailable: "未提供修订信息",
      savedDecisions: "已保存 {count} 个访谈决定",
      lifecycleBoundary:
        "完成访谈不代表已发布或启用。创建草稿、提交发布审核、批准、发布及启用，都须由获授权人员针对当时的精确修订明确执行。",
    };
  }
  return {
    title: "Final workflow playback and readiness",
    description:
      "This is generated only from saved authoritative facts. Suggestions, unknowns, and model prose cannot become executable rules.",
    readiness: "Readiness states",
    interview: "Interview progress",
    draft: "Draft-ready",
    publication: "Publication-ready",
    activation: "Activation-ready",
    ready: "Ready",
    complete: "Complete",
    inProgress: "In progress",
    blocked: "Blocked",
    notReady: "Not ready",
    assumptions: "Assumptions",
    noAssumptions: "No system-created assumptions.",
    notApplicable: "Not-applicable decisions",
    conflicts: "Conflicts",
    unresolved: "Unresolved items",
    compilerErrors: "Compiler errors",
    warnings: "Warnings",
    none: "None",
    evidence: "Evidence",
    exactRevision: "Current exact revision",
    revisionUnavailable: "Revision unavailable",
    savedDecisions: "{count} interview decisions saved",
    lifecycleBoundary:
      "Finishing the interview does not publish or activate anything. Creating a draft, requesting publication review, approving, publishing, and activating each require an explicit authorized human action against the exact current revision.",
  };
}
