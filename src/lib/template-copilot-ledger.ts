import { z } from "zod";

export const templateCopilotSectionIds = [
  "identity_scope",
  "initiators_fields",
  "attachments",
  "stages_participants",
  "conditions_exceptions",
  "collaboration_corrections",
  "timing_escalation",
  "visibility_notifications",
  "governance",
  "confirmation",
] as const;

export type TemplateCopilotSectionId =
  (typeof templateCopilotSectionIds)[number];

const sectionStateSchema = z
  .object({
    status: z.enum(["missing", "answered", "unknown"]),
    summary: z.string().trim().max(8_000),
    sourceMessageIds: z.array(z.string().trim().min(1).max(128)).max(100),
  })
  .strict();

export const templateCopilotLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    businessUnitId: z.string().uuid(),
    businessName: z.string().trim().min(1).max(200),
    departmentId: z.string().uuid(),
    departmentName: z.string().trim().min(1).max(200),
    sections: z.record(z.enum(templateCopilotSectionIds), sectionStateSchema),
    requirementDocumentExtracts: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(120),
            fileName: z.string().trim().min(1).max(300),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            text: z.string().max(80_000),
            safety: z.literal("sanitized_untrusted_text"),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

export type TemplateCopilotLedger = z.infer<
  typeof templateCopilotLedgerSchema
>;

export const copilotTurnExtractionSchema = z
  .object({
    targetSection: z.enum(templateCopilotSectionIds),
    answerStatus: z.enum(["answered", "unknown"]),
    conciseSummary: z.string().trim().min(1).max(8_000),
    acknowledgement: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const templateCopilotStartSchema = z
  .object({
    businessUnitId: z.string().uuid(),
    departmentName: z.string().trim().min(1).max(200),
    initialRequirement: z.string().trim().min(1).max(16_000).optional(),
    clientMessageId: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  })
  .strict();

export const templateCopilotTurnSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    message: z.string().trim().min(1).max(16_000),
    clientMessageId: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  })
  .strict();

export function createTemplateCopilotLedger({
  businessUnitId,
  businessName,
  departmentId,
  departmentName,
}: {
  businessUnitId: string;
  businessName: string;
  departmentId: string;
  departmentName: string;
}): TemplateCopilotLedger {
  return templateCopilotLedgerSchema.parse({
    schemaVersion: 1,
    businessUnitId,
    businessName,
    departmentId,
    departmentName,
    sections: Object.fromEntries(
      templateCopilotSectionIds.map((id) => [
        id,
        { status: "missing", summary: "", sourceMessageIds: [] },
      ]),
    ),
    requirementDocumentExtracts: [],
  });
}

export const templateCopilotQuestions: Record<
  TemplateCopilotSectionId,
  string
> = {
  identity_scope:
    "What should this workflow be called, what business outcome should it achieve, and what is in or out of scope?",
  initiators_fields:
    "Who may start a request, and what information must they enter? Please include field types, required fields, and any choices.",
  attachments:
    "Which documents or forms are required or optional? For each one, specify accepted formats, quantity, size limits, and when it must be provided.",
  stages_participants:
    "Walk me through every approval, review, submission, and FYI stage in order. How is each person resolved—fixed email, directory role, requester-provided email, or assigned later?",
  conditions_exceptions:
    "What conditions, thresholds, parallel branches, rejection paths, correction loops, fallbacks, or exception cases must the workflow handle?",
  collaboration_corrections:
    "Can multiple people fulfil a submission, can ad-hoc contributors be invited, and who confirms shared submissions or corrections?",
  timing_escalation:
    "What due times and escalation rules apply to each stage? If business-calendar timing is required, say so explicitly.",
  visibility_notifications:
    "Who may see status and history, which events should notify people, and should notifications go only to directly involved people or all participants?",
  governance:
    "Who owns and reviews this template, which policies apply, what retention period is required, and is any regulated signature or special compliance control needed?",
  confirmation:
    "Please review the requirements summary. Reply “confirm” to create an editable draft, or tell me exactly what to correct.",
};

const blockingSections = new Set<TemplateCopilotSectionId>([
  "identity_scope",
  "initiators_fields",
  "attachments",
  "stages_participants",
  "conditions_exceptions",
  "collaboration_corrections",
  "visibility_notifications",
]);

export function getNextTemplateCopilotSection(
  ledger: TemplateCopilotLedger,
): TemplateCopilotSectionId {
  for (const id of templateCopilotSectionIds) {
    const state = ledger.sections[id];
    if (state.status === "missing") return id;
    if (blockingSections.has(id) && state.status === "unknown") return id;
  }
  return "confirmation";
}

export function applyTemplateCopilotAnswer({
  ledger,
  sectionId,
  messageId,
  status,
  summary,
}: {
  ledger: TemplateCopilotLedger;
  sectionId: TemplateCopilotSectionId;
  messageId: string;
  status: "answered" | "unknown";
  summary: string;
}): TemplateCopilotLedger {
  const parsed = templateCopilotLedgerSchema.parse(ledger);
  const current = parsed.sections[sectionId];
  return templateCopilotLedgerSchema.parse({
    ...parsed,
    sections: {
      ...parsed.sections,
      [sectionId]: {
        status,
        summary: summary.trim(),
        sourceMessageIds: Array.from(
          new Set([...current.sourceMessageIds, messageId]),
        ),
      },
    },
  });
}

export function isTemplateCopilotReady(ledger: TemplateCopilotLedger) {
  return templateCopilotSectionIds
    .filter((id) => id !== "confirmation")
    .every((id) => {
      const state = ledger.sections[id];
      return (
        state.status === "answered" ||
        (!blockingSections.has(id) && state.status === "unknown")
      );
    });
}

export function formatTemplateCopilotSummary(ledger: TemplateCopilotLedger) {
  return templateCopilotSectionIds
    .filter((id) => id !== "confirmation")
    .map((id) => {
      const label = id.replaceAll("_", " ");
      const state = ledger.sections[id];
      return `- ${label}: ${state.summary || `(${state.status})`}`;
    })
    .join("\n");
}

export function isExplicitConfirmation(message: string) {
  return /^(confirm|confirmed|yes[,!. ]*create|create (the )?draft|proceed)$/i.test(
    message.trim(),
  );
}
