import { z } from "zod";

export const templateAuthoringContractVersion = 1 as const;

const boundedId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const boundedLabel = z.string().trim().min(1).max(200);
const boundedDescription = z.string().trim().min(1).max(4_000);
const email = z.string().trim().email().max(320);

export const templateRequirementFieldSchema = z
  .object({
    id: boundedId,
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
    instructions: z.string().trim().max(2_000).default(""),
    placeholder: z.string().trim().max(500).optional(),
    options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    source: z.enum(["manual", "ai", "ocr", "excel"]).default("manual"),
  })
  .strict()
  .superRefine((field, context) => {
    if (
      ["select", "radio", "checkbox"].includes(field.type) &&
      !field.options?.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: `${field.label} requires at least one option.`,
      });
    }
  });

export const templateAttachmentRequirementSchema = z
  .object({
    id: boundedId,
    label: boundedLabel,
    description: z.string().trim().max(2_000).default(""),
    required: z.boolean(),
    inputMode: z.enum(["upload", "manual_form", "form_library"]),
    acceptedFormats: z
      .array(z.enum(["text", "pdf", "image", "excel_csv"]))
      .min(1)
      .max(4),
    minimumFiles: z.number().int().min(0).max(50).default(0),
    maximumFiles: z.number().int().min(1).max(50).default(1),
    maximumFileSizeMb: z.number().int().min(1).max(100).default(25),
    fields: z.array(templateRequirementFieldSchema).max(200).default([]),
    allowSharedFulfillment: z.boolean().default(false),
    requireSharedFulfillmentConfirmation: z.boolean().default(false),
  })
  .strict()
  .superRefine((requirement, context) => {
    if (requirement.minimumFiles > requirement.maximumFiles) {
      context.addIssue({
        code: "custom",
        path: ["minimumFiles"],
        message: "Minimum files cannot exceed maximum files.",
      });
    }
    if (requirement.required && requirement.minimumFiles === 0) {
      context.addIssue({
        code: "custom",
        path: ["minimumFiles"],
        message: "A required attachment must require at least one file.",
      });
    }
    if (
      requirement.inputMode === "manual_form" &&
      requirement.fields.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "A native form requirement must contain at least one field.",
      });
    }
  });

export const templateParticipantResolverSchema = z
  .object({
    mode: z.enum([
      "fixed_email",
      "directory_position",
      "request_field",
      "requester",
      "unassigned_at_template",
    ]),
    email: email.optional(),
    directoryPosition: z.string().trim().min(1).max(200).optional(),
    requestFieldId: boundedId.optional(),
  })
  .strict()
  .superRefine((resolver, context) => {
    if (resolver.mode === "fixed_email" && !resolver.email) {
      context.addIssue({
        code: "custom",
        path: ["email"],
        message: "A fixed participant requires an email address.",
      });
    }
    if (resolver.mode === "directory_position" && !resolver.directoryPosition) {
      context.addIssue({
        code: "custom",
        path: ["directoryPosition"],
        message: "A directory participant requires a position.",
      });
    }
    if (resolver.mode === "request_field" && !resolver.requestFieldId) {
      context.addIssue({
        code: "custom",
        path: ["requestFieldId"],
        message: "A request-field participant requires a field.",
      });
    }
  });

const templateStageBaseSchema = z.object({
  id: boundedId,
  label: boundedLabel,
  description: z.string().trim().max(2_000).default(""),
  attachmentRequirementIds: z.array(boundedId).max(50).default([]),
  blocking: z.boolean().default(true),
});

export const templateStageSchema = z.discriminatedUnion("kind", [
  templateStageBaseSchema
    .extend({
      kind: z.literal("submit_request"),
      assignee: templateParticipantResolverSchema,
      allowSharedFulfillment: z.boolean().default(false),
      requireSharedFulfillmentConfirmation: z.boolean().default(false),
    })
    .strict(),
  templateStageBaseSchema
    .extend({
      kind: z.literal("approval"),
      assignee: templateParticipantResolverSchema,
      dueInHours: z.number().int().min(1).max(8_760).default(48),
      escalationAssignee: templateParticipantResolverSchema.optional(),
      acknowledgementRequired: z.boolean().default(false),
    })
    .strict(),
  templateStageBaseSchema
    .extend({
      kind: z.literal("for_information"),
      assignee: templateParticipantResolverSchema,
      acknowledgementRequired: z.boolean().default(false),
      blocking: z.literal(false).default(false),
    })
    .strict(),
  templateStageBaseSchema
    .extend({
      kind: z.literal("condition"),
    })
    .strict(),
  templateStageBaseSchema
    .extend({
      kind: z.literal("return_reject"),
    })
    .strict(),
]);

export const templateConditionSchema = z
  .object({
    fieldId: boundedId.optional(),
    operator: z
      .enum(["=", "!=", ">", ">=", "<", "<=", "contains"])
      .optional(),
    value: z.string().trim().max(500).optional(),
    approvalStageIds: z.array(boundedId).max(20).optional(),
    minimumApproved: z.number().int().min(0).max(20).optional(),
    approvalMode: z.enum(["at_least", "exactly"]).optional(),
    join: z.enum(["and", "or"]).default("and"),
    fallback: z.boolean().default(false),
  })
  .strict()
  .superRefine((condition, context) => {
    if (condition.fallback) {
      return;
    }
    const hasFieldRule =
      Boolean(condition.fieldId) &&
      Boolean(condition.operator) &&
      condition.value !== undefined;
    const hasApprovalRule =
      Boolean(condition.approvalStageIds?.length) &&
      condition.minimumApproved !== undefined;
    if (!hasFieldRule && !hasApprovalRule) {
      context.addIssue({
        code: "custom",
        message:
          "A non-fallback branch requires a field rule or an approval-count rule.",
      });
    }
  });

export const templateRouteSchema = z
  .object({
    id: boundedId,
    sourceStageId: boundedId,
    targetStageId: boundedId,
    label: boundedLabel,
    type: z.enum([
      "main",
      "approved",
      "rejected",
      "condition",
      "for_information",
    ]),
    condition: templateConditionSchema.optional(),
    blocking: z.boolean().default(true),
  })
  .strict()
  .superRefine((route, context) => {
    if (route.type === "condition" && !route.condition) {
      context.addIssue({
        code: "custom",
        path: ["condition"],
        message: "A condition route requires a condition.",
      });
    }
    if (route.type === "for_information" && route.blocking) {
      context.addIssue({
        code: "custom",
        path: ["blocking"],
        message: "A for-information route cannot block the workflow.",
      });
    }
  });

export const templateDossierCitationSchema = z
  .object({
    id: boundedId,
    targetPath: z.string().trim().min(1).max(500),
    source: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("interview"),
          sectionId: boundedId,
          messageIds: z.array(boundedId).min(1).max(100),
        })
        .strict(),
      z
        .object({
          type: z.literal("document"),
          documentId: boundedId,
          fileName: z.string().trim().min(1).max(300),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          pageNumber: z.number().int().min(1).max(10_000).optional(),
          excerpt: z.string().trim().min(1).max(500),
        })
        .strict(),
    ]),
  })
  .strict();

export const templateRequirementsDossierV1Schema = z
  .object({
    schemaVersion: z.literal(templateAuthoringContractVersion),
    dossierId: boundedId,
    title: boundedLabel,
    purpose: boundedDescription,
    businessScope: z
      .object({
        businessId: boundedId.optional(),
        businessName: boundedLabel,
        departmentId: boundedId.optional(),
        departmentName: boundedLabel,
        processOwnerEmail: email.optional(),
        dataClassification: z.enum([
          "internal",
          "confidential",
          "restricted",
        ]),
      })
      .strict(),
    initiation: z
      .object({
        allowedInitiators: z.enum([
          "any_employee",
          "department_members",
          "named_roles",
          "named_people",
        ]),
        initiatorRoles: z.array(boundedLabel).max(50).default([]),
        initiatorEmails: z.array(email).max(100).default([]),
        requestFields: z.array(templateRequirementFieldSchema).max(200),
      })
      .strict(),
    attachmentRequirements: z
      .array(templateAttachmentRequirementSchema)
      .max(100),
    stages: z.array(templateStageSchema).min(1).max(100),
    routes: z.array(templateRouteSchema).min(1).max(300),
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
        events: z
          .array(
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
          )
          .max(20),
      })
      .strict(),
    governance: z
      .object({
        publishMode: z.enum([
          "template_manager_review",
          "process_owner_and_template_manager_review",
        ]),
        reviewerEmails: z.array(email).max(20).default([]),
        policyReferences: z.array(z.string().trim().min(1).max(500)).max(50),
        retentionDays: z.number().int().min(1).max(3_650),
        changeReasonRequired: z.boolean(),
      })
      .strict(),
    assumptions: z
      .array(
        z
          .object({
            id: boundedId,
            statement: boundedDescription,
            status: z.enum(["proposed", "confirmed", "rejected"]),
            confirmedByEmail: email.optional(),
          })
          .strict(),
      )
      .max(100),
    openQuestions: z
      .array(
        z
          .object({
            id: boundedId,
            question: boundedDescription,
            importance: z.enum(["blocking", "important", "optional"]),
            answer: z.string().trim().max(4_000).optional(),
          })
          .strict(),
      )
      .max(100),
    citations: z.array(templateDossierCitationSchema).max(300).default([]),
  })
  .strict()
  .superRefine(validateDossierReferences);

const extractionExampleSchema = z
  .object({
    id: boundedId,
    templateId: boundedId,
    documentId: boundedId.optional(),
    documentType: z.string().trim().max(200).optional(),
    fieldLabel: boundedLabel,
    originalValue: z.string().max(4_000),
    correctedValue: z.string().max(4_000),
    evidence: z.string().max(4_000).optional(),
    anchor: z
      .object({
        pageNumber: z.number().int().min(1).max(10_000),
        rect: z
          .object({
            x: z.number().finite(),
            y: z.number().finite(),
            width: z.number().finite().nonnegative(),
            height: z.number().finite().nonnegative(),
          })
          .strict(),
        nearbyText: z.string().max(4_000).optional(),
      })
      .strict()
      .optional(),
    sourceFileName: z.string().trim().max(500).optional(),
    createdByEmail: email,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const executableWorkflowFieldSchema = z
  .object({
    name: boundedId,
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
    source: z.enum(["ai", "ocr", "excel", "manual"]),
    instructions: z.string().trim().max(2_000),
    placeholder: z.string().trim().max(500).optional(),
    options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    documentId: boundedId.optional(),
    inputSource: z
      .enum(["approval_app", "microsoft_forms", "attachment_extraction"])
      .optional(),
    externalQuestionLabel: z.string().trim().max(500).optional(),
    attachmentFieldName: z.string().trim().max(500).optional(),
    examples: z.array(extractionExampleSchema).max(100).optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (
      ["select", "radio", "checkbox"].includes(field.type) &&
      !field.options?.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: `${field.label} requires at least one option.`,
      });
    }
  });

const formLayoutSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            id: boundedId,
            title: boundedLabel,
            description: z.string().trim().max(2_000).optional(),
            items: z
              .array(
                z
                  .object({
                    fieldName: boundedId,
                    width: z.enum(["full", "half"]),
                  })
                  .strict(),
              )
              .max(200),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

const formLibraryReferenceSchema = z
  .object({
    definitionId: boundedId,
    formKey: boundedId,
    version: z.number().int().min(1),
    source: z.enum(["native", "microsoft_forms"]),
    responseMode: z.enum(["manual", "start_workflow", "complete_node"]),
    responseUrl: z.string().url().max(2_000).optional(),
    embedUrl: z.string().url().max(2_000).optional(),
    externalFormId: z.string().trim().max(500).optional(),
    schemaFingerprint: z.string().trim().max(500).optional(),
    completionRequired: z.boolean(),
    selectedFieldNames: z.array(boundedId).max(200),
    selectedAttachmentNames: z.array(boundedLabel).max(100),
    attachmentFields: z
      .array(
        z
          .object({
            name: boundedId,
            label: boundedLabel,
            required: z.boolean(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    layout: formLayoutSchema.optional(),
  })
  .strict();

const workflowDocumentSamplePageSchema = z
  .object({
    pageNumber: z.number().int().min(1).max(10_000),
    mimeType: z.string().trim().min(1).max(200),
    imageBase64: z.string().max(3_000_000).optional(),
    storagePath: z.string().trim().max(1_000).optional(),
    pageText: z.string().max(100_000).optional(),
  })
  .strict();

const workflowDocumentSampleSchema = z
  .object({
    fileName: z.string().trim().min(1).max(500),
    mimeType: z.string().trim().min(1).max(200),
    previewPages: z.array(workflowDocumentSamplePageSchema).max(25),
    pageImages: z.array(workflowDocumentSamplePageSchema).max(25).optional(),
    savedAt: z.string().datetime({ offset: true }),
    trainingDraft: z
      .object({
        selectedFieldName: boundedId,
        newFieldLabel: boundedLabel.optional(),
        instructions: z.string().max(4_000),
        value: z.string().max(4_000),
        evidence: z.string().max(4_000).optional(),
        anchor: extractionExampleSchema.shape.anchor,
      })
      .strict()
      .optional(),
  })
  .strict();

export const executableWorkflowDocumentSchema = z
  .object({
    id: boundedId,
    documentType: boundedLabel,
    format: z.enum(["text", "pdf", "image", "excel_csv"]),
    inputMode: z.enum(["upload", "manual_form"]).optional(),
    required: z.boolean(),
    fields: z.array(executableWorkflowFieldSchema).max(200),
    sample: workflowDocumentSampleSchema.optional(),
    formLibraryRef: formLibraryReferenceSchema.optional(),
  })
  .strict();

const workflowApprovalRuleSchema = z
  .object({
    upstreamNodeIds: z.array(boundedId).min(1).max(20),
    minimumApproved: z.number().int().min(0).max(20),
    mode: z.enum(["at_least", "exactly"]).optional(),
  })
  .strict();

const workflowNumericRuleSchema = z
  .object({
    field: boundedId,
    operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
    value: z.string().max(500),
  })
  .strict();

const workflowConditionCaseSchema = z
  .object({
    id: boundedId,
    name: boundedLabel,
    isFallback: z.boolean().optional(),
    isApprovalCount: z.boolean().optional(),
    approvalRule: workflowApprovalRuleSchema.optional(),
    numericRule: workflowNumericRuleSchema.optional(),
    join: z.enum(["and", "or"]),
    targetNodeIds: z.array(boundedId).max(100),
  })
  .strict();

const workflowHandoffProcessSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: boundedId,
      type: z.literal("comparison"),
      label: boundedLabel,
      leftField: boundedId,
      operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
      rightField: boundedId,
    })
    .strict(),
  z
    .object({
      id: boundedId,
      type: z.literal("calculation"),
      label: boundedLabel,
      calculation: z.enum(["difference", "percentage_difference"]),
      leftField: boundedId,
      rightField: boundedId,
    })
    .strict(),
]);

const workflowHandoffViewSchema = z
  .object({
    fieldVisibility: z
      .object({
        mode: z.enum(["all", "selected", "hidden"]),
        fieldNames: z.array(boundedId).max(200).optional(),
      })
      .strict()
      .optional(),
    documentVisibility: z
      .object({
        mode: z.enum(["all", "selected", "required_for_node", "none"]),
        documentIds: z.array(boundedId).max(100).optional(),
      })
      .strict()
      .optional(),
    layout: z.enum(["standard", "compact", "comparison"]).optional(),
    processes: z.array(workflowHandoffProcessSchema).max(100).optional(),
  })
  .strict();

export const executableWorkflowNodeSchema = z
  .object({
    id: boundedId,
    kind: z.enum([
      "start",
      "submit_request",
      "approval",
      "review",
      "for_information",
      "condition",
      "return_reject",
      "end",
    ]),
    label: boundedLabel,
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
    assigneeName: z.string().trim().max(200).optional(),
    assigneeEmail: email.or(z.literal("")).optional(),
    assigneeEmailFixed: z.boolean().optional(),
    dueInHours: z.number().int().min(1).max(8_760).optional(),
    escalationName: z.string().trim().max(200).optional(),
    escalationEmail: email.or(z.literal("")).optional(),
    escalationEmailFixed: z.boolean().optional(),
    documentIds: z.array(boundedId).max(50).optional(),
    allowSharedFulfillment: z.boolean().optional(),
    requireSharedFulfillmentConfirmation: z.boolean().optional(),
    blocking: z.boolean().optional(),
    acknowledgementRequired: z.boolean().optional(),
    conditionCases: z.array(workflowConditionCaseSchema).max(100).optional(),
    handoffView: workflowHandoffViewSchema.optional(),
  })
  .strict();

export const executableWorkflowEdgeSchema = z
  .object({
    id: boundedId,
    sourceId: boundedId,
    targetId: boundedId,
    label: boundedLabel,
    branchType: z.enum([
      "main",
      "approved",
      "rejected",
      "condition",
      "for_information",
    ]),
    rule: z
      .object({
        field: boundedId,
        operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
        value: z.string().max(500),
        approvalRule: workflowApprovalRuleSchema.optional(),
        join: z.enum(["and", "or"]).optional(),
      })
      .strict()
      .optional(),
    blocking: z.boolean().optional(),
  })
  .strict();

export const templateDefinitionV1Schema = z
  .object({
    schemaVersion: z.literal(templateAuthoringContractVersion),
    template: z
      .object({
        id: boundedId,
        name: boundedLabel,
        business: boundedLabel,
        department: boundedLabel,
        version: z.number().int().min(1).default(1),
        isDraft: z.boolean().default(true),
        documentTypes: z.array(boundedLabel).max(100),
        documents: z.array(executableWorkflowDocumentSchema).max(100),
        languages: z.array(boundedLabel).min(1).max(20),
        fields: z.array(executableWorkflowFieldSchema).max(200),
        extractionExamples: z.array(extractionExampleSchema).max(500).optional(),
        steps: z.array(z.unknown()).max(100).default([]),
        graph: z
          .object({
            nodes: z.array(executableWorkflowNodeSchema).min(2).max(102),
            edges: z.array(executableWorkflowEdgeSchema).min(1).max(300),
          })
          .strict(),
      })
      .strict(),
    sourceDossierId: boundedId,
    generation: z
      .object({
        mode: z.enum(["manual", "copilot", "external_agent"]),
        generatedAt: z.string().datetime({ offset: true }),
        generatedByEmail: email,
        unresolvedQuestionIds: z.array(boundedId).max(100),
      })
      .strict(),
  })
  .strict();

export const templateDraftPutCommandSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    dossier: templateRequirementsDossierV1Schema,
    definition: templateDefinitionV1Schema,
    changeReason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export type TemplateRequirementsDossierV1 = z.infer<
  typeof templateRequirementsDossierV1Schema
>;
export type TemplateDefinitionV1 = z.infer<typeof templateDefinitionV1Schema>;
export type TemplateDraftPutCommand = z.infer<typeof templateDraftPutCommandSchema>;

function validateDossierReferences(
  dossier: {
    initiation: { requestFields: Array<{ id: string }> };
    attachmentRequirements: Array<{ id: string; fields: Array<{ id: string }> }>;
    stages: Array<{ id: string; attachmentRequirementIds: string[] }>;
    routes: Array<{
      id: string;
      sourceStageId: string;
      targetStageId: string;
      condition?: {
        fieldId?: string;
        approvalStageIds?: string[];
      };
    }>;
  },
  context: z.RefinementCtx,
) {
  const uniqueSets = [
    ["attachmentRequirements", dossier.attachmentRequirements.map((item) => item.id)],
    ["stages", dossier.stages.map((item) => item.id)],
    ["routes", dossier.routes.map((item) => item.id)],
  ] as const;
  for (const [path, ids] of uniqueSets) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: [path],
        message: `${path} must use unique IDs.`,
      });
    }
  }

  const attachmentIds = new Set(
    dossier.attachmentRequirements.map((requirement) => requirement.id),
  );
  const stageIds = new Set(dossier.stages.map((stage) => stage.id));
  const fieldIds = new Set([
    ...dossier.initiation.requestFields.map((field) => field.id),
    ...dossier.attachmentRequirements.flatMap((requirement) =>
      requirement.fields.map((field) => field.id),
    ),
  ]);

  dossier.stages.forEach((stage, stageIndex) => {
    stage.attachmentRequirementIds.forEach((attachmentId) => {
      if (!attachmentIds.has(attachmentId)) {
        context.addIssue({
          code: "custom",
          path: ["stages", stageIndex, "attachmentRequirementIds"],
          message: `Unknown attachment requirement: ${attachmentId}.`,
        });
      }
    });
  });

  dossier.routes.forEach((route, routeIndex) => {
    if (!stageIds.has(route.sourceStageId) || !stageIds.has(route.targetStageId)) {
      context.addIssue({
        code: "custom",
        path: ["routes", routeIndex],
        message: `Route ${route.id} references an unknown stage.`,
      });
    }
    if (route.condition?.fieldId && !fieldIds.has(route.condition.fieldId)) {
      context.addIssue({
        code: "custom",
        path: ["routes", routeIndex, "condition", "fieldId"],
        message: `Unknown condition field: ${route.condition.fieldId}.`,
      });
    }
    route.condition?.approvalStageIds?.forEach((stageId) => {
      if (!stageIds.has(stageId)) {
        context.addIssue({
          code: "custom",
          path: ["routes", routeIndex, "condition", "approvalStageIds"],
          message: `Unknown approval stage: ${stageId}.`,
        });
      }
    });
  });
}
