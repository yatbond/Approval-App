import { createHash } from "node:crypto";
import { z } from "zod";

const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const comment = z.string().trim().min(1).max(4_000);
const optionalComment = z.string().trim().max(4_000).optional();
const expectedVersion = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const targetProfileId = z.string().uuid();
const returnTargetNodeIds = z
  .array(z.string().trim().min(1).max(200))
  .max(20)
  .optional();

const commandBase = {
  expectedVersion,
  idempotencyKey,
};

export const approvalActionCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("approve"), comment: optionalComment }).strict(),
  z.object({ ...commandBase, action: z.literal("approve_with_comment"), comment }).strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("reject"),
      comment: optionalComment,
      returnTargetNodeIds,
    })
    .strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("reject_with_comment"),
      comment,
      returnTargetNodeIds,
    })
    .strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("reassign"),
      targetProfileId,
      comment: optionalComment,
    })
    .strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("accept_reassignment"),
      comment: optionalComment,
    })
    .strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("decline_reassignment"),
      comment: optionalComment,
    })
    .strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("delegate"),
      targetProfileId,
      comment: optionalComment,
      expiresAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("revoke_delegation"),
      comment: optionalComment,
    })
    .strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("amend_resubmit"),
      comment: optionalComment,
      fieldUpdates: z
        .record(z.string().trim().min(1).max(200), z.string().max(4_000))
        .refine((value) => Object.keys(value).length <= 100, "Too many field updates")
        .default({}),
    })
    .strict(),
  z.object({ ...commandBase, action: z.literal("cancel"), comment: optionalComment }).strict(),
]);

export const approvalRequestSubmissionSchema = z
  .object({
    templateVersionId: z.string().uuid(),
    title: z.string().trim().min(1).max(300),
    dueAt: z.string().datetime({ offset: true }).optional(),
    valueLabel: z.string().trim().max(200).default(""),
    extractedFields: z
      .record(z.string().trim().min(1).max(200), z.string().max(4_000))
      .refine((value) => Object.keys(value).length <= 200, "Too many extracted fields")
      .default({}),
    participantEmails: z
      .record(z.string().trim().min(1).max(200), z.string().email().max(320))
      .refine((value) => Object.keys(value).length <= 100, "Too many participant assignments")
      .default({}),
    attachments: z
      .array(
        z
          .object({
            fileName: z.string().trim().min(1).max(500),
            documentId: z.string().trim().max(200).optional(),
            documentType: z.string().trim().min(1).max(200),
            format: z.enum(["text", "pdf", "image", "excel_csv", "ad_hoc"]),
            workflowNodeId: z.string().trim().max(200).optional(),
            storagePath: z.string().trim().min(3).max(1_000),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    idempotencyKey,
  })
  .strict();

export const approvalRequestListQuerySchema = z
  .object({
    view: z.enum(["inbox", "tracking", "all"]).default("inbox"),
    cursor: z
      .string()
      .max(500)
      .refine(isValidListCursor, "Invalid cursor")
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const directoryQuerySchema = z
  .object({
    query: z
      .string()
      .trim()
      .max(80)
      .regex(/^[\p{L}\p{N}@._' -]*$/u)
      .default(""),
    cursor: z
      .string()
      .trim()
      .max(500)
      .refine((value) => {
        try {
          const email = Buffer.from(value, "base64url").toString("utf8");
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        } catch {
          return false;
        }
      }, "Invalid directory cursor")
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type ApprovalActionCommand = z.infer<typeof approvalActionCommandSchema>;
export type ApprovalRequestSubmission = z.infer<typeof approvalRequestSubmissionSchema>;
export type ApprovalRequestListQuery = z.infer<typeof approvalRequestListQuerySchema>;
export type ApprovalDirectoryQuery = z.infer<typeof directoryQuerySchema>;

export type ApprovalApiErrorCode =
  | "invalid_request"
  | "authentication_required"
  | "inactive_profile"
  | "forbidden"
  | "request_not_found"
  | "stale_version"
  | "idempotency_conflict"
  | "already_decided"
  | "invalid_transition"
  | "invalid_target"
  | "business_precondition_failed"
  | "rate_limited"
  | "dependency_unavailable";

export function canonicalPayloadHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isValidListCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    return (
      typeof parsed.updatedAt === "string" &&
      !Number.isNaN(Date.parse(parsed.updatedAt)) &&
      typeof parsed.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.id,
      )
    );
  } catch {
    return false;
  }
}
