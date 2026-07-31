import { quarantineTemplateCopilotRequirementText } from "../src/lib/template-copilot-safety.ts";
import {
  templateCopilotV3DirectEvidenceDerivesLeaf,
  templateCopilotV3EvidenceCompilerVersion,
  templateCopilotV3EvidenceContractVersion,
  templateCopilotV3ExtractionEnvelopeSchema,
  templateCopilotV3FragmentId,
  templateCopilotV3NormalizeTrimCollapseText,
  templateCopilotV3SourceSpanId,
  validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority,
  validateTemplateCopilotV3SourceSpan,
} from "../src/lib/template-copilot-v3-evidence.ts";
import {
  templateCopilotV3ReviewItemId,
  templateCopilotV3SemanticProjectionId,
} from "../src/lib/template-copilot-v3-review-assembly.ts";
import {
  templateCopilotV3ProviderQuoteKindRoleHints,
  templateCopilotV3ProviderQuoteRoles,
  templateCopilotV3ProviderQuoteSlots,
} from "../src/lib/template-copilot-v3-provider-quotes.ts";
import {
  templateCopilotV3SemanticManifestCorpusFingerprint,
  templateCopilotV3SemanticManifestVersion,
  templateCopilotV3SemanticScenarioManifest,
} from "./template-copilot-v3-semantic-scenario-manifests.mjs";

const expectedBatchIds = Object.freeze(["structure", "policy_context"]);
const observedMetricKeys = Object.freeze([
  "documents",
  "requestFields",
  "approvalNodes",
  "conditionNodes",
  "notificationRules",
  "fyiRecipients",
  "parallelStageCount",
  "factCount",
  "fieldEntityCount",
  "attachmentEntityCount",
  "stageEntityCount",
  "conditionEntityCount",
]);
const itemFactIds = Object.freeze([
  "request.fields",
  "attachments.requirements",
  "workflow.stages",
  "workflow.conditions",
  "notifications.rules",
]);
const scalarFactIds = Object.freeze([
  "workflow.name",
  "workflow.purpose",
  "workflow.scope",
  "request.initiator_policy",
  "workflow.rejection_policy",
  "collaboration.policy",
  "timing.rules",
  "visibility.policy",
  "governance.owner",
  "governance.policies",
  "governance.retention",
]);
const expectedFactIds = Object.freeze([...scalarFactIds, ...itemFactIds]);
const itemFactIdSet = new Set(itemFactIds);
const scalarFactIdSet = new Set(scalarFactIds);
const expectedFactIdSet = new Set(expectedFactIds);
const providerRoles = Object.freeze([...templateCopilotV3ProviderQuoteRoles]);
const providerRoleSet = new Set(providerRoles);
const providerSlotSet = new Set(templateCopilotV3ProviderQuoteSlots);
const arrayKindByFactId = Object.freeze({
  "request.fields": "request_field",
  "attachments.requirements": "attachment",
  "workflow.stages": "stage",
  "workflow.conditions": "condition",
  "notifications.rules": "notification",
});
const kindToFactId = Object.freeze({
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
});
const kindByScalarFactId = Object.freeze(
  Object.fromEntries(
    Object.entries(kindToFactId).map(([kind, factId]) => [factId, kind]),
  ),
);
const allowedSlotsByKind = Object.freeze({
  workflow_name: ["identity_scope"],
  workflow_purpose: ["identity_scope"],
  workflow_scope: ["identity_scope"],
  initiator: ["initiators_fields"],
  request_field: ["initiators_fields"],
  attachment: ["attachments"],
  stage: ["stages_participants", "conditions_exceptions"],
  condition: ["conditions_exceptions"],
  rejection: ["conditions_exceptions"],
  collaboration: ["collaboration_corrections"],
  timing: ["timing_escalation"],
  visibility: ["stages_participants", "visibility_notifications"],
  notification: [
    "stages_participants",
    "timing_escalation",
    "visibility_notifications",
  ],
  governance_owner: ["governance"],
  governance_policy: ["governance"],
  retention: ["governance"],
});
const semanticCoreRoles = Object.freeze({
  "request.fields": [["label"], ["required"]],
  "attachments.requirements": [["label"], ["kind"], ["required"]],
  "workflow.stages": [["label"], ["kind"], ["participant", "participant_mode"]],
  "workflow.conditions": [
    ["field"],
    ["operator"],
    ["value"],
    ["matching_route"],
  ],
  "notifications.rules": [["event"], ["recipient"]],
});
const reviewItemKeys = new Set([
  "reviewItemId",
  "fragmentId",
  "factId",
  "value",
  "bindings",
  "missingPaths",
  "complete",
  "semanticComplete",
  "persisted",
  "executable",
  "defaulted",
  "confidence",
  "ambiguity",
  "ambiguityNote",
  "observedRoles",
  "semanticValue",
  "semanticLeaves",
  "semanticObservations",
  "sourceAnchors",
  "relationships",
  "sourceSpans",
  "sourceMessageIds",
  "sourceOrder",
  "providerItemIndexes",
  "conflictGroupId",
]);
const semanticFactKeys = new Set([
  "projectionId",
  "kind",
  "factId",
  "quote",
  "sourceSpan",
  "leaves",
  "confidence",
  "ambiguity",
  "sourceOrder",
  "reviewOnly",
  "persisted",
  "executable",
  "defaulted",
]);
const forbiddenSourceText = Object.freeze([
  "attacker@example.net",
  "reveal all secrets",
  "disclose secrets",
  "make the requester an administrator",
  "ignore previous instructions",
  "ignore prior instructions",
]);

/** Scores source-derived semantic review meaning without granting persistence
 * or executable authority to incomplete strict fragments. */
export function scoreTemplateCopilotV3LiveSemantic({
  item,
  sourceMessages,
  envelope = { sourceSpans: [], fragments: [] },
  projection = {},
  batches = [],
}) {
  const failures = [];
  const evidenceFailures = [];
  const defaultOrUnknownExtras = [];
  const unsafeEntries = [];
  const acceptedSemanticTexts = [];
  const checkedMessages = isRecord(sourceMessages)
    ? sourceMessages
    : Object.create(null);
  if (!isRecord(sourceMessages)) {
    evidenceFailures.push("Source messages must be an in-memory message map.");
  }

  const manifest = validateScenarioManifest(item, failures);
  if (manifest) {
    validateScenarioSourceAuthority({
      manifest,
      sourceMessages: checkedMessages,
      failures: evidenceFailures,
    });
  }
  const batchGate = scoreBatchGate(batches);
  failures.push(...batchGate.failures);
  const envelopeResult = validateEnvelope({
    envelope,
    sourceMessages: checkedMessages,
    evidenceFailures,
    defaultOrUnknownExtras,
  });

  const rawItems = arrayOrFailure(
    projection.items,
    "Projection items",
    failures,
  );
  const rawScalarFacts = arrayOrFailure(
    projection.scalarFacts,
    "Projection scalarFacts",
    failures,
  );
  const rawPolicyItems = arrayOrFailure(
    projection.policyItems,
    "Projection policyItems",
    failures,
  );
  const rawConflicts = arrayOrFailure(
    projection.conflicts,
    "Projection conflicts",
    failures,
  );
  const rawRejections = arrayOrFailure(
    projection.rejections,
    "Projection rejections",
    failures,
  );
  if (rawConflicts.length > 0) {
    failures.push(
      "The strict semantic projection cannot contain open conflicts.",
    );
  }

  const semanticItems = [];
  for (const [index, entry] of rawItems.entries()) {
    const label = `items[${index}]`;
    if (!isRecord(entry) || !itemFactIdSet.has(entry.factId)) {
      defaultOrUnknownExtras.push(`${label}: unknown or invalid item fact`);
      continue;
    }
    collectUnsafeOrDefaultMarkers({
      entry,
      label,
      unsafeEntries,
      defaultOrUnknownExtras,
    });
    const entryFailures = validateReviewItem({
      entry,
      label,
      sourceMessages: checkedMessages,
      acceptedSemanticTexts,
    });
    if (entryFailures.length > 0) {
      evidenceFailures.push(...entryFailures);
      continue;
    }
    if (entry.semanticComplete !== true) {
      evidenceFailures.push(
        `${label}: unresolved semantic item cannot qualify`,
      );
      continue;
    }
    semanticItems.push(entry);
  }

  const semanticFacts = [];
  for (const [collection, entries] of [
    ["scalarFacts", rawScalarFacts],
    ["policyItems", rawPolicyItems],
  ]) {
    for (const [index, entry] of entries.entries()) {
      const label = `${collection}[${index}]`;
      if (!isRecord(entry)) {
        defaultOrUnknownExtras.push(`${label}: invalid semantic fact`);
        continue;
      }
      const factId = factIdForEntry(entry);
      if (!scalarFactIdSet.has(factId)) {
        defaultOrUnknownExtras.push(`${label}: unknown semantic fact`);
        continue;
      }
      collectUnsafeOrDefaultMarkers({
        entry,
        label,
        unsafeEntries,
        defaultOrUnknownExtras,
      });
      const entryFailures = validateSemanticFact({
        entry,
        factId,
        collection,
        label,
        sourceMessages: checkedMessages,
        acceptedSemanticTexts,
      });
      if (entryFailures.length > 0) {
        evidenceFailures.push(...entryFailures);
        continue;
      }
      semanticFacts.push({ ...entry, factId });
    }
  }

  validateFragmentProjectionLinks({
    envelope: envelopeResult.envelope,
    items: rawItems,
    failures: evidenceFailures,
  });
  failures.push(...evidenceFailures);
  const uniqueDefaultOrUnknownExtras = [...new Set(defaultOrUnknownExtras)];
  const uniqueUnsafeEntries = [...new Set(unsafeEntries)];
  if (uniqueDefaultOrUnknownExtras.length > 0) {
    failures.push(
      `Defaults or unknown semantic extras were present: ${uniqueDefaultOrUnknownExtras.join("; ")}.`,
    );
  }
  if (uniqueUnsafeEntries.length > 0) {
    failures.push(
      `Unsafe accepted projection entries were present: ${uniqueUnsafeEntries.join("; ")}.`,
    );
  }

  const quarantine = validateAcceptedSemanticQuarantine(acceptedSemanticTexts);
  failures.push(...quarantine.failures);
  const acceptedText = acceptedSemanticTexts.join("\n").toLocaleLowerCase();
  const forbiddenHits = forbiddenSourceText.filter((value) =>
    acceptedText.includes(value),
  );

  const scenarioSemantics = manifest
    ? scoreScenarioManifestSemantics({
        manifest,
        semanticItems,
        semanticFacts,
        sourceMessages,
      })
    : {
        passed: false,
        failures: ["No fixed semantic manifest was available."],
        observed: {},
      };
  failures.push(...scenarioSemantics.failures);

  const factIds = [
    ...new Set([
      ...semanticItems.map((entry) => entry.factId),
      ...semanticFacts.map((entry) => entry.factId),
    ]),
  ].sort();
  return {
    passed: failures.length === 0,
    failures,
    batchGate,
    candidateCount:
      rawItems.length + rawScalarFacts.length + rawPolicyItems.length,
    acceptedProjectionCount: semanticItems.length + semanticFacts.length,
    semanticCompleteItemCount: semanticItems.length,
    completeItemCount: rawItems.filter(
      (entry) => isRecord(entry) && entry.complete === true,
    ).length,
    semanticFactCount: semanticFacts.length,
    rawItemCount: rawItems.length,
    rawScalarFactCount: rawScalarFacts.length,
    rawPolicyItemCount: rawPolicyItems.length,
    distinctFactCount: factIds.length,
    factIds,
    evidenceLeafCount:
      semanticItems.reduce(
        (total, entry) =>
          total +
          entry.bindings.length +
          entry.semanticLeaves.length +
          entry.relationships.length,
        0,
      ) +
      semanticFacts.reduce(
        (total, entry) => total + 1 + entry.leaves.length,
        0,
      ),
    evidenceFailureCount: evidenceFailures.length,
    forbiddenHits,
    quarantineHitCount: quarantine.hitCount,
    quarantineReasonCounts: quarantine.reasonCounts,
    unsafeQuoteCount: uniqueUnsafeEntries.length + quarantine.hitCount,
    defaultOrUnknownExtraCount: uniqueDefaultOrUnknownExtras.length,
    rejectedProjectionCount: rawRejections.length,
    conflictCount: rawConflicts.length,
    scenarioSemantics,
    manifestVersion: manifest?.version ?? null,
    manifestCorpusFingerprint:
      templateCopilotV3SemanticManifestCorpusFingerprint,
  };
}

export const scoreLiveSemanticProjection = scoreTemplateCopilotV3LiveSemantic;

function scoreBatchGate(batches) {
  const failures = [];
  const values = Array.isArray(batches) ? batches : [];
  if (values.length !== expectedBatchIds.length) {
    failures.push(
      `Expected exactly ${expectedBatchIds.length} qualification batches; found ${values.length}.`,
    );
  }
  const byId = new Map();
  for (const [index, batch] of values.entries()) {
    if (!isRecord(batch)) {
      failures.push(`Qualification batch ${index} is not a record.`);
      continue;
    }
    const suppliedId = batch.batchId ?? batch.id;
    if (
      typeof suppliedId !== "string" ||
      (batch.batchId !== undefined &&
        batch.id !== undefined &&
        batch.batchId !== batch.id) ||
      byId.has(suppliedId)
    ) {
      failures.push(
        "Qualification batch IDs must be consistent, known, and unique.",
      );
      continue;
    }
    byId.set(suppliedId, batch);
  }

  let passedBatchCount = 0;
  let batchFailureCount = 0;
  let providerRequestFailureCount = 0;
  for (const id of expectedBatchIds) {
    const batch = byId.get(id);
    if (!isRecord(batch)) {
      failures.push(`Missing required qualification batch ${id}.`);
      continue;
    }
    const countFields = [
      "failureCount",
      "providerRequestCount",
      "providerRequestSuccessCount",
      "providerRequestFailureCount",
      "acceptedItemCount",
      "rejectedItemCount",
    ];
    for (const field of countFields) {
      if (!Number.isInteger(batch[field]) || batch[field] < 0) {
        failures.push(`Qualification batch ${id} has invalid ${field}.`);
      }
    }
    const batchFailures = strictNonnegativeInteger(batch.failureCount);
    const requests = strictNonnegativeInteger(batch.providerRequestCount);
    const successes = strictNonnegativeInteger(
      batch.providerRequestSuccessCount,
    );
    const providerFailures = strictNonnegativeInteger(
      batch.providerRequestFailureCount,
    );
    batchFailureCount += batchFailures ?? 0;
    providerRequestFailureCount += providerFailures ?? 0;
    if (
      requests !== null &&
      successes !== null &&
      providerFailures !== null &&
      requests !== successes + providerFailures
    ) {
      failures.push(
        `Qualification batch ${id} provider request counts are inconsistent.`,
      );
    }
    if (batch.status !== "applied") {
      failures.push(`Qualification batch ${id} was not applied.`);
    }
    if (batch.providerOutcome !== "success") {
      failures.push(
        `Qualification batch ${id} did not record a successful provider outcome.`,
      );
    }
    if (requests === 0 || successes === 0) {
      failures.push(
        `Qualification batch ${id} did not complete a provider request.`,
      );
    }
    if ((batchFailures ?? 1) !== 0 || (providerFailures ?? 1) !== 0) {
      failures.push(
        `Qualification batch ${id} recorded a qualification failure.`,
      );
    }
    if (
      batch.status === "applied" &&
      batch.providerOutcome === "success" &&
      requests !== null &&
      requests > 0 &&
      successes === requests &&
      batchFailures === 0 &&
      providerFailures === 0
    ) {
      passedBatchCount += 1;
    }
  }
  const unexpected = [...byId.keys()].filter(
    (id) => !expectedBatchIds.includes(id),
  );
  if (unexpected.length > 0) {
    failures.push(
      `Unexpected qualification batches: ${unexpected.join(", ")}.`,
    );
  }
  return {
    passed: failures.length === 0,
    failures,
    passedBatchCount,
    batchCount: byId.size,
    batchFailureCount,
    providerRequestFailureCount,
    failureCount: batchFailureCount,
    expectedBatchIds: [...expectedBatchIds],
  };
}
function validateEnvelope({
  envelope,
  sourceMessages,
  evidenceFailures,
  defaultOrUnknownExtras,
}) {
  if (!isRecord(envelope)) {
    evidenceFailures.push("The extraction envelope is missing.");
    return { envelope: null };
  }
  const parsed = templateCopilotV3ExtractionEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    evidenceFailures.push(
      `The extraction envelope failed the strict v3 schema: ${parsed.error.issues
        .map((issue) => issue.path.join("/") || issue.message)
        .join(", ")}.`,
    );
    return { envelope: null };
  }
  const canonical = parsed.data;
  if (
    canonical.contractVersion !== templateCopilotV3EvidenceContractVersion ||
    canonical.compilerVersion !== templateCopilotV3EvidenceCompilerVersion
  ) {
    evidenceFailures.push(
      "The extraction envelope version identity is invalid.",
    );
  }
  if (
    !validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(
      canonical,
      sourceMessages,
    )
  ) {
    evidenceFailures.push(
      "The extraction envelope does not have exact source authority.",
    );
  }

  const spanById = new Map();
  for (const [index, span] of canonical.sourceSpans.entries()) {
    const label = `envelope.sourceSpans[${index}]`;
    evidenceFailures.push(...validateSpan(span, sourceMessages, label));
    if (spanById.has(span.spanId)) {
      evidenceFailures.push(`${label}: duplicate source span ID`);
    }
    spanById.set(span.spanId, span);
  }
  validateNoCrossingSpans(
    canonical.sourceSpans,
    "envelope.sourceSpans",
    evidenceFailures,
  );

  const fragmentIds = new Set();
  for (const [index, fragment] of canonical.fragments.entries()) {
    const label = `envelope.fragments[${index}]`;
    if (!itemFactIdSet.has(fragment.factId)) {
      defaultOrUnknownExtras.push(`${label}: unknown fragment fact`);
      continue;
    }
    if (fragmentIds.has(fragment.fragmentId)) {
      evidenceFailures.push(`${label}: duplicate fragment ID`);
    }
    fragmentIds.add(fragment.fragmentId);
    const { fragmentId, ...withoutId } = fragment;
    if (fragmentId !== templateCopilotV3FragmentId(withoutId)) {
      evidenceFailures.push(`${label}: non-canonical fragment ID`);
    }
    for (const [bindingIndex, binding] of fragment.bindings.entries()) {
      for (const spanId of binding.spanIds) {
        const span = spanById.get(spanId);
        if (
          !span ||
          !templateCopilotV3DirectEvidenceDerivesLeaf({
            factId: fragment.factId,
            path: binding.path,
            rule: binding.rule,
            value: fragment.value,
            sourceText: span.exactText,
          })
        ) {
          evidenceFailures.push(
            `${label}.bindings[${bindingIndex}]: unverifiable fragment leaf`,
          );
        }
      }
    }
  }
  return { envelope: canonical };
}
function validateReviewItem({
  entry,
  label,
  sourceMessages,
  acceptedSemanticTexts,
}) {
  const failures = [];
  const unknownKeys = Object.keys(entry).filter(
    (key) => !reviewItemKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    failures.push(
      `${label}: unknown review item fields ${unknownKeys.join(", ")}`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(entry.reviewItemId ?? "")) {
    failures.push(`${label}: reviewItemId is invalid`);
  }
  if (
    entry.fragmentId !== null &&
    !/^[0-9a-f]{64}$/.test(entry.fragmentId ?? "")
  ) {
    failures.push(`${label}: fragmentId is invalid`);
  }
  if (entry.ambiguity !== "none" || entry.confidence !== "high") {
    failures.push(
      `${label}: a qualifying semantic item must be high-confidence and unambiguous`,
    );
  }
  if (
    entry.persisted !== false ||
    entry.executable !== false ||
    entry.defaulted !== false
  ) {
    failures.push(
      `${label}: a semantic review item must be non-persisted, non-executable, and non-defaulted`,
    );
  }
  if (!isRecord(entry.value))
    failures.push(`${label}: strict value is invalid`);
  const kind = arrayKindByFactId[entry.factId];
  if (!kind)
    failures.push(`${label}: item fact has no provider kind authority`);

  const sourceSpans = Array.isArray(entry.sourceSpans) ? entry.sourceSpans : [];
  const spanById = new Map();
  for (const [index, span] of sourceSpans.entries()) {
    failures.push(
      ...validateSpan(span, sourceMessages, `${label}.sourceSpans[${index}]`),
    );
    if (isRecord(span) && typeof span.spanId === "string") {
      if (spanById.has(span.spanId))
        failures.push(`${label}: duplicate source span ID`);
      spanById.set(span.spanId, span);
      failures.push(
        ...validateKindSlot(
          kind,
          span.messageId,
          `${label}.sourceSpans[${index}]`,
        ),
      );
    }
  }
  validateNoCrossingSpans(sourceSpans, `${label}.sourceSpans`, failures);

  const sourceAnchors = Array.isArray(entry.sourceAnchors)
    ? entry.sourceAnchors
    : [];
  if (sourceAnchors.length === 0)
    failures.push(`${label}: source anchors are required`);
  for (const [index, anchor] of sourceAnchors.entries()) {
    failures.push(
      ...validateSpan(
        anchor,
        sourceMessages,
        `${label}.sourceAnchors[${index}]`,
      ),
    );
    failures.push(
      ...validateKindSlot(
        kind,
        anchor?.messageId,
        `${label}.sourceAnchors[${index}]`,
      ),
    );
  }

  const semanticLeaves = Array.isArray(entry.semanticLeaves)
    ? entry.semanticLeaves
    : [];
  if (!Array.isArray(entry.semanticObservations)) {
    failures.push(`${label}: semanticObservations are required`);
  } else if (
    JSON.stringify(entry.semanticObservations) !==
    JSON.stringify(semanticLeaves)
  ) {
    failures.push(`${label}: semanticObservations do not match semanticLeaves`);
  }
  if (!isRecord(entry.semanticValue) || semanticLeaves.length === 0) {
    failures.push(`${label}: semanticValue and semanticLeaves are required`);
  }
  const quotesByRole = new Map();
  for (const [index, leaf] of semanticLeaves.entries()) {
    const leafLabel = `${label}.semanticLeaves[${index}]`;
    if (
      !isRecord(leaf) ||
      !providerRoleSet.has(leaf.role) ||
      typeof leaf.quote !== "string" ||
      !isRecord(leaf.sourceSpan)
    ) {
      failures.push(`${leafLabel}: invalid semantic leaf`);
      continue;
    }
    failures.push(...validateKindRoleHint(kind, leaf, leafLabel));
    failures.push(
      ...validateKindSlot(kind, leaf.sourceSpan.messageId, leafLabel),
    );
    failures.push(...validateSpan(leaf.sourceSpan, sourceMessages, leafLabel));
    if (
      leaf.quote !== leaf.sourceSpan.exactText ||
      !spanById.has(leaf.sourceSpan.spanId)
    ) {
      failures.push(
        `${leafLabel}: semantic quote is not an item-owned exact source span`,
      );
    } else {
      acceptedSemanticTexts.push(leaf.quote);
    }
    const values = quotesByRole.get(leaf.role) ?? [];
    values.push(leaf.quote);
    quotesByRole.set(leaf.role, values);
  }
  if (isRecord(entry.semanticValue)) {
    const keys = Object.keys(entry.semanticValue);
    if (keys.some((role) => !providerRoleSet.has(role))) {
      failures.push(`${label}: semanticValue contains an unknown role`);
    }
    for (const role of new Set([...keys, ...quotesByRole.keys()])) {
      const expected = quotesByRole.get(role) ?? [];
      const supplied = entry.semanticValue[role];
      if (
        !Array.isArray(supplied) ||
        supplied.some((quote) => typeof quote !== "string") ||
        JSON.stringify(supplied) !== JSON.stringify(expected)
      ) {
        failures.push(
          `${label}: semanticValue ${role} does not match exact semantic leaves`,
        );
      }
    }
  }

  const observedRoles = Array.isArray(entry.observedRoles)
    ? entry.observedRoles
    : [];
  const actualRoles = [...quotesByRole.keys()].sort();
  if (
    new Set(observedRoles).size !== observedRoles.length ||
    observedRoles.some((role) => !providerRoleSet.has(role)) ||
    JSON.stringify([...observedRoles].sort()) !== JSON.stringify(actualRoles)
  ) {
    failures.push(
      `${label}: observedRoles do not exactly match semantic leaves`,
    );
  }
  if (entry.semanticComplete === true) {
    for (const alternatives of semanticCoreRoles[entry.factId]) {
      if (!alternatives.some((role) => actualRoles.includes(role))) {
        failures.push(
          `${label}: semantic core is missing ${alternatives.join(" or ")}`,
        );
      }
    }
  }

  const relationships = Array.isArray(entry.relationships)
    ? entry.relationships
    : [];
  for (const [index, relationship] of relationships.entries()) {
    const relationshipLabel = `${label}.relationships[${index}]`;
    if (
      !isRecord(relationship) ||
      !["sequential", "parallel"].includes(relationship.relationship) ||
      !isRecord(relationship.sourceSpan)
    ) {
      failures.push(`${relationshipLabel}: invalid source relationship`);
      continue;
    }
    failures.push(
      ...validateSpan(
        relationship.sourceSpan,
        sourceMessages,
        relationshipLabel,
      ),
    );
    failures.push(
      ...validateKindSlot(
        kind,
        relationship.sourceSpan.messageId,
        relationshipLabel,
      ),
    );
    if (!spanById.has(relationship.sourceSpan.spanId)) {
      failures.push(
        `${relationshipLabel}: relationship span is not item-owned`,
      );
    }
    const relationshipLeaf = semanticLeaves.find(
      (leaf) =>
        isRecord(leaf) &&
        leaf.role === "relationship" &&
        leaf.sourceSpan?.spanId === relationship.sourceSpan.spanId,
    );
    if (
      !relationshipLeaf ||
      !relationshipMeaningMatches(
        relationship.relationship,
        relationshipLeaf.advisoryHint,
        relationshipLeaf.quote,
      )
    ) {
      failures.push(
        `${relationshipLabel}: relationship is not derived from its semantic leaf`,
      );
    }
  }

  validateItemEvidenceOwnership({
    entry,
    label,
    sourceSpans,
    sourceAnchors,
    semanticLeaves,
    relationships,
    failures,
  });
  validateStrictValue({ entry, label, spanById, failures });
  const missingPaths = Array.isArray(entry.missingPaths)
    ? entry.missingPaths
    : [];
  if (
    typeof entry.complete !== "boolean" ||
    entry.complete !== (missingPaths.length === 0)
  ) {
    failures.push(`${label}: strict complete flag does not match missingPaths`);
  }
  validateSourceMessageIds(entry, sourceSpans, label, failures);
  validateSourceOrder(
    entry.sourceOrder,
    sourceSpans,
    sourceMessages,
    label,
    failures,
  );
  if (
    !Array.isArray(entry.providerItemIndexes) ||
    entry.providerItemIndexes.length === 0 ||
    entry.providerItemIndexes.some(
      (value) => !Number.isInteger(value) || value < 0,
    ) ||
    new Set(entry.providerItemIndexes).size !== entry.providerItemIndexes.length
  ) {
    failures.push(`${label}: provider item indexes are invalid`);
  }
  try {
    if (templateCopilotV3ReviewItemId(entry) !== entry.reviewItemId) {
      failures.push(
        `${label}: reviewItemId is not the canonical evidence identity`,
      );
    }
  } catch {
    failures.push(`${label}: reviewItemId cannot be canonically recomputed`);
  }
  return failures;
}
function validateStrictValue({ entry, label, spanById, failures }) {
  const bindings = Array.isArray(entry.bindings) ? entry.bindings : [];
  if (!Array.isArray(entry.bindings)) {
    failures.push(`${label}: strict bindings must be an array`);
  }
  const leafPaths = primitiveLeafPaths(entry.value).sort();
  const bindingPaths = bindings
    .flatMap((binding) =>
      isRecord(binding) && typeof binding.path === "string"
        ? [binding.path]
        : [],
    )
    .sort();
  if (
    new Set(bindingPaths).size !== bindingPaths.length ||
    JSON.stringify(bindingPaths) !== JSON.stringify(leafPaths)
  ) {
    failures.push(
      `${label}: strict bindings must cover every present strict value leaf`,
    );
  }
  for (const [index, binding] of bindings.entries()) {
    const bindingLabel = `${label}.bindings[${index}]`;
    if (
      !isRecord(binding) ||
      typeof binding.path !== "string" ||
      typeof binding.rule !== "string" ||
      !Array.isArray(binding.spanIds) ||
      binding.spanIds.length === 0
    ) {
      failures.push(`${bindingLabel}: invalid strict binding`);
      continue;
    }
    for (const spanId of binding.spanIds) {
      const span = spanById.get(spanId);
      if (
        !span ||
        !templateCopilotV3DirectEvidenceDerivesLeaf({
          factId: entry.factId,
          path: binding.path,
          rule: binding.rule,
          value: entry.value,
          sourceText: span.exactText,
        })
      ) {
        failures.push(`${bindingLabel}: source does not derive strict leaf`);
      }
    }
  }
  const missingPaths = Array.isArray(entry.missingPaths)
    ? entry.missingPaths
    : [];
  if (
    !Array.isArray(entry.missingPaths) ||
    missingPaths.some((path) => typeof path !== "string") ||
    new Set(missingPaths).size !== missingPaths.length
  ) {
    failures.push(`${label}: strict missingPaths must be preserved and unique`);
  }
  if (
    missingPaths.some((missing) =>
      bindingPaths.some(
        (bound) =>
          missing === bound ||
          missing.startsWith(`${bound}/`) ||
          bound.startsWith(`${missing}/`),
      ),
    )
  ) {
    failures.push(`${label}: strict missing paths overlap strict bindings`);
  }
}

function validateSemanticFact({
  entry,
  factId,
  collection,
  label,
  sourceMessages,
  acceptedSemanticTexts,
}) {
  const failures = [];
  const unknownKeys = Object.keys(entry).filter(
    (key) => !semanticFactKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    failures.push(
      `${label}: unknown semantic fact fields ${unknownKeys.join(", ")}`,
    );
  }
  const expectedKind = kindByScalarFactId[factId];
  if (entry.kind !== expectedKind || entry.factId !== factId) {
    failures.push(`${label}: semantic fact kind does not match its fact ID`);
  }
  const policyKinds = new Set([
    "rejection",
    "collaboration",
    "timing",
    "visibility",
    "governance_policy",
    "retention",
  ]);
  const expectedCollection = policyKinds.has(expectedKind)
    ? "policyItems"
    : "scalarFacts";
  if (collection !== expectedCollection) {
    failures.push(
      `${label}: semantic fact is in the wrong projection collection`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(entry.projectionId ?? "")) {
    failures.push(`${label}: projectionId is invalid`);
  }
  if (
    entry.ambiguity !== "none" ||
    entry.confidence !== "high" ||
    entry.reviewOnly !== true ||
    entry.persisted !== false ||
    entry.executable !== false ||
    entry.defaulted !== false
  ) {
    failures.push(
      `${label}: semantic fact must be high-confidence, unambiguous, review-only, non-persisted, non-executable, and non-defaulted`,
    );
  }
  if (
    typeof entry.quote !== "string" ||
    !isRecord(entry.sourceSpan) ||
    entry.quote !== entry.sourceSpan.exactText
  ) {
    failures.push(`${label}: semantic fact anchor is invalid`);
    return failures;
  }
  failures.push(...validateSpan(entry.sourceSpan, sourceMessages, label));
  failures.push(
    ...validateKindSlot(expectedKind, entry.sourceSpan.messageId, label),
  );
  acceptedSemanticTexts.push(entry.quote);
  const leaves = Array.isArray(entry.leaves) ? entry.leaves : [];
  if (leaves.length === 0)
    failures.push(`${label}: semantic fact has no leaves`);
  for (const [index, leaf] of leaves.entries()) {
    const leafLabel = `${label}.leaves[${index}]`;
    if (
      !isRecord(leaf) ||
      !providerRoleSet.has(leaf.role) ||
      typeof leaf.quote !== "string" ||
      !isRecord(leaf.sourceSpan) ||
      leaf.quote !== leaf.sourceSpan.exactText
    ) {
      failures.push(`${leafLabel}: invalid semantic fact leaf`);
      continue;
    }
    failures.push(...validateKindRoleHint(expectedKind, leaf, leafLabel));
    failures.push(
      ...validateKindSlot(expectedKind, leaf.sourceSpan.messageId, leafLabel),
    );
    failures.push(...validateSpan(leaf.sourceSpan, sourceMessages, leafLabel));
    if (
      leaf.sourceSpan.messageId !== entry.sourceSpan.messageId ||
      leaf.sourceSpan.startCodePoint < entry.sourceSpan.startCodePoint ||
      leaf.sourceSpan.endCodePoint > entry.sourceSpan.endCodePoint
    ) {
      failures.push(`${leafLabel}: semantic leaf is outside its source anchor`);
    }
    acceptedSemanticTexts.push(leaf.quote);
  }
  validateSourceOrder(
    entry.sourceOrder,
    [entry.sourceSpan],
    sourceMessages,
    label,
    failures,
  );
  try {
    if (templateCopilotV3SemanticProjectionId(entry) !== entry.projectionId) {
      failures.push(
        `${label}: projectionId is not the canonical evidence identity`,
      );
    }
  } catch {
    failures.push(`${label}: projectionId cannot be canonically recomputed`);
  }
  return failures;
}
function scoreScenarioManifestSemantics({
  manifest,
  semanticItems,
  semanticFacts,
  sourceMessages,
}) {
  const failures = [];
  const entries = (factId) =>
    semanticItems.filter((entry) => entry.factId === factId);
  const facts = (factId) =>
    semanticFacts.filter((entry) => entry.factId === factId);
  const factRoleText = (factId, role) =>
    facts(factId)
      .flatMap((entry) =>
        entry.leaves
          .filter((leaf) => leaf.role === role)
          .map((leaf) => leaf.quote),
      )
      .join("\n");
  const retainedText = [
    ...semanticItems.map((entry) => semanticItemString(entry)),
    ...semanticFacts.map((entry) => semanticFactString(entry)),
  ].join("\n");

  const factIds = new Set([
    ...semanticItems.map((entry) => entry.factId),
    ...semanticFacts.map((entry) => entry.factId),
  ]);
  const missingFactIds = manifest.requiredFactIds.filter(
    (factId) => !factIds.has(factId),
  );
  const unexpectedFactIds = [...factIds].filter(
    (factId) => !manifest.requiredFactIds.includes(factId),
  );
  if (missingFactIds.length > 0) {
    failures.push(
      `Missing required semantic fact IDs: ${missingFactIds.join(", ")}.`,
    );
  }
  if (unexpectedFactIds.length > 0) {
    failures.push(
      `Unexpected semantic fact IDs: ${unexpectedFactIds.join(", ")}.`,
    );
  }
  for (const contract of manifest.scalarFacts) {
    const matchingFacts = facts(contract.factId);
    if (matchingFacts.length !== 1) {
      failures.push(
        `Expected exactly one ${contract.factId} semantic fact; found ${matchingFacts.length}.`,
      );
      continue;
    }
    const [entry] = matchingFacts;
    const expectedMessageId = `${manifest.id}:${contract.slot}`;
    if (
      entry.sourceSpan.messageId !== expectedMessageId ||
      entry.sourceSpan.exactText !== contract.exactSource ||
      entry.quote !== contract.exactSource
    ) {
      failures.push(
        `Scalar fact ${contract.factId} does not retain its exact reviewed source slot.`,
      );
    }
    const contractLeaves = entry.leaves.filter(
      (leaf) =>
        leaf.role === contract.role &&
        leaf.advisoryHint === contract.hint &&
        leaf.sourceSpan.messageId === expectedMessageId &&
        leaf.quote === contract.exactSource,
    );
    if (entry.leaves.length !== 1 || contractLeaves.length !== 1) {
      failures.push(
        `Scalar fact ${contract.factId} does not retain its exact role-bound meaning.`,
      );
    }
  }
  for (const requiredTerm of manifest.criticalTerms) {
    if (!canonicalIncludes(retainedText, requiredTerm)) {
      failures.push(
        `A canonical scenario-critical term was not retained: ${requiredTerm}.`,
      );
    }
  }

  const fields = entries("request.fields");
  const attachments = entries("attachments.requirements");
  const stages = entries("workflow.stages");
  const conditions = entries("workflow.conditions");
  const notifications = entries("notifications.rules");
  const stageKinds = stages.map(stageKind);
  const fyiStages = stages.filter(
    (_, index) => stageKinds[index] === "for_information",
  );
  const governedStages = stages.filter((_, index) =>
    ["approval", "review", "submission"].includes(stageKinds[index]),
  );
  const unknownStages = stages.filter(
    (_, index) =>
      !["approval", "review", "submission", "for_information"].includes(
        stageKinds[index],
      ),
  );
  if (unknownStages.length > 0) {
    failures.push(
      `Unknown stage semantics were retained: ${unknownStages.length}.`,
    );
  }

  const fieldMatch = matchRoleContractsOneToOne({
    label: "request fields",
    expected: manifest.fields,
    entries: fields,
    matches: (expected, entry) =>
      hasRoleContract(entry, roleContract("label", expected.label)),
    failures,
  });
  for (const [expected, entry] of fieldMatch.pairs) {
    requireExactRoleContracts(
      entry,
      "label",
      [roleContract("label", expected.label)],
      `Request field ${expected.label}`,
      failures,
    );
    requireExactRoleHints(
      entry,
      "required",
      [expected.required ? "true" : "false"],
      `Request field ${expected.label}`,
      failures,
    );
  }

  const attachmentMatch = matchRoleContractsOneToOne({
    label: "attachments",
    expected: manifest.attachments,
    entries: attachments,
    matches: (expected, entry) =>
      hasRoleContract(entry, roleContract("label", expected.label)),
    failures,
  });
  for (const [expected, entry] of attachmentMatch.pairs) {
    const label = `Attachment ${expected.label}`;
    requireExactRoleContracts(
      entry,
      "label",
      [roleContract("label", expected.label)],
      label,
      failures,
    );
    requireExactRoleHints(entry, "kind", [expected.kind], label, failures);
    requireExactRoleHints(
      entry,
      "required",
      [expected.required ? "true" : "false"],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "format",
      expected.formats,
      label,
      failures,
    );
    for (const role of ["minimum_quantity", "maximum_quantity"]) {
      requireExactRoleContracts(
        entry,
        role,
        expected.quantities.filter((contract) => contract.role === role),
        label,
        failures,
      );
    }
    requireExactRoleContracts(
      entry,
      "maximum_file_size_mb",
      expected.maximumFileSizeTerms,
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "stage",
      expected.stageTerms,
      label,
      failures,
    );
    requireExactRoleContracts(entry, "contributor_policy", [], label, failures);
    requireExactRoleContracts(
      entry,
      "confirmation_policy",
      [],
      label,
      failures,
    );
    requireExactSourceClauses(entry, expected.evidenceClauses, label, failures);
  }

  const stageMatch = matchRoleContractsOneToOne({
    label: "governed stages",
    expected: manifest.stages,
    entries: governedStages,
    matches: (expected, entry) =>
      hasRoleContract(
        entry,
        roleContract("participant", expected.participant),
      ) && semanticHints(entry, "kind").includes(expected.kind),
    failures,
  });
  for (const [expected, entry] of stageMatch.pairs) {
    const label = `Stage ${expected.participant}`;
    requireExactRoleContracts(
      entry,
      "label",
      [roleContract("label", expected.participant)],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "participant",
      [roleContract("participant", expected.participant)],
      label,
      failures,
    );
    requireExactRoleHints(entry, "kind", [expected.kind], label, failures);
    if (
      !entryRolesShareSourceClause(entry, "participant", "kind", sourceMessages)
    ) {
      failures.push(
        `${label} participant and kind are not grounded in the same source clause.`,
      );
    }
    const hasParallel = entry.relationships.some(
      (relationship) => relationship.relationship === "parallel",
    );
    if (hasParallel !== (expected.topology === "parallel")) {
      failures.push(`${label} lost its exact reviewed topology.`);
    }
  }
  const orderedStageEntries = stageMatch.pairs.map((pair) => pair[1]);
  if (
    orderedStageEntries.length === governedStages.length &&
    orderedStageEntries.some((entry, index) => entry !== governedStages[index])
  ) {
    failures.push(
      "Governed stage order does not match the reviewed source sequence.",
    );
  }

  const fyiMatch = matchRoleContractsOneToOne({
    label: "FYI recipients",
    expected: manifest.fyiRecipients,
    entries: fyiStages,
    matches: (expected, entry) =>
      hasRoleContract(
        entry,
        roleContract("participant", expected.participant),
      ) && semanticHints(entry, "kind").includes(expected.kind),
    failures,
  });
  for (const [expected, entry] of fyiMatch.pairs) {
    const label = `FYI ${expected.participant}`;
    requireExactRoleContracts(
      entry,
      "label",
      [roleContract("label", expected.participant)],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "participant",
      [roleContract("participant", expected.participant)],
      label,
      failures,
    );
    requireExactRoleHints(entry, "kind", [expected.kind], label, failures);
    if (
      !entryRolesShareSourceClause(entry, "participant", "kind", sourceMessages)
    ) {
      failures.push(
        `${label} participant and kind are not grounded in the same source clause.`,
      );
    }
  }

  const conditionMatch = matchRoleContractsOneToOne({
    label: "conditions",
    expected: manifest.conditions,
    entries: conditions,
    matches: conditionContractMatchesEntry,
    failures,
  });
  for (const [expected, entry] of conditionMatch.pairs) {
    const label = `Condition ${expected.field}`;
    requireExactRoleContracts(
      entry,
      "field",
      [roleContract("field", expected.field)],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "operator",
      [expected.operator],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "value",
      [roleContract("value", expected.value)],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "matching_route",
      [expected.matchingRoute],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "otherwise_route",
      expected.otherwiseRoute ? [expected.otherwiseRoute] : [],
      label,
      failures,
    );
  }

  const matchedRouteOnlyApprovalNodeCount =
    manifest.routeOnlyApprovalNodes.filter((routeNode) =>
      conditionMatch.pairs.some(
        ([expected, entry]) =>
          expected.field === routeNode.conditionField &&
          hasRoleContract(
            entry,
            roleContract(
              routeNode.routeRole,
              routeNode.routeTerm,
              "stage_reference",
            ),
          ),
      ),
    ).length;

  const notificationMatch = matchRoleContractsOneToOne({
    label: "notification rules",
    expected: manifest.notificationRules,
    entries: notifications,
    matches: (expected, entry) =>
      hasRoleContract(entry, expected.event) &&
      hasRoleContract(entry, expected.recipient) &&
      (expected.visibility
        ? hasRoleContract(entry, expected.visibility)
        : roleLeaves(entry, "visibility").length === 0) &&
      entryUsesExactSourceSlot(entry, manifest.id, expected.slot),
    failures,
  });
  for (const [expected, entry] of notificationMatch.pairs) {
    const label = `Notification ${expected.event.term}`;
    requireExactRoleContracts(
      entry,
      "event",
      [expected.event],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "recipient",
      [expected.recipient],
      label,
      failures,
    );
    requireExactRoleContracts(
      entry,
      "visibility",
      expected.visibility ? [expected.visibility] : [],
      label,
      failures,
    );
    if (!entryUsesExactSourceSlot(entry, manifest.id, expected.slot)) {
      failures.push(`${label} came from the wrong source slot.`);
    }
    for (const role of ["timing_mode", "offset_hours", "channel", "stage"]) {
      requireExactRoleContracts(entry, role, [], label, failures);
    }
  }
  const matchedWorkflowNotificationCount = notificationMatch.pairs.filter(
    ([expected]) => expected.slot === "stages_participants",
  ).length;

  requireTermsInFact({
    label: "visibility policy",
    terms: manifest.visibilityTerms,
    text: factRoleText("visibility.policy", "rule"),
    failures,
  });
  requireTermsInFact({
    label: "selected-field handoff",
    terms: manifest.handoff.selectedFieldTerms,
    text: factRoleText("visibility.policy", "rule"),
    failures,
  });
  requireTermsInFact({
    label: "restricted-document handoff",
    terms: manifest.handoff.restrictedDocumentTerms,
    text: factRoleText("visibility.policy", "rule"),
    failures,
  });
  requireTermsInFact({
    label: "rejection policy",
    terms: manifest.rejectionTerms,
    text: factRoleText("workflow.rejection_policy", "mode"),
    failures,
  });
  requireTermsInFact({
    label: "condition policy",
    terms: manifest.conditionPolicyTerms,
    text: factRoleText("workflow.rejection_policy", "mode"),
    failures,
  });
  const collaborationText = factRoleText("collaboration.policy", "rule");
  for (const [label, terms] of [
    [
      "collaboration document/package scope",
      manifest.collaboration.documentScopeTerms,
    ],
    ["named contributor policy", manifest.collaboration.contributorTerms],
    ["requester confirmation policy", manifest.collaboration.confirmationTerms],
  ]) {
    requireTermsInFact({ label, terms, text: collaborationText, failures });
  }

  const hasManualForm = attachments.some((entry) =>
    semanticHints(entry, "kind").includes("form"),
  );
  if (hasManualForm !== manifest.flags.requireManualForm) {
    failures.push(
      `Expected ${manifest.flags.requireManualForm ? "" : "no "}source-supported native form requirement.`,
    );
  }
  if (fyiMatch.matchedCount > 0 !== manifest.flags.requireFyiRecipient) {
    failures.push(
      `Expected ${manifest.flags.requireFyiRecipient ? "" : "no "}source-supported FYI recipient.`,
    );
  }
  if (
    matchedWorkflowNotificationCount > 0 !==
    manifest.flags.requireWorkflowNotification
  ) {
    failures.push(
      `Expected ${manifest.flags.requireWorkflowNotification ? "" : "no "}source-supported workflow notification.`,
    );
  }
  if (
    (fyiMatch.matchedCount > 0 || matchedWorkflowNotificationCount > 0) !==
    manifest.flags.requireFyi
  ) {
    failures.push(
      `Expected ${manifest.flags.requireFyi ? "" : "no "}source-supported FYI or workflow-notification behavior.`,
    );
  }
  const expectedParallelCount = manifest.stages.filter(
    (stage) => stage.topology === "parallel",
  ).length;
  const observedParallelCount = governedStages.filter((entry) =>
    entry.relationships.some(
      (relationship) => relationship.relationship === "parallel",
    ),
  ).length;
  if (expectedParallelCount > 0 !== manifest.flags.requireParallelFanout) {
    failures.push(
      `Expected ${manifest.flags.requireParallelFanout ? "" : "no "}reviewed parallel fanout.`,
    );
  }
  if (
    manifest.flags.requireSelectedFieldHandoff !==
    manifest.handoff.selectedFieldTerms.length > 0
  ) {
    failures.push(
      "Selected-field handoff flag is not backed by its fixed contract.",
    );
  }
  if (
    manifest.flags.requireRestrictedDocumentHandoff !==
    manifest.handoff.restrictedDocumentTerms.length > 0
  ) {
    failures.push(
      "Restricted-document handoff flag is not backed by its fixed contract.",
    );
  }
  if (
    manifest.flags.requireSharedFulfillment &&
    [
      manifest.collaboration.documentScopeTerms,
      manifest.collaboration.contributorTerms,
      manifest.collaboration.confirmationTerms,
    ].some((terms) => terms.length === 0)
  ) {
    failures.push(
      "Shared fulfillment lacks its exact document, contributor, or confirmation contract.",
    );
  }

  const observed = {
    documents: attachments.length,
    requestFields: fields.length,
    approvalNodes:
      governedStages.filter((entry) =>
        ["approval", "review"].includes(stageKind(entry)),
      ).length + matchedRouteOnlyApprovalNodeCount,
    conditionNodes: conditions.length,
    notificationRules: notifications.length,
    fyiRecipients: fyiStages.length,
    parallelStageCount: observedParallelCount,
    factCount: factIds.size,
    fieldEntityCount: fieldMatch.matchedCount,
    attachmentEntityCount: attachmentMatch.matchedCount,
    stageEntityCount: stageMatch.matchedCount,
    conditionEntityCount: conditionMatch.matchedCount,
  };
  if (
    JSON.stringify(Object.keys(observed)) !== JSON.stringify(observedMetricKeys)
  ) {
    failures.push(
      "Observed semantic metrics drifted from the privacy allowlist.",
    );
  }
  return { passed: failures.length === 0, failures, observed };
}

function roleContract(role, term, hint = null) {
  return { role, term, hint };
}

function roleLeaves(entry, role) {
  return entry.semanticLeaves.filter((leaf) => leaf.role === role);
}

function hasRoleContract(entry, contract) {
  return roleLeaves(entry, contract.role).some(
    (leaf) =>
      canonicalIncludes(leaf.quote, contract.term) &&
      leaf.advisoryHint === contract.hint,
  );
}

function entryUsesExactSourceSlot(entry, scenarioId, slot) {
  const expectedMessageId = `${scenarioId}:${slot}`;
  const evidenceMessageIds = [
    ...(Array.isArray(entry.sourceMessageIds) ? entry.sourceMessageIds : []),
    ...(Array.isArray(entry.sourceSpans)
      ? entry.sourceSpans.map((span) => span?.messageId)
      : []),
    ...(Array.isArray(entry.sourceAnchors)
      ? entry.sourceAnchors.map((span) => span?.messageId)
      : []),
    ...(Array.isArray(entry.semanticLeaves)
      ? entry.semanticLeaves.map((leaf) => leaf?.sourceSpan?.messageId)
      : []),
    ...(Array.isArray(entry.relationships)
      ? entry.relationships.map(
          (relationship) => relationship?.sourceSpan?.messageId,
        )
      : []),
  ].filter((messageId) => typeof messageId === "string");
  return (
    evidenceMessageIds.length > 0 &&
    new Set(evidenceMessageIds).size === 1 &&
    evidenceMessageIds[0] === expectedMessageId
  );
}

function requireExactSourceClauses(entry, expectedClauses, label, failures) {
  const anchors = Array.isArray(entry.sourceAnchors) ? entry.sourceAnchors : [];
  for (const clause of expectedClauses) {
    if (
      !anchors.some((anchor) => canonicalIncludes(anchor.exactText, clause))
    ) {
      failures.push(
        `${label} omitted an exact reviewed document-requirement clause.`,
      );
    }
  }
}

function entryRolesShareSourceClause(
  entry,
  leftRole,
  rightRole,
  sourceMessages,
) {
  const leftLeaves = roleLeaves(entry, leftRole);
  const rightLeaves = roleLeaves(entry, rightRole);
  return (
    leftLeaves.length > 0 &&
    rightLeaves.length > 0 &&
    leftLeaves.every((left) =>
      rightLeaves.some((right) =>
        spansShareSourceClause(
          left.sourceSpan,
          right.sourceSpan,
          sourceMessages,
        ),
      ),
    )
  );
}

function spansShareSourceClause(left, right, sourceMessages) {
  if (
    !isRecord(left) ||
    !isRecord(right) ||
    left.messageId !== right.messageId ||
    typeof sourceMessages[left.messageId] !== "string"
  ) {
    return false;
  }
  const text = Array.from(sourceMessages[left.messageId]);
  const clauseKey = (span) => {
    let start = span.startCodePoint;
    while (start > 0 && !/[.!?。！？；;\n]/u.test(text[start - 1])) {
      start -= 1;
    }
    let end = span.endCodePoint;
    while (end < text.length && !/[.!?。！？；;\n]/u.test(text[end])) {
      end += 1;
    }
    return `${start}:${end}`;
  };
  return clauseKey(left) === clauseKey(right);
}

function conditionContractMatchesEntry(expected, entry) {
  return [
    roleContract("field", expected.field),
    expected.operator,
    roleContract("value", expected.value),
    expected.matchingRoute,
    ...(expected.otherwiseRoute ? [expected.otherwiseRoute] : []),
  ].every((contract) => hasRoleContract(entry, contract));
}

function matchRoleContractsOneToOne({
  label,
  expected,
  entries,
  matches,
  failures,
}) {
  if (entries.length !== expected.length) {
    failures.push(
      `Expected exactly ${expected.length} reviewed ${label}; found ${entries.length}.`,
    );
  }
  const adjacency = expected.map((contract) =>
    entries.flatMap((entry, index) =>
      matches(contract, entry) ? [index] : [],
    ),
  );
  const entryToExpected = new Map();
  function assign(expectedIndex, visited) {
    for (const entryIndex of adjacency[expectedIndex]) {
      if (visited.has(entryIndex)) continue;
      visited.add(entryIndex);
      const previous = entryToExpected.get(entryIndex);
      if (previous === undefined || assign(previous, visited)) {
        entryToExpected.set(entryIndex, expectedIndex);
        return true;
      }
    }
    return false;
  }
  let matchedCount = 0;
  for (const expectedIndex of expected.keys()) {
    if (assign(expectedIndex, new Set())) matchedCount += 1;
    else
      failures.push(
        `Reviewed ${label} entity was omitted at index ${expectedIndex}.`,
      );
  }
  const entryIndexByExpected = new Map(
    [...entryToExpected.entries()].map(([entryIndex, expectedIndex]) => [
      expectedIndex,
      entryIndex,
    ]),
  );
  const pairs = expected.flatMap((contract, expectedIndex) => {
    const entryIndex = entryIndexByExpected.get(expectedIndex);
    return entryIndex === undefined ? [] : [[contract, entries[entryIndex]]];
  });
  return { matchedCount, pairs };
}

function requireExactRoleHints(entry, role, expectedHints, label, failures) {
  const leaves = roleLeaves(entry, role);
  const actualHints = leaves.map((leaf) => leaf.advisoryHint).sort();
  const canonicalExpected = [...expectedHints].sort();
  if (JSON.stringify(actualHints) !== JSON.stringify(canonicalExpected)) {
    failures.push(
      `${label} has incorrect ${role} semantics; expected ${canonicalExpected.join(", ") || "none"}.`,
    );
  }
}

function requireExactRoleContracts(entry, role, expected, label, failures) {
  const leaves = roleLeaves(entry, role);
  if (leaves.length !== expected.length) {
    failures.push(
      `${label} has ${leaves.length} ${role} observations; expected ${expected.length}.`,
    );
    return;
  }
  const used = new Set();
  for (const contract of expected) {
    const index = leaves.findIndex(
      (leaf, leafIndex) =>
        !used.has(leafIndex) &&
        canonicalIncludes(leaf.quote, contract.term) &&
        leaf.advisoryHint === contract.hint,
    );
    if (index === -1) {
      failures.push(
        `${label} omitted exact ${role} meaning: ${contract.term}.`,
      );
    } else {
      used.add(index);
    }
  }
}

function requireTermsInFact({ label, terms, text, failures }) {
  for (const term of terms) {
    if (!canonicalIncludes(text, term)) {
      failures.push(`The ${label} omitted reviewed source meaning: ${term}.`);
    }
  }
}

function canonicalSemanticText(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\p{Z}\s]/gu, "");
}

function canonicalIncludes(text, term) {
  return canonicalSemanticText(text).includes(canonicalSemanticText(term));
}

function semanticItemString(entry) {
  return entry.semanticLeaves
    .map((leaf) => `${leaf.role}:${leaf.quote}:${leaf.advisoryHint ?? ""}`)
    .join("\n");
}

function semanticFactString(entry) {
  return [
    entry.quote,
    ...entry.leaves.map(
      (leaf) => `${leaf.role}:${leaf.quote}:${leaf.advisoryHint ?? ""}`,
    ),
  ].join("\n");
}
function validateScenarioManifest(item, failures) {
  if (!isRecord(item) || typeof item.id !== "string") {
    failures.push("The qualification scenario identity is missing.");
    return null;
  }
  const manifest = templateCopilotV3SemanticScenarioManifest(item.id);
  if (!manifest) {
    failures.push(`No fixed semantic manifest exists for ${item.id}.`);
    return null;
  }
  if (
    manifest.version !== templateCopilotV3SemanticManifestVersion ||
    manifest.id !== item.id ||
    manifest.language !== item.language ||
    manifest.archetype !== item.archetype
  ) {
    failures.push(
      `The fixed semantic manifest identity does not match ${item.id}.`,
    );
  }
  if (
    JSON.stringify(manifest.requiredFactIds) !== JSON.stringify(expectedFactIds)
  ) {
    failures.push(
      `The fixed semantic manifest fact universe is invalid for ${item.id}.`,
    );
  }
  return manifest;
}

function validateScenarioSourceAuthority({
  manifest,
  sourceMessages,
  failures,
}) {
  const expectedEntries = Object.entries(manifest.sourceSlots);
  const expectedIds = expectedEntries.map(([slot]) => `${manifest.id}:${slot}`);
  const actualIds = Object.keys(sourceMessages);
  if (
    actualIds.length !== expectedIds.length ||
    [...actualIds].sort().join("\n") !== [...expectedIds].sort().join("\n")
  ) {
    failures.push(
      `Scenario ${manifest.id} source message IDs do not exactly match the fixed nine-slot authority.`,
    );
  }
  for (const [slot, expectedSource] of expectedEntries) {
    if (!providerSlotSet.has(slot)) {
      failures.push(
        `Scenario ${manifest.id} has an unknown fixed source slot ${slot}.`,
      );
      continue;
    }
    const messageId = `${manifest.id}:${slot}`;
    const actualSource = sourceMessages[messageId];
    if (typeof actualSource !== "string") {
      failures.push(`Scenario ${manifest.id} is missing source slot ${slot}.`);
      continue;
    }
    const quarantinedActual =
      quarantineTemplateCopilotRequirementText(actualSource);
    if (quarantinedActual.summary.quarantinedBlockCount > 0) {
      failures.push(
        `Scenario ${manifest.id} source slot ${slot} was not pre-quarantined by the shared safety boundary.`,
      );
    }
    if (
      templateCopilotV3NormalizeTrimCollapseText(actualSource) !==
      templateCopilotV3NormalizeTrimCollapseText(expectedSource)
    ) {
      failures.push(
        `Scenario ${manifest.id} source slot ${slot} drifted from the fixed corpus.`,
      );
    }
  }
}

function validateAcceptedSemanticQuarantine(texts) {
  const failures = [];
  const reasonCounts = {};
  let hitCount = 0;
  for (const [index, text] of texts.entries()) {
    const result = quarantineTemplateCopilotRequirementText(String(text));
    if (result.summary.quarantinedBlockCount === 0) continue;
    hitCount += result.summary.quarantinedBlockCount;
    failures.push(
      `Accepted semantic text ${index} failed the shared instruction quarantine.`,
    );
    for (const [reason, count] of Object.entries(result.summary.reasonCounts)) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + count;
    }
  }
  return { failures, hitCount, reasonCounts };
}

function advisoryHintHasExactSourceMeaning(kind, role, hint, quote) {
  const meaning = String(quote).normalize("NFKC").toLocaleLowerCase();
  if (
    (kind === "request_field" || kind === "attachment") &&
    role === "required"
  ) {
    const optional =
      /\b(?:not required|optional)\b|可選擇上載|可選上載|可选上传|選填|选填|非必須|非必须|不需要|毋須|毋须|無須|无须|可選擇|可选择|可選|可选/u.test(
        meaning,
      );
    if (hint === "false") return optional;
    return (
      !optional &&
      /\b(?:must|required|requires?|mandatory|upload|attach|submit|provide|include|fill|add)\b|必須填寫|必须填写|必須提供|必须提供|必須上載|必须上传|須上載|须上传|要上載|要上传|必須提交|必须提交|須提交|须提交|必須附上|必须附上|必須|必须|需要|必填|上載|上传|提交|附上|提供|填寫|填写|要填|須填|须填/u.test(
        meaning,
      )
    );
  }
  if (kind === "attachment" && role === "kind") {
    if (hint === "form") {
      return /\b(?:native form|in-app form|in app form|native|form)\b|應用程式內表格|应用内表单|原生表格|原生表单|原生|表格|表单/u.test(
        meaning,
      );
    }
    return /\b(?:uploaded file|spreadsheet|attachment|file|excel|csv|pdf|image|photo|text|proof|document)\b|上載檔案|上传文件|電子表格|电子表格|試算表|檔案|文件|附件|圖片|图片|相片|照片|文字|文本|證明|证明|上載|上传/u.test(
      meaning,
    );
  }
  if (kind === "stage" && role === "kind") {
    const patterns = {
      approval:
        /\b(?:approves?|approved|approval|endorses?|endorsed|confirms?|confirmed|go\/no-go)\b|審批|审批|核准|批准|認可|认可|確認|确认/u,
      review:
        /\b(?:reviews?|reviewed|compares?|compared|audits?|audited)\b|審核|审核|覆核|复核|審查|审查|評審|评审|核對|核对/u,
      submission: /\b(?:submits?|submission)\b|提交|呈交/u,
      for_information:
        /\b(?:fyi|for information|informational)\b|知會|知会|供參考|供参考|供知悉/u,
    };
    return patterns[hint]?.test(meaning) ?? false;
  }
  if (kind === "rejection" && role === "mode") {
    if (hint === "return_for_correction") {
      return /\b(?:returns?|returned|correction|correct|back)\b|退回|補正|补正|修正|修改/u.test(
        meaning,
      );
    }
    if (hint === "close")
      return /\bclose[ds]?\b|關閉|关闭|結案|结案/u.test(meaning);
    if (hint === "route_to_stage") {
      return /\b(?:route|send)\b|轉交|转交|送交/u.test(meaning);
    }
  }
  return true;
}

function validateItemEvidenceOwnership({
  entry,
  label,
  sourceSpans,
  sourceAnchors,
  semanticLeaves,
  relationships,
  failures,
}) {
  const referencedSpanIds = new Set([
    ...semanticLeaves.map((leaf) => leaf?.sourceSpan?.spanId),
    ...relationships.map((relationship) => relationship?.sourceSpan?.spanId),
    ...(Array.isArray(entry.bindings)
      ? entry.bindings.flatMap((binding) =>
          Array.isArray(binding?.spanIds) ? binding.spanIds : [],
        )
      : []),
  ]);
  referencedSpanIds.delete(undefined);
  const suppliedSpanIds = sourceSpans.map((span) => span?.spanId);
  if (
    suppliedSpanIds.some((spanId) => !referencedSpanIds.has(spanId)) ||
    [...referencedSpanIds].some((spanId) => !suppliedSpanIds.includes(spanId))
  ) {
    failures.push(
      `${label}: source spans do not exactly match item-owned semantic and strict evidence`,
    );
  }
  const semanticEvidence = [
    ...semanticLeaves.map((leaf) => leaf?.sourceSpan),
    ...relationships.map((relationship) => relationship?.sourceSpan),
  ].filter(isRecord);
  for (const evidence of semanticEvidence) {
    if (!sourceAnchors.some((anchor) => spanContains(anchor, evidence))) {
      failures.push(
        `${label}: semantic evidence is outside every item source anchor`,
      );
      break;
    }
  }
  for (const anchor of sourceAnchors) {
    if (!semanticEvidence.some((evidence) => spanContains(anchor, evidence))) {
      failures.push(
        `${label}: source anchor does not own any semantic evidence`,
      );
      break;
    }
  }
}

function spanContains(container, child) {
  return (
    isRecord(container) &&
    isRecord(child) &&
    container.messageId === child.messageId &&
    container.startCodePoint <= child.startCodePoint &&
    container.endCodePoint >= child.endCodePoint
  );
}

function validateKindRoleHint(kind, leaf, label) {
  const failures = [];
  const policy = templateCopilotV3ProviderQuoteKindRoleHints[kind];
  if (!policy || !Object.hasOwn(policy, leaf.role)) {
    failures.push(
      `${label}: role ${leaf.role} is not allowed for provider kind ${kind}`,
    );
    return failures;
  }
  const allowedHints = policy[leaf.role];
  if (allowedHints === null) {
    if (leaf.advisoryHint !== null) {
      failures.push(`${label}: raw source role cannot carry an advisory hint`);
    }
  } else if (
    !Array.isArray(allowedHints) ||
    typeof leaf.advisoryHint !== "string" ||
    !allowedHints.includes(leaf.advisoryHint)
  ) {
    failures.push(
      `${label}: advisory hint is outside the closed kind-role vocabulary`,
    );
  } else if (
    !advisoryHintHasExactSourceMeaning(
      kind,
      leaf.role,
      leaf.advisoryHint,
      leaf.quote,
    )
  ) {
    failures.push(
      `${label}: advisory hint is not supported by its exact source quote`,
    );
  }
  return failures;
}

function validateKindSlot(kind, messageId, label) {
  if (typeof messageId !== "string")
    return [`${label}: source message ID is invalid`];
  const slot = messageId.slice(messageId.lastIndexOf(":") + 1);
  if (!providerSlotSet.has(slot)) return [`${label}: source slot is unknown`];
  const allowed = allowedSlotsByKind[kind] ?? [];
  return allowed.includes(slot)
    ? []
    : [
        `${label}: provider kind ${kind} has no authority in source slot ${slot}`,
      ];
}

function validateSourceOrder(
  sourceOrder,
  spans,
  sourceMessages,
  label,
  failures,
) {
  if (!isRecord(sourceOrder) || spans.length === 0) {
    failures.push(`${label}: source order is missing`);
    return;
  }
  const first = spans[0];
  const expected = {
    messageId: first.messageId,
    messageIndex: Object.keys(sourceMessages).indexOf(first.messageId),
    startCodePoint: first.startCodePoint,
    endCodePoint: first.endCodePoint,
  };
  if (JSON.stringify(sourceOrder) !== JSON.stringify(expected)) {
    failures.push(
      `${label}: source order does not match exact source authority`,
    );
  }
}

function validateFragmentProjectionLinks({ envelope, items, failures }) {
  if (!envelope) return;
  const fragmentById = new Map(
    envelope.fragments.map((fragment) => [fragment.fragmentId, fragment]),
  );
  const referenceCounts = new Map();
  const projectedSpanIds = new Set();
  for (const [index, entry] of items.entries()) {
    if (!isRecord(entry) || !itemFactIdSet.has(entry.factId)) continue;
    if (entry.fragmentId === null) continue;
    const label = `items[${index}]`;
    const fragment = fragmentById.get(entry.fragmentId);
    if (!fragment) {
      failures.push(`${label}: fragmentId does not resolve in the envelope`);
      continue;
    }
    referenceCounts.set(
      entry.fragmentId,
      (referenceCounts.get(entry.fragmentId) ?? 0) + 1,
    );
    if (
      fragment.factId !== entry.factId ||
      stableJson(fragment.value) !== stableJson(entry.value) ||
      stableJson(fragment.bindings) !== stableJson(entry.bindings) ||
      stableJson(fragment.missingPaths) !== stableJson(entry.missingPaths)
    ) {
      failures.push(
        `${label}: review item strict fragment does not match its envelope fragment`,
      );
    }
    const fragmentSpanIds = (
      Array.isArray(fragment.bindings) ? fragment.bindings : []
    )
      .flatMap((binding) =>
        Array.isArray(binding.spanIds) ? binding.spanIds : [],
      )
      .filter((spanId) => typeof spanId === "string")
      .sort();
    const itemBindingSpanIds = (
      Array.isArray(entry.bindings) ? entry.bindings : []
    )
      .flatMap((binding) =>
        Array.isArray(binding.spanIds) ? binding.spanIds : [],
      )
      .filter((spanId) => typeof spanId === "string")
      .sort();
    if (
      JSON.stringify(fragmentSpanIds) !== JSON.stringify(itemBindingSpanIds) ||
      fragmentSpanIds.some(
        (spanId) => !entry.sourceSpans.some((span) => span.spanId === spanId),
      )
    ) {
      failures.push(
        `${label}: fragment binding spans do not exactly match item-owned strict evidence`,
      );
    }
    for (const spanId of fragmentSpanIds) projectedSpanIds.add(spanId);
  }
  for (const fragment of envelope.fragments) {
    if ((referenceCounts.get(fragment.fragmentId) ?? 0) !== 1) {
      failures.push(
        `Envelope fragment ${fragment.fragmentId} must map to exactly one review item.`,
      );
    }
  }
  const envelopeSpanIds = envelope.sourceSpans
    .map((span) => span.spanId)
    .sort();
  if (
    JSON.stringify(envelopeSpanIds) !==
    JSON.stringify([...projectedSpanIds].sort())
  ) {
    failures.push(
      "Envelope source spans do not exactly match referenced review fragments.",
    );
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function stageKind(entry) {
  const hints = semanticHints(entry, "kind").map((value) =>
    value.toLocaleLowerCase(),
  );
  if (hints.some((value) => value === "approval" || value === "approve")) {
    return "approval";
  }
  if (hints.some((value) => value === "review")) return "review";
  if (hints.some((value) => value === "submission")) return "submission";
  if (
    hints.some((value) =>
      ["for_information", "fyi", "informational"].includes(value),
    )
  ) {
    return "for_information";
  }
  const text = roleText(entry, "kind");
  if (/fyi|for information|知會|知会|供參考|供参考/u.test(text)) {
    return "for_information";
  }
  if (/review|審核|审核|覆核|复核/u.test(text)) return "review";
  if (/submit|submission|提交|呈交/u.test(text)) return "submission";
  if (/approve|approval|審批|审批|核准|批准/u.test(text)) return "approval";
  return "unknown";
}

function validateSourceMessageIds(entry, spans, label, failures) {
  const supplied = Array.isArray(entry.sourceMessageIds)
    ? entry.sourceMessageIds
    : [];
  const actual = [
    ...new Set(
      spans.flatMap((span) =>
        isRecord(span) && typeof span.messageId === "string"
          ? [span.messageId]
          : [],
      ),
    ),
  ].sort();
  if (
    supplied.length === 0 ||
    new Set(supplied).size !== supplied.length ||
    JSON.stringify([...supplied].sort()) !== JSON.stringify(actual)
  ) {
    failures.push(`${label}: source message IDs do not match item spans`);
  }
}

function roleValues(entry, role) {
  return Array.isArray(entry.semanticValue?.[role])
    ? entry.semanticValue[role]
    : [];
}

function roleText(entry, role) {
  return JSON.stringify([
    ...roleValues(entry, role),
    ...semanticHints(entry, role),
  ]).toLocaleLowerCase();
}

function semanticHints(entry, role) {
  return entry.semanticLeaves
    .filter(
      (leaf) => leaf.role === role && typeof leaf.advisoryHint === "string",
    )
    .map((leaf) => leaf.advisoryHint);
}

function relationshipMeaningMatches(relationship, advisoryHint, quote) {
  const meaning = String(advisoryHint ?? quote)
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
  if (relationship === "parallel") {
    return /^(?:parallel|in parallel|並行|并行)$/u.test(meaning);
  }
  return /^(?:sequential|sequentially|in sequence|one after another|依次|順序|顺序)$/u.test(
    meaning,
  );
}

function validateSpan(span, sourceMessages, label) {
  const failures = [];
  if (
    !isRecord(span) ||
    typeof span.spanId !== "string" ||
    typeof span.messageId !== "string" ||
    !Number.isInteger(span.startCodePoint) ||
    !Number.isInteger(span.endCodePoint) ||
    typeof span.exactText !== "string"
  ) {
    return [`${label}: malformed source span`];
  }
  if (
    span.spanId !==
    templateCopilotV3SourceSpanId({
      messageId: span.messageId,
      startCodePoint: span.startCodePoint,
      endCodePoint: span.endCodePoint,
      exactText: span.exactText,
    })
  ) {
    failures.push(`${label}: non-canonical source span ID`);
  }
  if (!validateTemplateCopilotV3SourceSpan(span, sourceMessages)) {
    failures.push(`${label}: invalid exact source span`);
  }
  return failures;
}

function validateNoCrossingSpans(spans, label, failures) {
  const valid = spans.filter(
    (span) =>
      isRecord(span) &&
      typeof span.messageId === "string" &&
      Number.isInteger(span.startCodePoint) &&
      Number.isInteger(span.endCodePoint),
  );
  for (let leftIndex = 0; leftIndex < valid.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < valid.length;
      rightIndex += 1
    ) {
      const left = valid[leftIndex];
      const right = valid[rightIndex];
      if (
        left.messageId === right.messageId &&
        ((left.startCodePoint < right.startCodePoint &&
          right.startCodePoint < left.endCodePoint &&
          left.endCodePoint < right.endCodePoint) ||
          (right.startCodePoint < left.startCodePoint &&
            left.startCodePoint < right.endCodePoint &&
            right.endCodePoint < left.endCodePoint))
      ) {
        failures.push(`${label}: crossing source spans are not allowed`);
        return;
      }
    }
  }
}

function primitiveLeafPaths(value, path = "") {
  if (value === null || typeof value !== "object") return [path || "/"];
  if (Array.isArray(value)) {
    if (value.length === 0) return [path || "/"];
    return value.flatMap((child, index) =>
      primitiveLeafPaths(child, `${path}/${index}`),
    );
  }
  const keys = Object.keys(value).sort();
  if (keys.length === 0) return path ? [path] : [];
  return keys.flatMap((key) =>
    primitiveLeafPaths(
      value[key],
      `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
    ),
  );
}

function collectUnsafeOrDefaultMarkers({
  entry,
  label,
  unsafeEntries,
  defaultOrUnknownExtras,
}) {
  if (entry.unsafe === true) unsafeEntries.push(label);
  if (
    entry.defaulted === true ||
    entry.isDefault === true ||
    entry.usesDefault === true ||
    entry.unknown === true ||
    entry.isUnknown === true ||
    entry.unsupported === true ||
    entry.extra === true ||
    ["default", "unknown", "unsupported"].includes(entry.sourceKind) ||
    ["default", "unknown", "unsupported"].includes(entry.provenance)
  ) {
    defaultOrUnknownExtras.push(label);
  }
}

function factIdForEntry(entry) {
  const supplied = entry.factId ?? entry.kind;
  if (expectedFactIdSet.has(supplied)) return supplied;
  return kindToFactId[supplied];
}

function arrayOrFailure(value, label, failures) {
  if (Array.isArray(value)) return value;
  failures.push(`${label} must be an array.`);
  return [];
}

function strictNonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const templateCopilotV3LiveSemanticScoringContract = Object.freeze({
  expectedBatchIds: [...expectedBatchIds],
  expectedFactIds: [...expectedFactIds],
  itemFactIds: [...itemFactIds],
  observedMetricKeys: [...observedMetricKeys],
  providerRoles: [...providerRoles],
  forbiddenSourceText: [...forbiddenSourceText],
  manifestVersion: templateCopilotV3SemanticManifestVersion,
  manifestCorpusFingerprint: templateCopilotV3SemanticManifestCorpusFingerprint,
  providerSlots: [...templateCopilotV3ProviderQuoteSlots],
});
