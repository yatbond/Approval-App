import { z } from "zod";
import { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";

export const templateCopilotV2SpecialCommandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("defer") }).strict(),
  z.object({
    operation: z.literal("not_applicable"),
    reason: z.string().trim().min(1).superRefine((value, context) => {
      if (templateCopilotUnicodeCodePointCount(value) > 500) context.addIssue({ code: "custom", message: "Reason exceeds 500 Unicode characters." });
    }),
  }).strict(),
  z.object({ operation: z.literal("reopen"), decisionId: z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/) }).strict(),
]);

export const templateCopilotV2SpecialEnvelopeSchema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  command: templateCopilotV2SpecialCommandSchema,
}).strict();
