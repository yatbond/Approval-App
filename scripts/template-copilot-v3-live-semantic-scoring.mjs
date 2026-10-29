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
  templateCopilotV3SemanticScenarioManifests,
} from "./template-copilot-v3-semantic-scenario-manifests.mjs";

const expectedBatchIds = Object.freeze([
  "intake_documents",
  "routing_stages_participants",
  "routing_conditions",
  "routing_rejection",
  "policy_context",
]);
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
  "governedSemanticHoldCount",
  "notificationEntityCount",
  "fyiEntityCount",
  "expectedEntityCount",
  "matchedEntityCount",
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
const governedHoldBlockingReasons = Object.freeze([
  "compound_predicate_not_executable",
  "unsupported_semantics_not_executable",
]);
const governedHoldBlockingReasonSet = new Set(governedHoldBlockingReasons);
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
  // A file format ("PDF", "image") establishes an upload, as in assembly.
  "attachments.requirements": [["label"], ["kind", "format"], ["required"]],
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
  "blockingReason",
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

export const templateCopilotV3IterativeSemanticDiagnosticVersion =
  "template-copilot-v3-iterative-semantic-diagnostic.3";

const iterativeGapClassifications = Object.freeze([
  "recover_from_source",
  "ask_user",
  "governed_hold",
]);
const iterativeGapKinds = Object.freeze([
  "missing_fact",
  "governed_semantic_hold",
  "provider_failure",
  "unidentified_strict_failure",
]);
const iterativeDecisionReasonCodes = Object.freeze([
  "known_source_gap",
  "genuine_ambiguity_requires_question",
  "genuine_ambiguity_contract_unavailable",
  "server_question_unavailable",
  "fact_previously_asked",
  "source_authority_mapping_unavailable",
  "governed_semantic_hold",
  "provider_batch_failure",
  "strict_failure_without_identifiable_missing_fact",
]);
const iterativeQuestionMetricKeys = Object.freeze([
  "expectedQuestionCount",
  "askedQuestionCount",
  "correctQuestionCount",
  "knownFactQuestionCount",
  "repeatedQuestionCount",
  "duplicateQuestionCount",
  "irrelevantQuestionCount",
  "missedRequiredQuestionCount",
  "answerDisclosureCount",
  "prematureAnswerDisclosureCount",
  "invalidAskedQuestionCount",
  "invalidAnswerDisclosureCount",
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
  const blockedSemanticItems = [];
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
      if (
        (
          (entry.factId === "workflow.conditions" &&
            [
              "compound_predicate_not_executable",
              "unsupported_semantics_not_executable",
            ].includes(entry.blockingReason)) ||
          (entry.factId === "attachments.requirements" &&
            entry.blockingReason ===
              "unsupported_semantics_not_executable") ||
          (entry.factId === "workflow.stages" &&
            entry.blockingReason ===
              "unsupported_semantics_not_executable" &&
            entry.semanticLeaves.some(
              (leaf) =>
                leaf.role === "kind" && leaf.advisoryHint === "record_update",
            ))
        ) &&
        entry.complete === false &&
        entry.fragmentId === null &&
        entry.persisted === false &&
        entry.executable === false
      ) {
        blockedSemanticItems.push(entry);
        continue;
      }
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
        blockedSemanticItems,
        semanticFacts,
        sourceMessages,
      })
    : {
        passed: false,
        failures: ["No fixed semantic manifest was available."],
        sourceCapturePassed: false,
        captureFailures: ["No fixed semantic manifest was available."],
        governedHolds: [],
        observed: {},
      };
  failures.push(...scenarioSemantics.captureFailures);

  const factIds = [
    ...new Set([
      ...semanticItems.map((entry) => entry.factId),
      ...blockedSemanticItems.map((entry) => entry.factId),
      ...semanticFacts.map((entry) => entry.factId),
    ]),
  ].sort();
  const sourceCapturePassed = failures.length === 0;
  return {
    passed: sourceCapturePassed,
    failures,
    sourceCapturePassed,
    captureFailures: [...failures],
    governedHolds: scenarioSemantics.governedHolds,
    batchGate,
    candidateCount:
      rawItems.length + rawScalarFacts.length + rawPolicyItems.length,
    acceptedProjectionCount: semanticItems.length + semanticFacts.length,
    blockedSemanticItemCount: blockedSemanticItems.length,
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

/**
 * Diagnoses a provisional strict result without changing strict qualification.
 *
 * This API intentionally accepts and returns authority IDs, decision codes, and
 * counts only. Source text, provider output, question text, answers, and raw
 * scorer failures are neither required nor copied into the result.
 */
export function diagnoseTemplateCopilotV3IterativeSemantic({
  semantic = null,
  batches = [],
  disclosedSourceSlots = [],
  factSourceSlots = {},
  factBatchIds = {},
  slotBatchIds = {},
  serverQuestions = [],
  ambiguityGaps = [],
  previouslyAskedQuestionIds = [],
  askedQuestionIds = [],
  answerDisclosedQuestionIds = [],
} = {}) {
  const checkedSemantic = isRecord(semantic) ? semantic : null;
  const disclosedSlotSet = new Set(
    diagnosticSourceSlotIds(disclosedSourceSlots),
  );
  const normalizedQuestions = normalizeIterativeServerQuestions({
    serverQuestions,
    factSourceSlots,
  });
  const normalizedAmbiguityGaps = normalizeIterativeAmbiguityGaps({
    ambiguityGaps,
    factSourceSlots,
  });
  const questionById = new Map(
    normalizedQuestions.map((question) => [question.questionId, question]),
  );
  const previouslyAskedSet = new Set(
    diagnosticIds(previouslyAskedQuestionIds),
  );

  const gaps = [];
  const decisions = [];
  const semanticFactInventoryUsable =
    Array.isArray(checkedSemantic?.factIds) &&
    checkedSemantic.factIds.every((factId) => typeof factId === "string");
  const observedFactIdSet = new Set(
    semanticFactInventoryUsable
      ? checkedSemantic.factIds.filter((factId) =>
          expectedFactIdSet.has(factId),
        )
      : [],
  );
  const missingFactIds = semanticFactInventoryUsable
    ? expectedFactIds.filter((factId) => !observedFactIdSet.has(factId))
    : [];

  for (const factId of missingFactIds) {
    const sourceSlot = diagnosticFactSourceSlot(factSourceSlots, factId);
    const batchIds = diagnosticBatchIdsForFact({
      factBatchIds,
      factId,
      slotBatchIds,
      sourceSlot,
    });
    const gapId = `fact:${factId}`;
    gaps.push({
      gapId,
      kind: "missing_fact",
      factId,
      sourceSlot,
      batchIds,
      blockingReason: null,
    });

    if (sourceSlot !== null && disclosedSlotSet.has(sourceSlot)) {
      decisions.push({
        gapId,
        factId,
        classification: "recover_from_source",
        reasonCode: "known_source_gap",
        recoveryBatchIds: batchIds,
        questionId: null,
        ambiguityContractId: null,
      });
      continue;
    }

    if (sourceSlot === null) {
      decisions.push({
        gapId,
        factId,
        classification: "governed_hold",
        reasonCode: "source_authority_mapping_unavailable",
        recoveryBatchIds: [],
        questionId: null,
        ambiguityContractId: null,
      });
      continue;
    }

    const ambiguityGap = normalizedAmbiguityGaps.find(
      (gap) => gap.factId === factId && gap.sourceSlot === sourceSlot,
    );
    if (!ambiguityGap) {
      decisions.push({
        gapId,
        factId,
        classification: "governed_hold",
        reasonCode: "genuine_ambiguity_contract_unavailable",
        recoveryBatchIds: [],
        questionId: null,
        ambiguityContractId: null,
      });
      continue;
    }
    const matchingQuestions = normalizedQuestions.filter(
      (question) =>
        question.sourceSlot === sourceSlot &&
        question.factIds.includes(factId) &&
        question.gapKind === "genuine_ambiguity" &&
        question.ambiguityContractId ===
          ambiguityGap.ambiguityContractId,
    );
    if (
      matchingQuestions.some((question) =>
        previouslyAskedSet.has(question.questionId),
      )
    ) {
      decisions.push({
        gapId,
        factId,
        classification: "governed_hold",
        reasonCode: "fact_previously_asked",
        recoveryBatchIds: [],
        questionId: null,
        ambiguityContractId: ambiguityGap.ambiguityContractId,
      });
      continue;
    }
    const selectedQuestion = matchingQuestions[0] ?? null;
    if (selectedQuestion) {
      decisions.push({
        gapId,
        factId,
        classification: "ask_user",
        reasonCode: "genuine_ambiguity_requires_question",
        recoveryBatchIds: [],
        questionId: selectedQuestion.questionId,
        ambiguityContractId: ambiguityGap.ambiguityContractId,
      });
      continue;
    }
    decisions.push({
      gapId,
      factId,
      classification: "governed_hold",
      reasonCode: "server_question_unavailable",
      recoveryBatchIds: [],
      questionId: null,
      ambiguityContractId: ambiguityGap.ambiguityContractId,
    });
  }

  const governedHolds = normalizeIterativeGovernedHolds(
    checkedSemantic?.governedHolds,
  );
  const governedHoldOrdinals = new Map();
  for (const hold of governedHolds) {
    const ordinalKey = `${hold.factId}:${hold.blockingReason}`;
    const ordinal = (governedHoldOrdinals.get(ordinalKey) ?? 0) + 1;
    governedHoldOrdinals.set(ordinalKey, ordinal);
    const sourceSlot = diagnosticFactSourceSlot(
      factSourceSlots,
      hold.factId,
    );
    const gapId = `hold:${ordinalKey}:${ordinal}`;
    gaps.push({
      gapId,
      kind: "governed_semantic_hold",
      factId: hold.factId,
      sourceSlot,
      batchIds: diagnosticBatchIdsForFact({
        factBatchIds,
        factId: hold.factId,
        slotBatchIds,
        sourceSlot,
      }),
      blockingReason: hold.blockingReason,
    });
    decisions.push({
      gapId,
      factId: hold.factId,
      classification: "governed_hold",
      reasonCode: "governed_semantic_hold",
      recoveryBatchIds: [],
      questionId: null,
      ambiguityContractId: null,
    });
  }

  const providerFailureBatchIds = diagnoseProviderFailureBatchIds(batches);
  for (const batchId of providerFailureBatchIds) {
    const gapId = `provider:${batchId}`;
    gaps.push({
      gapId,
      kind: "provider_failure",
      factId: null,
      sourceSlot: null,
      batchIds: [batchId],
      blockingReason: null,
    });
    decisions.push({
      gapId,
      factId: null,
      classification: "recover_from_source",
      reasonCode: "provider_batch_failure",
      recoveryBatchIds: [batchId],
      questionId: null,
      ambiguityContractId: null,
    });
  }

  if (
    checkedSemantic?.passed !== true &&
    (!semanticFactInventoryUsable || missingFactIds.length === 0) &&
    providerFailureBatchIds.length === 0
  ) {
    const gapId = "semantic:unidentified";
    gaps.push({
      gapId,
      kind: "unidentified_strict_failure",
      factId: null,
      sourceSlot: null,
      batchIds: [],
      blockingReason: null,
    });
    decisions.push({
      gapId,
      factId: null,
      classification: "governed_hold",
      reasonCode: "strict_failure_without_identifiable_missing_fact",
      recoveryBatchIds: [],
      questionId: null,
      ambiguityContractId: null,
    });
  }

  const recoveryBatchIds = expectedBatchIds.filter((batchId) =>
    decisions.some(
      (decision) =>
        decision.classification === "recover_from_source" &&
        decision.recoveryBatchIds.includes(batchId),
    ),
  );
  const expectedQuestionIds = sortedDiagnosticIds(
    decisions.flatMap((decision) =>
      decision.classification === "ask_user" && decision.questionId
        ? [decision.questionId]
        : [],
    ),
  );
  const askedQuestionInput = diagnosticIdInput(askedQuestionIds);
  const askedQuestionIdEntries = askedQuestionInput.ids;
  const uniqueAskedQuestionIds = sortedDiagnosticIds(askedQuestionIdEntries);
  const expectedQuestionIdSet = new Set(expectedQuestionIds);
  const correctQuestionIds = uniqueAskedQuestionIds.filter(
    (questionId) =>
      expectedQuestionIdSet.has(questionId) &&
      !previouslyAskedSet.has(questionId),
  );
  const duplicateQuestionIds = sortedDiagnosticIds(
    askedQuestionIdEntries.filter(
      (questionId, index) =>
        askedQuestionIdEntries.indexOf(questionId) !== index,
    ),
  );
  const repeatedQuestionIds = sortedDiagnosticIds([
    ...uniqueAskedQuestionIds.filter((questionId) =>
      previouslyAskedSet.has(questionId),
    ),
    ...duplicateQuestionIds,
  ]);
  const knownFactQuestionIds = uniqueAskedQuestionIds.filter((questionId) => {
    const question = questionById.get(questionId);
    return question ? disclosedSlotSet.has(question.sourceSlot) : false;
  });
  const irrelevantQuestionIds = uniqueAskedQuestionIds.filter(
    (questionId) => !expectedQuestionIdSet.has(questionId),
  );
  const missedRequiredQuestionIds = expectedQuestionIds.filter(
    (questionId) => !uniqueAskedQuestionIds.includes(questionId),
  );
  const answerDisclosureInput = diagnosticIdInput(
    answerDisclosedQuestionIds,
  );
  const normalizedAnswerDisclosureIds = sortedDiagnosticIds(
    answerDisclosureInput.ids,
  );
  const correctQuestionIdSet = new Set(correctQuestionIds);
  const prematureAnswerDisclosureQuestionIds =
    normalizedAnswerDisclosureIds.filter(
      (questionId) => !correctQuestionIdSet.has(questionId),
    );
  const questions = {
    expectedQuestionIds,
    askedQuestionIds: uniqueAskedQuestionIds,
    correctQuestionIds,
    knownFactQuestionIds,
    repeatedQuestionIds,
    duplicateQuestionIds,
    irrelevantQuestionIds,
    missedRequiredQuestionIds,
    answerDisclosedQuestionIds: normalizedAnswerDisclosureIds,
    prematureAnswerDisclosureQuestionIds,
  };
  const metrics = {
    gapCount: gaps.length,
    missingFactGapCount: gaps.filter((gap) => gap.kind === "missing_fact")
      .length,
    recoverFromSourceCount: decisions.filter(
      (decision) => decision.classification === "recover_from_source",
    ).length,
    askUserCount: decisions.filter(
      (decision) => decision.classification === "ask_user",
    ).length,
    governedHoldCount: decisions.filter(
      (decision) => decision.classification === "governed_hold",
    ).length,
    providerFailureCount: providerFailureBatchIds.length,
    unidentifiedStrictFailureCount: gaps.filter(
      (gap) => gap.kind === "unidentified_strict_failure",
    ).length,
    recoveryBatchCount: recoveryBatchIds.length,
    expectedQuestionCount: expectedQuestionIds.length,
    askedQuestionCount: uniqueAskedQuestionIds.length,
    correctQuestionCount: correctQuestionIds.length,
    knownFactQuestionCount: knownFactQuestionIds.length,
    repeatedQuestionCount: repeatedQuestionIds.length,
    duplicateQuestionCount: duplicateQuestionIds.length,
    irrelevantQuestionCount: irrelevantQuestionIds.length,
    missedRequiredQuestionCount: missedRequiredQuestionIds.length,
    answerDisclosureCount: normalizedAnswerDisclosureIds.length,
    prematureAnswerDisclosureCount:
      prematureAnswerDisclosureQuestionIds.length,
    invalidAskedQuestionCount: askedQuestionInput.invalidCount,
    invalidAnswerDisclosureCount: answerDisclosureInput.invalidCount,
  };

  return {
    version: templateCopilotV3IterativeSemanticDiagnosticVersion,
    gaps,
    decisions,
    recoveryBatchIds,
    questions,
    metrics,
  };
}

function diagnosticFactSourceSlot(factSourceSlots, factId) {
  if (!isRecord(factSourceSlots)) return null;
  const value = factSourceSlots[factId];
  return isDiagnosticSourceSlotId(value) ? value : null;
}

function diagnosticBatchIdsForSlot(slotBatchIds, sourceSlot) {
  if (!isRecord(slotBatchIds) || !isDiagnosticSourceSlotId(sourceSlot)) {
    return [];
  }
  const supplied = Array.isArray(slotBatchIds[sourceSlot])
    ? slotBatchIds[sourceSlot]
    : [slotBatchIds[sourceSlot]];
  const suppliedSet = new Set(supplied);
  return expectedBatchIds.filter((batchId) => suppliedSet.has(batchId));
}

function diagnosticBatchIdsForFact({
  factBatchIds,
  factId,
  slotBatchIds,
  sourceSlot,
}) {
  if (isRecord(factBatchIds) && Object.hasOwn(factBatchIds, factId)) {
    if (!Array.isArray(factBatchIds[factId])) return [];
    const suppliedSet = new Set(factBatchIds[factId]);
    const exact = expectedBatchIds.filter((batchId) =>
      suppliedSet.has(batchId)
    );
    return exact.length > 0 && exact.length === suppliedSet.size ? exact : [];
  }
  return diagnosticBatchIdsForSlot(slotBatchIds, sourceSlot);
}

function normalizeIterativeServerQuestions({
  serverQuestions,
  factSourceSlots,
}) {
  const normalized = [];
  const seenQuestionIds = new Set();
  for (const question of Array.isArray(serverQuestions)
    ? serverQuestions
    : []) {
    if (!isRecord(question) || !isDiagnosticId(question.questionId)) continue;
    if (seenQuestionIds.has(question.questionId)) continue;
    const suppliedFactIds = Array.isArray(question.factIds)
      ? question.factIds
      : [question.factId];
    const factIds = expectedFactIds.filter((factId) =>
      suppliedFactIds.includes(factId),
    );
    if (factIds.length === 0) continue;
    const mappedSlots = [
      ...new Set(
        factIds.map((factId) =>
          diagnosticFactSourceSlot(factSourceSlots, factId),
        ),
      ),
    ];
    const sourceSlot = isDiagnosticSourceSlotId(question.sourceSlot)
      ? question.sourceSlot
      : mappedSlots.length === 1
        ? mappedSlots[0]
        : null;
    if (
      sourceSlot === null ||
      mappedSlots.length !== 1 ||
      mappedSlots[0] !== sourceSlot
    ) {
      continue;
    }
    seenQuestionIds.add(question.questionId);
    normalized.push({
      questionId: question.questionId,
      factIds,
      sourceSlot,
      gapKind:
        question.gapKind === "genuine_ambiguity"
          ? "genuine_ambiguity"
          : null,
      ambiguityContractId: isDiagnosticId(question.ambiguityContractId)
        ? question.ambiguityContractId
        : null,
    });
  }
  return normalized;
}

function normalizeIterativeAmbiguityGaps({
  ambiguityGaps,
  factSourceSlots,
}) {
  const normalized = [];
  const seenFactIds = new Set();
  for (const gap of Array.isArray(ambiguityGaps) ? ambiguityGaps : []) {
    if (
      !isRecord(gap) ||
      gap.gapKind !== "genuine_ambiguity" ||
      !expectedFactIdSet.has(gap.factId) ||
      !isDiagnosticId(gap.ambiguityContractId) ||
      seenFactIds.has(gap.factId)
    ) {
      continue;
    }
    const mappedSourceSlot = diagnosticFactSourceSlot(
      factSourceSlots,
      gap.factId,
    );
    const sourceSlot = isDiagnosticSourceSlotId(gap.sourceSlot)
      ? gap.sourceSlot
      : mappedSourceSlot;
    if (sourceSlot === null || sourceSlot !== mappedSourceSlot) continue;
    seenFactIds.add(gap.factId);
    normalized.push({
      factId: gap.factId,
      sourceSlot,
      gapKind: "genuine_ambiguity",
      ambiguityContractId: gap.ambiguityContractId,
    });
  }
  return normalized;
}

function normalizeIterativeGovernedHolds(governedHolds) {
  return (Array.isArray(governedHolds) ? governedHolds : [])
    .filter(
      (hold) =>
        isRecord(hold) &&
        expectedFactIdSet.has(hold.factId) &&
        governedHoldBlockingReasonSet.has(hold.blockingReason),
    )
    .map((hold) => ({
      factId: hold.factId,
      blockingReason: hold.blockingReason,
    }))
    .sort((left, right) => {
      const factComparison = left.factId.localeCompare(right.factId, "en");
      return factComparison !== 0
        ? factComparison
        : left.blockingReason.localeCompare(right.blockingReason, "en");
    });
}

function diagnoseProviderFailureBatchIds(batches) {
  const failedBatchIdSet = new Set();
  for (const batch of Array.isArray(batches) ? batches : []) {
    if (!isRecord(batch)) continue;
    const batchId = batch.batchId ?? batch.id;
    if (!expectedBatchIds.includes(batchId)) continue;
    const providerOutcomeFailed =
      typeof batch.providerOutcome === "string" &&
      batch.providerOutcome !== "success";
    const statusFailed =
      typeof batch.status === "string" && batch.status !== "applied";
    if (
      providerOutcomeFailed ||
      statusFailed ||
      (Number.isInteger(batch.providerRequestFailureCount) &&
        batch.providerRequestFailureCount > 0) ||
      (Number.isInteger(batch.failureCount) && batch.failureCount > 0)
    ) {
      failedBatchIdSet.add(batchId);
    }
  }
  return expectedBatchIds.filter((batchId) =>
    failedBatchIdSet.has(batchId),
  );
}

function diagnosticIds(value) {
  return (Array.isArray(value) ? value : []).filter(isDiagnosticId);
}

function diagnosticIdInput(value) {
  if (!Array.isArray(value)) {
    return {
      ids: [],
      invalidCount: value === undefined || value === null ? 0 : 1,
    };
  }
  const ids = value.filter(isDiagnosticId);
  return {
    ids,
    invalidCount: value.length - ids.length,
  };
}

function sortedDiagnosticIds(value) {
  return [...new Set(diagnosticIds(value))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function diagnosticSourceSlotIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(
    isDiagnosticSourceSlotId,
  ))];
}

function isDiagnosticId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/u.test(value)
  );
}

function isDiagnosticSourceSlotId(value) {
  return (
    typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(value)
  );
}

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
      "expandedAnchorItemCount",
      "sameLocalClauseRecoveredLeafCount",
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
    const acceptedItems = strictNonnegativeInteger(batch.acceptedItemCount);
    const expandedAnchors = strictNonnegativeInteger(
      batch.expandedAnchorItemCount,
    );
    const recoveredLeaves = strictNonnegativeInteger(
      batch.sameLocalClauseRecoveredLeafCount,
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
    if (
      acceptedItems !== null &&
      expandedAnchors !== null &&
      recoveredLeaves !== null &&
      (
        expandedAnchors > acceptedItems ||
        (expandedAnchors === 0) !== (recoveredLeaves === 0) ||
        recoveredLeaves < expandedAnchors ||
        recoveredLeaves > acceptedItems * 2
      )
    ) {
      failures.push(
        `Qualification batch ${id} local-clause recovery counts are inconsistent.`,
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
  if (entry.blockingReason !== undefined) {
    const supportedBlockingState =
      (
        entry.blockingReason === "compound_predicate_not_executable" &&
        entry.factId === "workflow.conditions"
      ) ||
      (
        entry.blockingReason === "unsupported_semantics_not_executable" &&
        (
          ["workflow.conditions", "attachments.requirements"].includes(
            entry.factId,
          ) ||
          (
            entry.factId === "workflow.stages" &&
            Array.isArray(entry.semanticLeaves) &&
            entry.semanticLeaves.some(
              (leaf) =>
                isRecord(leaf) &&
                leaf.role === "kind" &&
                leaf.advisoryHint === "record_update",
            )
          )
        )
      );
    if (
      !supportedBlockingState ||
      entry.semanticComplete !== false ||
      entry.complete !== false ||
      entry.fragmentId !== null
    ) {
      failures.push(
        `${label}: governed semantic blocking state is invalid`,
      );
    }
  } else if (entry.semanticComplete !== true) {
    failures.push(
      `${label}: unresolved semantic item needs an explicit governed blocking reason`,
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
  const governedAuthorityBlocked = entry.blockingReason !== undefined;
  const expectedComplete =
    missingPaths.length === 0 && !governedAuthorityBlocked;
  if (
    typeof entry.complete !== "boolean" ||
    entry.complete !== expectedComplete
  ) {
    failures.push(`${label}: strict complete flag does not match governed authority and missingPaths`);
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
  blockedSemanticItems,
  semanticFacts,
  sourceMessages,
}) {
  const failures = [];
  const governedHolds = [];
  const retainedItems = [...semanticItems, ...blockedSemanticItems];
  const entries = (factId) =>
    retainedItems.filter((entry) => entry.factId === factId);
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
    ...retainedItems.map((entry) => semanticItemString(entry)),
    ...semanticFacts.map((entry) => semanticFactString(entry)),
  ].join("\n");

  const factIds = new Set([
    ...retainedItems.map((entry) => entry.factId),
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
    ["approval", "review", "submission", "record_update"].includes(stageKinds[index]),
  );
  const unknownStages = stages.filter(
    (_, index) =>
      !["approval", "review", "submission", "record_update", "for_information"].includes(
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
    mergedLabelTerm: (expected) => expected.label,
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
    mergedLabelTerm: (expected) => expected.label,
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
      [attachmentRequirementHint(expected.requirementMode)],
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
    for (const role of [
      "minimum_quantity",
      "maximum_quantity",
      "conditional_quantity_increment",
    ]) {
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
    const governedRequirement =
      !["required", "optional"].includes(expected.requirementMode);
    if (governedRequirement) {
      if (!isExactGovernedHold(entry, "unsupported_semantics_not_executable")) {
        failures.push(
          `${label} did not remain safely blocked as a non-executable conditional attachment requirement.`,
        );
      } else {
        governedHolds.push(governedHoldForEntry(entry));
      }
    } else if (
      entry.blockingReason !== undefined ||
      entry.semanticComplete !== true
    ) {
      failures.push(
        `${label} was not retained as a complete unconditional attachment requirement.`,
      );
    }
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
    if (expected.kind === "record_update") {
      if (!isExactGovernedHold(entry, "unsupported_semantics_not_executable")) {
        failures.push(
          `${label} did not remain safely blocked as a non-executable record-update action.`,
        );
      } else {
        governedHolds.push(governedHoldForEntry(entry));
      }
    } else if (
      entry.blockingReason !== undefined ||
      entry.semanticComplete !== true
    ) {
      failures.push(
        `${label} was not retained as a semantically complete governed stage.`,
      );
    }
  }
  const sourceNormalizedGovernedStages =
    normalizeGovernedStageOrderFromSource(governedStages, sourceMessages);
  const orderedStageEntries = stageMatch.pairs.map((pair) => pair[1]);
  if (
    orderedStageEntries.length === sourceNormalizedGovernedStages.length &&
    orderedStageEntries.some(
      (entry, index) => entry !== sourceNormalizedGovernedStages[index],
    )
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
  let governedConditionHoldCount = 0;
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
      "currency",
      expected.currency ? [expected.currency] : [],
      label,
      failures,
    );
    if (
      expected.currency &&
      !conditionCurrencyHasSourceAffinity(
        entry,
        expected,
        manifest.conditions,
        sourceMessages,
      )
    ) {
      failures.push(
        `${label} currency is not grounded in its numeric value clause or source field carry-forward.`,
      );
    }
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
    requireExactConditionPredicateContext({
      entry,
      expected,
      sourceMessages,
      label,
      failures,
    });
    const expectedBlockingReason =
      expected.predicateContext?.executionMode === "structured"
        ? null
        : expected.predicateContext?.executionMode;
    if (expectedBlockingReason) {
      governedConditionHoldCount += 1;
      if (!isExactGovernedHold(entry, expectedBlockingReason)) {
        failures.push(
          `${label} did not remain safely blocked with its reviewed governed reason.`,
        );
      } else {
        governedHolds.push(governedHoldForEntry(entry));
      }
    } else if (
      entry.blockingReason !== undefined ||
      entry.semanticComplete !== true
    ) {
      failures.push(
        `${label} was not retained as a complete structured condition.`,
      );
    }
  }

  const matchedRouteOnlyApprovalNodeCount =
    manifest.routeOnlyApprovalNodes.filter((routeNode) =>
      conditionMatch.pairs.some(
        ([expected, entry]) =>
          expected.predicateContext?.executionMode === "structured" &&
          entry.blockingReason === undefined &&
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

  const expectedGovernedHolds = expectedGovernedHoldsForManifest(manifest);
  const actualGovernedHolds = sortGovernedHolds(
    blockedSemanticItems.map(governedHoldForEntry),
  );
  if (!sameGovernedHoldInventory(actualGovernedHolds, expectedGovernedHolds)) {
    failures.push(
      "The governed hold count or blocking-reason inventory does not match the fixed source contract.",
    );
  }
  if (!sameGovernedHoldInventory(actualGovernedHolds, governedHolds)) {
    failures.push(
      "The governed hold inventory is not bound one-to-one to the reviewed source contracts.",
    );
  }

  // Partial credit: entities matched one-to-one against the fixed manifest
  // across every family, reported alongside (never instead of) the strict gate.
  const entityMatches = [
    [manifest.fields, fieldMatch],
    [manifest.attachments, attachmentMatch],
    [manifest.stages, stageMatch],
    [manifest.fyiRecipients, fyiMatch],
    [manifest.conditions, conditionMatch],
    [manifest.notificationRules, notificationMatch],
  ];
  const observed = {
    documents: attachments.length,
    requestFields: fields.length,
    approvalNodes:
      governedStages.filter((entry) =>
        ["approval", "review"].includes(stageKind(entry)),
      ).length + matchedRouteOnlyApprovalNodeCount,
    conditionNodes: conditions.length - governedConditionHoldCount,
    notificationRules: notifications.length,
    fyiRecipients: fyiStages.length,
    parallelStageCount: observedParallelCount,
    factCount: factIds.size,
    fieldEntityCount: fieldMatch.matchedCount,
    attachmentEntityCount: attachmentMatch.matchedCount,
    stageEntityCount: stageMatch.matchedCount,
    conditionEntityCount:
      conditionMatch.matchedCount - governedConditionHoldCount,
    governedSemanticHoldCount: blockedSemanticItems.length,
    notificationEntityCount: notificationMatch.matchedCount,
    fyiEntityCount: fyiMatch.matchedCount,
    expectedEntityCount: entityMatches.reduce(
      (total, [expected]) => total + expected.length,
      0,
    ),
    matchedEntityCount: entityMatches.reduce(
      (total, [, match]) => total + match.matchedCount,
      0,
    ),
  };
  if (
    JSON.stringify(Object.keys(observed)) !== JSON.stringify(observedMetricKeys)
  ) {
    failures.push(
      "Observed semantic metrics drifted from the privacy allowlist.",
    );
  }
  const sourceCapturePassed = failures.length === 0;
  return {
    passed: sourceCapturePassed,
    failures,
    sourceCapturePassed,
    captureFailures: [...failures],
    governedHolds: actualGovernedHolds,
    observed,
  };
}

function isExactGovernedHold(entry, blockingReason) {
  return (
    governedHoldBlockingReasonSet.has(blockingReason) &&
    entry.blockingReason === blockingReason &&
    entry.semanticComplete === false &&
    entry.complete === false &&
    entry.fragmentId === null &&
    entry.persisted === false &&
    entry.executable === false
  );
}

function governedHoldForEntry(entry) {
  return {
    factId: entry.factId,
    blockingReason: entry.blockingReason,
  };
}

function expectedGovernedHoldsForManifest(manifest) {
  return sortGovernedHolds([
    ...manifest.attachments
      .filter(
        (entry) => !["required", "optional"].includes(entry.requirementMode),
      )
      .map(() => ({
        factId: "attachments.requirements",
        blockingReason: "unsupported_semantics_not_executable",
      })),
    ...manifest.stages
      .filter((entry) => entry.kind === "record_update")
      .map(() => ({
        factId: "workflow.stages",
        blockingReason: "unsupported_semantics_not_executable",
      })),
    ...manifest.conditions
      .filter(
        (entry) => entry.predicateContext.executionMode !== "structured",
      )
      .map((entry) => ({
        factId: "workflow.conditions",
        blockingReason: entry.predicateContext.executionMode,
      })),
  ]);
}

function sortGovernedHolds(governedHolds) {
  return [...governedHolds].sort((left, right) => {
    const factComparison = left.factId.localeCompare(right.factId, "en");
    if (factComparison !== 0) return factComparison;
    return left.blockingReason.localeCompare(right.blockingReason, "en");
  });
}

function sameGovernedHoldInventory(left, right) {
  return (
    JSON.stringify(sortGovernedHolds(left)) ===
    JSON.stringify(sortGovernedHolds(right))
  );
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
      roleTermMatches(contract.role, leaf.quote, contract.term) &&
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

function conditionCurrencyHasSourceAffinity(
  entry,
  expected,
  conditionContracts,
  sourceMessages,
) {
  const currency = sourceTermRangeForRole(
    entry,
    expected.currency,
    sourceMessages,
  );
  const value = sourceTermRangeForRole(
    entry,
    roleContract("value", expected.value),
    sourceMessages,
  );
  const field = sourceTermRangeForRole(
    entry,
    roleContract("field", expected.field),
    sourceMessages,
  );
  if (
    !currency ||
    !value ||
    currency.messageId !== value.messageId
  ) {
    return false;
  }
  const text = Array.from(sourceMessages[currency.messageId]);
  const currencyClause = sourceClauseBoundsForRange(text, currency);
  const valueClause = sourceClauseBoundsForRange(text, value);
  const valueClauseText = text
    .slice(valueClause.startCodePoint, valueClause.endCodePoint)
    .join("");
  const valueClauseHasExpectedCurrency = canonicalIncludes(
    valueClauseText,
    expected.currency.term,
  );

  if (valueClauseHasExpectedCurrency) {
    return spansShareSourceClause(currency, value, sourceMessages);
  }
  if (sourceTextHasExplicitCurrency(valueClauseText)) return false;
  if (spansShareSourceClause(currency, value, sourceMessages)) return true;
  if (
    currency.endCodePoint > value.startCodePoint ||
    field === null ||
    field.messageId !== currency.messageId ||
    !spansShareSourceClause(currency, field, sourceMessages)
  ) {
    return false;
  }

  const interveningText = text
    .slice(currencyClause.endCodePoint, valueClause.startCodePoint)
    .join("");
  if (sourceTextHasExplicitCurrency(interveningText)) return false;
  return !conditionContracts.some(
    (contract) =>
      typeof contract.field === "string" &&
      canonicalIncludes(interveningText, contract.field),
  );
}

function sourceTextHasExplicitCurrency(source) {
  return /\b(?:AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|JPY|RMB|SGD|USD)\b|港幣|港币|香港元|美元|美金|人民幣|人民币|日圓|日元|歐元|欧元|英鎊|英镑|新加坡元/iu.test(
    source,
  );
}

function normalizeGovernedStageOrderFromSource(entries, sourceMessages) {
  const explicitlyPositioned = new Set();
  let normalized = [...entries];
  for (const entry of entries) {
    const target = conditionSourcedInsertionTarget(entry, entries, sourceMessages);
    if (target === null) continue;
    const entryIndex = normalized.indexOf(entry);
    const targetIndex = normalized.indexOf(target);
    if (entryIndex < 0 || targetIndex < 0 || entryIndex === targetIndex - 1) {
      explicitlyPositioned.add(entry);
      continue;
    }
    normalized.splice(entryIndex, 1);
    normalized.splice(normalized.indexOf(target), 0, entry);
    explicitlyPositioned.add(entry);
  }

  const explicitFinalStages = entries.filter((entry) =>
    stageHasLeadingFinalMarker(entry, sourceMessages),
  );
  if (explicitFinalStages.length !== 1) return normalized;

  const finalStage = explicitFinalStages[0];
  const finalIndex = normalized.indexOf(finalStage);
  const conditionAddedAfterFinal = normalized
    .slice(finalIndex + 1)
    .filter(
      (entry) =>
        !explicitlyPositioned.has(entry) &&
        stageIsConditionSourcedAddedGovernedStage(entry, sourceMessages),
    );
  if (conditionAddedAfterFinal.length === 0) return normalized;

  const moved = new Set(conditionAddedAfterFinal);
  return [
    ...normalized.slice(0, finalIndex),
    ...conditionAddedAfterFinal,
    finalStage,
    ...normalized.slice(finalIndex + 1).filter((entry) => !moved.has(entry)),
  ];
}

function stageHasLeadingFinalMarker(entry, sourceMessages) {
  const source = stageParticipantSourcePrefix(
    entry,
    sourceMessages,
    "stages_participants",
  );
  return (
    source !== null &&
    /(?:\b(?:finally|lastly)(?:\s+by)?(?:\s+the)?|最後(?:由)?|最后(?:由)?)\s*$/iu.test(
      source,
    )
  ) || stageHasTrailingFinalMarker(entry, sourceMessages);
}

function stageHasTrailingFinalMarker(entry, sourceMessages) {
  const participantLeaves = roleLeaves(entry, "participant");
  if (participantLeaves.length !== 1) return false;
  const participant = participantLeaves[0];
  if (
    !isRecord(participant.sourceSpan) ||
    participant.sourceSpan.messageId.slice(
      participant.sourceSpan.messageId.lastIndexOf(":") + 1,
    ) !== "stages_participants" ||
    typeof sourceMessages[participant.sourceSpan.messageId] !== "string"
  ) return false;
  const text = Array.from(sourceMessages[participant.sourceSpan.messageId]);
  const clause = sourceClauseBoundsForRange(text, participant.sourceSpan);
  const suffix = text
    .slice(participant.sourceSpan.endCodePoint, clause.endCodePoint)
    .join("")
    .trim();
  return /^(?:is\s+the\s+)?final(?:ly)?\b|^最終(?:批准|審批|审批)|^最终(?:批准|審批|审批)/iu.test(
    suffix,
  );
}

function conditionSourcedInsertionTarget(entry, entries, sourceMessages) {
  if (!stageIsConditionSourcedAddedGovernedStage(entry, sourceMessages)) return null;
  const participantLeaves = roleLeaves(entry, "participant");
  if (participantLeaves.length !== 1) return null;
  const participant = participantLeaves[0];
  const text = Array.from(sourceMessages[participant.sourceSpan.messageId] ?? "");
  const clause = sourceClauseBoundsForRange(text, participant.sourceSpan);
  const suffix = text
    .slice(participant.sourceSpan.endCodePoint, clause.endCodePoint)
    .join("")
    .toLocaleLowerCase("en");
  return (
    entries.find((candidate) => {
      if (candidate === entry) return false;
      const target = roleValues(candidate, "participant");
      if (target.length !== 1) return false;
      const normalizedTarget = target[0].toLocaleLowerCase("en");
      return (
        suffix.includes(`before ${normalizedTarget}`) ||
        suffix.includes(`before the ${normalizedTarget}`)
      );
    }) ?? null
  );
}

function stageIsConditionSourcedAddedGovernedStage(entry, sourceMessages) {
  if (
    !semanticHints(entry, "kind").some((kind) =>
      ["approval", "review", "submission", "record_update"].includes(kind),
    )
  ) {
    return false;
  }
  const source = stageParticipantSourcePrefix(
    entry,
    sourceMessages,
    "conditions_exceptions",
  );
  return (
    source !== null &&
    /(?:\b(?:add|adds|added|include|includes|included)(?:\s+(?:an?|the))?|增加|新增|加上)\s*$/iu.test(
      source,
    )
  );
}

function stageParticipantSourcePrefix(entry, sourceMessages, slot) {
  const participantLeaves = roleLeaves(entry, "participant");
  if (participantLeaves.length !== 1) return null;
  const participant = participantLeaves[0];
  if (
    !isRecord(participant.sourceSpan) ||
    participant.sourceSpan.messageId.slice(
      participant.sourceSpan.messageId.lastIndexOf(":") + 1,
    ) !== slot ||
    typeof sourceMessages[participant.sourceSpan.messageId] !== "string"
  ) {
    return null;
  }
  const text = Array.from(sourceMessages[participant.sourceSpan.messageId]);
  const clause = sourceClauseBoundsForRange(text, participant.sourceSpan);
  return text
    .slice(clause.startCodePoint, participant.sourceSpan.startCodePoint)
    .join("")
    .trim();
}

function requireExactConditionPredicateContext({
  entry,
  expected,
  sourceMessages,
  label,
  failures,
}) {
  const beforeField = Array.isArray(expected.predicateContext?.beforeField)
    ? expected.predicateContext.beforeField
    : [];
  const withinField = Array.isArray(expected.predicateContext?.withinField)
    ? expected.predicateContext.withinField
    : [];
  const withinValue = Array.isArray(expected.predicateContext?.withinValue)
    ? expected.predicateContext.withinValue
    : [];
  const betweenValueAndMatchingRoute = Array.isArray(
    expected.predicateContext?.betweenValueAndMatchingRoute,
  )
    ? expected.predicateContext.betweenValueAndMatchingRoute
    : [];
  const unsupportedOutcome = Array.isArray(
    expected.predicateContext?.unsupportedOutcome,
  )
    ? expected.predicateContext.unsupportedOutcome
    : [];
  const unsupportedMeaning = Array.isArray(
    expected.predicateContext?.unsupportedMeaning,
  )
    ? expected.predicateContext.unsupportedMeaning
    : [];
  if (
    beforeField.length === 0 &&
    withinField.length === 0 &&
    withinValue.length === 0 &&
    betweenValueAndMatchingRoute.length === 0 &&
    unsupportedOutcome.length === 0 &&
    unsupportedMeaning.length === 0
  ) {
    return;
  }

  const fieldRange = sourceTermRangeForRole(
    entry,
    roleContract("field", expected.field),
    sourceMessages,
  );
  const valueRange = sourceTermRangeForRole(
    entry,
    roleContract("value", expected.value),
    sourceMessages,
  );
  const matchingRouteRange = sourceTermRangeForRole(
    entry,
    expected.matchingRoute,
    sourceMessages,
  );

  for (const term of withinField) {
    if (!expected.field.includes(term)) {
      failures.push(`${label} predicate context within field is not exact.`);
    }
  }
  for (const term of withinValue) {
    if (!expected.value.includes(term)) {
      failures.push(`${label} predicate context within value is not exact.`);
    }
  }
  const outcomeTerms = [
    expected.matchingRoute.term,
    ...(expected.otherwiseRoute ? [expected.otherwiseRoute.term] : []),
  ];
  for (const term of unsupportedOutcome) {
    if (!outcomeTerms.some((outcome) => outcome.includes(term))) {
      failures.push(`${label} unsupported outcome context is not exact.`);
    }
  }
  const ownedSourceIds = new Set(
    (entry.sourceAnchors ?? []).map((anchor) => anchor.messageId),
  );
  for (const term of unsupportedMeaning) {
    if (
      ![...ownedSourceIds].some(
        (messageId) => sourceMessages[messageId]?.includes(term),
      )
    ) {
      failures.push(`${label} unsupported source meaning is not exact.`);
    }
  }

  if (beforeField.length > 0) {
    const expectedPrefix = beforeField.join("");
    if (!fieldRange) {
      failures.push(
        `${label} predicate context before field is not exact and adjacent.`,
      );
    } else {
      const text = Array.from(sourceMessages[fieldRange.messageId]);
      const clause = sourceClauseBoundsForRange(text, fieldRange);
      const actualPrefix = text
        .slice(clause.startCodePoint, fieldRange.startCodePoint)
        .join("");
      if (actualPrefix !== expectedPrefix) {
        failures.push(
          `${label} predicate context before field is not exact and adjacent.`,
        );
      }
    }
  }

  if (betweenValueAndMatchingRoute.length > 0) {
    const expectedBridge = betweenValueAndMatchingRoute.join("");
    if (
      !valueRange ||
      !matchingRouteRange ||
      valueRange.messageId !== matchingRouteRange.messageId ||
      valueRange.endCodePoint > matchingRouteRange.startCodePoint ||
      !spansShareSourceClause(
        valueRange,
        matchingRouteRange,
        sourceMessages,
      )
    ) {
      failures.push(
        `${label} predicate context between value and matching route is not exact.`,
      );
    } else {
      const text = Array.from(sourceMessages[valueRange.messageId]);
      const actualBridge = text
        .slice(
          valueRange.endCodePoint,
          matchingRouteRange.startCodePoint,
        )
        .join("");
      if (actualBridge !== expectedBridge) {
        failures.push(
          `${label} predicate context between value and matching route is not exact.`,
        );
      }
    }
  }
}

function sourceTermRangeForRole(entry, contract, sourceMessages) {
  const term = Array.from(contract.term);
  const ranges = [];
  for (const leaf of roleLeaves(entry, contract.role)) {
    if (
      leaf.advisoryHint !== contract.hint ||
      !canonicalEquals(leaf.quote, contract.term) ||
      !isRecord(leaf.sourceSpan) ||
      typeof sourceMessages[leaf.sourceSpan.messageId] !== "string"
    ) {
      continue;
    }
    const source = Array.from(sourceMessages[leaf.sourceSpan.messageId]);
    const first = leaf.sourceSpan.startCodePoint;
    const last = leaf.sourceSpan.endCodePoint - term.length;
    for (let start = first; start <= last; start += 1) {
      if (source.slice(start, start + term.length).join("") !== contract.term) {
        continue;
      }
      ranges.push({
        messageId: leaf.sourceSpan.messageId,
        startCodePoint: start,
        endCodePoint: start + term.length,
      });
    }
  }
  return ranges.length === 1 ? ranges[0] : null;
}

function sourceClauseBoundsForRange(text, range) {
  let startCodePoint = range.startCodePoint;
  while (
    startCodePoint > 0 &&
    !/[.!?。！？；;\n]/u.test(text[startCodePoint - 1])
  ) {
    startCodePoint -= 1;
  }
  let endCodePoint = range.endCodePoint;
  while (
    endCodePoint < text.length &&
    !/[.!?。！？；;\n]/u.test(text[endCodePoint])
  ) {
    endCodePoint += 1;
  }
  return { startCodePoint, endCodePoint };
}

function attachmentRequirementHint(requirementMode) {
  if (requirementMode === "required") return "true";
  if (requirementMode === "optional") return "false";
  return requirementMode;
}

// A condition is identified by its predicate (what is tested, how, against
// which value), as other entities are identified by their name. Routes remain
// exact detail checks on the matched pair.
function conditionContractMatchesEntry(expected, entry) {
  return [
    roleContract("field", expected.field),
    expected.operator,
    roleContract("value", expected.value),
  ].every((contract) => hasRoleContract(entry, contract));
}

function matchRoleContractsOneToOne({
  label,
  expected,
  entries,
  matches,
  mergedLabelTerm = null,
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
    else if (
      mergedLabelTerm &&
      entries.some((entry) =>
        labelMergesExpectedSiblings(
          entry,
          mergedLabelTerm(expected[expectedIndex]),
          expected.map(mergedLabelTerm),
        ),
      )
    ) {
      // Partial credit only: the source meaning was captured, but as one
      // reviewed entity where the contract has two, so the strict gate fails.
      matchedCount += 1;
      failures.push(
        `Reviewed ${label} entity was merged with a sibling at index ${expectedIndex}.`,
      );
    } else
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

// "start and end dates" covering the reviewed terms "start" and "end dates":
// a label that is exactly two coordinated conjuncts, each an expected sibling.
function labelMergesExpectedSiblings(entry, term, siblingTerms) {
  return roleLeaves(entry, "label").some((leaf) => {
    const text = String(leaf.quote).normalize("NFKC").trim();
    const parts =
      text.match(/^(.+?)\s+and\s+(.+)$/iu) ?? text.match(/^(.+?)[及和與与、](.+)$/u);
    if (!parts) return false;
    const [left, right] = [parts[1], parts[2]];
    const isSibling = (part) =>
      siblingTerms.some((sibling) =>
        templateCopilotV3LiveSemanticLabelEquivalent(part, sibling),
      );
    return (
      (templateCopilotV3LiveSemanticLabelEquivalent(left, term) && isSibling(right)) ||
      (templateCopilotV3LiveSemanticLabelEquivalent(right, term) && isSibling(left))
    );
  });
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
        roleTermMatches(role, leaf.quote, contract.term) &&
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

function canonicalEquals(left, right) {
  return canonicalSemanticText(left) === canonicalSemanticText(right);
}

// Words that only say what kind of input a name refers to (an input control,
// a yes/no question frame, a file format that is scored separately, or the
// in-app "native" marker). A label and its reviewed term may differ by exactly
// one of them, before or after ("auto-renewal choice", "是否法定要求",
// "business-case" for "business-case PDF"). Anything else (numbers, operators,
// negation, other nouns) must still match exactly. Fixed list, so scoring
// stays deterministic.
const labelFillerWords = Object.freeze([
  "the",
  "choice",
  "option",
  "selection",
  "field",
  "checkbox",
  "flag",
  "native",
  "pdf",
  "excel",
  "選項",
  "选项",
  "選擇",
  "选择",
  "欄位",
  "栏位",
  "字段",
  "原生",
  "相關",
  "相关",
  "是否",
  "是否有",
  "是否需",
  "是否需要",
  "是否包含",
  "是否含",
  "是否可",
]);
const labelFillerSet = new Set(labelFillerWords.map(canonicalSemanticText));

function differsByOneFiller(longer, shorter) {
  if (shorter.length === 0 || longer.length <= shorter.length) return false;
  if (longer.startsWith(shorter)) {
    return labelFillerSet.has(longer.slice(shorter.length));
  }
  if (longer.endsWith(shorter)) {
    return labelFillerSet.has(longer.slice(0, longer.length - shorter.length));
  }
  return false;
}

export function templateCopilotV3LiveSemanticLabelEquivalent(quote, term) {
  const label = canonicalSemanticText(quote);
  const expected = canonicalSemanticText(term);
  if (expected.length === 0) return false;
  return (
    label === expected ||
    differsByOneFiller(label, expected) ||
    differsByOneFiller(expected, label)
  );
}

// A currency word may lead a value whose currency is scored separately
// ("港幣一億元" for "一億元"); the amount itself must match exactly.
const valueCurrencyPrefixes = Object.freeze(
  ["hkd", "hk$", "港幣", "港币"].map(canonicalSemanticText),
);

function valueEquivalent(quote, term) {
  const value = canonicalSemanticText(quote);
  const expected = canonicalSemanticText(term);
  return (
    value === expected ||
    valueCurrencyPrefixes.some((prefix) => value === prefix + expected)
  );
}

function roleTermMatches(role, quote, term) {
  if (role === "label" || role === "field" || role === "participant") {
    return templateCopilotV3LiveSemanticLabelEquivalent(quote, term);
  }
  if (role === "value") return valueEquivalent(quote, term);
  return canonicalEquals(quote, term);
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
    if (["false", "optional_conditional"].includes(hint)) {
      return optional;
    }
    if (optional) return false;
    const requirementMarker =
      /\b(?:must|required|requires?|mandatory|upload|attach|submit|provide|include|fill|add)\b|必須填寫|必须填写|必須提供|必须提供|必須上載|必须上传|須上載|须上传|要上載|要上传|必須提交|必须提交|須提交|须提交|必須附上|必须附上|必須|必须|需要|必填|上載|上传|提交|附上|提供|填寫|填写|要填|須填|须填|須|须/u.test(
        meaning,
      );
    // A conditional requirement may be evidenced by its condition ("出售时",
    // "if high-risk work is Yes") instead of the requirement word.
    const conditionMarker =
      hint !== "true" &&
      /\b(?:if|when|where|unless)\b|若|如果|如屬|如属|涉及|時$|时$|時，|时，/u.test(meaning);
    return requirementMarker || conditionMarker;
  }
  if (kind === "attachment" && role === "kind") {
    if (hint === "form") {
      return /\b(?:native form|in-app form|in app form|native|form)\b|應用程式內表格|应用内表单|原生表格|原生表单|原生|表格|表单|填寫|填写|填/u.test(
        meaning,
      );
    }
    return /\b(?:uploaded file|spreadsheet|attachment|file|excel|csv|pdf|image|photo|text|proof|document)\b|上載檔案|上传文件|電子表格|电子表格|試算表|檔案|文件|附件|圖片|图片|相片|照片|文字|文本|證明|证明|上載|上传|補交|补交/u.test(
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
      record_update:
        /\b(?:updates?|updated|updating)\b|更新/u,
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
  if (hints.some((value) => value === "record_update")) return "record_update";
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
  if (/\b(?:updates?|updated|updating)\b|更新/u.test(text)) return "record_update";
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

const expectedGovernedHoldInventoryByScenario = Object.freeze(
  Object.fromEntries(
    Object.entries(templateCopilotV3SemanticScenarioManifests)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([scenarioId, manifest]) => [
        scenarioId,
        Object.freeze({
          language: manifest.language,
          governedHolds: Object.freeze(
            expectedGovernedHoldsForManifest(manifest).map((hold) =>
              Object.freeze({ ...hold }),
            ),
          ),
        }),
      ]),
  ),
);

export const templateCopilotV3LiveSemanticScoringContract = Object.freeze({
  expectedBatchIds: [...expectedBatchIds],
  expectedFactIds: [...expectedFactIds],
  itemFactIds: [...itemFactIds],
  observedMetricKeys: [...observedMetricKeys],
  providerRoles: [...providerRoles],
  governedHoldBlockingReasons: [...governedHoldBlockingReasons],
  forbiddenSourceText: [...forbiddenSourceText],
  expectedGovernedHoldInventoryByScenario,
  manifestVersion: templateCopilotV3SemanticManifestVersion,
  manifestCorpusFingerprint: templateCopilotV3SemanticManifestCorpusFingerprint,
  providerSlots: [...templateCopilotV3ProviderQuoteSlots],
});

export const templateCopilotV3IterativeSemanticDiagnosticContract =
  Object.freeze({
    version: templateCopilotV3IterativeSemanticDiagnosticVersion,
    classifications: [...iterativeGapClassifications],
    gapKinds: [...iterativeGapKinds],
    decisionReasonCodes: [...iterativeDecisionReasonCodes],
    expectedBatchIds: [...expectedBatchIds],
    expectedFactIds: [...expectedFactIds],
    governedHoldBlockingReasons: [...governedHoldBlockingReasons],
    questionMetricKeys: [...iterativeQuestionMetricKeys],
    resultKeys: [
      "version",
      "gaps",
      "decisions",
      "recoveryBatchIds",
      "questions",
      "metrics",
    ],
  });
