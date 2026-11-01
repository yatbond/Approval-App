import { templateCopilotFactDefinitions, templateCopilotFactIds, type TemplateCopilotFactEntry, type TemplateCopilotFactId, type TemplateCopilotV2Ledger } from "./template-copilot-facts.ts";
import type { TemplateCopilotReadiness } from "./template-copilot-readiness.ts";
import {
  buildTemplateCopilotV2Playback,
  type TemplateCopilotV2Playback,
} from "./template-copilot-v2-playback.ts";
import {
  compileTemplateCopilotV2StructuredFact,
  previewTemplateCopilotV2StructuredFact,
  templateCopilotV2AttachmentRequirementsSchema,
  templateCopilotV2ConditionRulesSchema,
  templateCopilotV2NotificationRulesSchema,
} from "./template-copilot-v2-structured-facts.ts";

/* Ledger values are narrowed by their fact-specific schema before this
 * presentation-only formatter receives them. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type TemplateCopilotV2ProjectionLocale = "en" | "zh-Hant" | "zh-Hans";
type Locale = TemplateCopilotV2ProjectionLocale;
export type TemplateCopilotV2AuthoritativeProjection = Readonly<{
  locale: Locale;
  readiness: TemplateCopilotReadiness;
  playback: TemplateCopilotV2Playback;
  facts: readonly TemplateCopilotV2ProjectedFact[];
}>;
export type TemplateCopilotV2ProjectedEvidence = Readonly<{
  kind: "current" | "stale" | "conflict";
  status: TemplateCopilotFactEntry["status"];
  stateLabel: string;
  canonicalValue?: unknown;
  lines: readonly string[];
  originalWording?: string;
  notApplicableReason?: string;
  confirmation?: string;
  provenance: readonly string[];
  invalidatedBy?: string;
  conflictAlternatives?: readonly TemplateCopilotV2ProjectedEvidence[];
}>;
export type TemplateCopilotV2ProjectedFact = Readonly<TemplateCopilotV2ProjectedEvidence & { factId: TemplateCopilotFactId; label: string; stale: readonly string[]; conflicts: readonly string[]; history: readonly TemplateCopilotV2ProjectedEvidence[]; conflictAlternatives: readonly TemplateCopilotV2ProjectedEvidence[]; dependsOn: readonly TemplateCopilotFactId[]; downstreamImpact: readonly TemplateCopilotFactId[] }>;

const names: Record<TemplateCopilotFactId, readonly [string, string, string]> = {
  "workflow.name": ["Workflow name", "流程名稱", "流程名称"], "workflow.purpose": ["Purpose", "目的", "目的"], "workflow.scope": ["Included and excluded requests", "適用與不適用申請", "适用与不适用申请"], "request.initiator_policy": ["Who can start", "誰可發起", "谁可发起"], "request.fields": ["Information to collect", "要收集的資料", "要收集的信息"], "attachments.requirements": ["Required documents", "所需文件", "所需文件"], "workflow.stages": ["Ordered or simultaneous steps and people", "順序／同時步驟及處理人", "顺序／同时步骤及处理人"], "workflow.conditions": ["If–then routing", "如果／則路由", "如果／则路由"], "workflow.rejection_policy": ["Rejection and correction", "拒絕與更正", "拒绝与更正"], "collaboration.policy": ["Correction collaboration", "更正協作", "更正协作"], "timing.rules": ["Timing and late actions", "時限與逾期處理", "时限与逾期处理"], "visibility.policy": ["Who can view", "誰可查看", "谁可查看"], "notifications.rules": ["Notifications", "通知", "通知"], "governance.owner": ["Owning department", "負責部門", "负责部门"], "governance.policies": ["Policies and review", "政策與審閱", "政策与审核"], "governance.retention": ["Record retention", "記錄保存", "记录保存"],
};
const stateNames: Record<TemplateCopilotFactEntry["status"], readonly [string, string, string]> = { committed: ["Saved", "已儲存", "已保存"], candidate: ["Candidate — needs human confirmation", "建議 — 需人員確認", "建议 — 需人工确认"], conflicting: ["Conflicting values — choose one", "資料衝突 — 請選擇", "信息冲突 — 请选择"], unresolved: ["Still needed", "仍需回答", "仍需回答"], unknown: ["Unknown — not an assumption", "未知 — 並非假設", "未知 — 并非假设"], not_applicable: ["Not applicable", "不適用", "不适用"] };
const pick = (value: readonly [string, string, string], locale: Locale) => value[locale === "en" ? 0 : locale === "zh-Hant" ? 1 : 2];
/** Presentation labels are deliberately owned here, next to the authoritative
 * projection.  Browser controls consume these labels instead of fact IDs. */
export const templateCopilotV2ProjectionFactLabel = (factId: TemplateCopilotFactId, locale: Locale) => pick(names[factId], locale);
export const templateCopilotV2ProjectionStateLabel = (state: TemplateCopilotFactEntry["status"], locale: Locale) => pick(stateNames[state], locale);
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const copy = (locale: Locale) => locale === "zh-Hant" ? { rule: "規則", who: "發起人", policy: "政策", required: "必填", optional: "選填", options: "選項", formats: "格式", any: "任何格式", at: "階段", person: "處理人", if: "如果", then: "則前往", otherwise: "否則前往", rejection: "拒絕時", due: "預設時限", notSet: "未設定", hours: "小時", late: "逾期處理", via: "透過", keep: "保存期間", reason: "原因", reopened: "因以下變更而重新開啟", prior: "先前來源", alternative: "替代值", evidence: "證據", original: "原始說法", confirmed: "人員確認", invalidated: "失效原因" } : locale === "zh-Hans" ? { rule: "规则", who: "发起人", policy: "政策", required: "必填", optional: "选填", options: "选项", formats: "格式", any: "任何格式", at: "阶段", person: "处理人", if: "如果", then: "则前往", otherwise: "否则前往", rejection: "拒绝时", due: "默认时限", notSet: "未设置", hours: "小时", late: "逾期处理", via: "通过", keep: "保存期限", reason: "原因", reopened: "因以下更改而重新打开", prior: "先前来源", alternative: "备选值", evidence: "证据", original: "原始说法", confirmed: "人工确认", invalidated: "失效原因" } : { rule: "Rule", who: "Who", policy: "Policy", required: "required", optional: "optional", options: "options", formats: "formats", any: "any format", at: "at", person: "Person", if: "If", then: "then go to", otherwise: "otherwise go to", rejection: "On rejection", due: "Default due", notSet: "not set", hours: "hours", late: "Late action", via: "via", keep: "Keep for", reason: "Reason", reopened: "Reopened after", prior: "Prior source", alternative: "Alternative", evidence: "Evidence", original: "Original wording", confirmed: "Human confirmation", invalidated: "Invalidated by" };
const enumText = (value: unknown, locale: Locale) => {
  const names: Record<string, readonly [string, string, string]> = { any_employee: ["Any employee", "任何員工", "任何员工"], directory_role: ["Directory role", "目錄角色", "目录角色"], requester_selected: ["Requester-selected", "發起人選定", "发起人选定"], fixed_email: ["Fixed email", "固定電郵", "固定邮箱"], directory_position: ["Directory position", "目錄職位", "目录职位"], request_field: ["Request field", "申請欄位", "申请字段"], requester: ["Requester", "發起人", "发起人"], unassigned_at_template: ["Resolve later", "稍後指定", "稍后指定"], approval: ["Approval", "審批", "审批"], review: ["Review", "覆核", "复核"], for_information: ["For information", "供知悉", "供知悉"], submission: ["Submission", "提交", "提交"], text: ["Text", "文字", "文本"], long_text: ["Long text", "長文字", "长文本"], number: ["Number", "數字", "数字"], date: ["Date", "日期", "日期"], currency: ["Currency", "貨幣", "货币"], email: ["Email", "電郵", "邮箱"], select: ["Select list", "下拉選單", "下拉列表"], radio: ["Single choice", "單選", "单选"], checkbox: ["Checkbox", "核取方塊", "复选框"], table: ["Table", "表格", "表格"], return_for_correction: ["Return for correction", "退回更正", "退回更正"], close: ["Close", "結束", "结束"], route_to_stage: ["Route to a stage", "前往階段", "前往阶段"], in_app: ["In-app", "應用程式內", "应用内"], pdf: ["PDF", "PDF", "PDF"], image: ["Image", "圖片", "图片"], excel_csv: ["Spreadsheet / CSV", "試算表／CSV", "电子表格／CSV"], contains: ["contains", "包含", "包含"] };
  return typeof value === "string" && names[value] ? pick(names[value], locale) : String(value ?? "");
};
const visibilityRuleText = (rule: string, locale: Locale) => {
  const reviewed: Record<string, readonly [string, string, string]> = {
    "status:participants": [
      "Status updates: people taking part",
      "進度狀態：參與流程的人員",
      "进度状态：参与流程的人员",
    ],
    "status:department": [
      "Status updates: people in the department",
      "進度狀態：所屬部門人員",
      "进度状态：所属部门人员",
    ],
    "status:process_owners": [
      "Status updates: workflow owners only",
      "進度狀態：只限流程負責人",
      "进度状态：仅限流程负责人",
    ],
    "fields:all": [
      "Request information: all fields",
      "申請資料：所有欄位",
      "申请信息：所有字段",
    ],
    "fields:hidden": [
      "Request information: hidden unless a step explicitly allows it",
      "申請資料：預設隱藏，除非步驟明確允許查看",
      "申请信息：默认隐藏，除非步骤明确允许查看",
    ],
    "documents:all": [
      "Documents: all documents",
      "文件：所有文件",
      "文件：所有文件",
    ],
    "documents:required_for_node": [
      "Documents: only those needed for each step",
      "文件：只限每個步驟所需的文件",
      "文件：仅限每个步骤所需的文件",
    ],
    "documents:none": [
      "Documents: hidden",
      "文件：隱藏",
      "文件：隐藏",
    ],
  };
  if (reviewed[rule]) return pick(reviewed[rule], locale);
  const prefix = pick(
    [
      "Additional visibility restriction",
      "其他查看限制",
      "其他查看限制",
    ],
    locale,
  );
  return `${prefix}: ${rule}`;
};
const person = (value: any, locale: Locale) => `${enumText(value?.mode, locale)}${value?.value ? `: ${value.value}` : ""}`;
function lines(id: TemplateCopilotFactId, value: any, locale: Locale, ledger?: TemplateCopilotV2Ledger): string[] {
  const t = copy(locale);
  if (value === undefined) return [];
  if (id === "attachments.requirements" && templateCopilotV2AttachmentRequirementsSchema.safeParse(value).success) return [...previewTemplateCopilotV2StructuredFact(id, ledger ? compileTemplateCopilotV2StructuredFact(ledger, id) : value, locale)];
  if (id === "workflow.conditions" && templateCopilotV2ConditionRulesSchema.safeParse(value).success) return [...previewTemplateCopilotV2StructuredFact(id, ledger ? compileTemplateCopilotV2StructuredFact(ledger, id) : value, locale)];
  if (id === "notifications.rules" && templateCopilotV2NotificationRulesSchema.safeParse(value).success) return [...previewTemplateCopilotV2StructuredFact(id, ledger ? compileTemplateCopilotV2StructuredFact(ledger, id) : value, locale)];
  if (["workflow.name", "workflow.purpose", "governance.owner"].includes(id)) return [text(value)];
  if (id === "workflow.scope" || id === "collaboration.policy") return [value.description, ...(value.rules || []).map((rule: string) => `${t.rule}: ${rule}`)].filter(Boolean);
  if (id === "visibility.policy") return [value.description, ...(value.rules || []).map((rule: string) => visibilityRuleText(rule, locale))].filter(Boolean);
  if (id === "request.initiator_policy") return [`${t.who}: ${enumText(value.mode, locale)}`, `${t.policy}: ${value.description}`];
  if (id === "request.fields") return value.map((item: any) => `${item.label} — ${enumText(item.type, locale)}; ${item.required ? t.required : t.optional}${item.options?.length ? `; ${t.options}: ${item.options.join(", ")}` : ""}`);
  if (id === "attachments.requirements") return value.map((item: any) => `${item.label} — ${item.required ? t.required : t.optional}; ${t.formats}: ${(item.formats || []).map((format: string) => enumText(format, locale)).join(", ") || t.any}${item.stage ? `; ${t.at}: ${item.stage}` : ""}`);
  if (id === "workflow.stages") return value.map((item: any) => `${item.sequence}: ${item.label} — ${enumText(item.kind, locale)}; ${t.person}: ${person(item.participant, locale)}`);
  if (id === "workflow.conditions") return value.map((item: any) => `${t.if} ${item.field} ${enumText(item.operator, locale)} ${item.value}，${t.then} ${item.matchingRoute}；${t.otherwise} ${item.otherwiseRoute}。`);
  if (id === "workflow.rejection_policy") return [`${t.rejection}: ${enumText(value.action, locale)}${value.route ? ` → ${value.route}` : ""}`];
  if (id === "timing.rules") return [`${t.due}: ${value.defaultDueHours === undefined ? t.notSet : `${value.defaultDueHours} ${t.hours}`}`, ...(value.escalation ? [value.escalation.description, ...(value.escalation.rules || []).map((rule: string) => `${t.late}: ${rule}`)] : [])].filter(Boolean);
  if (id === "notifications.rules") return value.map((item: any) => `${item.event}: ${item.recipients.join(", ")} ${t.via} ${enumText(item.channel, locale)}`);
  if (id === "governance.policies") return value.map((item: string) => `${t.policy}: ${item}`);
  if (id === "governance.retention") return [`${t.keep}: ${value.period}`, ...(value.rationale ? [`${t.reason}: ${value.rationale}`] : [])];
  return [];
}
function provenance(entry: TemplateCopilotFactEntry, locale: Locale) { const label = (kind: string) => locale === "zh-Hant" ? ({ message: "訊息", document: "文件", legacy_section: "舊版段落", human_editor: "人員編輯" }[kind] || kind) : locale === "zh-Hans" ? ({ message: "消息", document: "文件", legacy_section: "旧版段落", human_editor: "人工编辑" }[kind] || kind) : ({ message: "Message", document: "Document", legacy_section: "Legacy section", human_editor: "Human edit" }[kind] || kind); const messages = locale === "en" ? "messages" : locale === "zh-Hant" ? "訊息" : "消息"; return entry.provenance.map((item) => `${label(item.kind)}: ${item.sourceId}${item.sourceMessageIds.length ? ` (${messages}: ${item.sourceMessageIds.join(", ")})` : ""}${item.excerpt ? ` — ${item.excerpt}` : ""}`); }
function downstream(id: TemplateCopilotFactId) { const found = new Set<TemplateCopilotFactId>(); let changed = true; while (changed) { changed = false; for (const candidate of templateCopilotFactIds) if (!found.has(candidate) && templateCopilotFactDefinitions[candidate].dependsOn.some((parent) => parent === id || found.has(parent))) { found.add(candidate); changed = true; } } return templateCopilotFactIds.filter((candidate) => found.has(candidate)); }
function projectEvidence({ factId, entry, locale, kind, invalidatedBy, ledger }: { factId: TemplateCopilotFactId; entry: Pick<TemplateCopilotFactEntry, "status" | "canonicalValue" | "originalWording" | "notApplicableReason" | "confirmation" | "provenance">; locale: Locale; kind: TemplateCopilotV2ProjectedEvidence["kind"]; invalidatedBy?: TemplateCopilotFactId; ledger?: TemplateCopilotV2Ledger }): TemplateCopilotV2ProjectedEvidence {
  const t = copy(locale);
  const confirmation = entry.confirmation ? `${t.confirmed}: ${entry.confirmation.actorId} · ${entry.confirmation.confirmedAt}` : undefined;
  return Object.freeze({
    kind,
    status: entry.status,
    stateLabel: templateCopilotV2ProjectionStateLabel(entry.status, locale),
    ...(entry.canonicalValue === undefined ? {} : { canonicalValue: entry.canonicalValue }),
    lines: Object.freeze(entry.status === "not_applicable"
      ? [`${t.reason}: ${entry.notApplicableReason || ""}`]
      : lines(
        factId,
        entry.canonicalValue,
        locale,
        entry.status === "committed" ? ledger : undefined,
      )),
    ...(entry.originalWording ? { originalWording: entry.originalWording } : {}),
    ...(entry.notApplicableReason ? { notApplicableReason: entry.notApplicableReason } : {}),
    ...(confirmation ? { confirmation } : {}),
    provenance: Object.freeze(provenance(entry as TemplateCopilotFactEntry, locale)),
    ...(invalidatedBy ? { invalidatedBy: `${t.invalidated}: ${templateCopilotV2ProjectionFactLabel(invalidatedBy, locale)}` } : {}),
  });
}
export function projectTemplateCopilotV2AuthoritativeLedger(
  ledger: TemplateCopilotV2Ledger,
  options: {
    inapplicableFactIds?: readonly TemplateCopilotFactId[];
    sourceRevision?: number;
    publishedSourceRevision?: number;
  } = {},
): TemplateCopilotV2AuthoritativeProjection {
  const locale = ledger.locale as Locale;
  const t = copy(locale);
  const facts = Object.freeze(templateCopilotFactIds.map((factId) => {
    const entry = ledger.facts[factId];
    const current = projectEvidence({ factId, entry, locale, kind: "current", ledger });
    const history = Object.freeze(entry.staleHistory.map((item) => {
      const historical = projectEvidence({ factId, entry: item, locale, kind: "stale", invalidatedBy: item.invalidatedBy });
      const historicalConflicts = Object.freeze((item.conflictEvidence || []).map((conflict) => projectEvidence({ factId, entry: { status: "conflicting", canonicalValue: conflict.canonicalValue, provenance: conflict.provenance }, locale, kind: "conflict" })));
      return historicalConflicts.length ? Object.freeze({ ...historical, conflictAlternatives: historicalConflicts }) : historical;
    }));
    const conflictAlternatives = Object.freeze((entry.conflictEvidence || []).map((conflict) => projectEvidence({ factId, entry: { status: "conflicting", canonicalValue: conflict.canonicalValue, provenance: conflict.provenance }, locale, kind: "conflict" })));
    return Object.freeze({
      factId,
      label: templateCopilotV2ProjectionFactLabel(factId, locale),
      ...current,
      history,
      conflictAlternatives,
      stale: Object.freeze(history.flatMap((item) => [`${t.reopened} ${item.invalidatedBy}: ${item.lines.join("; ") || item.stateLabel}`, ...(item.originalWording ? [`${t.original}: ${item.originalWording}`] : []), ...(item.confirmation ? [item.confirmation] : []), ...item.provenance.map((source) => `${t.prior}: ${source}`)])),
      conflicts: Object.freeze(conflictAlternatives.flatMap((item, index) => [`${t.alternative} ${index + 1}: ${item.lines.join("; ")}`, ...item.provenance.map((source) => `${t.evidence}: ${source}`)])),
      dependsOn: Object.freeze([...templateCopilotFactDefinitions[factId].dependsOn]),
      downstreamImpact: Object.freeze(downstream(factId)),
    });
  }));
  const playback = buildTemplateCopilotV2Playback({
    ledger,
    inapplicableFactIds: options.inapplicableFactIds,
    sourceRevision: options.sourceRevision,
    publishedSourceRevision: options.publishedSourceRevision,
    factPresentation: Object.fromEntries(
      facts.map((fact) => [
        fact.factId,
        { label: fact.label, lines: fact.lines },
      ]),
    ),
  });
  return Object.freeze({
    locale,
    readiness: playback.readiness,
    playback,
    facts,
  });
}
