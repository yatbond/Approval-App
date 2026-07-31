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
  templateCopilotV3SourceSpanSchema,
  validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority,
  validateTemplateCopilotV3SourceSpan,
  type TemplateCopilotV3ExtractionEnvelope,
  type TemplateCopilotV3Fragment,
  type TemplateCopilotV3FragmentFactId,
  type TemplateCopilotV3SourceSpan,
} from "./template-copilot-v3-evidence.ts";

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
    "factId" | "value" | "bindings" | "sourceSpans" | "relationships"
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
  return hashJson({
    factId: input.factId,
    value: input.value,
    bindings: canonicalBindings,
    sourceSpanIds: [...new Set(input.sourceSpans.map((span) => span.spanId))].sort(
      compareText,
    ),
    relationships: canonicalRelationships,
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
  sourceAnchors: TemplateCopilotV3SourceSpan[];
  confidence: Confidence;
  ambiguity: Ambiguity;
};
type Cluster = Omit<Draft, "itemIndex" | "kind"> & { groupingKey: string; itemIndexes: number[] };
type Mapping =
  | Readonly<{ kind: "scalar"; path: string; mode: "text" | "enum" | "boolean" | "number" | "condition_value" | "route" }>
  | Readonly<{ kind: "array"; path: string; mode: "text" | "enum" }>
  | Readonly<{ kind: "relationship" }>;

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
  const draft: Draft = { itemIndex: item.itemIndex, kind: item.kind, factId, anchor: item.anchor, leaves: new Map(), arrays: new Map(), relationships: [], observedRoles: new Set(), semanticObservations: [], semanticAuthorityBlocked: false, sourceAnchors: [item.anchor], confidence: item.confidence, ambiguity: item.ambiguity };
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
      [item.anchor],
    ) ||
    suppliedObservations.some(
      (observation) =>
        semanticCoreRole(factId, observation.role) &&
        semanticObservationIsContradicted(factId, observation, [item.anchor]),
    );
  const conflictedPaths = new Set<string>();
  for (const supplied of item.leaves) {
    if (!validSpan(supplied.sourceSpan, messages)) {
      rejections.push(rejection(item, "untraceable_span", `${item.kind}:${supplied.role}`));
      continue;
    }
    const mapping = mappingFor(item.kind, supplied.role);
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
function mappingFor(kind: keyof typeof arrayFactByKind, role: TemplateCopilotV3ProviderQuoteRole): Mapping | null {
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
      currency: { kind: "scalar", path: "/currency", mode: "text" },
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

function deriveLeaf(factId: TemplateCopilotV3FragmentFactId, mapping: Exclude<Mapping, { kind: "relationship" }>, hint: string | null, span: TemplateCopilotV3SourceSpan): Omit<Leaf, "spans"> | null {
  let value: string | number | boolean;
  let rule: Rule;
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
  return { factId: draft.factId, anchor: draft.anchor, groupingKey, leaves: cloneLeaves(draft.leaves), arrays: cloneArrays(draft.arrays), relationships: [...draft.relationships], observedRoles: new Set(draft.observedRoles), semanticObservations: [...draft.semanticObservations], semanticAuthorityBlocked: draft.semanticAuthorityBlocked, sourceAnchors: [...draft.sourceAnchors], confidence: draft.confidence, ambiguity: draft.ambiguity, itemIndexes: [draft.itemIndex] };
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
              draft.sourceAnchors,
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
  const fragmentAuthorityBlocked =
    cluster.semanticAuthorityBlocked || ambiguity !== "none";
  const complete =
    missingPaths.length === 0 && !fragmentAuthorityBlocked;
  const semanticComplete = semanticallyComplete(
    cluster.factId,
    cluster.semanticObservations,
    cluster.sourceAnchors,
    ambiguity,
    conflictGroupId !== undefined,
    cluster.semanticAuthorityBlocked,
  );
  const observedRoles = [...cluster.observedRoles].sort(compareText);
  const sourceAnchors = dedupeSpans(cluster.sourceAnchors, compareSpans);
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
  const reviewItemId = templateCopilotV3ReviewItemId(base);
  if (bindings.length === 0) return { item: Object.freeze({ reviewItemId, fragmentId: null, ...base }), fragment: null };
  if (fragmentAuthorityBlocked) {
    return {
      item: Object.freeze({ reviewItemId, fragmentId: null, ...base }),
      fragment: null,
    };
  }
  if (complete) {
    if (!validateCompleteItem(cluster.factId, value, bindings, boundSpans, ambiguity, ambiguityNote)) {
      rejections.push({ itemIndex: cluster.itemIndexes[0] ?? -1, kind: kindForFact(cluster.factId), code: "invalid_fragment", detail: `${cluster.factId}:complete_review` });
      return null;
    }
    return { item: Object.freeze({ reviewItemId, fragmentId: null, ...base }), fragment: null };
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
  return { item: Object.freeze({ reviewItemId, fragmentId: parsed.data.fragmentId, ...base }), fragment: parsed.data };
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
    semanticCoreGroupsShareClause(
      [fields, operators, values],
      sourceAnchors,
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
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  if (
    semanticCoreGroupsShareClause(
      [operators, values, [route]],
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
        return clause !== undefined &&
          !semanticConditionClauseHasIndependentPredicate(clause.text) &&
          semanticConditionClauseIsRouteOnly(clause.text, route.quote);
      })
    )
  );
}

function semanticConditionOtherwiseRouteHasAffinity(
  route: TemplateCopilotV3ReviewObservation,
  fields: readonly TemplateCopilotV3ReviewObservation[],
  operators: readonly TemplateCopilotV3ReviewObservation[],
  values: readonly TemplateCopilotV3ReviewObservation[],
  sourceAnchors: readonly TemplateCopilotV3SourceSpan[],
) {
  if (
    semanticCoreGroupsShareClause(
      [operators, values, [route]],
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
          routeIndex === operatorIndex ||
          Math.abs(routeIndex - operatorIndex) > 2
        ) {
          return false;
        }
        const clauses = semanticHardClauseSegments(anchor.exactText);
        const governing = clauses[operatorIndex];
        const branch = clauses[routeIndex];
        if (!governing || !branch) return false;
        if (
          semanticConditionClauseIsExplicitDefault(branch.text) &&
          !semanticConditionClauseHasIndependentPredicate(branch.text)
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
          semanticConditionThresholdBranchesShareField(
            field,
            routeIndex,
            operatorIndex,
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

function semanticConditionClauseIsRouteOnly(
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
  const routeIntro =
    /^(?:(?:then|and\s+then|next)\s+)?(?:route(?:s)?(?:\s+(?:the\s+)?(?:request|workflow))?\s+to|go(?:es)?\s+to|send(?:s)?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to|add(?:s)?|require(?:s)?|seek(?:s)?|obtain(?:s)?)$/u
      .test(prefix) ||
    /^(?:(?:然後|然后|接著|接着|再)\s*)?(?:轉至|转至|送交|交由|提交給|提交给|增加|加入|需要|要求|由)$/u
      .test(prefix);
  const routeSuffix =
    /^(?:(?:for\s+)?(?:approval|review|stage|step))?$/u.test(suffix) ||
    /^(?:審批|审批|批准|審查|审查|覆核|复核|階段|阶段)?$/u.test(suffix);
  return routeIntro && routeSuffix;
}

function semanticConditionClauseIsExplicitDefault(wording: string) {
  const normalized = templateCopilotV3NormalizeLexicalText(wording)
    .replace(/^[\s,，:：\-–—]+/gu, "");
  return /^(?:otherwise|else|by\s+default|for\s+(?:the\s+)?(?:normal|ordinary|other)\b|if\s+not\b|when\s+not\b)/u
    .test(normalized) ||
    /^(?:否則|否则|其他|其它|其餘|其余|普通|正常|一般|若非|如非|未)/u
      .test(normalized);
}

function semanticConditionThresholdBranchesShareField(
  field: TemplateCopilotV3ReviewObservation,
  routeIndex: number,
  governingIndex: number,
  anchor: TemplateCopilotV3SourceSpan,
) {
  const fieldIndex = semanticHardClauseIndexInAnchor(field, anchor);
  if (fieldIndex === null) return false;
  const clauses = semanticHardClauseSegments(anchor.exactText);
  const fieldText = templateCopilotV3NormalizeLexicalText(field.quote);
  const branch = clauses[routeIndex];
  if (!branch) return false;
  if (
    fieldText.length > 0 &&
    templateCopilotV3NormalizeLexicalText(branch.text).includes(fieldText)
  ) {
    return true;
  }
  const earliest = Math.min(routeIndex, governingIndex);
  const latest = Math.max(routeIndex, governingIndex);
  if (fieldIndex > earliest) return false;
  const fieldClause = clauses[fieldIndex];
  return fieldClause !== undefined &&
    semanticThresholdClauseHasComparison(fieldClause.text) &&
    clauses
      .slice(fieldIndex + 1, latest + 1)
      .every((clause) =>
        semanticThresholdClauseStartsWithOperator(clause.text)
      );
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
    if (fieldText.length > 0 && targetText.includes(fieldText)) {
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
    if (templateCopilotV3NormalizeLexicalText(prefix).length > 0) {
      return false;
    }
    const fieldClause = clauses[fieldIndex];
    if (
      !fieldClause ||
      !semanticThresholdClauseHasComparison(fieldClause.text)
    ) {
      return false;
    }
    return clauses
      .slice(fieldIndex + 1, operatorIndex)
      .every((clause) => semanticThresholdClauseStartsWithOperator(clause.text));
  });
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

function semanticThresholdClauseStartsWithOperator(wording: string) {
  const normalized = templateCopilotV3NormalizeLexicalText(wording);
  return /^(?:above|below|over|under|at\s+least|at\s+most|more\s+than|less\s+than|exceeds?)\b/u
    .test(normalized) ||
    /^(?:不超過|不超过|超過|超过|高於|高于|低於|低于|不少於|不少于|不多於|不多于)/u
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
        "高風險", "高风险", "受限制區域", "受限制区域", "國際", "国际", "生產", "生产", "生產資料庫", "生产数据库",
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
