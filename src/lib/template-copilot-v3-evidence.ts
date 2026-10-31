import { createHash } from "node:crypto";
import { z } from "zod";
import {
  templateCopilotMaximumSourceCodePoints,
  templateCopilotUnicodeCodePointCount,
} from "./template-copilot-unicode.ts";

function deepFreezeAcyclic<const Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      deepFreezeAcyclic(child);
    }
    Object.freeze(value);
  }
  return value;
}

export const templateCopilotV3EvidenceContractVersion = 3 as const;
export const templateCopilotV3EvidenceCompilerVersion =
  "template-copilot-v3.0" as const;
export const templateCopilotV3MaximumSourceCodePoints =
  templateCopilotMaximumSourceCodePoints;

export const templateCopilotV3FragmentFactIds = deepFreezeAcyclic([
  "request.fields",
  "attachments.requirements",
  "workflow.stages",
  "workflow.conditions",
  "notifications.rules",
] as const);
export type TemplateCopilotV3FragmentFactId =
  (typeof templateCopilotV3FragmentFactIds)[number];

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const pointer = z
  .string()
  .max(256)
  .regex(/^(?:\/$|(?:\/(?:[A-Za-z0-9_.-]|~[01])+)+$)/);

const sqlWhitespaceCodePoints = new Set([
  0x0009,
  0x000a,
  0x000b,
  0x000c,
  0x000d,
  0x0020,
  0x0085,
  0x00a0,
  0x1680,
  0x2000,
  0x2001,
  0x2002,
  0x2003,
  0x2004,
  0x2005,
  0x2006,
  0x2007,
  0x2008,
  0x2009,
  0x200a,
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
]);

export const templateCopilotV3EcmaTrimWhitespaceCodePoints = Object.freeze([
  0x0009,
  0x000a,
  0x000b,
  0x000c,
  0x000d,
  0x0020,
  0x00a0,
  0x1680,
  0x2000,
  0x2001,
  0x2002,
  0x2003,
  0x2004,
  0x2005,
  0x2006,
  0x2007,
  0x2008,
  0x2009,
  0x200a,
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
  0xfeff,
] as const);
const ecmaTrimWhitespaceCodePoints = new Set<number>(
  templateCopilotV3EcmaTrimWhitespaceCodePoints,
);

export function templateCopilotV3StringHasOuterTrimWhitespace(value: string) {
  const codePoints = Array.from(value);
  if (codePoints.length === 0) return false;
  return (
    ecmaTrimWhitespaceCodePoints.has(codePoints[0].codePointAt(0) ?? 0) ||
    ecmaTrimWhitespaceCodePoints.has(
      codePoints[codePoints.length - 1].codePointAt(0) ?? 0,
    )
  );
}

/** NFKC, explicit ECMAScript whitespace trim/collapse, then ASCII-only
 * lowercase. No locale-sensitive case conversion is permitted. */
export function templateCopilotV3NormalizeLexicalText(value: string) {
  const codePoints = Array.from(value.normalize("NFKC"));
  let start = 0;
  let end = codePoints.length;
  while (
    start < end &&
    ecmaTrimWhitespaceCodePoints.has(codePoints[start].codePointAt(0) ?? 0)
  ) start += 1;
  while (
    end > start &&
    ecmaTrimWhitespaceCodePoints.has(codePoints[end - 1].codePointAt(0) ?? 0)
  ) end -= 1;
  let collapsed = "";
  let pendingSpace = false;
  for (let index = start; index < end; index += 1) {
    const character = codePoints[index];
    if (ecmaTrimWhitespaceCodePoints.has(character.codePointAt(0) ?? 0)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && collapsed.length > 0) collapsed += " ";
    pendingSpace = false;
    collapsed += character.replace(/[A-Z]/g, (item) => item.toLowerCase());
  }
  return collapsed;
}

/** Case-preserving NFKC plus explicit ECMAScript whitespace trim/collapse.
 * The normalized source must then equal the already-canonical fragment leaf. */
export function templateCopilotV3NormalizeTrimCollapseText(value: string) {
  const codePoints = Array.from(value.normalize("NFKC"));
  let start = 0;
  let end = codePoints.length;
  while (
    start < end &&
    ecmaTrimWhitespaceCodePoints.has(codePoints[start].codePointAt(0) ?? 0)
  ) start += 1;
  while (
    end > start &&
    ecmaTrimWhitespaceCodePoints.has(codePoints[end - 1].codePointAt(0) ?? 0)
  ) end -= 1;
  let collapsed = "";
  let pendingSpace = false;
  for (let index = start; index < end; index += 1) {
    const character = codePoints[index];
    if (ecmaTrimWhitespaceCodePoints.has(character.codePointAt(0) ?? 0)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && collapsed.length > 0) collapsed += " ";
    pendingSpace = false;
    collapsed += character;
  }
  return collapsed;
}

/** Exact, finite Unicode White_Space predicate intended to be mirrored by
 * PostgreSQL with the same explicit code-point set. */
export function templateCopilotV3ContainsNonWhitespace(value: string) {
  for (const character of value) {
    if (!sqlWhitespaceCodePoints.has(character.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

/** PostgreSQL text/jsonb cannot store U+0000, and UTF-8 conversion must not
 * silently replace an unpaired UTF-16 surrogate before a durable hash. */
export function templateCopilotV3StringIsPostgresSafe(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0) return false;
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }
  return true;
}

function postgresSafeString(maximumCodePoints: number) {
  return z.string().superRefine((value, context) => {
    if (!templateCopilotV3StringIsPostgresSafe(value)) {
      context.addIssue({
        code: "custom",
        message: "Text must be representable exactly by PostgreSQL UTF-8.",
      });
    }
    if (templateCopilotUnicodeCodePointCount(value) > maximumCodePoints) {
      context.addIssue({
        code: "custom",
        message: `Text cannot exceed ${maximumCodePoints} Unicode code points.`,
      });
    }
  });
}

const boundedSourceText = postgresSafeString(8_000).superRefine(
  (value, context) => {
    if (
      templateCopilotUnicodeCodePointCount(value) < 1 ||
      !templateCopilotV3ContainsNonWhitespace(value)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Source text must contain at least one non-whitespace Unicode code point.",
      });
    }
  },
);

const boundedLabel = postgresSafeString(200).superRefine((value, context) => {
  if (!templateCopilotV3ContainsNonWhitespace(value)) {
    context.addIssue({
      code: "custom",
      message: "A label must contain non-whitespace text.",
    });
  }
});
const boundedText = postgresSafeString(8_000).superRefine((value, context) => {
  if (!templateCopilotV3ContainsNonWhitespace(value)) {
    context.addIssue({
      code: "custom",
      message: "Text must contain a non-whitespace character.",
    });
  }
});
const boundedId = postgresSafeString(80).regex(/^[a-z][a-z0-9_-]+$/);
const fixedParticipantEmail = boundedLabel.refine(
  (value) =>
    !value.startsWith(".") &&
    !value.includes(".@") &&
    !value.includes("..") &&
    /^[A-Za-z0-9_+'.-]+@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/.test(value),
);

export function templateCopilotV3DynamicStageReferenceIsCanonical(
  value: string,
) {
  if (
    !templateCopilotV3StringIsPostgresSafe(value) ||
    !value.startsWith("stage:")
  ) {
    return false;
  }
  const suffix = value.slice("stage:".length);
  const suffixLength = templateCopilotUnicodeCodePointCount(suffix);
  return (
    suffixLength >= 1 &&
    suffixLength <= 200 &&
    templateCopilotV3ContainsNonWhitespace(suffix) &&
    !templateCopilotV3StringHasOuterTrimWhitespace(suffix) &&
    templateCopilotV3NormalizeTrimCollapseText(suffix) === suffix
  );
}

const dynamicStageReference = postgresSafeString(206).refine(
  templateCopilotV3DynamicStageReferenceIsCanonical,
  {
    message:
      "A dynamic stage reference must use a canonical case-preserving stage token.",
  },
);

const routeReference = z.union([
  z.literal("complete"),
  z.literal("return_for_correction"),
  dynamicStageReference,
  postgresSafeString(90).regex(/^condition:[a-z][a-z0-9_-]+$/u),
]);

export const templateCopilotV3DirectEvidenceRules = deepFreezeAcyclic([
  "exact",
  "nfkc_trim_collapse",
  "enum_lexical",
  "boolean_lexical",
  "numeric_lexical",
  "explicit_empty_collection",
] as const);

export const templateCopilotV3LexicalAliases = deepFreezeAcyclic({
  enumByScope: Object.freeze({
    "request.fields:/type": Object.freeze({
      text: ["文字", "文本"],
      long_text: ["long text", "長文字", "长文本"],
      number: ["數字", "数字"],
      date: ["日期"],
      currency: ["貨幣", "货币"],
      email: [
        "電郵",
        "电子邮件",
        "邮箱",
        "email field",
        "電郵欄位",
        "电子邮件字段",
      ],
      select: [
        "select",
        "dropdown",
        "select list",
        "下拉選單",
        "下拉菜单",
        "下拉列表",
      ],
      radio: ["radio", "single choice", "單選", "单选"],
      checkbox: ["checkbox", "多選", "多选", "核取方塊", "复选框"],
      table: ["表格"],
    }),
    "attachments.requirements:/kind": Object.freeze({
      attachment: ["uploaded file", "pdf", "上載檔案", "上传文件"],
      form: [
        "in-app form",
        "in app form",
        "complete a form in the app",
        "應用程式內表格",
        "在應用程式填寫表格",
        "应用内表单",
        "在应用内填写表单",
      ],
    }),
    "attachments.requirements:/formats/*": Object.freeze({
      text: ["文字", "文本"],
      pdf: ["pdf"],
      image: ["圖片", "图片"],
      excel_csv: [
        "excel csv",
        "excel/csv",
        "excel",
        "csv",
        "spreadsheet or csv",
        "spreadsheet / csv",
        "試算表或 csv",
        "試算表/csv",
        "电子表格或 csv",
        "电子表格/csv",
      ],
    }),
    "attachments.requirements:/stage": Object.freeze({
      request_submission: [
        "when the request is submitted",
        "提交申請時",
        "提交申请时",
      ],
    }),
    "attachments.requirements:/contributorPolicy": Object.freeze({
      requester_only: ["requester only", "只限申請人", "仅限申请人"],
      allow_invited_contributors: [
        "invited colleagues may contribute",
        "可邀請其他同事提供",
        "可邀请其他同事提供",
        "可邀請其他同事",
        "可邀请其他同事",
      ],
    }),
    "attachments.requirements:/confirmationPolicy": Object.freeze({
      none: ["no separate confirmation", "毋須另行確認", "无需另行确认"],
      requester_confirms: [
        "requester confirms",
        "由申請人確認",
        "由申请人确认",
        "申請人確認",
        "申请人确认",
      ],
      stage_owner_confirms: [
        "step owner confirms",
        "由步驟負責人確認",
        "由步骤负责人确认",
        "該步驟負責人確認",
        "该步骤负责人确认",
      ],
    }),
    "workflow.stages:/kind": Object.freeze({
      approval: ["approve", "審批", "审批", "核准", "批准"],
      review: ["審核", "审核", "覆核", "复核", "審查", "审查", "評審", "评审"],
      for_information: [
        "for information",
        "informational",
        "知會",
        "知会",
        "供參考",
        "供参考",
        "供知悉",
      ],
      submission: ["submit", "提交", "呈交"],
    }),
    "workflow.stages:/participant/mode": Object.freeze({
      fixed_email: [
        "fixed email",
        "固定電郵",
        "固定电子邮件",
        "固定電子郵件",
        "固定邮箱",
      ],
      directory_position: ["directory position", "目錄職位", "目录职位"],
      request_field: ["request field", "申請欄位", "申请字段"],
      requester: ["申請人", "申请人", "發起人", "发起人"],
      unassigned_at_template: [
        "unassigned",
        "resolve later",
        "範本未指派",
        "模板未分配",
        "稍後指定",
        "稍后指定",
      ],
    }),
    "workflow.conditions:/operator": Object.freeze({
      "=": ["equals", "equal", "等於", "等于", "为是"],
      "!=": ["not equal", "不等於", "不等于"],
      ">": ["greater than", "大於", "大于", "超過", "超过"],
      ">=": ["at least", "大於或等於", "大于或等于"],
      "<": ["less than", "小於", "小于"],
      "<=": ["at most", "小於或等於", "小于或等于"],
      contains: ["包含"],
    }),
    "workflow.conditions:/matchingRoute": Object.freeze({
      complete: ["complete the workflow", "完成流程"],
      return_for_correction: ["return for correction", "退回更正"],
    }),
    "workflow.conditions:/otherwiseRoute": Object.freeze({
      complete: ["complete the workflow", "完成流程"],
      return_for_correction: ["return for correction", "退回更正"],
    }),
    "notifications.rules:/event": Object.freeze({
      request_submitted: ["request submitted", "申請已提交", "申请已提交"],
      stage_assigned: [
        "work assigned",
        "工作已分派",
        "工作已分配",
      ],
      stage_completed: ["step completed", "步驟已完成", "步骤已完成"],
      request_rejected: [
        "request rejected",
        "申請被拒絕",
        "申请被拒绝",
      ],
      correction_requested: [
        "correction requested",
        "要求更正",
      ],
      request_completed: ["workflow completed", "流程已完成"],
      due_soon: ["due soon", "即將到期", "即将到期"],
      overdue: ["已逾期"],
    }),
    "notifications.rules:/recipients/*": Object.freeze({
      requester: ["申請人", "申请人", "發起人", "发起人"],
      current_stage_participants: [
        "current step participants",
        "目前步驟處理人",
        "当前步骤处理人",
      ],
      previous_stage_participants: [
        "previous step participants",
        "上一個步驟處理人",
        "上一步骤处理人",
      ],
      all_participants: [
        "all workflow participants",
        "所有流程參與者",
        "所有流程参与者",
      ],
      workflow_owner: ["workflow owner", "流程負責部門", "流程负责部门"],
    }),
    "notifications.rules:/timing/mode": Object.freeze({
      immediate: ["immediately", "立即"],
      before_due: ["before the due time", "到期前"],
      after_due: ["after it becomes overdue", "逾期後", "逾期后"],
    }),
    "notifications.rules:/channel": Object.freeze({
      default: ["company default", "公司預設", "公司默认"],
      in_app: ["in app", "in-app", "in the app", "應用程式內", "应用内"],
      email: [
        "電郵",
        "电子邮件",
        "邮箱",
        "by email",
        "via email",
        "以電郵發送",
        "通过电子邮件发送",
      ],
      in_app_and_email: [
        "in the app and by email",
        "in the app and email",
        "應用程式內及電郵",
        "应用内及电子邮件",
      ],
    }),
    "notifications.rules:/visibility": Object.freeze({
      recipients_only: ["recipients only", "只限收件人", "仅限收件人"],
      all_participants: [
        "all workflow participants",
        "所有流程參與者",
        "所有流程参与者",
      ],
    }),
    "notifications.rules:/stage": Object.freeze({}),
  } as const),
  boolean: Object.freeze({
    true: [
      "true",
      "yes",
      "required",
      "是",
      "需要",
      "必填",
      "必須",
      "必须",
      "必須提供",
      "必须提供",
    ],
    false: ["false", "no", "not required", "optional", "否", "不需要", "非必須", "非必须", "選填", "选填"],
  } as const),
  ordinal: Object.freeze({
    1: ["1", "first", "1st", "第一", "一", "第一個", "第一个"],
    2: ["2", "second", "2nd", "第二", "二", "第二個", "第二个"],
    3: ["3", "third", "3rd", "第三", "三", "第三個", "第三个"],
    4: ["4", "fourth", "4th", "第四", "四", "第四個", "第四个"],
    5: ["5", "fifth", "5th", "第五", "五", "第五個", "第五个"],
  } as const),
  emptyCollection: Object.freeze([
    "none",
    "no options",
    "no formats",
    "not applicable",
    "無",
    "无",
    "沒有",
    "没有",
    "沒有選項",
    "没有选项",
    "沒有格式",
    "没有格式",
    "不適用",
    "不适用",
  ] as const),
});

export const templateCopilotV3SourceSpanSchema = z
  .object({
    spanId: hash,
    messageId: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
    startCodePoint: z
      .number()
      .int()
      .min(0)
      .max(templateCopilotV3MaximumSourceCodePoints),
    endCodePoint: z
      .number()
      .int()
      .min(1)
      .max(templateCopilotV3MaximumSourceCodePoints),
    exactText: boundedSourceText,
  })
  .strict()
  .superRefine((span, context) => {
    if (span.endCodePoint <= span.startCodePoint) {
      context.addIssue({
        code: "custom",
        path: ["endCodePoint"],
        message: "A source span must not be empty.",
      });
    }
    if (
      span.endCodePoint - span.startCodePoint !==
      templateCopilotUnicodeCodePointCount(span.exactText)
    ) {
      context.addIssue({
        code: "custom",
        path: ["exactText"],
        message: "Source-span coordinates must match its Unicode text length.",
      });
    }
    if (
      span.spanId !==
      templateCopilotV3SourceSpanId({
        messageId: span.messageId,
        startCodePoint: span.startCodePoint,
        endCodePoint: span.endCodePoint,
        exactText: span.exactText,
      })
    ) {
      context.addIssue({
        code: "custom",
        path: ["spanId"],
        message: "The source-span ID is not canonical.",
      });
    }
  });

export const templateCopilotV3BindingSchema = z
  .object({
    path: pointer,
    spanIds: z.array(hash).min(1).max(16),
    rule: z.enum(templateCopilotV3DirectEvidenceRules),
  })
  .strict()
  .superRefine((binding, context) => {
    if (new Set(binding.spanIds).size !== binding.spanIds.length) {
      context.addIssue({
        code: "custom",
        path: ["spanIds"],
        message: "A binding cannot repeat a source span.",
      });
    }
  });

const requestFieldValueSchema = z
  .object({
    label: boundedLabel.optional(),
    type: z
      .enum([
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
      ])
      .optional(),
    required: z.boolean().optional(),
    options: z.array(boundedLabel).max(100).optional(),
  })
  .strict();

const attachmentValueSchema = z
  .object({
    id: boundedId.optional(),
    label: boundedLabel.optional(),
    kind: z.enum(["attachment", "form"]).optional(),
    required: z.boolean().optional(),
    formats: z
      .array(z.enum(["text", "pdf", "image", "excel_csv"]))
      .max(4)
      .optional(),
    minimumQuantity: z.number().int().min(0).max(20).optional(),
    maximumQuantity: z.number().int().min(1).max(20).optional(),
    maximumFileSizeMb: z.number().int().min(1).max(25).optional(),
    stage: z
      .union([
        z.literal("request_submission"),
        dynamicStageReference,
      ])
      .optional(),
    contributorPolicy: z
      .enum(["requester_only", "allow_invited_contributors"])
      .optional(),
    confirmationPolicy: z
      .enum(["none", "requester_confirms", "stage_owner_confirms"])
      .optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if (
      item.minimumQuantity !== undefined &&
      item.maximumQuantity !== undefined &&
      item.maximumQuantity < item.minimumQuantity
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumQuantity"],
        message: "Maximum quantity cannot be lower than minimum quantity.",
      });
    }
    if (
      item.required === true &&
      item.minimumQuantity !== undefined &&
      item.minimumQuantity < 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumQuantity"],
        message: "A required item needs at least one submission.",
      });
    }
    if (
      item.kind === "attachment" &&
      item.formats !== undefined &&
      item.formats.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["formats"],
        message: "An attachment needs at least one accepted format.",
      });
    }
    if (
      item.formats !== undefined &&
      new Set(item.formats).size !== item.formats.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["formats"],
        message: "Accepted formats cannot be repeated.",
      });
    }
    if (
      item.kind === "form" &&
      ((item.formats !== undefined && item.formats.length > 0) ||
        item.maximumFileSizeMb !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["formats"],
        message: "A form cannot carry file formats or a file-size limit.",
      });
    }
    if (
      item.stage === "request_submission" &&
      item.confirmationPolicy === "stage_owner_confirms"
    ) {
      context.addIssue({
        code: "custom",
        path: ["confirmationPolicy"],
        message:
          "Request submission has no workflow step owner to confirm this item.",
      });
    }
  });

const participantValueSchema = z
  .object({
    mode: z
      .enum([
        "fixed_email",
        "directory_position",
        "request_field",
        "requester",
        "unassigned_at_template",
      ])
      .optional(),
    value: boundedLabel.optional(),
  })
  .strict();

const stageValueSchema = z
  .object({
    label: boundedLabel.optional(),
    kind: z
      .enum(["approval", "review", "for_information", "submission"])
      .optional(),
    participant: participantValueSchema.optional(),
    sequence: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const conditionValueSchema = z
  .object({
    id: boundedId.optional(),
    sequence: z.number().int().min(1).max(50).optional(),
    field: boundedLabel.optional(),
    operator: z
      .enum(["=", "!=", ">", ">=", "<", "<=", "contains"])
      .optional(),
    value: z.union([boundedText, z.number().finite()]).optional(),
    currency: postgresSafeString(3).regex(/^[A-Z]{3}$/).optional(),
    unit: boundedLabel.optional(),
    matchingRoute: routeReference.optional(),
    otherwiseRoute: routeReference.optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.currency !== undefined && item.unit !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Use either a currency or a unit, not both.",
      });
    }
    if (
      item.operator !== undefined &&
      item.value !== undefined &&
      [">", ">=", "<", "<="].includes(item.operator) &&
      typeof item.value !== "number"
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "A numeric comparison needs a numeric value.",
      });
    }
    if (
      item.operator === "contains" &&
      item.value !== undefined &&
      typeof item.value !== "string"
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "A contains comparison needs text.",
      });
    }
    if (
      item.matchingRoute !== undefined &&
      item.otherwiseRoute !== undefined &&
      item.matchingRoute === item.otherwiseRoute
    ) {
      context.addIssue({
        code: "custom",
        path: ["otherwiseRoute"],
        message: "Matching and otherwise routes must be different.",
      });
    }
  });

const timingValueSchema = z
  .object({
    mode: z.enum(["immediate", "before_due", "after_due"]).optional(),
    offsetHours: z.number().int().min(1).max(8_760).optional(),
  })
  .strict();

const notificationValueSchema = z
  .object({
    id: boundedId.optional(),
    event: z
      .enum([
        "request_submitted",
        "stage_assigned",
        "stage_completed",
        "request_rejected",
        "correction_requested",
        "request_completed",
        "due_soon",
        "overdue",
      ])
      .optional(),
    recipients: z
      .array(
        z.enum([
          "requester",
          "current_stage_participants",
          "previous_stage_participants",
          "all_participants",
          "workflow_owner",
        ]),
      )
      .min(1)
      .max(5)
      .optional(),
    timing: timingValueSchema.optional(),
    channel: z
      .enum(["default", "in_app", "email", "in_app_and_email"])
      .optional(),
    visibility: z
      .enum(["recipients_only", "all_participants"])
      .optional(),
    stage: dynamicStageReference.optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if (
      item.recipients !== undefined &&
      new Set(item.recipients).size !== item.recipients.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["recipients"],
        message: "A recipient group cannot be selected more than once.",
      });
    }
    const mode = item.timing?.mode;
    const offset = item.timing?.offsetHours;
    if (mode === "immediate" && offset !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["timing", "offsetHours"],
        message: "Immediate notifications cannot have an hour offset.",
      });
    }
    if (
      item.event === "due_soon" &&
      mode !== undefined &&
      mode !== "before_due"
    ) {
      context.addIssue({
        code: "custom",
        path: ["timing", "mode"],
        message: "Due-soon notifications must be scheduled before the due time.",
      });
    }
    if (
      item.event === "overdue" &&
      mode !== undefined &&
      mode !== "after_due"
    ) {
      context.addIssue({
        code: "custom",
        path: ["timing", "mode"],
        message: "Overdue notifications must be scheduled after the due time.",
      });
    }
    if (
      item.event !== undefined &&
      !["due_soon", "overdue"].includes(item.event) &&
      mode !== undefined &&
      mode !== "immediate"
    ) {
      context.addIssue({
        code: "custom",
        path: ["timing", "mode"],
        message: "This event is sent immediately.",
      });
    }
  });

const fragmentValueSchemas = {
  "request.fields": requestFieldValueSchema,
  "attachments.requirements": attachmentValueSchema,
  "workflow.stages": stageValueSchema,
  "workflow.conditions": conditionValueSchema,
  "notifications.rules": notificationValueSchema,
} as const;

const fragmentRequiredPaths: Readonly<
  Record<TemplateCopilotV3FragmentFactId, readonly string[]>
> = {
  "request.fields": ["/label", "/type", "/required", "/options"],
  "attachments.requirements": [
    "/id",
    "/label",
    "/kind",
    "/required",
    "/formats",
    "/minimumQuantity",
    "/maximumQuantity",
    "/stage",
    "/contributorPolicy",
    "/confirmationPolicy",
  ],
  "workflow.stages": [
    "/label",
    "/kind",
    "/participant/mode",
    "/sequence",
  ],
  "workflow.conditions": [
    "/id",
    "/sequence",
    "/field",
    "/operator",
    "/value",
    "/matchingRoute",
    "/otherwiseRoute",
  ],
  "notifications.rules": [
    "/id",
    "/event",
    "/recipients",
    "/timing/mode",
    "/channel",
    "/visibility",
  ],
};

const fragmentMissingPaths: Readonly<
  Record<TemplateCopilotV3FragmentFactId, ReadonlySet<string>>
> = {
  "request.fields": new Set([
    "/label",
    "/type",
    "/required",
    "/options",
  ]),
  "attachments.requirements": new Set([
    "/id",
    "/label",
    "/kind",
    "/required",
    "/formats",
    "/minimumQuantity",
    "/maximumQuantity",
    "/maximumFileSizeMb",
    "/stage",
    "/contributorPolicy",
    "/confirmationPolicy",
  ]),
  "workflow.stages": new Set([
    "/label",
    "/kind",
    "/participant",
    "/participant/mode",
    "/participant/value",
    "/sequence",
  ]),
  "workflow.conditions": new Set([
    "/id",
    "/sequence",
    "/field",
    "/operator",
    "/value",
    "/currency",
    "/unit",
    "/matchingRoute",
    "/otherwiseRoute",
  ]),
  "notifications.rules": new Set([
    "/id",
    "/event",
    "/recipients",
    "/timing",
    "/timing/mode",
    "/timing/offsetHours",
    "/channel",
    "/visibility",
    "/stage",
  ]),
};

type DirectValueKind = "text" | "enum" | "boolean" | "number" | "empty";

function fragmentPathKind(
  factId: TemplateCopilotV3FragmentFactId,
  path: string,
  value: unknown,
): DirectValueKind | null {
  const leafValue = valueAtPointer(value, path);
  if (
    leafValue !== null &&
    typeof leafValue === "object" &&
    Object.keys(leafValue).length === 0
  ) {
    return "empty";
  }
  if (typeof leafValue === "boolean") return "boolean";
  if (typeof leafValue === "number") return "number";
  if (typeof leafValue !== "string") return null;

  const enumPaths: Readonly<Record<TemplateCopilotV3FragmentFactId, RegExp>> = {
    "request.fields": /^\/type$/,
    "attachments.requirements":
      /^\/(?:kind|formats\/(?:0|[1-9][0-9]*)|stage|contributorPolicy|confirmationPolicy)$/,
    "workflow.stages": /^\/(?:kind|participant\/mode)$/,
    "workflow.conditions":
      /^\/(?:operator|matchingRoute|otherwiseRoute)$/,
    "notifications.rules":
      /^\/(?:event|recipients\/(?:0|[1-9][0-9]*)|timing\/mode|channel|visibility|stage)$/,
  };
  return enumPaths[factId].test(path) ? "enum" : "text";
}

function ruleMatchesKind(
  rule: (typeof templateCopilotV3DirectEvidenceRules)[number],
  kind: DirectValueKind,
) {
  if (kind === "text") return rule === "exact" || rule === "nfkc_trim_collapse";
  if (kind === "enum") return rule === "enum_lexical";
  if (kind === "boolean") return rule === "boolean_lexical";
  if (kind === "number") return rule === "numeric_lexical";
  return rule === "explicit_empty_collection";
}

export type TemplateCopilotV3DirectEvidenceInput = Readonly<{
  factId: TemplateCopilotV3FragmentFactId;
  path: string;
  rule: (typeof templateCopilotV3DirectEvidenceRules)[number];
  value: unknown;
  sourceText: string;
}>;

function enumScopePath(
  factId: TemplateCopilotV3FragmentFactId,
  path: string,
) {
  if (
    factId === "attachments.requirements" &&
    /^\/formats\/(?:0|[1-9][0-9]*)$/.test(path)
  ) {
    return "/formats/*";
  }
  if (
    factId === "notifications.rules" &&
    /^\/recipients\/(?:0|[1-9][0-9]*)$/.test(path)
  ) {
    return "/recipients/*";
  }
  return path;
}

function enumLeafIsAllowed(
  factId: TemplateCopilotV3FragmentFactId,
  path: string,
  leafValue: string,
) {
  if (
    leafValue.startsWith("stage:") &&
    templateCopilotV3DynamicStageReferenceIsCanonical(leafValue)
  ) {
    return (
      (factId === "attachments.requirements" && path === "/stage") ||
      (factId === "workflow.conditions" &&
        (path === "/matchingRoute" || path === "/otherwiseRoute")) ||
      (factId === "notifications.rules" && path === "/stage")
    );
  }
  if (
    factId === "workflow.conditions" &&
    (path === "/matchingRoute" || path === "/otherwiseRoute") &&
    leafValue.length <= 90 &&
    /^condition:[a-z][a-z0-9_-]+$/.test(leafValue)
  ) {
    return true;
  }
  const scopeKey = `${factId}:${enumScopePath(factId, path)}`;
  const scope = (
    templateCopilotV3LexicalAliases.enumByScope as Readonly<
      Record<string, Readonly<Record<string, readonly string[]>>>
    >
  )[scopeKey];
  return scope !== undefined && Object.hasOwn(scope, leafValue);
}

const smallEnglishOrdinals = Object.freeze([
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
] as const);
const englishOrdinalTens = Object.freeze({
  2: ["twenty", "twentieth"],
  3: ["thirty", "thirtieth"],
  4: ["forty", "fortieth"],
  5: ["fifty", "fiftieth"],
  6: ["sixty", "sixtieth"],
  7: ["seventy", "seventieth"],
  8: ["eighty", "eightieth"],
  9: ["ninety", "ninetieth"],
} as const);
const chineseOrdinalDigits = Object.freeze([
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
] as const);

function ordinalAliasMatches(sequence: number, wording: string) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 100) return false;
  const lastTwo = sequence % 100;
  const last = sequence % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : last === 1
        ? "st"
        : last === 2
          ? "nd"
          : last === 3
            ? "rd"
            : "th";
  if (wording === `${sequence}${suffix}`) return true;

  let englishOrdinal: string;
  let englishSpaced: string | undefined;
  if (sequence <= 19) {
    englishOrdinal = smallEnglishOrdinals[sequence - 1];
  } else if (sequence === 100) {
    englishOrdinal = "one hundredth";
  } else {
    const tens = Math.floor(sequence / 10) as keyof typeof englishOrdinalTens;
    const units = sequence % 10;
    const [tensCardinal, tensOrdinal] = englishOrdinalTens[tens];
    if (units === 0) {
      englishOrdinal = tensOrdinal;
    } else {
      const unitOrdinal = smallEnglishOrdinals[units - 1];
      englishOrdinal = `${tensCardinal}-${unitOrdinal}`;
      englishSpaced = `${tensCardinal} ${unitOrdinal}`;
    }
  }
  if (wording === englishOrdinal || wording === englishSpaced) return true;

  let chineseNumeral: string;
  if (sequence < 10) {
    chineseNumeral = chineseOrdinalDigits[sequence - 1];
  } else if (sequence === 10) {
    chineseNumeral = "十";
  } else if (sequence < 20) {
    chineseNumeral = `十${chineseOrdinalDigits[(sequence % 10) - 1]}`;
  } else if (sequence < 100) {
    const tens = Math.floor(sequence / 10);
    const units = sequence % 10;
    chineseNumeral = `${chineseOrdinalDigits[tens - 1]}十${
      units === 0 ? "" : chineseOrdinalDigits[units - 1]
    }`;
  } else {
    chineseNumeral = "一百";
  }
  return [
    chineseNumeral,
    `第${chineseNumeral}`,
    `第${chineseNumeral}個`,
    `第${chineseNumeral}个`,
    `第${sequence}`,
    `第${sequence}個`,
    `第${sequence}个`,
  ].includes(wording);
}

function canonicalNumberSignificantDigitCount(canonical: string) {
  const digits = canonical
    .replace(/^-/, "")
    .replace(".", "")
    .replace(/^0+/, "")
    .replace(/0+$/, "");
  return digits.length;
}

/** Canonical JavaScript/JSON number text admitted by the fragment contract.
 * The range avoids exponent notation, while the significant-digit cap keeps
 * app and PostgreSQL decimal round trips deterministic. Negative zero is
 * intentionally represented by JSON as canonical zero. */
export function templateCopilotV3CanonicalJsonNumberText(value: number) {
  if (!Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  if (
    value !== 0 &&
    (magnitude < 0.000_001 || magnitude >= 1e21)
  ) {
    return null;
  }
  const canonical = JSON.stringify(value);
  if (
    typeof canonical !== "string" ||
    !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(canonical) ||
    canonicalNumberSignificantDigitCount(canonical) > 15
  ) {
    return null;
  }
  return canonical;
}

/** Deterministic cross-layer predicate. One call evaluates one source span;
 * callers must require this predicate for every span ID in a binding. */
export function templateCopilotV3DirectEvidenceDerivesLeaf({
  factId,
  path,
  rule,
  value,
  sourceText,
}: TemplateCopilotV3DirectEvidenceInput) {
  if (!templateCopilotV3StringIsPostgresSafe(sourceText)) return false;
  const kind = fragmentPathKind(factId, path, value);
  if (kind === null || !ruleMatchesKind(rule, kind)) return false;
  const leafValue = valueAtPointer(value, path);
  if (rule === "exact") {
    return typeof leafValue === "string" && sourceText === leafValue;
  }
  const wording = templateCopilotV3NormalizeLexicalText(sourceText);
  if (rule === "nfkc_trim_collapse") {
    return (
      typeof leafValue === "string" &&
      templateCopilotV3NormalizeTrimCollapseText(sourceText) === leafValue
    );
  }
  if (rule === "enum_lexical") {
    if (typeof leafValue !== "string") return false;
    if (!enumLeafIsAllowed(factId, path, leafValue)) return false;
    const canonical = templateCopilotV3NormalizeLexicalText(leafValue);
    if (wording === canonical) return true;
    if (leafValue.startsWith("stage:") || leafValue.startsWith("condition:")) {
      const suffix = leafValue.slice(leafValue.indexOf(":") + 1);
      if (wording === templateCopilotV3NormalizeLexicalText(suffix)) return true;
    }
    const scopeKey = `${factId}:${enumScopePath(factId, path)}`;
    const scope = (
      templateCopilotV3LexicalAliases.enumByScope as Readonly<
        Record<string, Readonly<Record<string, readonly string[]>>>
      >
    )[scopeKey];
    const aliases = (
      scope as Readonly<Record<string, readonly string[]>>
    )[leafValue] ?? [];
    return aliases.some(
      (alias) => templateCopilotV3NormalizeLexicalText(alias) === wording,
    );
  }
  if (rule === "boolean_lexical") {
    if (typeof leafValue !== "boolean") return false;
    const aliases = leafValue
      ? templateCopilotV3LexicalAliases.boolean.true
      : templateCopilotV3LexicalAliases.boolean.false;
    return aliases.some(
      (alias) => templateCopilotV3NormalizeLexicalText(alias) === wording,
    );
  }
  if (rule === "numeric_lexical") {
    if (typeof leafValue !== "number") return false;
    const canonicalLeaf = templateCopilotV3CanonicalJsonNumberText(leafValue);
    if (canonicalLeaf === null) return false;
    if (
      (factId === "workflow.stages" ||
        factId === "workflow.conditions") &&
      path === "/sequence" &&
      Number.isInteger(leafValue) &&
      leafValue >= 1
    ) {
      const maximum =
        factId === "workflow.stages" ? 100 : 50;
      if (leafValue <= maximum && ordinalAliasMatches(leafValue, wording)) {
        return true;
      }
    }
    return (
      templateCopilotV3CanonicalDecimalText(wording) === canonicalLeaf
    );
  }
  if (rule === "explicit_empty_collection") {
    if (
      leafValue === null ||
      typeof leafValue !== "object" ||
      Object.keys(leafValue).length !== 0
    ) {
      return false;
    }
    return templateCopilotV3LexicalAliases.emptyCollection.some(
      (alias) => templateCopilotV3NormalizeLexicalText(alias) === wording,
    );
  }
  return false;
}

/** Canonical plain decimal text shared with SQL. Grouping must be correct;
 * plus signs, redundant fractional zeroes, and negative zero are normalized. */
export function templateCopilotV3CanonicalDecimalText(value: string) {
  const plainDecimal = /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
  const groupedDecimal =
    /^[+-]?[1-9][0-9]{0,2}(?:,[0-9]{3})+(?:\.[0-9]+)?$/;
  if (!plainDecimal.test(value) && !groupedDecimal.test(value)) return null;
  let canonical = value.replace(/,/g, "");
  let negative = false;
  if (canonical.startsWith("+")) {
    canonical = canonical.slice(1);
  } else if (canonical.startsWith("-")) {
    negative = true;
    canonical = canonical.slice(1);
  }
  const [integer, suppliedFraction] = canonical.split(".");
  const fraction = suppliedFraction?.replace(/0+$/g, "") ?? "";
  canonical = fraction.length > 0 ? `${integer}.${fraction}` : integer;
  if (/^0(?:\.0*)?$/.test(canonical)) negative = false;
  canonical = negative ? `-${canonical}` : canonical;
  const parsed = Number(canonical);
  return templateCopilotV3CanonicalJsonNumberText(parsed) === canonical
    ? canonical
    : null;
}

const fragmentJsonValue = z.unknown().superRefine((value, context) => {
  if (
    value === null ||
    !fragmentJsonValueIsBounded(value, 0, { nodes: 0 }) ||
    canonicalJsonUtf8BytesCapped(value, 262_144) > 262_144
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Fragment values must use bounded, PostgreSQL-safe canonical JSON with ASCII object keys and no nulls.",
    });
  }
});

export const templateCopilotV3FragmentSchema = z
  .object({
    evidenceVersion: z.literal(templateCopilotV3EvidenceContractVersion),
    compilerVersion: z.literal(templateCopilotV3EvidenceCompilerVersion),
    fragmentId: hash,
    factId: z.enum(templateCopilotV3FragmentFactIds),
    fragmentKind: z.literal("array_item"),
    state: z.literal("open"),
    value: fragmentJsonValue,
    bindings: z.array(templateCopilotV3BindingSchema).min(1).max(200),
    missingPaths: z.array(pointer).min(1).max(200),
    confidence: z.enum(["low", "medium", "high"]),
    ambiguity: z.enum(["none", "possible", "ambiguous"]),
    ambiguityNote: postgresSafeString(500).optional(),
  })
  .strict()
  .superRefine((fragment, context) => {
    if (
      fragment.ambiguity === "none" &&
      fragment.ambiguityNote !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["ambiguityNote"],
        message: "Unambiguous evidence cannot carry an ambiguity note.",
      });
    } else if (
      fragment.ambiguity !== "none" &&
      (fragment.ambiguityNote === undefined ||
        !templateCopilotV3ContainsNonWhitespace(fragment.ambiguityNote) ||
        templateCopilotV3StringHasOuterTrimWhitespace(fragment.ambiguityNote))
    ) {
      context.addIssue({
        code: "custom",
        path: ["ambiguityNote"],
        message: "Ambiguous evidence requires a nonblank note with canonical whitespace edges.",
      });
    }
    const valueResult =
      fragmentValueSchemas[fragment.factId].safeParse(fragment.value);
    if (!valueResult.success) {
      for (const issue of valueResult.error.issues) {
        context.addIssue({
          code: "custom",
          path: ["value", ...issue.path],
          message: issue.message,
        });
      }
      return;
    }
    if (
      fragment.value === null ||
      typeof fragment.value !== "object" ||
      Array.isArray(fragment.value) ||
      Object.keys(fragment.value).length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "A fragment must contain at least one canonical item property.",
      });
    }
    if (fragment.fragmentId !== templateCopilotV3FragmentId(fragment)) {
      context.addIssue({
        code: "custom",
        path: ["fragmentId"],
        message: "The fragment ID is not canonical.",
      });
    }

    const leafPaths = primitiveLeafPaths(fragment.value).sort(compareText);
    const bindingPaths = fragment.bindings
      .map((binding) => binding.path)
      .sort(compareText);
    if (
      new Set(bindingPaths).size !== bindingPaths.length ||
      leafPaths.length !== bindingPaths.length ||
      leafPaths.some((path, index) => path !== bindingPaths[index])
    ) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message:
          "Bindings must cover every primitive or empty-collection leaf exactly once.",
      });
    }
    fragment.bindings.forEach((binding, index) => {
      const kind = fragmentPathKind(
        fragment.factId,
        binding.path,
        fragment.value,
      );
      if (kind === null || !ruleMatchesKind(binding.rule, kind)) {
        context.addIssue({
          code: "custom",
          path: ["bindings", index, "rule"],
          message: "The direct evidence rule must match the canonical leaf type.",
        });
      }
    });

    const allowedMissingPaths = fragmentMissingPaths[fragment.factId];
    fragment.missingPaths.forEach((path, index) => {
      if (!allowedMissingPaths.has(path)) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths", index],
          message: "The missing path is not canonical for this fact.",
        });
      }
    });
    const missingPaths = [...fragment.missingPaths].sort(compareText);
    if (new Set(missingPaths).size !== missingPaths.length) {
      context.addIssue({
        code: "custom",
        path: ["missingPaths"],
        message: "Missing paths must be unique.",
      });
    }
    if (
      missingPaths.some((path, index) =>
        missingPaths
          .slice(index + 1)
          .some((other) => pathsOverlapByPrefix(path, other)),
      ) ||
      missingPaths.some((missing) =>
        bindingPaths.some((bound) => pathsOverlapByPrefix(missing, bound)),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["missingPaths"],
        message:
          "Missing paths must be prefix-disjoint from bindings and one another.",
      });
    }
    for (const requiredPath of fragmentRequiredPaths[fragment.factId]) {
      const present = bindingPaths.some(
        (bound) =>
          bound === requiredPath || pathIsAncestor(requiredPath, bound),
      );
      const missing = missingPaths.some(
        (item) =>
          item === requiredPath || pathIsAncestor(item, requiredPath),
      );
      if (!present && !missing) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths"],
          message: `Required canonical path ${requiredPath} must be source-bound or explicitly missing.`,
        });
      }
    }

    const item = fragment.value as Record<string, unknown>;
    const pathIsPresentOrMissing = (path: string) =>
      bindingPaths.some(
        (bound) => bound === path || pathIsAncestor(path, bound),
      ) ||
      missingPaths.some(
        (missing) => missing === path || pathIsAncestor(missing, path),
      );

    if (fragment.factId === "attachments.requirements") {
      if (
        item.kind === "attachment" &&
        !pathIsPresentOrMissing("/maximumFileSizeMb")
      ) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths"],
          message:
            "An attachment maximum file size must be source-bound or explicitly missing.",
        });
      }
      if (
        item.kind === "form" &&
        missingPaths.includes("/maximumFileSizeMb")
      ) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths"],
          message: "A form cannot declare a maximum file size as unresolved.",
        });
      }
    }

    if (fragment.factId === "workflow.stages") {
      const participant =
        item.participant !== null &&
        typeof item.participant === "object" &&
        !Array.isArray(item.participant)
          ? (item.participant as Record<string, unknown>)
          : null;
      const mode = participant?.mode;
      const value = participant?.value;
      const resolverNeedsValue =
        mode === "fixed_email" ||
        mode === "directory_position" ||
        mode === "request_field";
      if (
        resolverNeedsValue &&
        value === undefined &&
        !missingPaths.includes("/participant/value")
      ) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths"],
          message: `${String(mode)} requires a source-bound or explicitly missing resolver value.`,
        });
      }
      if (
        mode !== undefined &&
        !resolverNeedsValue &&
        (value !== undefined || missingPaths.includes("/participant/value"))
      ) {
        context.addIssue({
          code: "custom",
          path: ["value", "participant", "value"],
          message: `${String(mode)} cannot carry a resolver value.`,
        });
      }
      if (
        mode === "fixed_email" &&
        typeof value === "string" &&
        !fixedParticipantEmail.safeParse(value).success
      ) {
        context.addIssue({
          code: "custom",
          path: ["value", "participant", "value"],
          message: "Fixed participant email is invalid.",
        });
      }
    }

    if (fragment.factId === "notifications.rules") {
      const timing =
        item.timing !== null &&
        typeof item.timing === "object" &&
        !Array.isArray(item.timing)
          ? (item.timing as Record<string, unknown>)
          : null;
      const mode = timing?.mode;
      if (
        mode === "immediate" &&
        missingPaths.includes("/timing/offsetHours")
      ) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths"],
          message: "An immediate notification cannot have an unresolved offset.",
        });
      }
      if (
        (mode === "before_due" || mode === "after_due") &&
        !pathIsPresentOrMissing("/timing/offsetHours")
      ) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths"],
          message:
            "A timed notification offset must be source-bound or explicitly missing.",
        });
      }
      const recipients = Array.isArray(item.recipients)
        ? item.recipients
        : [];
      const needsStage =
        ["stage_assigned", "stage_completed", "due_soon", "overdue"].includes(
          String(item.event ?? ""),
        ) ||
        recipients.includes("current_stage_participants") ||
        recipients.includes("previous_stage_participants");
      if (needsStage && !pathIsPresentOrMissing("/stage")) {
        context.addIssue({
          code: "custom",
          path: ["missingPaths"],
          message:
            "This event or recipient group needs a source-bound or explicitly missing workflow step.",
        });
      }
    }
  });

export const templateCopilotV3ExtractionEnvelopeSchema = z
  .object({
    contractVersion: z.literal(templateCopilotV3EvidenceContractVersion),
    compilerVersion: z.literal(templateCopilotV3EvidenceCompilerVersion),
    sourceSpans: z.array(templateCopilotV3SourceSpanSchema).max(2_000),
    fragments: z.array(templateCopilotV3FragmentSchema).max(1_000),
  })
  .strict()
  .superRefine((envelope, context) => {
    validateSourceSpanSet(envelope.sourceSpans, ["sourceSpans"], context);
    validateFragmentSet(envelope.fragments, ["fragments"], context);
    validateReferenceUnion({
      availableIds: envelope.sourceSpans.map((span) => span.spanId),
      fragments: envelope.fragments,
      path: ["sourceSpans"],
      context,
    });
    validateAvailableSpanSemantics({
      spanById: new Map(
        envelope.sourceSpans.map((span) => [span.spanId, span]),
      ),
      fragments: envelope.fragments,
      context,
    });
  });

export const templateCopilotV3AppendMaximumNewSourceSpans = 500 as const;
export const templateCopilotV3AppendMaximumFragments = 200 as const;
export const templateCopilotV3AppendMaximumPayloadUtf8Bytes =
  3 * 1024 * 1024;

export const templateCopilotV3EvidenceAppendSchema = z
  .object({
    contractVersion: z.literal(templateCopilotV3EvidenceContractVersion),
    compilerVersion: z.literal(templateCopilotV3EvidenceCompilerVersion),
    newSourceSpans: z
      .array(templateCopilotV3SourceSpanSchema)
      .max(templateCopilotV3AppendMaximumNewSourceSpans),
    knownSpanIds: z.array(hash).max(2_000),
    fragments: z
      .array(templateCopilotV3FragmentSchema)
      .min(1)
      .max(templateCopilotV3AppendMaximumFragments),
    evidenceDeltaHash: hash,
  })
  .strict()
  .superRefine((append, context) => {
    validateSourceSpanSet(append.newSourceSpans, ["newSourceSpans"], context);
    validateFragmentSet(append.fragments, ["fragments"], context);
    const newIds = append.newSourceSpans.map((span) => span.spanId);
    if (new Set(append.knownSpanIds).size !== append.knownSpanIds.length) {
      context.addIssue({
        code: "custom",
        path: ["knownSpanIds"],
        message: "Known source span IDs must be unique.",
      });
    }
    const knownIds = new Set(append.knownSpanIds);
    if (newIds.some((id) => knownIds.has(id))) {
      context.addIssue({
        code: "custom",
        path: ["knownSpanIds"],
        message: "New and known source span ID sets must be disjoint.",
      });
    }
    validateReferenceUnion({
      availableIds: [...newIds, ...append.knownSpanIds],
      fragments: append.fragments,
      path: ["fragments"],
      context,
    });
    validateAvailableSpanSemantics({
      spanById: new Map(
        append.newSourceSpans.map((span) => [span.spanId, span]),
      ),
      fragments: append.fragments,
      context,
    });
    const fragmentValuesAreBounded = append.fragments.every((fragment) =>
      fragmentJsonValueIsBounded(fragment.value, 0, { nodes: 0 }),
    );
    if (
      fragmentValuesAreBounded &&
      templateCopilotV3EvidenceAppendPayloadUtf8BytesCapped(
        append,
        templateCopilotV3AppendMaximumPayloadUtf8Bytes,
      ) >
      templateCopilotV3AppendMaximumPayloadUtf8Bytes
    ) {
      context.addIssue({
        code: "custom",
        path: ["newSourceSpans"],
        message: "The canonical evidence append payload exceeds 3 MiB.",
      });
    }
    if (
      append.evidenceDeltaHash !==
      templateCopilotV3EvidenceDeltaHash(
        append.newSourceSpans,
        append.knownSpanIds,
        append.fragments,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidenceDeltaHash"],
        message: "The evidence delta hash is not canonical.",
      });
    }
  });

export type TemplateCopilotV3SourceSpan = z.infer<
  typeof templateCopilotV3SourceSpanSchema
>;
export type TemplateCopilotV3Fragment = z.infer<
  typeof templateCopilotV3FragmentSchema
>;
export type TemplateCopilotV3ExtractionEnvelope = z.infer<
  typeof templateCopilotV3ExtractionEnvelopeSchema
>;
export type TemplateCopilotV3EvidenceAppend = z.infer<
  typeof templateCopilotV3EvidenceAppendSchema
>;

export function templateCopilotV3SourceSpanId({
  messageId,
  startCodePoint,
  endCodePoint,
  exactText,
}: Omit<TemplateCopilotV3SourceSpan, "spanId">) {
  const parts = [
    messageId,
    String(startCodePoint),
    String(endCodePoint),
    exactText,
  ];
  return createHash("sha256")
    .update(parts.map(lengthPrefixedUtf8).join("|"), "utf8")
    .digest("hex");
}

export function templateCopilotV3FragmentId(
  fragment: Omit<TemplateCopilotV3Fragment, "fragmentId">,
) {
  const durable = {
    evidenceVersion: fragment.evidenceVersion,
    compilerVersion: fragment.compilerVersion,
    factId: fragment.factId,
    fragmentKind: fragment.fragmentKind,
    value: fragment.value,
    bindings: canonicalBindings(fragment.bindings),
    missingPaths: [...fragment.missingPaths].sort(compareText),
    confidence: fragment.confidence,
    ambiguity: fragment.ambiguity,
    ambiguityNote: fragment.ambiguityNote ?? null,
  };
  return createHash("sha256").update(stableJson(durable), "utf8").digest("hex");
}

export function templateCopilotV3EvidenceDeltaHash(
  newSourceSpans: ReadonlyArray<Pick<TemplateCopilotV3SourceSpan, "spanId">>,
  knownSpanIds: readonly string[],
  fragments: ReadonlyArray<Pick<TemplateCopilotV3Fragment, "fragmentId">>,
) {
  const newIds = newSourceSpans
    .map((span) => span.spanId)
    .sort(compareText)
    .join(",");
  const knownIds = [...knownSpanIds].sort(compareText).join(",");
  const fragmentIds = fragments
    .map((fragment) => fragment.fragmentId)
    .sort(compareText)
    .join(",");
  return createHash("sha256")
    .update(
      `v3frag|new:${newIds}|known:${knownIds}|fragments:${fragmentIds}`,
      "utf8",
    )
    .digest("hex");
}

/** Exact app/database payload material: sum the UTF-8 byte lengths of stable
 * canonical JSON for newSourceSpans, knownSpanIds, and fragments. */
export function templateCopilotV3EvidenceAppendPayloadUtf8Bytes(
  append: Pick<
    TemplateCopilotV3EvidenceAppend,
    "newSourceSpans" | "knownSpanIds" | "fragments"
  >,
) {
  return templateCopilotV3EvidenceAppendPayloadUtf8BytesCapped(
    append,
    Number.MAX_SAFE_INTEGER,
  );
}

function templateCopilotV3EvidenceAppendPayloadUtf8BytesCapped(
  append: Pick<
    TemplateCopilotV3EvidenceAppend,
    "newSourceSpans" | "knownSpanIds" | "fragments"
  >,
  maximumBytes: number,
) {
  let bytes = 0;
  for (const value of [
    append.newSourceSpans,
    append.knownSpanIds,
    append.fragments,
  ]) {
    const remaining = maximumBytes - bytes;
    const valueBytes = canonicalJsonUtf8BytesCapped(value, remaining);
    if (valueBytes > remaining) return maximumBytes + 1;
    bytes += valueBytes;
  }
  return bytes;
}

/** Iterative canonical-JSON UTF-8 byte sizing. This intentionally computes
 * only the byte length: hashes still use stableJson after schemas have capped
 * valid JSON at depth 16. */
function canonicalJsonUtf8BytesCapped(
  value: unknown,
  maximumBytes: number,
) {
  let bytes = 0;
  const stack: unknown[] = [value];
  const addBytes = (additionalBytes: number) => {
    if (additionalBytes > maximumBytes - bytes) return false;
    bytes += additionalBytes;
    return true;
  };

  while (stack.length > 0) {
    const item = stack.pop();
    if (item === null || typeof item !== "object") {
      const json = JSON.stringify(item);
      if (
        typeof json !== "string" ||
        !addBytes(Buffer.byteLength(json, "utf8"))
      ) {
        return maximumBytes + 1;
      }
      continue;
    }

    if (Array.isArray(item)) {
      const overhead = item.length === 0 ? 2 : item.length + 1;
      if (!addBytes(overhead)) return maximumBytes + 1;
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push(item[index]);
      }
      continue;
    }

    const record = item as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareText);
    const overhead = keys.length === 0 ? 2 : 2 * keys.length + 1;
    if (!addBytes(overhead)) return maximumBytes + 1;
    for (const key of keys) {
      if (!addBytes(Buffer.byteLength(JSON.stringify(key), "utf8"))) {
        return maximumBytes + 1;
      }
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      stack.push(record[keys[index]]);
    }
  }

  return bytes;
}

export function validateTemplateCopilotV3SourceSpan(
  span: TemplateCopilotV3SourceSpan,
  messages: Readonly<Record<string, string>>,
) {
  const message = messages[span.messageId];
  return (
    typeof message === "string" &&
    templateCopilotV3StringIsPostgresSafe(message) &&
    Array.from(message)
      .slice(span.startCodePoint, span.endCodePoint)
      .join("") === span.exactText
  );
}

/** Mandatory provider-output boundary. The pure Zod envelope can validate
 * self-consistency but cannot authenticate source text without transcripts. */
export function validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(
  envelope: TemplateCopilotV3ExtractionEnvelope,
  messages: Readonly<Record<string, string>>,
) {
  return envelope.sourceSpans.every((span) => {
    const message = messages[span.messageId];
    return (
      typeof message === "string" &&
      templateCopilotUnicodeCodePointCount(message) <=
        templateCopilotV3MaximumSourceCodePoints &&
      validateTemplateCopilotV3SourceSpan(span, messages)
    );
  });
}

function validateSourceSpanSet(
  spans: readonly TemplateCopilotV3SourceSpan[],
  path: (string | number)[],
  context: z.RefinementCtx,
) {
  if (new Set(spans.map((span) => span.spanId)).size !== spans.length) {
    context.addIssue({
      code: "custom",
      path,
      message: "Source spans must be deduplicated by canonical ID.",
    });
  }
  const ordered = [...spans].sort(
    (left, right) =>
      compareText(left.messageId, right.messageId) ||
      left.startCodePoint - right.startCodePoint ||
      left.endCodePoint - right.endCodePoint,
  );
  if (
    ordered.some((span, index) =>
      ordered
        .slice(index + 1)
        .some(
          (other) =>
            span.messageId === other.messageId &&
            spansCross(span, other),
        ),
    )
  ) {
    context.addIssue({
      code: "custom",
      path,
      message:
        "Source spans may be nested or contained, but crossing overlaps are not allowed.",
    });
  }
}

function validateFragmentSet(
  fragments: readonly TemplateCopilotV3Fragment[],
  path: (string | number)[],
  context: z.RefinementCtx,
) {
  if (
    new Set(fragments.map((fragment) => fragment.fragmentId)).size !==
    fragments.length
  ) {
    context.addIssue({
      code: "custom",
      path,
      message: "Fragments must be deduplicated by canonical ID.",
    });
  }
}

function validateReferenceUnion({
  availableIds,
  fragments,
  path,
  context,
}: {
  availableIds: readonly string[];
  fragments: readonly TemplateCopilotV3Fragment[];
  path: (string | number)[];
  context: z.RefinementCtx;
}) {
  const available = new Set(availableIds);
  const used = new Set(
    fragments.flatMap((fragment) =>
      fragment.bindings.flatMap((binding) => binding.spanIds),
    ),
  );
  if ([...used].some((id) => !available.has(id))) {
    context.addIssue({
      code: "custom",
      path,
      message: "Every binding must reference an available source span.",
    });
  }
  if ([...available].some((id) => !used.has(id))) {
    context.addIssue({
      code: "custom",
      path,
      message: "Every supplied source span ID must be used by a fragment.",
    });
  }
}

function validateAvailableSpanSemantics({
  spanById,
  fragments,
  context,
}: {
  spanById: ReadonlyMap<string, TemplateCopilotV3SourceSpan>;
  fragments: readonly TemplateCopilotV3Fragment[];
  context: z.RefinementCtx;
}) {
  fragments.forEach((fragment, fragmentIndex) => {
    fragment.bindings.forEach((binding, bindingIndex) => {
      binding.spanIds.forEach((spanId, spanIndex) => {
        const span = spanById.get(spanId);
        if (
          span !== undefined &&
          !templateCopilotV3DirectEvidenceDerivesLeaf({
            factId: fragment.factId,
            path: binding.path,
            rule: binding.rule,
            value: fragment.value,
            sourceText: span.exactText,
          })
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "fragments",
              fragmentIndex,
              "bindings",
              bindingIndex,
              "spanIds",
              spanIndex,
            ],
            message:
              "Every available source span must independently derive its bound leaf.",
          });
        }
      });
    });
  });
}

function spansCross(
  left: Pick<TemplateCopilotV3SourceSpan, "startCodePoint" | "endCodePoint">,
  right: Pick<TemplateCopilotV3SourceSpan, "startCodePoint" | "endCodePoint">,
) {
  return (
    (left.startCodePoint < right.startCodePoint &&
      right.startCodePoint < left.endCodePoint &&
      left.endCodePoint < right.endCodePoint) ||
    (right.startCodePoint < left.startCodePoint &&
      left.startCodePoint < right.endCodePoint &&
      right.endCodePoint < left.endCodePoint)
  );
}

function primitiveLeafPaths(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [path || "/"];
  if (Array.isArray(value)) {
    if (value.length === 0) return [path || "/"];
    return value.flatMap((item, index) =>
      primitiveLeafPaths(item, `${path}/${index}`),
    );
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) return [path || "/"];
  return keys
    .sort(compareText)
    .flatMap((key) =>
      primitiveLeafPaths(
        (value as Record<string, unknown>)[key],
        `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
      ),
    );
}

function valueAtPointer(value: unknown, path: string): unknown {
  if (path === "/") return value;
  return path
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, part) => {
      if (Array.isArray(current) && /^(?:0|[1-9][0-9]*)$/.test(part)) {
        return current[Number(part)];
      }
      if (current !== null && typeof current === "object") {
        return (current as Record<string, unknown>)[part];
      }
      return undefined;
    }, value);
}

function pathsOverlapByPrefix(left: string, right: string) {
  return (
    left === right ||
    pathIsAncestor(left, right) ||
    pathIsAncestor(right, left)
  );
}

function pathIsAncestor(parent: string, child: string) {
  return parent === "/" ? child !== "/" : child.startsWith(`${parent}/`);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function lengthPrefixedUtf8(value: string) {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

function canonicalBindings(bindings: TemplateCopilotV3Fragment["bindings"]) {
  return bindings
    .map((binding) => ({
      ...binding,
      spanIds: [...binding.spanIds].sort(compareText),
    }))
    .sort(compareCanonicalJson);
}

function compareCanonicalJson(left: unknown, right: unknown) {
  return compareText(stableJson(left), stableJson(right));
}

function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function fragmentJsonValueIsBounded(
  value: unknown,
  depth: number,
  state: { nodes: number },
): boolean {
  state.nodes += 1;
  if (depth > 16 || state.nodes > 2_000 || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") {
    return (
      templateCopilotV3StringIsPostgresSafe(value) &&
      templateCopilotUnicodeCodePointCount(value) <= 8_000 &&
      !templateCopilotV3StringHasOuterTrimWhitespace(value)
    );
  }
  if (typeof value === "number") {
    return templateCopilotV3CanonicalJsonNumberText(value) !== null;
  }
  if (Array.isArray(value)) {
    return (
      value.length <= 200 &&
      value.every((item) => fragmentJsonValueIsBounded(item, depth + 1, state))
    );
  }
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length <= 200 &&
    keys.every(
      (key) =>
        /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key) &&
        fragmentJsonValueIsBounded(record[key], depth + 1, state),
    )
  );
}
