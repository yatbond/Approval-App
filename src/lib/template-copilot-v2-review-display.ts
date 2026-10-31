import type {
  TemplateCopilotFactId,
  TemplateCopilotV2ExtractionEvidence,
} from "./template-copilot-facts.ts";
import type { TemplateCopilotLocale } from "./template-copilot-plan.ts";

type Localized = readonly [en: string, hant: string, hans: string];
function localized(locale: TemplateCopilotLocale, value: Localized) {
  return value[locale === "zh-Hant" ? 1 : locale === "zh-Hans" ? 2 : 0];
}

const factLabels: Readonly<Record<TemplateCopilotFactId, Localized>> = {
  "workflow.name": ["Workflow name", "流程名稱", "流程名称"],
  "workflow.purpose": ["Workflow purpose", "流程目的", "流程目的"],
  "workflow.scope": ["Workflow scope", "流程範圍", "流程范围"],
  "request.initiator_policy": ["Who can start", "誰可發起", "谁可发起"],
  "request.fields": ["Request fields", "申請欄位", "申请字段"],
  "attachments.requirements": ["Attachments", "附件要求", "附件要求"],
  "workflow.stages": ["Workflow stages", "流程階段", "流程阶段"],
  "workflow.conditions": ["Routing conditions", "路由條件", "路由条件"],
  "workflow.rejection_policy": ["Rejection policy", "拒絕處理方式", "拒绝处理方式"],
  "collaboration.policy": ["Collaboration policy", "協作政策", "协作政策"],
  "timing.rules": ["Timing rules", "時限規則", "时限规则"],
  "visibility.policy": ["Visibility policy", "可見性政策", "可见性政策"],
  "notifications.rules": ["Notifications", "通知規則", "通知规则"],
  "governance.owner": ["Governance owner", "管治負責人", "治理负责人"],
  "governance.policies": ["Governance policies", "管治政策", "治理政策"],
  "governance.retention": ["Record retention", "記錄保留", "记录保留"],
};

const words = {
  required: ["required", "必須", "必须"], optional: ["optional", "可選", "可选"],
  formats: ["formats", "格式", "格式"], stage: ["stage", "階段", "阶段"],
  assigned: ["assigned by", "分派方式", "分配方式"], route: ["route", "路徑", "路径"], otherwise: ["otherwise", "否則", "否则"],
  noItems: ["None", "沒有", "没有"], rules: ["rules", "規則", "规则"], escalation: ["escalation", "升級處理", "升级处理"],
  dueHours: ["default due hours", "預設時限（小時）", "默认时限（小时）"], recipients: ["recipients", "收件人", "收件人"],
  rationale: ["rationale", "理由", "理由"],
  notApplicable: ["Not applicable", "不適用", "不适用"],
} as const satisfies Readonly<Record<string, Localized>>;

function word(locale: TemplateCopilotLocale, key: keyof typeof words) { return localized(locale, words[key]); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function list(locale: TemplateCopilotLocale, values: unknown[]) { return values.length ? values.map((value) => String(value)).join(locale === "en" ? ", " : "、") : word(locale, "noItems"); }
function enumLabel(locale: TemplateCopilotLocale, value: unknown) {
  const labels: Readonly<Record<string, Localized>> = {
    approval: ["Approval", "審批", "审批"], review: ["Review", "審核", "审核"], for_information: ["For information", "知會", "知会"], submission: ["Submission", "提交", "提交"],
    any_employee: ["any employee", "任何員工", "任何员工"], directory_role: ["directory role", "目錄角色", "目录角色"], requester_selected: ["chosen by requester", "由申請人選擇", "由申请人选择"],
    fixed_email: ["fixed email", "固定電郵", "固定电子邮件"], directory_position: ["directory position", "目錄職位", "目录职位"], request_field: ["request field", "申請欄位", "申请字段"], requester: ["requester", "申請人", "申请人"], unassigned_at_template: ["unassigned at template", "範本暫不指派", "模板暂不分配"],
    text: ["Text", "文字", "文本"], long_text: ["Long text", "長文字", "长文本"], number: ["Number", "數字", "数字"], date: ["Date", "日期", "日期"], currency: ["Currency", "貨幣", "货币"], email: ["Email", "電郵", "电子邮件"], select: ["Select", "下拉選單", "下拉菜单"], radio: ["Single choice", "單選", "单选"], checkbox: ["Checkbox", "核取方塊", "复选框"], table: ["Table", "表格", "表格"],
    pdf: ["PDF", "PDF", "PDF"], image: ["Image", "圖片", "图片"], excel_csv: ["Excel/CSV", "Excel/CSV", "Excel/CSV"],
    return_for_correction: ["Return for correction", "退回更正", "退回更正"], close: ["Close", "關閉", "关闭"], route_to_stage: ["Route to stage", "轉送階段", "转送阶段"],
    in_app: ["In-app", "應用程式內", "应用内"],
  };
  return typeof value === "string" && labels[value] ? localized(locale, labels[value]) : String(value ?? "");
}

function conditionOperatorLabel(locale: TemplateCopilotLocale, value: unknown) {
  const labels: Readonly<Record<string, Localized>> = {
    "=": ["equals", "等於", "等于"],
    "!=": ["does not equal", "不等於", "不等于"],
    ">": ["is greater than", "大於", "大于"],
    ">=": ["is greater than or equal to", "大於或等於", "大于或等于"],
    "<": ["is less than", "小於", "小于"],
    "<=": ["is less than or equal to", "小於或等於", "小于或等于"],
    contains: ["contains", "包含", "包含"],
  };
  return typeof value === "string" && labels[value]
    ? localized(locale, labels[value])
    : String(value ?? "");
}

function policy(locale: TemplateCopilotLocale, value: unknown) {
  const item = record(value); const rules = Array.isArray(item.rules) ? item.rules : [];
  return [String(item.description ?? ""), ...(rules.length ? [`${word(locale, "rules")}: ${list(locale, rules)}`] : [])].filter(Boolean).join("; ");
}

export function templateCopilotV2ReviewFactLabel(factId: TemplateCopilotFactId, locale: TemplateCopilotLocale) {
  return localized(locale, factLabels[factId]);
}

export function templateCopilotV2ReviewPanelCopy(locale: TemplateCopilotLocale) {
  return {
    candidate: localized(locale, ["Suggested fact", "建議資料", "建议信息"]),
    current: localized(locale, ["Current value", "目前資料", "当前信息"]),
    proposed: localized(locale, ["Proposed value", "建議資料", "建议信息"]),
    value: localized(locale, ["Complete value", "完整值", "完整值"]),
    candidateHeading: localized(locale, ["Suggested facts awaiting your confirmation", "待你確認的建議資料", "待你确认的建议信息"]),
    conflictHeading: localized(locale, ["Conflicting suggestions need your review", "相互矛盾的建議資料需要你審閱", "相互矛盾的建议信息需要你审核"]),
    candidateSectionAria: localized(locale, ["Extracted facts awaiting confirmation", "等待確認的擷取資料", "等待确认的提取信息"]),
    conflictSectionAria: localized(locale, ["Extracted fact conflicts requiring review", "需要審閱的擷取資料差異", "需要审核的提取信息差异"]),
    confirm: localized(locale, ["Confirm", "確認", "确认"]),
    keepExisting: localized(locale, ["Keep existing", "保留目前資料", "保留当前信息"]),
    useProposed: localized(locale, ["Use proposed", "採用建議", "采用建议"]),
  } as const;
}

export function selectTemplateCopilotV2OpenExtractionReview(
  evidence: TemplateCopilotV2ExtractionEvidence,
) {
  return Object.freeze({
    candidates: Object.freeze(evidence.candidates.filter((candidate) => candidate.state === "open")),
    conflicts: Object.freeze(evidence.conflicts.filter((conflict) => conflict.state === "open")),
  });
}

/** Plain-language display of the complete canonical value. It is presentation
 * only: the server-owned typed value and its evidence remain immutable. */
export function formatTemplateCopilotV2ReviewValue(factId: TemplateCopilotFactId, value: unknown, locale: TemplateCopilotLocale): string {
  if (value === "not_applicable") return word(locale, "notApplicable");
  if (["workflow.name", "workflow.purpose", "governance.owner"].includes(factId)) return String(value ?? "");
  if (["workflow.scope", "collaboration.policy", "visibility.policy"].includes(factId)) return policy(locale, value);
  if (factId === "request.initiator_policy") { const item = record(value); return `${enumLabel(locale, item.mode)}${item.description ? ` — ${String(item.description)}` : ""}`; }
  if (factId === "request.fields") return list(locale, (Array.isArray(value) ? value : []).map((entry) => { const item = record(entry); const options = Array.isArray(item.options) && item.options.length ? `: ${list(locale, item.options)}` : ""; return `${String(item.label ?? "")} (${enumLabel(locale, item.type)}, ${item.required ? word(locale, "required") : word(locale, "optional")})${options}`; }));
  if (factId === "attachments.requirements") return list(locale, (Array.isArray(value) ? value : []).map((entry) => { const item = record(entry); const formats = Array.isArray(item.formats) ? item.formats.map((format) => enumLabel(locale, format)) : []; return [String(item.label ?? ""), item.required ? word(locale, "required") : word(locale, "optional"), formats.length ? `${word(locale, "formats")}: ${list(locale, formats)}` : "", item.stage ? `${word(locale, "stage")}: ${String(item.stage)}` : ""].filter(Boolean).join(" — "); }));
  if (factId === "workflow.stages") return list(locale, (Array.isArray(value) ? value : []).map((entry) => { const item = record(entry); const participant = record(item.participant); return `${Number(item.sequence) || "?"}. ${String(item.label ?? "")} — ${enumLabel(locale, item.kind)}; ${word(locale, "assigned")} ${enumLabel(locale, participant.mode)}${participant.value ? `: ${String(participant.value)}` : ""}`; }));
  if (factId === "workflow.conditions") return list(locale, (Array.isArray(value) ? value : []).map((entry) => { const item = record(entry); return `${String(item.field ?? "")} ${conditionOperatorLabel(locale, item.operator)} ${String(item.value ?? "")}; ${word(locale, "route")}: ${String(item.matchingRoute ?? "")}; ${word(locale, "otherwise")}: ${String(item.otherwiseRoute ?? "")}`; }));
  if (factId === "workflow.rejection_policy") { const item = record(value); return `${enumLabel(locale, item.action)}${item.route ? `: ${String(item.route)}` : ""}`; }
  if (factId === "timing.rules") { const item = record(value); return [item.defaultDueHours ? `${word(locale, "dueHours")}: ${String(item.defaultDueHours)}` : "", item.escalation ? `${word(locale, "escalation")}: ${policy(locale, item.escalation)}` : ""].filter(Boolean).join("; ") || word(locale, "noItems"); }
  if (factId === "notifications.rules") return list(locale, (Array.isArray(value) ? value : []).map((entry) => { const item = record(entry); return `${String(item.event ?? "")} — ${word(locale, "recipients")}: ${list(locale, Array.isArray(item.recipients) ? item.recipients : [])}; ${enumLabel(locale, item.channel)}`; }));
  if (factId === "governance.policies") return list(locale, Array.isArray(value) ? value : []);
  if (factId === "governance.retention") { const item = record(value); return `${String(item.period ?? "")}${item.rationale ? `; ${word(locale, "rationale")}: ${String(item.rationale)}` : ""}`; }
  return String(value ?? "");
}
