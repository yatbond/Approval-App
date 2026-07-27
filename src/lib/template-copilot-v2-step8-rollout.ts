export const templateCopilotV2Step8Rollout = Object.freeze({
  candidateQuestionLibraryVersion: "v2.2" as const,
  lastApprovedQuestionLibraryVersion: "v2.1" as const,
  preferredNewSessionVersion: "v2.1" as const,
  status: "pending_human_review" as "pending_human_review" | "approved" | "rolled_back",
  enabledCandidateLocales: Object.freeze([] as Array<"en" | "zh-Hant" | "zh-Hans">),
});

export function getTemplateCopilotPreferredQuestionLibraryVersion() {
  return templateCopilotV2Step8Rollout.preferredNewSessionVersion;
}

export function isTemplateCopilotV2Step8LocaleEnabled(locale: "en" | "zh-Hant" | "zh-Hans") {
  return templateCopilotV2Step8Rollout.enabledCandidateLocales.includes(locale);
}

export function evaluateTemplateCopilotV2Step8LocaleGate({
  rolloutEnabled,
  questionReview,
  conceptReady,
}: {
  rolloutEnabled: boolean;
  questionReview?: {
    status: "pending" | "approved" | "rejected";
    reviewerType: "human";
    reviewer: string;
    reviewedAt?: string;
    evidenceRef?: string;
  };
  conceptReady: boolean;
}) {
  return Boolean(
    rolloutEnabled
    && conceptReady
    && questionReview?.status === "approved"
    && questionReview.reviewerType === "human"
    && questionReview.reviewedAt
    && questionReview.evidenceRef
    && !/\b(?:ai|model|system|automated|pending|unassigned)\b/iu.test(questionReview.reviewer),
  );
}
