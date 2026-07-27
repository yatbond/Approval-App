import { BookOpenCheck, CheckCircle2, Languages, ShieldAlert } from "lucide-react";
import { getTemplateCopilotConceptReviewSummary } from "@/lib/template-copilot-concepts";
import { getTemplateCopilotQuestionReviewSummary } from "@/lib/template-copilot-v2-step8-review";

const localeNames = {
  en: "English",
  "zh-Hant": "Hong Kong Traditional Chinese",
  "zh-Hans": "Simplified Chinese",
} as const;

export function AdminCopilotConceptReviewPanel() {
  const summary = getTemplateCopilotConceptReviewSummary();
  const questionReview = getTemplateCopilotQuestionReviewSummary();
  const productionReady = summary.productionReady && Boolean(questionReview?.productionReady);
  return (
    <section className="rounded-md border border-[#e6e6e6] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex items-start gap-2">
        <BookOpenCheck aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
        <div className="min-w-0">
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">Copilot language and help review</h2>
          <p className="mt-1 break-words text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            Read-only evidence for the pinned help library. Runtime AI translation is not used.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Pinned version</p>
          <p className="mt-1 break-all font-mono text-sm text-neutral-900 dark:text-white">{summary.version}</p>
        </div>
        <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Concept topics in review</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">{summary.conceptCount}</p>
        </div>
        <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Guided questions in review</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">{questionReview?.questionCount || 0}</p>
        </div>
        <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Production review gate</p>
          <p className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold ${productionReady ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"}`}>
            {productionReady ? <CheckCircle2 aria-hidden="true" size={16} /> : <ShieldAlert aria-hidden="true" size={16} />}
            {productionReady ? "Passed" : "Pending human approval"}
          </p>
        </div>
      </div>

      {questionReview ? (
        <p className="mt-3 break-all rounded-md border border-neutral-200 p-2 font-mono text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
          Question content: {questionReview.version} · {questionReview.contentFingerprint}<br />
          Concept content: {summary.version} · {summary.contentReviewFingerprint}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2" aria-label="Copilot locale review status">
        {Object.entries(summary.locales).map(([locale, review]) => (
          <li key={locale} className="min-w-0 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-700">
            <div className="flex min-w-0 items-start gap-2">
              <Languages aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-sky-700 dark:text-sky-300" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium text-neutral-900 dark:text-white">{localeNames[locale as keyof typeof localeNames]}</p>
                <p className="mt-1 break-words text-xs text-neutral-600 [overflow-wrap:anywhere] dark:text-neutral-300">
                  {review.approved}/{review.total} concepts approved · Reviewer: {review.reviewer || "Unassigned"} · {review.reviewedAt || "Not reviewed"}
                </p>
                <p className="mt-1 break-words text-xs text-neutral-500 [overflow-wrap:anywhere] dark:text-neutral-400">
                  Concept evidence: {review.evidenceRef || "Not supplied"}
                </p>
                <p className="mt-1 break-words text-xs text-neutral-500 [overflow-wrap:anywhere] dark:text-neutral-400">
                  Guided questions: {questionReview?.locales[locale as keyof typeof questionReview.locales]?.status || "pending"}
                  {" · "}Reviewer: {questionReview?.locales[locale as keyof typeof questionReview.locales]?.reviewer || "Unassigned"}
                  {" · "}Reviewed: {questionReview?.locales[locale as keyof typeof questionReview.locales]?.reviewedAt || "Not reviewed"}
                  {" · "}Evidence: {questionReview?.locales[locale as keyof typeof questionReview.locales]?.evidenceRef || "Not supplied"}
                  {" · "}Locale enabled: {questionReview?.locales[locale as keyof typeof questionReview.locales]?.enabled ? "yes" : "no"}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <details className="mt-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
        <summary className="min-h-10 cursor-pointer content-center text-sm font-medium text-neutral-900 underline underline-offset-2 dark:text-white">
          Review concept IDs and semantic contracts
        </summary>
        <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto" aria-label="Copilot concepts awaiting review">
          {summary.entries.map((entry) => (
            <li key={entry.conceptId} className="min-w-0 rounded border border-neutral-200 p-2 text-xs dark:border-neutral-700">
              <p className="break-all font-mono text-neutral-900 dark:text-white">{entry.conceptId} · v{entry.version}</p>
              <p className="mt-1 break-words text-neutral-600 [overflow-wrap:anywhere] dark:text-neutral-300">
                {entry.labels.en} / {entry.labels["zh-Hant"]} / {entry.labels["zh-Hans"]}
              </p>
              <p className="mt-1 break-all text-neutral-500 dark:text-neutral-400">{entry.semanticContract.join(" · ")}</p>
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-3 break-words rounded-md border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950 dark:border-sky-800 dark:bg-neutral-900 dark:text-sky-100">
        Missing or unapproved localized help never uses model translation. The resolver shows approved fallback content with a visible notice and emits the <span className="font-mono">template_copilot_help_fallback</span> event.
      </p>
    </section>
  );
}
