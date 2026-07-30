import { createHash } from "node:crypto";
import { z } from "zod";
import {
  templateCopilotFactEntrySchema,
  templateCopilotFactIds,
  templateCopilotCommittedValueSchemas,
  templateCopilotV2LedgerSchema,
  TemplateCopilotFactTransitionError,
  type TemplateCopilotFactEntry,
  type TemplateCopilotFactId,
  type TemplateCopilotV2ExtractionEvidence,
  type TemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";
import { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";

/**
 * The extractor is deliberately constrained to a source-backed, typed value.
 * Each value must pass the same strict per-fact schema as a committed fact.
 */
const candidateText = z.string().trim().min(1).superRefine((value, context) => {
  if (templateCopilotUnicodeCodePointCount(value) > 8_000) {
    context.addIssue({ code: "custom", message: "Candidate text exceeds 8000 Unicode code points." });
  }
});
const messageId = z.string().trim().min(1).max(128);
// Describe-everything accepts a bounded 80k-code-point source.  Candidate
// wording remains deliberately small, but its exact quote may legitimately
// occur near the end of that durable source, so evidence coordinates must use
// the same bound rather than an unrelated 8k UI-era limit.
export const templateCopilotV2MaximumSourceCodePoints = 80_000;
const evidenceRule = z.enum(["exact", "nfkc_trim_collapse", "nfkc_trim_collapse_whitespace", "enum_lexical", "approval_word_to_kind", "ordinal_to_sequence", "array_position_to_sequence", "boolean_lexical", "named_attachment_is_required", "duration_hours"]);
export const templateCopilotV2LeafEvidenceSchema = z.object({
  path: z.string().max(256).regex(/^(?:\/$|(?:\/(?:[A-Za-z0-9_.-]|~[01])+)+$)/),
  messageId,
  startCodePoint: z.number().int().min(0).max(templateCopilotV2MaximumSourceCodePoints),
  endCodePoint: z.number().int().min(1).max(templateCopilotV2MaximumSourceCodePoints),
  exactText: candidateText,
  normalizationRule: evidenceRule.optional(),
}).strict();

type CandidateValueType = "text" | "policy" | "initiator_policy" | "fields" | "attachments" | "stages" | "conditions" | "rejection_policy" | "timing_rules" | "notifications" | "retention";
export const templateCopilotV2CandidateValueTypes: Readonly<
  Record<TemplateCopilotFactId, CandidateValueType>
> = {
  "workflow.name": "text", "workflow.purpose": "text", "workflow.scope": "policy",
  "request.initiator_policy": "initiator_policy", "request.fields": "fields", "attachments.requirements": "attachments",
  "workflow.stages": "stages", "workflow.conditions": "conditions", "workflow.rejection_policy": "rejection_policy",
  "collaboration.policy": "policy", "timing.rules": "timing_rules", "visibility.policy": "policy",
  "notifications.rules": "notifications", "governance.owner": "text", "governance.policies": "policy", "governance.retention": "retention",
};
const candidateCommonShape = {
  originalWording: candidateText.describe("A unique exact contiguous substring from the supplied employee message; the entire message is allowed."),
  evidence: z.array(templateCopilotV2LeafEvidenceSchema).min(1).max(200),
  confidence: z.enum(["low", "medium", "high"]),
  ambiguity: z.enum(["none", "possible", "ambiguous"]),
  ambiguityNote: z.string().trim().max(500).optional(),
};
function candidateVariant(factId: TemplateCopilotFactId, valueType: CandidateValueType) {
  return z.object({
    factId: z.literal(factId),
    valueType: z.literal(valueType),
    value: templateCopilotCommittedValueSchemas[factId],
    ...candidateCommonShape,
  }).strict();
}
/** Provider-facing contract: a model must choose one known fact variant, with
 * that fact's literal type tag and fully typed value. Never expose `z.json()`
 * here: it would hide the fact/value coupling from JSON Schema providers. */
export const templateCopilotV2CandidateVariants = templateCopilotFactIds.map((factId) => candidateVariant(factId, templateCopilotV2CandidateValueTypes[factId])) as [ReturnType<typeof candidateVariant>, ...ReturnType<typeof candidateVariant>[]];
export const templateCopilotV2CandidateSchema = z.discriminatedUnion("factId", templateCopilotV2CandidateVariants);

/** Minimal provider contract. Every evidence value is a quote leaf mirroring
 * the typed value tree. Coordinates, rules, source IDs, and JSON Pointers are
 * all server-derived from the single known employee message. */
const providerQuoteLeafSchema = candidateText.describe("Exact contiguous source quote for this one primitive value leaf.");
const providerPolicyEvidenceSchema = z.object({ description: providerQuoteLeafSchema, rules: z.array(providerQuoteLeafSchema).max(50) }).strict();
const providerParticipantEvidenceSchema = z.object({ mode: providerQuoteLeafSchema, value: providerQuoteLeafSchema.optional() }).strict();
const providerFieldEvidenceSchema = z.object({ label: providerQuoteLeafSchema, type: providerQuoteLeafSchema, required: providerQuoteLeafSchema, options: z.array(providerQuoteLeafSchema).max(100) }).strict();
const providerAttachmentEvidenceSchema = z.object({ label: providerQuoteLeafSchema, required: providerQuoteLeafSchema, formats: z.array(providerQuoteLeafSchema).max(4), stage: providerQuoteLeafSchema.optional() }).strict();
const providerStageEvidenceSchema = z.object({ label: providerQuoteLeafSchema, kind: providerQuoteLeafSchema, participant: providerParticipantEvidenceSchema, sequence: providerQuoteLeafSchema }).strict();
const providerConditionEvidenceSchema = z.object({ field: providerQuoteLeafSchema, operator: providerQuoteLeafSchema, value: providerQuoteLeafSchema, matchingRoute: providerQuoteLeafSchema, otherwiseRoute: providerQuoteLeafSchema }).strict();
const providerNotificationEvidenceSchema = z.object({ event: providerQuoteLeafSchema, recipients: z.array(providerQuoteLeafSchema).min(1).max(50), channel: providerQuoteLeafSchema }).strict();
const providerEvidenceTrees: Readonly<Record<TemplateCopilotFactId, z.ZodType>> = {
  "workflow.name": providerQuoteLeafSchema, "workflow.purpose": providerQuoteLeafSchema, "workflow.scope": providerPolicyEvidenceSchema,
  "request.initiator_policy": z.object({ mode: providerQuoteLeafSchema, description: providerQuoteLeafSchema }).strict(),
  "request.fields": z.array(providerFieldEvidenceSchema).min(1).max(100), "attachments.requirements": z.array(providerAttachmentEvidenceSchema).max(50),
  "workflow.stages": z.array(providerStageEvidenceSchema).min(1).max(100), "workflow.conditions": z.array(providerConditionEvidenceSchema).max(50),
  "workflow.rejection_policy": z.object({ action: providerQuoteLeafSchema, route: providerQuoteLeafSchema.optional() }).strict(),
  "collaboration.policy": providerPolicyEvidenceSchema,
  "timing.rules": z.object({ defaultDueHours: providerQuoteLeafSchema.optional(), escalation: providerPolicyEvidenceSchema.optional() }).strict(),
  "visibility.policy": providerPolicyEvidenceSchema,
  "notifications.rules": z.array(providerNotificationEvidenceSchema).max(100), "governance.owner": providerQuoteLeafSchema,
  "governance.policies": z.array(providerQuoteLeafSchema).max(50), "governance.retention": z.object({ period: providerQuoteLeafSchema, rationale: providerQuoteLeafSchema.optional() }).strict(),
};
const providerCandidateCommonShape = {
  confidence: z.enum(["low", "medium", "high"]),
  ambiguity: z.enum(["none", "possible", "ambiguous"]),
  ambiguityNote: z.string().trim().max(500).optional(),
};
function providerCandidateVariant(factId: TemplateCopilotFactId, valueType: CandidateValueType) {
  return z.object({
    factId: z.literal(factId), valueType: z.literal(valueType), value: templateCopilotCommittedValueSchemas[factId], ...providerCandidateCommonShape, evidence: providerEvidenceTrees[factId],
  }).strict();
}
export const templateCopilotV2ProviderCandidateVariants = templateCopilotFactIds.map((factId) => providerCandidateVariant(factId, templateCopilotV2CandidateValueTypes[factId])) as [ReturnType<typeof providerCandidateVariant>, ...ReturnType<typeof providerCandidateVariant>[]];
export const templateCopilotV2ProviderCandidateSchema = z.discriminatedUnion("factId", templateCopilotV2ProviderCandidateVariants);
export const templateCopilotV2ProviderCandidateOutputSchema = z.object({
  candidates: z.array(templateCopilotV2ProviderCandidateSchema).max(templateCopilotFactIds.length),
}).strict().describe("Sixteen fact-coupled candidate variants. Evidence is a fact-specific quote tree mirroring every primitive value leaf. The server derives paths, source coordinates, and normalization rules.");

export const templateCopilotV2CandidateOutputSchema = z.object({
  candidates: z.array(templateCopilotV2CandidateSchema).max(templateCopilotFactIds.length),
}).strict();

export type TemplateCopilotV2Candidate = z.infer<typeof templateCopilotV2CandidateSchema>;
export type TemplateCopilotV2CandidateOutput = z.infer<typeof templateCopilotV2CandidateOutputSchema>;
export type TemplateCopilotV2ProviderCandidate = z.infer<typeof templateCopilotV2ProviderCandidateSchema>;

export type TemplateCopilotV2CandidateConflict = Readonly<{
  factId: TemplateCopilotFactId;
  kind: "committed_difference" | "candidate_difference";
  existing: Readonly<{ value: unknown; provenance: TemplateCopilotFactEntry["provenance"]; confirmation?: TemplateCopilotFactEntry["confirmation"] }>;
  incoming: TemplateCopilotV2Candidate;
}>;

export type TemplateCopilotV2CandidateRejection = Readonly<{
  code: "model_schema_invalid" | "untraceable" | "overlapping_span";
  detail: string;
}>;

export type TemplateCopilotV2CandidateNormalization = Readonly<{
  candidates: readonly TemplateCopilotV2Candidate[];
  rejected: readonly TemplateCopilotV2CandidateRejection[];
}>;

/** Locale-independent semantic key. It is used only for equality/deduping;
 * the exact source wording is kept separately and is never locale-folded. */
export function canonicalCandidateText(input: string) {
  return input.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function normalizeTypedValue(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (Array.isArray(value)) return value.map(normalizeTypedValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, normalizeTypedValue((value as Record<string, unknown>)[key])]));
  return value;
}
function normalizeCandidateFactValue(factId: TemplateCopilotFactId, value: unknown) {
  // This value and its evidence share positional JSON-Pointer paths. Keep
  // array order intact: changing it before evidence validation would make a
  // quote for /0/formats/0 attest to a different stored value.
  void factId;
  return normalizeTypedValue(value);
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
function canonicalCandidateValue(value: unknown) { return stableJson(normalizeTypedValue(value)); }
/** Semantic set equality is fact-specific, but it must never rewrite the
 * evidence-bound value persisted for a candidate. This key is used only for
 * equality, deduping, and deterministic ordering. */
function canonicalFactAwareCandidateValue(factId: TemplateCopilotFactId, value: unknown) {
  const normalized = normalizeTypedValue(value);
  if (factId === "attachments.requirements" && Array.isArray(normalized)) {
    const attachments = normalized.map((item) => item && typeof item === "object"
      ? { ...(item as Record<string, unknown>), formats: Array.isArray((item as Record<string, unknown>).formats) ? [...new Set((item as Record<string, unknown>).formats as string[])].sort() : (item as Record<string, unknown>).formats }
      : item);
    return canonicalCandidateValue([...attachments].sort((left, right) => canonicalCandidateValue(left).localeCompare(canonicalCandidateValue(right))));
  }
  if (factId === "governance.policies" && Array.isArray(normalized)) {
    return stableJson([...new Set(normalized.map((item) => canonicalCandidateText(String(item))))].sort());
  }
  return canonicalCandidateValue(normalized);
}

function candidateOrder(left: TemplateCopilotV2Candidate, right: TemplateCopilotV2Candidate) {
  return left.factId.localeCompare(right.factId)
    || canonicalFactAwareCandidateValue(left.factId, left.value).localeCompare(canonicalFactAwareCandidateValue(right.factId, right.value))
    || evidenceKey(left.evidence).localeCompare(evidenceKey(right.evidence))
    || left.originalWording.localeCompare(right.originalWording);
}
function evidenceOrder(left: z.infer<typeof templateCopilotV2LeafEvidenceSchema>, right: z.infer<typeof templateCopilotV2LeafEvidenceSchema>) {
  return left.path.localeCompare(right.path) || left.messageId.localeCompare(right.messageId) || left.startCodePoint - right.startCodePoint || left.endCodePoint - right.endCodePoint || left.exactText.localeCompare(right.exactText) || (left.normalizationRule || "exact").localeCompare(right.normalizationRule || "exact");
}
function sortedEvidence(evidence: readonly z.infer<typeof templateCopilotV2LeafEvidenceSchema>[]) { return [...evidence].sort(evidenceOrder); }
function evidenceKey(evidence: readonly z.infer<typeof templateCopilotV2LeafEvidenceSchema>[]) { return stableJson(sortedEvidence(evidence)); }
export function templateCopilotV2PrimitiveLeafPaths(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [path || "/"];
  if (Array.isArray(value)) return value.flatMap((item, index) => templateCopilotV2PrimitiveLeafPaths(item, `${path}/${index}`));
  return Object.keys(value as Record<string, unknown>).sort().flatMap((key) => templateCopilotV2PrimitiveLeafPaths((value as Record<string, unknown>)[key], `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`));
}

function spanText(message: string, startCodePoint: number, endCodePoint: number) {
  return Array.from(message).slice(startCodePoint, endCodePoint).join("");
}
function pointerValue(value: unknown, path: string): unknown {
  return path === "/" ? value : path.slice(1).split("/").reduce<unknown>((current, rawSegment) => {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    return current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : undefined;
  }, value);
}
const lexicalAliases: Readonly<Record<string, readonly string[]>> = Object.freeze({
  approval: ["approval", "approve", "審批", "审批", "核准", "批准"],
  review: ["review", "審核", "审核", "覆核"],
  for_information: ["for information", "informational", "知會", "知会", "供參考", "供参考"],
  submission: ["submission", "submit", "提交", "呈交"],
  any_employee: ["any employee", "employee", "所有員工", "所有员工"],
  directory_role: ["directory role", "目錄角色", "目录角色"],
  requester_selected: ["requester selected", "selected by requester", "申請人選擇", "申请人选择"],
  fixed_email: ["fixed email", "固定電郵", "固定电子邮件", "固定電子郵件"],
  directory_position: ["directory position", "目錄職位", "目录职位"],
  request_field: ["request field", "申請欄位", "申请字段"],
  requester: ["requester", "申請人", "申请人"],
  unassigned_at_template: ["unassigned", "範本未指派", "模板未分配"],
  text: ["text", "文字", "文本"], long_text: ["long text", "長文字", "长文本"], number: ["number", "數字", "数字"],
  date: ["date", "日期"], currency: ["currency", "貨幣", "货币"], email: ["email", "電郵", "电子邮件"],
  select: ["select", "dropdown", "下拉選單", "下拉菜单"], radio: ["radio", "single choice", "單選", "单选"],
  checkbox: ["checkbox", "多選", "多选"], table: ["table", "表格"],
  pdf: ["pdf"], image: ["image", "圖片", "图片"], excel_csv: ["excel csv", "excel/csv", "excel", "csv"],
  "=": ["=", "equals", "equal", "等於", "等于"], "!=": ["!=", "not equal", "不等於", "不等于"],
  ">": [">", "greater than", "大於", "大于"], ">=": [">=", "at least", "大於或等於", "大于或等于"],
  "<": ["<", "less than", "小於", "小于"], "<=": ["<=", "at most", "小於或等於", "小于或等于"], contains: ["contains", "包含"],
  return_for_correction: ["return for correction", "退回更正", "退回更正"], close: ["close", "關閉", "关闭"], route_to_stage: ["route to stage", "轉送階段", "转送阶段"],
  in_app: ["in app", "in-app", "應用程式內", "应用内"],
});
const ordinalAliases: Readonly<Record<number, readonly string[]>> = Object.freeze({
  1: ["1", "first", "第一", "一"], 2: ["2", "second", "第二", "二"], 3: ["3", "third", "第三", "三"],
  4: ["4", "fourth", "第四", "四"], 5: ["5", "fifth", "第五", "五"],
});
function hasLexicalAlias(value: string, wording: string) { return lexicalAliases[value]?.includes(wording) || false; }
function isEnumLeaf(factId: TemplateCopilotFactId, path: string) {
  return (factId === "request.initiator_policy" && path === "/mode")
    || (factId === "request.fields" && /^\/\d+\/type$/.test(path))
    || (factId === "attachments.requirements" && /^\/\d+\/formats\/\d+$/.test(path))
    || (factId === "workflow.stages" && (/^\/\d+\/kind$/.test(path) || /^\/\d+\/participant\/mode$/.test(path)))
    || (factId === "workflow.conditions" && /^\/\d+\/operator$/.test(path))
    || (factId === "workflow.rejection_policy" && path === "/action")
    || (factId === "notifications.rules" && /^\/\d+\/channel$/.test(path));
}
function evidenceDerives(candidate: TemplateCopilotV2Candidate, item: z.infer<typeof templateCopilotV2LeafEvidenceSchema>) {
  const value = pointerValue(candidate.value, item.path);
  const rule = item.normalizationRule || "exact";
  const wording = canonicalCandidateText(item.exactText);
  if (rule === "exact") return typeof value === "string" ? value === item.exactText : item.exactText === String(value);
  if (rule === "nfkc_trim_collapse" || rule === "nfkc_trim_collapse_whitespace") return typeof value === "string" && value === item.exactText.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (rule === "enum_lexical") return typeof value === "string" && isEnumLeaf(candidate.factId, item.path) && hasLexicalAlias(value, wording);
  if (rule === "approval_word_to_kind") return candidate.factId === "workflow.stages" && /^\/\d+\/kind$/.test(item.path) && typeof value === "string" && hasLexicalAlias(value, wording);
  if (rule === "ordinal_to_sequence" || rule === "array_position_to_sequence") {
    return candidate.factId === "workflow.stages" && /^\/\d+\/sequence$/.test(item.path) && typeof value === "number" && ordinalAliases[value]?.includes(wording) === true;
  }
  if (rule === "duration_hours") return candidate.factId === "timing.rules" && item.path === "/defaultDueHours" && typeof value === "number" && [String(value), `${value} hour`, `${value} hours`, `${value} 小時`, `${value} 小时`].includes(wording);
  if (rule === "boolean_lexical") return (candidate.factId === "request.fields" || candidate.factId === "attachments.requirements") && /^\/\d+\/required$/.test(item.path) && typeof value === "boolean" && (value ? ["true", "yes", "required", "是", "需要", "必須", "必须"].includes(wording) : ["false", "no", "not required", "否", "不需要", "非必須", "非必须"].includes(wording));
  if (rule === "named_attachment_is_required") {
    return candidate.factId === "attachments.requirements" && /^\/\d+\/required$/.test(item.path) && value === true && ["required", "mandatory", "must", "必須", "必须"].includes(wording);
  }
  return false;
}

/**
 * Validates hostile provider output against the exact source message. Unknown
 * fields/IDs/types invalidate the entire provider response; invalid spans are
 * never made into candidates. The result is stable across model array order.
 */
export function normalizeTemplateCopilotV2Candidates({ output, messages }: {
  output: unknown;
  messages: Readonly<Record<string, string>>;
}): TemplateCopilotV2CandidateNormalization {
  const parsed = templateCopilotV2CandidateOutputSchema.safeParse(output);
  if (!parsed.success) {
    return Object.freeze({ candidates: Object.freeze([]), rejected: Object.freeze([{
      code: "model_schema_invalid" as const,
      detail: parsed.error.issues.slice(0, 12).map((issue) => issue.path.join(".") || "$").join("|"),
    }]) });
  }
  const rejected: TemplateCopilotV2CandidateRejection[] = [];
  const valid: TemplateCopilotV2Candidate[] = [];
  const usedSpans = new Map<string, Array<{ start: number; end: number }>>();
  for (const suppliedCandidate of [...parsed.data.candidates].sort(candidateOrder)) {
    const candidate = { ...suppliedCandidate, value: normalizeCandidateFactValue(suppliedCandidate.factId, suppliedCandidate.value) } as TemplateCopilotV2Candidate;
    const leaves = [...new Set(templateCopilotV2PrimitiveLeafPaths(candidate.value))].sort();
    const paths = candidate.evidence.map((item) => item.path).sort();
    const hasUniqueEvidencePaths = new Set(paths).size === paths.length;
    const wordingBacked = candidate.evidence.some((item) => typeof messages[item.messageId] === "string" && messages[item.messageId].includes(candidate.originalWording));
    const evidenceValid = wordingBacked && hasUniqueEvidencePaths && leaves.length === paths.length && leaves.every((path, index) => path === paths[index]) && candidate.evidence.every((item) => {
      const source = messages[item.messageId];
      return typeof source === "string" && item.endCodePoint > item.startCodePoint && item.endCodePoint <= templateCopilotUnicodeCodePointCount(source) && spanText(source, item.startCodePoint, item.endCodePoint) === item.exactText && evidenceDerives(candidate, item);
    });
    if (!evidenceValid) {
      rejected.push({ code: "untraceable", detail: `${candidate.factId}:${candidate.evidence[0]?.messageId || "missing"}` });
      continue;
    }
    const orderedEvidence = sortedEvidence(candidate.evidence);
    const overlapsWithinCandidate = orderedEvidence.some((item, index) => orderedEvidence.slice(index + 1).some((other) => item.messageId === other.messageId && item.startCodePoint < other.endCodePoint && other.startCodePoint < item.endCodePoint));
    const overlapping = overlapsWithinCandidate || candidate.evidence.some((item) => {
      const spans = usedSpans.get(item.messageId) || [];
      return spans.some((span) => item.startCodePoint < span.end && span.start < item.endCodePoint);
    });
    if (overlapping) {
      rejected.push({ code: "overlapping_span", detail: `${candidate.factId}:${candidate.evidence[0]?.messageId || "missing"}` });
      continue;
    }
    const equivalent = valid.find((existing) => existing.factId === candidate.factId
      && canonicalFactAwareCandidateValue(existing.factId, existing.value) === canonicalFactAwareCandidateValue(candidate.factId, candidate.value));
    if (!equivalent) {
      valid.push(candidate);
      for (const item of candidate.evidence) { const spans = usedSpans.get(item.messageId) || []; spans.push({ start: item.startCodePoint, end: item.endCodePoint }); usedSpans.set(item.messageId, spans); }
    }
  }
  return Object.freeze({ candidates: Object.freeze(valid.sort(candidateOrder)), rejected: Object.freeze(rejected.sort((a, b) => `${a.code}:${a.detail}`.localeCompare(`${b.code}:${b.detail}`))) });
}

const derivedEvidenceRules = [undefined, "nfkc_trim_collapse", "nfkc_trim_collapse_whitespace", "enum_lexical", "approval_word_to_kind", "ordinal_to_sequence", "array_position_to_sequence", "boolean_lexical", "named_attachment_is_required", "duration_hours"] as const;
function providerFailure(code: TemplateCopilotV2CandidateRejection["code"], detail: string): TemplateCopilotV2CandidateNormalization {
  return Object.freeze({ candidates: Object.freeze([]), rejected: Object.freeze([{ code, detail }]) });
}
function allSubstringOffsets(text: string, quote: string) {
  const offsets: number[] = [];
  for (let offset = text.indexOf(quote); offset >= 0; offset = text.indexOf(quote, offset + 1)) offsets.push(offset);
  return offsets;
}
function providerQuoteLeaves(value: unknown, evidence: unknown, path = ""): Array<{ path: string; exactText: string }> | null {
  if (value === null || typeof value !== "object") return typeof evidence === "string" ? [{ path: path || "/", exactText: evidence }] : null;
  if (Array.isArray(value)) {
    if (!Array.isArray(evidence) || evidence.length !== value.length) return null;
    const leaves = value.map((item, index) => providerQuoteLeaves(item, evidence[index], `${path}/${index}`));
    return leaves.some((item) => item === null) ? null : leaves.flat() as Array<{ path: string; exactText: string }>;
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const record = value as Record<string, unknown>;
  const quotes = evidence as Record<string, unknown>;
  const valueKeys = Object.keys(record).sort();
  const quoteKeys = Object.keys(quotes).sort();
  if (valueKeys.length !== quoteKeys.length || valueKeys.some((key, index) => key !== quoteKeys[index])) return null;
  const leaves = valueKeys.map((key) => providerQuoteLeaves(record[key], quotes[key], `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`));
  return leaves.some((item) => item === null) ? null : leaves.flat() as Array<{ path: string; exactText: string }>;
}
function deriveServerEvidenceRule(candidate: TemplateCopilotV2Candidate, path: string, exactText: string) {
  const endCodePoint = templateCopilotUnicodeCodePointCount(exactText);
  for (const normalizationRule of derivedEvidenceRules) {
    const item = { path, messageId: "server-derived", startCodePoint: 0, endCodePoint, exactText, ...(normalizationRule ? { normalizationRule } : {}) };
    if (evidenceDerives(candidate, item)) return normalizationRule;
  }
  return null;
}

/** Shared server-side rule derivation for provider contract adapters. The
 * provider supplies quotes and canonical values only; it cannot select a
 * normalization rule or evidence coordinate. */
export function deriveTemplateCopilotV2ServerEvidenceRule({
  factId,
  value,
  path,
  exactText,
}: {
  factId: TemplateCopilotFactId;
  value: unknown;
  path: string;
  exactText: string;
}) {
  return deriveServerEvidenceRule(
    {
      factId,
      valueType: templateCopilotV2CandidateValueTypes[factId],
      value,
      originalWording: exactText,
      evidence: [],
      confidence: "medium",
      ambiguity: "none",
    } as TemplateCopilotV2Candidate,
    path,
    exactText,
  );
}

/** Converts the deliberately coordinate-free provider response into the full
 * durable evidence envelope. The only source is the known current message;
 * every offset and every non-exact rule is derived here, then the existing
 * hostile-output normalizer validates the result a second time. */
export function adaptTemplateCopilotV2ProviderCandidates({ output, message, messageId }: {
  output: unknown; message: string; messageId: string;
}): TemplateCopilotV2CandidateNormalization {
  const parsed = templateCopilotV2ProviderCandidateOutputSchema.safeParse(output);
  if (!parsed.success) return providerFailure("model_schema_invalid", parsed.error.issues.slice(0, 12).map((issue) => issue.path.join(".") || "$").join("|"));
  const adapted: TemplateCopilotV2Candidate[] = [];
  const adapterRejected: TemplateCopilotV2CandidateRejection[] = [];
  for (const supplied of parsed.data.candidates) {
    const value = supplied.value;
    const quoteLeaves = providerQuoteLeaves(value, supplied.evidence);
    if (!quoteLeaves || quoteLeaves.length === 0) { adapterRejected.push({ code: "untraceable", detail: `${supplied.factId}:evidence_shape` }); continue; }
    const candidate = {
      factId: supplied.factId, valueType: supplied.valueType, value, originalWording: "server-derived",
      evidence: [], confidence: supplied.confidence, ambiguity: supplied.ambiguity,
      ...(supplied.ambiguityNote ? { ambiguityNote: supplied.ambiguityNote } : {}),
    } as TemplateCopilotV2Candidate;
    const leaves = [...new Set(templateCopilotV2PrimitiveLeafPaths(value))].sort();
    const quotes = [...quoteLeaves].sort((left, right) => left.path.localeCompare(right.path) || left.exactText.localeCompare(right.exactText));
    const paths = quotes.map((quote) => quote.path);
    if (new Set(paths).size !== paths.length || leaves.length !== paths.length || !leaves.every((path, index) => path === paths[index])) { adapterRejected.push({ code: "untraceable", detail: `${supplied.factId}:leaf_paths` }); continue; }
    const positions = new Map<number, number>();
    let ambiguousQuote = false;
    for (const [exactText, group] of Map.groupBy(quotes, (quote) => quote.exactText)) {
      const offsets = allSubstringOffsets(message, exactText);
      // A repeated quote is usable only when the number of source occurrences
      // exactly matches the leaf group, so path order gives one unique mapping.
      if (offsets.length !== group.length) { ambiguousQuote = true; break; }
      for (const [index, quote] of group.entries()) positions.set(quotes.indexOf(quote), offsets[index]);
    }
    if (ambiguousQuote) { adapterRejected.push({ code: "untraceable", detail: `${supplied.factId}:ambiguous_quote` }); continue; }
    const quoteOffsets = quotes.map((quote, index) => positions.get(index));
    if (quoteOffsets.some((offset) => offset === undefined)) { adapterRejected.push({ code: "untraceable", detail: `${supplied.factId}:quote_positions` }); continue; }
    const sourceStart = Math.min(...quoteOffsets as number[]);
    const sourceEnd = Math.max(...quotes.map((quote, index) => (quoteOffsets[index] as number) + quote.exactText.length));
    const originalWording = message.slice(sourceStart, sourceEnd);
    if (!candidateText.safeParse(originalWording).success) { adapterRejected.push({ code: "untraceable", detail: `${supplied.factId}:source_passage` }); continue; }
    const evidence = quotes.map((quote, index) => {
      const localOffset = positions.get(index);
      if (localOffset === undefined) return null;
      const startCodePoint = templateCopilotUnicodeCodePointCount(message.slice(0, localOffset));
      const endCodePoint = startCodePoint + templateCopilotUnicodeCodePointCount(quote.exactText);
      const normalizationRule = deriveServerEvidenceRule(candidate, quote.path, quote.exactText);
      return normalizationRule === null ? null : { path: quote.path, messageId, startCodePoint, endCodePoint, exactText: quote.exactText, ...(normalizationRule ? { normalizationRule } : {}) };
    });
    if (evidence.some((item) => item === null)) { adapterRejected.push({ code: "untraceable", detail: `${supplied.factId}:normalization` }); continue; }
    const fullEvidence = evidence as TemplateCopilotV2Candidate["evidence"];
    const overlaps = fullEvidence.some((item, index) => fullEvidence.slice(index + 1).some((other) => item.startCodePoint < other.endCodePoint && other.startCodePoint < item.endCodePoint));
    if (overlaps) { adapterRejected.push({ code: "overlapping_span", detail: `${supplied.factId}:${messageId}` }); continue; }
    adapted.push({ ...candidate, originalWording, evidence: fullEvidence });
  }
  const normalized = normalizeTemplateCopilotV2Candidates({ output: { candidates: adapted }, messages: { [messageId]: message } });
  return Object.freeze({
    candidates: normalized.candidates,
    rejected: Object.freeze([...adapterRejected, ...normalized.rejected].sort((left, right) => `${left.code}:${left.detail}`.localeCompare(`${right.code}:${right.detail}`))),
  });
}

function existingValue(entry: TemplateCopilotFactEntry) { return entry.canonicalValue; }
function sameFactAwareCandidateValue(factId: TemplateCopilotFactId, left: unknown, right: unknown) {
  return canonicalFactAwareCandidateValue(factId, left) === canonicalFactAwareCandidateValue(factId, right);
}

function candidateProvenance(candidate: TemplateCopilotV2Candidate): TemplateCopilotFactEntry["provenance"] {
  // Keep only a short source excerpt in the candidate ledger. The durable
  // message itself remains in the bounded, owner-scoped transcript.
  return [{
    kind: "message",
    sourceId: candidate.evidence[0].messageId,
    sourceMessageIds: [...new Set(candidate.evidence.map((item) => item.messageId))],
    excerpt: candidate.originalWording.slice(0, 1_000),
  }];
}

function evidence(candidate: TemplateCopilotV2Candidate): TemplateCopilotV2ExtractionEvidence["candidates"][number] {
  const value = normalizeCandidateFactValue(candidate.factId, candidate.value);
  const evidenceItems = sortedEvidence(candidate.evidence);
  const withoutId = {
    factId: candidate.factId,
    value,
    evidence: evidenceItems,
  };
  return {
    candidateId: templateCopilotV2CandidateEvidenceHash(withoutId), state: "open" as const,
    factId: candidate.factId, value: value as TemplateCopilotV2ExtractionEvidence["candidates"][number]["value"], originalWording: candidate.originalWording, evidence: evidenceItems,
    confidence: candidate.confidence, ambiguity: candidate.ambiguity,
    ...(candidate.ambiguityNote ? { ambiguityNote: candidate.ambiguityNote } : {}),
  };
}
function candidateFromEvidence(candidate: TemplateCopilotV2ExtractionEvidence["candidates"][number]): TemplateCopilotV2Candidate {
  return {
    factId: candidate.factId, valueType: templateCopilotV2CandidateValueTypes[candidate.factId], value: candidate.value,
    originalWording: candidate.originalWording, evidence: candidate.evidence, confidence: candidate.confidence,
    ambiguity: candidate.ambiguity, ...(candidate.ambiguityNote ? { ambiguityNote: candidate.ambiguityNote } : {}),
  };
}
function durableCandidateForFact(ledger: TemplateCopilotV2Ledger, factId: TemplateCopilotFactId, value: unknown) {
  return ledger.extractionEvidence.candidates.find((candidate) => candidate.factId === factId && candidate.state === "open" && sameFactAwareCandidateValue(factId, candidate.value, value));
}

/** Pure projection for the separately gated candidate-creation path. It never
 * commits, replaces a committed value, selects a question, or claims readiness.
 * Conflicts retain the old alternative and provenance as a review object. */
export function projectTemplateCopilotV2Candidates({ ledger: input, candidates }: {
  ledger: TemplateCopilotV2Ledger;
  candidates: readonly TemplateCopilotV2Candidate[];
}) {
  const ledger = templateCopilotV2LedgerSchema.parse(input);
  const facts = { ...ledger.facts };
  const extractionEvidence: TemplateCopilotV2ExtractionEvidence = {
    candidates: [...ledger.extractionEvidence.candidates],
    conflicts: [...ledger.extractionEvidence.conflicts],
    history: [...ledger.extractionEvidence.history],
  };
  const existingCandidateIds = new Set(ledger.extractionEvidence.candidates.map((candidate) => candidate.candidateId));
  const existingConflictIds = new Set(ledger.extractionEvidence.conflicts.map((conflict) => conflict.conflictId));
  const conflicts: TemplateCopilotV2CandidateConflict[] = [];
  for (const candidate of [...candidates].sort(candidateOrder)) {
    const existing = facts[candidate.factId];
    const currentValue = existingValue(existing);
    if (existing.status === "committed" || existing.status === "not_applicable") {
      if (currentValue === undefined || !sameFactAwareCandidateValue(candidate.factId, currentValue, candidate.value)) {
        const existingConflictValue = Object.freeze({ value: currentValue ?? existing.status, provenance: existing.provenance, ...(existing.confirmation ? { confirmation: existing.confirmation } : {}) });
        const incoming = evidence(candidate);
        const conflictId = templateCopilotV2CandidateEvidenceHash({ factId: candidate.factId, existing: existingConflictValue, incoming });
        conflicts.push(Object.freeze({ factId: candidate.factId, kind: "committed_difference", existing: existingConflictValue, incoming: candidate }));
        if (!extractionEvidence.conflicts.some((item) => item.conflictId === conflictId)) {
          extractionEvidence.conflicts.push({ conflictId, factId: candidate.factId, state: "open", existing: existingConflictValue, incoming });
        }
      }
      continue;
    }
    if (existing.status === "candidate" && currentValue !== undefined && !sameFactAwareCandidateValue(candidate.factId, currentValue, candidate.value)) {
      const existingCandidate = durableCandidateForFact(ledger, candidate.factId, currentValue);
      const existingConflictValue = Object.freeze({ value: currentValue, provenance: existing.provenance, ...(existing.confirmation ? { confirmation: existing.confirmation } : {}), ...(existingCandidate ? { candidate: existingCandidate } : {}) });
      const incoming = evidence(candidate);
      const conflictId = templateCopilotV2CandidateEvidenceHash({ factId: candidate.factId, existing: existingConflictValue, incoming });
      conflicts.push(Object.freeze({ factId: candidate.factId, kind: "candidate_difference", existing: existingConflictValue, incoming: candidate }));
      if (!extractionEvidence.conflicts.some((item) => item.conflictId === conflictId)) {
        extractionEvidence.conflicts.push({ conflictId, factId: candidate.factId, state: "open", existing: existingConflictValue, incoming });
      }
      continue;
    }
    if (existing.status === "candidate") continue;
    facts[candidate.factId] = templateCopilotFactEntrySchema.parse({
      ...existing,
      status: "candidate",
      canonicalValue: candidate.value,
      originalWording: candidate.originalWording,
      locale: ledger.locale,
      provenance: candidateProvenance(candidate),
    });
    const nextEvidence = evidence(candidate);
    if (!extractionEvidence.candidates.some((item) => templateCopilotV2CandidateEvidenceHash(item) === templateCopilotV2CandidateEvidenceHash(nextEvidence))) extractionEvidence.candidates.push(nextEvidence);
  }
  return Object.freeze({
    // SQL treats prior durable arrays as immutable prefixes. Preserve them in
    // insertion order and sort only this projection's appended entries.
    ledger: templateCopilotV2LedgerSchema.parse({ ...ledger, facts, extractionEvidence: {
      candidates: [...ledger.extractionEvidence.candidates, ...extractionEvidence.candidates.filter((candidate) => !existingCandidateIds.has(candidate.candidateId)).sort((a, b) => a.factId.localeCompare(b.factId) || a.candidateId.localeCompare(b.candidateId))],
      conflicts: [...ledger.extractionEvidence.conflicts, ...extractionEvidence.conflicts.filter((conflict) => !existingConflictIds.has(conflict.conflictId)).sort((a, b) => a.conflictId.localeCompare(b.conflictId))],
      history: extractionEvidence.history,
    } }),
    conflicts: Object.freeze(conflicts.sort((a, b) => a.factId.localeCompare(b.factId) || a.kind.localeCompare(b.kind))),
  });
}

/** Explicit human conflict decision for a committed fact. The caller supplies
 * the typed, reviewable value; advisory model confidence is intentionally not
 * accepted as authority. The previous committed alternative stays in the
 * operation audit and is removed from the open-conflict queue only here. */
export function resolveTemplateCopilotV2CommittedExtractionConflict({
  ledger: input, conflictId, resolution, humanValue, actorId, confirmedAt, beforeRevision = 1, rationale,
}: {
  ledger: TemplateCopilotV2Ledger;
  conflictId: string;
  resolution: "keep_existing" | "commit_incoming" | "commit_human_value";
  humanValue?: unknown;
  rationale?: string;
  actorId: string;
  confirmedAt: string;
  beforeRevision?: number;
}) {
  const ledger = templateCopilotV2LedgerSchema.parse(input);
  const conflict = ledger.extractionEvidence.conflicts.find((item) => item.conflictId === conflictId);
  if (!conflict || conflict.state !== "open") throw new TemplateCopilotFactTransitionError("The extraction conflict is no longer available.");
  const facts = { ...ledger.facts };
  const before = { value: conflict.existing.value, provenance: conflict.existing.provenance, ...(conflict.existing.confirmation ? { confirmation: conflict.existing.confirmation } : {}) };
  if (resolution === "keep_existing" && facts[conflict.factId].status === "candidate") {
    const existingCandidate = conflict.existing.candidate;
    facts[conflict.factId] = templateCopilotFactEntrySchema.parse({
      ...facts[conflict.factId], status: "committed", canonicalValue: conflict.existing.value,
      originalWording: existingCandidate?.originalWording || facts[conflict.factId].originalWording,
      provenance: conflict.existing.provenance,
      confirmation: { actorId, confirmedAt, operation: "human_resolve_conflict" },
    });
  }
  if (resolution === "commit_incoming") {
    // The candidate wording is only acceptable where it satisfies this fact's
    // existing committed schema; otherwise the request fails closed.
    facts[conflict.factId] = templateCopilotFactEntrySchema.parse({
      ...facts[conflict.factId],
      status: "committed",
      canonicalValue: conflict.incoming.value,
      originalWording: conflict.incoming.originalWording,
      provenance: candidateProvenance(candidateFromEvidence(conflict.incoming)),
      confirmation: { actorId, confirmedAt, operation: "human_resolve_conflict" },
    });
  }
  let checkedHumanValue: unknown;
  if (resolution === "commit_human_value") {
    if (humanValue === undefined) throw new TemplateCopilotFactTransitionError("A typed human value is required to resolve this conflict.");
    try {
      checkedHumanValue = templateCopilotCommittedValueSchemas[conflict.factId].parse(humanValue);
    } catch (error) {
      if (error instanceof z.ZodError) throw new TemplateCopilotFactTransitionError("The human value is invalid for this fact.");
      throw error;
    }
    const humanFact = { ...facts[conflict.factId] };
    Reflect.deleteProperty(humanFact, "originalWording");
    facts[conflict.factId] = templateCopilotFactEntrySchema.parse({
      ...humanFact, status: "committed", canonicalValue: checkedHumanValue,
      provenance: [{ kind: "human_editor", sourceId: `conflict:${conflictId}`, sourceMessageIds: [] }],
      confirmation: { actorId, confirmedAt, operation: "human_resolve_conflict" },
    });
  }
  const choice = resolution === "keep_existing" ? "keep_existing" as const : resolution === "commit_incoming" ? "commit_incoming" as const : "commit_human_value" as const;
  const history = {
    historyId: templateCopilotV2CandidateEvidenceHash({ conflictId, choice, before, incoming: conflict.incoming, humanValue: checkedHumanValue, actorId, confirmedAt, beforeRevision }),
    kind: "conflict_resolved" as const, factId: conflict.factId, conflictId, before,
    ...(conflict.existing.candidate ? { existingCandidate: conflict.existing.candidate } : {}),
    incoming: conflict.incoming, choice, ...(resolution === "commit_human_value" ? { humanValue: checkedHumanValue } : {}), ...(rationale ? { rationale } : {}), actorId, confirmedAt, beforeRevision, afterRevision: beforeRevision + 1,
  };
  return templateCopilotV2LedgerSchema.parse({
    ...ledger,
    facts,
    extractionEvidence: {
      ...ledger.extractionEvidence,
      conflicts: ledger.extractionEvidence.conflicts.map((item) => item.conflictId === conflictId ? { ...item, state: "closed" as const } : item),
      history: [...ledger.extractionEvidence.history, history],
    },
  });
}

/** Evidence-bound confirmation: callers name only the durable candidate ID;
 * the exact typed value and provenance are loaded from the authoritative ledger. */
export function confirmTemplateCopilotV2Candidate({ ledger: input, candidateId, actorId, confirmedAt, beforeRevision = 1 }: {
  ledger: TemplateCopilotV2Ledger; candidateId: string; actorId: string; confirmedAt: string; beforeRevision?: number;
}) {
  const ledger = templateCopilotV2LedgerSchema.parse(input);
  const candidate = ledger.extractionEvidence.candidates.find((item) => item.candidateId === candidateId && item.state === "open");
  if (!candidate) throw new TemplateCopilotFactTransitionError("The extraction candidate is no longer available.");
  if (candidate.ambiguity !== "none") throw new TemplateCopilotFactTransitionError("Ambiguous extraction candidates require an explicit conflict resolution.");
  if (ledger.extractionEvidence.conflicts.some((conflict) => conflict.factId === candidate.factId && conflict.state === "open")) throw new TemplateCopilotFactTransitionError("An open extraction conflict must be resolved before confirmation.");
  const fact = ledger.facts[candidate.factId];
  if (fact.status !== "candidate" || !sameFactAwareCandidateValue(candidate.factId, fact.canonicalValue, candidate.value)) throw new TemplateCopilotFactTransitionError("The extraction candidate no longer matches the reviewable fact.");
  const before = { value: fact.canonicalValue, provenance: fact.provenance };
  const committed = templateCopilotFactEntrySchema.parse({ ...fact, status: "committed", canonicalValue: candidate.value, confirmation: { actorId, confirmedAt, operation: "human_confirm" } });
  const history = { historyId: templateCopilotV2CandidateEvidenceHash({ candidateId, before, candidate, actorId, confirmedAt, beforeRevision }), kind: "candidate_confirmed" as const, factId: candidate.factId, candidateId, before, incoming: candidate, choice: "confirm_candidate" as const, actorId, confirmedAt, beforeRevision, afterRevision: beforeRevision + 1 };
  return templateCopilotV2LedgerSchema.parse({ ...ledger, facts: { ...ledger.facts, [candidate.factId]: committed }, extractionEvidence: { ...ledger.extractionEvidence, candidates: ledger.extractionEvidence.candidates.map((item) => item.candidateId === candidateId ? { ...item, state: "confirmed" as const } : item), history: [...ledger.extractionEvidence.history, history] } });
}

export function templateCopilotV2CandidateEvidenceHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
/** Version pins shared by the production extraction request and deterministic
 * qualification. Bump these when either the prompt contract or candidate
 * schema changes; qualification must never carry a look-alike literal. */
export const templateCopilotV2ExtractionPromptVersion =
  "template-copilot-v2-atomic-extraction-2026-07-30";
export const templateCopilotV2ProviderCandidateSchemaVersion =
  "template-copilot-v2-atomic-candidates-2";
export const templateCopilotV2DefaultOpenRouterModel =
  "qwen/qwen3.5-flash-02-23";
