import { z } from "zod";
import {
  templateCopilotFactIds,
  type TemplateCopilotFactId,
} from "./template-copilot-v2-canonical-values.ts";

export const templateCopilotV2ExtractionLocales = [
  "en",
  "zh-Hant",
  "zh-Hans",
] as const;
export type TemplateCopilotV2ExtractionLocale =
  (typeof templateCopilotV2ExtractionLocales)[number];

export const templateCopilotV2ExtractionSections = [
  "identity_scope",
  "initiators_fields",
  "attachments",
  "stages_participants",
  "conditions_exceptions",
  "collaboration_corrections",
  "timing_escalation",
  "visibility_notifications",
  "governance",
  "all",
  "document",
] as const;
export type TemplateCopilotV2ExtractionSection =
  (typeof templateCopilotV2ExtractionSections)[number];

export const templateCopilotV2ExtractionLocaleSchema = z.enum(
  templateCopilotV2ExtractionLocales,
);
export const templateCopilotV2ExtractionSectionSchema = z.enum(
  templateCopilotV2ExtractionSections,
);

const allFacts = Object.freeze([...templateCopilotFactIds]);
const facts = (...factIds: TemplateCopilotFactId[]) =>
  Object.freeze(factIds);
const factsBySection: Readonly<
  Record<TemplateCopilotV2ExtractionSection, readonly TemplateCopilotFactId[]>
> = Object.freeze({
  identity_scope: facts(
    "workflow.name",
    "workflow.purpose",
    "workflow.scope",
  ),
  initiators_fields: facts(
    "request.initiator_policy",
    "request.fields",
  ),
  attachments: facts("attachments.requirements"),
  stages_participants: facts("workflow.stages"),
  conditions_exceptions: facts(
    "workflow.conditions",
    "workflow.rejection_policy",
  ),
  collaboration_corrections: facts("collaboration.policy"),
  timing_escalation: facts("timing.rules"),
  visibility_notifications: facts(
    "visibility.policy",
    "notifications.rules",
  ),
  governance: facts(
    "governance.owner",
    "governance.policies",
    "governance.retention",
  ),
  all: allFacts,
  document: allFacts,
});

const localeNames: Readonly<
  Record<TemplateCopilotV2ExtractionLocale, string>
> = Object.freeze({
  en: "English",
  "zh-Hant": "Traditional Chinese",
  "zh-Hans": "Simplified Chinese",
});

const sectionNames: Readonly<
  Record<TemplateCopilotV2ExtractionSection, string>
> = Object.freeze({
  identity_scope: "workflow identity, purpose, and scope",
  initiators_fields: "who may start the request and request fields",
  attachments: "required files and forms",
  stages_participants: "workflow stages and participants",
  conditions_exceptions: "conditions, routes, and rejection handling",
  collaboration_corrections: "collaboration and correction handling",
  timing_escalation: "due times, reminders, and late-work handling",
  visibility_notifications: "visibility and notifications",
  governance: "ownership, policies, review, and retention",
  all: "all approval-workflow requirements",
  document: "all approval-workflow requirements stated in the document",
});

export type TemplateCopilotV2ExtractionContext = Readonly<{
  locale: TemplateCopilotV2ExtractionLocale;
  section: TemplateCopilotV2ExtractionSection;
  allowedFactIds: readonly TemplateCopilotFactId[];
  developerInstruction: string;
}>;

export type TemplateCopilotV2CandidateExtractionInput = Readonly<{
  message: string;
  messageId: string;
  locale?: TemplateCopilotV2ExtractionLocale;
  section?: TemplateCopilotV2ExtractionSection;
}>;

export function templateCopilotV2ExtractionContext({
  locale = "en",
  section = "all",
}: {
  locale?: TemplateCopilotV2ExtractionLocale;
  section?: TemplateCopilotV2ExtractionSection;
} = {}): TemplateCopilotV2ExtractionContext {
  const checkedLocale = templateCopilotV2ExtractionLocaleSchema.parse(locale);
  const checkedSection =
    templateCopilotV2ExtractionSectionSchema.parse(section);
  const allowedFactIds = factsBySection[checkedSection];
  return Object.freeze({
    locale: checkedLocale,
    section: checkedSection,
    allowedFactIds,
    developerInstruction: [
      `The employee's input language is ${localeNames[checkedLocale]} (${checkedLocale}).`,
      `Extract only ${sectionNames[checkedSection]}.`,
      `The only allowed fact IDs for this call are: ${allowedFactIds.join(", ")}.`,
      "Preserve exact source wording in sourceQuote and evidence. Do not translate, rewrite, or convert Traditional Chinese to Simplified Chinese or vice versa.",
      "Canonical enum values remain the language-independent values required by the JSON Schema.",
    ].join(" "),
  });
}

export function templateCopilotV2FactAllowedInExtractionContext(
  context: TemplateCopilotV2ExtractionContext,
  factId: TemplateCopilotFactId,
) {
  return context.allowedFactIds.includes(factId);
}
