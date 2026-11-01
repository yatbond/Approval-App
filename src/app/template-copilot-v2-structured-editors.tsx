"use client";

import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import type { TemplateCopilotV2Ledger } from "@/lib/template-copilot-facts";
import type {
  TemplateCopilotV2StructuredFactId,
  TemplateCopilotV2StructuredIssue,
} from "@/lib/template-copilot-v2-structured-facts";
import { formatTemplateCopilotV2StructuredIssue } from "@/lib/template-copilot-v2-structured-facts";

type Locale = "en" | "zh-Hant" | "zh-Hans";
type Props = Readonly<{
  factId: TemplateCopilotV2StructuredFactId;
  value: unknown;
  ledger: TemplateCopilotV2Ledger;
  locale: Locale;
  issues: readonly TemplateCopilotV2StructuredIssue[];
  onChange: (value: unknown) => void;
}>;

const control = "min-h-10 w-full rounded border border-neutral-400 bg-white px-2 py-1.5 text-sm text-neutral-950 aria-[invalid=true]:border-rose-600 dark:bg-neutral-800 dark:text-white";
const copyFor = (locale: Locale) => locale === "zh-Hant"
  ? {
      add: "新增", remove: "移除", name: "名稱", kind: "種類", attachment: "上載檔案", form: "在應用程式填寫表格",
      required: "必須提供", formats: "接受格式", minimum: "最少數量", maximum: "最多數量", size: "每個檔案上限（MB）",
      stage: "在哪個步驟提供", request: "提交申請時", contributors: "誰可協助提供", requesterOnly: "只限申請人",
      invited: "可邀請其他同事", confirmation: "由誰確認", none: "毋須另行確認", requesterConfirms: "申請人確認",
      ownerConfirms: "該步驟負責人確認", field: "用哪項申請資料作判斷", comparison: "比較方法", contains: "包含文字", value: "比較值",
      currency: "貨幣", unit: "單位", ifMatch: "符合時前往", otherwise: "不符合時前往", order: "判斷次序",
      complete: "完成流程", correction: "退回更正", laterCondition: "後續判斷", event: "甚麼事情發生時通知",
      recipients: "通知哪些人", timing: "何時通知", immediate: "立即", beforeDue: "到期前", afterDue: "逾期後",
      hours: "相隔小時", channel: "傳送方式", defaultChannel: "公司預設", inApp: "應用程式內", email: "電郵",
      both: "應用程式內及電郵", visibility: "誰可看見通知", recipientsOnly: "只限收件人", allParticipants: "所有流程參與者",
      requestSubmitted: "申請已提交", stageAssigned: "工作已分派", stageCompleted: "步驟已完成", requestRejected: "申請被拒絕",
      correctionRequested: "要求更正", requestCompleted: "流程已完成", dueSoon: "即將到期", overdue: "已逾期",
      requester: "申請人", current: "目前步驟處理人", previous: "上一個步驟處理人", all: "所有流程參與者",
      owner: "流程負責部門", errors: "請修正這些欄位",
    }
  : locale === "zh-Hans"
    ? {
        add: "新增", remove: "移除", name: "名称", kind: "类型", attachment: "上传文件", form: "在应用内填写表单",
        required: "必须提供", formats: "接受格式", minimum: "最少数量", maximum: "最多数量", size: "每个文件上限（MB）",
        stage: "在哪个步骤提供", request: "提交申请时", contributors: "谁可协助提供", requesterOnly: "仅限申请人",
        invited: "可邀请其他同事", confirmation: "由谁确认", none: "无需另行确认", requesterConfirms: "申请人确认",
        ownerConfirms: "该步骤负责人确认", field: "用哪项申请信息作判断", comparison: "比较方法", contains: "包含文字", value: "比较值",
        currency: "货币", unit: "单位", ifMatch: "符合时前往", otherwise: "不符合时前往", order: "判断顺序",
        complete: "完成流程", correction: "退回更正", laterCondition: "后续判断", event: "什么事情发生时通知",
        recipients: "通知哪些人", timing: "何时通知", immediate: "立即", beforeDue: "到期前", afterDue: "逾期后",
        hours: "相隔小时", channel: "发送方式", defaultChannel: "公司默认", inApp: "应用内", email: "电子邮件",
        both: "应用内及电子邮件", visibility: "谁可看见通知", recipientsOnly: "仅限收件人", allParticipants: "所有流程参与者",
        requestSubmitted: "申请已提交", stageAssigned: "工作已分配", stageCompleted: "步骤已完成", requestRejected: "申请被拒绝",
        correctionRequested: "要求更正", requestCompleted: "流程已完成", dueSoon: "即将到期", overdue: "已逾期",
        requester: "申请人", current: "当前步骤处理人", previous: "上一步骤处理人", all: "所有流程参与者",
        owner: "流程负责部门", errors: "请修正这些字段",
      }
    : {
        add: "Add", remove: "Remove", name: "Name", kind: "What people provide", attachment: "Upload a file", form: "Complete a form in the app",
        required: "Required", formats: "Accepted formats", minimum: "Minimum quantity", maximum: "Maximum quantity", size: "Maximum size per file (MB)",
        stage: "When it is provided", request: "When the request is submitted", contributors: "Who may help provide it", requesterOnly: "Requester only",
        invited: "Invited colleagues may contribute", confirmation: "Who confirms it", none: "No separate confirmation", requesterConfirms: "Requester confirms",
        ownerConfirms: "The step owner confirms", field: "Request information used for this decision", comparison: "Comparison", contains: "Contains this text", value: "Value",
        currency: "Currency", unit: "Unit", ifMatch: "If it matches, go to", otherwise: "Otherwise, go to", order: "Decision order",
        complete: "Complete the workflow", correction: "Return for correction", laterCondition: "Later decision", event: "Event that sends the message",
        recipients: "Who receives it", timing: "When it is sent", immediate: "Immediately", beforeDue: "Before the due time", afterDue: "After it becomes overdue",
        hours: "Hours before or after", channel: "Delivery method", defaultChannel: "Company default", inApp: "In the app", email: "Email",
        both: "In the app and email", visibility: "Who can see the message", recipientsOnly: "Recipients only", allParticipants: "All workflow participants",
        requestSubmitted: "Request submitted", stageAssigned: "Work assigned", stageCompleted: "Step completed", requestRejected: "Request rejected",
        correctionRequested: "Correction requested", requestCompleted: "Workflow completed", dueSoon: "Due soon", overdue: "Overdue",
        requester: "Requester", current: "Current step participants", previous: "Previous step participants", all: "All workflow participants",
        owner: "Workflow owner", errors: "Correct these fields",
      };

export function TemplateCopilotV2StructuredFactEditor(props: Props) {
  const localized = {
    ...props,
    issues: props.issues.map((item) => ({
      ...item,
      message: formatTemplateCopilotV2StructuredIssue(item, props.locale),
    })),
  };
  if (props.factId === "attachments.requirements") return <AttachmentEditor {...localized} />;
  if (props.factId === "workflow.conditions") return <ConditionEditor {...localized} />;
  return <NotificationEditor {...localized} />;
}

function AttachmentEditor({ value, ledger, locale, issues, onChange }: Props) {
  const copy = copyFor(locale);
  const items = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  const stages = stageOptions(ledger);
  return <Repeater
    label={copy.attachment}
    items={items}
    add={copy.add}
    remove={copy.remove}
    onChange={onChange}
    empty={() => ({
      id: nextId("attachment", items),
      label: "",
      kind: "attachment",
      required: true,
      formats: ["pdf"],
      minimumQuantity: 1,
      maximumQuantity: 1,
      maximumFileSizeMb: 20,
      stage: "request_submission",
      contributorPolicy: "requester_only",
      confirmationPolicy: "none",
    })}
  >{(item, index, set) => {
    const kind = String(item.kind || "attachment");
    return <div className="grid gap-3 sm:grid-cols-2">
      <Labeled label={copy.name} path={`${index}.label`} issues={issues}><input className={control} value={String(item.label || "")} onChange={(event) => set({ ...item, label: event.target.value })} /></Labeled>
      <Labeled label={copy.kind} path={`${index}.kind`} issues={issues}><select className={control} value={kind} onChange={(event) => set(event.target.value === "form" ? { ...item, kind: "form", formats: [], maximumFileSizeMb: undefined } : { ...item, kind: "attachment", formats: ["pdf"], maximumFileSizeMb: 20 })}><option value="attachment">{copy.attachment}</option><option value="form">{copy.form}</option></select></Labeled>
      {kind === "attachment" && <CheckboxGroup label={copy.formats} path={`${index}.formats`} issues={issues} options={["text", "pdf", "image", "excel_csv"]} selected={Array.isArray(item.formats) ? item.formats.map(String) : []} onChange={(formats) => set({ ...item, formats })} />}
      <Labeled label={copy.minimum} path={`${index}.minimumQuantity`} issues={issues}><input className={control} type="number" min="0" max="20" value={numberInputValue(item.minimumQuantity)} onChange={(event) => set({ ...item, minimumQuantity: numberOrBlank(event.target.value) })} /></Labeled>
      <Labeled label={copy.maximum} path={`${index}.maximumQuantity`} issues={issues}><input className={control} type="number" min="1" max="20" value={numberInputValue(item.maximumQuantity)} onChange={(event) => set({ ...item, maximumQuantity: numberOrBlank(event.target.value) })} /></Labeled>
      {kind === "attachment" && <Labeled label={copy.size} path={`${index}.maximumFileSizeMb`} issues={issues}><input className={control} type="number" min="1" max="25" value={numberInputValue(item.maximumFileSizeMb)} onChange={(event) => set({ ...item, maximumFileSizeMb: numberOrBlank(event.target.value) })} /></Labeled>}
      <Labeled label={copy.stage} path={`${index}.stage`} issues={issues}><select className={control} value={String(item.stage || "request_submission")} onChange={(event) => set({ ...item, stage: event.target.value, ...(event.target.value === "request_submission" && item.confirmationPolicy === "stage_owner_confirms" ? { confirmationPolicy: "none" } : {}) })}><option value="request_submission">{copy.request}</option>{stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></Labeled>
      <Labeled label={copy.contributors} path={`${index}.contributorPolicy`} issues={issues}><select className={control} value={String(item.contributorPolicy || "requester_only")} onChange={(event) => set({ ...item, contributorPolicy: event.target.value })}><option value="requester_only">{copy.requesterOnly}</option><option value="allow_invited_contributors">{copy.invited}</option></select></Labeled>
      <Labeled label={copy.confirmation} path={`${index}.confirmationPolicy`} issues={issues}><select className={control} value={String(item.confirmationPolicy || "none")} onChange={(event) => set({ ...item, confirmationPolicy: event.target.value })}><option value="none">{copy.none}</option><option value="requester_confirms">{copy.requesterConfirms}</option><option value="stage_owner_confirms" disabled={item.stage === "request_submission"}>{copy.ownerConfirms}</option></select></Labeled>
      <label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={item.required === true} onChange={(event) => set({ ...item, required: event.target.checked, minimumQuantity: event.target.checked ? Math.max(1, Number(item.minimumQuantity || 0)) : Number(item.minimumQuantity || 0) })} />{copy.required}</label>
    </div>;
  }}</Repeater>;
}

function ConditionEditor({ value, ledger, locale, issues, onChange }: Props) {
  const copy = copyFor(locale);
  const items = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  const fields = requestFieldOptions(ledger);
  const stages = stageOptions(ledger);
  const terminalAndStageRoutes = [
    { value: "complete", label: copy.complete },
    { value: "return_for_correction", label: copy.correction },
    ...stages,
  ];
  return <Repeater
    label={copy.laterCondition}
    items={items}
    add={copy.add}
    remove={copy.remove}
    onChange={onChange}
    empty={() => ({
      id: nextId("condition", items),
      sequence: nextSequence(items),
      field: fields[0]?.label || "",
      operator: "=",
      value: "",
      matchingRoute: stages[0]?.value || "return_for_correction",
      otherwiseRoute: "complete",
    })}
  >{(item, index, set) => {
    const field = fields.find((candidate) => candidate.label === item.field);
    const numeric = field?.type === "number" || field?.type === "currency";
    const sequence = Number(item.sequence || index + 1);
    const routes = [
      ...terminalAndStageRoutes,
      ...items
        .filter((candidate) => Number(candidate.sequence || 0) > sequence)
        .map((candidate) => ({
          value: `condition:${String(candidate.id || "")}`,
          label: `${copy.laterCondition}: ${String(candidate.id || "")}`,
        })),
    ];
    return <div className="grid gap-3 sm:grid-cols-2">
      <Labeled label={copy.order} path={`${index}.sequence`} issues={issues}><input className={control} type="number" min="1" max="50" value={numberInputValue(item.sequence)} onChange={(event) => set({ ...item, sequence: numberOrBlank(event.target.value) })} /></Labeled>
      <Labeled label={copy.field} path={`${index}.field`} issues={issues}><select className={control} value={String(item.field || "")} onChange={(event) => {
        const next: Record<string, unknown> = { ...item, field: event.target.value };
        delete next.currency;
        delete next.unit;
        set(next);
      }}>{fields.map((candidate) => <option key={candidate.label} value={candidate.label}>{candidate.label}</option>)}</select></Labeled>
      <Labeled label={copy.comparison} path={`${index}.operator`} issues={issues}><select className={control} value={String(item.operator || "=")} onChange={(event) => set({ ...item, operator: event.target.value })}>{["=", "!=", ">", ">=", "<", "<=", "contains"].map((operator) => <option key={operator} value={operator}>{operator === "contains" ? copy.contains : operator}</option>)}</select></Labeled>
      <Labeled label={copy.value} path={`${index}.value`} issues={issues}><input className={control} type={numeric ? "number" : "text"} value={numeric ? numberInputValue(item.value) : String(item.value ?? "")} onChange={(event) => set({ ...item, value: numeric ? numberOrBlank(event.target.value) : event.target.value })} /></Labeled>
      {field?.type === "currency" && <Labeled label={copy.currency} path={`${index}.currency`} issues={issues}><input className={control} maxLength={3} value={String(item.currency || "")} onChange={(event) => set({ ...item, currency: event.target.value.toUpperCase() })} /></Labeled>}
      {field?.type === "number" && <Labeled label={copy.unit} path={`${index}.unit`} issues={issues}><input className={control} value={String(item.unit || "")} onChange={(event) => set({ ...item, unit: event.target.value })} /></Labeled>}
      <Labeled label={copy.ifMatch} path={`${index}.matchingRoute`} issues={issues}><select className={control} value={String(item.matchingRoute || "")} onChange={(event) => set({ ...item, matchingRoute: event.target.value })}>{routes.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}</select></Labeled>
      <Labeled label={copy.otherwise} path={`${index}.otherwiseRoute`} issues={issues}><select className={control} value={String(item.otherwiseRoute || "")} onChange={(event) => set({ ...item, otherwiseRoute: event.target.value })}>{routes.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}</select></Labeled>
    </div>;
  }}</Repeater>;
}

function NotificationEditor({ value, ledger, locale, issues, onChange }: Props) {
  const copy = copyFor(locale);
  const items = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  const stages = stageOptions(ledger);
  const dueHours = committedDefaultDueHours(ledger);
  const events = [
    ["request_submitted", copy.requestSubmitted], ["stage_assigned", copy.stageAssigned], ["stage_completed", copy.stageCompleted],
    ["request_rejected", copy.requestRejected], ["correction_requested", copy.correctionRequested], ["request_completed", copy.requestCompleted],
    ["due_soon", copy.dueSoon], ["overdue", copy.overdue],
  ];
  const recipientOptions = [
    ["requester", copy.requester], ["current_stage_participants", copy.current], ["previous_stage_participants", copy.previous],
    ["all_participants", copy.all], ["workflow_owner", copy.owner],
  ];
  return <Repeater
    label={copy.event}
    items={items}
    add={copy.add}
    remove={copy.remove}
    onChange={onChange}
    empty={() => ({
      id: nextId("notification", items),
      event: "request_submitted",
      recipients: ["requester"],
      timing: { mode: "immediate" },
      channel: "default",
      visibility: "recipients_only",
    })}
  >{(item, index, set) => {
    const timing = isRecord(item.timing) ? item.timing : { mode: "immediate" };
    const event = String(item.event || "request_submitted");
    const needsStage = ["stage_assigned", "stage_completed", "due_soon", "overdue"].includes(event)
      || (Array.isArray(item.recipients) && item.recipients.some((recipient) => ["current_stage_participants", "previous_stage_participants"].includes(String(recipient))));
    return <div className="grid gap-3 sm:grid-cols-2">
      <Labeled label={copy.event} path={`${index}.event`} issues={issues}><select className={control} value={event} onChange={(change) => {
        const nextEvent = change.target.value;
        const next: Record<string, unknown> = { ...item, event: nextEvent, timing: nextEvent === "due_soon" ? { mode: "before_due", offsetHours: Math.min(24, dueHours || 24) } : nextEvent === "overdue" ? { mode: "after_due", offsetHours: 1 } : { mode: "immediate" } };
        if (["stage_assigned", "stage_completed", "due_soon", "overdue"].includes(nextEvent)) next.stage = item.stage || stages[0]?.value;
        else if (!(Array.isArray(item.recipients) && item.recipients.some((recipient) => ["current_stage_participants", "previous_stage_participants"].includes(String(recipient))))) delete next.stage;
        set(next);
      }}>{events.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Labeled>
      <CheckboxGroup label={copy.recipients} path={`${index}.recipients`} issues={issues} options={recipientOptions.map(([id]) => id)} optionLabels={Object.fromEntries(recipientOptions)} selected={Array.isArray(item.recipients) ? item.recipients.map(String) : []} onChange={(recipients) => {
        const next: Record<string, unknown> = { ...item, recipients };
        if (recipients.some((recipient) => ["current_stage_participants", "previous_stage_participants"].includes(recipient))) next.stage = item.stage || stages[0]?.value;
        set(next);
      }} />
      <Labeled label={copy.timing} path={`${index}.timing.mode`} issues={issues}><select className={control} value={String(timing.mode || "immediate")} onChange={(event) => set({ ...item, timing: event.target.value === "immediate" ? { mode: "immediate" } : { mode: event.target.value, offsetHours: Number(timing.offsetHours || 1) } })}><option value="immediate">{copy.immediate}</option><option value="before_due">{copy.beforeDue}</option><option value="after_due">{copy.afterDue}</option></select></Labeled>
      {timing.mode !== "immediate" && <Labeled label={copy.hours} path={`${index}.timing.offsetHours`} issues={issues}><input className={control} type="number" min="1" max={event === "due_soon" && dueHours ? dueHours : 8760} value={numberInputValue(timing.offsetHours)} onChange={(event) => set({ ...item, timing: { ...timing, offsetHours: numberOrBlank(event.target.value) } })} /></Labeled>}
      <Labeled label={copy.channel} path={`${index}.channel`} issues={issues}><select className={control} value={String(item.channel || "default")} onChange={(event) => set({ ...item, channel: event.target.value })}><option value="default">{copy.defaultChannel}</option><option value="in_app">{copy.inApp}</option><option value="email">{copy.email}</option><option value="in_app_and_email">{copy.both}</option></select></Labeled>
      <Labeled label={copy.visibility} path={`${index}.visibility`} issues={issues}><select className={control} value={String(item.visibility || "recipients_only")} onChange={(event) => set({ ...item, visibility: event.target.value })}><option value="recipients_only">{copy.recipientsOnly}</option><option value="all_participants">{copy.allParticipants}</option></select></Labeled>
      {needsStage && <Labeled label={copy.stage} path={`${index}.stage`} issues={issues}><select className={control} value={String(item.stage || "")} onChange={(event) => set({ ...item, stage: event.target.value })}><option value="">{copy.stage}</option>{stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></Labeled>}
    </div>;
  }}</Repeater>;
}

function Repeater({ label, items, add, remove, onChange, empty, children }: {
  label: string;
  items: Array<Record<string, unknown>>;
  add: string;
  remove: string;
  onChange: (value: unknown) => void;
  empty: () => Record<string, unknown>;
  children: (item: Record<string, unknown>, index: number, set: (value: Record<string, unknown>) => void) => ReactNode;
}) {
  return <div className="space-y-3">
    {items.map((item, index) => <fieldset key={String(item.id || index)} className="min-w-0 rounded border border-neutral-300 p-3 dark:border-neutral-700"><legend className="px-1 text-xs font-medium">{label} {index + 1}</legend>{children(item, index, (next) => onChange(items.map((current, currentIndex) => currentIndex === index ? next : current)))}<button type="button" className="mt-3 min-h-10 rounded border border-neutral-400 px-3 text-xs" aria-label={`${remove} ${label} ${index + 1}`} onClick={() => onChange(items.filter((_, currentIndex) => currentIndex !== index))}>{remove}</button></fieldset>)}
    <button type="button" className="min-h-10 rounded border border-neutral-400 px-3 text-xs" onClick={() => onChange([...items, empty()])}>{add}</button>
  </div>;
}

function Labeled({ label, path, issues, children }: { label: string; path: string; issues: readonly TemplateCopilotV2StructuredIssue[]; children: ReactNode }) {
  const id = useId();
  const matching = issues.filter((issue) => issue.path === path);
  const errorId = `${id}-error`;
  const child = isValidElement<Record<string, unknown>>(children) ? cloneElement(children, {
    id,
    "aria-label": label,
    "aria-invalid": matching.length > 0,
    ...(matching.length ? { "aria-describedby": errorId } : {}),
  }) : children;
  return <div className="grid min-w-0 gap-1 text-xs font-medium text-neutral-800 dark:text-neutral-100"><label htmlFor={id}>{label}</label>{child}{matching.length > 0 && <p id={errorId} className="text-rose-700 dark:text-rose-300">{matching.map((issue) => issue.message).join(" ")}</p>}</div>;
}

function CheckboxGroup({ label, path, issues, options, optionLabels = {}, selected, onChange }: {
  label: string; path: string; issues: readonly TemplateCopilotV2StructuredIssue[]; options: string[]; optionLabels?: Record<string, string>; selected: string[]; onChange: (value: string[]) => void;
}) {
  const id = useId();
  const matching = issues.filter((issue) => issue.path === path);
  return <fieldset aria-describedby={matching.length ? `${id}-error` : undefined} className="grid gap-1"><legend className="text-xs font-medium">{label}</legend><div className="flex flex-wrap gap-3">{options.map((option) => <label key={option} className="flex min-h-10 items-center gap-1 text-xs"><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...new Set([...selected, option])] : selected.filter((value) => value !== option))} />{optionLabels[option] || option}</label>)}</div>{matching.length > 0 && <p id={`${id}-error`} className="text-rose-700 dark:text-rose-300">{matching.map((issue) => issue.message).join(" ")}</p>}</fieldset>;
}

function stageOptions(ledger: TemplateCopilotV2Ledger) {
  const fact = ledger.facts["workflow.stages"];
  const value = fact.status === "committed" ? fact.canonicalValue : undefined;
  return Array.isArray(value) ? value.flatMap((item) => isRecord(item) && typeof item.label === "string" ? [{ value: `stage:${item.label}`, label: item.label }] : []) : [];
}
function requestFieldOptions(ledger: TemplateCopilotV2Ledger) {
  const fact = ledger.facts["request.fields"];
  const value = fact.status === "committed" ? fact.canonicalValue : undefined;
  return Array.isArray(value) ? value.flatMap((item) => isRecord(item) && typeof item.label === "string" ? [{ label: item.label, type: String(item.type || "") }] : []) : [];
}
function committedDefaultDueHours(ledger: TemplateCopilotV2Ledger) {
  const fact = ledger.facts["timing.rules"];
  const value = fact.status === "committed" && isRecord(fact.canonicalValue)
    ? fact.canonicalValue.defaultDueHours
    : undefined;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
function nextId(prefix: string, items: Array<Record<string, unknown>>) {
  const used = new Set(items.map((item) => String(item.id || "")));
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
function nextSequence(items: Array<Record<string, unknown>>) {
  return Math.max(0, ...items.map((item) => Number(item.sequence || 0))) + 1;
}
function numberOrBlank(value: string) {
  return value === "" ? "" : Number(value);
}
function numberInputValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
