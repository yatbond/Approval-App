import {
  getTemplateCopilotConceptReviewSummary,
  isTemplateCopilotConceptLocaleProductionReady,
} from "./template-copilot-concepts.ts";
import {
  evaluateTemplateCopilotV2Step8LocaleGate,
  isTemplateCopilotV2Step8LocaleEnabled,
  isTemplateCopilotV2Step8QualificationLocaleEnabled,
} from "./template-copilot-v2-step8-rollout.ts";

export const templateCopilotV2Step8QuestionContentReview = Object.freeze({
  scope: "all_localized_question_content" as const,
  questionCount: 316,
  contentFingerprint: "fnv1a64:df415823535ac40f",
  locales: Object.freeze({
    en: Object.freeze({
      status: "approved" as const,
      reviewerType: "human" as const,
      reviewer: "ST",
      reviewedAt: "2026-07-29T22:49:07+08:00",
      evidenceRef: "Co-Pilot Language/2026-07-28 step-8-language-reviewed by ST.xlsx#sha256=1d5dc68702e39470c3ff519d363ec46d235a3328e96d662df273d5611fd993ed",
    }),
    "zh-Hant": Object.freeze({
      status: "approved" as const,
      reviewerType: "human" as const,
      reviewer: "ST",
      reviewedAt: "2026-07-29T22:49:07+08:00",
      evidenceRef: "Co-Pilot Language/2026-07-28 step-8-language-reviewed by ST.xlsx#sha256=1d5dc68702e39470c3ff519d363ec46d235a3328e96d662df273d5611fd993ed",
    }),
    "zh-Hans": Object.freeze({
      status: "approved" as const,
      reviewerType: "human" as const,
      reviewer: "ST",
      reviewedAt: "2026-07-29T22:49:07+08:00",
      evidenceRef: "Co-Pilot Language/2026-07-28 step-8-language-reviewed by ST.xlsx#sha256=1d5dc68702e39470c3ff519d363ec46d235a3328e96d662df273d5611fd993ed",
    }),
  }),
});

export function isTemplateCopilotQuestionLocaleProductionReady(
  locale: "en" | "zh-Hant" | "zh-Hans",
) {
  return evaluateTemplateCopilotV2Step8LocaleGate({
    rolloutEnabled: isTemplateCopilotV2Step8LocaleEnabled(locale),
    questionReview: templateCopilotV2Step8QuestionContentReview.locales[locale],
    conceptReady: isTemplateCopilotConceptLocaleProductionReady(locale, "concepts.v1.0"),
  });
}

export function isTemplateCopilotQuestionLocaleQualificationReady(
  locale: "en" | "zh-Hant" | "zh-Hans",
) {
  const conceptReview = getTemplateCopilotConceptReviewSummary("concepts.v1.0");
  return evaluateTemplateCopilotV2Step8LocaleGate({
    rolloutEnabled: isTemplateCopilotV2Step8QualificationLocaleEnabled(locale),
    questionReview: templateCopilotV2Step8QuestionContentReview.locales[locale],
    conceptReady: conceptReview.locales[locale].approved === conceptReview.conceptCount,
  });
}

export function isTemplateCopilotQuestionLibraryStartAllowed(
  questionLibraryVersion: "v2.0" | "v2.1" | "v2.2",
  locale: "en" | "zh-Hant" | "zh-Hans",
) {
  if (questionLibraryVersion !== "v2.2") return true;
  return isTemplateCopilotQuestionLocaleProductionReady(locale)
    || isTemplateCopilotQuestionLocaleQualificationReady(locale);
}

export function getTemplateCopilotQuestionReviewSummary() {
  const locales = Object.fromEntries(Object.entries(templateCopilotV2Step8QuestionContentReview.locales).map(([locale, review]) => [
    locale,
    Object.freeze({
      ...review,
      enabled: isTemplateCopilotV2Step8LocaleEnabled(locale as "en" | "zh-Hant" | "zh-Hans"),
      qualificationEnabled: isTemplateCopilotV2Step8QualificationLocaleEnabled(locale as "en" | "zh-Hant" | "zh-Hans"),
      productionApproved: isTemplateCopilotQuestionLocaleProductionReady(locale as "en" | "zh-Hant" | "zh-Hans"),
    }),
  ])) as Record<"en" | "zh-Hant" | "zh-Hans", {
    status: "pending" | "approved" | "rejected";
    reviewerType: "human";
    reviewer: string;
    reviewedAt?: string;
    evidenceRef?: string;
    enabled: boolean;
    qualificationEnabled: boolean;
    productionApproved: boolean;
  }>;
  return Object.freeze({
    version: "v2.2",
    questionCount: templateCopilotV2Step8QuestionContentReview.questionCount,
    contentFingerprint: templateCopilotV2Step8QuestionContentReview.contentFingerprint,
    locales,
    productionReady: Object.values(locales).every((review) => review.productionApproved),
  });
}
