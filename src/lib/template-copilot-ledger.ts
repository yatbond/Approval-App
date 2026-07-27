import { z } from "zod";
import {
  templateCopilotLocaleSchema,
  type TemplateCopilotLocale,
} from "./template-copilot-plan.ts";

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
    locale: templateCopilotLocaleSchema.default("en"),
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

export const copilotCorrectionExtractionSchema =
  copilotTurnExtractionSchema.extend({
    targetSection: z.enum(templateCopilotSectionIds.slice(0, -1)),
  });

export const templateCopilotStartSchema = z
  .object({
    businessUnitId: z.string().uuid(),
    departmentName: z.string().trim().min(1).max(200),
    locale: templateCopilotLocaleSchema.optional(),
    questionLibraryVersion: z.enum(["v2.0", "v2.1"]).optional(),
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
  locale = "en",
}: {
  businessUnitId: string;
  businessName: string;
  departmentId: string;
  departmentName: string;
  locale?: TemplateCopilotLocale;
}): TemplateCopilotLedger {
  return templateCopilotLedgerSchema.parse({
    schemaVersion: 1,
    locale,
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

const localizedQuestions: Record<
  TemplateCopilotLocale,
  Record<TemplateCopilotSectionId, string>
> = {
  en: templateCopilotQuestions,
  "zh-Hant": {
    identity_scope:
      "這個流程範本應稱為甚麼、需要達成甚麼業務結果，以及哪些事項屬於或不屬於範圍？",
    initiators_fields:
      "誰可以發起申請？申請人必須填寫哪些資料？請包括欄位類型、必填欄位及所有選項。",
    attachments:
      "哪些文件或表格是必須或可選的？請逐項說明格式、數量、檔案大小限制及提交時間。",
    stages_participants:
      "請依次說明所有提交、審批、審查及知會階段。每位參與者應如何指定：固定電郵、目錄職位、申請欄位，還是稍後指派？",
    conditions_exceptions:
      "流程需要處理哪些條件、門檻、並行分支、拒絕路徑、補正循環、後備路徑或例外情況？",
    collaboration_corrections:
      "是否容許多人共同完成提交、邀請臨時協作者？共同提交或補正應由誰確認？",
    timing_escalation:
      "各階段的期限及升級規則是甚麼？如需使用工作日曆計時，請明確說明。",
    visibility_notifications:
      "誰可以查看狀態及歷史？哪些事件需要通知？通知只發給直接相關人士，還是所有參與者？",
    governance:
      "誰擁有及審核此範本？適用哪些政策、保留期及合規控制？是否真的需要受規管簽署？",
    confirmation:
      "請檢查需求摘要。回覆「確認，請建立草稿」以建立可編輯草稿，或明確指出需要更正的內容。",
  },
  "zh-Hans": {
    identity_scope:
      "这个流程模板应叫什么、需要实现什么业务结果，以及哪些事项属于或不属于范围？",
    initiators_fields:
      "谁可以发起申请？申请人必须填写哪些信息？请包括字段类型、必填字段和全部选项。",
    attachments:
      "哪些文件或表单是必需或可选的？请逐项说明格式、数量、文件大小限制和提交时间。",
    stages_participants:
      "请按顺序说明所有提交、审批、审核和知会阶段。每位参与者应如何指定：固定邮箱、目录职位、申请字段，还是稍后分配？",
    conditions_exceptions:
      "流程需要处理哪些条件、门槛、并行分支、拒绝路径、补正循环、后备路径或例外情况？",
    collaboration_corrections:
      "是否允许多人共同完成提交、邀请临时协作者？共同提交或补正应由谁确认？",
    timing_escalation:
      "各阶段的期限和升级规则是什么？如需使用工作日历计时，请明确说明。",
    visibility_notifications:
      "谁可以查看状态和历史？哪些事件需要通知？通知只发给直接相关人员，还是所有参与者？",
    governance:
      "谁负责和审核此模板？适用哪些政策、保留期和合规控制？是否确实需要受监管签名？",
    confirmation:
      "请检查需求摘要。回复“确认，请创建草稿”以创建可编辑草稿，或明确指出需要更正的内容。",
  },
};

const localizedSectionLabels: Record<
  TemplateCopilotLocale,
  Record<Exclude<TemplateCopilotSectionId, "confirmation">, string>
> = {
  en: {
    identity_scope: "Identity and scope",
    initiators_fields: "Initiators and fields",
    attachments: "Attachments and forms",
    stages_participants: "Stages and participants",
    conditions_exceptions: "Conditions and exceptions",
    collaboration_corrections: "Collaboration and corrections",
    timing_escalation: "Timing and escalation",
    visibility_notifications: "Visibility and notifications",
    governance: "Governance",
  },
  "zh-Hant": {
    identity_scope: "名稱及範圍",
    initiators_fields: "發起人及欄位",
    attachments: "附件及表格",
    stages_participants: "階段及參與者",
    conditions_exceptions: "條件及例外",
    collaboration_corrections: "協作及補正",
    timing_escalation: "時限及升級",
    visibility_notifications: "可見性及通知",
    governance: "管治",
  },
  "zh-Hans": {
    identity_scope: "名称及范围",
    initiators_fields: "发起人及字段",
    attachments: "附件及表单",
    stages_participants: "阶段及参与者",
    conditions_exceptions: "条件及例外",
    collaboration_corrections: "协作及补正",
    timing_escalation: "时限及升级",
    visibility_notifications: "可见性及通知",
    governance: "治理",
  },
};

export function getTemplateCopilotQuestion(
  sectionId: TemplateCopilotSectionId,
  locale: TemplateCopilotLocale,
) {
  return localizedQuestions[locale][sectionId];
}

export function getTemplateCopilotSectionLabel(
  sectionId: TemplateCopilotSectionId,
  locale: TemplateCopilotLocale,
) {
  if (sectionId === "confirmation") {
    return locale === "zh-Hant"
      ? "確認"
      : locale === "zh-Hans"
        ? "确认"
        : "Confirmation";
  }
  return localizedSectionLabels[locale][sectionId];
}

export function setTemplateCopilotLocale(
  ledger: TemplateCopilotLedger,
  locale: TemplateCopilotLocale,
) {
  return templateCopilotLedgerSchema.parse({ ...ledger, locale });
}

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
      const label = getTemplateCopilotSectionLabel(id, ledger.locale);
      const state = ledger.sections[id];
      return `- ${label}: ${state.summary || `(${state.status})`}`;
    })
    .join("\n");
}

export function isExplicitConfirmation(message: string) {
  const normalized = message
    .trim()
    .replace(/[，。！？、；：,.!?:;\s]+/g, "")
    .toLowerCase();
  return (
    /^(confirm|confirmed|yescreate|createthedraft|createdraft|proceed)$/.test(
      normalized,
    ) ||
    /^(確認|确认)(請|请)?(建立|創建|创建|產生|生成)?(可編輯|可编辑)?(草稿)?$/.test(
      normalized,
    ) ||
    /^(請建立|请建立|請創建|请创建|請生成|请生成)(可編輯|可编辑)?草稿$/.test(
      normalized,
    )
  );
}

export function isExplicitTemplateCopilotUnknown(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    /\b(i (?:do not|don't) know|i(?:'m| am) not sure|unknown|tbd|to be decided|need(?:s)? (?:the )?(?:process )?owner to decide)\b/.test(
      normalized,
    ) ||
    /(不知道|不清楚|不確定|不确定|未決定|未决定|待決定|待决定|由(?:流程|程序|業務|业务)?(?:負責人|负责人|擁有人|所有者)決定)/.test(
      normalized,
    )
  );
}
