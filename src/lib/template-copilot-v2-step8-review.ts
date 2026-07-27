import { isTemplateCopilotConceptLocaleProductionReady } from "./template-copilot-concepts.ts";
import {
  evaluateTemplateCopilotV2Step8LocaleGate,
  isTemplateCopilotV2Step8LocaleEnabled,
} from "./template-copilot-v2-step8-rollout.ts";

export const templateCopilotV2Step8QuestionContentReview = Object.freeze({
  scope: "all_localized_question_content" as const,
  questionCount: 316,
  contentFingerprint: "fnv1a64:561391552a3ba191",
  locales: Object.freeze({
    en: Object.freeze({
      status: "pending" as const,
      reviewerType: "human" as const,
      reviewer: "Unassigned reviewer",
    }),
    "zh-Hant": Object.freeze({
      status: "pending" as const,
      reviewerType: "human" as const,
      reviewer: "Unassigned reviewer",
    }),
    "zh-Hans": Object.freeze({
      status: "pending" as const,
      reviewerType: "human" as const,
      reviewer: "Unassigned reviewer",
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

export function getTemplateCopilotQuestionReviewSummary() {
  const locales = Object.fromEntries(Object.entries(templateCopilotV2Step8QuestionContentReview.locales).map(([locale, review]) => [
    locale,
    Object.freeze({
      ...review,
      enabled: isTemplateCopilotV2Step8LocaleEnabled(locale as "en" | "zh-Hant" | "zh-Hans"),
      productionApproved: isTemplateCopilotQuestionLocaleProductionReady(locale as "en" | "zh-Hant" | "zh-Hans"),
    }),
  ])) as Record<"en" | "zh-Hant" | "zh-Hans", {
    status: "pending" | "approved" | "rejected";
    reviewerType: "human";
    reviewer: string;
    reviewedAt?: string;
    evidenceRef?: string;
    enabled: boolean;
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
