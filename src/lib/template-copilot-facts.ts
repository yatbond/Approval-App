import { createHash } from "node:crypto";
import { z } from "zod";
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

export const templateCopilotFactIds = [
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
] as const;

export type TemplateCopilotFactId = (typeof templateCopilotFactIds)[number];
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
    operation: z.enum(["human_confirm", "human_resolve_conflict", "human_mark_not_applicable"]),
  })
  .strict();

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
    conflictEvidence: z.array(z.object({ canonicalValue: candidateValueSchema, provenance: z.array(provenanceSchema).min(1).max(12) }).strict()).min(2).max(4).optional(),
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

const boundedTextValue = z.string().trim().min(1).max(8_000);
const boundedLabel = z.string().trim().min(1).max(200);
const participantSchema = z.object({ mode: z.enum(["fixed_email", "directory_position", "request_field", "requester", "unassigned_at_template"]), value: boundedLabel.optional() }).strict();
const fieldSchema = z.object({ label: boundedLabel, type: z.enum(["text", "long_text", "number", "date", "currency", "email", "select", "radio", "checkbox", "table"]), required: z.boolean(), options: z.array(boundedLabel).max(100).default([]) }).strict();
const attachmentSchema = z.object({ label: boundedLabel, required: z.boolean(), formats: z.array(z.enum(["text", "pdf", "image", "excel_csv"])).max(4).default([]), stage: boundedLabel.optional() }).strict();
const stageSchema = z.object({ label: boundedLabel, kind: z.enum(["approval", "review", "for_information", "submission"]), participant: participantSchema, sequence: z.number().int().min(1).max(100) }).strict();
const conditionSchema = z.object({ field: boundedLabel, operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]), value: z.union([boundedTextValue, z.number().finite()]), matchingRoute: boundedLabel, otherwiseRoute: boundedLabel }).strict();
const policySchema = z.object({ description: boundedTextValue, rules: z.array(boundedTextValue).max(50).default([]) }).strict();

/** Candidate values are deliberately text only until a human supplies one of
 * the field-specific canonical forms below. This prevents legacy prose or a
 * model-shaped object from masquerading as executable configuration. */
const committedValueSchemas: Readonly<Record<TemplateCopilotFactId, z.ZodType>> = {
  "workflow.name": boundedLabel,
  "workflow.purpose": boundedTextValue,
  "workflow.scope": policySchema,
  "request.initiator_policy": z.object({ mode: z.enum(["any_employee", "directory_role", "requester_selected"]), description: boundedTextValue }).strict(),
  "request.fields": z.array(fieldSchema).min(1).max(100),
  "attachments.requirements": z.array(attachmentSchema).max(50),
  "workflow.stages": z.array(stageSchema).min(1).max(100),
  "workflow.conditions": z.array(conditionSchema).max(50),
  "workflow.rejection_policy": z.object({ action: z.enum(["return_for_correction", "close", "route_to_stage"]), route: boundedLabel.optional() }).strict(),
  "collaboration.policy": policySchema,
  "timing.rules": z.object({ defaultDueHours: z.number().int().min(1).max(8760).optional(), escalation: policySchema.optional() }).strict(),
  "visibility.policy": policySchema,
  "notifications.rules": z.array(z.object({ event: boundedLabel, recipients: z.array(boundedLabel).min(1).max(50), channel: z.enum(["in_app", "email"]) }).strict()).max(100),
  "governance.owner": boundedLabel,
  "governance.policies": z.array(boundedTextValue).max(50),
  "governance.retention": z.object({ period: boundedLabel, rationale: boundedTextValue.optional() }).strict(),
};

const v2BaseSchema = z.object({
  schemaVersion: z.literal(2),
  locale: templateCopilotLocaleSchema.default("en"),
  businessUnitId: z.string().uuid(),
  businessName: z.string().trim().min(1).max(200),
  departmentId: z.string().uuid(),
  departmentName: z.string().trim().min(1).max(200),
  questionLibraryVersion: z.string().trim().min(1).max(64),
  facts: z.record(z.enum(templateCopilotFactIds), templateCopilotFactEntrySchema),
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
      const schema = entry.status === "committed" ? committedValueSchemas[id] : candidateValueSchema;
      if (!schema.safeParse(entry.canonicalValue).success) {
        context.addIssue({ code: "custom", path: ["facts", id, "canonicalValue"], message: "Canonical value does not match this fact's safe schema." });
      }
    }
    if (entry.status === "conflicting" && entry.conflictValues?.some((value) => !candidateValueSchema.safeParse(value).success)) {
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
    schemaVersion: 2, locale, businessUnitId, businessName, departmentId, departmentName, questionLibraryVersion,
    facts: Object.fromEntries(templateCopilotFactIds.map((id) => [id, emptyFact(id, questionLibraryVersion)])),
    requirementDocumentExtracts: [],
  });
}

const valueCommandSchema = z.object({ canonicalValue: boundedJsonValueSchema, originalWording: z.string().trim().min(1).max(8_000).optional(), provenance: z.array(provenanceSchema).min(1).max(12), locale: templateCopilotLocaleSchema.optional() }).strict();
export const templateCopilotV2FactTransitionSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("record_candidate"), payload: valueCommandSchema }).strict(),
  z.object({ operation: z.literal("human_commit"), payload: valueCommandSchema }).strict(),
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
    return templateCopilotV2LedgerSchema.parse({ ...parsed, facts: { ...parsed.facts, [factId]: entry } });
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
    return Object.freeze({ sectionId, summary: section.summary, sourceMessageIds: Object.freeze([...section.sourceMessageIds]), factIds: Object.freeze([...legacyMappings[sectionId]]), outcome: section.status === "answered" && section.summary ? "candidate" as const : "unresolved" as const });
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
  return { status: "unresolved", provenance: [], questionLibraryVersion, applicabilityCode: definition.appliesWhen, blockingLevel: definition.blockingLevel, dependsOn: [...definition.dependsOn] };
}

function normalizeTransitionEntry(ledger: TemplateCopilotV2Ledger, factId: TemplateCopilotFactId, current: TemplateCopilotFactEntry, transition: V2FactTransition, actorId: string, confirmedAt: string): TemplateCopilotFactEntry {
  const definition = templateCopilotFactDefinitions[factId];
  const build = (status: TemplateCopilotFactStatus, extra: Partial<TemplateCopilotFactEntry> = {}) => templateCopilotFactEntrySchema.parse({ ...emptyFact(factId, ledger.questionLibraryVersion), ...extra, status, applicabilityCode: definition.appliesWhen, blockingLevel: definition.blockingLevel, dependsOn: [...definition.dependsOn] });
  const protectedState = ["committed", "not_applicable", "conflicting"].includes(current.status);
  if (transition.operation === "record_candidate") {
    if (protectedState) throw new TemplateCopilotFactTransitionError("A candidate cannot overwrite a committed, N/A, or conflicting fact.");
    const incoming = { ...transition.payload, canonicalValue: candidateValueSchema.parse(transition.payload.canonicalValue) };
    if (current.status === "candidate") {
      const currentCanonicalValue = candidateValueSchema.parse(current.canonicalValue);
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
    if (protectedState) throw new TemplateCopilotFactTransitionError("Unknown cannot overwrite a committed, N/A, or conflicting fact.");
    return build("unknown");
  }
  if (transition.operation === "mark_not_applicable") {
    if (protectedState || definition.appliesWhen === "always") throw new TemplateCopilotFactTransitionError("This fact cannot be marked not applicable without an explicit resolution and coded applicability.");
    return build("not_applicable", { notApplicableReason: transition.reason, confirmation: { actorId: z.string().uuid().parse(actorId), confirmedAt: z.string().datetime({ offset: true }).parse(confirmedAt), operation: "human_mark_not_applicable" } });
  }
  if (transition.operation === "human_commit") {
    if (protectedState) throw new TemplateCopilotFactTransitionError("Human commit cannot overwrite a committed, N/A, or conflicting fact.");
    return build("committed", { ...transition.payload, confirmation: { actorId: z.string().uuid().parse(actorId), confirmedAt: z.string().datetime({ offset: true }).parse(confirmedAt), operation: "human_confirm" } });
  }
  if (current.status !== "conflicting") throw new TemplateCopilotFactTransitionError("Conflict resolution requires an existing conflict.");
  return build("committed", { ...transition.payload, confirmation: { actorId: z.string().uuid().parse(actorId), confirmedAt: z.string().datetime({ offset: true }).parse(confirmedAt), operation: "human_resolve_conflict" } });
}

function sameIds(left: readonly string[], right: readonly string[]) { return left.length === right.length && left.every((id, index) => id === right[index]); }
function sameCanonicalValue(left: unknown, right: unknown) { return stableHash(left) === stableHash(right); }
function mergeProvenance(left: TemplateCopilotFactEntry["provenance"], right: TemplateCopilotFactEntry["provenance"]) {
  const result = [...left];
  for (const item of right) if (!result.some((existing) => stableHash(existing) === stableHash(item))) result.push(item);
  return result.slice(0, 12);
}
function stableHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
