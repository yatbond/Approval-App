import { z } from "zod";

export const templateCopilotLocales = ["en", "zh-Hant", "zh-Hans"] as const;
export const templateCopilotLocaleSchema = z.enum(templateCopilotLocales);
export type TemplateCopilotLocale = z.infer<typeof templateCopilotLocaleSchema>;

const boundedText = z.string().trim().min(1).max(4_000);
const boundedLabel = z.string().trim().min(1).max(200);
const optionalEmail = z.union([z.string().trim().email().max(320), z.literal("")]);

export const templateCopilotPlanFieldSchema = z
  .object({
    label: boundedLabel,
    type: z.enum([
      "text",
      "long_text",
      "number",
      "date",
      "currency",
      "email",
      "select",
      "radio",
      "checkbox",
      "table",
    ]),
    required: z.boolean(),
    instructions: z.string().trim().max(2_000),
    placeholder: z.string().trim().max(500),
    options: z.array(z.string().trim().min(1).max(200)).max(100),
    source: z.enum(["manual", "ai", "ocr", "excel"]),
  })
  .strict();

const participantSchema = z
  .object({
    mode: z.enum([
      "fixed_email",
      "directory_position",
      "request_field",
      "requester",
      "unassigned_at_template",
    ]),
    email: optionalEmail,
    directoryPosition: z.string().trim().max(200),
    requestFieldLabel: z.string().trim().max(200),
  })
  .strict();

const conditionSchema = z
  .object({
    label: boundedLabel,
    fieldLabel: boundedLabel,
    operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
    value: z.string().trim().min(1).max(500),
    join: z.enum(["and", "or"]),
  })
  .strict();

const attachmentSchema = z
  .object({
    label: boundedLabel,
    description: z.string().trim().max(2_000),
    required: z.boolean(),
    inputMode: z.enum(["upload", "manual_form"]),
    acceptedFormats: z
      .array(z.enum(["text", "pdf", "image", "excel_csv"]))
      .min(1)
      .max(4),
    minimumFiles: z.number().int().min(0).max(50),
    maximumFiles: z.number().int().min(1).max(50),
    maximumFileSizeMb: z.number().int().min(1).max(100),
    fields: z.array(templateCopilotPlanFieldSchema).max(200),
    allowSharedFulfillment: z.boolean(),
    requireSharedFulfillmentConfirmation: z.boolean(),
    requiredWhen: conditionSchema.nullable(),
  })
  .strict();

const stageSchema = z
  .object({
    label: boundedLabel,
    kind: z.enum(["approval", "review", "for_information"]),
    participant: participantSchema,
    dueInHours: z.number().int().min(1).max(8_760),
    escalationParticipant: participantSchema.nullable(),
    acknowledgementRequired: z.boolean(),
    attachmentLabels: z.array(boundedLabel).max(100),
    fieldVisibility: z.enum(["all", "selected", "hidden"]),
    visibleFieldLabels: z.array(boundedLabel).max(200),
    documentVisibility: z.enum([
      "all",
      "selected",
      "required_for_node",
      "none",
    ]),
    visibleDocumentLabels: z.array(boundedLabel).max(100),
  })
  .strict();

const phaseSchema = z
  .object({
    label: boundedLabel,
    execution: z.enum(["sequential", "parallel"]),
    condition: conditionSchema.nullable(),
    stages: z.array(stageSchema).min(1).max(30),
  })
  .strict();

export const templateCopilotPlanV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    locale: templateCopilotLocaleSchema,
    title: boundedLabel,
    purpose: boundedText,
    dataClassification: z.enum(["internal", "confidential", "restricted"]),
    allowedInitiators: z.enum([
      "any_employee",
      "department_members",
      "named_roles",
      "named_people",
    ]),
    initiatorRoles: z.array(boundedLabel).max(50),
    initiatorEmails: z.array(z.string().trim().email().max(320)).max(100),
    requestFields: z.array(templateCopilotPlanFieldSchema).max(200),
    attachments: z.array(attachmentSchema).max(100),
    phases: z.array(phaseSchema).min(1).max(60),
    collaboration: z
      .object({
        templateDefinedSubmitters: z.boolean(),
        adHocContributors: z.boolean(),
        contributorDueDates: z.boolean(),
        statusVisibility: z.enum([
          "participants",
          "department",
          "process_owners",
        ]),
        confirmationPolicy: z.enum([
          "none",
          "first_decision_wins",
          "assigned_submitter_only",
          "current_actor_only",
        ]),
        rejectionCreatesCorrectionLoop: z.boolean(),
      })
      .strict(),
    notifications: z
      .object({
        strategy: z.enum(["important_changes_only", "all_changes"]),
        recipients: z.enum(["directly_involved", "all_participants"]),
        events: z.array(
          z.enum([
            "assigned",
            "due_soon",
            "overdue",
            "approved",
            "rejected",
            "reassigned",
            "delegated",
            "contribution_requested",
            "contribution_submitted",
            "correction_requested",
            "correction_submitted",
            "completed",
          ]),
        ),
      })
      .strict(),
    governance: z
      .object({
        publishMode: z.enum([
          "template_manager_review",
          "process_owner_and_template_manager_review",
        ]),
        processOwnerEmail: optionalEmail,
        reviewerEmails: z.array(z.string().trim().email().max(320)).max(20),
        policyReferences: z.array(z.string().trim().min(1).max(500)).max(50),
        retentionDays: z.number().int().min(1).max(3_650),
        changeReasonRequired: z.boolean(),
      })
      .strict(),
    assumptions: z
      .array(
        z
          .object({
            statement: boundedText,
            status: z.enum(["proposed", "confirmed", "rejected"]),
          })
          .strict(),
      )
      .max(100),
    openQuestions: z
      .array(
        z
          .object({
            question: boundedText,
            importance: z.enum(["blocking", "important", "optional"]),
            answer: z.string().trim().max(4_000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export type TemplateCopilotPlanV1 = z.infer<
  typeof templateCopilotPlanV1Schema
>;

export function detectTemplateCopilotLocale(
  text: string,
  fallback: TemplateCopilotLocale = "en",
): TemplateCopilotLocale {
  if (!/[\u3400-\u9fff]/u.test(text)) return fallback;
  const traditionalSignals =
    text.match(/[體審則須這與為個將於後過還來開關現時處發業員總經資據證號萬專區應]/gu)
      ?.length || 0;
  const simplifiedSignals =
    text.match(/[体审则须这与为个将于后过还来开关现时处发业务员总经资据证号万专区应]/gu)
      ?.length || 0;
  if (traditionalSignals === simplifiedSignals) return fallback;
  return traditionalSignals > simplifiedSignals ? "zh-Hant" : "zh-Hans";
}

export const templateCopilotLocaleNames: Record<
  TemplateCopilotLocale,
  string
> = {
  en: "English",
  "zh-Hant": "Traditional Chinese",
  "zh-Hans": "Simplified Chinese",
};
