import { z } from "zod";

const expectedVersion = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const profileId = z.string().uuid();
const shortText = z.string().trim().min(1).max(200);
const note = z.string().trim().min(1).max(4_000);
const extractedFields = z
  .record(z.string().trim().min(1).max(200), z.string().max(4_000))
  .refine((value) => Object.keys(value).length <= 100, "Too many fields")
  .default({});
const attachment = z
  .object({
    key: z.string().trim().min(1).max(500),
    fileName: z.string().trim().min(1).max(500),
    documentId: z.string().trim().max(200).optional(),
    documentType: z.string().trim().min(1).max(200),
    format: z.enum(["text", "pdf", "image", "excel_csv", "ad_hoc"]),
    workflowNodeId: z.string().trim().max(200).optional(),
    storagePath: z.string().trim().min(3).max(1_000),
  })
  .strict();
const base = { expectedVersion, idempotencyKey };

export const approvalCollaborationCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("request_contributor"),
      targetProfileId: profileId,
      contributorName: z.string().trim().max(200).optional(),
      requestNote: note,
      dueAt: z.string().datetime({ offset: true }).optional(),
      blocksApproval: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("submit_contribution"),
      collaborationRequestId: shortText,
      attachment,
      extractedFields,
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("submit_shared_fulfillment"),
      requirementNodeId: shortText,
      documentId: shortText,
      assignedSubmitterProfileId: profileId,
      attachment,
      extractedFields,
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("decide_shared_fulfillment"),
      fulfillmentId: shortText,
      decision: z.enum(["confirm", "reject"]),
      note: z.string().trim().max(4_000).optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("submit_correction"),
      correctionRequestId: shortText,
      attachment,
      extractedFields,
    })
    .strict(),
]);

export type ApprovalCollaborationCommand = z.infer<
  typeof approvalCollaborationCommandSchema
>;
