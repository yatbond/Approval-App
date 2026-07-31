import { createHash } from "node:crypto";
import type {
  TemplateCopilotV3LocatedQuoteItem,
  TemplateCopilotV3ProviderQuoteKind,
  TemplateCopilotV3ProviderQuoteRole,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  templateCopilotV3CanonicalDecimalText,
  templateCopilotV3DirectEvidenceDerivesLeaf,
  templateCopilotV3EvidenceCompilerVersion,
  templateCopilotV3EvidenceContractVersion,
  templateCopilotV3ExtractionEnvelopeSchema,
  templateCopilotV3FragmentId,
  templateCopilotV3FragmentSchema,
  templateCopilotV3NormalizeLexicalText,
  templateCopilotV3NormalizeTrimCollapseText,
  templateCopilotV3SourceSpanId,
  templateCopilotV3SourceSpanSchema,
  validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority,
  validateTemplateCopilotV3SourceSpan,
  type TemplateCopilotV3ExtractionEnvelope,
  type TemplateCopilotV3Fragment,
  type TemplateCopilotV3FragmentFactId,
  type TemplateCopilotV3SourceSpan,
} from "./template-copilot-v3-evidence.ts";
import {
  templateCopilotV3ImmediateDefaultRouteIsAffirmative,
  templateCopilotV3MatchingRouteIsAffirmative,
  templateCopilotV3RouteFirstPredicateIsAffirmative,
  templateCopilotV3SliceConditionRouteClause,
  type TemplateCopilotV3ConditionRouteHint,
} from "./template-copilot-v3-condition-route-grammar.ts";

type Confidence = "low" | "medium" | "high";
type Ambiguity = "none" | "possible" | "ambiguous";
type Binding = TemplateCopilotV3Fragment["bindings"][number];
type Rule = Binding["rule"];

const arrayFactByKind = {
  request_field: "request.fields",
  attachment: "attachments.requirements",
  stage: "workflow.stages",
  condition: "workflow.conditions",
  notification: "notifications.rules",
} as const;
const semanticFactByKind = {
  workflow_name: "workflow.name",
  workflow_purpose: "workflow.purpose",
  workflow_scope: "workflow.scope",
  initiator: "request.initiator_policy",
  rejection: "workflow.rejection_policy",
  collaboration: "collaboration.policy",
  timing: "timing.rules",
  visibility: "visibility.policy",
  governance_owner: "governance.owner",
  governance_policy: "governance.policies",
  retention: "governance.retention",
} as const;
const policyKinds = new Set<TemplateCopilotV3ProviderQuoteKind>([
  "rejection", "collaboration", "timing", "visibility", "governance_policy", "retention",
]);
const requiredPaths: Readonly<Record<TemplateCopilotV3FragmentFactId, readonly string[]>> = {
  "request.fields": ["/label", "/type", "/required", "/options"],
  "attachments.requirements": ["/id", "/label", "/kind", "/required", "/formats", "/minimumQuantity", "/maximumQuantity", "/stage", "/contributorPolicy", "/confirmationPolicy"],
  "workflow.stages": ["/label", "/kind", "/participant/mode", "/sequence"],
  "workflow.conditions": ["/id", "/sequence", "/field", "/operator", "/value", "/matchingRoute", "/otherwiseRoute"],
  "notifications.rules": ["/id", "/event", "/recipients", "/timing/mode", "/channel", "/visibility"],
};
const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
const ambiguityRank = { none: 0, possible: 1, ambiguous: 2 } as const;

type SourceOrder = Readonly<{ messageId: string; messageIndex: number; startCodePoint: number; endCodePoint: number }>;
export type TemplateCopilotV3ReviewRelationship = Readonly<{ relationship: "sequential" | "parallel"; sourceSpan: TemplateCopilotV3SourceSpan }>;
export type TemplateCopilotV3ReviewObservation = Readonly<{ role: TemplateCopilotV3ProviderQuoteRole; quote: string; advisoryHint: string | null; sourceSpan: TemplateCopilotV3SourceSpan }>;
export type TemplateCopilotV3ReviewBlockingReason =
  | "compound_predicate_not_executable"
  | "unsupported_semantics_not_executable";
export type TemplateCopilotV3ReviewArrayItem = Readonly<{
  reviewItemId: string;
  fragmentId: string | null;
  factId: TemplateCopilotV3FragmentFactId;
  value: Readonly<Record<string, unknown>>;
  bindings: readonly Binding[];
  missingPaths: readonly string[];
  complete: boolean;
  semanticComplete: boolean;
  persisted: false;
  executable: false;
  defaulted: false;
  confidence: Confidence;
  ambiguity: Ambiguity;
  blockingReason?: TemplateCopilotV3ReviewBlockingReason;
  ambiguityNote?: string;
  observedRoles: readonly TemplateCopilotV3ProviderQuoteRole[];
  semanticValue: Readonly<Partial<Record<TemplateCopilotV3ProviderQuoteRole, readonly string[]>>>;
  semanticLeaves: readonly TemplateCopilotV3ReviewObservation[];
  semanticObservations: readonly TemplateCopilotV3ReviewObservation[];
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[];
  relationships: readonly TemplateCopilotV3ReviewRelationship[];
  sourceSpans: readonly TemplateCopilotV3SourceSpan[];
  sourceMessageIds: readonly string[];
  sourceOrder: SourceOrder;
  providerItemIndexes: readonly number[];
  conflictGroupId?: string;
}>;
export type TemplateCopilotV3SemanticReviewItem = Readonly<{
  projectionId: string;
  kind: keyof typeof semanticFactByKind;
  factId: (typeof semanticFactByKind)[keyof typeof semanticFactByKind];
  quote: string;
  sourceSpan: TemplateCopilotV3SourceSpan;
  leaves: readonly Readonly<{ role: TemplateCopilotV3ProviderQuoteRole; quote: string; advisoryHint: string | null; sourceSpan: TemplateCopilotV3SourceSpan }>[];
  confidence: Confidence;
  ambiguity: Ambiguity;
  sourceOrder: SourceOrder;
  reviewOnly: true;
  persisted: false;
  executable: false;
  defaulted: false;
}>;
export type TemplateCopilotV3ReviewConflict = Readonly<{ conflictId: string; factId: TemplateCopilotV3FragmentFactId; groupingKey: string; paths: readonly string[]; reviewItemIds: readonly string[] }>;

export function templateCopilotV3ReviewItemId(
  input: Pick<
    TemplateCopilotV3ReviewArrayItem,
    | "factId"
    | "value"
    | "bindings"
    | "missingPaths"
    | "sourceSpans"
    | "sourceAnchors"
    | "relationships"
    | "observedRoles"
    | "semanticValue"
    | "semanticLeaves"
    | "semanticObservations"
    | "fragmentId"
    | "complete"
    | "semanticComplete"
    | "persisted"
    | "executable"
    | "defaulted"
    | "blockingReason"
    | "confidence"
    | "ambiguity"
    | "ambiguityNote"
    | "conflictGroupId"
  >,
) {
  const canonicalBindings = input.bindings
    .map((binding) => ({
      path: binding.path,
      rule: binding.rule,
      spanIds: [...new Set(binding.spanIds)].sort(compareText),
    }))
    .sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        compareText(left.rule, right.rule) ||
        compareText(stableJson(left.spanIds), stableJson(right.spanIds)),
    );
  const canonicalRelationships = [
    ...new Map(
      input.relationships.map((entry) => [
        `${entry.relationship}:${entry.sourceSpan.spanId}`,
        {
          relationship: entry.relationship,
          spanId: entry.sourceSpan.spanId,
        },
      ]),
    ).values(),
  ].sort(
    (left, right) =>
      compareText(left.relationship, right.relationship) ||
      compareText(left.spanId, right.spanId),
  );
  const canonicalSourceSpan = (span: TemplateCopilotV3SourceSpan) => ({
    spanId: span.spanId,
    messageId: span.messageId,
    startCodePoint: span.startCodePoint,
    endCodePoint: span.endCodePoint,
    exactText: span.exactText,
  });
  const canonicalSpans = (spans: readonly TemplateCopilotV3SourceSpan[]) =>
    spans
      .map(canonicalSourceSpan)
      .sort((left, right) =>
        compareText(stableJson(left), stableJson(right)),
      );
  const canonicalObservations = (
    observations: readonly TemplateCopilotV3ReviewObservation[],
  ) =>
    observations
      .map((observation) => ({
        role: observation.role,
        quote: observation.quote,
        advisoryHint: observation.advisoryHint,
        sourceSpan: canonicalSourceSpan(observation.sourceSpan),
      }))
      .sort((left, right) =>
        compareText(stableJson(left), stableJson(right)),
      );
  const canonicalSemanticValue = Object.fromEntries(
    Object.entries(input.semanticValue)
      .map(([role, quotes]) => [
        role,
        [...(quotes ?? [])].sort(compareText),
      ] as const)
      .sort(([left], [right]) => compareText(left, right)),
  );
  return hashJson({
    authority: {
      fragmentId: input.fragmentId,
      complete: input.complete,
      semanticComplete: input.semanticComplete,
      persisted: input.persisted,
      executable: input.executable,
      defaulted: input.defaulted,
      missingPaths: [...input.missingPaths].sort(compareText),
      blockingReason: input.blockingReason ?? null,
      confidence: input.confidence,
      ambiguity: input.ambiguity,
      ambiguityNote: input.ambiguityNote ?? null,
      conflictGroupId: input.conflictGroupId ?? null,
    },
    factId: input.factId,
    value: input.value,
    bindings: canonicalBindings,
    sourceSpanIds: [...new Set(input.sourceSpans.map((span) => span.spanId))].sort(
      compareText,
    ),
    relationships: canonicalRelationships,
    semanticAuthority: {
      observedRoles: [...input.observedRoles].sort(compareText),
      semanticValue: canonicalSemanticValue,
      semanticLeaves: canonicalObservations(input.semanticLeaves),
      semanticObservations: canonicalObservations(input.semanticObservations),
      sourceAnchors: canonicalSpans(input.sourceAnchors),
    },
  });
}

export function templateCopilotV3SemanticProjectionId(
  input: Pick<
    TemplateCopilotV3SemanticReviewItem,
    "kind" | "factId" | "sourceSpan" | "leaves" | "confidence" | "ambiguity"
  >,
) {
  const canonicalLeaves = canonicalSemanticProjectionLeaves(input.leaves);
  return hashJson({
    kind: input.kind,
    factId: input.factId,
    anchor: input.sourceSpan.spanId,
    leaves: canonicalLeaves.map((leaf) => ({
      role: leaf.role,
      hint: leaf.advisoryHint,
      spanId: leaf.sourceSpan.spanId,
    })),
    confidence: input.confidence,
    ambiguity: input.ambiguity,
  });
}

export const templateCopilotV3ReviewRejectionCodes = [
  "untraceable_span",
  "unsupported_leaf",
  "unverifiable_leaf",
  "conflicting_leaf",
  "invalid_fragment",
  "invalid_envelope",
  "empty_item",
] as const;
export type TemplateCopilotV3ReviewRejection = Readonly<{
  itemIndex: number;
  kind: TemplateCopilotV3ProviderQuoteKind;
  code: (typeof templateCopilotV3ReviewRejectionCodes)[number];
  detail: string;
}>;
export type TemplateCopilotV3ReviewAssembly = Readonly<{
  envelope: TemplateCopilotV3ExtractionEnvelope;
  review: Readonly<{
    items: readonly TemplateCopilotV3ReviewArrayItem[];
    scalarFacts: readonly TemplateCopilotV3SemanticReviewItem[];
    policyItems: readonly TemplateCopilotV3SemanticReviewItem[];
    conflicts: readonly TemplateCopilotV3ReviewConflict[];
    rejections: readonly TemplateCopilotV3ReviewRejection[];
  }>;
}>;

type Leaf = { value: string | number | boolean | readonly string[]; rule: Rule; spans: TemplateCopilotV3SourceSpan[] };
type Draft = {
  itemIndex: number;
  kind: keyof typeof arrayFactByKind;
  factId: TemplateCopilotV3FragmentFactId;
  anchor: TemplateCopilotV3SourceSpan;
  leaves: Map<string, Leaf>;
  arrays: Map<string, Map<string, Leaf>>;
  relationships: TemplateCopilotV3ReviewRelationship[];
  observedRoles: Set<TemplateCopilotV3ProviderQuoteRole>;
  semanticObservations: TemplateCopilotV3ReviewObservation[];
  semanticAuthorityBlocked: boolean;
  semanticContexts: TemplateCopilotV3SourceSpan[];
  sourceAnchors: TemplateCopilotV3SourceSpan[];
  confidence: Confidence;
  ambiguity: Ambiguity;
};
type Cluster = Omit<Draft, "itemIndex" | "kind"> & { groupingKey: string; itemIndexes: number[] };
type Mapping =
  | Readonly<{ kind: "scalar"; path: string; mode: "text" | "enum" | "boolean" | "number" | "condition_value" | "route" }>
  | Readonly<{ kind: "array"; path: string; mode: "text" | "enum" }>
  | Readonly<{ kind: "relationship" }>
  | Readonly<{ kind: "semantic_only" }>;

export function assembleTemplateCopilotV3Review({ items, sourceMessages, sourceMessageOrder }: {
  items: readonly TemplateCopilotV3LocatedQuoteItem[];
  sourceMessages: Readonly<Record<string, string>>;
  sourceMessageOrder?: readonly string[];
}): TemplateCopilotV3ReviewAssembly {
  const order = makeOrder(sourceMessages, sourceMessageOrder);
  const compareSpans = (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) =>
    (order.get(left.messageId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.messageId) ?? Number.MAX_SAFE_INTEGER) ||
    compareText(left.messageId, right.messageId) || left.startCodePoint - right.startCodePoint ||
    left.endCodePoint - right.endCodePoint || compareText(left.spanId, right.spanId);
  const rejections: TemplateCopilotV3ReviewRejection[] = [];
  const drafts: Draft[] = [];
  const scalarFacts: TemplateCopilotV3SemanticReviewItem[] = [];
  const policyItems: TemplateCopilotV3SemanticReviewItem[] = [];
  for (const item of [...items].sort((a, b) => compareSpans(a.anchor, b.anchor) || compareText(a.kind, b.kind) || a.itemIndex - b.itemIndex)) {
    if (Object.hasOwn(arrayFactByKind, item.kind)) {
      const draft = compileArrayItem(item as TemplateCopilotV3LocatedQuoteItem & { kind: keyof typeof arrayFactByKind }, sourceMessages, compareSpans, rejections);
      if (draft) drafts.push(draft);
    } else if (Object.hasOwn(semanticFactByKind, item.kind)) {
      const projected = compileSemanticItem(item as TemplateCopilotV3LocatedQuoteItem & { kind: keyof typeof semanticFactByKind }, sourceMessages, order, rejections);
      if (projected) (policyKinds.has(item.kind) ? policyItems : scalarFacts).push(projected);
    }
  }
  const groups = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const key = groupKey(draft);
    groups.set(key, [...(groups.get(key) ?? []), draft]);
  }
  const completeItems: TemplateCopilotV3ReviewArrayItem[] = [];
  const partialItems: Array<{ item: TemplateCopilotV3ReviewArrayItem; fragment: TemplateCopilotV3Fragment }> = [];
  const conflicts: TemplateCopilotV3ReviewConflict[] = [];
  for (const [key, group] of [...groups].sort(([a], [b]) => compareText(a, b))) {
    const paths = findDraftConflictPaths(group);
    const clusters = clusterDraftsDeterministically(
      key,
      group,
      paths,
      compareSpans,
    );
    const conflictGroupId = paths.length > 0
      ? hashJson({ factId: clusters[0].factId, key, paths })
      : undefined;
    const groupItems: TemplateCopilotV3ReviewArrayItem[] = [];
    for (const cluster of clusters) {
      const result = finishCluster(cluster, sourceMessages, order, compareSpans, conflictGroupId, rejections);
      if (!result) continue;
      groupItems.push(result.item);
      if (result.fragment) partialItems.push({ item: result.item, fragment: result.fragment });
      else completeItems.push(result.item);
    }
    if (conflictGroupId && groupItems.length > 1) conflicts.push({ conflictId: conflictGroupId, factId: clusters[0].factId, groupingKey: key, paths, reviewItemIds: groupItems.map((item) => item.reviewItemId).sort(compareText) });
  }
  let envelope = templateCopilotV3ExtractionEnvelopeSchema.parse({ contractVersion: templateCopilotV3EvidenceContractVersion, compilerVersion: templateCopilotV3EvidenceCompilerVersion, sourceSpans: [], fragments: [] });
  const acceptedPartial: TemplateCopilotV3ReviewArrayItem[] = [];
  for (const candidate of partialItems.sort((a, b) => compareReviewItems(a.item, b.item))) {
    const used = new Set(candidate.fragment.bindings.flatMap((binding) => binding.spanIds));
    const sourceSpans = dedupeSpans([...envelope.sourceSpans, ...candidate.item.sourceSpans.filter((span) => used.has(span.spanId))], compareSpans);
    const parsed = templateCopilotV3ExtractionEnvelopeSchema.safeParse({ contractVersion: templateCopilotV3EvidenceContractVersion, compilerVersion: templateCopilotV3EvidenceCompilerVersion, sourceSpans, fragments: [...envelope.fragments, candidate.fragment] });
    if (!parsed.success || !validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(parsed.data, sourceMessages)) {
      rejections.push({ itemIndex: candidate.item.providerItemIndexes[0] ?? -1, kind: kindForFact(candidate.item.factId), code: "invalid_envelope", detail: `${candidate.item.factId}:${candidate.item.reviewItemId}` });
      continue;
    }
    envelope = parsed.data;
    acceptedPartial.push(candidate.item);
  }
  return Object.freeze({
    envelope,
    review: Object.freeze({
      items: Object.freeze([...completeItems, ...acceptedPartial].sort(compareReviewItems)),
      scalarFacts: Object.freeze(dedupeSemantic(scalarFacts)),
      policyItems: Object.freeze(dedupeSemantic(policyItems)),
      conflicts: Object.freeze(conflicts.sort((a, b) => compareText(a.conflictId, b.conflictId))),
      rejections: Object.freeze(rejections.sort((a, b) => a.itemIndex - b.itemIndex || compareText(a.kind, b.kind) || compareText(a.code, b.code) || compareText(a.detail, b.detail))),
    }),
  });
}

function compileArrayItem(
  item: TemplateCopilotV3LocatedQuoteItem & { kind: keyof typeof arrayFactByKind },
  messages: Readonly<Record<string, string>>,
  compareSpans: (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) => number,
  rejections: TemplateCopilotV3ReviewRejection[],
): Draft | null {
  if (!validSpan(item.anchor, messages)) {
    rejections.push(rejection(item, "untraceable_span", `${item.kind}:anchor`));
    return null;
  }
  const factId = arrayFactByKind[item.kind];
  const semanticContexts = semanticContextsForArrayItem(
    factId,
    item.anchor,
    messages,
  );
  if (semanticContexts === null) {
    rejections.push(
      rejection(item, "untraceable_span", `${item.kind}:semantic_context`),
    );
    return null;
  }
  const draft: Draft = { itemIndex: item.itemIndex, kind: item.kind, factId, anchor: item.anchor, leaves: new Map(), arrays: new Map(), relationships: [], observedRoles: new Set(), semanticObservations: [], semanticAuthorityBlocked: false, semanticContexts, sourceAnchors: [item.anchor], confidence: item.confidence, ambiguity: item.ambiguity };
  const suppliedObservations = item.leaves.map((supplied) =>
    Object.freeze({
      role: supplied.role,
      quote: supplied.sourceSpan.exactText,
      advisoryHint: supplied.hint,
      sourceSpan: supplied.sourceSpan,
    }),
  );
  draft.semanticAuthorityBlocked =
    semanticCoreObservationsCrossHardClause(
      factId,
      suppliedObservations,
      semanticContexts,
    ) ||
    suppliedObservations.some(
      (observation) =>
        semanticCoreRole(factId, observation.role) &&
        semanticObservationIsContradicted(
          factId,
          observation,
          semanticContexts,
        ),
    );
  const conflictedPaths = new Set<string>();
  for (const supplied of item.leaves) {
    if (!validSpan(supplied.sourceSpan, messages)) {
      rejections.push(rejection(item, "untraceable_span", `${item.kind}:${supplied.role}`));
      continue;
    }
    const mapping = mappingFor(item.kind, supplied.role, supplied.hint);
    if (!mapping) {
      rejections.push(rejection(item, "unsupported_leaf", `${item.kind}:${supplied.role}`));
      continue;
    }
    draft.observedRoles.add(supplied.role);
    draft.semanticObservations.push(
      Object.freeze({
        role: supplied.role,
        quote: supplied.sourceSpan.exactText,
        advisoryHint: supplied.hint,
        sourceSpan: supplied.sourceSpan,
      }),
    );
    if (mapping.kind === "semantic_only") continue;
    if (mapping.kind === "relationship") {
      const relationship = deriveRelationship(supplied.hint, supplied.sourceSpan.exactText);
      if (!relationship) rejections.push(rejection(item, "unverifiable_leaf", `${item.kind}:${supplied.role}`));
      else draft.relationships.push(Object.freeze({ relationship, sourceSpan: supplied.sourceSpan }));
      continue;
    }
    if (mapping.kind === "array" && emptyCollectionDerives(factId, mapping.path, supplied.sourceSpan.exactText)) {
      if (draft.arrays.has(mapping.path)) {
        conflictedPaths.add(mapping.path);
        continue;
      }
      draft.leaves.set(mapping.path, { value: [], rule: "explicit_empty_collection", spans: [supplied.sourceSpan] });
      continue;
    }
    const derived = deriveLeaf(factId, mapping, supplied.hint, supplied.sourceSpan);
    if (!derived) {
      rejections.push(rejection(item, "unverifiable_leaf", `${item.kind}:${supplied.role}`));
      continue;
    }
    if (mapping.kind === "array") {
      if (draft.leaves.has(mapping.path)) {
        conflictedPaths.add(mapping.path);
        continue;
      }
      const values = draft.arrays.get(mapping.path) ?? new Map<string, Leaf>();
      const key = stableJson(derived.value);
      const current = values.get(key);
      values.set(key, current ? { ...current, spans: dedupeSpans([...current.spans, supplied.sourceSpan], compareSpans) } : { ...derived, spans: [supplied.sourceSpan] });
      draft.arrays.set(mapping.path, values);
      continue;
    }
    const current = draft.leaves.get(mapping.path);
    if (current && stableJson(current.value) !== stableJson(derived.value)) {
      conflictedPaths.add(mapping.path);
      continue;
    }
    draft.leaves.set(mapping.path, current ? { ...current, spans: dedupeSpans([...current.spans, supplied.sourceSpan], compareSpans) } : { ...derived, spans: [supplied.sourceSpan] });
  }
  for (const path of semanticObservationConflictPaths(draft)) {
    conflictedPaths.add(path);
  }
  if (conflictedPaths.size > 0) {
    for (const path of [...conflictedPaths].sort(compareText)) {
      rejections.push(rejection(item, "conflicting_leaf", `${item.kind}:${path}`));
    }
    return null;
  }
  if (draft.leaves.size === 0 && draft.arrays.size === 0 && draft.semanticObservations.length === 0) {
    rejections.push(rejection(item, "empty_item", item.kind));
    return null;
  }
  draft.relationships = dedupeRelationships(draft.relationships, compareSpans);
  return draft;
}

function compileSemanticItem(
  item: TemplateCopilotV3LocatedQuoteItem & { kind: keyof typeof semanticFactByKind },
  messages: Readonly<Record<string, string>>,
  order: ReadonlyMap<string, number>,
  rejections: TemplateCopilotV3ReviewRejection[],
): TemplateCopilotV3SemanticReviewItem | null {
  if (!validSpan(item.anchor, messages)) {
    rejections.push(rejection(item, "untraceable_span", `${item.kind}:anchor`));
    return null;
  }
  const leaves = item.leaves.flatMap((leaf) => {
    if (!validSpan(leaf.sourceSpan, messages)) {
      rejections.push(rejection(item, "untraceable_span", `${item.kind}:${leaf.role}`));
      return [];
    }
    return [Object.freeze({ role: leaf.role, quote: leaf.sourceSpan.exactText, advisoryHint: leaf.hint, sourceSpan: leaf.sourceSpan })];
  });
  const canonicalLeaves = canonicalSemanticProjectionLeaves(leaves);
  if (canonicalLeaves.length === 0) {
    rejections.push(rejection(item, "empty_item", item.kind));
    return null;
  }
  const base = {
    kind: item.kind,
    factId: semanticFactByKind[item.kind],
    quote: item.anchor.exactText,
    sourceSpan: item.anchor,
    leaves: Object.freeze(canonicalLeaves),
    confidence: item.confidence,
    ambiguity: item.ambiguity,
    sourceOrder: orderFor(item.anchor, order),
    reviewOnly: true,
    persisted: false,
    executable: false,
    defaulted: false,
  } as const;
  return Object.freeze({
    projectionId: templateCopilotV3SemanticProjectionId(base),
    ...base,
  });
}

function canonicalSemanticProjectionLeaves(
  leaves: readonly TemplateCopilotV3ReviewObservation[],
) {
  const byIdentity = new Map<string, TemplateCopilotV3ReviewObservation>();
  for (const leaf of leaves) {
    const identity = `${leaf.role}|${leaf.advisoryHint ?? ""}|${leaf.sourceSpan.spanId}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, leaf);
  }
  return [...byIdentity.values()].sort(
    (left, right) =>
      compareText(left.role, right.role) ||
      compareText(left.advisoryHint ?? "", right.advisoryHint ?? "") ||
      compareText(left.sourceSpan.spanId, right.sourceSpan.spanId),
  );
}
function mappingFor(
  kind: keyof typeof arrayFactByKind,
  role: TemplateCopilotV3ProviderQuoteRole,
  hint: string | null,
): Mapping | null {
  if (kind === "stage" && role === "kind" && hint === "record_update") {
    return { kind: "semantic_only" };
  }
  const maps: Record<keyof typeof arrayFactByKind, Partial<Record<TemplateCopilotV3ProviderQuoteRole, Mapping>>> = {
    request_field: {
      label: { kind: "scalar", path: "/label", mode: "text" },
      type: { kind: "scalar", path: "/type", mode: "enum" },
      required: { kind: "scalar", path: "/required", mode: "boolean" },
      option: { kind: "array", path: "/options", mode: "text" },
    },
    attachment: {
      label: { kind: "scalar", path: "/label", mode: "text" },
      kind: { kind: "scalar", path: "/kind", mode: "enum" },
      required: { kind: "scalar", path: "/required", mode: "boolean" },
      format: { kind: "array", path: "/formats", mode: "enum" },
      minimum_quantity: { kind: "scalar", path: "/minimumQuantity", mode: "number" },
      maximum_quantity: { kind: "scalar", path: "/maximumQuantity", mode: "number" },
      conditional_quantity_increment: { kind: "semantic_only" },
      maximum_file_size_mb: { kind: "scalar", path: "/maximumFileSizeMb", mode: "number" },
      stage: { kind: "scalar", path: "/stage", mode: "route" },
      contributor_policy: { kind: "scalar", path: "/contributorPolicy", mode: "enum" },
      confirmation_policy: { kind: "scalar", path: "/confirmationPolicy", mode: "enum" },
    },
    stage: {
      label: { kind: "scalar", path: "/label", mode: "text" },
      kind: { kind: "scalar", path: "/kind", mode: "enum" },
      participant_mode: { kind: "scalar", path: "/participant/mode", mode: "enum" },
      participant: { kind: "scalar", path: "/participant/value", mode: "text" },
      sequence: { kind: "scalar", path: "/sequence", mode: "number" },
      relationship: { kind: "relationship" },
    },
    condition: {
      sequence: { kind: "scalar", path: "/sequence", mode: "number" },
      field: { kind: "scalar", path: "/field", mode: "text" },
      operator: { kind: "scalar", path: "/operator", mode: "enum" },
      value: { kind: "scalar", path: "/value", mode: "condition_value" },
      currency: { kind: "semantic_only" },
      unit: { kind: "scalar", path: "/unit", mode: "text" },
      matching_route: { kind: "scalar", path: "/matchingRoute", mode: "route" },
      otherwise_route: { kind: "scalar", path: "/otherwiseRoute", mode: "route" },
    },
    notification: {
      event: { kind: "scalar", path: "/event", mode: "enum" },
      recipient: { kind: "array", path: "/recipients", mode: "enum" },
      timing_mode: { kind: "scalar", path: "/timing/mode", mode: "enum" },
      offset_hours: { kind: "scalar", path: "/timing/offsetHours", mode: "number" },
      channel: { kind: "scalar", path: "/channel", mode: "enum" },
      visibility: { kind: "scalar", path: "/visibility", mode: "enum" },
      stage: { kind: "scalar", path: "/stage", mode: "route" },
    },
  };
  return maps[kind][role] ?? null;
}

function deriveLeaf(factId: TemplateCopilotV3FragmentFactId, mapping: Exclude<Mapping, { kind: "relationship" } | { kind: "semantic_only" }>, hint: string | null, span: TemplateCopilotV3SourceSpan): Omit<Leaf, "spans"> | null {
  let value: string | number | boolean;
  let rule: Rule;
  if (
    hint === "unsupported_predicate" ||
    hint === "unsupported_outcome" ||
    hint === "conditional" ||
    hint === "required_with_conditional_extension" ||
    hint === "optional_conditional"
  ) {
    return null;
  }
  if (mapping.mode === "text") {
    value = templateCopilotV3NormalizeTrimCollapseText(span.exactText);
    if (!value) return null;
    rule = "nfkc_trim_collapse";
  } else if (mapping.mode === "enum") {
    if (!hint || hint === "source_named_group") return null;
    value = hint;
    rule = "enum_lexical";
  } else if (mapping.mode === "boolean") {
    if (hint !== "true" && hint !== "false") return null;
    value = hint === "true";
    rule = "boolean_lexical";
  } else if (mapping.mode === "number") {
    const pointer = mapping.path;
    const numeric = deriveNumericValue(factId, pointer, span.exactText);
    if (numeric === null) return null;
    value = numeric;
    rule = "numeric_lexical";
  } else if (mapping.mode === "condition_value") {
    const canonical = templateCopilotV3CanonicalDecimalText(span.exactText);
    if (canonical === null) {
      value = templateCopilotV3NormalizeTrimCollapseText(span.exactText);
      if (!value) return null;
      rule = "nfkc_trim_collapse";
    } else {
      value = Number(canonical);
      rule = "numeric_lexical";
    }
  } else {
    if (hint === "stage_reference") {
      const text = templateCopilotV3NormalizeTrimCollapseText(span.exactText);
      value = text.startsWith("stage:") ? text : `stage:${text}`;
    } else if (hint === "condition_reference") {
      const text = templateCopilotV3NormalizeLexicalText(span.exactText);
      if (!/^[a-z][a-z0-9_-]+$/.test(text)) return null;
      value = `condition:${text}`;
    } else if (hint === "request_submission" || hint === "complete" || hint === "return_for_correction") value = hint;
    else return null;
    rule = "enum_lexical";
  }
  const pointer = mapping.kind === "array" ? `${mapping.path}/0` : mapping.path;
  const testValue: Record<string, unknown> = {};
  setAt(testValue, pointer, value);
  return templateCopilotV3DirectEvidenceDerivesLeaf({ factId, path: pointer, rule, value: testValue, sourceText: span.exactText }) ? { value, rule } : null;
}

function deriveNumericValue(factId: TemplateCopilotV3FragmentFactId, path: string, sourceText: string) {
  const canonical = templateCopilotV3CanonicalDecimalText(sourceText);
  if (canonical !== null) return Number(canonical);
  const maximum = path === "/sequence" && factId === "workflow.stages" ? 100 : path === "/sequence" && factId === "workflow.conditions" ? 50 : 0;
  for (let candidate = 1; candidate <= maximum; candidate += 1) {
    const value: Record<string, unknown> = {};
    setAt(value, path, candidate);
    if (templateCopilotV3DirectEvidenceDerivesLeaf({ factId, path, rule: "numeric_lexical", value, sourceText })) return candidate;
  }
  return null;
}

function emptyCollectionDerives(factId: TemplateCopilotV3FragmentFactId, path: string, sourceText: string) {
  const value: Record<string, unknown> = {};
  setAt(value, path, []);
  return templateCopilotV3DirectEvidenceDerivesLeaf({ factId, path, rule: "explicit_empty_collection", value, sourceText });
}

function deriveRelationship(hint: string | null, text: string): "sequential" | "parallel" | null {
  if (hint !== "parallel" && hint !== "sequential") return null;
  const wording = templateCopilotV3NormalizeLexicalText(text);
  const aliases = hint === "parallel" ? ["parallel", "in parallel", "simultaneously", "同時", "同时", "並行", "并行"] : ["sequential", "sequentially", "in sequence", "依次", "順序", "顺序"];
  return aliases.some((alias) => templateCopilotV3NormalizeLexicalText(alias) === wording) ? hint : null;
}

function groupKey(draft: Draft) {
  const identityPath = draft.factId === "workflow.conditions" ? "/sequence" : draft.factId === "notifications.rules" ? null : "/label";
  const identity = identityPath ? draft.leaves.get(identityPath)?.value : undefined;
  const sourceIdentity = `${draft.anchor.messageId}:${draft.anchor.startCodePoint}:${draft.anchor.endCodePoint}:${draft.anchor.spanId}`;
  const local = `source:${sourceIdentity}|${identity === undefined ? "anonymous" : `identity:${stableJson(identity)}`}`;
  return `${draft.factId}|${local}`;
}

function clusterOf(groupingKey: string, draft: Draft): Cluster {
  return { factId: draft.factId, anchor: draft.anchor, groupingKey, leaves: cloneLeaves(draft.leaves), arrays: cloneArrays(draft.arrays), relationships: [...draft.relationships], observedRoles: new Set(draft.observedRoles), semanticObservations: [...draft.semanticObservations], semanticAuthorityBlocked: draft.semanticAuthorityBlocked, semanticContexts: [...draft.semanticContexts], sourceAnchors: [...draft.sourceAnchors], confidence: draft.confidence, ambiguity: draft.ambiguity, itemIndexes: [draft.itemIndex] };
}
function findDraftConflictPaths(drafts: readonly Draft[]) {
  const candidatePaths = new Set(
    drafts.flatMap((draft) => [
      ...draft.leaves.keys(),
      ...semanticObservationConflictCandidatePaths(draft),
    ]),
  );
  const valuesByPath = new Map<string, Set<string>>();
  for (const path of candidatePaths) {
    for (const draft of drafts) {
      const conflictValue = draftConflictValue(draft, path);
      if (!conflictValue.present) continue;
      const values = valuesByPath.get(path) ?? new Set<string>();
      values.add(stableJson(conflictValue.value));
      valuesByPath.set(path, values);
    }
  }
  return [...valuesByPath]
    .filter(([, values]) => values.size > 1)
    .map(([path]) => path)
    .sort(compareText);
}

function semanticObservationConflictCandidatePaths(draft: Draft) {
  return draft.factId === "workflow.stages" &&
      semanticStageKindValues(draft).length > 0
    ? ["/kind"]
    : [];
}

function semanticObservationConflictPaths(draft: Draft) {
  return semanticStageKindValues(draft).length > 1 ? ["/kind"] : [];
}

function semanticStageKindValues(draft: Draft) {
  return [
    ...new Set(
      draft.semanticObservations
        .filter(
          (observation) =>
            observation.role === "kind" &&
            observation.advisoryHint !== null &&
            semanticHintIsVerified(
              draft.factId,
              observation,
              draft.semanticContexts,
            ),
        )
        .map((observation) => observation.advisoryHint as string),
    ),
  ].sort(compareText);
}

function draftConflictValue(draft: Draft, path: string):
  | Readonly<{ present: true; value: unknown }>
  | Readonly<{ present: false }> {
  const leaf = draft.leaves.get(path);
  if (leaf) return { present: true, value: leaf.value };
  if (draft.factId === "workflow.stages" && path === "/kind") {
    const values = semanticStageKindValues(draft);
    if (values.length === 1) return { present: true, value: values[0] };
  }
  return { present: false };
}

function clusterDraftsDeterministically(
  groupingKey: string,
  drafts: readonly Draft[],
  conflictPaths: readonly string[],
  compareSpans: (
    left: TemplateCopilotV3SourceSpan,
    right: TemplateCopilotV3SourceSpan,
  ) => number,
) {
  const partitions = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const conflictSignature = draftConflictSignature(draft, conflictPaths);
    const partitionKey =
      conflictPaths.length === 0
        ? "compatible"
        : conflictSignature === null
          ? `underspecified:${canonicalDraftContentKey(draft)}`
          : `alternative:${conflictSignature}`;
    partitions.set(partitionKey, [
      ...(partitions.get(partitionKey) ?? []),
      draft,
    ]);
  }
  return [...partitions]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, partition]) => {
      const ordered = [...partition].sort(
        (left, right) =>
          compareText(
            canonicalDraftContentKey(left),
            canonicalDraftContentKey(right),
          ) ||
          compareSpans(left.anchor, right.anchor) ||
          left.itemIndex - right.itemIndex,
      );
      const [first, ...remaining] = ordered;
      if (!first) {
        throw new Error("A deterministic conflict partition cannot be empty.");
      }
      const cluster = clusterOf(groupingKey, first);
      for (const draft of remaining) {
        mergeInto(cluster, draft, compareSpans);
      }
      return cluster;
    });
}

function draftConflictSignature(
  draft: Draft,
  conflictPaths: readonly string[],
) {
  const entries: Array<readonly [string, unknown]> = [];
  for (const path of conflictPaths) {
    const conflictValue = draftConflictValue(draft, path);
    if (!conflictValue.present) return null;
    entries.push([path, conflictValue.value]);
  }
  return stableJson(entries);
}

function canonicalDraftContentKey(draft: Draft) {
  return stableJson({
    factId: draft.factId,
    anchor: draft.anchor.spanId,
    leaves: [...draft.leaves]
      .map(([path, leaf]) => ({
        path,
        value: leaf.value,
        rule: leaf.rule,
        spanIds: [...new Set(leaf.spans.map((span) => span.spanId))].sort(
          compareText,
        ),
      }))
      .sort((left, right) => compareText(left.path, right.path)),
    arrays: [...draft.arrays]
      .map(([path, values]) => ({
        path,
        values: [...values.values()]
          .map((leaf) => ({
            value: leaf.value,
            rule: leaf.rule,
            spanIds: [...new Set(leaf.spans.map((span) => span.spanId))].sort(
              compareText,
            ),
          }))
          .sort((left, right) =>
            compareText(stableJson(left), stableJson(right))
          ),
      }))
      .sort((left, right) => compareText(left.path, right.path)),
    relationships: draft.relationships
      .map((entry) => ({
        relationship: entry.relationship,
        spanId: entry.sourceSpan.spanId,
      }))
      .sort(
        (left, right) =>
          compareText(left.relationship, right.relationship) ||
          compareText(left.spanId, right.spanId),
      ),
    observedRoles: [...draft.observedRoles].sort(compareText),
    semanticAuthorityBlocked: draft.semanticAuthorityBlocked,
    semanticObservations: draft.semanticObservations
      .map((entry) => ({
        role: entry.role,
        hint: entry.advisoryHint,
        spanId: entry.sourceSpan.spanId,
      }))
      .sort(
        (left, right) =>
          compareText(left.role, right.role) ||
          compareText(left.hint ?? "", right.hint ?? "") ||
          compareText(left.spanId, right.spanId),
      ),
    semanticContexts: [
      ...new Set(draft.semanticContexts.map((span) => span.spanId)),
    ].sort(compareText),
    sourceAnchors: [
      ...new Set(draft.sourceAnchors.map((span) => span.spanId)),
    ].sort(compareText),
  });
}
function mergeInto(cluster: Cluster, draft: Draft, compareSpans: (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) => number) {
  for (const [path, incoming] of draft.leaves) {
    const current = cluster.leaves.get(path);
    cluster.leaves.set(path, current ? { ...current, spans: dedupeSpans([...current.spans, ...incoming.spans], compareSpans) } : { ...incoming, spans: [...incoming.spans] });
  }
  for (const [path, incomingValues] of draft.arrays) {
    const values = cluster.arrays.get(path) ?? new Map<string, Leaf>();
    for (const [key, incoming] of incomingValues) {
      const current = values.get(key);
      values.set(key, current ? { ...current, spans: dedupeSpans([...current.spans, ...incoming.spans], compareSpans) } : { ...incoming, spans: [...incoming.spans] });
    }
    cluster.arrays.set(path, values);
  }
  cluster.relationships = dedupeRelationships([...cluster.relationships, ...draft.relationships], compareSpans);
  for (const role of draft.observedRoles) cluster.observedRoles.add(role);
  cluster.semanticObservations = dedupeObservations([...cluster.semanticObservations, ...draft.semanticObservations], compareSpans);
  cluster.semanticContexts = dedupeSpans(
    [...cluster.semanticContexts, ...draft.semanticContexts],
    compareSpans,
  );
  cluster.sourceAnchors = dedupeSpans([...cluster.sourceAnchors, ...draft.sourceAnchors], compareSpans);
  cluster.semanticAuthorityBlocked =
    cluster.semanticAuthorityBlocked || draft.semanticAuthorityBlocked;
  if (confidenceRank[draft.confidence] < confidenceRank[cluster.confidence]) cluster.confidence = draft.confidence;
  if (ambiguityRank[draft.ambiguity] > ambiguityRank[cluster.ambiguity]) cluster.ambiguity = draft.ambiguity;
  cluster.itemIndexes = [...new Set([...cluster.itemIndexes, draft.itemIndex])].sort((a, b) => a - b);
}
function finishCluster(
  cluster: Cluster,
  messages: Readonly<Record<string, string>>,
  order: ReadonlyMap<string, number>,
  compareSpans: (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) => number,
  conflictGroupId: string | undefined,
  rejections: TemplateCopilotV3ReviewRejection[],
): { item: TemplateCopilotV3ReviewArrayItem; fragment: TemplateCopilotV3Fragment | null } | null {
  const value: Record<string, unknown> = {};
  const bindings: Binding[] = [];
  for (const [path, leaf] of [...cluster.leaves].sort(([a], [b]) => compareText(a, b))) {
    setAt(value, path, leaf.value);
    bindings.push({ path, spanIds: leaf.spans.map((span) => span.spanId).sort(compareText), rule: leaf.rule });
  }
  for (const [path, values] of [...cluster.arrays].sort(([a], [b]) => compareText(a, b))) {
    const entries = [...values.values()].sort((a, b) => compareSpans(a.spans[0], b.spans[0]) || compareText(stableJson(a.value), stableJson(b.value)));
    setAt(value, path, entries.map((entry) => entry.value));
    entries.forEach((entry, index) => bindings.push({ path: `${path}/${index}`, spanIds: entry.spans.map((span) => span.spanId).sort(compareText), rule: entry.rule }));
  }
  bindings.sort((a, b) => compareText(a.path, b.path));
  if (cluster.factId === "workflow.conditions" && [">", ">=", "<", "<="].includes(String(value.operator ?? "")) && typeof value.value !== "number") {
    delete value.value;
    const valueBinding = bindings.findIndex((binding) => binding.path === "/value");
    if (valueBinding >= 0) bindings.splice(valueBinding, 1);
  }
  const missingPaths = missingPathsFor(cluster.factId, value, bindings);
  const boundSpans = dedupeSpans([
    ...cluster.leaves.values().flatMap((leaf) => leaf.spans),
    ...cluster.arrays.values().flatMap((values) => [...values.values()].flatMap((leaf) => leaf.spans)),
  ], compareSpans);
  const sourceSpans = dedupeSpans([...boundSpans, ...cluster.relationships.map((item) => item.sourceSpan), ...cluster.semanticObservations.map((item) => item.sourceSpan)], compareSpans);
  if (sourceSpans.length === 0) return null;
  const byId = new Map(boundSpans.map((span) => [span.spanId, span]));
  const sourceBound = bindings.every((binding) => binding.spanIds.every((spanId) => {
    const span = byId.get(spanId);
    return span !== undefined && validateTemplateCopilotV3SourceSpan(span, messages) && templateCopilotV3DirectEvidenceDerivesLeaf({ factId: cluster.factId, path: binding.path, rule: binding.rule, value, sourceText: span.exactText });
  }));
  if (!sourceBound) {
    rejections.push({ itemIndex: cluster.itemIndexes[0] ?? -1, kind: kindForFact(cluster.factId), code: "unverifiable_leaf", detail: `${cluster.factId}:assembled` });
    return null;
  }
  let ambiguity = cluster.ambiguity;
  let ambiguityNote: string | undefined;
  if (conflictGroupId) {
    ambiguity = "ambiguous";
    ambiguityNote = "Conflicting source-backed alternatives require human review.";
  } else if (ambiguity !== "none") {
    ambiguityNote = ambiguity === "possible" ? "Provider marked the source-backed wording as possibly ambiguous." : "Provider marked the source-backed wording as ambiguous.";
  }
  const sourceAnchors = dedupeSpans(cluster.sourceAnchors, compareSpans);
  const unsupportedBlockingReason = semanticUnsupportedAuthorityReason(
    cluster.factId,
    cluster.semanticObservations,
    cluster.semanticContexts,
  );
  const compoundPredicateBlocked =
    cluster.factId === "workflow.conditions" &&
    semanticConditionHasCompoundPredicateContext(
      cluster.semanticObservations,
      cluster.semanticContexts,
    );
  const blockingReason: TemplateCopilotV3ReviewBlockingReason | undefined =
    unsupportedBlockingReason ??
    (compoundPredicateBlocked
      ? "compound_predicate_not_executable"
      : undefined);
  const fragmentAuthorityBlocked =
    cluster.semanticAuthorityBlocked ||
    ambiguity !== "none" ||
    blockingReason !== undefined;
  const complete =
    missingPaths.length === 0 && !fragmentAuthorityBlocked;
  const semanticComplete = blockingReason === undefined && semanticallyComplete(
    cluster.factId,
    cluster.semanticObservations,
    cluster.semanticContexts,
    ambiguity,
    conflictGroupId !== undefined,
    cluster.semanticAuthorityBlocked,
  );
  const observedRoles = [...cluster.observedRoles].sort(compareText);
  const base = {
    factId: cluster.factId,
    value,
    bindings,
    missingPaths,
    complete,
    semanticComplete,
    persisted: false as const,
    executable: false as const,
    defaulted: false as const,
    confidence: cluster.confidence,
    ambiguity,
    ...(blockingReason ? { blockingReason } : {}),
    ...(ambiguityNote ? { ambiguityNote } : {}),
    observedRoles,
    semanticValue: semanticValue(cluster.semanticObservations, compareSpans),
    semanticLeaves: dedupeObservations(cluster.semanticObservations, compareSpans),
    semanticObservations: dedupeObservations(cluster.semanticObservations, compareSpans),
    sourceAnchors,
    relationships: cluster.relationships,
    sourceSpans,
    sourceMessageIds: [...new Set(sourceSpans.map((span) => span.messageId))],
    sourceOrder: orderFor(sourceSpans[0], order),
    providerItemIndexes: cluster.itemIndexes,
    ...(conflictGroupId ? { conflictGroupId } : {}),
  };
  const finalize = (fragment: TemplateCopilotV3Fragment | null) => {
    const withoutReviewItemId = {
      fragmentId: fragment?.fragmentId ?? null,
      ...base,
    };
    return {
      item: Object.freeze({
        reviewItemId: templateCopilotV3ReviewItemId(withoutReviewItemId),
        ...withoutReviewItemId,
      }),
      fragment,
    };
  };
  if (bindings.length === 0) return finalize(null);
  if (fragmentAuthorityBlocked) {
    return finalize(null);
  }
  if (complete) {
    if (!validateCompleteItem(cluster.factId, value, bindings, boundSpans, ambiguity, ambiguityNote)) {
      rejections.push({ itemIndex: cluster.itemIndexes[0] ?? -1, kind: kindForFact(cluster.factId), code: "invalid_fragment", detail: `${cluster.factId}:complete_review` });
      return null;
    }
    return finalize(null);
  }
  const withoutId = {
    evidenceVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    factId: cluster.factId,
    fragmentKind: "array_item" as const,
    state: "open" as const,
    value,
    bindings,
    missingPaths,
    confidence: cluster.confidence,
    ambiguity,
    ...(ambiguityNote ? { ambiguityNote } : {}),
  };
  const parsed = templateCopilotV3FragmentSchema.safeParse({ ...withoutId, fragmentId: templateCopilotV3FragmentId(withoutId) });
  if (!parsed.success) {
    rejections.push({ itemIndex: cluster.itemIndexes[0] ?? -1, kind: kindForFact(cluster.factId), code: "invalid_fragment", detail: `${cluster.factId}:${parsed.error.issues[0]?.path.join("/") || "schema"}` });
    return null;
  }
  return finalize(parsed.data);
}

function semanticallyComplete(
  factId: TemplateCopilotV3FragmentFactId,
  observations: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
  ambiguity: Ambiguity,
  conflicted: boolean,
  authorityBlocked: boolean,
) {
  if (ambiguity !== "none" || conflicted || authorityBlocked) return false;
  const leaves = (role: TemplateCopilotV3ProviderQuoteRole) =>
    observations.filter((leaf) => leaf.role === role);
  const raw = (role: TemplateCopilotV3ProviderQuoteRole) =>
    leaves(role).filter(
      (leaf) =>
        templateCopilotV3NormalizeTrimCollapseText(leaf.quote).length > 0,
    );
  const verified = (role: TemplateCopilotV3ProviderQuoteRole) =>
    leaves(role).filter((leaf) =>
      semanticHintIsVerified(factId, leaf, sourceAnchors)
    );
  if (factId === "request.fields") {
    const groups = [raw("label"), verified("required")] as const;
    return groups.every((group) => group.length > 0) &&
      semanticRequestGroupsHaveAffinity(groups[0], groups[1], sourceAnchors);
  }
  if (factId === "attachments.requirements") {
    const groups = [
      raw("label"),
      verified("kind"),
      verified("required"),
    ] as const;
    return groups.every((group) => group.length > 0) &&
      semanticAttachmentGroupsHaveAffinity(
        groups[0],
        groups[1],
        groups[2],
        sourceAnchors,
      );
  }
  if (factId === "workflow.stages") {
    const label = raw("label");
    const kind = verified("kind");
    const participant = [
      ...raw("participant"),
      ...verified("participant_mode"),
    ];
    return label.length > 0 && kind.length > 0 && participant.length > 0 &&
      semanticCoreGroupsShareClause([kind, participant], sourceAnchors);
  }
  if (factId === "workflow.conditions") {
    const predicate = [raw("field"), verified("operator"), raw("value")] as const;
    const matchingRoutes = verified("matching_route");
    const otherwiseRoutes = verified("otherwise_route");
    return (
      predicate.every((group) => group.length > 0) &&
      matchingRoutes.length > 0 &&
      semanticConditionPredicateGroupsHaveAffinity(
        predicate[0],
        predicate[1],
        predicate[2],
        sourceAnchors,
      ) &&
      semanticConditionRoutesHaveAffinity(
        predicate[0],
        predicate[1],
        predicate[2],
        matchingRoutes,
        otherwiseRoutes,
        sourceAnchors,
      )
    );
  }
  const groups = [verified("event"), verified("recipient")] as const;
  return groups.every((group) => group.length > 0) &&
    semanticCoreGroupsShareClause(groups, sourceAnchors);
}

function semanticUnsupportedAuthorityReason(
  factId: TemplateCopilotV3FragmentFactId,
  observations: readonly TemplateCopilotV3ReviewObservation[],
  semanticContexts: readonly TemplateCopilotV3SourceSpan[],
): TemplateCopilotV3ReviewBlockingReason | null {
  if (
    factId === "workflow.conditions" &&
    (
      observations.some((entry) => entry.role === "currency") ||
      observations.some(
        (entry) =>
          (entry.role === "operator" &&
            entry.advisoryHint === "unsupported_predicate") ||
          ((entry.role === "matching_route" ||
            entry.role === "otherwise_route") &&
            entry.advisoryHint === "unsupported_outcome"),
      ) ||
      semanticConditionHasSourceDerivedUnsupportedContext(
        observations,
        semanticContexts,
      ) ||
      semanticConditionHasOmittedAdjacentDefaultBranch(
        observations,
        semanticContexts,
      )
    )
  ) {
    return "unsupported_semantics_not_executable";
  }
  if (
    factId === "workflow.stages" &&
    (
      observations.some(
        (entry) =>
          entry.role === "kind" && entry.advisoryHint === "record_update",
      ) ||
      semanticStageHasSourceDerivedRecordUpdate(
        observations,
        semanticContexts,
      )
    )
  ) {
    return "unsupported_semantics_not_executable";
  }
  if (
    factId === "attachments.requirements" &&
    semanticAttachmentHasConditionalRequirementContext(
      observations,
      semanticContexts,
    )
  ) {
    return "unsupported_semantics_not_executable";
  }
  return null;
}

function semanticConditionHasSourceDerivedUnsupportedContext(
  observations: readonly TemplateCopilotV3ReviewObservation[],
  semanticContexts: readonly TemplateCopilotV3SourceSpan[],
) {
  const normalized = (value: string) =>
    templateCopilotV3NormalizeLexicalText(value);
  const routes = observations
    .filter(
      (entry) =>
        entry.role === "matching_route" ||
        entry.role === "otherwise_route",
    )
    .map((entry) => normalized(entry.quote));
  const fields = observations
    .filter((entry) => entry.role === "field")
    .map((entry) => normalized(entry.quote));
  const values = observations
    .filter((entry) => entry.role === "value")
    .map((entry) => normalized(entry.quote));

  const unsupportedRoute = routes.some(
    (route) =>
      semanticConditionRouteLooksLikeNonStageOutcome(route) ||
      /^(?:high-value\s+approver|board\s+fyi|blocks?\s+submission|does\s+not\s+skip\s+approval|end(?:s)?\s+(?:the\s+workflow\s+)?immediately\s+and\s+record(?:s)?\s+(?:the\s+)?reason|不可完成|不得結案|不得结案|額外審批|额外审批|醫生證明|医生证明|直接結束並記錄原因|直接结束并记录原因)$/u
        .test(route) ||
      /^(?:returns?\b|退回).*(?:confirm|difference|確認|确认|差異|差异)/u
        .test(route) ||
      /(?:\bfyi\b)/u.test(route) ||
      /(?:approval|審批|审批|批准).*(?:clearance\s+proof|清除證明|清除证明)/u
        .test(route) ||
      /^(?:hr)\s*(?:and|&|和|與|与)\s*(?:security|安全)$/u
        .test(route),
  );
  if (unsupportedRoute) return true;

  const numericField = fields.some(
    (field) =>
      /^(?:(?:hkd|usd|rmb|cny)\s*)?[+-]?\d[\d,.]*(?:\s*(?:%|percent|days?|hours?|months?|years?))?$/u
        .test(field) ||
      /^(?:(?:港幣|港币|人民幣|人民币)\s*)?(?:百分之)?[零〇一二三四五六七八九十百千萬万億亿兆兩两]+(?:元|日|天|小時|小时|月|年|%)?$/u
        .test(field),
  );
  if (numericField) return true;

  const computedField = fields.some(
    (field) =>
      /\b(?:difference|variance)\b/u.test(field) ||
      /(?:差異|差异)/u.test(field),
  );
  if (computedField) return true;

  const outcomeUsedAsNumericField = fields.some((field) =>
    routes.includes(field)
  ) && values.some(
    (value) =>
      /(?:\d|[零〇一二三四五六七八九十百千萬万億亿兆兩两])/u.test(value),
  );
  if (outcomeUsedAsNumericField) return true;

  const source = semanticContexts
    .flatMap((context) => {
      const relevantClauseIndexes = new Set(
        observations
          .map((observation) =>
            semanticHardClauseIndexInAnchor(observation, context)
          )
          .filter((index): index is number => index !== null),
      );
      return semanticHardClauseSegments(context.exactText)
        .filter((_, index) => relevantClauseIndexes.has(index))
        .map((clause) => normalized(clause.text));
    })
    .join("\n");
  if (source.length === 0) return false;
  if (semanticConditionSourceHasClosedUnsupportedOutcome(source)) return true;
  return /(?:生产数据库增加数据负责人|生產資料庫增加資料負責人)/u
    .test(source);
}

function semanticConditionSourceHasClosedUnsupportedOutcome(source: string) {
  return (
    /\b(?:high-value\s+approver|board\s+fyi|blocks?\s+submission|does\s+not\s+skip\s+approval)\b/u
      .test(source) ||
    /\bend(?:s)?\s+(?:the\s+workflow\s+)?immediately\s+and\s+record(?:s)?\s+(?:the\s+)?reason\b/u
      .test(source) ||
    /(?:直接結束並記錄原因|直接结束并记录原因)/u.test(source) ||
    /(?:不可完成|不得結案|不得结案|額外審批|额外审批|醫生證明|医生证明)/u
      .test(source) ||
    /(?:returns?\b|退回)[^。；;\r\n]{0,120}(?:confirm|difference|確認|确认|差異|差异)/u
      .test(source) ||
    /(?:security\s+approval|安全審批|安全审批)[^。；;\r\n]{0,80}(?:clearance\s+proof|清除證明|清除证明)/u
      .test(source) ||
    /\bhr\s*(?:and|&)\s*security\b/u.test(source) ||
    /hr\s*(?:和|與|与)\s*(?:security|安全)/u.test(source) ||
    /\b(?:requires?|needs?)\s+(?:(?:an?|the)\s+)?(?:[\p{L}\p{N}'’&/()\-]+\s+){0,6}(?:attachment|certificate|document|file|form|pdf|spreadsheet|proof|statement|quotation|quote|receipt|report|plan|photo|image|record|notification|email)\b/u
      .test(source) ||
    /(?:要求|需要|須|须)(?:[\p{L}\p{N}]{0,24})(?:附件|文件|檔案|档案|證明|证明|表格|表单|報告|报告|計劃|计划|方案|記錄|记录|圖片|图片|照片|通知|電郵|邮件)/u
      .test(source)
  );
}

function semanticConditionRouteLooksLikeNonStageOutcome(route: string) {
  return /^(?:(?:an?|the)\s+)?(?:[\p{L}\p{N}'’&/()\-]+\s+){0,7}(?:attachment|certificate|document|file|form|pdf|spreadsheet|excel|proof|statement|quotation|quote|receipt|report|plan|photo|image|record)(?:\s+(?:attachment|document|file|form|pdf|spreadsheet|proof|statement|report|plan|photo|image|record))?$/u.test(route) || /^(?:(?:an?|the)\s+)?(?:email|notification)(?:\s+to\s+.+)?$/u.test(route) || /^(?:notify|notifies|email|emails)\b/u.test(route) || /(?:附件|文件|檔案|档案|證明|证明|表格|表单|報告|报告|計劃|计划|方案|記錄|记录|圖片|图片|照片|通知|電郵|邮件)$/u.test(route);
}

function semanticConditionHasOmittedAdjacentDefaultBranch(
  observations: readonly TemplateCopilotV3ReviewObservation[],
  semanticContexts: readonly TemplateCopilotV3SourceSpan[],
) {
  const governingRoles = new Set([
    "field",
    "operator",
    "value",
    "matching_route",
  ]);
  return semanticContexts.some((context) => {
    const clauses = semanticHardClauseSegments(context.exactText);
    const governingIndexes = new Set(
      observations
        .filter((entry) => governingRoles.has(entry.role))
        .map((entry) => semanticHardClauseIndexInAnchor(entry, context))
        .filter((index): index is number => index !== null),
    );
    return [...governingIndexes].some((index) => {
      const adjacent = clauses[index + 1];
      if (
        adjacent === undefined ||
        !semanticConditionClauseBeginsExplicitDefault(adjacent.text)
      ) {
        return false;
      }
      const startCodePoint =
        context.startCodePoint + adjacent.startCodePoint;
      const endCodePoint = context.startCodePoint + adjacent.endCodePoint;
      return !observations.some(
        (entry) =>
          entry.role === "otherwise_route" &&
          entry.sourceSpan.messageId === context.messageId &&
          entry.sourceSpan.startCodePoint >= startCodePoint &&
          entry.sourceSpan.endCodePoint <= endCodePoint,
      );
    });
  });
}

function semanticConditionClauseBeginsExplicitDefault(wording: string) {
  const normalized = templateCopilotV3NormalizeLexicalText(wording)
    .replace(/^[\s,，:：\-–—]+/gu, "");
  if (
    /^(?:otherwise|else)\s+(?:noted|specified|stated|documented)\b/u
      .test(normalized) ||
    /^(?:否則|否则)(?:另有)?(?:說明|说明|註明|注明|規定|规定)/u
      .test(normalized)
  ) {
    return false;
  }
  const ellipticalDefault =
    /^if\s+not\s*(?:[,，:：\-–—]|$)/u.test(normalized) ||
    /^(?:若非如此|如非如此|若不然|如不然|不然)(?:\s*[,，:：\-–—]|$)/u
      .test(normalized);
  if (ellipticalDefault) return true;
  return /^(?:otherwise|else|by\s+default)\b/u.test(normalized) ||
    /^(?:否則|否则)/u.test(normalized);
}

function semanticStageHasSourceDerivedRecordUpdate(
  observations: readonly TemplateCopilotV3ReviewObservation[],
  semanticContexts: readonly TemplateCopilotV3SourceSpan[],
) {
  const stageActions = observations.filter(
    (entry) =>
      entry.role === "kind" &&
      (entry.advisoryHint === "review" ||
        entry.advisoryHint === "approval"),
  );
  const participants = observations
    .filter((entry) => entry.role === "participant")
    .map((entry) => templateCopilotV3NormalizeLexicalText(entry.quote))
    .filter(Boolean);
  if (participants.length === 0) return false;
  return semanticContexts.some((context) =>
    stageActions.some((action) => {
      if (
        action.sourceSpan.messageId !== context.messageId ||
        action.sourceSpan.startCodePoint < context.startCodePoint ||
        action.sourceSpan.endCodePoint > context.endCodePoint
      ) {
        return false;
      }
      const relativeEnd =
        action.sourceSpan.endCodePoint - context.startCodePoint;
      const tail = Array.from(context.exactText).slice(relativeEnd).join("");
      const normalized = templateCopilotV3NormalizeLexicalText(tail)
        .replace(/^[\s,，:：\-–—.!?。！？；;]+/gu, "");
      return semanticEnglishStageTailHasRecordUpdate(
        normalized,
        participants,
      ) || semanticCjkStageTailHasRecordUpdate(normalized, participants);
    })
  );
}

function semanticEnglishStageTailHasRecordUpdate(
  wording: string,
  participants: readonly string[],
) {
  const safeTargetWords =
    String.raw`(?:(?!(?:after|before|while|because|by|from|using|reading|consulting|referencing|based|when|where|which|that)\b)[\p{L}\p{N}'’\-]+\s+){0,3}`;
  const recordTarget =
    String.raw`(?:(?:the|an?)\s+)?${safeTargetWords}(?:record|ledger|database|profile|register|system)\b`;
  const objectWords =
    String.raw`(?:(?!(?:after|before|while|because|by|from|using|reading|consulting|referencing|based|when|where|which|that)\b)[\p{L}\p{N}'’\-]+\s+){0,4}`;
  const mutation =
    String.raw`(?:(?:updates?|amends?|modifies?)\s+${recordTarget}|records?\s+(?:(?:the|an?)\s+)?${objectWords}(?:(?:in|to)\s+)?${recordTarget}|writes?\s+(?:(?:the|an?)\s+)?${objectWords}(?:to|in)\s+${recordTarget})`;
  const gerundMutation =
    String.raw`(?:updating|amending|modifying)\s+${recordTarget}`;
  const implicitSameSubject = new RegExp(
    String.raw`^(?:(?:the|an?)\s+(?:request|application|submission|workflow|case|form)\s+)?(?:(?:and(?:\s+then)?|also|as\s+well\s+as|then)\s+(?:(?:also|must|shall|will|has\s+to|is\s+required\s+to)\s+)?${mutation}|before\s+${gerundMutation})`,
    "u",
  );
  if (implicitSameSubject.test(wording)) return true;

  const actor = participants
    .map((participant) => escapeSemanticRegExp(participant))
    .join("|");
  if (actor.length === 0) return false;
  const passiveSameActor = new RegExp(
    String.raw`^after\s+which\s+${recordTarget}\s+(?:is|was|will\s+be|must\s+be)\s+(?:updated|amended|modified|recorded)\s+by\s+(?:${actor})(?:$|[^\p{L}\p{N}])`,
    "u",
  );
  if (passiveSameActor.test(wording)) return true;
  return new RegExp(
    String.raw`^(?:${actor})(?:$|[^\p{L}\p{N}])\s*(?:then|subsequently)\s+${mutation}`,
    "u",
  ).test(wording);
}

function semanticCjkStageTailHasRecordUpdate(
  wording: string,
  participants: readonly string[],
) {
  const mutationRemainder = (value: string) => {
    const matched = value.match(
      /^(?:更新|修改|修訂|修订|寫入|写入|記錄|记录|登記|登记|新增)([^。！？；;，,\r\n]{0,20}?)(?:紀錄|记录|分類帳|分类账|資料庫|数据库|檔案|档案|個人檔案|个人档案|系統|系统|名冊|名册|台帳|台账)/u,
    );
    if (!matched) return false;
    const bridge = matched[1] ?? "";
    return !/(?:之後|之后|隨後|随后|然後|然后|接著|接着|讀取|读取|查閱|查阅|參考|参考|查看|檢視|检视)/u
      .test(bridge);
  };
  const implicit = wording.match(
    /^(?:(?:該|该)?(?:申請|申请|流程|表單|表单|個案|个案))?(?:並|并|並且|并且|以及|同時|同时|然後|然后|後|后)(?:再|亦|還|还|必須|必须|須|须|需|要)?(.*)$/u,
  );
  if (implicit && mutationRemainder(implicit[1] ?? "")) return true;

  const actor = participants
    .map((participant) => escapeSemanticRegExp(participant))
    .join("|");
  if (actor.length === 0) return false;
  const passive = new RegExp(
    String.raw`^(?:之後|之后|隨後|随后)?[^。！？；;，,\r\n]{0,20}(?:紀錄|记录|分類帳|分类账|資料庫|数据库|檔案|档案|個人檔案|个人档案|系統|系统|名冊|名册|台帳|台账)(?:隨後|随后)?由\s*(?:${actor})(?:$|[^\p{L}\p{N}])\s*(?:更新|修改|修訂|修订|寫入|写入|記錄|记录|登記|登记)`,
    "u",
  );
  if (passive.test(wording)) return true;
  const repeatedActor = new RegExp(
    String.raw`^(?:${actor})(?:$|[^\p{L}\p{N}])\s*(?:隨後|随后|然後|然后|接著|接着)(.*)$`,
    "u",
  ).exec(wording);
  return repeatedActor !== null && mutationRemainder(repeatedActor[1] ?? "");
}

function semanticAttachmentHasConditionalRequirementContext(
  observations: readonly TemplateCopilotV3ReviewObservation[],
  semanticContexts: readonly TemplateCopilotV3SourceSpan[],
) {
  if (
    observations.some(
      (entry) => entry.role === "conditional_quantity_increment",
    )
  ) {
    return true;
  }
  if (
    observations.some(
      (entry) =>
        entry.role === "required" &&
        [
          "conditional",
          "required_with_conditional_extension",
          "optional_conditional",
        ].includes(entry.advisoryHint ?? ""),
    )
  ) {
    return true;
  }
  const labels = observations
    .filter((entry) => entry.role === "label")
    .map((entry) => templateCopilotV3NormalizeLexicalText(entry.quote))
    .filter(Boolean);
  return semanticContexts.some((anchor) =>
    semanticHardClauseSegments(anchor.exactText).some((
      clause,
      index,
      clauses,
    ) => {
      const owned = observations.filter((entry) => {
        if (entry.sourceSpan.messageId !== anchor.messageId) return false;
        const start =
          entry.sourceSpan.startCodePoint - anchor.startCodePoint;
        const end = entry.sourceSpan.endCodePoint - anchor.startCodePoint;
        return (
          start >= clause.startCodePoint &&
          end <= clause.endCodePoint
        );
      });
      const wording = templateCopilotV3NormalizeLexicalText(clause.text);
      const englishAction = wording.match(
        /\b(?:must(?:\s+also)?\s+(?:include|provide|upload|attach|submit|add|fill)|is\s+required|are\s+required|requires?|upload|attach|submit|provide|include|fill)\b/u,
      );
      const cjkAction = wording.match(
        /(?:必須|必须|須|须|要|另須|另须|才須|才须)?(?:上載|上传|填寫|填写|提供|提交|附上)|可(?:選|选)(?:擇|择)?(?:上載|上传|提供|提交|附上)/u,
      );
      const explicitConditional =
        /\b(?:if|when|whenever|unless|only\s+if|provided(?:\s+that)?|in\s+case(?:\s+of)?|depending\s+on)\b/u
          .test(wording) ||
        /(?:若|如果|倘若|除非|只有|僅當|仅当|才)|(?:時|时)(?=.{0,24}(?:須|须|必須|必须|要|另須|另须|上載|上传|提供|提交|附上|填寫|填写))/u
          .test(wording);
      const actionNamesEntity =
        semanticAttachmentActionNamesObservedEntity(
          wording,
          englishAction?.index ?? cjkAction?.index ?? null,
          labels,
        );
      const previous = clauses[index - 1];
      const previousOwned = previous !== undefined &&
        observations.some((entry) => {
          if (entry.sourceSpan.messageId !== anchor.messageId) return false;
          const start =
            entry.sourceSpan.startCodePoint - anchor.startCodePoint;
          const end = entry.sourceSpan.endCodePoint - anchor.startCodePoint;
          return (
            start >= previous.startCodePoint &&
            end <= previous.endCodePoint
          );
        });
      const action = wording.slice(
        englishAction?.index ?? cjkAction?.index ?? wording.length,
      );
      const cjkActionEnd = cjkAction?.index === undefined
        ? null
        : cjkAction.index + cjkAction[0].length;
      const cjkObjectIsElided =
        previousOwned &&
        explicitConditional &&
        cjkActionEnd !== null &&
        templateCopilotV3NormalizeLexicalText(
          wording.slice(cjkActionEnd),
        ).replace(/^(?:了)?[\s,，:：\-–—.!?。！？；;]*$/gu, "").length === 0;
      const carriesObservedEntity = previousOwned &&
        (
          (englishAction !== null &&
            /\b(?:it|them|this|that|these|those|the\s+same(?:\s+(?:document|file|form|attachment|pdf))?)\b/u
              .test(action)) ||
          cjkObjectIsElided ||
          (cjkAction !== null &&
            /(?:它|其|該|该|此|上述)(?:附件|文件|檔案|档案|表格|表单|報告|报告|pdf)?/u
              .test(action))
        );
      if (
        owned.length === 0 &&
        !actionNamesEntity &&
        !carriesObservedEntity
      ) {
        return false;
      }
      const stageTimed =
        /^(?:at|before|after|upon)\s+(?:request\s+)?(?:submission|completion)\b/u
          .test(wording) ||
        /^(?:申請時|申请时|提交時|提交时|呈交時|呈交时|最後呈交前|最后呈交前|最終呈交前|最终呈交前|完成後|完成后)(?:再)?/u
          .test(wording);
      if (stageTimed) return false;
      if (explicitConditional) return true;

      if (englishAction?.index !== undefined) {
        const prefix = wording.slice(0, englishAction.index).trim();
        const suffix = wording
          .slice(englishAction.index + englishAction[0].length)
          .trim();
        return semanticAttachmentHasClosedConditionalState(
          prefix,
          suffix,
          labels,
        );
      }

      if (cjkAction?.index === undefined) return false;
      const prefix = wording.slice(0, cjkAction.index).trim();
      const suffix = wording
        .slice(cjkAction.index + cjkAction[0].length)
        .trim();
      return semanticAttachmentHasClosedConditionalState(
        prefix,
        suffix,
        labels,
      );
    })
  );
}

function semanticAttachmentHasClosedConditionalState(
  prefix: string,
  suffix: string,
  labels: readonly string[],
) {
  const stripLabels = (value: string) =>
    labels.reduce(
      (current, label) =>
        label.length === 0
          ? current
          : current.replace(
              new RegExp(escapeSemanticRegExp(label), "gu"),
              " ",
            ),
      value,
    );
  const normalizedPrefix = templateCopilotV3NormalizeLexicalText(
    stripLabels(prefix),
  );
  const normalizedSuffix = templateCopilotV3NormalizeLexicalText(
    stripLabels(suffix),
  );
  const context = templateCopilotV3NormalizeLexicalText(
    `${normalizedPrefix} ${normalizedSuffix}`,
  );
  const classifiedState =
    /\b(?:classified|categorised|categorized|designated|marked|rated)\s+as\b/u
      .test(normalizedPrefix) ||
    /\b(?:for|on)\s+(?:[\p{L}\p{N}'’\-]+\s+){0,5}(?:classified|categorised|categorized|designated|marked|rated)\s+as\b/u
      .test(normalizedSuffix) ||
    /(?:列為|列为|分類為|分类为|評定為|评定为)/u
      .test(normalizedPrefix) ||
    /(?:針對|针对|適用於|适用于|就).{0,32}(?:列為|列为|分類為|分类为|評定為|评定为)/u
      .test(normalizedSuffix);
  return (
    classifiedState ||
    /\b(?:for|on)\b.{0,96}\b(?:or\s+(?:more|less|longer|shorter))\b/u
      .test(normalizedSuffix) ||
    /\b(?:above|below|over|under|at\s+least|at\s+most|more\s+than|less\s+than|selected|missing|present)\b/u
      .test(context) ||
    /\b(?:for|on)\s+(?:(?:high|low)[-\s]?risk|retrospective|emergency|international|restricted|regulated|personal|sensitive|production)\b/u
      .test(context) ||
    /\b(?:for|on|in)\s+(?:[\p{L}\p{N}'’\-]+\s+){0,7}(?:involving|containing|where|when|that|which|whose|with|without)\b/u
      .test(context) ||
    /^(?:the\s+|an?\s+)?retrospective\s+request\b/u.test(context) ||
    /(?:或以上|以上|超過|超过|不超過|不超过|涉及|進入|进入|存有|提及|高風險|高风险|緊急|紧急|生產|生产|資料匯出|数据导出|監管事故|监管事故|實物捐贈|实物捐赠|病假|產假|产假|無薪假|无薪假)/u
      .test(context)
  );
}

function semanticAttachmentActionNamesObservedEntity(
  wording: string,
  actionIndex: number | null,
  labels: readonly string[],
) {
  if (actionIndex === null) return false;
  const action = wording.slice(actionIndex);
  return labels.some((label) => {
    if (label.length === 0) return false;
    if (
      semanticAttachmentActionContainsLexicalTerm(
        action,
        label,
      )
    ) {
      return true;
    }
    if (!/^[a-z0-9]/u.test(label)) return false;
    const significant = label
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (token) =>
          token.length >= 4 &&
          ![
            "attachment",
            "assessment",
            "document",
            "file",
            "form",
            "image",
            "photo",
            "proof",
            "pdf",
          ].includes(token),
      )
      .sort((left, right) => right.length - left.length);
    const distinctive = significant.filter((token) => token.length >= 6);
    const strongest = distinctive.length === 1 ? distinctive[0] : undefined;
    return strongest !== undefined &&
      semanticAttachmentActionContainsLexicalTerm(
        action,
        strongest,
      );
  });
}

function semanticAttachmentActionContainsLexicalTerm(
  action: string,
  term: string,
) {
  if (!/^[a-z0-9]/u.test(term)) return action.includes(term);
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeSemanticRegExp(term)}(?:$|[^\\p{L}\\p{N}])`,
    "u",
  ).test(action);
}

function semanticConditionHasCompoundPredicateContext(
  observations: readonly TemplateCopilotV3ReviewObservation[],
  semanticContexts: readonly TemplateCopilotV3SourceSpan[],
) {
  const fields = observations.filter((entry) => entry.role === "field");
  const values = observations.filter((entry) => entry.role === "value");
  const routes = observations.filter(
    (entry) => entry.role === "matching_route",
  );
  if (
    values.some((entry) => {
      const wording = templateCopilotV3NormalizeLexicalText(entry.quote);
      return (
        /^(?:both|either|neither)\b.+\b(?:and|or|nor)\b/u.test(wording) ||
        /\b(?:as\s+well\s+as|along\s+with|together\s+with)\b/u.test(
          wording,
        ) ||
        /^(?:兩者|两者|二者|同時|同时|均|皆).+(?:及|和|與|与).+/u.test(
          wording,
        )
      );
    })
  ) {
    return true;
  }
  return semanticContexts.some((anchor) =>
    fields.some((field) =>
      values.some((value) =>
        routes.some((route) => {
          if (
            field.sourceSpan.messageId !== anchor.messageId ||
            value.sourceSpan.messageId !== anchor.messageId ||
            route.sourceSpan.messageId !== anchor.messageId
          ) {
            return false;
          }
          const fieldClause = semanticHardClauseIndexInAnchor(field, anchor);
          const valueClause = semanticHardClauseIndexInAnchor(value, anchor);
          const routeClause = semanticHardClauseIndexInAnchor(route, anchor);
          if (
            fieldClause === null ||
            fieldClause !== valueClause ||
            fieldClause !== routeClause
          ) {
            return false;
          }
          const clause = semanticHardClauseSegments(anchor.exactText)[
            fieldClause
          ];
          if (!clause) return false;
          const fieldStart =
            field.sourceSpan.startCodePoint - anchor.startCodePoint;
          const fieldEnd =
            field.sourceSpan.endCodePoint - anchor.startCodePoint;
          const operator = observations.find(
            (entry) =>
              entry.role === "operator" &&
              entry.sourceSpan.messageId === anchor.messageId &&
              semanticHardClauseIndexInAnchor(entry, anchor) === fieldClause,
          );
          const operatorStart = operator
            ? operator.sourceSpan.startCodePoint - anchor.startCodePoint
            : null;
          const valueEnd =
            value.sourceSpan.endCodePoint - anchor.startCodePoint;
          const routeStart =
            route.sourceSpan.startCodePoint - anchor.startCodePoint;
          if (
            fieldStart < clause.startCodePoint ||
            valueEnd > routeStart ||
            routeStart > clause.endCodePoint
          ) {
            return false;
          }
          const codePoints = Array.from(anchor.exactText);
          const normalizeContext = (text: string) =>
            templateCopilotV3NormalizeLexicalText(text)
              .replace(
                /^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu,
                "",
              );
          const prefix = normalizeContext(
            codePoints.slice(clause.startCodePoint, fieldStart).join(""),
          );
          const fieldToOperator =
            operatorStart !== null && operatorStart >= fieldEnd
              ? normalizeContext(
                  codePoints.slice(fieldEnd, operatorStart).join(""),
                )
              : "";
          const bridge = normalizeContext(
            codePoints.slice(valueEnd, routeStart).join(""),
          );
          const englishLeading = prefix.match(
            /^(.+?)\s+(and|or|as\s+well\s+as|along\s+with|together\s+with)$/u,
          );
          const englishLeadingPredicate = englishLeading?.[1];
          const cjkLeading = prefix.match(
            /^(.+?)(且|並且|并且|以及|及|和|與|与|或)$/u,
          );
          const cjkLeadingPredicate = cjkLeading?.[1];
          const englishTrailingOperand = bridge.match(
            /^(?:and|or|as\s+well\s+as|along\s+with|together\s+with)\s+(.+?)[\s,，:：\-–—]+(?:then\s+)?(?:routes?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to|go(?:es)?(?:\s+from\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,79})?\s+to|sends?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to|(?:also\s+)?(?:adds?|requires?|seeks?|obtains?))$/u,
          )?.[1];
          const cjkTrailingOperand = bridge.match(
            /^(?:且|並且|并且|以及|及|和|與|与|或)(.+?)(?:[\s,，:：\-–—]+|時|时)?(?:則|则)?(?:再?由|交由|送交|轉至|转至|增加|加入|要求|需要)$/u,
          )?.[1];
          const leadingCompoundPredicate =
            (typeof englishLeadingPredicate === "string" &&
              englishLeadingPredicate.trim().length > 0) ||
            (typeof cjkLeadingPredicate === "string" &&
              cjkLeadingPredicate.trim().length > 0);
          const middleCompoundPredicate =
            /^(?:and|or|as\s+well\s+as|along\s+with|together\s+with)\s+.+/u
              .test(fieldToOperator) ||
            /^(?:且|並且|并且|以及|及|和|與|与|或).+/u.test(fieldToOperator);
          const trailingCompoundOperand =
            (
              (typeof englishTrailingOperand === "string" &&
                englishTrailingOperand.trim().length > 0) ||
              (typeof cjkTrailingOperand === "string" &&
                cjkTrailingOperand.trim().length > 0)
            );
          return leadingCompoundPredicate ||
            middleCompoundPredicate ||
            trailingCompoundOperand ||
            /^(?:本地|當地|当地)(?:低風險|低风险)且$/u.test(prefix) ||
            /^且(?:風險|风险)低(?:時|时)可在$/u.test(bridge);
        })
      )
    )
  );
}

function semanticCoreRole(
  factId: TemplateCopilotV3FragmentFactId,
  role: TemplateCopilotV3ProviderQuoteRole,
) {
  const roles: Readonly<
    Record<
      TemplateCopilotV3FragmentFactId,
      readonly TemplateCopilotV3ProviderQuoteRole[]
    >
  > = {
    "request.fields": ["label", "required"],
    "attachments.requirements": ["label", "kind", "required"],
    "workflow.stages": ["label", "kind", "participant", "participant_mode"],
    "workflow.conditions": [
      "field",
      "operator",
      "value",
      "matching_route",
      "otherwise_route",
    ],
    "notifications.rules": ["event", "recipient"],
  };
  return roles[factId].includes(role);
}

function semanticCoreObservationsCrossHardClause(
  factId: TemplateCopilotV3FragmentFactId,
  observations: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  const role = (name: TemplateCopilotV3ProviderQuoteRole) =>
    observations.filter((observation) => observation.role === name);
  if (factId === "request.fields") {
    const label = role("label");
    const required = role("required");
    return label.length > 0 && required.length > 0 &&
      !semanticRequestGroupsHaveAffinity(label, required, sourceAnchors);
  }
  if (factId === "attachments.requirements") {
    const label = role("label");
    const kind = role("kind");
    const required = role("required");
    if (
      label.length > 0 && kind.length > 0 &&
      !semanticCoreGroupsShareClause([label, kind], sourceAnchors)
    ) {
      return true;
    }
    return label.length > 0 && kind.length > 0 && required.length > 0 &&
      !semanticAttachmentGroupsHaveAffinity(
        label,
        kind,
        required,
        sourceAnchors,
      );
  }
  if (factId === "workflow.stages") {
    const kind = role("kind");
    const participant = [...role("participant"), ...role("participant_mode")];
    return kind.length > 0 && participant.length > 0 &&
      !semanticCoreGroupsShareClause([kind, participant], sourceAnchors);
  }
  if (factId === "workflow.conditions") {
    const field = role("field");
    const operator = role("operator");
    const value = role("value");
    const matchingRoutes = role("matching_route");
    const otherwiseRoutes = role("otherwise_route");
    const predicate = [field, operator, value].filter(
      (group) => group.length > 0,
    );
    if (predicate.length < 2) return false;
    if (field.length > 0 && operator.length > 0 && value.length > 0) {
      if (!semanticConditionPredicateGroupsHaveAffinity(
        field,
        operator,
        value,
        sourceAnchors,
      )) {
        return true;
      }
      return !semanticConditionRoutesHaveAffinity(
        field,
        operator,
        value,
        matchingRoutes,
        otherwiseRoutes,
        sourceAnchors,
      );
    }
    return !semanticCoreGroupsShareClause(predicate, sourceAnchors);
  }
  const event = role("event");
  const recipient = role("recipient");
  return event.length > 0 && recipient.length > 0 &&
    !semanticCoreGroupsShareClause([event, recipient], sourceAnchors);
}

function semanticRequestGroupsHaveAffinity(
  labels: readonly TemplateCopilotV3ReviewObservation[],
  required: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return semanticCoreGroupsShareClause([labels, required], sourceAnchors) ||
    labels.some((label) =>
      required.some((requirement) =>
        semanticStandaloneRequirementMarkerFollows(
          label,
          requirement,
          sourceAnchors,
        )
      )
    );
}

function semanticAttachmentGroupsHaveAffinity(
  labels: readonly TemplateCopilotV3ReviewObservation[],
  kinds: readonly TemplateCopilotV3ReviewObservation[],
  required: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  if (!semanticCoreGroupsShareClause([labels, kinds], sourceAnchors)) {
    return false;
  }
  if (
    semanticCoreGroupsShareClause(
      [labels, kinds, required],
      sourceAnchors,
    )
  ) {
    return true;
  }
  return labels.some((label) =>
    required.some((requirement) =>
      semanticSupplementalRequirementNamesEntity(
        label,
        requirement,
        sourceAnchors,
      )
    )
  );
}

function semanticStandaloneRequirementMarkerFollows(
  label: TemplateCopilotV3ReviewObservation,
  requirement: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.some((anchor) => {
    const labelIndex = semanticClauseIndexInAnchor(label, anchor);
    const requirementIndex = semanticClauseIndexInAnchor(requirement, anchor);
    if (
      labelIndex === null ||
      requirementIndex === null ||
      requirementIndex !== labelIndex + 1
    ) {
      return false;
    }
    const clause = semanticObservationClause(requirement, [anchor]);
    return clause !== null &&
      templateCopilotV3NormalizeLexicalText(clause) ===
        templateCopilotV3NormalizeLexicalText(requirement.quote);
  });
}

function semanticSupplementalRequirementNamesEntity(
  label: TemplateCopilotV3ReviewObservation,
  requirement: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.some((anchor) => {
    if (
      semanticClauseIndexInAnchor(label, anchor) === null ||
      semanticClauseIndexInAnchor(requirement, anchor) === null
    ) {
      return false;
    }
    const clause = semanticObservationClause(requirement, [anchor]);
    const entity = templateCopilotV3NormalizeLexicalText(label.quote);
    return clause !== null && entity.length > 0 &&
      semanticSupplementalRequirementNamesExactEntity(
        clause,
        requirement.quote,
        entity,
      );
  });
}

function semanticSupplementalRequirementNamesExactEntity(
  clause: string,
  requirementQuote: string,
  entity: string,
) {
  const wording = templateCopilotV3NormalizeLexicalText(clause);
  const marker = templateCopilotV3NormalizeLexicalText(requirementQuote);
  if (marker.length === 0) return false;
  let offset = wording.indexOf(marker);
  while (offset >= 0) {
    const before = semanticSupplementalEntityCandidate(
      wording.slice(0, offset),
    );
    const after = semanticSupplementalEntityCandidate(
      wording.slice(offset + marker.length),
    );
    if (before === entity || after === entity) return true;
    offset = wording.indexOf(marker, offset + marker.length);
  }
  return false;
}

function semanticSupplementalEntityCandidate(value: string) {
  const segments = value.split(/[,，:：]/u);
  const local = segments[segments.length - 1] ?? value;
  return local
    .replace(/^[\s\-–—]+|[\s\-–—]+$/gu, "")
    .replace(/^(?:the|an?|this|that)\s+/u, "")
    .replace(/^(?:該|该|此|這個|这个)\s*/u, "")
    .replace(
      /\s+(?:is|are|was|were|be|must|shall|should|needs?|requires?)$/u,
      "",
    )
    .replace(/(?:為|为|是|須|须|必須|必须|需要)$/u, "")
    .trim();
}

function semanticConditionPredicateGroupsHaveAffinity(
  fields: readonly TemplateCopilotV3ReviewObservation[],
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  if (
    !semanticConditionNumericValuesAreBounded(
      operators,
      values,
      sourceAnchors,
    )
  ) {
    return false;
  }
  if (
    semanticCoreGroupsShareClause(
      [fields, operators, values],
      sourceAnchors,
    ) &&
    fields.every(
      (field) =>
        semanticConditionFieldHasClosedLeftBoundary(field, sourceAnchors) &&
        semanticConditionFieldHasClosedRightBoundary(
          field,
          sourceAnchors,
        ),
    )
  ) {
    return true;
  }
  if (!semanticCoreGroupsShareClause([operators, values], sourceAnchors)) {
    return false;
  }
  return fields.some((field) =>
    operators.some((operator) =>
      values.some((value) =>
        semanticConditionFieldCarriesForward(
          field,
          operator,
          value,
          sourceAnchors,
        )
      )
    )
  );
}

function semanticConditionFieldHasClosedLeftBoundary(
  field: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.some((anchor) => {
    const clauseIndex = semanticHardClauseIndexInAnchor(field, anchor);
    if (clauseIndex === null) return false;
    const clause = semanticHardClauseSegments(anchor.exactText)[clauseIndex];
    if (!clause) return false;
    const fieldStart =
      field.sourceSpan.startCodePoint - anchor.startCodePoint;
    if (
      fieldStart < clause.startCodePoint ||
      fieldStart >= clause.endCodePoint
    ) {
      return false;
    }
    const codePoints = Array.from(anchor.exactText);
    const immediateBefore = codePoints[fieldStart - 1] ?? "";
    const fieldText = templateCopilotV3NormalizeLexicalText(field.quote);
    if (
      !/^\p{Script=Han}/u.test(fieldText) &&
      /^[\p{L}\p{N}_]$/u.test(immediateBefore)
    ) {
      return false;
    }
    const prefix = templateCopilotV3NormalizeLexicalText(
      codePoints.slice(clause.startCodePoint, fieldStart).join(""),
    )
      .replace(/[\s,，:：\-–—()[\]{}]+$/gu, "")
      .trim();
    if (prefix.length === 0) return true;

    if (/^[A-Za-z0-9_]/u.test(fieldText)) {
      return /(?:^|\s)(?:the|a|an|this|that|each|any|if|when|where|unless|otherwise|else|then|for|use|using|and|or|as\s+well\s+as|along\s+with|together\s+with|provided\s+that|as\s+long\s+as)$/u
        .test(prefix);
    }
    return /(?:若|如果|如|當|当|凡|只要|否則|否则|則|则|且|並且|并且|以及|及|和|與|与|或|有|用|使用|按|對於|对于|需要|要求|該|该|此|本|這個|这个)$/u
      .test(prefix);
  });
}

function semanticConditionFieldHasClosedRightBoundary(
  field: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.some((anchor) => {
    const clauseIndex = semanticHardClauseIndexInAnchor(field, anchor);
    if (clauseIndex === null) return false;
    const clause = semanticHardClauseSegments(anchor.exactText)[clauseIndex];
    if (!clause) return false;
    const fieldEnd =
      field.sourceSpan.endCodePoint - anchor.startCodePoint;
    if (
      fieldEnd <= clause.startCodePoint ||
      fieldEnd > clause.endCodePoint
    ) {
      return false;
    }
    const codePoints = Array.from(anchor.exactText);
    const immediateAfter = codePoints[fieldEnd] ?? "";
    const fieldText = templateCopilotV3NormalizeLexicalText(field.quote);
    if (
      /[\p{L}\p{N}_]$/u.test(fieldText) &&
      /^[\p{L}\p{N}_]$/u.test(immediateAfter) &&
      !/\p{Script=Han}$/u.test(fieldText)
    ) {
      return false;
    }
    const suffix = templateCopilotV3NormalizeLexicalText(
      codePoints.slice(fieldEnd, clause.endCodePoint).join(""),
    ).replace(/^[\s,，:：\-–—()[\]{}]+/gu, "");
    if (!/\p{Script=Han}$/u.test(fieldText)) {
      return /^(?:is|are|was|were|equals?|does|has|have|applies|exceeds?|contains?|requires?|matches?|differs?|belongs?\s+to|in|within|outside|other\s+than|above|below|over|under|at\s+least|at\s+most|more\s+than|less\s+than|selected|missing|present|high[-\s]?risk|low[-\s]?risk|retrospective|personal|sensitive|>=|<=|>|<|=|為|为|是|有|無|无|非|不在|不等於|不等于|不超過|不超过|等於|等于|包含|超過|超过|不少於|不少于|不多於|不多于|高於|高于|低於|低于|至少|至多|已選|已选|未選|未选|缺少|遺失|丢失|必須|必须|需要|要求|增加|加入|走|阻塞|不可|不得|直接)/u.test(suffix);
    }
    if (
      immediateAfter.length === 0 ||
      /^[\s,，:：;；.\-–—()[\]{}]$/u.test(immediateAfter)
    ) {
      return true;
    }
    return /^(?:為|为|是|有|無|无|非|不在|不等於|不等于|不超過|不超过|等於|等于|包含|超過|超过|不少於|不少于|不多於|不多于|高於|高于|低於|低于|至少|至多|已選|已选|已選擇|已选择|未選|未选|缺少|遺失|丢失|必須|必须|需要|要求|要|另須|另须|增加|加入|走|阻塞|不可|不得|時|时|才|則|则|便|即|者|>=|<=|>|<|=)/u
      .test(suffix);
  });
}

function semanticConditionNumericValuesAreBounded(
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return operators.every((operator) => {
    if (![">", ">=", "<", "<="].includes(operator.advisoryHint ?? "")) {
      return true;
    }
    return values.every((value) =>
      semanticConditionNumericValueIsBounded(value, sourceAnchors)
    );
  });
}

function semanticConditionNumericValueIsBounded(
  value: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  const normalized =
    templateCopilotV3NormalizeLexicalText(value.quote);
  const cjkAmount =
    /^(?:(?:港幣|港币|人民幣|人民币)\s*)?(?:百分之)?[零〇一二三四五六七八九十百千萬万億亿兆兩两]+(?:元|日|天|小時|小时|月|年|%)?$/u
      .test(normalized);
  const decimalMatch = normalized.match(
    /^(?:(?:hkd|usd|rmb|cny)\s*)?([+-]?\d[\d,.]*)(?:\s*(?:%|percent|days?|hours?|months?|years?))?$/u,
  );
  const decimalText = decimalMatch?.[1];
  const decimalAmount = decimalText !== undefined &&
    templateCopilotV3CanonicalDecimalText(decimalText) !== null;
  if (!cjkAmount && !decimalAmount) return false;

  return sourceAnchors.some((anchor) => {
    if (
      anchor.messageId !== value.sourceSpan.messageId ||
      value.sourceSpan.startCodePoint < anchor.startCodePoint ||
      value.sourceSpan.endCodePoint > anchor.endCodePoint
    ) {
      return false;
    }
    const codePoints = Array.from(anchor.exactText);
    const start = value.sourceSpan.startCodePoint - anchor.startCodePoint;
    const end = value.sourceSpan.endCodePoint - anchor.startCodePoint;
    const before = codePoints[start - 1] ?? "";
    const after = codePoints[end] ?? "";
    const afterNext = codePoints[end + 1] ?? "";
    if (cjkAmount) {
      return !/[零〇一二三四五六七八九十百千萬万億亿兆兩两元]/u
          .test(before) &&
        !/[零〇一二三四五六七八九十百千萬万億亿兆兩两元]/u
          .test(after);
    }
    return !/[A-Za-z0-9_,.零〇一二三四五六七八九十百千萬万億亿兆兩两元]/u
        .test(before) &&
      !/[A-Za-z0-9_零〇一二三四五六七八九十百千萬万億亿兆兩两元]/u
        .test(after) &&
      (
        (after !== "," && after !== ".") ||
        !/\p{N}/u.test(afterNext)
      );
  });
}

function semanticConditionRoutesHaveAffinity(
  fields: readonly TemplateCopilotV3ReviewObservation[],
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  matchingRoutes: readonly TemplateCopilotV3ReviewObservation[],
  otherwiseRoutes: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return matchingRoutes.every((route) =>
    semanticConditionMatchingRouteHasAffinity(
      route,
      fields,
      operators,
      values,
      sourceAnchors,
    )
  ) && otherwiseRoutes.every((route) =>
    semanticConditionOtherwiseRouteHasAffinity(
      route,
      fields,
      operators,
      values,
      sourceAnchors,
    )
  );
}

function semanticConditionMatchingRouteHasAffinity(
  route: TemplateCopilotV3ReviewObservation,
  fields: readonly TemplateCopilotV3ReviewObservation[],
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  if (
    sourceAnchors.some((anchor) =>
      fields.some((field) =>
        operators.some((operator) =>
          values.some((value) =>
            semanticConditionSameClauseMatchingRouteHasAffinity(
              route,
              field,
              operator,
              value,
              anchor,
            )
          )
        )
      )
    )
  ) {
    return true;
  }
  if (
    semanticConditionRouteIntroducesPredicate(
      route,
      fields,
      operators,
      values,
      sourceAnchors,
    )
  ) {
    return true;
  }
  return sourceAnchors.some((anchor) =>
    operators.some((operator) =>
      values.some((value) => {
        const operatorIndex = semanticHardClauseIndexInAnchor(
          operator,
          anchor,
        );
        const valueIndex = semanticHardClauseIndexInAnchor(value, anchor);
        const routeIndex = semanticHardClauseIndexInAnchor(route, anchor);
        if (
          operatorIndex === null ||
          valueIndex === null ||
          routeIndex === null ||
          operatorIndex !== valueIndex ||
          routeIndex !== operatorIndex + 1
        ) {
          return false;
        }
        const clause = semanticHardClauseSegments(anchor.exactText)[routeIndex];
        if (
          clause === undefined ||
          semanticConditionClauseHasIndependentPredicate(clause.text)
        ) {
          return false;
        }
        const normalizedClause =
          templateCopilotV3NormalizeLexicalText(clause.text)
            .replace(/^[\s,，:：\-–—]+/gu, "");
        if (
          /^(?:if|when)\b/u.test(normalizedClause) ||
          /^(?:若|如果|當|当)/u.test(normalizedClause)
        ) {
          return semanticConditionClauseIsDecisionBranch(
            clause.text,
            route.quote,
          );
        }
        return semanticConditionRouteOnlyClauseHasAffinity(
          route,
          clause,
          anchor,
        );
      })
    )
  );
}


function semanticConditionSameClauseMatchingRouteHasAffinity(
  route: TemplateCopilotV3ReviewObservation,
  field: TemplateCopilotV3ReviewObservation,
  operator: TemplateCopilotV3ReviewObservation,
  value: TemplateCopilotV3ReviewObservation,
  anchor: TemplateCopilotV3SourceSpan,
) {
  const fieldIndex = semanticHardClauseIndexInAnchor(field, anchor);
  const operatorIndex = semanticHardClauseIndexInAnchor(operator, anchor);
  const valueIndex = semanticHardClauseIndexInAnchor(value, anchor);
  const routeIndex = semanticHardClauseIndexInAnchor(route, anchor);
  if (
    operatorIndex === null ||
    valueIndex === null ||
    routeIndex === null ||
    operatorIndex !== valueIndex ||
    valueIndex !== routeIndex
  ) {
    return false;
  }
  const clause = semanticHardClauseSegments(anchor.exactText)[routeIndex];
  if (
    clause === undefined ||
    !semanticConditionRouteInClauseIsAffirmative(route, clause, anchor)
  ) {
    return false;
  }
  const predicateEnd = Math.max(
    operator.sourceSpan.endCodePoint,
    value.sourceSpan.endCodePoint,
    ...(
      fieldIndex === routeIndex
        ? [field.sourceSpan.endCodePoint]
        : []
    ),
  );
  if (predicateEnd > route.sourceSpan.startCodePoint) return false;
  const bridgeStart =
    predicateEnd - anchor.startCodePoint - clause.startCodePoint;
  const bridgeEnd =
    route.sourceSpan.startCodePoint -
    anchor.startCodePoint -
    clause.startCodePoint;
  const bridge = Array.from(clause.text)
    .slice(bridgeStart, bridgeEnd)
    .join("");
  const normalizedBridge =
    templateCopilotV3NormalizeLexicalText(bridge)
      .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  if (
    fieldIndex !== null &&
    fieldIndex < routeIndex &&
    routeIndex - fieldIndex === 2 &&
    !/^(?:再由|再經|再经)$/u.test(normalizedBridge)
  ) {
    return false;
  }
  const parts = semanticConditionRouteClauseParts(route, clause, anchor);
  return parts !== null &&
    semanticConditionPredicateRouteBridgeIsAffirmative(bridge, parts);
}

function semanticConditionRouteOnlyClauseHasAffinity(
  route: TemplateCopilotV3ReviewObservation,
  clause: Readonly<{
    startCodePoint: number;
    endCodePoint: number;
    text: string;
  }>,
  anchor: TemplateCopilotV3SourceSpan,
) {
  if (!semanticConditionRouteInClauseIsAffirmative(route, clause, anchor)) {
    return false;
  }
  const parts = semanticConditionRouteClauseParts(route, clause, anchor);
  return parts !== null &&
    semanticConditionRouteOnlyPrefixIsAffirmative(parts);
}

function semanticConditionPredicateRouteBridgeIsAffirmative(
  bridgeWording: string,
  parts: Readonly<{ prefix: string; route: string; suffix: string }>,
) {
  const bridge = templateCopilotV3NormalizeLexicalText(bridgeWording)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  const route = templateCopilotV3NormalizeLexicalText(parts.route)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  const suffix = templateCopilotV3NormalizeLexicalText(parts.suffix)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  if (
    /^(?:blocks?\s+submission|does\s+not\s+skip\s+approval|不可完成|不得結案|不得结案)$/u
      .test(route)
  ) {
    return /^(?:|when|then|時|时|則|则)$/u.test(bridge);
  }
  if (/^is\s+(?:the\s+)?final\s+approver$/u.test(suffix)) {
    return bridge.length === 0;
  }
  if (
    /(?:後|后)完成$/u.test(route) &&
    bridge.length === 0 &&
    suffix.length === 0
  ) {
    return true;
  }
  if (
    /^(?:必須|必须)?阻塞流程$/u.test(suffix)
  ) {
    return /^(?:時|时)$/u.test(bridge);
  }
  if (
    /^(?:批准|審批|审批|審查|审查|核對|核对)(?:後|后)完成$/u
      .test(suffix)
  ) {
    return /^(?:且(?:風險|风险)低(?:時|时)可在)$/u.test(bridge);
  }
  if (
    /^(?:退回)/u.test(route) &&
    /^(?:必須先|必须先|先)$/u.test(bridge)
  ) {
    return true;
  }
  if (
    /^(?:complete|complete the workflow|完成|完成流程)$/u.test(route) &&
    bridge.length === 0 &&
    suffix.length === 0
  ) {
    return true;
  }
  if (
    /^(?:complete|complete the workflow)$/u.test(route) &&
    /^(?:branches?)$/u.test(suffix) &&
    /^(?:versus|vs\.?)\s+(?:at\s+least|or\s+above|or\s+more|or\s+higher|above|greater\s+than|exceeds|over|below|less\s+than|under|at\s+most|no\s+more\s+than|not\s+over)\s+(?:hkd\s+)?\d[\d,.]*\s+as$/u
      .test(bridge)
  ) {
    return true;
  }
  const englishDirect =
    /^(?:(?:and\s+)?then\s+|and\s+)?(?:(?:also\s+)?(?:adds?|requires?|seeks?|obtains?)|routes?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to|go(?:es)?(?:\s+from\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,79})?\s+to|sends?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to)$/u
      .test(bridge);
  const englishCompound =
    /^(?:(?:and\s+goods-received\s+total[\s,，:：\-–—]*)?skip\s+mismatch\s+review\s+and\s+go\s+to|or\s+a\s+receipt\s+is\s+missing[\s,，:：\-–—]*(?:then\s+)?(?:adds?|requires?)|or\s+sensitive\s+data\s+also\s+requires?)$/u
      .test(bridge);
  const cjkDirect =
    /^(?:及|並|并|以及|且)?(?:(?:才|則|则|便|即|者|時|时)?(?:必須|必须)?(?:先|再)?(?:增加|加入|增設|增设|要求|需要|配對|配对|退回)|(?:才|則|则|便|即|者|時|时)?走(?:額外|额外)?|(?:才|則|则|便|即|者|時|时)?(?:必須|必须)?再?(?:經|经)|(?:才|則|则|便|即|者|時|时)?(?:由|再由|交由|送交|轉至|转至|完成)|(?:必須|必须)在[\p{L}\p{N}]{1,24}(?:前|後|后)完成)$/u
      .test(bridge);
  const cjkCompound =
    /^(?:或期限(?:超過|超过)九十日者增加|或需要(?:監管報告|监管报告)(?:時|时)增加|或高(?:風險|风险)增加)$/u
      .test(bridge);
  return englishDirect || englishCompound || cjkDirect || cjkCompound;
}

function semanticConditionRouteOnlyPrefixIsAffirmative(
  parts: Readonly<{ prefix: string; route: string; suffix: string }>,
) {
  const prefix = templateCopilotV3NormalizeLexicalText(parts.prefix)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  if (prefix.length === 0) return true;
  if (
    /^(?:matching|qualifying)\s+(?:requests?|workflows?|branches?)\s+routes?\s+to$/u
      .test(prefix)
  ) {
    return true;
  }
  return semanticConditionPredicateRouteBridgeIsAffirmative(prefix, parts);
}

function semanticConditionOtherwiseRouteHasAffinity(
  route: TemplateCopilotV3ReviewObservation,
  fields: readonly TemplateCopilotV3ReviewObservation[],
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.some((anchor) =>
    operators.some((operator) =>
      values.some((value) => {
        const operatorIndex = semanticHardClauseIndexInAnchor(
          operator,
          anchor,
        );
        const valueIndex = semanticHardClauseIndexInAnchor(value, anchor);
        const routeIndex = semanticHardClauseIndexInAnchor(route, anchor);
        if (
          operatorIndex === null ||
          valueIndex === null ||
          routeIndex === null ||
          operatorIndex !== valueIndex ||
          Math.abs(routeIndex - operatorIndex) > 2
        ) {
          return false;
        }
        const clauses = semanticHardClauseSegments(anchor.exactText);
        const governing = clauses[operatorIndex];
        const branch = clauses[routeIndex];
        if (
          !governing ||
          !branch ||
          !semanticConditionOtherwiseRouteIsAffirmative(
            route,
            branch,
            anchor,
            operatorIndex,
            routeIndex,
          )
        ) {
          return false;
        }
        if (routeIndex === operatorIndex) return true;
        if (
          !semanticConditionClauseHasIndependentPredicate(branch.text) &&
          semanticConditionDefaultBranchHasAffinity(
            branch.text,
            fields,
            operators,
            values,
          )
        ) {
          return true;
        }
        if (
          !semanticThresholdClauseHasComparison(governing.text) ||
          !semanticThresholdClauseHasComparison(branch.text)
        ) {
          return false;
        }
        return fields.some((field) =>
          semanticConditionThresholdOtherwiseBranchIsClosed(
            field,
            route,
            operator,
            value,
            anchor,
          )
        );
      })
    )
  );
}

function semanticConditionClauseHasIndependentPredicate(wording: string) {
  const normalized = templateCopilotV3NormalizeLexicalText(wording);
  return semanticThresholdClauseHasComparison(normalized) ||
    /\b(?:equals?|equal\s+to|not\s+equal(?:\s+to)?|other\s+than|contains?)\b/u
      .test(normalized) ||
    /(?:等於|等于|不等於|不等于|包含|為是|为是|為真|为真|已選|已选|已選擇|已选择)/u
      .test(normalized);
}

function semanticConditionRouteIntroducesPredicate(
  route: TemplateCopilotV3ReviewObservation,
  fields: readonly TemplateCopilotV3ReviewObservation[],
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.some((anchor) =>
    fields.some((field) =>
      operators.some((operator) =>
        values.some((value) => {
          const routeIndex = semanticHardClauseIndexInAnchor(route, anchor);
          const fieldIndex = semanticHardClauseIndexInAnchor(field, anchor);
          const operatorIndex = semanticHardClauseIndexInAnchor(
            operator,
            anchor,
          );
          const valueIndex = semanticHardClauseIndexInAnchor(value, anchor);
          if (
            routeIndex === null ||
            fieldIndex === null ||
            operatorIndex === null ||
            valueIndex === null ||
            routeIndex !== fieldIndex ||
            fieldIndex !== operatorIndex ||
            operatorIndex !== valueIndex
          ) {
            return false;
          }
          const fieldSharesRouteSpan =
            field.sourceSpan.messageId === route.sourceSpan.messageId &&
            field.sourceSpan.startCodePoint ===
              route.sourceSpan.startCodePoint &&
            field.sourceSpan.endCodePoint === route.sourceSpan.endCodePoint;
          const predicateStart = Math.min(
            operator.sourceSpan.startCodePoint,
            value.sourceSpan.startCodePoint,
            ...(
              fieldSharesRouteSpan
                ? []
                : [field.sourceSpan.startCodePoint]
            ),
          );
          if (route.sourceSpan.endCodePoint > predicateStart) {
            return false;
          }
          const clause =
            semanticHardClauseSegments(anchor.exactText)[routeIndex];
          const parts = clause === undefined
            ? null
            : semanticConditionRouteClauseParts(route, clause, anchor);
          return parts !== null &&
            templateCopilotV3RouteFirstPredicateIsAffirmative(parts);
        })
      )
    )
  );
}

function semanticConditionClauseIsDecisionBranch(
  wording: string,
  routeQuote: string,
) {
  const normalized = templateCopilotV3NormalizeLexicalText(wording)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  const route = templateCopilotV3NormalizeLexicalText(routeQuote);
  if (route.length === 0) return false;
  const routeIndex = normalized.indexOf(route);
  if (routeIndex < 0) return false;
  const prefix = normalized
    .slice(0, routeIndex)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  const suffix = normalized
    .slice(routeIndex + route.length)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  if (
    /\b(?:is|are|was|were|be|been|being|gets?|got)\s+(?:logged|recorded|noted|reported|stored|counted)$/u
      .test(suffix) ||
    /(?:會|会)?(?:被)?(?:記錄|记录|登記|登记|報告|报告|留存|保存)$/u
      .test(suffix)
  ) {
    return false;
  }
  const englishPrefix =
    /^(?:if|when)(?:\s+(?:either|both|the|any|all))?$/u.test(prefix);
  const englishSuffix =
    /^(?:approves?|approved|rejects?|rejected|endorses?|endorsed|reviews?|reviewed|confirms?|confirmed)\b(?:\s+(?:the\s+)?(?:request|workflow|it))?[\s,，:：\-–—]+(?:then\s+)?(?:returns?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+(?:to\s+(?:the\s+)?(?:requester|applicant|employee|initiator|submitter|sender|preparer|coordinator|vendor|supplier|subcontractor|accounts\s+payable|[\p{L}\p{N}][\p{L}\p{N}'’&/()\-]{0,23}(?:\s+[\p{L}\p{N}][\p{L}\p{N}'’&/()\-]{0,23}){0,3}\s+(?:owner|manager|coordinator|requester|applicant|team|officer))\s+)?for\s+correction|completes?(?:\s+(?:the\s+)?(?:request|workflow|it))?|(?:routes?|sends?)(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,79}|go(?:es)?\s+to\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,79}|(?:adds?|requires?)\s+(?:an?\s+)?(?:approval|review|stage|step)(?:\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,63})?)$/u
      .test(suffix);
  const chinesePrefix =
    /^(?:若|如果|當|当)(?:任一|任何|兩者|两者|全部)?$/u.test(prefix);
  const chineseSuffix =
    /^(?:批准|拒絕|拒绝|審批|审批|認可|认可|審查|审查|確認|确认)(?:(?:該|该)?(?:申請|申请|流程))?[\s,，:：\-–—]*(?:則|则|便|即|後|后)?(?:退回(?:(?:該|该)?(?:申請人|申请人|發起人|发起人|提交人|員工|员工|編製人|编制人|分判商|供應商|供应商)|[\p{L}\p{N}]{1,16}(?:負責人|负责人|主管|經理|经理|協調員|协调员))?(?:修改|修正|補正|补正|更正|確認差異|确认差异)|(?:完成|結束|结束)(?:(?:該|该)?(?:申請|申请|流程))?|(?:轉至|转至|送交|交由|提交)[\p{L}\p{N}\s]{1,48}|(?:增加|加入|需要|要求)[\p{L}\p{N}\s]{0,40}(?:批准|審批|审批|審查|审查|評審|评审|核對|核对|流程|階段|阶段|步驟|步骤))$/u
      .test(suffix);
  return (englishPrefix && englishSuffix) ||
    (chinesePrefix && chineseSuffix);
}

function semanticConditionRouteInClauseIsAffirmative(
  route: TemplateCopilotV3ReviewObservation,
  clause: Readonly<{
    startCodePoint: number;
    endCodePoint: number;
    text: string;
  }>,
  anchor: TemplateCopilotV3SourceSpan,
) {
  const hint = semanticConditionRouteHint(route);
  const parts = semanticConditionRouteClauseParts(route, clause, anchor);
  return hint !== null &&
    parts !== null &&
    templateCopilotV3MatchingRouteIsAffirmative(parts, hint);
}

function semanticConditionOtherwiseRouteIsAffirmative(
  route: TemplateCopilotV3ReviewObservation,
  clause: Readonly<{
    startCodePoint: number;
    endCodePoint: number;
    text: string;
  }>,
  anchor: TemplateCopilotV3SourceSpan,
  governingHardClauseIndex: number,
  routeHardClauseIndex: number,
) {
  const hint = semanticConditionRouteHint(route);
  const parts = semanticConditionRouteClauseParts(route, clause, anchor);
  if (hint === null || parts === null) return false;
  if (
    templateCopilotV3ImmediateDefaultRouteIsAffirmative({
      ...parts,
      hint,
      governingHardClauseIndex,
      routeHardClauseIndex,
    })
  ) {
    return true;
  }
  if (hint !== "complete") {
    return templateCopilotV3MatchingRouteIsAffirmative(parts, hint);
  }
  const prefix = templateCopilotV3NormalizeLexicalText(parts.prefix)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  const suffix = templateCopilotV3NormalizeLexicalText(parts.suffix)
    .replace(/^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu, "");
  const routeText = templateCopilotV3NormalizeLexicalText(parts.route);
  const activePrefix =
    /(?:^|\b)(?:otherwise|else|by\s+default|normal\s+visits?|ordinary\s+visits?|as)$/u
      .test(prefix) ||
    /(?:否則|否则)$/u.test(prefix) ||
    /^(?:if\s+both\s+(?:approve|approved))$/u.test(prefix) ||
    /^(?:其他|其它)(?:假別|假别)在\s*hr\s*(?:核對|核对)(?:後|后)$/u
      .test(prefix) ||
    /^(?:非高風險|非高风险)(?:則|则)?(?:項目經理|项目经理)(?:後|后)$/u
      .test(prefix) ||
    /^(?:普通辦公室到訪|普通办公室到访)在主管批准(?:後|后)$/u
      .test(prefix);
  const activeSuffix =
    suffix.length === 0 ||
    /^(?:after\b|the\s+workflow\b|branches?\b)/u.test(suffix);
  return [
    "complete",
    "complete the workflow",
    "完成",
    "完成流程",
  ].includes(routeText) && activePrefix && activeSuffix;
}

function semanticConditionRouteClauseParts(
  route: TemplateCopilotV3ReviewObservation,
  clause: Readonly<{
    startCodePoint: number;
    endCodePoint: number;
    text: string;
  }>,
  anchor: TemplateCopilotV3SourceSpan,
) {
  return templateCopilotV3SliceConditionRouteClause(
    clause.text,
    route.sourceSpan.startCodePoint -
      anchor.startCodePoint -
      clause.startCodePoint,
    route.sourceSpan.endCodePoint -
      anchor.startCodePoint -
      clause.startCodePoint,
  );
}

function semanticConditionRouteHint(
  route: TemplateCopilotV3ReviewObservation,
): TemplateCopilotV3ConditionRouteHint | null {
  const hint = route.advisoryHint;
  return hint === "stage_reference" ||
      hint === "condition_reference" ||
      hint === "complete" ||
      hint === "return_for_correction" ||
      hint === "unsupported_outcome"
    ? hint
    : null;
}

function semanticConditionDefaultBranchHasAffinity(
  wording: string,
  fields: readonly TemplateCopilotV3ReviewObservation[],
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
) {
  const normalized = templateCopilotV3NormalizeLexicalText(wording)
    .replace(/^[\s,，:：\-–—]+/gu, "");
  if (
    /^(?:otherwise|else|by\s+default)\b/u.test(normalized) ||
    /^(?:否則|否则)/u.test(normalized)
  ) {
    return true;
  }
  const predicateTerms = [...fields, ...operators, ...values]
    .map((observation) =>
      templateCopilotV3NormalizeLexicalText(observation.quote)
    );
  const hasExactPredicate = (...aliases: string[]) =>
    predicateTerms.some((term) => aliases.includes(term));
  const normalEnglishVisit =
    hasExactPredicate("high-risk visit", "high-risk visits") &&
    /^(?:normal|ordinary)\s+visits?\b/u.test(normalized);
  const nonHighRiskProcess =
    hasExactPredicate("高風險工序", "高风险工序") &&
    /^(?:非高風險|非高风险)/u.test(normalized);
  if (normalEnglishVisit || nonHighRiskProcess) return true;
  const leave =
    hasExactPredicate(
      "sick leave",
      "unpaid leave",
      "病假日數",
      "病假日数",
      "無薪假",
      "无薪假",
    );
  const otherLeave =
    /^other\s+leave\s+types?\b/u.test(normalized) ||
    /^(?:其他|其它)(?:假別|假别)/u.test(normalized);
  if (leave && otherLeave) return true;
  const restrictedArea = hasExactPredicate(
    "restricted area",
    "restricted areas",
    "受限制區域",
    "受限制区域",
  );
  const normalOfficeVisit =
    /^(?:normal|ordinary)\s+office\s+visits?\b/u.test(normalized) ||
    /^(?:普通|正常|一般)(?:辦公室到訪|办公室到访)/u.test(normalized);
  return restrictedArea && normalOfficeVisit;
}

function semanticConditionThresholdOtherwiseBranchIsClosed(
  field: TemplateCopilotV3ReviewObservation,
  route: TemplateCopilotV3ReviewObservation,
  operator: TemplateCopilotV3ReviewObservation,
  value: TemplateCopilotV3ReviewObservation,
  anchor: TemplateCopilotV3SourceSpan,
) {
  const fieldIndex = semanticHardClauseIndexInAnchor(field, anchor);
  const routeIndex = semanticHardClauseIndexInAnchor(route, anchor);
  const operatorIndex = semanticHardClauseIndexInAnchor(operator, anchor);
  const valueIndex = semanticHardClauseIndexInAnchor(value, anchor);
  if (
    fieldIndex === null ||
    routeIndex === null ||
    operatorIndex === null ||
    valueIndex === null ||
    fieldIndex !== routeIndex ||
    routeIndex + 1 !== operatorIndex ||
    operatorIndex !== valueIndex
  ) {
    return false;
  }
  const complementary =
    semanticComplementaryThresholdPattern(operator.advisoryHint);
  const clause = semanticHardClauseSegments(anchor.exactText)[routeIndex];
  if (complementary === null || clause === undefined) return false;
  const normalized =
    templateCopilotV3NormalizeLexicalText(clause.text);
  const fieldText = escapeSemanticRegExp(
    templateCopilotV3NormalizeLexicalText(field.quote),
  );
  const valueText = escapeSemanticRegExp(
    templateCopilotV3NormalizeLexicalText(value.quote),
  );
  const routeText = escapeSemanticRegExp(
    templateCopilotV3NormalizeLexicalText(route.quote),
  );
  if (
    fieldText.length === 0 ||
    valueText.length === 0 ||
    routeText.length === 0
  ) {
    return false;
  }
  const routeAction =
    "(?:routes?(?:\\s+(?:the\\s+)?(?:request|workflow|it))?\\s+to|go(?:es)?(?:\\s+from\\s+[\\p{L}\\p{N}][\\p{L}\\p{N}\\s'’&/()\\-]{0,79})?\\s+to|sends?(?:\\s+(?:the\\s+)?(?:request|workflow|it))?\\s+to)";
  return new RegExp(
    `^(?:otherwise|else|by\\s+default)\\s+(?:if|when)\\s+${fieldText}\\s+(?:is\\s+)?${complementary}\\s+(?:(?:hkd)\\s*)?${valueText}\\s*[,，]\\s*(?:(?:${routeAction})\\s+${routeText}|${routeText}\\s+is\\s+(?:the\\s+)?final\\s+approver)$`,
    "u",
  ).test(normalized);
}

function semanticConditionFieldCarriesForward(
  field: TemplateCopilotV3ReviewObservation,
  operator: TemplateCopilotV3ReviewObservation,
  value: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.some((anchor) => {
    const fieldIndex = semanticHardClauseIndexInAnchor(field, anchor);
    const operatorIndex = semanticHardClauseIndexInAnchor(operator, anchor);
    const valueIndex = semanticHardClauseIndexInAnchor(value, anchor);
    if (
      fieldIndex === null ||
      operatorIndex === null ||
      valueIndex === null ||
      operatorIndex !== valueIndex
    ) {
      return false;
    }
    const clauses = semanticHardClauseSegments(anchor.exactText);
    const target = clauses[operatorIndex];
    if (!target) return false;
    const targetText = templateCopilotV3NormalizeLexicalText(target.text);
    const fieldText = templateCopilotV3NormalizeLexicalText(field.quote);
    const operatorText = templateCopilotV3NormalizeLexicalText(operator.quote);
    if (
      fieldText.length > 0 &&
      operatorText.length > 0 &&
      new RegExp(
        String.raw`^(?:(?:(?:otherwise|else)\s*[,，:：\-–—]?\s*|(?:否則|否则)\s*)?(?:(?:if|when)\s+(?:the\s+)?|(?:若|如果|當|当)\s*)?)?${escapeSemanticRegExp(fieldText)}(?:\s+is)?\s*${escapeSemanticRegExp(operatorText)}`,
        "u",
      ).test(targetText)
    ) {
      return true;
    }
    if (
      fieldIndex >= operatorIndex ||
      operatorIndex - fieldIndex > 2
    ) {
      return false;
    }
    const operatorRelativeStart =
      operator.sourceSpan.startCodePoint - anchor.startCodePoint;
    const prefix = Array.from(anchor.exactText)
      .slice(target.startCodePoint, operatorRelativeStart)
      .join("");
    if (
      templateCopilotV3NormalizeLexicalText(prefix).length > 0 ||
      !semanticThresholdTargetPredicateIsClosed(
        operator,
        value,
        target,
        anchor,
      )
    ) {
      return false;
    }
    const fieldClause = clauses[fieldIndex];
    if (
      !fieldClause ||
      !semanticThresholdFieldClauseIsClosedCarry(
        fieldClause.text,
        field.quote,
        operator.advisoryHint,
      )
    ) {
      return false;
    }
    return clauses
      .slice(fieldIndex + 1, operatorIndex)
      .every((clause) =>
        semanticThresholdContinuationClauseIsClosed(
          clause.text,
          operator.advisoryHint,
        )
      );
  });
}

function semanticThresholdTargetPredicateIsClosed(
  operator: TemplateCopilotV3ReviewObservation,
  value: TemplateCopilotV3ReviewObservation,
  clause: Readonly<{
    startCodePoint: number;
    endCodePoint: number;
    text: string;
  }>,
  anchor: TemplateCopilotV3SourceSpan,
) {
  const operatorStart =
    operator.sourceSpan.startCodePoint -
    anchor.startCodePoint -
    clause.startCodePoint;
  const operatorEnd =
    operator.sourceSpan.endCodePoint -
    anchor.startCodePoint -
    clause.startCodePoint;
  const valueStart =
    value.sourceSpan.startCodePoint -
    anchor.startCodePoint -
    clause.startCodePoint;
  const valueEnd =
    value.sourceSpan.endCodePoint -
    anchor.startCodePoint -
    clause.startCodePoint;
  const codePoints = Array.from(clause.text);
  if (
    operatorStart < 0 ||
    operatorEnd > valueStart ||
    valueStart < 0 ||
    valueEnd > codePoints.length
  ) {
    return false;
  }
  const bridge = codePoints.slice(operatorEnd, valueStart).join("");
  return /^\s*(?:(?:hkd|港幣|港币)\s*)?$/u.test(
    templateCopilotV3NormalizeLexicalText(bridge),
  );
}

function semanticThresholdFieldClauseIsClosedCarry(
  wording: string,
  fieldQuote: string,
  targetHint: string | null,
) {
  const complementary = semanticComplementaryThresholdPattern(targetHint);
  if (complementary === null) return false;
  const normalized = templateCopilotV3NormalizeLexicalText(wording);
  const field = escapeSemanticRegExp(
    templateCopilotV3NormalizeLexicalText(fieldQuote),
  );
  if (field.length === 0) return false;
  const threshold =
    "(?:(?:hkd)\\s*|(?:港幣|港币)\\s*)?(?:\\d[\\d,.]*|[零〇一二三四五六七八九十百千萬万億亿兆兩两]+元)";
  const english = normalized.match(
    new RegExp(
      `^(?:if|when)\\s+${field}\\s+(?:is\\s+)?${complementary}\\s+${threshold}\\s*[,，]\\s*(?<route>[\\p{L}\\p{N}][\\p{L}\\p{N}\\s'’&/()\\-]{0,63})\\s+is\\s+(?:the\\s+)?final\\s+approver$`,
      "u",
    ),
  );
  if (
    english?.groups?.route &&
    semanticThresholdEnglishRouteNameIsClosed(english.groups.route)
  ) {
    return true;
  }
  const englishRoute = normalized.match(
    new RegExp(
      `^(?:if|when)\\s+${field}\\s+(?:is\\s+)?${complementary}\\s+${threshold}\\s*[,，]\\s*(?:routes?|go(?:es)?|sends?)(?:\\s+(?:the\\s+)?(?:request|workflow|it))?\\s+to\\s+(?<route>[\\p{L}\\p{N}][\\p{L}\\p{N}\\s'’&/()\\-]{0,63})$`,
      "u",
    ),
  );
  if (
    englishRoute?.groups?.route &&
    semanticThresholdEnglishRouteNameIsClosed(englishRoute.groups.route)
  ) {
    return true;
  }
  const lowRisk = normalized.match(
    new RegExp(
      `^${field}${complementary}\\s*${threshold}且(?:風險|风险)低(?:時|时)可在(?<route>[\\p{L}\\p{N}]{1,24})(?:批准|審批|审批|審查|审查)(?:後|后)完成$`,
      "u",
    ),
  );
  if (
    lowRisk?.groups?.route &&
    semanticThresholdCjkRouteNameIsClosed(lowRisk.groups.route)
  ) {
    return true;
  }
  const direct = normalized.match(
    new RegExp(
      `^${field}${complementary}\\s*${threshold}\\s*(?:由|交由|送交|轉至|转至)(?<route>[\\p{L}\\p{N}]{1,24})(?:批准|審批|审批|審查|审查)(?:(?:後|后)完成)?$`,
      "u",
    ),
  );
  if (
    direct?.groups?.route &&
    semanticThresholdCjkRouteNameIsClosed(direct.groups.route)
  ) {
    return true;
  }
  return new RegExp(
    `^(?:本地|當地|当地)(?:低風險|低风险)且${field}${complementary}\\s*${threshold}\\s*[,，]\\s*(?:財務|财务)(?:審核|审核)?(?:後|后)完成$`,
    "u",
  ).test(normalized);
}

function semanticThresholdContinuationClauseIsClosed(
  wording: string,
  targetHint: string | null,
) {
  const operator = semanticThresholdPattern(targetHint);
  if (operator === null) return false;
  const normalized = templateCopilotV3NormalizeLexicalText(wording);
  const threshold =
    "(?:(?:hkd)\\s*|(?:港幣|港币)\\s*)?(?:\\d[\\d,.]*|[零〇一二三四五六七八九十百千萬万億亿兆兩两]+元)";
  const matched = normalized.match(
    new RegExp(
      `^${operator}\\s*${threshold}\\s*(?:由|交由|送交|轉至|转至)(?<route>[\\p{L}\\p{N}]{1,24})(?:批准|審批|审批|審查|审查)(?:(?:後|后)完成)?$`,
      "u",
    ),
  );
  return Boolean(
    matched?.groups?.route &&
      semanticThresholdCjkRouteNameIsClosed(matched.groups.route),
  );
}

function semanticThresholdEnglishRouteNameIsClosed(value: string) {
  const normalized = templateCopilotV3NormalizeLexicalText(value);
  return /^(?:(?:general|finance|financial|legal|security|compliance|department|business|regional|country|project|procurement|operations|technical|executive|managing|senior|chief|credit|risk|sales|data|hr)\s+){0,3}(?:manager|director|controller|officer|head|chair|chairman|chairperson|approver|ceo|cfo|coo|president|committee|board|finance|legal|security|hr)$/u
    .test(normalized);
}

function semanticThresholdCjkRouteNameIsClosed(value: string) {
  const normalized = templateCopilotV3NormalizeLexicalText(value);
  const qualifier =
    "(?:公司|集團|集团|董事會|董事会|財務|财务|法務|法务|合規|合规|信用|風險|风险|安全|資訊保安|信息安全|人力資源|人力资源|行政|銷售|销售|採購|采购|部門|部门|項目|项目|工程|品質|质量|營運|运营|總務|总务)";
  const role =
    "(?:經理|经理|總監|总监|主管|總裁|总裁|主席|主任|負責人|负责人|審批人|审批人|董事|高管|委員會|委员会)";
  return new RegExp(`^(?:${qualifier}){0,3}${role}$`, "u").test(normalized) ||
    /^(?:財務|财务|法務|法务|合規|合规|安全|資訊保安|信息安全|HR)$/u
      .test(normalized);
}

function semanticComplementaryThresholdPattern(hint: string | null) {
  switch (hint) {
    case ">":
      return "(?:at\\s+most|no\\s+more\\s+than|not\\s+over|does\\s+not\\s+exceed|不超過|不超过|不多於|不多于)";
    case ">=":
      return "(?:below|less\\s+than|under|低於|低于|小於|小于)";
    case "<":
      return "(?:at\\s+least|or\\s+above|or\\s+more|or\\s+higher|不少於|不少于|至少)";
    case "<=":
      return "(?:above|greater\\s+than|exceeds?|over|超過|超过|大於|大于)";
    default:
      return null;
  }
}

function semanticThresholdPattern(hint: string | null) {
  switch (hint) {
    case ">":
      return "(?:above|greater\\s+than|exceeds?|over|超過|超过|大於|大于)";
    case ">=":
      return "(?:at\\s+least|or\\s+above|or\\s+more|or\\s+higher|不少於|不少于|至少)";
    case "<":
      return "(?:below|less\\s+than|under|低於|低于|小於|小于)";
    case "<=":
      return "(?:at\\s+most|no\\s+more\\s+than|not\\s+over|does\\s+not\\s+exceed|不超過|不超过|不多於|不多于)";
    default:
      return null;
  }
}

function escapeSemanticRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function semanticHardClauseIndexInAnchor(
  observation: TemplateCopilotV3ReviewObservation,
  anchor: TemplateCopilotV3SourceSpan,
) {
  if (
    anchor.messageId !== observation.sourceSpan.messageId ||
    observation.sourceSpan.startCodePoint < anchor.startCodePoint ||
    observation.sourceSpan.endCodePoint > anchor.endCodePoint
  ) {
    return null;
  }
  const relativeStart =
    observation.sourceSpan.startCodePoint - anchor.startCodePoint;
  return Array.from(anchor.exactText)
    .slice(0, relativeStart)
    .filter((character) => semanticHardClauseSeparator(character)).length;
}

function semanticHardClauseSegments(text: string) {
  const codePoints = Array.from(text);
  const clauses: Array<
    Readonly<{
      startCodePoint: number;
      endCodePoint: number;
      text: string;
    }>
  > = [];
  let startCodePoint = 0;
  for (let index = 0; index < codePoints.length; index += 1) {
    if (!semanticHardClauseSeparator(codePoints[index])) continue;
    clauses.push({
      startCodePoint,
      endCodePoint: index,
      text: codePoints.slice(startCodePoint, index).join(""),
    });
    startCodePoint = index + 1;
  }
  clauses.push({
    startCodePoint,
    endCodePoint: codePoints.length,
    text: codePoints.slice(startCodePoint).join(""),
  });
  return clauses;
}

function semanticThresholdClauseHasComparison(wording: string) {
  const normalized = templateCopilotV3NormalizeLexicalText(wording);
  return /\b(?:above|below|over|under|at\s+least|at\s+most|more\s+than|less\s+than|exceeds?)\b/u
    .test(normalized) ||
    /(?:不超過|不超过|超過|超过|高於|高于|低於|低于|不少於|不少于|不多於|不多于)/u
      .test(normalized);
}

function semanticCoreGroupsShareClause(
  groups: readonly (readonly TemplateCopilotV3ReviewObservation[])[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  const groupClauseKeys = groups.map(
    (group) =>
      new Set<string>(
      group.flatMap((observation) =>
        semanticClauseKeys(observation, sourceAnchors)
      ),
      ),
  );
  if (groupClauseKeys.some((keys) => keys.size === 0)) return false;
  const [initialKeys, ...remainingKeys] = groupClauseKeys;
  if (!initialKeys) return false;
  let shared = new Set<string>(initialKeys);
  for (const keys of remainingKeys) {
    shared = new Set<string>(
      [...shared].filter((key) => keys.has(key)),
    );
    if (shared.size === 0) return false;
  }
  return shared.size > 0;
}

function semanticClauseKeys(
  observation: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  return sourceAnchors.flatMap((anchor) => {
    if (
      anchor.messageId !== observation.sourceSpan.messageId ||
      observation.sourceSpan.startCodePoint < anchor.startCodePoint ||
      observation.sourceSpan.endCodePoint > anchor.endCodePoint
    ) {
      return [];
    }
    const clauseIndex = semanticClauseIndexInAnchor(observation, anchor);
    if (clauseIndex === null) return [];
    return [`${anchor.spanId}:${clauseIndex}`];
  });
}

function semanticClauseIndexInAnchor(
  observation: TemplateCopilotV3ReviewObservation,
  anchor: TemplateCopilotV3SourceSpan,
) {
  if (
    anchor.messageId !== observation.sourceSpan.messageId ||
    observation.sourceSpan.startCodePoint < anchor.startCodePoint ||
    observation.sourceSpan.endCodePoint > anchor.endCodePoint
  ) {
    return null;
  }
  const relativeStart =
    observation.sourceSpan.startCodePoint - anchor.startCodePoint;
  const prefix = Array.from(anchor.exactText)
    .slice(0, relativeStart)
    .join("");
  const hardBoundaries = Array.from(prefix)
    .filter((character) => semanticHardClauseSeparator(character)).length;
  const roleBoundaries = [...prefix.matchAll(semanticRoleClauseBoundaryPattern())]
    .length;
  return hardBoundaries + roleBoundaries;
}

function semanticHardClauseSeparator(character: string) {
  return /[\r\n.!?;。！？；]/u.test(character);
}

function semanticRoleClauseBoundaryPattern() {
  return /\b(?:but|whereas|while|when|if|unless|although|except)\b|(?:但是|但係|但|可是|然而|如果|若|(?<![\p{L}\p{N}])[當当](?!地)|除非)/giu;
}

function semanticLocalClauseBoundaryPattern() {
  return /\b(?:but|whereas|while|when|if|unless|although|except|and\s+(?:an?\s+)?optional)\b|(?:但是|但係|但|可是|然而|如果|若|(?<![\p{L}\p{N}])[當当](?!地)|除非|(?:及|和|與|与|並|并)(?:一份|一個|一个)?(?:可選擇|可选择|可選|可选|選填|选填))/giu;
}

function semanticObservationClause(
  observation: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  const containing = sourceAnchors
    .filter(
      (anchor) =>
        anchor.messageId === observation.sourceSpan.messageId &&
        observation.sourceSpan.startCodePoint >= anchor.startCodePoint &&
        observation.sourceSpan.endCodePoint <= anchor.endCodePoint,
    )
    .sort(
      (left, right) =>
        left.endCodePoint - left.startCodePoint -
          (right.endCodePoint - right.startCodePoint) ||
        compareText(left.spanId, right.spanId),
    )[0];
  if (!containing) return null;
  const codePoints = Array.from(containing.exactText);
  const relativeStart =
    observation.sourceSpan.startCodePoint - containing.startCodePoint;
  const relativeEnd =
    observation.sourceSpan.endCodePoint - containing.startCodePoint;
  let start = relativeStart;
  while (start > 0 && !semanticHardClauseSeparator(codePoints[start - 1])) {
    start -= 1;
  }
  let end = relativeEnd;
  while (
    end < codePoints.length &&
    !semanticHardClauseSeparator(codePoints[end])
  ) {
    end += 1;
  }
  const segment = codePoints.slice(start, end).join("");
  const observationStart = relativeStart - start;
  const observationEnd = relativeEnd - start;
  const boundaries = [
    0,
    ...[...segment.matchAll(semanticLocalClauseBoundaryPattern())].map(
      (match) => Array.from(segment.slice(0, match.index)).length,
    ),
    Array.from(segment).length,
  ]
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const localStart = boundaries[index];
    const localEnd = boundaries[index + 1];
    if (
      observationStart >= localStart &&
      observationEnd <= localEnd
    ) {
      return Array.from(segment).slice(localStart, localEnd).join("");
    }
  }
  return segment;
}

function semanticObservationIsContradicted(
  factId: TemplateCopilotV3FragmentFactId,
  observation: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  const clause = semanticObservationClause(observation, sourceAnchors);
  if (clause === null) return true;
  const wording = templateCopilotV3NormalizeLexicalText(clause);
  if (
    factId === "request.fields" &&
    observation.role === "required" &&
    observation.advisoryHint === "true"
  ) {
    return semanticOptionalityIsExplicit(wording) ||
      semanticFieldActionIsProhibited(wording);
  }
  if (factId === "attachments.requirements") {
    const prohibited = semanticAttachmentActionIsProhibited(wording);
    if (observation.role === "kind") return prohibited;
    if (observation.role === "required") {
      return prohibited ||
        (observation.advisoryHint === "true" &&
          semanticOptionalityIsExplicit(wording));
    }
  }
  if (
    factId === "workflow.conditions" &&
    observation.role === "operator"
  ) {
    return semanticConditionOperatorIsExternallyNegated(
      observation,
      sourceAnchors,
    );
  }
  if (
    factId === "workflow.stages" &&
    observation.role === "kind" &&
    observation.advisoryHint !== null
  ) {
    return semanticStageActionIsNegated(
      wording,
      observation.advisoryHint,
    );
  }
  if (
    factId === "notifications.rules" &&
    (observation.role === "event" || observation.role === "recipient")
  ) {
    return semanticNotificationActionIsProhibited(wording);
  }
  return false;
}

function semanticConditionOperatorIsExternallyNegated(
  observation: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  const containing = sourceAnchors
    .filter(
      (anchor) =>
        anchor.messageId === observation.sourceSpan.messageId &&
        observation.sourceSpan.startCodePoint >= anchor.startCodePoint &&
        observation.sourceSpan.endCodePoint <= anchor.endCodePoint,
    )
    .sort(
      (left, right) =>
        left.endCodePoint - left.startCodePoint -
          (right.endCodePoint - right.startCodePoint) ||
        compareText(left.spanId, right.spanId),
    )[0];
  if (!containing) return true;
  const codePoints = Array.from(containing.exactText);
  const relativeStart =
    observation.sourceSpan.startCodePoint - containing.startCodePoint;
  if (relativeStart < 0 || relativeStart > codePoints.length) return true;
  let start = relativeStart;
  while (start > 0 && !semanticHardClauseSeparator(codePoints[start - 1])) {
    start -= 1;
  }
  const prefix = templateCopilotV3NormalizeLexicalText(
    codePoints.slice(start, relativeStart).join(""),
  );
  return /(?:\b(?:(?:do|does|did|is|are|was|were|has|have|had|can|could|may|might|must|shall|should|will|would)\s+not|(?:do|does|did|is|are|was|were|has|have|had|can|could|may|might|must|shall|should|would)n['’]t|cannot|won['’]t|never|not|no|without|fails?\s+to))(?:\s+(?:directly|necessarily|actually|ever|explicitly|clearly|normally|usually|automatically|expected|likely|intended|permitted|allowed)){0,2}(?:\s+to)?\s*$/u
    .test(prefix) ||
    /(?:並非|并非|沒有|没有|不|未|無|无|毋|勿|非)(?:(?:直接|明確|明确|實際|实际|必然|一定|自動|自动)){0,2}\s*$/u
      .test(prefix);
}

function semanticOptionalityIsExplicit(wording: string) {
  return /\b(?:optional|not required|is not required|isn't required|need not)\b/u
    .test(wording) ||
    /(?:可選擇|可选择|可選|可选|選填|选填|非必須|非必须|不需要|毋須|毋须|無須|无须)/u
      .test(wording);
}

function semanticFieldActionIsProhibited(wording: string) {
  return /\b(?:do|does|did|must|shall|should|may|can|will|would)\s+not\s+(?:add|collect|complete|enter|fill(?:\s+in)?|include|provide|record|require|supply)\b/u
    .test(wording) ||
    /(?:不要|不得|不准|禁止|切勿)\s*(?:加入|添加|收集|完成|輸入|输入|填寫|填写|提供|記錄|记录)/u
      .test(wording);
}

function semanticAttachmentActionIsProhibited(wording: string) {
  return /\b(?:do|does|did|must|shall|should|may|can|will|would)\s+not\s+(?:add|attach|complete|fill(?:\s+in)?|include|provide|submit|upload)\b/u
    .test(wording) ||
    /\b(?:do|does|did)\s+not\s+need\s+to\s+(?:add|attach|complete|fill(?:\s+in)?|include|provide|submit|upload)\b/u
      .test(wording) ||
    /\b(?:no\s+need\s+to|need\s+not)\s+(?:add|attach|complete|fill(?:\s+in)?|include|provide|submit|upload)\b/u
      .test(wording) ||
    /\bno\s+(?:attachment|document|file|upload)s?\s+(?:is|are)?\s*allowed\b/u
      .test(wording) ||
    /(?:不要|不得|不准|禁止|切勿)\s*(?:上載|上传|附上|提交|提供|加入|添加|填寫|填写)/u
      .test(wording) ||
    /(?:不需要|毋須|毋须|無需|无需|無須|无须)\s*(?:上載|上传|附上|提交|提供|加入|添加|填寫|填写)/u
      .test(wording);
}

function semanticStageActionIsNegated(
  wording: string,
  hint: string,
) {
  const aliases: Readonly<Record<string, readonly string[]>> = {
    approval: [
      "approve",
      "approves",
      "approval",
      "approved",
      "endorse",
      "endorses",
      "endorsed",
      "confirm",
      "confirms",
      "confirmed",
      "go/no-go",
      "審批",
      "审批",
      "核准",
      "批准",
      "認可",
      "认可",
      "確認",
      "确认",
    ],
    review: [
      "review",
      "reviews",
      "reviewed",
      "compare",
      "compares",
      "compared",
      "audit",
      "audits",
      "audited",
      "審核",
      "审核",
      "覆核",
      "复核",
      "審查",
      "审查",
      "評審",
      "评审",
      "核對",
      "核对",
    ],
    for_information: ["fyi", "for information", "informational", "知會", "知会", "供參考", "供参考", "供知悉"],
    submission: ["submit", "submits", "submission", "提交", "呈交"],
    record_update: ["update", "updates", "updated", "更新"],
  };
  return (aliases[hint] ?? []).some((alias) =>
    semanticPhraseIsImmediatelyNegated(wording, alias)
  );
}

function semanticPhraseIsImmediatelyNegated(
  wording: string,
  phrase: string,
) {
  const normalizedPhrase = templateCopilotV3NormalizeLexicalText(phrase);
  let offset = wording.indexOf(normalizedPhrase);
  while (offset >= 0) {
    const prefix = wording.slice(Math.max(0, offset - 48), offset);
    if (
      /\b(?:do|does|did|is|are|was|were|will|would|should|can|could|may|might|must|shall)\s+not\s*$/u
        .test(prefix) ||
      /(?:不|未|不要|不得|不准|禁止|切勿|毋須|毋须|無須|无须)\s*(?:由[^，。；;\r\n]{1,24})?\s*$/u
        .test(prefix)
    ) {
      return true;
    }
    offset = wording.indexOf(normalizedPhrase, offset + normalizedPhrase.length);
  }
  return false;
}

function semanticNotificationActionIsProhibited(wording: string) {
  return /\b(?:do|does|did|must|shall|should|may|can|will|would)\s+not\s+(?:email|inform|message|notify|send)\b/u
    .test(wording) ||
    /\bno\s+notifications?\s+(?:is|are)?\s*(?:allowed|required|sent)?\b/u
      .test(wording) ||
    /(?:不要|不得|不准|禁止|切勿|不應|不应|毋須|毋须|無須|无须)\s*(?:向[^，。；;\r\n]{1,24})?\s*(?:通知|知會|知会|電郵|电邮|發送|发送)/u
      .test(wording);
}

function semanticHintIsVerified(
  factId: TemplateCopilotV3FragmentFactId,
  leaf: TemplateCopilotV3ReviewObservation,
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  if (semanticObservationIsContradicted(factId, leaf, sourceAnchors)) {
    return false;
  }
  const wording = templateCopilotV3NormalizeLexicalText(leaf.quote);
  const matches = (...aliases: string[]) => aliases.some((alias) => templateCopilotV3NormalizeLexicalText(alias) === wording);
  if (leaf.role === "required") {
    return leaf.advisoryHint === "true"
      ? matches("true", "yes", "required", "require", "requires", "mandatory", "must", "must upload", "must provide", "must include", "must also include", "must submit", "must attach", "required upload", "add", "include", "upload", "attach", "submit", "provide", "fill in", "必須", "必须", "需要", "必填", "上載", "上传", "提交", "附上", "提供", "填寫", "填写", "要填", "須填", "须填", "必須填寫", "必须填写", "必須提供", "必须提供", "必須上載", "必须上传", "須上載", "须上传", "要上載", "要上传", "必須提交", "必须提交", "須提交", "须提交", "必須附上", "必须附上")
      : leaf.advisoryHint === "false" && matches("false", "no", "optional", "not required", "選填", "选填", "非必須", "非必须", "不需要", "毋須", "毋须", "無須", "无须", "可選擇上載", "可選上載", "可选上传");
  }
  if (leaf.role === "kind" && factId === "attachments.requirements") {
    return leaf.advisoryHint === "attachment"
      ? matches("attachment", "document", "file", "uploaded file", "upload", "attach", "pdf", "excel", "csv", "spreadsheet", "image", "photo", "text", "proof", "附件", "檔案", "文件", "上載", "上传", "上載檔案", "上传文件", "試算表", "电子表格", "圖片", "图片", "相片", "照片", "文字", "文本", "證明", "证明")
      : leaf.advisoryHint === "form" && matches("form", "native", "native form", "in-app form", "in app form", "原生", "原生表格", "原生表单", "應用程式內表格", "应用内表单", "表格", "表单");
  }
  if (leaf.role === "kind" && factId === "workflow.stages") {
    const aliases: Readonly<Record<string, readonly string[]>> = {
      approval: ["approve", "approves", "approval", "approved", "endorse", "endorses", "endorsed", "confirm", "confirms", "confirmed", "go/no-go", "審批", "审批", "核准", "批准", "認可", "认可", "確認", "确认"],
      review: ["review", "reviews", "reviewed", "compare", "compares", "compared", "audit", "audits", "audited", "審核", "审核", "覆核", "复核", "審查", "审查", "評審", "评审", "核對", "核对"],
      for_information: ["fyi", "for information", "informational", "知會", "知会", "供參考", "供参考", "供知悉"],
      submission: ["submit", "submits", "submission", "提交", "呈交"],
      record_update: ["update", "updates", "updated", "更新"],
    };
    return leaf.advisoryHint !== null && (aliases[leaf.advisoryHint] ?? []).some((alias) => matches(alias));
  }
  if (leaf.role === "participant_mode" && factId === "workflow.stages") {
    const aliases: Readonly<Record<string, readonly string[]>> = {
      fixed_email: ["fixed email", "固定電郵", "固定电子邮件", "固定電子郵件", "固定邮箱"],
      directory_position: ["directory position", "目錄職位", "目录职位"],
      request_field: ["request field", "申請欄位", "申请字段"],
      requester: ["requester", "申請人", "申请人", "發起人", "发起人"],
      unassigned_at_template: ["unassigned", "resolve later", "範本未指派", "模板未分配", "稍後指定", "稍后指定"],
    };
    return leaf.advisoryHint !== null &&
      (aliases[leaf.advisoryHint] ?? []).some((alias) => matches(alias));
  }
  if (leaf.role === "operator") {
    const aliases: Readonly<Record<string, readonly string[]>> = {
      "=": [
        "=", "equals", "equal", "is yes", "is true", "selected", "is selected", "is missing", "missing", "yes", "true",
        "high-risk", "high risk", "restricted", "international", "production", "production database", "personal", "sensitive", "retrospective", "low-risk", "low risk",
        "等於", "等于", "為是", "为是", "為高", "为高", "已選", "已选", "已選擇", "已选择",
        "高風險", "高风险", "高風險工序", "高风险工序", "受限制區域", "受限制区域", "國際", "国际", "生產", "生产", "生產資料庫", "生产数据库",
        "個人資料", "个人数据", "敏感資料", "敏感数据", "追溯", "低風險", "低风险", "風險低", "风险低",
        "無薪假", "无薪假", "聯營投標", "联营投标", "法定培訓", "法定培训", "境外",
        "申報有利益衝突", "申报有利益冲突", "有利益衝突", "有利益冲突", "有關聯人士", "有关联人士",
        "含資料設備", "含数据设备", "需要監管報告", "需要监管报告", "未驗證", "未验证", "未能提供證書", "未能提供证书",
      ],
      "!=": [
        "!=", "not equal", "not equal to", "is not", "not in", "outside", "outside of", "other than",
        "不是", "並非", "并非", "不在", "不屬於", "不属于", "不等於", "不等于",
        "非高風險", "非高风险", "非生產", "非生产", "非個人資料", "非个人数据",
      ],
      ">": [">", "greater than", "above", "exceed", "exceeds", "over", "大於", "大于", "超過", "超过"],
      ">=": [">=", "at least", "or above", "or more", "or higher", "大於或等於", "大于或等于", "或以上", "三日或以上"],
      "<": ["<", "less than", "below", "小於", "小于"],
      "<=": ["<=", "at most", "not exceed", "does not exceed", "no more than", "not over", "小於或等於", "小于或等于", "不超過", "不超过"],
      contains: ["contains", "包含"],
    };
    return leaf.advisoryHint !== null && (aliases[leaf.advisoryHint] ?? []).some((alias) => matches(alias));
  }
  if (leaf.role === "matching_route" || leaf.role === "otherwise_route") {
    if (leaf.advisoryHint === "complete") return matches("complete", "complete the workflow", "完成", "完成流程");
    if (leaf.advisoryHint === "return_for_correction") return matches("return for correction", "return to requester for correction", "退回更正", "退回申請人更正", "退回申请人更正");
    return (leaf.advisoryHint === "stage_reference" || leaf.advisoryHint === "condition_reference") && wording.length > 0;
  }
  if (leaf.role === "event") {
    const aliases: Readonly<Record<string, readonly string[]>> = {
      request_submitted: ["request submitted", "submitted", "申請已提交", "申请已提交"], stage_assigned: ["stage assigned", "work assigned", "assignment", "assigned", "獲指派", "获指派", "指派", "分派", "分配", "工作已分派", "工作已分配"],
      stage_completed: ["stage completed", "step completed", "步驟已完成", "步骤已完成"], request_rejected: ["request rejected", "rejection", "rejected", "拒絕", "拒绝", "被拒絕", "被拒绝", "申請被拒絕", "申请被拒绝"],
      correction_requested: ["correction requested", "correction", "corrected", "要求更正", "補正", "补正", "修正", "修改"], request_completed: ["request completed", "workflow completed", "completion", "complete", "completed", "完成", "已完成", "流程已完成"], due_soon: ["due soon", "即將到期", "即将到期"], overdue: ["overdue", "已逾期", "逾期"],
    };
    return leaf.advisoryHint !== null && (aliases[leaf.advisoryHint] ?? []).some((alias) => matches(alias));
  }
  if (leaf.role === "recipient") {
    if (leaf.advisoryHint === "source_named_group") return wording.length > 0;
    const aliases: Readonly<Record<string, readonly string[]>> = {
      requester: ["requester", "申請人", "申请人", "發起人", "发起人"], current_stage_participants: ["current stage participants", "current step participants", "目前步驟處理人", "当前步骤处理人"],
      previous_stage_participants: ["previous stage participants", "previous step participants", "上一個步驟處理人", "上一步骤处理人"], all_participants: ["all participants", "all workflow participants", "所有流程參與者", "所有流程参与者"], workflow_owner: ["workflow owner", "流程負責部門", "流程负责部门"],
    };
    return leaf.advisoryHint !== null && (aliases[leaf.advisoryHint] ?? []).some((alias) => matches(alias));
  }
  return wording.length > 0;
}

function semanticValue(observations: readonly TemplateCopilotV3ReviewObservation[], compareSpans: (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) => number) {
  const grouped: Partial<Record<TemplateCopilotV3ProviderQuoteRole, string[]>> = {};
  for (const leaf of dedupeObservations(observations, compareSpans)) {
    const values = grouped[leaf.role] ?? [];
    if (!values.includes(leaf.quote)) values.push(leaf.quote);
    grouped[leaf.role] = values;
  }
  return Object.freeze(Object.fromEntries(Object.entries(grouped).sort(([left], [right]) => compareText(left, right)).map(([role, values]) => [role, Object.freeze(values)]))) as Readonly<Partial<Record<TemplateCopilotV3ProviderQuoteRole, readonly string[]>>>;
}

function missingPathsFor(factId: TemplateCopilotV3FragmentFactId, value: Readonly<Record<string, unknown>>, bindings: readonly Binding[]) {
  const present = (path: string) => bindings.some((binding) => binding.path === path || binding.path.startsWith(`${path}/`));
  const missing = requiredPaths[factId].filter((path) => !present(path));
  if (factId === "attachments.requirements" && value.kind === "attachment" && !present("/maximumFileSizeMb")) missing.push("/maximumFileSizeMb");
  if (factId === "workflow.stages") {
    const mode = valueAt(value, "/participant/mode");
    if (["fixed_email", "directory_position", "request_field"].includes(String(mode)) && !present("/participant/value")) missing.push("/participant/value");
  }
  if (factId === "notifications.rules") {
    const mode = valueAt(value, "/timing/mode");
    if (["before_due", "after_due"].includes(String(mode)) && !present("/timing/offsetHours")) missing.push("/timing/offsetHours");
    const recipients = Array.isArray(value.recipients) ? value.recipients : [];
    const needsStage = ["stage_assigned", "stage_completed", "due_soon", "overdue"].includes(String(value.event ?? "")) || recipients.includes("current_stage_participants") || recipients.includes("previous_stage_participants");
    if (needsStage && !present("/stage")) missing.push("/stage");
  }
  return [...new Set(missing)].sort(compareText);
}

function validateCompleteItem(factId: TemplateCopilotV3FragmentFactId, value: Record<string, unknown>, bindings: readonly Binding[], spans: readonly TemplateCopilotV3SourceSpan[], ambiguity: Ambiguity, ambiguityNote: string | undefined) {
  if (factId !== "request.fields" && factId !== "workflow.stages") return false;
  const omitted = factId === "request.fields" ? "/options" : "/sequence";
  const partialValue = structuredClone(value);
  deleteAt(partialValue, omitted);
  const partialBindings = bindings.filter((binding) => binding.path !== omitted && !binding.path.startsWith(`${omitted}/`));
  const partial = {
    evidenceVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    factId,
    fragmentKind: "array_item" as const,
    state: "open" as const,
    value: partialValue,
    bindings: partialBindings,
    missingPaths: [omitted],
    confidence: "high" as const,
    ambiguity,
    ...(ambiguityNote ? { ambiguityNote } : {}),
  };
  if (!templateCopilotV3FragmentSchema.safeParse({ ...partial, fragmentId: templateCopilotV3FragmentId(partial) }).success) return false;
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  return bindings.every((binding) => binding.spanIds.every((spanId) => {
    const span = byId.get(spanId);
    return span !== undefined && templateCopilotV3DirectEvidenceDerivesLeaf({ factId, path: binding.path, rule: binding.rule, value, sourceText: span.exactText });
  }));
}

const maximumConditionSemanticContextCodePoints = 16_000;

function semanticContextsForArrayItem(
  factId: TemplateCopilotV3FragmentFactId,
  anchor: TemplateCopilotV3SourceSpan,
  messages: Readonly<Record<string, string>>,
) {
  if (factId === "attachments.requirements") {
    const message = messages[anchor.messageId];
    if (typeof message !== "string") return null;
    const codePoints = Array.from(message);
    if (codePoints.length > maximumConditionSemanticContextCodePoints) {
      return null;
    }
    const supplied = {
      messageId: anchor.messageId,
      startCodePoint: 0,
      endCodePoint: codePoints.length,
      exactText: message,
    };
    const parsed = templateCopilotV3SourceSpanSchema.safeParse({
      spanId: templateCopilotV3SourceSpanId(supplied),
      ...supplied,
    });
    return parsed.success &&
        validateTemplateCopilotV3SourceSpan(parsed.data, messages)
      ? [Object.freeze(parsed.data)]
      : null;
  }
  if (
    factId !== "workflow.conditions" &&
    factId !== "workflow.stages"
  ) {
    return [anchor];
  }
  const message = messages[anchor.messageId];
  if (typeof message !== "string") return null;
  const codePoints = Array.from(message);
  let startCodePoint = anchor.startCodePoint;
  while (
    startCodePoint > 0 &&
    !semanticHardClauseSeparator(codePoints[startCodePoint - 1])
  ) {
    startCodePoint -= 1;
  }
  let endCodePoint = anchor.endCodePoint;
  while (
    endCodePoint < codePoints.length &&
    !semanticHardClauseSeparator(codePoints[endCodePoint])
  ) {
    endCodePoint += 1;
  }
  if (
    factId === "workflow.stages" &&
    endCodePoint < codePoints.length
  ) {
    let nextStartCodePoint = endCodePoint + 1;
    while (
      nextStartCodePoint < codePoints.length &&
      /\s/u.test(codePoints[nextStartCodePoint])
    ) {
      nextStartCodePoint += 1;
    }
    let nextEndCodePoint = nextStartCodePoint;
    while (
      nextEndCodePoint < codePoints.length &&
      !semanticHardClauseSeparator(codePoints[nextEndCodePoint])
    ) {
      nextEndCodePoint += 1;
    }
    endCodePoint = nextEndCodePoint;
  }
  if (
    factId === "workflow.conditions" &&
    endCodePoint < codePoints.length
  ) {
    let nextStartCodePoint = endCodePoint + 1;
    while (
      nextStartCodePoint < codePoints.length &&
      /\s/u.test(codePoints[nextStartCodePoint])
    ) {
      nextStartCodePoint += 1;
    }
    let nextEndCodePoint = nextStartCodePoint;
    while (
      nextEndCodePoint < codePoints.length &&
      !semanticHardClauseSeparator(codePoints[nextEndCodePoint])
    ) {
      nextEndCodePoint += 1;
    }
    const nextClause = codePoints
      .slice(nextStartCodePoint, nextEndCodePoint)
      .join("");
    if (semanticConditionClauseBeginsExplicitDefault(nextClause)) {
      endCodePoint = nextEndCodePoint;
    }
  }
  if (
    endCodePoint - startCodePoint >
    maximumConditionSemanticContextCodePoints
  ) {
    return null;
  }
  const exactText = codePoints
    .slice(startCodePoint, endCodePoint)
    .join("");
  const supplied = {
    messageId: anchor.messageId,
    startCodePoint,
    endCodePoint,
    exactText,
  };
  const parsed = templateCopilotV3SourceSpanSchema.safeParse({
    spanId: templateCopilotV3SourceSpanId(supplied),
    ...supplied,
  });
  return parsed.success && validateTemplateCopilotV3SourceSpan(parsed.data, messages)
    ? [Object.freeze(parsed.data)]
    : null;
}

function validSpan(span: TemplateCopilotV3SourceSpan, messages: Readonly<Record<string, string>>) {
  return templateCopilotV3SourceSpanSchema.safeParse(span).success && validateTemplateCopilotV3SourceSpan(span, messages);
}
function makeOrder(messages: Readonly<Record<string, string>>, supplied?: readonly string[]) {
  const explicit = (supplied ?? []).filter((id, index, all) => Object.hasOwn(messages, id) && all.indexOf(id) === index);
  const remainder = Object.keys(messages).filter((id) => !explicit.includes(id)).sort(compareText);
  return new Map([...explicit, ...remainder].map((id, index) => [id, index]));
}
function orderFor(span: TemplateCopilotV3SourceSpan, order: ReadonlyMap<string, number>): SourceOrder {
  return Object.freeze({ messageId: span.messageId, messageIndex: order.get(span.messageId) ?? Number.MAX_SAFE_INTEGER, startCodePoint: span.startCodePoint, endCodePoint: span.endCodePoint });
}
function valueAt(value: unknown, pointer: string): unknown {
  let current = value;
  for (const part of pointer.slice(1).split("/")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
function setAt(target: Record<string, unknown>, pointer: string, value: unknown) {
  const parts = pointer.slice(1).split("/");
  let current: Record<string, unknown> | unknown[] = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = Array.isArray(current) ? Number(parts[index]) : parts[index];
    const nextPart = parts[index + 1];
    let next = (current as Record<string | number, unknown>)[part];
    if (!next || typeof next !== "object") {
      next = /^[0-9]+$/.test(nextPart) ? [] : {};
      (current as Record<string | number, unknown>)[part] = next;
    }
    current = next as Record<string, unknown> | unknown[];
  }
  const last = Array.isArray(current) ? Number(parts.at(-1)) : String(parts.at(-1));
  (current as Record<string | number, unknown>)[last] = value;
}
function deleteAt(target: Record<string, unknown>, pointer: string) {
  const parts = pointer.slice(1).split("/");
  let current: Record<string, unknown> | unknown[] = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = Array.isArray(current) ? Number(parts[index]) : parts[index];
    const next = (current as Record<string | number, unknown>)[key];
    if (!next || typeof next !== "object") return;
    current = next as Record<string, unknown> | unknown[];
  }
  const last = Array.isArray(current) ? Number(parts.at(-1)) : String(parts.at(-1));
  if (Array.isArray(current)) current.splice(Number(last), 1);
  else delete current[String(last)];
}

function cloneLeaves(source: ReadonlyMap<string, Leaf>) {
  return new Map([...source].map(([path, leaf]) => [path, { ...leaf, spans: [...leaf.spans] }]));
}
function cloneArrays(source: ReadonlyMap<string, ReadonlyMap<string, Leaf>>) {
  return new Map([...source].map(([path, values]) => [path, new Map([...values].map(([key, leaf]) => [key, { ...leaf, spans: [...leaf.spans] }]))]));
}
function dedupeSpans(spans: readonly TemplateCopilotV3SourceSpan[], compareSpans: (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) => number) {
  return [...new Map(spans.map((span) => [span.spanId, span])).values()].sort(compareSpans);
}
function dedupeObservations(values: readonly TemplateCopilotV3ReviewObservation[], compareSpans: (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) => number) {
  return [...new Map(values.map((value) => [`${value.role}:${value.advisoryHint ?? ""}:${value.sourceSpan.spanId}`, value])).values()].sort((a, b) => compareSpans(a.sourceSpan, b.sourceSpan) || compareText(a.role, b.role));
}
function dedupeRelationships(values: readonly TemplateCopilotV3ReviewRelationship[], compareSpans: (left: TemplateCopilotV3SourceSpan, right: TemplateCopilotV3SourceSpan) => number) {
  return [...new Map(values.map((value) => [`${value.relationship}:${value.sourceSpan.spanId}`, value])).values()].sort((a, b) => compareSpans(a.sourceSpan, b.sourceSpan) || compareText(a.relationship, b.relationship));
}
function dedupeSemantic(items: readonly TemplateCopilotV3SemanticReviewItem[]) {
  return [...new Map(items.map((item) => [item.projectionId, item])).values()].sort((a, b) => a.sourceOrder.messageIndex - b.sourceOrder.messageIndex || a.sourceOrder.startCodePoint - b.sourceOrder.startCodePoint || compareText(a.projectionId, b.projectionId));
}
function compareReviewItems(a: TemplateCopilotV3ReviewArrayItem, b: TemplateCopilotV3ReviewArrayItem) {
  return a.sourceOrder.messageIndex - b.sourceOrder.messageIndex || a.sourceOrder.startCodePoint - b.sourceOrder.startCodePoint || compareText(a.factId, b.factId) || compareText(a.reviewItemId, b.reviewItemId);
}
function kindForFact(factId: TemplateCopilotV3FragmentFactId): keyof typeof arrayFactByKind {
  if (factId === "request.fields") return "request_field";
  if (factId === "attachments.requirements") return "attachment";
  if (factId === "workflow.stages") return "stage";
  if (factId === "workflow.conditions") return "condition";
  return "notification";
}
function rejection(item: Pick<TemplateCopilotV3LocatedQuoteItem, "itemIndex" | "kind">, code: TemplateCopilotV3ReviewRejection["code"], detail: string): TemplateCopilotV3ReviewRejection {
  return Object.freeze({ itemIndex: item.itemIndex, kind: item.kind, code, detail });
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
function hashJson(value: unknown) { return createHash("sha256").update(stableJson(value), "utf8").digest("hex"); }
function compareText(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
