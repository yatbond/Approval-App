import { z } from "zod";
import {
  templateDefinitionV1Schema,
  templateRequirementsDossierV1Schema,
} from "./template-authoring-contracts.ts";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const expectedRevisionSchema = z.number().int().nonnegative();

export const createTemplateFamilyCommandSchema = z
  .object({
    familyKey: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    name: z.string().trim().min(1).max(300),
    businessUnitId: z.string().uuid(),
    departmentId: z.string().uuid(),
    dossier: templateRequirementsDossierV1Schema,
    definition: templateDefinitionV1Schema,
    changeReason: z.string().trim().min(1).max(2_000),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (command.definition.sourceDossierId !== command.dossier.dossierId) {
      context.addIssue({
        code: "custom",
        path: ["definition", "sourceDossierId"],
        message: "The definition must reference the supplied dossier.",
      });
    }
    if (command.definition.template.name !== command.name) {
      context.addIssue({
        code: "custom",
        path: ["definition", "template", "name"],
        message: "The family and executable definition names must match.",
      });
    }
  });

export const replaceTemplateDraftCommandSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
    dossier: templateRequirementsDossierV1Schema,
    definition: templateDefinitionV1Schema,
    changeReason: z.string().trim().min(1).max(2_000),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (command.definition.sourceDossierId !== command.dossier.dossierId) {
      context.addIssue({
        code: "custom",
        path: ["definition", "sourceDossierId"],
        message: "The definition must reference the supplied dossier.",
      });
    }
  });

export const createTemplateDraftCommandSchema = z
  .object({
    dossier: templateRequirementsDossierV1Schema,
    definition: templateDefinitionV1Schema,
    changeReason: z.string().trim().min(1).max(2_000),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (command.definition.sourceDossierId !== command.dossier.dossierId) {
      context.addIssue({
        code: "custom",
        path: ["definition", "sourceDossierId"],
        message: "The definition must reference the supplied dossier.",
      });
    }
  });

export const templateDefinitionInputSchema = z
  .object({
    dossier: templateRequirementsDossierV1Schema,
    definition: templateDefinitionV1Schema,
  })
  .strict();

export const templateSimulationCommandSchema = templateDefinitionInputSchema
  .extend({
    extractedFields: z
      .record(z.string().trim().min(1).max(200), z.string().max(4_000))
      .refine((fields) => Object.keys(fields).length <= 200, "Too many fields")
      .default({}),
    nodeDecisions: z
      .record(
        z.string().trim().min(1).max(200),
        z.enum(["approved", "rejected"]),
      )
      .refine(
        (decisions) => Object.keys(decisions).length <= 100,
        "Too many node decisions",
      )
      .default({}),
  })
  .strict();

export const templateDiffCommandSchema = z
  .object({
    before: templateDefinitionV1Schema,
    after: templateDefinitionV1Schema,
  })
  .strict();

export const requestTemplatePublishCommandSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
    requestNote: z.string().trim().max(4_000).default(""),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const reviewTemplatePublishCommandSchema = z
  .object({
    decision: z.enum(["approve", "request_changes", "reject"]),
    reviewNote: z.string().trim().max(4_000).default(""),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (command.decision !== "approve" && !command.reviewNote) {
      context.addIssue({
        code: "custom",
        path: ["reviewNote"],
        message: "A change request or rejection requires a review note.",
      });
    }
  });

export const publishTemplateDraftCommandSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const activateTemplateVersionCommandSchema = z
  .object({
    expectedVersionNumber: z.number().int().min(1),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const setTemplatePublisherCommandSchema = z
  .object({
    publisherEmail: z.string().trim().email().max(320),
    enabled: z.boolean(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const templateFamilyListQuerySchema = z
  .object({
    status: z.enum(["active", "archived", "all"]).default("active"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateTemplateFamilyCommand = z.infer<
  typeof createTemplateFamilyCommandSchema
>;
export type ReplaceTemplateDraftCommand = z.infer<
  typeof replaceTemplateDraftCommandSchema
>;
export type CreateTemplateDraftCommand = z.infer<
  typeof createTemplateDraftCommandSchema
>;
export type RequestTemplatePublishCommand = z.infer<
  typeof requestTemplatePublishCommandSchema
>;
export type ReviewTemplatePublishCommand = z.infer<
  typeof reviewTemplatePublishCommandSchema
>;
export type ActivateTemplateVersionCommand = z.infer<
  typeof activateTemplateVersionCommandSchema
>;
export type SetTemplatePublisherCommand = z.infer<
  typeof setTemplatePublisherCommandSchema
>;
