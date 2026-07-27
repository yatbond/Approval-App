"use client";

import { BookOpenText, ChevronDown, ChevronUp } from "lucide-react";
import type { TemplateCopilotV2InterviewState } from "@/lib/template-copilot-question-library";

type HelpDetail = NonNullable<NonNullable<TemplateCopilotV2InterviewState["nextQuestion"]>["helpDetail"]>;

export function TemplateCopilotConceptHelp({
  detail,
  open,
  onToggle,
  controlId = "copilot-current-question-help-control",
  panelId = "copilot-current-question-help",
}: {
  detail: HelpDetail;
  open: boolean;
  onToggle: () => void;
  controlId?: string;
  panelId?: string;
}) {
  return (
    <div
      className="mb-2 min-w-0 max-w-full"
      data-concept-id={detail.conceptId}
      data-concept-version={detail.conceptVersion}
      data-concept-library-version={detail.libraryVersion}
    >
      <button
        id={controlId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border border-neutral-500 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
      >
        <BookOpenText aria-hidden="true" size={17} className="shrink-0" />
        <span className="break-words">{open ? detail.controls.close : detail.controls.whatDoesThisMean}</span>
        {open ? <ChevronUp aria-hidden="true" size={16} className="shrink-0" /> : <ChevronDown aria-hidden="true" size={16} className="shrink-0" />}
      </button>
      {open ? (
        <section
          id={panelId}
          role="region"
          aria-labelledby={`${panelId}-title`}
          className="mt-2 min-w-0 max-w-full space-y-3 overflow-hidden rounded-md border border-sky-300 bg-sky-50 p-4 text-sm leading-6 text-sky-950 shadow-sm dark:border-sky-700 dark:bg-neutral-900 dark:text-sky-100"
        >
          <h5 id={`${panelId}-title`} className="break-words font-semibold">
            {detail.plainLabel}
          </h5>
          <div className="min-w-0">
            <p className="font-medium">{detail.controls.explanation}</p>
            <p data-help-section="explanation" className="break-words [overflow-wrap:anywhere]">{detail.explanation}</p>
            <p data-help-section="question-tip" className="mt-1 break-words [overflow-wrap:anywhere]">{detail.questionTip}</p>
          </div>
          <div className="min-w-0">
            <p className="font-medium">{detail.controls.example}</p>
            <p data-help-section="example" className="break-words [overflow-wrap:anywhere]">{detail.example}</p>
          </div>
          <div className="min-w-0">
            <p className="font-medium">{detail.controls.workflowEffect}</p>
            <p data-help-section="workflow-effect" className="break-words [overflow-wrap:anywhere]">{detail.workflowEffect}</p>
          </div>
          {detail.fallback ? (
            <p
              role="status"
              data-help-fallback-reason={detail.fallback.reason}
              className="break-words rounded border border-amber-400 bg-amber-50 p-2 text-amber-950 [overflow-wrap:anywhere] dark:bg-amber-950 dark:text-amber-100"
            >
              {detail.fallback.visibleNotice}
            </p>
          ) : null}
          <p className="sr-only">
            {detail.conceptId}, {detail.libraryVersion}, {detail.displayedLocale}
          </p>
        </section>
      ) : null}
    </div>
  );
}
