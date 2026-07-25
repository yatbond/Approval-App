import { z } from "zod";

const externalFormAttachmentSchema = z.object({
  fieldName: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(500),
  contentType: z.string().trim().max(200).optional(),
  downloadUrl: z.string().url().max(4000).optional(),
  driveItemId: z.string().trim().max(500).optional(),
});

const externalFormIntakeSchema = z.object({
  provider: z.literal("microsoft_forms"),
  workspaceOwnerEmail: z.string().email().max(500),
  formKey: z.string().trim().min(1).max(200),
  formVersion: z.number().int().positive(),
  externalFormId: z.string().trim().min(1).max(500),
  externalResponseId: z.string().trim().min(1).max(500),
  responseMode: z.enum(["start_workflow", "complete_node"]),
  schemaFingerprint: z.string().trim().min(1).max(20_000),
  approvalRequestNo: z.string().trim().min(1).max(500).optional(),
  formModifiedAt: z.string().datetime({ offset: true }).optional(),
  correlationToken: z.string().trim().max(500).optional(),
  respondentName: z.string().trim().max(300).optional(),
  respondentEmail: z.string().email().max(500).optional(),
  answers: z.record(z.string().max(200), z.union([
    z.string().max(20_000),
    z.number(),
    z.boolean(),
    z.array(z.string().max(4_000)).max(100),
    z.null(),
  ])),
  attachments: z.array(externalFormAttachmentSchema).max(50).default([]),
});

export type ExternalFormIntake = z.infer<typeof externalFormIntakeSchema>;

export function parseExternalFormIntake(value: unknown) {
  return externalFormIntakeSchema.safeParse(value);
}

export function isAuthorizedFormIntake(
  authorizationHeader: string | null,
  configuredSecret: string | undefined,
) {
  if (!configuredSecret || configuredSecret.length < 24) {
    return false;
  }
  return authorizationHeader === `Bearer ${configuredSecret}`;
}
