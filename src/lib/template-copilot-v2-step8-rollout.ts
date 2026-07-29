export const templateCopilotV2Step8Rollout = Object.freeze({
  candidateQuestionLibraryVersion: "v2.2" as const,
  lastApprovedQuestionLibraryVersion: "v2.1" as const,
  preferredNewSessionVersion: "v2.1" as const,
  status: "approved_pending_accessibility" as "approved_pending_accessibility" | "approved" | "rolled_back",
  enabledCandidateLocales: Object.freeze([] as Array<"en" | "zh-Hant" | "zh-Hans">),
  qualificationCandidateLocales: Object.freeze(["en", "zh-Hant", "zh-Hans"] as Array<"en" | "zh-Hant" | "zh-Hans">),
});

export function resolveTemplateCopilotV2Step8QualificationMode(value: string | undefined) {
  return value === "true";
}

export function isTemplateCopilotV2Step8QualificationModeEnabled() {
  return resolveTemplateCopilotV2Step8QualificationMode(
    process.env.NEXT_PUBLIC_TEMPLATE_COPILOT_V2_STEP8_QUALIFICATION,
  );
}

export function resolveTemplateCopilotV2Step8QualificationDeployment({
  qualificationMode,
  vercelEnvironment,
}: {
  qualificationMode: boolean;
  vercelEnvironment: string | undefined;
}) {
  return qualificationMode && vercelEnvironment === "preview";
}

export function isTemplateCopilotV2Step8QualificationDeploymentEnabled() {
  return resolveTemplateCopilotV2Step8QualificationDeployment({
    qualificationMode: isTemplateCopilotV2Step8QualificationModeEnabled(),
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

export function getTemplateCopilotPreferredQuestionLibraryVersion() {
  return isTemplateCopilotV2Step8QualificationModeEnabled()
    ? templateCopilotV2Step8Rollout.candidateQuestionLibraryVersion
    : templateCopilotV2Step8Rollout.preferredNewSessionVersion;
}

export function isTemplateCopilotV2Step8LocaleEnabled(locale: "en" | "zh-Hant" | "zh-Hans") {
  return templateCopilotV2Step8Rollout.enabledCandidateLocales.includes(locale);
}

export function isTemplateCopilotV2Step8QualificationLocaleEnabled(locale: "en" | "zh-Hant" | "zh-Hans") {
  return isTemplateCopilotV2Step8QualificationDeploymentEnabled()
    && templateCopilotV2Step8Rollout.qualificationCandidateLocales.includes(locale);
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
