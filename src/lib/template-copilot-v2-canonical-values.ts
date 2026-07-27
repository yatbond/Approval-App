import { z } from "zod";

/** Browser-safe canonical fact-value contract. This module is the single
 * normalization boundary used before a command is persisted, hashed, sent to
 * PostgreSQL, or applied by the TypeScript domain reducer. */
export const templateCopilotFactIds = [
  "workflow.name",
  "workflow.purpose",
  "workflow.scope",
  "request.initiator_policy",
  "request.fields",
  "attachments.requirements",
  "workflow.stages",
  "workflow.conditions",
  "workflow.rejection_policy",
  "collaboration.policy",
  "timing.rules",
  "visibility.policy",
  "notifications.rules",
  "governance.owner",
  "governance.policies",
  "governance.retention",
] as const;

export type TemplateCopilotFactId = (typeof templateCopilotFactIds)[number];

const boundedTextValue = z.string().trim().min(1).max(8_000);
const boundedLabel = z.string().trim().min(1).max(200);
const fixedEmail = boundedLabel.refine((value) =>
  !value.startsWith(".")
  && !value.includes(".@")
  && !value.includes("..")
  && /^[A-Za-z0-9_+'.-]+@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/.test(value),
"Fixed participant email is invalid.");
const participantSchema = z.object({
  mode: z.enum(["fixed_email", "directory_position", "request_field", "requester", "unassigned_at_template"]),
  value: boundedLabel.optional(),
}).strict().superRefine((participant, context) => {
  const resolverNeedsValue = participant.mode === "fixed_email" || participant.mode === "directory_position" || participant.mode === "request_field";
  if (resolverNeedsValue && participant.value === undefined) {
    context.addIssue({ code: "custom", path: ["value"], message: `${participant.mode} requires a resolver value.` });
  }
  if (participant.mode === "fixed_email" && participant.value !== undefined && !fixedEmail.safeParse(participant.value).success) {
    context.addIssue({ code: "custom", path: ["value"], message: "Fixed participant email is invalid." });
  }
  if (!resolverNeedsValue && participant.value !== undefined) {
    context.addIssue({ code: "custom", path: ["value"], message: `${participant.mode} cannot carry a resolver value.` });
  }
});
const fieldSchema = z.object({
  label: boundedLabel,
  type: z.enum(["text", "long_text", "number", "date", "currency", "email", "select", "radio", "checkbox", "table"]),
  required: z.boolean(),
  options: z.array(boundedLabel).max(100).default([]),
}).strict();
const attachmentSchema = z.object({
  label: boundedLabel,
  required: z.boolean(),
  formats: z.array(z.enum(["text", "pdf", "image", "excel_csv"])).max(4).default([]),
  stage: boundedLabel.optional(),
}).strict();
const stageSchema = z.object({
  label: boundedLabel,
  kind: z.enum(["approval", "review", "for_information", "submission"]),
  participant: participantSchema,
  sequence: z.number().int().min(1).max(100),
}).strict();
const conditionSchema = z.object({
  field: boundedLabel,
  operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
  value: z.union([boundedTextValue, z.number().finite()]),
  matchingRoute: boundedLabel,
  otherwiseRoute: boundedLabel,
}).strict();
const policySchema = z.object({
  description: boundedTextValue,
  rules: z.array(boundedTextValue).max(50).default([]),
}).strict();
const rejectionPolicySchema = z.object({
  action: z.enum(["return_for_correction", "close", "route_to_stage"]),
  route: boundedLabel.optional(),
}).strict().superRefine((policy, context) => {
  if (policy.action === "route_to_stage" && policy.route === undefined) {
    context.addIssue({ code: "custom", path: ["route"], message: "A rejection stage route is required." });
  }
  if (policy.action !== "route_to_stage" && policy.route !== undefined) {
    context.addIssue({ code: "custom", path: ["route"], message: "A rejection stage route is allowed only for route_to_stage." });
  }
});

export const templateCopilotCommittedValueSchemas: Readonly<Record<TemplateCopilotFactId, z.ZodType>> = Object.freeze({
  "workflow.name": boundedLabel,
  "workflow.purpose": boundedTextValue,
  "workflow.scope": policySchema,
  "request.initiator_policy": z.object({ mode: z.enum(["any_employee", "directory_role", "requester_selected"]), description: boundedTextValue }).strict(),
  "request.fields": z.array(fieldSchema).min(1).max(100),
  "attachments.requirements": z.array(attachmentSchema).max(50),
  "workflow.stages": z.array(stageSchema).min(1).max(100),
  "workflow.conditions": z.array(conditionSchema).max(50),
  "workflow.rejection_policy": rejectionPolicySchema,
  "collaboration.policy": policySchema,
  "timing.rules": z.object({ defaultDueHours: z.number().int().min(1).max(8760).optional(), escalation: policySchema.optional() }).strict(),
  "visibility.policy": policySchema,
  "notifications.rules": z.array(z.object({ event: boundedLabel, recipients: z.array(boundedLabel).min(1).max(50), channel: z.enum(["in_app", "email"]) }).strict()).max(100),
  "governance.owner": boundedLabel,
  "governance.policies": z.array(boundedTextValue).max(50),
  "governance.retention": z.object({ period: boundedLabel, rationale: boundedTextValue.optional() }).strict(),
});

export function normalizeTemplateCopilotCommittedValue(factId: TemplateCopilotFactId, value: unknown): unknown {
  return templateCopilotCommittedValueSchemas[factId].parse(value);
}
