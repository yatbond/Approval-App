import { createHash } from "node:crypto";
import { z } from "zod";
import { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";
export { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";
import {
  templateCopilotLocaleSchema,
  type TemplateCopilotLocale,
} from "./template-copilot-plan.ts";
import {
  templateCopilotSectionIds,
  templateCopilotLedgerSchema,
  type TemplateCopilotLedger,
  type TemplateCopilotSectionId,
} from "./template-copilot-ledger.ts";
import {
  requireTemplateCopilotV2,
  type TemplateCopilotV2Flag,
} from "./template-copilot-v2-feature.ts";
import {
  templateCopilotCommittedValueSchemas,
  templateCopilotFactIds,
  type TemplateCopilotFactId,
} from "./template-copilot-v2-canonical-values.ts";
export {
  normalizeTemplateCopilotCommittedValue,
  templateCopilotCommittedValueSchemas,
  templateCopilotFactIds,
} from "./template-copilot-v2-canonical-values.ts";
export type { TemplateCopilotFactId } from "./template-copilot-v2-canonical-values.ts";

export const templateCopilotFactStatuses = [
  "candidate",
  "committed",
  "unknown",
  "not_applicable",
  "unresolved",
  "conflicting",
] as const;
export type TemplateCopilotFactStatus =
  (typeof templateCopilotFactStatuses)[number];

const boundedId = z.string().trim().min(1).max(128);
const boundedSourceMessageIds = z.array(boundedId).max(24);
/** Candidates remain bounded prose until a human supplies an executable,
 * field-specific committed value. */
const candidateValueSchema = z.string().trim().min(1).max(8_000);

const boundedJsonValueSchema = z.json().superRefine((value, context) => {
  let nodes = 0;
  function visit(current: unknown, path: Array<string | number>, depth: number) {
    nodes += 1;
    if (nodes > 200) {
      context.addIssue({ code: "custom", path, message: "Canonical value is too complex." });
      return;
    }
    if (depth > 8) {
      context.addIssue({ code: "custom", path, message: "Canonical value is nested too deeply." });
      return;
    }
    if (typeof current === "string" && current.length > 8_000) {
      context.addIssue({ code: "custom", path, message: "Canonical text is too long." });
    }
    if (Array.isArray(current)) {
      if (current.length > 100) {
        context.addIssue({ code: "custom", path, message: "Canonical value has too many items." });
      }
      current.forEach((item, index) => visit(item, [...path, index], depth + 1));
    } else if (current && typeof current === "object") {
      const entries = Object.entries(current);
      if (entries.length > 50) {
        context.addIssue({ code: "custom", path, message: "Canonical value has too many properties." });
      }
      entries.forEach(([key, item]) => {
        if (key.length > 120) {
          context.addIssue({ code: "custom", path: [...path, key], message: "Canonical property name is too long." });
        }
        visit(item, [...path, key], depth + 1);
      });
    }
  }
  visit(value, [], 0);
});

const provenanceSchema = z
  .object({
    kind: z.enum(["message", "document", "legacy_section", "human_editor"]),
    sourceId: boundedId,
    sourceMessageIds: boundedSourceMessageIds.default([]),
    excerpt: z.string().trim().max(1_000).optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "document" && !value.sha256) {
      context.addIssue({ code: "custom", path: ["sha256"], message: "Document evidence requires a SHA-256 hash." });
    }
  });

const confirmationSchema = z
  .object({
    actorId: z.string().uuid(),
    confirmedAt: z.string().datetime({ offset: true }),
    operation: z.enum(["human_confirm", "human_replace", "human_resolve_conflict", "human_mark_not_applicable"]),
  })
  .strict();

/** Invalidated facts are never discarded.  They remain a bounded, readable
 * correction trail until a human re-confirms the now-dependent decision. */
const staleFactSchema = z.object({
  invalidatedBy: z.enum(templateCopilotFactIds),
  invalidatedAt: z.string().datetime({ offset: true }),
  status: z.enum(["candidate", "committed", "unknown", "not_applicable", "conflicting"]),
  canonicalValue: boundedJsonValueSchema.optional(),
  originalWording: z.string().trim().min(1).max(8_000).optional(),
  provenance: z.array(provenanceSchema).max(12),
  confirmation: confirmationSchema.optional(),
  notApplicableReason: z.string().trim().min(1).max(1_000).optional(),
  conflictValues: z.array(boundedJsonValueSchema).min(2).max(4).optional(),
  conflictEvidence: z.array(z.object({ canonicalValue: boundedJsonValueSchema, provenance: z.array(provenanceSchema).min(1).max(12) }).strict()).min(2).max(4).optional(),
}).strict();

export const templateCopilotFactEntrySchema = z
  .object({
    status: z.enum(templateCopilotFactStatuses),
    canonicalValue: boundedJsonValueSchema.optional(),
    originalWording: z.string().trim().min(1).max(8_000).optional(),
    locale: templateCopilotLocaleSchema.optional(),
    provenance: z.array(provenanceSchema).max(12),
    confirmation: confirmationSchema.optional(),
    questionLibraryVersion: z.string().trim().min(1).max(64),
    applicabilityCode: z.string().trim().min(1).max(80),
    blockingLevel: z.enum(["none", "draft", "publication"]),
    dependsOn: z.array(z.enum(templateCopilotFactIds)).max(8),
    notApplicableReason: z.string().trim().min(1).max(1_000).optional(),
    conflictValues: z.array(boundedJsonValueSchema).min(2).max(4).optional(),
    conflictEvidence: z.array(z.object({ canonicalValue: boundedJsonValueSchema, provenance: z.array(provenanceSchema).min(1).max(12) }).strict()).min(2).max(4).optional(),
    staleHistory: z.array(staleFactSchema).max(12).default([]),
  })
  .strict()
  .superRefine((entry, context) => {
    if (["candidate", "committed", "conflicting"].includes(entry.status) && entry.canonicalValue === undefined) {
      context.addIssue({ code: "custom", path: ["canonicalValue"], message: "This fact status requires a canonical value." });
    }
    if (["candidate", "committed", "conflicting"].includes(entry.status) && entry.provenance.length === 0) {
      context.addIssue({ code: "custom", path: ["provenance"], message: "A value requires bounded provenance." });
    }
    if (["committed", "not_applicable"].includes(entry.status) && !entry.confirmation) {
      context.addIssue({ code: "custom", path: ["confirmation"], message: "Committed facts require human confirmation." });
    }
    if (!["committed", "not_applicable"].includes(entry.status) && entry.confirmation) {
      context.addIssue({ code: "custom", path: ["confirmation"], message: "Only human-confirmed facts may contain confirmation metadata." });
    }
    if (entry.status === "not_applicable" && !entry.notApplicableReason) {
      context.addIssue({ code: "custom", path: ["notApplicableReason"], message: "Not-applicable facts require a reason." });
    }
    if (entry.status !== "not_applicable" && entry.notApplicableReason) {
      context.addIssue({ code: "custom", path: ["notApplicableReason"], message: "Only not-applicable facts may contain a reason." });
    }
    if (entry.status === "conflicting" && (!entry.conflictValues || !entry.conflictEvidence)) {
      context.addIssue({ code: "custom", path: ["conflictValues"], message: "Conflicting facts retain alternatives and their evidence." });
    }
    if (entry.status !== "conflicting" && (entry.conflictValues || entry.conflictEvidence)) {
      context.addIssue({ code: "custom", path: ["conflictValues"], message: "Only conflicting facts retain alternatives." });
    }
  });

export type TemplateCopilotFactEntry = z.infer<typeof templateCopilotFactEntrySchema>;

type FactDefinition = Readonly<{
  id: TemplateCopilotFactId;
  appliesWhen: "always" | "conditional_workflow" | "has_attachments" | "has_notifications" | "governance_required";
  blockingLevel: "none" | "draft" | "publication";
  dependsOn: readonly TemplateCopilotFactId[];
}>;

const definitions = [
  ["workflow.name", "always", "draft", []],
  ["workflow.purpose", "always", "draft", []],
  ["workflow.scope", "always", "publication", ["workflow.purpose"]],
  ["request.initiator_policy", "always", "draft", []],
  ["request.fields", "always", "draft", ["request.initiator_policy"]],
  ["attachments.requirements", "has_attachments", "publication", ["request.fields"]],
  ["workflow.stages", "always", "draft", ["request.initiator_policy"]],
  ["workflow.conditions", "conditional_workflow", "publication", ["workflow.stages", "request.fields"]],
  ["workflow.rejection_policy", "always", "draft", ["workflow.stages"]],
  ["collaboration.policy", "always", "publication", ["workflow.stages"]],
  ["timing.rules", "always", "publication", ["workflow.stages"]],
  ["visibility.policy", "always", "draft", ["workflow.stages"]],
  ["notifications.rules", "has_notifications", "publication", ["visibility.policy"]],
  ["governance.owner", "governance_required", "publication", []],
  ["governance.policies", "governance_required", "publication", []],
  ["governance.retention", "governance_required", "publication", []],
] as const satisfies ReadonlyArray<readonly [TemplateCopilotFactId, FactDefinition["appliesWhen"], FactDefinition["blockingLevel"], readonly TemplateCopilotFactId[]]>;

export const templateCopilotFactDefinitions: Readonly<Record<TemplateCopilotFactId, FactDefinition>> = Object.freeze(
  Object.fromEntries(definitions.map(([id, appliesWhen, blockingLevel, dependsOn]) => [id, Object.freeze({ id, appliesWhen, blockingLevel, dependsOn: Object.freeze([...dependsOn]) })])) as Record<TemplateCopilotFactId, FactDefinition>,
);

const atomicDecisionAnswerSchema = z.string().trim().min(1).superRefine((value, context) => {
  if (templateCopilotUnicodeCodePointCount(value) > 8_000) {
    context.addIssue({ code: "custom", message: "Answer exceeds 8000 Unicode characters." });
  }
});
const atomicDecisionReasonSchema = z.string().trim().min(1).superRefine((value, context) => {
  if (templateCopilotUnicodeCodePointCount(value) > 500) {
    context.addIssue({ code: "custom", message: "Reason exceeds 500 Unicode characters." });
  }
});
const atomicDecisionDisplaySchema = z.string().trim().min(1).superRefine((value, context) => {
  if (templateCopilotUnicodeCodePointCount(value) > 500) {
    context.addIssue({ code: "custom", message: "Display exceeds 500 Unicode characters." });
  }
});
const atomicDecisionOptionIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/);
/** Canonical persisted timestamp contract shared by the TypeScript ledger and
 * the locked PostgreSQL mutation functions. Persistable years are 0001-9999,
 * seconds and a timezone are mandatory, offsets are bounded, and PostgreSQL's
 * microsecond precision is enforced instead of silently normalizing a more
 * precise value. */
export const templateCopilotV2AnsweredAtPattern =
  /^(([0-9][0-9][2468][048]|[0-9][0-9][13579][26]|[0-9][0-9]0[48]|([02468][48]|[2468]0)00|[13579][26]00)-02-29|([0-9]{3}[1-9]|[0-9]{2}[1-9][0-9]|[0-9][1-9][0-9]{2}|[1-9][0-9]{3})-((0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])|(0[469]|11)-(0[1-9]|[12][0-9]|30)|(02)-(0[1-9]|1[0-9]|2[0-8])))T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$/;
export const templateCopilotV2AnsweredAtSchema = z.string()
  .datetime({ offset: true })
  .regex(templateCopilotV2AnsweredAtPattern);
const atomicDecisionCommonShape = {
  display: atomicDecisionDisplaySchema,
  provenance: z.array(provenanceSchema).min(1).max(12),
  answeredAt: templateCopilotV2AnsweredAtSchema,
} as const;
const atomicDecisionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    answer: atomicDecisionAnswerSchema,
    ...atomicDecisionCommonShape,
  }).strict(),
  z.object({
    kind: z.literal("choice"),
    answer: atomicDecisionOptionIdSchema,
    optionId: atomicDecisionOptionIdSchema,
    ...atomicDecisionCommonShape,
  }).strict(),
  z.object({
    kind: z.literal("unknown"),
    answer: z.literal("unknown"),
    ...atomicDecisionCommonShape,
  }).strict(),
  z.object({
    kind: z.literal("not_applicable"),
    answer: z.literal("not_applicable"),
    reason: atomicDecisionReasonSchema,
    ...atomicDecisionCommonShape,
  }).strict(),
]).superRefine((value, context) => {
  if (value.kind === "choice" && value.answer !== value.optionId) {
    context.addIssue({
      code: "custom",
      path: ["answer"],
      message: "A choice answer must exactly match its option ID.",
    });
  }
});

/** Durable, bounded model evidence. This is distinct from executable facts:
 * it keeps exact source coordinates for review while facts remain human-owned. */
const extractionLeafEvidenceSchema = z.object({
  // We use `/` for the whole scalar value. Nested values use RFC 6901
  // escaping, so object keys containing `~` or `/` remain unambiguous.
  path: z.string().max(256).regex(/^(?:\/$|(?:\/(?:[A-Za-z0-9_.-]|~[01])+)+$)/),
  messageId: boundedId,
  startCodePoint: z.number().int().min(0).max(8_000),
  endCodePoint: z.number().int().min(1).max(8_000),
  exactText: candidateValueSchema,
  normalizationRule: z.enum(["exact", "nfkc_trim_collapse", "nfkc_trim_collapse_whitespace", "enum_lexical", "approval_word_to_kind", "ordinal_to_sequence", "array_position_to_sequence", "boolean_lexical", "named_attachment_is_required", "duration_hours"]).optional(),
}).strict().superRefine((item, context) => {
  if (item.endCodePoint <= item.startCodePoint) context.addIssue({ code: "custom", path: ["endCodePoint"], message: "Evidence span must not be empty." });
});
const extractionCandidateEvidenceSchema = z.object({
  candidateId: z.string().regex(/^[0-9a-f]{64}$/),
  state: z.enum(["open", "confirmed"]),
  factId: z.enum(templateCopilotFactIds),
  value: boundedJsonValueSchema,
  originalWording: candidateValueSchema,
  evidence: z.array(extractionLeafEvidenceSchema).min(1).max(200),
  confidence: z.enum(["low", "medium", "high"]),
  ambiguity: z.enum(["none", "possible", "ambiguous"]),
  ambiguityNote: z.string().trim().max(500).optional(),
}).strict();
export const templateCopilotV2ExtractionEvidenceSchema = z.object({
  candidates: z.array(extractionCandidateEvidenceSchema).max(64).default([]),
  conflicts: z.array(z.object({
    conflictId: z.string().regex(/^[0-9a-f]{64}$/),
    factId: z.enum(templateCopilotFactIds),
    state: z.enum(["open", "closed"]),
    existing: z.object({
      value: boundedJsonValueSchema,
      provenance: z.array(provenanceSchema).max(12),
      confirmation: confirmationSchema.optional(),
      candidate: extractionCandidateEvidenceSchema.optional(),
    }).strict(),
    incoming: extractionCandidateEvidenceSchema,
  }).strict()).max(64).default([]),
  history: z.array(z.object({
    historyId: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.enum(["candidate_confirmed", "conflict_resolved"]),
    factId: z.enum(templateCopilotFactIds),
    candidateId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    conflictId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    before: z.object({ value: boundedJsonValueSchema.optional(), provenance: z.array(provenanceSchema).max(12), confirmation: confirmationSchema.optional() }).strict(),
    existingCandidate: extractionCandidateEvidenceSchema.optional(),
    incoming: extractionCandidateEvidenceSchema.optional(),
    choice: z.enum(["confirm_candidate", "keep_existing", "commit_incoming", "commit_human_value"]),
    humanValue: boundedJsonValueSchema.optional(),
    rationale: z.string().trim().min(1).max(1_000).optional(),
    actorId: z.string().uuid(), confirmedAt: z.string().datetime({ offset: true }),
    beforeRevision: z.number().int().min(1), afterRevision: z.number().int().min(1),
  }).strict()).max(128).default([]),
}).strict().default({ candidates: [], conflicts: [], history: [] });
export type TemplateCopilotV2ExtractionEvidence = z.infer<typeof templateCopilotV2ExtractionEvidenceSchema>;

const v2BaseSchema = z.object({
  schemaVersion: z.literal(2),
  locale: templateCopilotLocaleSchema.default("en"),
  businessUnitId: z.string().uuid(),
  businessName: z.string().trim().min(1).max(200),
  departmentId: z.string().uuid(),
  departmentName: z.string().trim().min(1).max(200),
  questionLibraryVersion: z.string().trim().min(1).max(64),
  atomicDecisions: z.record(z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/), atomicDecisionSchema).superRefine((value, context) => { if (Object.keys(value).length > 400) context.addIssue({ code: "custom", message: "Too many atomic decisions." }); }).default({}),
  facts: z.record(z.enum(templateCopilotFactIds), templateCopilotFactEntrySchema),
  extractionEvidence: templateCopilotV2ExtractionEvidenceSchema,
  requirementDocumentExtracts: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    fileName: z.string().trim().min(1).max(300),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    text: z.string().max(80_000),
    safety: z.literal("sanitized_untrusted_text"),
  }).strict()).max(5),
}).strict();

export const templateCopilotV2LedgerSchema = v2BaseSchema.superRefine((ledger, context) => {
  for (const id of templateCopilotFactIds) {
    const entry = ledger.facts[id];
    const definition = templateCopilotFactDefinitions[id];
    if (entry.applicabilityCode !== definition.appliesWhen || entry.blockingLevel !== definition.blockingLevel) {
      context.addIssue({ code: "custom", path: ["facts", id], message: "Fact applicability and blocking are server-defined." });
    }
    if (!sameIds(entry.dependsOn, definition.dependsOn)) {
      context.addIssue({ code: "custom", path: ["facts", id, "dependsOn"], message: "Fact dependencies are server-defined." });
    }
    if (entry.questionLibraryVersion !== ledger.questionLibraryVersion) {
      context.addIssue({ code: "custom", path: ["facts", id, "questionLibraryVersion"], message: "Fact library version must match its ledger." });
    }
    if (entry.status === "not_applicable" && definition.appliesWhen === "always") {
      context.addIssue({ code: "custom", path: ["facts", id, "status"], message: "An always-applicable fact cannot be marked not applicable." });
    }
    if (["candidate", "committed", "conflicting"].includes(entry.status) && entry.canonicalValue !== undefined) {
      const schema = templateCopilotCommittedValueSchemas[id];
      if (!schema.safeParse(entry.canonicalValue).success) {
        context.addIssue({ code: "custom", path: ["facts", id, "canonicalValue"], message: "Canonical value does not match this fact's safe schema." });
      }
    }
    if (entry.status === "conflicting" && entry.conflictValues?.some((value) => !templateCopilotCommittedValueSchemas[id].safeParse(value).success)) {
      context.addIssue({ code: "custom", path: ["facts", id, "conflictValues"], message: "Conflict alternatives must each be valid canonical values." });
    }
  }
});

export type TemplateCopilotV2Ledger = z.infer<typeof templateCopilotV2LedgerSchema>;
export const templateCopilotStoredLedgerSchema = z.union([templateCopilotLedgerSchema, templateCopilotV2LedgerSchema]);
export type TemplateCopilotStoredLedger = z.infer<typeof templateCopilotStoredLedgerSchema>;

export function createTemplateCopilotV2Ledger({
  businessUnitId, businessName, departmentId, departmentName, locale = "en", questionLibraryVersion = "v2.0",
}: {
  businessUnitId: string; businessName: string; departmentId: string; departmentName: string;
  locale?: TemplateCopilotLocale; questionLibraryVersion?: string;
}, flag?: TemplateCopilotV2Flag): TemplateCopilotV2Ledger {
  requireTemplateCopilotV2(flag);
  return templateCopilotV2LedgerSchema.parse({
    schemaVersion: 2, locale, businessUnitId, businessName, departmentId, departmentName, questionLibraryVersion, atomicDecisions: {}, extractionEvidence: { candidates: [], conflicts: [], history: [] },
    facts: Object.fromEntries(templateCopilotFactIds.map((id) => [id, emptyFact(id, questionLibraryVersion)])),
    requirementDocumentExtracts: [],
  });
}

const valueCommandSchema = z.object({ canonicalValue: boundedJsonValueSchema, originalWording: z.string().trim().min(1).max(8_000).optional(), provenance: z.array(provenanceSchema).min(1).max(12), locale: templateCopilotLocaleSchema.optional() }).strict();
export const templateCopilotV2FactTransitionSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("record_candidate"), payload: valueCommandSchema }).strict(),
  z.object({ operation: z.literal("human_commit"), payload: valueCommandSchema }).strict(),
  z.object({ operation: z.literal("human_replace"), payload: valueCommandSchema }).strict(),
  z.object({ operation: z.literal("resolve_conflict"), payload: valueCommandSchema }).strict(),
  z.object({ operation: z.literal("mark_unknown") }).strict(),
  z.object({ operation: z.literal("mark_not_applicable"), reason: z.string().trim().min(1).max(1_000) }).strict(),
]);
export type V2FactTransition = z.infer<typeof templateCopilotV2FactTransitionSchema>;

export function applyTemplateCopilotV2FactTransition({ ledger, factId, transition, actorId, confirmedAt, flag }: {
  ledger: TemplateCopilotV2Ledger; factId: TemplateCopilotFactId; transition: V2FactTransition; actorId: string; confirmedAt: string; flag?: TemplateCopilotV2Flag;
}): TemplateCopilotV2Ledger {
  requireTemplateCopilotV2(flag);
  // This parse is intentionally outside the domain-error wrapper. A corrupt
  // persisted ledger is a dependency failure, never a client transition 409.
  const parsed = templateCopilotV2LedgerSchema.parse(ledger);
  try {
    const command = templateCopilotV2FactTransitionSchema.parse(transition);
    const current = parsed.facts[factId];
    const entry = normalizeTransitionEntry(parsed, factId, current, command, actorId, confirmedAt);
    const facts = { ...parsed.facts, [factId]: entry };
    // A persisted value is only meaningful relative to its declared inputs.
    // Replacing an input deterministically reopens every direct and transitive
    // dependent fact, so no downstream decision can become an orphan.
    if (!sameFactEntry(current, entry)) {
      for (const dependentId of templateCopilotV2DependentFacts(factId)) {
        facts[dependentId] = invalidateFact(parsed.facts[dependentId], dependentId, factId, confirmedAt, parsed.questionLibraryVersion);
      }
    }
    return templateCopilotV2LedgerSchema.parse({ ...parsed, facts });
  } catch (error) {
    // The generic transition shape permits JSON values; field-specific parsing
    // below deliberately narrows those into a user-correctable transition.
    if (error instanceof z.ZodError) throw new TemplateCopilotFactTransitionError("The fact value is invalid for this field.");
    throw error;
  }
}

export class TemplateCopilotFactTransitionError extends Error {
  constructor(message: string) { super(message); this.name = "TemplateCopilotFactTransitionError"; }
}

/** Stable transitive closure of facts whose meaning depends on this fact. */
export function templateCopilotV2DependentFacts(factId: TemplateCopilotFactId): readonly TemplateCopilotFactId[] {
  const dependent = new Set<TemplateCopilotFactId>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of templateCopilotFactIds) {
      if (!dependent.has(candidate) && templateCopilotFactDefinitions[candidate].dependsOn.some((input) => input === factId || dependent.has(input))) {
        dependent.add(candidate);
        changed = true;
      }
    }
  }
  return templateCopilotFactIds.filter((candidate) => dependent.has(candidate));
}

/** V2 answer limits are Unicode code points after trimming, matching
 * PostgreSQL `length(text)`. Never use JavaScript UTF-16 `.length` here. */
export function templateCopilotV2CanonicalAnswer(input: string) {
  const text = z.string().parse(input).trim();
  if (templateCopilotUnicodeCodePointCount(text) < 1 || templateCopilotUnicodeCodePointCount(text) > 8_000) throw new TemplateCopilotFactTransitionError("The answer must be between 1 and 8000 characters.");
  return text;
}

/** Keeps the full canonical text for compilation/review while bounding the
 * human-facing ledger summary without splitting a Unicode code point. */
export function templateCopilotV2AtomicDisplayPreview(input: string) {
  const text = templateCopilotV2CanonicalAnswer(input);
  const codePoints = Array.from(text);
  if (codePoints.length <= 500) return text;
  return `${codePoints.slice(0, 499).join("")}…`;
}

/** Atomic interview answers are retained separately from broad fact candidates.
 * The controller/reducer can assemble a reviewable candidate later without
 * treating each incremental answer as a competing candidate overwrite. */
export function applyTemplateCopilotV2AtomicDecision({ ledger, decisionId, answer, provenance, answeredAt, flag }: {
  ledger: TemplateCopilotV2Ledger; decisionId: string; answer: { kind: "text"; text: string } | { kind: "choice"; optionId: string; display: string } | string; provenance: TemplateCopilotFactEntry["provenance"]; answeredAt: string; flag?: TemplateCopilotV2Flag;
}): TemplateCopilotV2Ledger {
  requireTemplateCopilotV2(flag);
  // Stored-ledger parsing remains outside this wrapper: a corrupt persisted
  // row is a dependency failure. Everything constructed for this command is
  // user-correctable and must not be retried as a 503.
  const parsed = templateCopilotV2LedgerSchema.parse(ledger);
  try {
    const id = z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/).parse(decisionId);
    if (parsed.atomicDecisions[id]) throw new TemplateCopilotFactTransitionError("This atomic decision was already answered.");
    const normalized = typeof answer === "string"
      ? { kind: "text" as const, answer: templateCopilotV2CanonicalAnswer(answer), display: templateCopilotV2AtomicDisplayPreview(answer) }
      : answer.kind === "text"
      ? { kind: "text" as const, answer: templateCopilotV2CanonicalAnswer(answer.text), display: templateCopilotV2AtomicDisplayPreview(answer.text) }
      : { kind: "choice" as const, optionId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/).parse(answer.optionId), answer: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/).parse(answer.optionId), display: z.string().trim().min(1).max(500).parse(answer.display) };
    return templateCopilotV2LedgerSchema.parse({ ...parsed, atomicDecisions: { ...parsed.atomicDecisions, [id]: { ...normalized, provenance, answeredAt: templateCopilotV2AnsweredAtSchema.parse(answeredAt) } } });
  } catch (error) {
    if (error instanceof z.ZodError) throw new TemplateCopilotFactTransitionError("The answer is invalid. Please correct it and try again.");
    throw error;
  }
}

export function classifyTemplateCopilotV2OperationError(error: unknown, unavailableMessage: string) {
  if (error instanceof TemplateCopilotFactTransitionError) {
    return { status: 409 as const, error: { code: "invalid_transition" as const, message: error.message } };
  }
  return { status: 503 as const, error: { code: "dependency_unavailable" as const, message: unavailableMessage } };
}

export type LegacyUpgradePreview = Readonly<{
  sourceSchemaVersion: 1;
  sessionId: string;
  sourceRevision: number;
  targetQuestionLibraryVersion: string;
  previewHash: string;
  mappings: ReadonlyArray<Readonly<{ sectionId: TemplateCopilotSectionId; summary: string; sourceMessageIds: readonly string[]; factIds: readonly TemplateCopilotFactId[]; outcome: "candidate" | "unresolved" }>>;
  unresolvedFactIds: readonly TemplateCopilotFactId[];
}>;

const legacyMappings: Readonly<Record<TemplateCopilotSectionId, readonly TemplateCopilotFactId[]>> = Object.freeze({
  identity_scope: ["workflow.name", "workflow.purpose", "workflow.scope"], initiators_fields: ["request.initiator_policy", "request.fields"],
  attachments: ["attachments.requirements"], stages_participants: ["workflow.stages"], conditions_exceptions: ["workflow.conditions", "workflow.rejection_policy"],
  collaboration_corrections: ["collaboration.policy"], timing_escalation: ["timing.rules"], visibility_notifications: ["visibility.policy", "notifications.rules"],
  governance: ["governance.owner", "governance.policies", "governance.retention"], confirmation: [],
});

export function previewLegacyTemplateCopilotUpgrade({ legacyInput, sessionId, sourceRevision, targetQuestionLibraryVersion = "v2.0" }: { legacyInput: TemplateCopilotLedger; sessionId: string; sourceRevision: number; targetQuestionLibraryVersion?: string }): LegacyUpgradePreview {
  const legacy = templateCopilotLedgerSchema.parse(legacyInput);
  const mappings = templateCopilotSectionIds.filter((sectionId) => sectionId !== "confirmation").map((sectionId) => {
    const section = legacy.sections[sectionId];
    // Legacy sections are broad prose. Preserve them only where that exact
    // summary already satisfies the typed fact schema; never coerce prose
    // into structured configuration just to make an upgrade appear complete.
    const factIds = section.status === "answered" && section.summary
      ? legacyMappings[sectionId].filter((factId) => templateCopilotCommittedValueSchemas[factId].safeParse(section.summary).success)
      : [];
    return Object.freeze({ sectionId, summary: section.summary, sourceMessageIds: Object.freeze([...section.sourceMessageIds]), factIds: Object.freeze(factIds), outcome: factIds.length > 0 ? "candidate" as const : "unresolved" as const });
  });
  const unresolvedFactIds = templateCopilotFactIds.filter((id) => !mappings.some((mapping) => mapping.outcome === "candidate" && mapping.factIds.includes(id)));
  const documentIdentity = [...legacy.requirementDocumentExtracts].map(({ id, fileName, sha256 }) => ({ id, fileName, sha256 })).sort((left, right) => `${left.id}:${left.sha256}`.localeCompare(`${right.id}:${right.sha256}`));
  const source = { sourceSchemaVersion: 1, sessionId, sourceRevision, scope: { businessUnitId: legacy.businessUnitId, businessName: legacy.businessName, departmentId: legacy.departmentId, departmentName: legacy.departmentName }, locale: legacy.locale, documentIdentity, targetQuestionLibraryVersion, mappings, unresolvedFactIds };
  return Object.freeze({ sourceSchemaVersion: 1, sessionId, sourceRevision, targetQuestionLibraryVersion, previewHash: stableHash(source), mappings: Object.freeze(mappings), unresolvedFactIds: Object.freeze(unresolvedFactIds) });
}

export function approveLegacyTemplateCopilotUpgrade({ legacyInput, preview, previewHash, flag }: {
  legacyInput: TemplateCopilotLedger; preview: LegacyUpgradePreview; previewHash: string; flag?: TemplateCopilotV2Flag;
}): TemplateCopilotV2Ledger {
  requireTemplateCopilotV2(flag);
  if (previewHash !== preview.previewHash) throw new TemplateCopilotFactTransitionError("The approved legacy-upgrade preview does not match its canonical preview.");
  const legacy = templateCopilotLedgerSchema.parse(legacyInput);
  const recomputed = previewLegacyTemplateCopilotUpgrade({ legacyInput: legacy, sessionId: preview.sessionId, sourceRevision: preview.sourceRevision, targetQuestionLibraryVersion: preview.targetQuestionLibraryVersion });
  if (recomputed.previewHash !== preview.previewHash) throw new TemplateCopilotFactTransitionError("The legacy-upgrade preview is stale or does not match the source ledger.");
  const ledger = createTemplateCopilotV2Ledger({ businessUnitId: legacy.businessUnitId, businessName: legacy.businessName, departmentId: legacy.departmentId, departmentName: legacy.departmentName, locale: legacy.locale, questionLibraryVersion: preview.targetQuestionLibraryVersion }, flag);
  const facts = { ...ledger.facts };
  for (const mapping of preview.mappings) {
    if (mapping.outcome !== "candidate") continue;
    for (const factId of mapping.factIds) {
      facts[factId] = templateCopilotFactEntrySchema.parse({ ...facts[factId], status: "candidate", canonicalValue: mapping.summary, originalWording: mapping.summary, provenance: [{ kind: "legacy_section", sourceId: mapping.sectionId, sourceMessageIds: mapping.sourceMessageIds }], });
    }
  }
  return templateCopilotV2LedgerSchema.parse({ ...ledger, facts });
}

function emptyFact(id: TemplateCopilotFactId, questionLibraryVersion: string): TemplateCopilotFactEntry {
  const definition = templateCopilotFactDefinitions[id];
  return { status: "unresolved", provenance: [], staleHistory: [], questionLibraryVersion, applicabilityCode: definition.appliesWhen, blockingLevel: definition.blockingLevel, dependsOn: [...definition.dependsOn] };
}

function invalidateFact(current: TemplateCopilotFactEntry, id: TemplateCopilotFactId, invalidatedBy: TemplateCopilotFactId, invalidatedAt: string, questionLibraryVersion: string): TemplateCopilotFactEntry {
  const next = emptyFact(id, questionLibraryVersion);
  if (current.status === "unresolved") return { ...next, staleHistory: current.staleHistory };
  const snapshot = {
    invalidatedBy,
    invalidatedAt: z.string().datetime({ offset: true }).parse(invalidatedAt),
    status: current.status,
    ...(current.canonicalValue === undefined ? {} : { canonicalValue: current.canonicalValue }),
    ...(current.originalWording ? { originalWording: current.originalWording } : {}),
    provenance: current.provenance,
    ...(current.confirmation ? { confirmation: current.confirmation } : {}),
    ...(current.notApplicableReason ? { notApplicableReason: current.notApplicableReason } : {}),
    ...(current.conflictValues ? { conflictValues: current.conflictValues } : {}),
    ...(current.conflictEvidence ? { conflictEvidence: current.conflictEvidence } : {}),
  };
  return templateCopilotFactEntrySchema.parse({ ...next, staleHistory: [...current.staleHistory, snapshot].slice(-12) });
}

function normalizeTransitionEntry(ledger: TemplateCopilotV2Ledger, factId: TemplateCopilotFactId, current: TemplateCopilotFactEntry, transition: V2FactTransition, actorId: string, confirmedAt: string): TemplateCopilotFactEntry {
  const definition = templateCopilotFactDefinitions[factId];
  // A correction must never erase prior correction evidence. Direct replaces
  // and conflict resolutions also retain the superseded value as a bounded
  // self-invalidated history entry; dependent invalidation uses the same
  // shape below.
  const preserveHistory = (includeCurrent: boolean) => includeCurrent && current.status !== "unresolved"
    ? [...current.staleHistory, { invalidatedBy: factId, invalidatedAt: z.string().datetime({ offset: true }).parse(confirmedAt), status: current.status, ...(current.canonicalValue === undefined ? {} : { canonicalValue: current.canonicalValue }), ...(current.originalWording ? { originalWording: current.originalWording } : {}), provenance: current.provenance, ...(current.confirmation ? { confirmation: current.confirmation } : {}), ...(current.notApplicableReason ? { notApplicableReason: current.notApplicableReason } : {}), ...(current.conflictValues ? { conflictValues: current.conflictValues } : {}), ...(current.conflictEvidence ? { conflictEvidence: current.conflictEvidence } : {}) }].slice(-12)
    : current.staleHistory;
  const build = (status: TemplateCopilotFactStatus, extra: Partial<TemplateCopilotFactEntry> = {}) => templateCopilotFactEntrySchema.parse({ ...emptyFact(factId, ledger.questionLibraryVersion), staleHistory: extra.staleHistory ?? preserveHistory(false), ...extra, status, applicabilityCode: definition.appliesWhen, blockingLevel: definition.blockingLevel, dependsOn: [...definition.dependsOn] });
  const normalizedHumanPayload = (payload: Extract<V2FactTransition, { payload: unknown }>["payload"]) => ({
    ...payload,
    canonicalValue: templateCopilotCommittedValueSchemas[factId].parse(payload.canonicalValue) as z.infer<typeof boundedJsonValueSchema>,
  });
  const protectedState = ["committed", "not_applicable", "conflicting"].includes(current.status);
  if (transition.operation === "record_candidate") {
    if (protectedState) throw new TemplateCopilotFactTransitionError("A candidate cannot overwrite a committed, N/A, or conflicting fact.");
    const incoming = { ...transition.payload, canonicalValue: templateCopilotCommittedValueSchemas[factId].parse(transition.payload.canonicalValue) as z.infer<typeof boundedJsonValueSchema> };
    if (current.status === "candidate") {
      const currentCanonicalValue = templateCopilotCommittedValueSchemas[factId].parse(current.canonicalValue) as z.infer<typeof boundedJsonValueSchema>;
      if (sameCanonicalValue(currentCanonicalValue, incoming.canonicalValue)) {
        return build("candidate", {
          ...incoming,
          canonicalValue: currentCanonicalValue,
          originalWording: current.originalWording || incoming.originalWording,
          provenance: mergeProvenance(current.provenance, incoming.provenance),
        });
      }
      const nextEvidence = { canonicalValue: incoming.canonicalValue, provenance: incoming.provenance };
      const currentEvidence = { canonicalValue: currentCanonicalValue, provenance: current.provenance };
      return build("conflicting", {
        canonicalValue: currentEvidence.canonicalValue,
        originalWording: current.originalWording,
        provenance: mergeProvenance(current.provenance, incoming.provenance),
        conflictValues: [currentEvidence.canonicalValue, nextEvidence.canonicalValue],
        conflictEvidence: [currentEvidence, nextEvidence],
      });
    }
    return build("candidate", incoming);
  }
  if (transition.operation === "mark_unknown") {
    if (current.status === "conflicting") throw new TemplateCopilotFactTransitionError("Resolve the conflict before marking this fact unknown.");
    return build("unknown", { staleHistory: preserveHistory(true) });
  }
  if (transition.operation === "mark_not_applicable") {
    if (current.status === "conflicting" || definition.appliesWhen === "always") throw new TemplateCopilotFactTransitionError("This fact cannot be marked not applicable without an explicit resolution and coded applicability.");
    return build("not_applicable", { staleHistory: preserveHistory(true), notApplicableReason: transition.reason, confirmation: { actorId: z.string().uuid().parse(actorId), confirmedAt: z.string().datetime({ offset: true }).parse(confirmedAt), operation: "human_mark_not_applicable" } });
  }
  if (transition.operation === "human_commit") {
    if (protectedState) throw new TemplateCopilotFactTransitionError("Human commit cannot overwrite a committed, N/A, or conflicting fact.");
    return build("committed", { ...normalizedHumanPayload(transition.payload), staleHistory: preserveHistory(true), confirmation: { actorId: z.string().uuid().parse(actorId), confirmedAt: z.string().datetime({ offset: true }).parse(confirmedAt), operation: "human_confirm" } });
  }
  if (transition.operation === "human_replace") {
    if (current.status === "conflicting") throw new TemplateCopilotFactTransitionError("Resolve the conflict before replacing this fact.");
    return build("committed", { ...normalizedHumanPayload(transition.payload), staleHistory: preserveHistory(true), confirmation: { actorId: z.string().uuid().parse(actorId), confirmedAt: z.string().datetime({ offset: true }).parse(confirmedAt), operation: "human_replace" } });
  }
  if (current.status !== "conflicting") throw new TemplateCopilotFactTransitionError("Conflict resolution requires an existing conflict.");
  return build("committed", { ...normalizedHumanPayload(transition.payload), staleHistory: preserveHistory(true), confirmation: { actorId: z.string().uuid().parse(actorId), confirmedAt: z.string().datetime({ offset: true }).parse(confirmedAt), operation: "human_resolve_conflict" } });
}

function sameIds(left: readonly string[], right: readonly string[]) { return left.length === right.length && left.every((id, index) => id === right[index]); }
function sameCanonicalValue(left: unknown, right: unknown) { return stableHash(left) === stableHash(right); }
function sameFactEntry(left: TemplateCopilotFactEntry, right: TemplateCopilotFactEntry) {
  return left.status === right.status && sameCanonicalValue(left.canonicalValue, right.canonicalValue)
    && left.notApplicableReason === right.notApplicableReason;
}
function mergeProvenance(left: TemplateCopilotFactEntry["provenance"], right: TemplateCopilotFactEntry["provenance"]) {
  const result = [...left];
  for (const item of right) if (!result.some((existing) => stableHash(existing) === stableHash(item))) result.push(item);
  return result.slice(0, 12);
}
function stableHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex"); }
