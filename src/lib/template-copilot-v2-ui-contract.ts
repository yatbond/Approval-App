import type { TemplateCopilotV2InterviewState } from "./template-copilot-question-library.ts";

/** The UI may accept an answer only for a real, server-selected question.
 * Terminal and recovery states deliberately have no text, choice, or send
 * control, regardless of stale draft text held by the browser. */
export function getTemplateCopilotV2InputMode(interview: TemplateCopilotV2InterviewState) {
  return interview.state === "question" && interview.nextQuestion?.questionId && interview.nextQuestion.primaryDecisionId
    ? "answerable" as const
    : interview.state === "complete"
      ? "complete" as const
      : "blocked" as const;
}

export function getTemplateCopilotV2ComposerContract(interview: TemplateCopilotV2InterviewState) {
  const mode = getTemplateCopilotV2InputMode(interview);
  if (mode !== "answerable") return Object.freeze({ mode, showTextComposer: false, showChoiceButtons: false });
  return Object.freeze({
    mode,
    showTextComposer: !interview.nextQuestion?.options?.length,
    showChoiceButtons: Boolean(interview.nextQuestion?.options?.length),
  });
}

/** Shared render contract so the legacy free-text interview remains intact
 * while v2 is constrained to the server-selected question shape. */
export function getTemplateCopilotComposerRenderContract({ schemaVersion, status, interview }: {
  schemaVersion: 1 | 2;
  status: string;
  interview?: TemplateCopilotV2InterviewState;
}) {
  if (schemaVersion === 1) return Object.freeze({ mode: status === "draft_created" ? "complete" as const : "answerable" as const, showTextComposer: status !== "draft_created", showChoiceButtons: false });
  if (!interview) return Object.freeze({ mode: "blocked" as const, showTextComposer: false, showChoiceButtons: false });
  return getTemplateCopilotV2ComposerContract(interview);
}

export function getTemplateCopilotAnswerLimit(schemaVersion: 1 | 2) {
  return schemaVersion === 2 ? 8_000 : 16_000;
}

/** Step 4 is a server-owned presentation capability. When disabled, an
 * existing v2.1 choice stays answerable through a typed fallback; the client
 * still maps an exact label back to the server-owned option ID before writing. */
export function getTemplateCopilotV2Step4RenderContract({
  schemaVersion,
  hasInteraction,
  enabled,
}: {
  schemaVersion: 1 | 2;
  hasInteraction: boolean;
  enabled: boolean;
}) {
  const enhanced = schemaVersion === 2 && hasInteraction && enabled;
  return Object.freeze({
    enhanced,
    plainTypedFallback: schemaVersion === 2 && hasInteraction && !enabled,
  });
}
