import type { TemplateCopilotFactId, TemplateCopilotFactStatus, TemplateCopilotV2Ledger } from "./template-copilot-facts.ts";

type Locale = "en" | "zh-Hant" | "zh-Hans";
export type TemplateCopilotV2MapRow = Readonly<{ factId: TemplateCopilotFactId; label: string; value: string; state: TemplateCopilotFactStatus; stateLabel: string; provenance: string; impact: string; downstream: string; dependentFactIds: readonly TemplateCopilotFactId[]; editor: "text" | "json" }>;
export type TemplateCopilotV2MapSection = Readonly<{ id: string; label: string; rows: readonly TemplateCopilotV2MapRow[] }>;
export type TemplateCopilotV2Map = Readonly<{ sections: readonly TemplateCopilotV2MapSection[]; readiness: string; unresolvedCount: number }>;

const groups: readonly Readonly<{ id: string; facts: readonly TemplateCopilotFactId[]; en: string; hant: string; hans: string }>[] = [
  { id: "purpose", facts: ["workflow.name", "workflow.purpose", "workflow.scope", "request.initiator_policy"], en: "Purpose and who can start", hant: "目的與發起人", hans: "目的与发起人" },
  { id: "information", facts: ["request.fields", "attachments.requirements"], en: "Information and documents", hant: "資料與文件", hans: "信息与文件" },
  { id: "routing", facts: ["workflow.stages", "workflow.conditions", "workflow.rejection_policy"], en: "Steps, people, and conditions", hant: "步驟、處理人與條件", hans: "步骤、处理人与条件" },
  { id: "operations", facts: ["collaboration.policy", "timing.rules", "visibility.policy", "notifications.rules"], en: "Corrections, timing, and notifications", hant: "更正、時限與通知", hans: "更正、时限与通知" },
  { id: "governance", facts: ["governance.owner", "governance.policies", "governance.retention"], en: "Ownership and record keeping", hant: "負責與保存", hans: "负责与保存" },
];
const factIds: readonly TemplateCopilotFactId[] = groups.flatMap((group) => group.facts);
const dependsOn: Readonly<Record<TemplateCopilotFactId, readonly TemplateCopilotFactId[]>> = {
  "workflow.name": [], "workflow.purpose": [], "workflow.scope": ["workflow.purpose"], "request.initiator_policy": [], "request.fields": ["request.initiator_policy"], "attachments.requirements": ["request.fields"], "workflow.stages": ["request.initiator_policy"], "workflow.conditions": ["workflow.stages", "request.fields"], "workflow.rejection_policy": ["workflow.stages"], "collaboration.policy": ["workflow.stages"], "timing.rules": ["workflow.stages"], "visibility.policy": ["workflow.stages"], "notifications.rules": ["visibility.policy"], "governance.owner": [], "governance.policies": [], "governance.retention": [],
};
const textFacts = new Set<TemplateCopilotFactId>(["workflow.name", "workflow.purpose", "governance.owner"]);

const labels: Record<TemplateCopilotFactId, readonly [string, string, string]> = {
  "workflow.name": ["Workflow name", "流程名稱", "流程名称"], "workflow.purpose": ["Purpose", "目的", "目的"], "workflow.scope": ["Included and excluded requests", "適用與不適用申請", "适用与不适用申请"], "request.initiator_policy": ["Who can start", "誰可發起", "谁可发起"], "request.fields": ["Information to collect", "要收集的資料", "要收集的信息"], "attachments.requirements": ["Required documents", "所需文件", "所需文件"], "workflow.stages": ["Ordered or simultaneous steps and people", "順序／同時步驟及處理人", "顺序／同时步骤及处理人"], "workflow.conditions": ["If–then routing", "如果／則路由", "如果／则路由"], "workflow.rejection_policy": ["Rejection and correction", "拒絕與更正", "拒绝与更正"], "collaboration.policy": ["Correction collaboration", "更正協作", "更正协作"], "timing.rules": ["Timing and late actions", "時限與逾期處理", "时限与逾期处理"], "visibility.policy": ["Who can view", "誰可查看", "谁可查看"], "notifications.rules": ["Notifications", "通知", "通知"], "governance.owner": ["Owning department", "負責部門", "负责部门"], "governance.policies": ["Policies and review", "政策與審閱", "政策与审核"], "governance.retention": ["Record retention", "記錄保存", "记录保存"],
};

function pick(values: readonly [string, string, string], locale: Locale) { return values[locale === "en" ? 0 : locale === "zh-Hant" ? 1 : 2]; }
function stringify(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(stringify).join("; ");
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  if (Array.isArray(object.rules)) return [object.description, ...object.rules.map(stringify)].filter(Boolean).join("; ");
  if (Array.isArray(object.recipients)) return `${object.event}: ${object.recipients.join(", ")} (${object.channel})`;
  if ("label" in object) return [object.label, "participant" in object ? stringify(object.participant) : "", "sequence" in object ? `#${object.sequence}` : ""].filter(Boolean).join(" · ");
  if ("mode" in object) return [object.mode, object.value].filter(Boolean).join(": ");
  if ("field" in object && "matchingRoute" in object) return `If ${object.field} ${object.operator} ${object.value}, then ${object.matchingRoute}; otherwise ${object.otherwiseRoute}.`;
  return Object.entries(object).map(([key, child]) => `${key}: ${stringify(child)}`).join("; ");
}

function stateCopy(state: TemplateCopilotFactStatus, locale: Locale) {
  const copy: Record<TemplateCopilotFactStatus, readonly [string, string, string]> = { committed: ["Saved", "已儲存", "已保存"], candidate: ["Suggested — needs confirmation", "建議 — 需確認", "建议 — 需确认"], conflicting: ["Conflicting — choose a value", "有衝突 — 請選擇", "有冲突 — 请选择"], unresolved: ["Still needed", "仍需回答", "仍需回答"], unknown: ["Assumed / not sure", "假設／未能確定", "假设／暂不确定"], not_applicable: ["Not applicable", "不適用", "不适用"] };
  return pick(copy[state], locale);
}
function mapCopy(locale: Locale) {
  return locale === "zh-Hant"
    ? { blocks: "阻礙可用性", clear: "不會阻礙", downstream: "下游事實", noDownstream: "沒有下游事實", human: "人員", none: "無來源" }
    : locale === "zh-Hans"
      ? { blocks: "阻碍可用性", clear: "不会阻碍", downstream: "下游事实", noDownstream: "没有下游事实", human: "人员", none: "无来源" }
      : { blocks: "blocks readiness", clear: "does not block", downstream: "downstream facts", noDownstream: "no downstream facts", human: "human", none: "no source" };
}
function dependentsOf(factId: TemplateCopilotFactId) {
  const result = new Set<TemplateCopilotFactId>(); let changed = true;
  while (changed) { changed = false; for (const candidate of factIds) if (!result.has(candidate) && dependsOn[candidate].some((input) => input === factId || result.has(input))) { result.add(candidate); changed = true; } }
  return factIds.filter((candidate) => result.has(candidate));
}
export function templateCopilotV2MapEditorKind(factId: TemplateCopilotFactId) { return textFacts.has(factId) ? "text" as const : "json" as const; }

/** Pure, deterministic map of the persisted v2 ledger. It deliberately
 * contains no interview draft, model text, or client-only inferred values. */
export function projectTemplateCopilotV2Map(ledger: TemplateCopilotV2Ledger): TemplateCopilotV2Map {
  const locale = ledger.locale as Locale;
  const copy = mapCopy(locale);
  // Keep this client-rendered projection free of server-only ledger helpers.
  // The authoritative server retains full readiness enforcement; here we
  // expose each persisted fact's direct downstream dependency impact.
  const impactByFact = new Map<TemplateCopilotFactId, string>();
  for (const group of groups) for (const factId of group.facts) {
    const fact = ledger.facts[factId];
    if (fact.status !== "committed" && fact.status !== "not_applicable") impactByFact.set(factId, copy.blocks);
  }
  const sections = groups.map((group) => Object.freeze({ id: group.id, label: pick([group.en, group.hant, group.hans], locale), rows: Object.freeze(group.facts.map((factId) => {
    const fact = ledger.facts[factId];
    const value = fact.status === "not_applicable" ? fact.notApplicableReason || "" : stringify(fact.canonicalValue);
    const provenance = fact.provenance.map((item) => item.kind === "human_editor" ? copy.human : item.kind).join(", ");
    const dependentFactIds = dependentsOf(factId);
    const impact = impactByFact.get(factId) || (fact.status === "committed" || fact.status === "not_applicable" ? copy.clear : copy.blocks);
    const downstream = dependentFactIds.length ? `${copy.downstream}: ${dependentFactIds.join(", ")}` : copy.noDownstream;
    return Object.freeze({ factId, label: pick(labels[factId], locale), value: value || stateCopy(fact.status, locale), state: fact.status, stateLabel: stateCopy(fact.status, locale), provenance: provenance || copy.none, impact, downstream, dependentFactIds: Object.freeze(dependentFactIds), editor: templateCopilotV2MapEditorKind(factId) });
  })) }));
  const unresolvedCount = factIds.filter((id) => !["committed", "not_applicable"].includes(ledger.facts[id].status)).length;
  return Object.freeze({ sections: Object.freeze(sections), readiness: unresolvedCount ? "not_ready" : "ready", unresolvedCount });
}
