import { z } from "zod";
import type {
  TemplateCopilotFactId,
  TemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";

export const templateCopilotV2StructuredFactIds = [
  "attachments.requirements",
  "workflow.conditions",
  "notifications.rules",
] as const;
export type TemplateCopilotV2StructuredFactId =
  (typeof templateCopilotV2StructuredFactIds)[number];

const boundedId = z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_-]+$/);
const boundedLabel = z.string().trim().min(1).max(200);
const boundedValue = z.string().trim().min(1).max(8_000);
const routeReference = z.union([
  z.literal("complete"),
  z.literal("return_for_correction"),
  z.string().trim().regex(/^stage:.{1,200}$/u),
  z.string().trim().regex(/^condition:[a-z][a-z0-9_-]+$/u),
]);

export const templateCopilotV2AttachmentRequirementSchema = z.object({
  id: boundedId,
  label: boundedLabel,
  kind: z.enum(["attachment", "form"]),
  required: z.boolean(),
  formats: z.array(z.enum(["text", "pdf", "image", "excel_csv"])).max(4),
  minimumQuantity: z.number().int().min(0).max(20),
  maximumQuantity: z.number().int().min(1).max(20),
  maximumFileSizeMb: z.number().int().min(1).max(25).optional(),
  stage: z.union([z.literal("request_submission"), z.string().trim().regex(/^stage:.{1,200}$/u)]),
  contributorPolicy: z.enum(["requester_only", "allow_invited_contributors"]),
  confirmationPolicy: z.enum(["none", "requester_confirms", "stage_owner_confirms"]),
}).strict().superRefine((item, context) => {
  if (item.maximumQuantity < item.minimumQuantity) {
    context.addIssue({ code: "custom", path: ["maximumQuantity"], message: "Maximum quantity cannot be lower than minimum quantity." });
  }
  if (item.required && item.minimumQuantity < 1) {
    context.addIssue({ code: "custom", path: ["minimumQuantity"], message: "A required item needs at least one submission." });
  }
  if (item.kind === "attachment" && item.formats.length === 0) {
    context.addIssue({ code: "custom", path: ["formats"], message: "An attachment needs at least one accepted format." });
  }
  if (new Set(item.formats).size !== item.formats.length) {
    context.addIssue({ code: "custom", path: ["formats"], message: "Accepted formats cannot be repeated." });
  }
  if (item.kind === "attachment" && item.maximumFileSizeMb === undefined) {
    context.addIssue({ code: "custom", path: ["maximumFileSizeMb"], message: "An attachment needs a maximum file size." });
  }
  if (item.kind === "form" && (item.formats.length > 0 || item.maximumFileSizeMb !== undefined)) {
    context.addIssue({ code: "custom", path: ["formats"], message: "A form cannot carry file formats or a file-size limit." });
  }
});

export const templateCopilotV2ConditionRuleSchema = z.object({
  id: boundedId,
  sequence: z.number().int().min(1).max(50),
  field: boundedLabel,
  operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
  value: z.union([boundedValue, z.number().finite()]),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  unit: boundedLabel.optional(),
  matchingRoute: routeReference,
  otherwiseRoute: routeReference,
}).strict().superRefine((item, context) => {
  if (item.currency && item.unit) {
    context.addIssue({ code: "custom", path: ["unit"], message: "Use either a currency or a unit, not both." });
  }
  if ([">", ">=", "<", "<="].includes(item.operator) && typeof item.value !== "number") {
    context.addIssue({ code: "custom", path: ["value"], message: "A numeric comparison needs a numeric value." });
  }
  if (item.operator === "contains" && typeof item.value !== "string") {
    context.addIssue({ code: "custom", path: ["value"], message: "A contains comparison needs text." });
  }
  if (item.matchingRoute === item.otherwiseRoute) {
    context.addIssue({ code: "custom", path: ["otherwiseRoute"], message: "Matching and otherwise routes must be different." });
  }
});

export const templateCopilotV2NotificationRuleSchema = z.object({
  id: boundedId,
  event: z.enum([
    "request_submitted",
    "stage_assigned",
    "stage_completed",
    "request_rejected",
    "correction_requested",
    "request_completed",
    "due_soon",
    "overdue",
  ]),
  recipients: z.array(z.enum([
    "requester",
    "current_stage_participants",
    "previous_stage_participants",
    "all_participants",
    "workflow_owner",
  ])).min(1).max(5),
  timing: z.object({
    mode: z.enum(["immediate", "before_due", "after_due"]),
    offsetHours: z.number().int().min(1).max(8_760).optional(),
  }).strict(),
  channel: z.enum(["default", "in_app", "email", "in_app_and_email"]),
  visibility: z.enum(["recipients_only", "all_participants"]),
  stage: z.string().trim().regex(/^stage:.{1,200}$/u).optional(),
}).strict().superRefine((item, context) => {
  const timed = item.timing.mode !== "immediate";
  if (timed !== (item.timing.offsetHours !== undefined)) {
    context.addIssue({ code: "custom", path: ["timing", "offsetHours"], message: timed ? "Timed notifications need an hour offset." : "Immediate notifications cannot have an hour offset." });
  }
  if (item.event === "due_soon" && item.timing.mode !== "before_due") {
    context.addIssue({ code: "custom", path: ["timing", "mode"], message: "Due-soon notifications must be scheduled before the due time." });
  }
  if (item.event === "overdue" && item.timing.mode !== "after_due") {
    context.addIssue({ code: "custom", path: ["timing", "mode"], message: "Overdue notifications must be scheduled after the due time." });
  }
  if (!["due_soon", "overdue"].includes(item.event) && item.timing.mode !== "immediate") {
    context.addIssue({ code: "custom", path: ["timing", "mode"], message: "This event is sent immediately." });
  }
  const stageEvent = ["stage_assigned", "stage_completed", "due_soon", "overdue"].includes(item.event)
    || item.recipients.includes("current_stage_participants")
    || item.recipients.includes("previous_stage_participants");
  if (stageEvent && !item.stage) {
    context.addIssue({ code: "custom", path: ["stage"], message: "This event or recipient group needs a workflow step." });
  }
  if (new Set(item.recipients).size !== item.recipients.length) {
    context.addIssue({ code: "custom", path: ["recipients"], message: "A recipient group cannot be selected more than once." });
  }
});

export const templateCopilotV2AttachmentRequirementsSchema =
  z.array(templateCopilotV2AttachmentRequirementSchema).min(1).max(50);
export const templateCopilotV2ConditionRulesSchema =
  z.array(templateCopilotV2ConditionRuleSchema).min(1).max(50);
export const templateCopilotV2NotificationRulesSchema =
  z.array(templateCopilotV2NotificationRuleSchema).min(1).max(100);

export type TemplateCopilotV2AttachmentRequirement = z.infer<typeof templateCopilotV2AttachmentRequirementSchema>;
export type TemplateCopilotV2ConditionRule = z.infer<typeof templateCopilotV2ConditionRuleSchema>;
export type TemplateCopilotV2NotificationRule = z.infer<typeof templateCopilotV2NotificationRuleSchema>;

export type TemplateCopilotV2StructuredIssue = Readonly<{
  factId: TemplateCopilotV2StructuredFactId;
  path: string;
  code:
    | "invalid_shape"
    | "duplicate_id"
    | "duplicate_sequence"
    | "dangling_field"
    | "ambiguous_field"
    | "invalid_value_type"
    | "missing_currency"
    | "missing_unit"
    | "unexpected_measure"
    | "dangling_route"
    | "invalid_sequence"
    | "condition_cycle"
    | "dangling_stage"
    | "ambiguous_stage"
    | "invalid_confirmation"
    | "unavailable_timing"
    | "invalid_timing_offset"
    | "unsafe_recipient";
  message: string;
}>;

export function formatTemplateCopilotV2StructuredIssue(
  item: TemplateCopilotV2StructuredIssue,
  locale: "en" | "zh-Hant" | "zh-Hans",
) {
  if (locale === "en") return item.message;
  const traditional: Record<TemplateCopilotV2StructuredIssue["code"], string> = {
    invalid_shape: "請檢查此欄位的格式和必填資料。",
    duplicate_id: "每項設定必須有不同的識別碼。",
    duplicate_sequence: "每項判斷必須有不同的次序。",
    dangling_field: "請選擇現有的申請資料欄位。",
    ambiguous_field: "判斷所使用的申請資料欄位名稱不可重複。",
    invalid_value_type: "比較值的格式必須配合所選申請資料。",
    missing_currency: "請選擇此金額所用的貨幣。",
    missing_unit: "請輸入此數字的單位，例如件數或百分比。",
    unexpected_measure: "此申請資料不需要貨幣或單位。",
    dangling_route: "請選擇現有的流程步驟或後續判斷。",
    invalid_sequence: "判斷只可前往較後的判斷。",
    condition_cycle: "判斷路線不可形成循環。",
    dangling_stage: "請選擇現有的流程步驟。",
    ambiguous_stage: "結構化設定所使用的流程步驟名稱不可重複。",
    invalid_confirmation: "提交申請時沒有步驟負責人可作確認。",
    unavailable_timing: "請先設定流程的到期時間。",
    invalid_timing_offset: "到期前通知時間不可早於流程開始時間。",
    unsafe_recipient: "所選步驟沒有上一個步驟處理人。",
  };
  const simplified: Record<TemplateCopilotV2StructuredIssue["code"], string> = {
    invalid_shape: "请检查此字段的格式和必填信息。",
    duplicate_id: "每项设置必须有不同的标识符。",
    duplicate_sequence: "每项判断必须有不同的顺序。",
    dangling_field: "请选择现有的申请信息字段。",
    ambiguous_field: "判断所使用的申请信息字段名称不可重复。",
    invalid_value_type: "比较值的格式必须与所选申请信息匹配。",
    missing_currency: "请选择此金额使用的货币。",
    missing_unit: "请输入此数字的单位，例如件数或百分比。",
    unexpected_measure: "此申请信息不需要货币或单位。",
    dangling_route: "请选择现有的流程步骤或后续判断。",
    invalid_sequence: "判断只能前往较后的判断。",
    condition_cycle: "判断路线不可形成循环。",
    dangling_stage: "请选择现有的流程步骤。",
    ambiguous_stage: "结构化设置所使用的流程步骤名称不可重复。",
    invalid_confirmation: "提交申请时没有步骤负责人可以确认。",
    unavailable_timing: "请先设置流程的到期时间。",
    invalid_timing_offset: "到期前通知时间不可早于流程开始时间。",
    unsafe_recipient: "所选步骤没有上一步骤处理人。",
  };
  return (locale === "zh-Hant" ? traditional : simplified)[item.code];
}

type StructuredValues = Readonly<{
  attachments?: unknown;
  conditions?: unknown;
  notifications?: unknown;
}>;

const normalizeName = (value: string) => value.trim().toLocaleLowerCase();
const stageToken = (label: string) => `stage:${label}`;
const normalizeStageToken = (token: string) =>
  token.startsWith("stage:")
    ? `stage:${normalizeName(token.slice("stage:".length))}`
    : token;

export function validateTemplateCopilotV2StructuredFacts(
  ledger: TemplateCopilotV2Ledger,
  overrides: StructuredValues = {},
): readonly TemplateCopilotV2StructuredIssue[] {
  const issues: TemplateCopilotV2StructuredIssue[] = [];
  const requestFields = committedArray(ledger, "request.fields");
  const stages = committedArray(ledger, "workflow.stages");
  const timing = committedValue(ledger, "timing.rules");
  const defaultDueHours = isRecord(timing)
    && typeof timing.defaultDueHours === "number"
    && timing.defaultDueHours > 0
    ? timing.defaultDueHours
    : null;
  const hasDueTime = defaultDueHours !== null;
  const stageCounts = new Map<string, number>();
  for (const item of stages) {
    if (typeof item?.label !== "string") continue;
    const token = normalizeStageToken(stageToken(item.label));
    stageCounts.set(token, (stageCounts.get(token) || 0) + 1);
  }
  const validateStage = (
    factId: TemplateCopilotV2StructuredFactId,
    path: string,
    token: string,
  ) => {
    const count = stageCounts.get(normalizeStageToken(token)) || 0;
    if (count === 0) {
      issues.push(issue(factId, path, "dangling_stage", "Choose an existing workflow step."));
    } else if (count > 1) {
      issues.push(issue(factId, path, "ambiguous_stage", "Workflow step names used by structured settings must be unique."));
    }
  };

  const attachmentsInput = Object.hasOwn(overrides, "attachments")
    ? overrides.attachments
    : committedValue(ledger, "attachments.requirements");
  if (attachmentsInput !== undefined) {
    const parsed = templateCopilotV2AttachmentRequirementsSchema.safeParse(attachmentsInput);
    if (!parsed.success) addZodIssues(issues, "attachments.requirements", parsed.error);
    else {
      duplicateIssues(parsed.data, "attachments.requirements", issues);
      parsed.data.forEach((item, index) => {
        if (item.stage !== "request_submission") validateStage("attachments.requirements", `${index}.stage`, item.stage);
        if (item.stage === "request_submission" && item.confirmationPolicy === "stage_owner_confirms") {
          issues.push(issue("attachments.requirements", `${index}.confirmationPolicy`, "invalid_confirmation", "Request submission has no workflow step owner to confirm this item."));
        }
      });
    }
  }

  const conditionsInput = Object.hasOwn(overrides, "conditions")
    ? overrides.conditions
    : committedValue(ledger, "workflow.conditions");
  if (conditionsInput !== undefined) {
    const parsed = templateCopilotV2ConditionRulesSchema.safeParse(conditionsInput);
    if (!parsed.success) addZodIssues(issues, "workflow.conditions", parsed.error);
    else {
      duplicateIssues(parsed.data, "workflow.conditions", issues, true);
      const ids = new Set(parsed.data.map((item) => item.id));
      const sequenceById = new Map(parsed.data.map((item) => [item.id, item.sequence]));
      const fieldGroups = new Map<string, Array<Record<string, unknown>>>();
      for (const field of requestFields) {
        if (typeof field?.label !== "string") continue;
        const key = normalizeName(field.label);
        fieldGroups.set(key, [...(fieldGroups.get(key) || []), field]);
      }
      parsed.data.forEach((item, index) => {
        const fields = fieldGroups.get(normalizeName(item.field)) || [];
        if (fields.length === 0) {
          issues.push(issue("workflow.conditions", `${index}.field`, "dangling_field", "Choose an existing request field."));
        } else if (fields.length > 1) {
          issues.push(issue("workflow.conditions", `${index}.field`, "ambiguous_field", "Request field labels used by conditions must be unique."));
        } else {
          const fieldType = String(fields[0].type || "");
          if (["currency", "number"].includes(fieldType) && typeof item.value !== "number") {
            issues.push(issue("workflow.conditions", `${index}.value`, "invalid_value_type", "Enter a numeric value for this request field."));
          }
          if (!["currency", "number"].includes(fieldType) && typeof item.value !== "string") {
            issues.push(issue("workflow.conditions", `${index}.value`, "invalid_value_type", "Enter a text value for this request field."));
          }
          if (fieldType === "currency" && !item.currency) issues.push(issue("workflow.conditions", `${index}.currency`, "missing_currency", "Choose the currency for this amount."));
          if (fieldType === "number" && !item.unit) issues.push(issue("workflow.conditions", `${index}.unit`, "missing_unit", "Enter the unit for this number, such as items or percent."));
          if (!["currency", "number"].includes(fieldType) && (item.currency || item.unit)) issues.push(issue("workflow.conditions", `${index}.unit`, "unexpected_measure", "This field does not use a currency or unit."));
          if (!["currency", "number"].includes(fieldType) && [">", ">=", "<", "<="].includes(item.operator)) issues.push(issue("workflow.conditions", `${index}.operator`, "unexpected_measure", "Use numeric comparisons only with number or currency fields."));
        }
        for (const [key, route] of [["matchingRoute", item.matchingRoute], ["otherwiseRoute", item.otherwiseRoute]] as const) {
          if (route.startsWith("stage:")) {
            const beforeCount = issues.length;
            validateStage("workflow.conditions", `${index}.${key}`, route);
            if (issues.length > beforeCount && issues.at(-1)?.code === "dangling_stage") {
              issues[issues.length - 1] = issue("workflow.conditions", `${index}.${key}`, "dangling_route", "Choose an existing workflow step.");
            }
          }
          if (route.startsWith("condition:")) {
            const targetId = route.slice("condition:".length);
            if (!ids.has(targetId)) issues.push(issue("workflow.conditions", `${index}.${key}`, "dangling_route", "Choose an existing condition."));
            else if ((sequenceById.get(targetId) || 0) <= item.sequence) issues.push(issue("workflow.conditions", `${index}.${key}`, "invalid_sequence", "A condition can route only to a later condition."));
          }
        }
      });
      if (hasConditionCycle(parsed.data)) {
        issues.push(issue("workflow.conditions", "root", "condition_cycle", "Condition routes cannot form a cycle."));
      }
    }
  }

  const notificationsInput = Object.hasOwn(overrides, "notifications")
    ? overrides.notifications
    : committedValue(ledger, "notifications.rules");
  if (notificationsInput !== undefined) {
    const parsed = templateCopilotV2NotificationRulesSchema.safeParse(notificationsInput);
    if (!parsed.success) addZodIssues(issues, "notifications.rules", parsed.error);
    else {
      duplicateIssues(parsed.data, "notifications.rules", issues);
      parsed.data.forEach((item, index) => {
        if (item.stage) validateStage("notifications.rules", `${index}.stage`, item.stage);
        if (["due_soon", "overdue"].includes(item.event) && !hasDueTime) {
          issues.push(issue("notifications.rules", `${index}.timing.mode`, "unavailable_timing", "Set a default due time before using due-soon or overdue notifications."));
        }
        if (
          item.event === "due_soon"
          && defaultDueHours !== null
          && item.timing.offsetHours !== undefined
          && item.timing.offsetHours > defaultDueHours
        ) {
          issues.push(issue("notifications.rules", `${index}.timing.offsetHours`, "invalid_timing_offset", "A due-soon notification cannot be scheduled before the request or workflow step begins."));
        }
        if (item.stage && item.recipients.includes("previous_stage_participants")) {
          const selected = stages.filter((stage) =>
            typeof stage.label === "string"
            && normalizeStageToken(stageToken(stage.label)) === normalizeStageToken(item.stage || ""));
          const selectedSequence = selected.length === 1 && typeof selected[0].sequence === "number"
            ? selected[0].sequence
            : null;
          const hasPrevious = selectedSequence !== null
            && stages.some((stage) => typeof stage.sequence === "number" && stage.sequence < selectedSequence);
          if (selected.length === 1 && !hasPrevious) {
            issues.push(issue("notifications.rules", `${index}.recipients`, "unsafe_recipient", "The selected workflow step has no previous-step participants."));
          }
        }
      });
    }
  }
  return Object.freeze(issues);
}

export function validateTemplateCopilotV2StructuredMutation({
  before,
  after,
  factId,
}: {
  before: TemplateCopilotV2Ledger;
  after: TemplateCopilotV2Ledger;
  factId: TemplateCopilotFactId;
}) {
  if (templateCopilotV2StructuredFactIds.includes(factId as TemplateCopilotV2StructuredFactId)) {
    const key = factId === "attachments.requirements" ? "attachments" : factId === "workflow.conditions" ? "conditions" : "notifications";
    return validateTemplateCopilotV2StructuredFacts(after, {
      attachments: undefined,
      conditions: undefined,
      notifications: undefined,
      [key]: after.facts[factId].canonicalValue,
    });
  }
  if (factId === "workflow.stages") {
    return validateTemplateCopilotV2StructuredFacts(after, {
      attachments: strictOrUndefined(before, "attachments.requirements", templateCopilotV2AttachmentRequirementsSchema),
      notifications: strictOrUndefined(before, "notifications.rules", templateCopilotV2NotificationRulesSchema),
      conditions: strictOrUndefined(before, "workflow.conditions", templateCopilotV2ConditionRulesSchema),
    });
  }
  if (factId === "request.fields") {
    return validateTemplateCopilotV2StructuredFacts(after, {
      attachments: undefined,
      notifications: undefined,
      conditions: strictOrUndefined(before, "workflow.conditions", templateCopilotV2ConditionRulesSchema),
    });
  }
  if (factId === "timing.rules") {
    return validateTemplateCopilotV2StructuredFacts(after, {
      attachments: undefined,
      conditions: undefined,
      notifications: strictOrUndefined(before, "notifications.rules", templateCopilotV2NotificationRulesSchema),
    });
  }
  return Object.freeze([]) as readonly TemplateCopilotV2StructuredIssue[];
}

/** Extraction review can commit a strict value through a different locked RPC
 * than the map editor. Validate every committed strict structure in the
 * projected full ledger before that RPC; homogeneous legacy arrays remain
 * readable and are intentionally outside the Step 7 semantic contract. */
export function validateTemplateCopilotV2CommittedStrictStructures(
  ledger: TemplateCopilotV2Ledger,
) {
  const attachments = committedValue(ledger, "attachments.requirements");
  const conditions = committedValue(ledger, "workflow.conditions");
  const notifications = committedValue(ledger, "notifications.rules");
  return validateTemplateCopilotV2StructuredFacts(ledger, {
    attachments: templateCopilotV2AttachmentRequirementsSchema.safeParse(attachments).success
      ? attachments
      : undefined,
    conditions: templateCopilotV2ConditionRulesSchema.safeParse(conditions).success
      ? conditions
      : undefined,
    notifications: templateCopilotV2NotificationRulesSchema.safeParse(notifications).success
      ? notifications
      : undefined,
  });
}

export type TemplateCopilotV2StructuredCompilation = Readonly<{
  attachments: readonly TemplateCopilotV2AttachmentRequirement[];
  conditions: readonly TemplateCopilotV2ConditionRule[];
  notifications: readonly TemplateCopilotV2NotificationRule[];
}>;

export function compileTemplateCopilotV2StructuredFact(
  ledger: TemplateCopilotV2Ledger,
  factId: "attachments.requirements",
): readonly TemplateCopilotV2AttachmentRequirement[];
export function compileTemplateCopilotV2StructuredFact(
  ledger: TemplateCopilotV2Ledger,
  factId: "workflow.conditions",
): readonly TemplateCopilotV2ConditionRule[];
export function compileTemplateCopilotV2StructuredFact(
  ledger: TemplateCopilotV2Ledger,
  factId: "notifications.rules",
): readonly TemplateCopilotV2NotificationRule[];
export function compileTemplateCopilotV2StructuredFact(
  ledger: TemplateCopilotV2Ledger,
  factId: TemplateCopilotV2StructuredFactId,
): readonly (
  | TemplateCopilotV2AttachmentRequirement
  | TemplateCopilotV2ConditionRule
  | TemplateCopilotV2NotificationRule
)[] {
  const fact = ledger.facts[factId];
  if (fact.status === "not_applicable") return Object.freeze([]);
  const key = factId === "attachments.requirements"
    ? "attachments"
    : factId === "workflow.conditions"
      ? "conditions"
      : "notifications";
  const issues = validateTemplateCopilotV2StructuredFacts(ledger, {
    attachments: undefined,
    conditions: undefined,
    notifications: undefined,
    [key]: fact.status === "committed" ? fact.canonicalValue : undefined,
  });
  if (fact.status !== "committed" || issues.length) {
    throw new TemplateCopilotV2StructuredFactsError(
      fact.status === "committed"
        ? issues
        : [issue(factId, "root", "invalid_shape", "Commit this structured setting before compiling it.")],
    );
  }
  if (factId === "attachments.requirements") {
    return Object.freeze(templateCopilotV2AttachmentRequirementsSchema.parse(fact.canonicalValue));
  }
  if (factId === "workflow.conditions") {
    return Object.freeze(templateCopilotV2ConditionRulesSchema.parse(fact.canonicalValue));
  }
  return Object.freeze(templateCopilotV2NotificationRulesSchema.parse(fact.canonicalValue));
}

/** Compiler boundary for Step 7. It accepts only the ledger's validated,
 * canonical structures. Display prose is intentionally not an input. */
export function compileTemplateCopilotV2StructuredFacts(
  ledger: TemplateCopilotV2Ledger,
): TemplateCopilotV2StructuredCompilation {
  return Object.freeze({
    attachments: compileTemplateCopilotV2StructuredFact(ledger, "attachments.requirements"),
    conditions: compileTemplateCopilotV2StructuredFact(ledger, "workflow.conditions"),
    notifications: compileTemplateCopilotV2StructuredFact(ledger, "notifications.rules"),
  });
}

export function previewTemplateCopilotV2StructuredFact(
  factId: TemplateCopilotV2StructuredFactId,
  value: unknown,
  locale: "en" | "zh-Hant" | "zh-Hans",
): readonly string[] {
  const label = (key: string) => structuredPreviewLabel(key, locale);
  const route = (token: string) => structuredPreviewRoute(token, locale);
  if (factId === "attachments.requirements") {
    return templateCopilotV2AttachmentRequirementsSchema.parse(value).map((item) => {
      const format = item.kind === "attachment"
        ? locale === "en"
          ? `; ${item.formats.map(label).join(", ")}`
          : `；${item.formats.map(label).join("、")}`
        : "";
      const fileSize = item.kind === "attachment"
        ? locale === "en"
          ? `; maximum ${item.maximumFileSizeMb} MB per file`
          : locale === "zh-Hant"
            ? `；每個檔案最多 ${item.maximumFileSizeMb} MB`
            : `；每个文件最多 ${item.maximumFileSizeMb} MB`
        : "";
      return locale === "en"
        ? `${item.label}: ${label(item.kind)}${format}${fileSize}; ${item.minimumQuantity}–${item.maximumQuantity}; ${label(item.required ? "required" : "optional")}; ${route(item.stage)}; ${label(item.contributorPolicy)}; ${label(item.confirmationPolicy)}`
        : `${item.label}：${label(item.kind)}${format}${fileSize}；${item.minimumQuantity}–${item.maximumQuantity} 份；${label(item.required ? "required" : "optional")}；${route(item.stage)}；${label(item.contributorPolicy)}；${label(item.confirmationPolicy)}`;
    });
  }
  if (factId === "workflow.conditions") {
    return templateCopilotV2ConditionRulesSchema.parse(value).map((item) => {
      const measure = item.currency || item.unit || "";
      return locale === "en"
        ? `${item.sequence}. If ${item.field} ${label(item.operator)} ${measure} ${item.value}, go to ${route(item.matchingRoute)}; otherwise go to ${route(item.otherwiseRoute)}.`
        : locale === "zh-Hant"
          ? `${item.sequence}. 如果 ${item.field} ${label(item.operator)} ${measure} ${item.value}，前往${route(item.matchingRoute)}；否則前往${route(item.otherwiseRoute)}。`
          : `${item.sequence}. 如果 ${item.field} ${label(item.operator)} ${measure} ${item.value}，前往${route(item.matchingRoute)}；否则前往${route(item.otherwiseRoute)}。`;
    });
  }
  return templateCopilotV2NotificationRulesSchema.parse(value).map((item) =>
    locale === "en"
      ? `${label(item.event)}: ${item.recipients.map(label).join(", ")}; ${label(item.timing.mode)}${item.timing.offsetHours ? ` by ${item.timing.offsetHours} hours` : ""}; ${label(item.channel)}; ${label(item.visibility)}${item.stage ? `; ${route(item.stage)}` : ""}`
      : locale === "zh-Hant"
        ? `${label(item.event)}：${item.recipients.map(label).join("、")}；${label(item.timing.mode)}${item.timing.offsetHours ? ` ${item.timing.offsetHours} 小時` : ""}；${label(item.channel)}；${label(item.visibility)}${item.stage ? `；${route(item.stage)}` : ""}`
        : `${label(item.event)}：${item.recipients.map(label).join("、")}；${label(item.timing.mode)}${item.timing.offsetHours ? ` ${item.timing.offsetHours} 小时` : ""}；${label(item.channel)}；${label(item.visibility)}${item.stage ? `；${route(item.stage)}` : ""}`);
}

function structuredPreviewLabel(key: string, locale: "en" | "zh-Hant" | "zh-Hans") {
  const labels: Record<string, readonly [string, string, string]> = {
    attachment: ["uploaded file", "上載檔案", "上传文件"], form: ["in-app form", "應用程式內表格", "应用内表单"],
    contains: ["contains", "包含", "包含"],
    text: ["text", "文字", "文本"], pdf: ["PDF", "PDF", "PDF"], image: ["image", "圖片", "图片"], excel_csv: ["spreadsheet or CSV", "試算表或 CSV", "电子表格或 CSV"],
    required: ["required", "必須提供", "必须提供"], optional: ["optional", "選填", "选填"],
    request_submission: ["when the request is submitted", "提交申請時", "提交申请时"],
    requester_only: ["requester only", "只限申請人", "仅限申请人"], allow_invited_contributors: ["invited colleagues may contribute", "可邀請其他同事提供", "可邀请其他同事提供"],
    none: ["no separate confirmation", "毋須另行確認", "无需另行确认"], requester_confirms: ["requester confirms", "由申請人確認", "由申请人确认"], stage_owner_confirms: ["step owner confirms", "由步驟負責人確認", "由步骤负责人确认"],
    complete: ["complete the workflow", "完成流程", "完成流程"], return_for_correction: ["return for correction", "退回更正", "退回更正"],
    request_submitted: ["request submitted", "申請已提交", "申请已提交"], stage_assigned: ["work assigned", "工作已分派", "工作已分配"], stage_completed: ["step completed", "步驟已完成", "步骤已完成"],
    request_rejected: ["request rejected", "申請被拒絕", "申请被拒绝"], correction_requested: ["correction requested", "要求更正", "要求更正"], request_completed: ["workflow completed", "流程已完成", "流程已完成"],
    due_soon: ["due soon", "即將到期", "即将到期"], overdue: ["overdue", "已逾期", "已逾期"],
    requester: ["requester", "申請人", "申请人"], current_stage_participants: ["current step participants", "目前步驟處理人", "当前步骤处理人"], previous_stage_participants: ["previous step participants", "上一個步驟處理人", "上一步骤处理人"],
    all_participants: ["all workflow participants", "所有流程參與者", "所有流程参与者"], workflow_owner: ["workflow owner", "流程負責部門", "流程负责部门"],
    immediate: ["immediately", "立即", "立即"], before_due: ["before the due time", "到期前", "到期前"], after_due: ["after it becomes overdue", "逾期後", "逾期后"],
    default: ["company default", "公司預設", "公司默认"], in_app: ["in the app", "應用程式內", "应用内"], email: ["email", "電郵", "电子邮件"], in_app_and_email: ["in the app and by email", "應用程式內及電郵", "应用内及电子邮件"],
    recipients_only: ["recipients only", "只限收件人", "仅限收件人"],
  };
  const selected = labels[key];
  return selected ? selected[locale === "en" ? 0 : locale === "zh-Hant" ? 1 : 2] : key;
}

function structuredPreviewRoute(token: string, locale: "en" | "zh-Hant" | "zh-Hans") {
  if (token.startsWith("stage:")) {
    const name = token.slice("stage:".length);
    return locale === "en" ? `step ${name}` : locale === "zh-Hant" ? `步驟「${name}」` : `步骤“${name}”`;
  }
  if (token.startsWith("condition:")) {
    const name = token.slice("condition:".length);
    return locale === "en" ? `later decision ${name}` : locale === "zh-Hant" ? `後續判斷「${name}」` : `后续判断“${name}”`;
  }
  return structuredPreviewLabel(token, locale);
}

export class TemplateCopilotV2StructuredFactsError extends Error {
  readonly issues: readonly TemplateCopilotV2StructuredIssue[];

  constructor(issues: readonly TemplateCopilotV2StructuredIssue[]) {
    super("The structured workflow settings are invalid.");
    this.name = "TemplateCopilotV2StructuredFactsError";
    this.issues = issues;
  }
}

export class TemplateCopilotV2StructuredEditorUnavailableError extends Error {
  readonly factId: TemplateCopilotV2StructuredFactId;

  constructor(factId: TemplateCopilotV2StructuredFactId) {
    super("This structured editor is unavailable.");
    this.name = "TemplateCopilotV2StructuredEditorUnavailableError";
    this.factId = factId;
  }
}

export function isTemplateCopilotV2StrictStructuredValue(
  factId: TemplateCopilotFactId,
  value: unknown,
): factId is TemplateCopilotV2StructuredFactId {
  if (factId === "attachments.requirements") return templateCopilotV2AttachmentRequirementsSchema.safeParse(value).success;
  if (factId === "workflow.conditions") return templateCopilotV2ConditionRulesSchema.safeParse(value).success;
  if (factId === "notifications.rules") return templateCopilotV2NotificationRulesSchema.safeParse(value).success;
  return false;
}

/** Deterministic UI upgrade for legacy Step 5 shapes. It adds structural
 * metadata only; unknown event, recipient, field, stage, and route text is
 * retained so the strict editor can flag it for a human instead of guessing. */
export function prepareTemplateCopilotV2StructuredEditorValue(
  factId: TemplateCopilotV2StructuredFactId,
  value: unknown,
) {
  const items = Array.isArray(value) ? value : [];
  if (factId === "attachments.requirements") {
    return items.map((input, index) => {
      if (templateCopilotV2AttachmentRequirementSchema.safeParse(input).success) return input;
      const item = isRecord(input) ? input : {};
      const formats = Array.isArray(item.formats) ? item.formats : [];
      const required = item.required === true;
      return {
        id: `attachment-${index + 1}`,
        label: String(item.label || ""),
        kind: "attachment",
        required,
        formats,
        minimumQuantity: required ? 1 : 0,
        maximumQuantity: 1,
        maximumFileSizeMb: 20,
        stage: typeof item.stage === "string" ? `stage:${item.stage}` : "request_submission",
        contributorPolicy: "requester_only",
        confirmationPolicy: "none",
      };
    });
  }
  if (factId === "workflow.conditions") {
    return items.map((input, index) => {
      if (templateCopilotV2ConditionRuleSchema.safeParse(input).success) return input;
      const item = isRecord(input) ? input : {};
      const route = (routeValue: unknown) => {
        const text = String(routeValue || "");
        return ["complete", "return_for_correction"].includes(text) || text.startsWith("stage:") || text.startsWith("condition:")
          ? text
          : `stage:${text}`;
      };
      return {
        id: `condition-${index + 1}`,
        sequence: index + 1,
        field: String(item.field || ""),
        operator: String(item.operator || "="),
        value: item.value ?? "",
        matchingRoute: route(item.matchingRoute),
        otherwiseRoute: route(item.otherwiseRoute),
      };
    });
  }
  return items.map((input, index) => {
    if (templateCopilotV2NotificationRuleSchema.safeParse(input).success) return input;
    const item = isRecord(input) ? input : {};
    const event = String(item.event || "");
    const recipients = Array.isArray(item.recipients) ? item.recipients.map(String) : [];
    return {
      id: `notification-${index + 1}`,
      event,
      recipients,
      timing: { mode: "immediate" },
      channel: item.channel === "in_app" || item.channel === "email" ? item.channel : "default",
      visibility: "recipients_only",
    };
  });
}

function committedValue(ledger: TemplateCopilotV2Ledger, factId: TemplateCopilotFactId) {
  const fact = ledger.facts[factId];
  return fact.status === "committed" ? fact.canonicalValue : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function committedArray(ledger: TemplateCopilotV2Ledger, factId: TemplateCopilotFactId) {
  const value = committedValue(ledger, factId);
  return Array.isArray(value)
    ? value.flatMap((item) => isRecord(item) ? [item as Record<string, unknown>] : [])
    : [];
}
function strictOrUndefined<T>(ledger: TemplateCopilotV2Ledger, factId: TemplateCopilotFactId, schema: z.ZodType<T>) {
  const value = committedValue(ledger, factId);
  return schema.safeParse(value).success ? value : undefined;
}
function issue(factId: TemplateCopilotV2StructuredFactId, path: string, code: TemplateCopilotV2StructuredIssue["code"], message: string): TemplateCopilotV2StructuredIssue {
  return Object.freeze({ factId, path, code, message });
}
function addZodIssues(target: TemplateCopilotV2StructuredIssue[], factId: TemplateCopilotV2StructuredFactId, error: z.ZodError) {
  for (const item of error.issues) target.push(issue(factId, item.path.join(".") || "root", "invalid_shape", item.message));
}
function duplicateIssues(items: readonly { id: string; sequence?: number }[], factId: TemplateCopilotV2StructuredFactId, issues: TemplateCopilotV2StructuredIssue[], sequence = false) {
  const ids = new Set<string>();
  const sequences = new Set<number>();
  items.forEach((item, index) => {
    if (ids.has(item.id)) issues.push(issue(factId, `${index}.id`, "duplicate_id", "Each item needs a unique ID."));
    ids.add(item.id);
    if (sequence && item.sequence !== undefined) {
      if (sequences.has(item.sequence)) issues.push(issue(factId, `${index}.sequence`, "duplicate_sequence", "Each condition needs a unique sequence."));
      sequences.add(item.sequence);
    }
  });
}
function hasConditionCycle(items: readonly TemplateCopilotV2ConditionRule[]) {
  const graph = new Map(items.map((item) => [item.id, [item.matchingRoute, item.otherwiseRoute].filter((route) => route.startsWith("condition:")).map((route) => route.slice("condition:".length))]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) || []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...graph.keys()].some(visit);
}
