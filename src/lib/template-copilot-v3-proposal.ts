import {
  templateCopilotCommittedValueSchemas,
  templateCopilotFactIds,
  type TemplateCopilotFactId,
} from "./template-copilot-v2-canonical-values.ts";
import type {
  TemplateCopilotV3DescribeExtraction,
  TemplateCopilotV3DescribeLocale,
  TemplateCopilotV3DescribeSection,
} from "./template-copilot-v3-describe-extraction.ts";

/**
 * Turns what the v3 reader found into a reviewable proposal for the existing
 * fact ledger. Everything the reader quoted is "source"; everything the reader
 * cannot know (a field's input type, the order of stages, a notification's
 * channel...) is a deterministic "suggested" default. Nothing here is saved:
 * a person reviews and confirms every fact before it is committed.
 */

export type TemplateCopilotV3ProposalOrigin = "source" | "suggested";

export type TemplateCopilotV3ProposedFact = Readonly<{
  factId: TemplateCopilotFactId;
  /** A value that already satisfies the fact's schema, or null when the
   * person must supply it. */
  value: unknown | null;
  status: "ready" | "needs_input" | "not_described";
  origin: Readonly<Record<string, TemplateCopilotV3ProposalOrigin>>;
  notes: readonly string[];
  sourceQuotes: readonly string[];
}>;

export type TemplateCopilotV3HeldItem = Readonly<{
  factId: TemplateCopilotFactId;
  reason:
    | "conditional_rule"
    | "conditional_document"
    | "native_form"
    | "unsupported_stage_kind"
    | "unparsed_rule";
  quote: string;
  /** The reader's best structured reading, for the person to accept or edit. */
  suggestion: unknown | null;
}>;

export type TemplateCopilotV3Proposal = Readonly<{
  locale: TemplateCopilotV3DescribeLocale;
  facts: Readonly<Record<TemplateCopilotFactId, TemplateCopilotV3ProposedFact>>;
  held: readonly TemplateCopilotV3HeldItem[];
  missingBatches: readonly string[];
}>;

type Leaf = Readonly<{ role: string; quote: string; advisoryHint: string | null; sourceSpan?: Readonly<{ spanId?: string; messageId?: string; startCodePoint?: number }> }>;
type Item = Readonly<{
  factId: string;
  semanticLeaves: readonly Leaf[];
  blockingReason?: string;
  sourceMessageIds?: readonly string[];
}>;

const first = (leaves: readonly Leaf[], role: string) => leaves.find((leaf) => leaf.role === role);
const all = (leaves: readonly Leaf[], role: string) => leaves.filter((leaf) => leaf.role === role);
const clip = (text: string, max: number) => Array.from(text.trim()).slice(0, max).join("");

// ---------------------------------------------------------------- numbers
const englishNumbers: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const cjkDigits: Readonly<Record<string, number>> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

function parseCjkInteger(text: string): number | null {
  if (!text) return null;
  let total = 0;
  let section = 0;
  let digit = 0;
  const unit: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };
  const big: Readonly<Record<string, number>> = { 万: 10_000, 萬: 10_000, 亿: 100_000_000, 億: 100_000_000 };
  let seen = false;
  for (const char of Array.from(text)) {
    if (char in cjkDigits) {
      digit = cjkDigits[char];
      seen = true;
    } else if (char in unit) {
      section += (digit === 0 && char === "十" ? 1 : digit) * unit[char];
      digit = 0;
      seen = true;
    } else if (char in big) {
      total += (section + digit || 1) * big[char];
      section = 0;
      digit = 0;
      seen = true;
    } else if (!/[元圆圓\s]/u.test(char)) {
      return null;
    }
  }
  return seen ? total + section + digit : null;
}

/** A number as written in the source: digits, English words, or Chinese
 * numerals, with k/thousand/million/万/億 scale words. Null when unparsable. */
export function parseTemplateCopilotV3Number(raw: string): number | null {
  const text = raw.normalize("NFKC").trim().toLowerCase();
  const digits = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|k(?![a-z])|m(?![a-z])|万|萬|亿|億)?/u);
  if (digits) {
    const base = Number(digits[1].replaceAll(",", ""));
    const scale = digits[2];
    const factor = scale === "k" || scale === "thousand" ? 1_000
      : scale === "m" || scale === "million" ? 1_000_000
      : scale === "billion" ? 1_000_000_000
      : scale === "万" || scale === "萬" ? 10_000
      : scale === "亿" || scale === "億" ? 100_000_000
      : 1;
    const value = base * factor;
    return Number.isFinite(value) ? value : null;
  }
  const words = text.match(/[a-z]+/gu);
  if (words && words.every((word) => word in englishNumbers || ["hundred", "thousand", "million", "and", "a", "an"].includes(word))) {
    let total = 0;
    let current = 0;
    for (const word of words) {
      if (word in englishNumbers) current += englishNumbers[word];
      else if (word === "hundred") current = (current || 1) * 100;
      else if (word === "thousand") { total += (current || 1) * 1_000; current = 0; }
      else if (word === "million") { total += (current || 1) * 1_000_000; current = 0; }
    }
    return total + current || null;
  }
  return parseCjkInteger(text.replace(/^[港币幣元圆圓hk$usd\s]+/iu, ""));
}

const currencyCodes: ReadonlyArray<readonly [RegExp, string]> = [
  [/hkd|hk\$|港幣|港币|港元/iu, "HKD"],
  [/usd|us\$|美元|美金/iu, "USD"],
  [/rmb|cny|人民幣|人民币/iu, "CNY"],
  [/eur|歐元|欧元/iu, "EUR"],
  [/gbp|英鎊|英镑/iu, "GBP"],
];
const currencyFor = (text: string) => currencyCodes.find(([pattern]) => pattern.test(text))?.[1] ?? null;

// ---------------------------------------------------------------- fields
type FieldType = "text" | "long_text" | "number" | "date" | "currency" | "email" | "select" | "radio" | "checkbox" | "table";

const fieldTypePatterns: ReadonlyArray<readonly [RegExp, FieldType]> = [
  [/cost\s*cent(?:re|er)|成本中心|supplier|vendor|供應商|供应商|category|類別|类别|payment\s+(?:method|terms)|付款(?:方式|條款|条款)|budget\s+line|預算項目|预算项目|account|帳戶|账户|registration|註冊|注册|country|merchant|商戶|商户/iu, "text"],
  [/e-?mail|電郵|电邮|邮箱|郵箱/iu, "email"],
  [/date|deadline|due|日期|期限|時間|时间|生效|開始|开始|結束|结束/iu, "date"],
  [/amount|total|cost|price|budget|fee|salary|spend|estimate|fare|ticket|net\s+book|payment|value|薪酬|支出|機票|机票|賬面|账面|淨值|净值|金額|金额|費用|费用|預算|预算|總額|总额|價格|价格|成本|報價|报价/iu, "currency"],
  [/quantity|number of|count|days|hours|nights|duration|period|數量|数量|天數|天数|日數|日数|晚數|晚数|工期|時數|时数|人數|人数/iu, "number"],
  [/line items?|schedule|breakdown|itemi[sz]ed|明細|明细|清單|清单|列表/iu, "table"],
  [/summary|benefits?|objectives?|notes?|handover|摘要|效益|目標|目标|備註|备注|交接|expected/iu, "long_text"],
  [/description|reason|justification|purpose|details|comments?|remarks?|說明|说明|原因|目的|理由|備註|备注|詳情|详情/iu, "long_text"],
];
// A question put as a statement ("is replacement", "visa required", "是否需要簽證").
const yesNoLabel = /^(?:is|are|has|have|does|do|will|can)\s|\b(?:declared|involved|required|mandatory|replacement|goodwill|privileged|auto-?renewal)\b|是否|有否/iu;
const choiceMarkers = /\b(?:choice|option|selection|yes\/no|whether)\b|選項|选项|選擇|选择|是否|有否|有沒有|有没有/iu;

function proposeFieldShape(label: string, locale: TemplateCopilotV3DescribeLocale) {
  const typeHint: { type: FieldType; options: string[] } = { type: "text", options: [] };
  if (choiceMarkers.test(label)) {
    const stripped = label
      .replace(/\b(?:choice|option|selection)\b/giu, " ")
      .replace(/選項|选项|選擇|选择/gu, " ")
      .trim();
    const parts = stripped.split(/\s+or\s+|\s*\/\s*|或|還是|还是/iu).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 8 && !/^(?:是否|有否|whether)/iu.test(stripped)) {
      return { type: "select" as const, options: parts.slice(0, 8).map((part) => clip(part, 200)) };
    }
    return {
      type: "radio" as const,
      options: locale === "en" ? ["Yes", "No"] : locale === "zh-Hant" ? ["是", "否"] : ["是", "否"],
    };
  }
  if (yesNoLabel.test(label)) {
    return { type: "radio" as const, options: locale === "en" ? ["Yes", "No"] : ["是", "否"] };
  }
  for (const [pattern, type] of fieldTypePatterns) {
    if (pattern.test(label)) return { type, options: [] as string[] };
  }
  return typeHint;
}

type FieldValue = Readonly<{ label: string; type: FieldType; required: boolean; options: readonly string[] }>;

function proposeFields(items: readonly Item[], locale: TemplateCopilotV3DescribeLocale) {
  const origin: Record<string, TemplateCopilotV3ProposalOrigin> = {};
  const notes: string[] = [];
  const quotes: string[] = [];
  const values: FieldValue[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const label = first(item.semanticLeaves, "label")?.quote?.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const requiredLeaf = first(item.semanticLeaves, "required");
    const typeLeaf = first(item.semanticLeaves, "type");
    const shape = proposeFieldShape(label, locale);
    const type = (typeLeaf?.advisoryHint as FieldType | null) ?? shape.type;
    const index = values.length;
    values.push({
      label: clip(label, 200),
      type,
      required: requiredLeaf ? requiredLeaf.advisoryHint !== "false" : true,
      options: type === "select" || type === "radio" ? shape.options : [],
    });
    origin[`/${index}/label`] = "source";
    origin[`/${index}/required`] = requiredLeaf ? "source" : "suggested";
    origin[`/${index}/type`] = typeLeaf ? "source" : "suggested";
    quotes.push(label);
  }
  if (values.length === 0) notes.push("No request fields were found in the description.");
  return { values, origin, notes, quotes };
}

// ----------------------------------------------------------- attachments
const formatHints = new Set(["text", "pdf", "image", "excel_csv"]);

function slug(text: string, fallback: string) {
  const ascii = text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return /^[a-z]/u.test(ascii) && ascii.length >= 2 ? ascii.slice(0, 60) : fallback;
}

function proposeAttachments(items: readonly Item[]) {
  const origin: Record<string, TemplateCopilotV3ProposalOrigin> = {};
  const held: TemplateCopilotV3HeldItem[] = [];
  const quotes: string[] = [];
  const values: unknown[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const leaves = item.semanticLeaves;
    const label = first(leaves, "label")?.quote?.trim();
    if (!label) continue;
    const requiredHint = first(leaves, "required")?.advisoryHint ?? null;
    const kind = first(leaves, "kind")?.advisoryHint === "form" ? "form" : "attachment";
    const formats = [...new Set(all(leaves, "format").map((leaf) => leaf.advisoryHint).filter((hint): hint is string => Boolean(hint) && formatHints.has(hint as string)))];
    const key = `${kind}:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const required = requiredHint !== "false" && requiredHint !== "optional_conditional";
    const minLeaf = first(leaves, "minimum_quantity");
    const maxLeaf = first(leaves, "maximum_quantity");
    const sizeLeaf = first(leaves, "maximum_file_size_mb");
    const minimum = minLeaf ? parseTemplateCopilotV3Number(minLeaf.quote) : null;
    const maximum = maxLeaf ? parseTemplateCopilotV3Number(maxLeaf.quote) : null;
    const size = sizeLeaf ? parseTemplateCopilotV3Number(sizeLeaf.quote) : null;
    const stageLeaf = first(leaves, "stage");
    if (kind === "form") {
      // The draft compiler cannot create an in-app form without its field
      // definitions, which are designed in the visual builder afterwards.
      held.push({
        factId: "attachments.requirements",
        reason: "native_form",
        quote: clip(`${label}: ${first(leaves, "kind")?.quote ?? ""}`, 400),
        suggestion: null,
      });
      quotes.push(label);
      continue;
    }
    const index = values.length;
    const id = slug(label, `document-${index + 1}`);
    const base = {
      id: values.some((value) => (value as { id: string }).id === id) ? `${id}-${index + 1}` : id,
      label: clip(label, 200),
      kind,
      required,
      formats: formats.length > 0 ? formats : ["pdf"],
      minimumQuantity: Math.min(20, Math.max(required ? 1 : 0, minimum ?? (required ? 1 : 0))),
      maximumQuantity: Math.min(20, Math.max(1, maximum ?? Math.max(1, minimum ?? 1))),
      maximumFileSizeMb: Math.min(25, Math.max(1, size ?? 10)),
      stage: stageLeaf?.advisoryHint === "stage_reference" ? `stage:${clip(stageLeaf.quote, 190)}` : "request_submission",
      contributorPolicy: first(leaves, "contributor_policy")?.advisoryHint === "allow_invited_contributors" ? "allow_invited_contributors" : "requester_only",
      confirmationPolicy: (first(leaves, "confirmation_policy")?.advisoryHint as string | undefined) ?? "none",
    };
    origin[`/${index}/label`] = "source";
    origin[`/${index}/required`] = requiredHint ? "source" : "suggested";
    origin[`/${index}/formats`] = formats.length > 0 ? "source" : "suggested";
    origin[`/${index}/minimumQuantity`] = minLeaf ? "source" : "suggested";
    origin[`/${index}/maximumQuantity`] = maxLeaf ? "source" : "suggested";
    origin[`/${index}/maximumFileSizeMb`] = sizeLeaf ? "source" : "suggested";
    quotes.push(label);
    const conditional = item.blockingReason !== undefined
      || ["conditional", "required_with_conditional_extension", "optional_conditional"].includes(requiredHint ?? "");
    if (conditional) {
      held.push({
        factId: "attachments.requirements",
        reason: "conditional_document",
        quote: clip(`${label}: ${first(leaves, "required")?.quote ?? ""}`, 400),
        suggestion: { ...base, required: false, minimumQuantity: 0 },
      });
      // The workflow engine has no "only when" documents. Keep it as an
      // optional document so the requester can still attach it.
      values.push({ ...base, required: false, minimumQuantity: 0 });
      origin[`/${index}/required`] = "suggested";
      continue;
    }
    values.push(base);
  }
  return { values, origin, held, quotes };
}

// ---------------------------------------------------------------- stages
const requesterWords = /^(?:the\s+)?(?:requester|applicant|submitter|initiator|employee|requestor|申請人|申请人|發起人|发起人|提交人|員工|员工)$/iu;
const stageKinds = new Set(["approval", "review", "for_information", "submission"]);

type StageValue = Readonly<{
  label: string;
  kind: string;
  participant: Readonly<{ mode: string; value?: string }>;
  sequence: number;
}>;

function proposeStages(items: readonly Item[]) {
  const origin: Record<string, TemplateCopilotV3ProposalOrigin> = {};
  const held: TemplateCopilotV3HeldItem[] = [];
  const notes: string[] = [];
  const quotes: string[] = [];
  const values: StageValue[] = [];
  const seen = new Set<string>();
  let sequence = 0;
  let previousParallelSpan: string | null = null;
  for (const item of items) {
    const leaves = item.semanticLeaves;
    const label = (first(leaves, "label") ?? first(leaves, "participant"))?.quote?.trim();
    const kindHint = first(leaves, "kind")?.advisoryHint ?? null;
    if (!label) continue;
    // The requester's own submission starts the workflow; it is not a step.
    // A later submission by someone else cannot be compiled automatically.
    const submissionByRequester = kindHint === "submission" && (
      requesterWords.test((first(leaves, "participant")?.quote ?? label).trim()) ||
      first(leaves, "participant_mode")?.advisoryHint === "requester"
    );
    if (submissionByRequester) {
      notes.push(`"${clip(label, 80)}" submits the request, which starts the workflow, so it is not a separate step.`);
      continue;
    }
    if (kindHint && (!stageKinds.has(kindHint) || kindHint === "submission")) {
      held.push({
        factId: "workflow.stages",
        reason: "unsupported_stage_kind",
        quote: clip(`${label}: ${first(leaves, "kind")?.quote ?? ""}`, 400),
        suggestion: null,
      });
      continue;
    }
    const key = `${label.toLowerCase()}:${kindHint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const participantLeaf = first(leaves, "participant");
    const modeLeaf = first(leaves, "participant_mode");
    const participantText = (participantLeaf?.quote ?? label).trim();
    const participant = requesterWords.test(participantText) || modeLeaf?.advisoryHint === "requester"
      ? { mode: "requester" }
      : modeLeaf?.advisoryHint === "request_field"
        ? { mode: "request_field", value: clip(modeLeaf.quote, 200) }
        : { mode: "directory_position", value: clip(participantText, 200) };
    const relationship = first(leaves, "relationship");
    const parallel = relationship?.advisoryHint === "parallel";
    const span = relationship?.sourceSpan?.spanId ?? null;
    if (parallel && span !== null && span === previousParallelSpan && sequence > 0) {
      // Same "in parallel" statement: one simultaneous phase.
    } else {
      sequence += 1;
    }
    previousParallelSpan = parallel ? span : null;
    const index = values.length;
    values.push({
      label: clip(label, 200),
      kind: kindHint ?? "approval",
      participant,
      sequence: Math.min(100, sequence),
    });
    origin[`/${index}/label`] = "source";
    origin[`/${index}/kind`] = kindHint ? "source" : "suggested";
    origin[`/${index}/participant`] = participantLeaf || modeLeaf ? "source" : "suggested";
    origin[`/${index}/sequence`] = parallel ? "source" : "suggested";
    quotes.push(label);
    if (item.sourceMessageIds?.some((id) => id.includes(":conditions_exceptions:"))) {
      notes.push(`"${clip(label, 80)}" was added by a condition; check where it belongs in the order.`);
    }
  }
  return { values, origin, held, notes, quotes };
}

// ------------------------------------------------------------ conditions
const operatorByHint = new Set(["=", "!=", ">", ">=", "<", "<=", "contains"]);

function normalizedForMatch(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

function matchByContainment<T extends { label: string }>(text: string, candidates: readonly T[]): T | null {
  const target = normalizedForMatch(text);
  if (!target) return null;
  const scored = candidates
    .map((candidate) => ({ candidate, label: normalizedForMatch(candidate.label) }))
    .filter(({ label }) => label.length > 0 && (target.includes(label) || label.includes(target)))
    .sort((a, b) => b.label.length - a.label.length);
  return scored[0]?.candidate ?? null;
}

function proposeConditions(
  items: readonly Item[],
  fields: readonly FieldValue[],
  stages: readonly StageValue[],
) {
  const origin: Record<string, TemplateCopilotV3ProposalOrigin> = {};
  const held: TemplateCopilotV3HeldItem[] = [];
  const quotes: string[] = [];
  const values: unknown[] = [];
  const phases = [...new Set(stages.map((stage) => stage.sequence))].sort((a, b) => a - b);
  const firstOfPhase = (sequence: number) => stages.find((stage) => stage.sequence === sequence)!;
  for (const item of items) {
    const leaves = item.semanticLeaves;
    const fieldLeaf = first(leaves, "field");
    const operatorLeaf = first(leaves, "operator");
    const valueLeaf = first(leaves, "value");
    const routeLeaf = first(leaves, "matching_route");
    const summary = clip(leaves.map((leaf) => leaf.quote).join(" · "), 400);
    quotes.push(summary);
    const operatorHint = operatorLeaf?.advisoryHint ?? null;
    const operator = operatorHint && operatorByHint.has(operatorHint) ? operatorHint : null;
    const numeric = valueLeaf ? parseTemplateCopilotV3Number(valueLeaf.quote) : null;
    const currencyLeaf = first(leaves, "currency");
    const currency = currencyLeaf ? currencyFor(currencyLeaf.quote) : (valueLeaf ? currencyFor(valueLeaf.quote) : null);
    const comparison = operator !== null && [">", ">=", "<", "<="].includes(operator);
    const matchedField = fieldLeaf ? matchByContainment(fieldLeaf.quote, fields) : null;
    const matchedStage = routeLeaf ? matchByContainment(routeLeaf.quote, stages) : null;
    const routeHint = routeLeaf?.advisoryHint ?? null;
    const matchingRoute = matchedStage
      ? `stage:${matchedStage.label}`
      : routeHint === "complete" ? "complete"
      : routeHint === "return_for_correction" ? "return_for_correction"
      : null;
    let otherwiseRoute: string | null = null;
    if (matchedStage) {
      const next = phases[phases.indexOf(matchedStage.sequence) + 1];
      otherwiseRoute = next === undefined ? "complete" : `stage:${firstOfPhase(next).label}`;
    }
    const suggestion = fieldLeaf && operator && valueLeaf && matchingRoute && otherwiseRoute && (comparison ? numeric !== null : true)
      ? {
          id: `rule-${values.length + 1}`,
          sequence: values.length + 1,
          field: matchedField?.label ?? clip(fieldLeaf.quote, 200),
          operator,
          value: comparison ? numeric : clip(valueLeaf.quote, 400),
          ...(currency && comparison ? { currency } : {}),
          matchingRoute,
          otherwiseRoute,
        }
      : null;
    const parsed = suggestion
      ? templateCopilotCommittedValueSchemas["workflow.conditions"].safeParse([suggestion]).success
      : false;
    held.push({
      factId: "workflow.conditions",
      reason: parsed ? "conditional_rule" : "unparsed_rule",
      quote: summary,
      suggestion: parsed ? suggestion : null,
    });
    if (parsed && suggestion) {
      const index = values.length;
      values.push(suggestion);
      origin[`/${index}/field`] = matchedField ? "source" : "suggested";
      origin[`/${index}/operator`] = "source";
      origin[`/${index}/value`] = "source";
      origin[`/${index}/matchingRoute`] = "source";
      origin[`/${index}/otherwiseRoute`] = "suggested";
    }
  }
  return { values, origin, held, quotes };
}

// --------------------------------------------------------- notifications
const requestLevelEvents = new Set(["request_submitted", "request_rejected", "correction_requested", "request_completed"]);

function proposeNotifications(items: readonly Item[], stages: readonly StageValue[]) {
  const origin: Record<string, TemplateCopilotV3ProposalOrigin> = {};
  const quotes: string[] = [];
  const values: unknown[] = [];
  const seen = new Set<string>();
  const actionable = stages.filter((stage) => stage.kind === "approval" || stage.kind === "review");
  const stageTargets = actionable.length > 0 ? actionable : stages.slice(0, 1);
  for (const item of items) {
    const leaves = item.semanticLeaves;
    const event = first(leaves, "event")?.advisoryHint ?? null;
    if (!event) continue;
    const recipientLeaf = first(leaves, "recipient");
    const recipientHint = recipientLeaf?.advisoryHint ?? null;
    const visibility = first(leaves, "visibility")?.advisoryHint === "recipients_only" ? "recipients_only" : "all_participants";
    const requestLevel = requestLevelEvents.has(event);
    const recipient = recipientHint && recipientHint !== "source_named_group"
      ? recipientHint
      : requestLevel ? "all_participants" : "current_stage_participants";
    const timing = event === "due_soon" ? { mode: "before_due", offsetHours: 4 }
      : event === "overdue" ? { mode: "after_due", offsetHours: 1 }
      : { mode: "immediate" };
    const needsStage = !requestLevel || recipient === "current_stage_participants" || recipient === "previous_stage_participants";
    const targets = needsStage ? stageTargets : [null];
    for (const stage of targets) {
      if (needsStage && !stage) continue;
      const key = `${event}:${recipient}:${stage?.label ?? ""}:${visibility}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const index = values.length;
      values.push({
        id: `notify-${event.replaceAll("_", "-")}-${index + 1}`,
        event,
        recipients: [recipient],
        timing,
        channel: first(leaves, "channel")?.advisoryHint ?? "default",
        visibility,
        ...(stage ? { stage: `stage:${stage.label}` } : {}),
      });
      origin[`/${index}/event`] = "source";
      origin[`/${index}/recipients`] = recipientHint && recipientHint !== "source_named_group" ? "source" : "suggested";
      origin[`/${index}/timing`] = event === "due_soon" || event === "overdue" ? "suggested" : "source";
      origin[`/${index}/channel`] = first(leaves, "channel") ? "source" : "suggested";
      origin[`/${index}/visibility`] = first(leaves, "visibility") ? "source" : "suggested";
    }
    quotes.push(clip(leaves.map((leaf) => leaf.quote).join(" · "), 200));
  }
  return { values, origin, quotes };
}

// -------------------------------------------------------- scalar & policy
const namePatterns: readonly RegExp[] = [
  /(?:create|build|set\s*up|make|define|design)\s+(?:an?\s+|the\s+)?["“'「『]?(.{3,90}?)["”'」』]?\s+(?:approval\s+)?(?:workflow|process|template|flow)\b/iu,
  /建立[“「"'『]?(.{2,40}?)[”」"'』]?(?:流程|工作流程|範本|模板)/u,
  /(?:新增|設定|设置|建立)[“「"'『]?(.{2,40}?)[”」"'』]?(?:流程)/u,
];

function proposeName(identity: string) {
  for (const pattern of namePatterns) {
    const match = identity.match(pattern);
    if (match?.[1]) return clip(match[1].replace(/\s+/gu, " "), 120);
  }
  return null;
}

function firstSentences(text: string, max: number) {
  const parts = text.trim().match(/[^。.!?！？\n]+[。.!?！？]?/gu) ?? [text.trim()];
  let out = "";
  for (const part of parts) {
    if (Array.from(out + part).length > max) break;
    out += part;
  }
  return out.trim() || clip(text, max);
}

function proposeInitiator(text: string) {
  const anyEmployee = /any\s+(?:employee|staff|user)|anyone|everyone|all\s+employees|任何(?:員工|员工|人)|所有(?:員工|员工)|全體|全体/iu.test(text);
  const selected = /select(?:ed)?\s+by|choose|selected\s+requester|由.{0,6}(?:選擇|选择)/iu.test(text);
  const mode = anyEmployee ? "any_employee" : selected ? "requester_selected" : "directory_role";
  return { mode, description: clip(firstSentences(text, 400) || text, 2000) };
}

function hoursFrom(text: string) {
  const hourMatch = text.match(/(\d+|[a-z]+|[零〇一二两兩三四五六七八九十百]+)\s*(?:calendar\s+|business\s+|working\s+)?(hours?|hrs?|小時|小时|days?|日|天)/iu);
  if (!hourMatch) return null;
  const amount = parseTemplateCopilotV3Number(hourMatch[1]);
  if (amount === null || amount <= 0) return null;
  const hours = /day|日|天/iu.test(hourMatch[2]) ? amount * 24 : amount;
  return hours >= 1 && hours <= 8760 ? Math.round(hours) : null;
}

function retentionFrom(text: string) {
  const match = text.match(/(?:retain|retention|keep|store|保留|保存|保管)[^.。;；]{0,60}?((?:\d[\d,]*|[零〇一二两兩三四五六七八九十百千萬万]+)\s*(?:calendar\s+)?(?:days?|months?|years?|日|天|個月|个月|月|年))/iu);
  return match ? match[1].replace(/\s+/gu, " ").trim() : null;
}

function rejectionFrom(text: string, hint: string | null, stages: readonly StageValue[]) {
  const action = hint === "close" || /\bclose\b|終止|终止|關閉|关闭/iu.test(text) ? "close"
    : "return_for_correction";
  void stages;
  return { action };
}

// ------------------------------------------------------------------ main
function slotText(sections: readonly TemplateCopilotV3DescribeSection[], slot: string) {
  return sections.find((section) => section.slot === slot)?.text?.trim() ?? "";
}

export function buildTemplateCopilotV3Proposal({
  extraction,
  sections,
  locale,
}: Readonly<{
  extraction: TemplateCopilotV3DescribeExtraction;
  sections: readonly TemplateCopilotV3DescribeSection[];
  locale: TemplateCopilotV3DescribeLocale;
}>): TemplateCopilotV3Proposal {
  const review = extraction.assembly.review as unknown as {
    items: readonly Item[];
    policyItems?: ReadonlyArray<{ factId?: string; semanticLeaves?: readonly Leaf[]; leaves?: readonly Leaf[] }>;
  };
  const byFact = (factId: string) => review.items.filter((item) => item.factId === factId);
  const identity = slotText(sections, "identity_scope");
  const initiatorsText = slotText(sections, "initiators_fields");
  const facts = {} as Record<TemplateCopilotFactId, TemplateCopilotV3ProposedFact>;
  const held: TemplateCopilotV3HeldItem[] = [];

  const set = (
    factId: TemplateCopilotFactId,
    value: unknown | null,
    options: Partial<Pick<TemplateCopilotV3ProposedFact, "origin" | "notes" | "sourceQuotes">> & { described?: boolean } = {},
  ) => {
    const valid = value !== null && templateCopilotCommittedValueSchemas[factId].safeParse(value).success;
    facts[factId] = Object.freeze({
      factId,
      value: valid ? value : null,
      status: valid ? "ready" : options.described === false ? "not_described" : "needs_input",
      origin: Object.freeze(options.origin ?? {}),
      notes: Object.freeze([
        ...(options.notes ?? []),
        ...(value !== null && !valid ? ["The reader's draft did not satisfy this fact's rules; please complete it."] : []),
      ]),
      sourceQuotes: Object.freeze(options.sourceQuotes ?? []),
    });
  };

  const name = proposeName(identity);
  set("workflow.name", name, {
    origin: { "": name ? "suggested" : "suggested" },
    notes: name ? [] : ["The workflow name was not stated; please enter one."],
    sourceQuotes: identity ? [firstSentences(identity, 200)] : [],
  });
  set("workflow.purpose", identity ? clip(firstSentences(identity, 600), 8000) : null, {
    origin: { "": "source" },
    sourceQuotes: identity ? [firstSentences(identity, 200)] : [],
    described: Boolean(identity),
  });
  set("workflow.scope", identity ? { description: clip(identity, 8000), rules: [] } : null, {
    origin: { "/description": "source" },
    sourceQuotes: identity ? [clip(identity, 200)] : [],
    described: Boolean(identity),
  });
  set("request.initiator_policy", initiatorsText ? proposeInitiator(initiatorsText) : null, {
    origin: { "/mode": "suggested", "/description": "source" },
    sourceQuotes: initiatorsText ? [firstSentences(initiatorsText, 200)] : [],
    described: Boolean(initiatorsText),
  });

  const fields = proposeFields(byFact("request.fields"), locale);
  set("request.fields", fields.values.length > 0 ? fields.values : null, {
    origin: fields.origin, notes: fields.notes, sourceQuotes: fields.quotes,
  });

  const attachments = proposeAttachments(byFact("attachments.requirements"));
  held.push(...attachments.held);
  set("attachments.requirements", attachments.values.length > 0 ? attachments.values : null, {
    origin: attachments.origin, sourceQuotes: attachments.quotes, described: attachments.values.length > 0,
  });

  const stages = proposeStages(byFact("workflow.stages"));
  held.push(...stages.held);
  set("workflow.stages", stages.values.length > 0 ? stages.values : null, {
    origin: stages.origin, notes: stages.notes, sourceQuotes: stages.quotes,
  });

  const conditions = proposeConditions(byFact("workflow.conditions"), fields.values, stages.values);
  held.push(...conditions.held);
  set("workflow.conditions", conditions.values.length > 0 ? conditions.values : null, {
    origin: conditions.origin, sourceQuotes: conditions.quotes, described: conditions.held.length > 0,
  });

  const rejectionItem = (review.policyItems ?? []).find((item) => item.factId === "workflow.rejection_policy");
  const rejectionLeaves = rejectionItem?.semanticLeaves ?? rejectionItem?.leaves ?? [];
  const rejectionText = slotText(sections, "conditions_exceptions") || slotText(sections, "collaboration_corrections");
  set("workflow.rejection_policy", rejectionFrom(rejectionText, first(rejectionLeaves, "mode")?.advisoryHint ?? null, stages.values), {
    origin: { "/action": rejectionLeaves.length > 0 ? "source" : "suggested" },
    sourceQuotes: rejectionText ? [firstSentences(rejectionText, 200)] : [],
  });

  const collaborationText = slotText(sections, "collaboration_corrections");
  set("collaboration.policy", collaborationText ? { description: clip(collaborationText, 8000), rules: [] } : null, {
    origin: { "/description": "source" }, sourceQuotes: collaborationText ? [clip(collaborationText, 200)] : [], described: Boolean(collaborationText),
  });

  const timingText = slotText(sections, "timing_escalation");
  const dueHours = timingText ? hoursFrom(timingText) : null;
  set("timing.rules", timingText ? {
    ...(dueHours ? { defaultDueHours: dueHours } : {}),
    escalation: { description: clip(timingText, 8000), rules: [] },
  } : null, {
    origin: { "/defaultDueHours": dueHours ? "suggested" : "suggested", "/escalation": "source" },
    notes: timingText && !dueHours ? ["No due time in hours was found; please set one."] : [],
    sourceQuotes: timingText ? [clip(timingText, 200)] : [],
    described: Boolean(timingText),
  });

  const visibilityText = slotText(sections, "visibility_notifications");
  set("visibility.policy", visibilityText ? { description: clip(visibilityText, 8000), rules: [] } : null, {
    origin: { "/description": "source" }, sourceQuotes: visibilityText ? [clip(visibilityText, 200)] : [], described: Boolean(visibilityText),
  });

  const notifications = proposeNotifications(byFact("notifications.rules"), stages.values);
  set("notifications.rules", notifications.values.length > 0 ? notifications.values : null, {
    origin: notifications.origin, sourceQuotes: notifications.quotes, described: notifications.values.length > 0,
  });

  const governanceText = slotText(sections, "governance");
  const owner = governanceText ? clip(firstSentences(governanceText, 180), 200) : null;
  set("governance.owner", owner, {
    origin: { "": "source" }, sourceQuotes: governanceText ? [clip(governanceText, 200)] : [], described: Boolean(governanceText),
  });
  set("governance.policies", governanceText ? [clip(governanceText, 8000)] : null, {
    origin: { "/0": "source" }, sourceQuotes: governanceText ? [clip(governanceText, 200)] : [], described: Boolean(governanceText),
  });
  const retention = governanceText ? retentionFrom(governanceText) : null;
  set("governance.retention", retention ? { period: clip(retention, 200) } : null, {
    origin: { "/period": "source" },
    notes: governanceText && !retention ? ["No retention period was found; please enter one."] : [],
    sourceQuotes: governanceText ? [clip(governanceText, 200)] : [],
    described: Boolean(governanceText),
  });

  for (const factId of templateCopilotFactIds) {
    if (!(factId in facts)) set(factId, null, { described: false });
  }
  return Object.freeze({
    locale,
    facts: Object.freeze(facts),
    held: Object.freeze(held),
    missingBatches: Object.freeze(
      extraction.batches.filter((batch) => batch.status === "failed").map((batch) => batch.batchId),
    ),
  });
}

/** Facts in the order they must be committed: a fact's inputs come first,
 * because replacing an input reopens everything that depends on it. */
export const templateCopilotV3CommitOrder: readonly TemplateCopilotFactId[] = [
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
];
