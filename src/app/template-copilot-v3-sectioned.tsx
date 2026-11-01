"use client";

import { useMemo, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import type { BusinessUnit, WorkflowTemplate } from "@/lib/types";
import { workflowTemplateFromDefinition } from "@/lib/template-authoring-definition";
import type { TemplateDefinitionV1 } from "@/lib/template-authoring-contracts";
import { templateCopilotStartSchema } from "@/lib/template-copilot-ledger";
import type { TemplateCopilotV3Proposal } from "@/lib/template-copilot-v3-proposal";
import { templateCopilotV3CommitOrder } from "@/lib/template-copilot-v3-proposal";

type Locale = "en" | "zh-Hant" | "zh-Hans";
type Row = Record<string, unknown>;
type Slot =
  | "identity_scope" | "initiators_fields" | "attachments" | "stages_participants" | "conditions_exceptions"
  | "collaboration_corrections" | "timing_escalation" | "visibility_notifications" | "governance";

const slots: readonly Slot[] = [
  "identity_scope", "initiators_fields", "attachments", "stages_participants", "conditions_exceptions",
  "collaboration_corrections", "timing_escalation", "visibility_notifications", "governance",
];

const copy: Record<Locale, Record<string, string>> & Record<string, Record<string, string>> = {
  en: {
    title: "Describe your workflow in sections",
    intro: "Fill in what you know. Leave a box empty if it does not apply. The Copilot reads your words, then you check and correct everything before a draft is made.",
    language: "Language", business: "Business", department: "Department", start: "Start", read: "Read my description", reading: "Reading… this takes about a minute",
    identity_scope: "What is this workflow for?", initiators_fields: "Who can start it, and what do they fill in?", attachments: "Which documents are needed?",
    stages_participants: "Who approves, in what order?", conditions_exceptions: "Special rules and what happens on rejection", collaboration_corrections: "Colleagues helping and corrections",
    timing_escalation: "Deadlines and escalation", visibility_notifications: "Who can see it, and who is notified?", governance: "Ownership, review and record keeping",
    review: "Check what the Copilot understood", fromText: "from your text", suggested: "suggested, please check", name: "Workflow name", purpose: "Purpose",
    fields: "Request fields", label: "Label", type: "Type", required: "Required", add: "Add", remove: "Remove", documents: "Documents", formats: "Format",
    steps: "Approval steps", kind: "Kind", order: "Order (same number = at the same time)", rules: "Routing rules", field: "Field", operator: "Test", value: "Value", route: "Goes to",
    notifications: "Notifications", policies: "Timing, rejection and records", dueHours: "Due after (hours)", rejection: "When rejected", retention: "Keep records for", owner: "Process owner",
    held: "Needs your decision", noHeld: "Nothing is waiting for your decision.", applySuggestion: "Use this rule", confirm: "Confirm and create draft", creating: "Saving and creating the draft…",
    done: "Draft created", open: "Open in the builder", back: "Start over", missing: "Some parts could not be read and are empty; please fill them in.",
    holdConditional_rule: "A routing rule was found. Check it, then use it or add your own.", holdUnparsed_rule: "A routing rule could not be read completely. Add it by hand in the rules above.",
    holdConditional_document: "This document is only needed in some cases. It is kept as optional.", holdNative_form: "This is an in-app form. Design its fields in the visual builder after the draft is created.",
    holdUnsupported_stage_kind: "This step cannot be built automatically. Add it in the visual builder.",
    failed: "The Copilot could not read the description right now. Please try again, or use the guided questions.", errorPrefix: "Something went wrong:",
  },
  "zh-Hant": {
    title: "分段描述你的流程", intro: "填寫你已知的內容，不適用的欄位可留空。Copilot 讀取你的文字後，你需要檢查並修正，才會建立草稿。",
    language: "語言", business: "業務單位", department: "部門", start: "開始", read: "讀取我的描述", reading: "正在讀取… 約需一分鐘",
    identity_scope: "這個流程用於什麼？", initiators_fields: "誰可以發起？需要填寫什麼？", attachments: "需要哪些文件？",
    stages_participants: "誰負責審批？次序如何？", conditions_exceptions: "特別規則及被拒絕時的處理", collaboration_corrections: "同事協助及補正",
    timing_escalation: "期限及升級", visibility_notifications: "誰可以查看？誰會收到通知？", governance: "負責人、複核及記錄保留",
    review: "檢查 Copilot 的理解", fromText: "來自你的文字", suggested: "建議，請檢查", name: "流程名稱", purpose: "目的",
    fields: "申請欄位", label: "名稱", type: "類型", required: "必填", add: "新增", remove: "移除", documents: "文件", formats: "格式",
    steps: "審批步驟", kind: "種類", order: "次序（相同數字＝同時進行）", rules: "路由規則", field: "欄位", operator: "條件", value: "數值", route: "前往",
    notifications: "通知", policies: "時限、拒絕及記錄", dueHours: "限時（小時）", rejection: "被拒絕時", retention: "記錄保留", owner: "流程負責人",
    held: "需要你決定", noHeld: "沒有需要你決定的項目。", applySuggestion: "採用此規則", confirm: "確認並建立草稿", creating: "正在儲存並建立草稿…",
    done: "已建立草稿", open: "在流程編輯器中開啟", back: "重新開始", missing: "部分內容無法讀取而留空，請補充。",
    holdConditional_rule: "找到一條路由規則。請檢查後採用，或自行新增。", holdUnparsed_rule: "有一條路由規則無法完整讀取，請在上方規則中手動新增。",
    holdConditional_document: "此文件只在部分情況需要，已保留為選填。", holdNative_form: "這是應用內表單，建立草稿後請在視覺編輯器設計其欄位。",
    holdUnsupported_stage_kind: "此步驟無法自動建立，請在視覺編輯器新增。",
    failed: "Copilot 暫時無法讀取描述。請再試一次，或改用引導問題。", errorPrefix: "發生錯誤：",
  },
  "zh-Hans": {
    title: "分段描述你的流程", intro: "填写你已知的内容，不适用的栏位可留空。Copilot 读取你的文字后，你需要检查并修正，才会创建草稿。",
    language: "语言", business: "业务单位", department: "部门", start: "开始", read: "读取我的描述", reading: "正在读取… 约需一分钟",
    identity_scope: "这个流程用于什么？", initiators_fields: "谁可以发起？需要填写什么？", attachments: "需要哪些文件？",
    stages_participants: "谁负责审批？次序如何？", conditions_exceptions: "特别规则及被拒绝时的处理", collaboration_corrections: "同事协助及补正",
    timing_escalation: "期限及升级", visibility_notifications: "谁可以查看？谁会收到通知？", governance: "负责人、复核及记录保留",
    review: "检查 Copilot 的理解", fromText: "来自你的文字", suggested: "建议，请检查", name: "流程名称", purpose: "目的",
    fields: "申请栏位", label: "名称", type: "类型", required: "必填", add: "新增", remove: "移除", documents: "文件", formats: "格式",
    steps: "审批步骤", kind: "种类", order: "次序（相同数字＝同时进行）", rules: "路由规则", field: "栏位", operator: "条件", value: "数值", route: "前往",
    notifications: "通知", policies: "时限、拒绝及记录", dueHours: "限时（小时）", rejection: "被拒绝时", retention: "记录保留", owner: "流程负责人",
    held: "需要你决定", noHeld: "没有需要你决定的项目。", applySuggestion: "采用此规则", confirm: "确认并创建草稿", creating: "正在保存并创建草稿…",
    done: "已创建草稿", open: "在流程编辑器中打开", back: "重新开始", missing: "部分内容无法读取而留空，请补充。",
    holdConditional_rule: "找到一条路由规则。请检查后采用，或自行新增。", holdUnparsed_rule: "有一条路由规则无法完整读取，请在上方规则中手动新增。",
    holdConditional_document: "此文件只在部分情况需要，已保留为选填。", holdNative_form: "这是应用内表单，创建草稿后请在可视化编辑器设计其栏位。",
    holdUnsupported_stage_kind: "此步骤无法自动创建，请在可视化编辑器新增。",
    failed: "Copilot 暂时无法读取描述。请再试一次，或改用引导问题。", errorPrefix: "发生错误：",
  },
};

const fieldTypes = ["text", "long_text", "number", "date", "currency", "email", "select", "radio", "checkbox", "table"];
const stageKinds = ["approval", "review", "for_information"];
const formatsList = ["pdf", "image", "excel_csv", "text"];
const operators = ["=", "!=", ">", ">=", "<", "<=", "contains"];
const rejectionActions = ["return_for_correction", "close"];

const inputClass = "template-copilot-control min-h-9 w-full rounded-md border border-[#d8d8d8] bg-white px-2 text-sm dark:bg-neutral-800 dark:text-white";
const buttonClass = "min-h-9 rounded-md border border-neutral-400 px-3 text-sm text-neutral-700 dark:text-neutral-200";
const primaryButtonClass = "min-h-9 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50";

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, payload };
}
const messageOf = (payload: Record<string, unknown>, fallback: string) => {
  const error = payload.error as { message?: unknown } | undefined;
  return typeof error?.message === "string" ? error.message : fallback;
};
const newKey = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

function Origin({ origin, text }: { origin?: string; text: Record<string, string> }) {
  if (!origin) return null;
  return (
    <span className={`ml-2 rounded border px-1.5 py-0.5 text-[11px] ${origin === "source" ? "border-emerald-700 text-emerald-800 dark:text-emerald-300" : "border-amber-700 text-amber-800 dark:text-amber-300"}`}>
      {origin === "source" ? text.fromText : text.suggested}
    </span>
  );
}

export function TemplateCopilotV3Sectioned({
  businessDirectory,
  onDraftCreated,
}: {
  businessDirectory: BusinessUnit[];
  onDraftCreated: (template: WorkflowTemplate) => void;
}) {
  const businesses = useMemo(
    () => businessDirectory.filter((business) => business.departments.length > 0 && templateCopilotStartSchema.shape.businessUnitId.safeParse(business.id).success),
    [businessDirectory],
  );
  const [locale, setLocale] = useState<Locale>("en");
  const text = copy[locale];
  const [businessId, setBusinessId] = useState("");
  const business = businesses.find((item) => item.id === businessId) ?? businesses[0];
  const [department, setDepartment] = useState("");
  const departmentName = business?.departments.includes(department) ? department : business?.departments[0] ?? "";
  const [session, setSession] = useState<{ id: string; revision: number } | null>(null);
  const [sections, setSections] = useState<Record<Slot, string>>(() => Object.fromEntries(slots.map((slot) => [slot, ""])) as Record<Slot, string>);
  const [proposal, setProposal] = useState<TemplateCopilotV3Proposal | null>(null);
  const [facts, setFacts] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState<"" | "start" | "read" | "create">("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ definition: TemplateDefinitionV1; dossier: unknown; familyId: string; draftId: string; revision: number; errorCount: number } | null>(null);

  const rows = (factId: string) => (Array.isArray(facts[factId]) ? (facts[factId] as Row[]) : []);
  const scalar = (factId: string) => facts[factId];
  const setRows = (factId: string, next: Row[]) => setFacts((current) => ({ ...current, [factId]: next }));
  const updateRow = (factId: string, index: number, patch: Row) => setRows(factId, rows(factId).map((row, position) => (position === index ? { ...row, ...patch } : row)));
  const removeRow = (factId: string, index: number) => setRows(factId, rows(factId).filter((_, position) => position !== index));
  const origin = (factId: string, path: string) => proposal?.facts[factId as keyof TemplateCopilotV3Proposal["facts"]]?.origin?.[path];

  async function startAndRead() {
    if (!business || !departmentName || busy) return;
    setError("");
    setBusy("read");
    try {
      let current = session;
      if (!current) {
        const started = await post("/api/template-authoring/copilot/sessions", {
          businessUnitId: business.id, departmentName, locale, clientMessageId: newKey("start"),
        });
        if (!started.ok) throw new Error(messageOf(started.payload, text.failed));
        current = { id: String(started.payload.sessionId), revision: Number(started.payload.revision ?? 1) };
        setSession(current);
      }
      const read = await post(`/api/template-authoring/copilot/sessions/${current.id}/describe-v3`, {
        locale,
        sections: slots.map((slot) => ({ slot, text: sections[slot] })).filter((section) => section.text.trim()),
      });
      if (!read.ok) throw new Error(messageOf(read.payload, text.failed));
      const next = read.payload.proposal as TemplateCopilotV3Proposal;
      setProposal(next);
      setFacts(Object.fromEntries(Object.values(next.facts).map((fact) => [fact.factId, fact.value])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.failed);
    } finally {
      setBusy("");
    }
  }

  async function confirmAndCreate() {
    if (!session || busy) return;
    setError("");
    setBusy("create");
    try {
      let revision = session.revision;
      for (const factId of templateCopilotV3CommitOrder) {
        const value = facts[factId];
        const empty = value === null || value === undefined || (Array.isArray(value) && value.length === 0);
        const optionalFact = ["attachments.requirements", "workflow.conditions", "notifications.rules"].includes(factId);
        if (empty && !optionalFact) throw new Error(`${text.errorPrefix} ${factId}`);
        const transition = empty
          ? { operation: "mark_not_applicable", reason: "Not described." }
          : { operation: "human_commit", payload: { canonicalValue: value, provenance: [{ kind: "human_editor", sourceId: "v3-review", sourceMessageIds: [] }] } };
        const committed = await post(`/api/template-authoring/copilot/sessions/${session.id}/facts`, {
          expectedRevision: revision, idempotencyKey: newKey("fact"), factId, transition,
        });
        if (!committed.ok) {
          const issues = Array.isArray(committed.payload.issues) ? ` ${JSON.stringify(committed.payload.issues).slice(0, 200)}` : "";
          throw new Error(`${text.errorPrefix} ${factId}: ${messageOf(committed.payload, String(committed.status))}${issues}`);
        }
        revision = Number(committed.payload.revision ?? revision);
      }
      const draft = await post(`/api/template-authoring/copilot/sessions/${session.id}/create-draft`, { expectedRevision: revision, idempotencyKey: newKey("draft") });
      if (!draft.ok) {
        const issues = Array.isArray(draft.payload.compilerIssues) ? (draft.payload.compilerIssues as Row[]).map((issue) => String(issue.message)).join(" ") : "";
        throw new Error(`${messageOf(draft.payload, String(draft.status))} ${issues}`.trim());
      }
      setCreated({
        definition: draft.payload.definition as TemplateDefinitionV1, dossier: draft.payload.dossier, familyId: String(draft.payload.familyId),
        draftId: String(draft.payload.draftId), revision: Number(draft.payload.authoringRevision || 1),
        errorCount: Number((draft.payload.validation as { errorCount?: unknown } | undefined)?.errorCount ?? 0),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.failed);
    } finally {
      setBusy("");
    }
  }

  function applySuggestion(suggestion: unknown) {
    if (suggestion && typeof suggestion === "object") setRows("workflow.conditions", [...rows("workflow.conditions"), suggestion as Row]);
  }

  function reset() {
    setSession(null); setProposal(null); setFacts({}); setCreated(null); setError("");
  }

  const stageLabels = rows("workflow.stages").map((stage) => String(stage.label ?? ""));
  const header = (
    <div className="flex items-start gap-3">
      <Bot aria-hidden="true" size={20} />
      <div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">{text.title}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{text.intro}</p>
      </div>
    </div>
  );

  if (created) {
    return (
      <section className="rounded-md border border-[#d9e4df] bg-[#f7fbf9] p-5 dark:border-neutral-700 dark:bg-neutral-950" aria-live="polite">
        {header}
        <h3 className="mt-4 text-sm font-semibold">{text.done}</h3>
        <p className="mt-1 text-sm">{String(created.definition.template.name ?? "")}</p>
        {created.errorCount > 0 && <p className="mt-2 text-xs text-amber-800">{text.holdNative_form}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" className={primaryButtonClass} onClick={() => onDraftCreated({
            ...workflowTemplateFromDefinition(created.definition),
            authoringFamilyId: created.familyId, authoringDraftId: created.draftId, authoringRevision: created.revision,
            authoringDossier: created.dossier as never,
          })}>{text.open}</button>
          <button type="button" className={buttonClass} onClick={reset}>{text.back}</button>
        </div>
      </section>
    );
  }

  if (!proposal) {
    return (
      <section className="rounded-md border border-[#d9e4df] bg-[#f7fbf9] p-5 dark:border-neutral-700 dark:bg-neutral-950">
        {header}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">{text.language}
            <select className={inputClass} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="en">English</option><option value="zh-Hant">繁體中文</option><option value="zh-Hans">简体中文</option>
            </select>
          </label>
          <label className="text-sm">{text.business}
            <select className={inputClass} value={business?.id ?? ""} onChange={(event) => setBusinessId(event.target.value)} disabled={Boolean(session)}>
              {businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm">{text.department}
            <select className={inputClass} value={departmentName} onChange={(event) => setDepartment(event.target.value)} disabled={Boolean(session)}>
              {(business?.departments ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-3">
          {slots.map((slot) => (
            <label key={slot} className="text-sm font-medium text-neutral-900 dark:text-white">{text[slot]}
              <textarea className={`${inputClass} mt-1 min-h-20 font-normal`} rows={3} maxLength={16000} value={sections[slot]}
                onChange={(event) => setSections((current) => ({ ...current, [slot]: event.target.value }))} disabled={busy !== ""} />
            </label>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button type="button" className={`${primaryButtonClass} mt-4`} disabled={busy !== "" || !slots.some((slot) => sections[slot].trim())} onClick={() => void startAndRead()}>
          {busy === "read" ? text.reading : text.read}
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-[#d9e4df] bg-[#f7fbf9] p-5 dark:border-neutral-700 dark:bg-neutral-950">
      {header}
      <h3 className="mt-4 text-sm font-semibold">{text.review}</h3>
      {proposal.missingBatches.length > 0 && <p className="mt-2 text-xs text-amber-800">{text.missing}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{text.name}<Origin origin={origin("workflow.name", "")} text={text} />
          <input className={inputClass} value={String(scalar("workflow.name") ?? "")} onChange={(event) => setFacts((current) => ({ ...current, "workflow.name": event.target.value }))} />
        </label>
        <label className="text-sm">{text.owner}
          <input className={inputClass} value={String(scalar("governance.owner") ?? "")} onChange={(event) => setFacts((current) => ({ ...current, "governance.owner": event.target.value }))} />
        </label>
        <label className="text-sm sm:col-span-2">{text.purpose}
          <textarea className={inputClass} rows={2} value={String(scalar("workflow.purpose") ?? "")} onChange={(event) => setFacts((current) => ({ ...current, "workflow.purpose": event.target.value }))} />
        </label>
      </div>

      <h4 className="mt-4 text-sm font-semibold">{text.fields}</h4>
      <div className="mt-2 grid gap-2">
        {rows("request.fields").map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_9rem_5rem_auto] items-center gap-2">
            <input aria-label={text.label} className={inputClass} value={String(row.label ?? "")} onChange={(event) => updateRow("request.fields", index, { label: event.target.value })} />
            <select aria-label={text.type} className={inputClass} value={String(row.type ?? "text")} onChange={(event) => updateRow("request.fields", index, { type: event.target.value, options: ["select", "radio"].includes(event.target.value) ? (row.options ?? []) : [] })}>
              {fieldTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={row.required === true} onChange={(event) => updateRow("request.fields", index, { required: event.target.checked })} />{text.required}</label>
            <span className="flex items-center"><Origin origin={origin("request.fields", `/${index}/type`)} text={text} /><button type="button" className={`${buttonClass} ml-2`} onClick={() => removeRow("request.fields", index)}>{text.remove}</button></span>
          </div>
        ))}
        <button type="button" className={`${buttonClass} w-fit`} onClick={() => setRows("request.fields", [...rows("request.fields"), { label: "", type: "text", required: true, options: [] }])}>{text.add}</button>
      </div>

      <h4 className="mt-4 text-sm font-semibold">{text.documents}</h4>
      <div className="mt-2 grid gap-2">
        {rows("attachments.requirements").map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_8rem_5rem_auto] items-center gap-2">
            <input aria-label={text.label} className={inputClass} value={String(row.label ?? "")} onChange={(event) => updateRow("attachments.requirements", index, { label: event.target.value })} />
            <select aria-label={text.formats} className={inputClass} value={String((row.formats as string[] | undefined)?.[0] ?? "pdf")} onChange={(event) => updateRow("attachments.requirements", index, { formats: [event.target.value] })}>
              {formatsList.map((format) => <option key={format} value={format}>{format}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={row.required === true} onChange={(event) => updateRow("attachments.requirements", index, { required: event.target.checked, minimumQuantity: event.target.checked ? 1 : 0 })} />{text.required}</label>
            <button type="button" className={buttonClass} onClick={() => removeRow("attachments.requirements", index)}>{text.remove}</button>
          </div>
        ))}
      </div>

      <h4 className="mt-4 text-sm font-semibold">{text.steps}</h4>
      <div className="mt-2 grid gap-2">
        {rows("workflow.stages").map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_9rem_5rem_auto] items-center gap-2">
            <input aria-label={text.label} className={inputClass} value={String(row.label ?? "")} onChange={(event) => updateRow("workflow.stages", index, { label: event.target.value, participant: { mode: "directory_position", value: event.target.value } })} />
            <select aria-label={text.kind} className={inputClass} value={String(row.kind ?? "approval")} onChange={(event) => updateRow("workflow.stages", index, { kind: event.target.value })}>
              {stageKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
            <input aria-label={text.order} title={text.order} type="number" min={1} max={100} className={inputClass} value={Number(row.sequence ?? 1)} onChange={(event) => updateRow("workflow.stages", index, { sequence: Math.min(100, Math.max(1, Number(event.target.value) || 1)) })} />
            <span className="flex items-center"><Origin origin={origin("workflow.stages", `/${index}/sequence`)} text={text} /><button type="button" className={`${buttonClass} ml-2`} onClick={() => removeRow("workflow.stages", index)}>{text.remove}</button></span>
          </div>
        ))}
      </div>

      <h4 className="mt-4 text-sm font-semibold">{text.rules}</h4>
      <div className="mt-2 grid gap-2">
        {rows("workflow.conditions").map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_5rem_7rem_1fr_auto] items-center gap-2">
            <input aria-label={text.field} className={inputClass} value={String(row.field ?? "")} onChange={(event) => updateRow("workflow.conditions", index, { field: event.target.value })} />
            <select aria-label={text.operator} className={inputClass} value={String(row.operator ?? ">")} onChange={(event) => updateRow("workflow.conditions", index, { operator: event.target.value })}>
              {operators.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
            </select>
            <input aria-label={text.value} className={inputClass} value={String(row.value ?? "")} onChange={(event) => updateRow("workflow.conditions", index, { value: Number.isFinite(Number(event.target.value)) && event.target.value.trim() !== "" ? Number(event.target.value) : event.target.value })} />
            <select aria-label={text.route} className={inputClass} value={String(row.matchingRoute ?? "")} onChange={(event) => updateRow("workflow.conditions", index, { matchingRoute: event.target.value })}>
              {stageLabels.map((label) => <option key={label} value={`stage:${label}`}>{label}</option>)}
            </select>
            <button type="button" className={buttonClass} onClick={() => removeRow("workflow.conditions", index)}>{text.remove}</button>
          </div>
        ))}
      </div>

      <h4 className="mt-4 text-sm font-semibold">{text.notifications}</h4>
      <ul className="mt-2 grid gap-1 text-sm">
        {rows("notifications.rules").map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <span>{String(row.event)} → {(row.recipients as string[] | undefined)?.join(", ")}{row.stage ? ` (${String(row.stage).replace("stage:", "")})` : ""}</span>
            <button type="button" className={buttonClass} onClick={() => removeRow("notifications.rules", index)}>{text.remove}</button>
          </li>
        ))}
      </ul>

      <h4 className="mt-4 text-sm font-semibold">{text.policies}</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">{text.dueHours}<Origin origin={origin("timing.rules", "/defaultDueHours")} text={text} />
          <input type="number" min={1} max={8760} className={inputClass} value={Number((scalar("timing.rules") as Row | null)?.defaultDueHours ?? "")} onChange={(event) => setFacts((current) => ({ ...current, "timing.rules": { ...((current["timing.rules"] as Row) ?? {}), defaultDueHours: Number(event.target.value) || undefined } }))} />
        </label>
        <label className="text-sm">{text.rejection}
          <select className={inputClass} value={String((scalar("workflow.rejection_policy") as Row | null)?.action ?? "return_for_correction")} onChange={(event) => setFacts((current) => ({ ...current, "workflow.rejection_policy": { action: event.target.value } }))}>
            {rejectionActions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <label className="text-sm">{text.retention}
          <input className={inputClass} value={String((scalar("governance.retention") as Row | null)?.period ?? "")} onChange={(event) => setFacts((current) => ({ ...current, "governance.retention": { period: event.target.value } }))} />
        </label>
      </div>

      <h4 className="mt-4 text-sm font-semibold">{text.held}</h4>
      {proposal.held.length === 0 ? <p className="mt-1 text-sm">{text.noHeld}</p> : (
        <ul className="mt-2 grid gap-2">
          {proposal.held.map((item, index) => (
            <li key={index} className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950 dark:bg-neutral-800 dark:text-white">
              <p>{text[`hold${item.reason.charAt(0).toUpperCase()}${item.reason.slice(1)}`] ?? item.reason}</p>
              <p className="mt-1 text-xs opacity-80">“{item.quote}”</p>
              {item.reason === "conditional_rule" && item.suggestion ? <button type="button" className={`${buttonClass} mt-2`} onClick={() => applySuggestion(item.suggestion)}>{text.applySuggestion}</button> : null}
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className={primaryButtonClass} disabled={busy !== ""} onClick={() => void confirmAndCreate()}>
          <Sparkles aria-hidden="true" size={14} className="mr-1 inline" />{busy === "create" ? text.creating : text.confirm}
        </button>
        <button type="button" className={buttonClass} disabled={busy !== ""} onClick={reset}>{text.back}</button>
      </div>
    </section>
  );
}
