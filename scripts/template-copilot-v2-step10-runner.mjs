import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  applyTemplateCopilotV2AtomicDecision,
  applyTemplateCopilotV2FactTransition,
  createTemplateCopilotV2Ledger,
  templateCopilotFactIds,
  templateCopilotV2LedgerSchema,
} from "../src/lib/template-copilot-facts.ts";
import {
  adaptTemplateCopilotV2ProviderCandidates,
  confirmTemplateCopilotV2Candidate,
  projectTemplateCopilotV2Candidates,
  resolveTemplateCopilotV2CommittedExtractionConflict,
  templateCopilotV2DefaultOpenRouterModel,
} from "../src/lib/template-copilot-v2-candidates.ts";
import {
  getTemplateCopilotV2InterviewState,
} from "../src/lib/template-copilot-question-library.ts";
import {
  candidatesFromTemplateCopilotV2SourceSnapshot,
  templateCopilotV2ModeCopy,
} from "../src/lib/template-copilot-v2-modes.ts";
import {
  createTemplateCopilotV2SourceSnapshot,
} from "../src/lib/template-copilot-v2-source-snapshot.ts";
import {
  compileTemplateCopilotV2AuthoringArtifacts,
  validateTemplateCopilotV2DraftCompilation,
} from "../src/lib/template-copilot-v2-draft-compiler.ts";
import { getTemplateCopilotReadiness } from "../src/lib/template-copilot-readiness.ts";
import {
  assertTemplateCopilotV2TelemetryMinimized,
  buildTemplateCopilotV2Step10CoreMatrix,
  templateCopilotV2Step10FailClosedFeatureFixtures,
  templateCopilotV2Step10WorkflowFixtures,
} from "../src/lib/template-copilot-v2-step10-qualification.ts";
import {
  simulateTemplateAuthoringDefinition,
  validateTemplateAuthoringDefinition,
} from "../src/lib/template-authoring-validation.ts";

const enabled = { enabled: true };
const actorId = "33333333-3333-4333-8333-333333333333";
const businessUnitId = "11111111-1111-4111-8111-111111111111";
const departmentId = "22222222-2222-4222-8222-222222222222";
const sourceSessionId = "44444444-4444-4444-8444-444444444444";
const generatedAt = "2026-07-30T00:00:00Z";
const syntheticTelemetrySecret = "step10-synthetic-telemetry-secret-v1";
const actorPseudonym = `hmac-sha256:${createHmac("sha256", syntheticTelemetrySecret).update("actor:step10-synthetic-author").digest("hex")}`;
const sessionPseudonym = `hmac-sha256:${createHmac("sha256", syntheticTelemetrySecret).update(`session:${sourceSessionId}`).digest("hex")}`;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function same(left, right) {
  return hash(left) === hash(right);
}

function provenance(sourceId) {
  return [{ kind: "human_editor", sourceId, sourceMessageIds: [] }];
}

function canonicalValues(workflow, locale) {
  const firstStage = "Department manager";
  const parallel = workflow.featureCodes.includes("parallel_approval");
  const stages = [{
    label: firstStage,
    kind: "approval",
    participant: { mode: "directory_position", value: "Department Manager" },
    sequence: 1,
  }];
  if (parallel) {
    stages.push({
      label: "Finance reviewer",
      kind: "approval",
      participant: { mode: "directory_position", value: "Finance Reviewer" },
      sequence: 1,
    });
  }
  if (workflow.featureCodes.includes("fyi")) {
    stages.push({
      label: "Records FYI",
      kind: "for_information",
      participant: { mode: "directory_position", value: "Records Clerk" },
      sequence: 2,
    });
  }
  const title = workflow.titles[locale];
  const purpose = locale === "zh-Hant"
    ? `在作出承諾前審閱${title}申請。`
    : locale === "zh-Hans"
      ? `在作出承诺前审核${title}申请。`
      : `Review ${title} requests before commitment.`;
  return {
    "workflow.name": title,
    "workflow.purpose": purpose,
    "workflow.scope": {
      description: `Requests governed by ${workflow.workflowId}.`,
      rules: ["Emergency or out-of-scope requests use their approved separate process."],
    },
    "request.initiator_policy": {
      mode: "any_employee",
      description: "Any employee may submit.",
    },
    "request.fields": [
      { label: "Amount", type: "currency", required: true, options: [workflow.currency] },
      { label: "Business reason", type: "long_text", required: true, options: [] },
    ],
    "attachments.requirements": [{
      id: "supporting_evidence",
      label: "Supporting evidence",
      kind: "attachment",
      required: true,
      formats: ["pdf"],
      minimumQuantity: 1,
      maximumQuantity: 3,
      maximumFileSizeMb: 10,
      stage: "request_submission",
      contributorPolicy: workflow.featureCodes.includes("shared_submission")
        ? "allow_invited_contributors"
        : "requester_only",
      confirmationPolicy: "none",
    }],
    "workflow.stages": stages,
    "workflow.conditions": [{
      id: "amount_route",
      sequence: 1,
      field: "Amount",
      operator: ">",
      value: workflow.threshold,
      currency: workflow.currency,
      matchingRoute: `stage:${firstStage}`,
      otherwiseRoute:
        workflow.featureCodes.includes("fyi") && !parallel
          ? "stage:Records FYI"
          : "complete",
    }],
    "workflow.rejection_policy": { action: "return_for_correction" },
    "collaboration.policy": {
      description: "The requester corrects returned information.",
      rules: ["Keep the prior submission and correction history."],
    },
    "timing.rules": { defaultDueHours: 24 },
    "visibility.policy": {
      description: "Approved participant visibility.",
      rules: ["status:participants", "fields:all", "documents:required_for_node"],
    },
    "notifications.rules": [],
    "governance.owner": `${workflow.departmentCode} department`,
    "governance.policies": ["Annual human review before any change is published."],
    "governance.retention": {
      period: "2555 days",
      rationale: "Corporate audit requirement.",
    },
  };
}

function createLedger(workflow, locale) {
  return createTemplateCopilotV2Ledger({
    businessUnitId,
    businessName: "Synthetic Qualification Business",
    departmentId,
    departmentName: "Synthetic Qualification Department",
    locale,
    questionLibraryVersion: "v2.2",
  }, enabled);
}

function providerTextCandidate(factId, value, ambiguity = "none", ambiguityNote) {
  return {
    candidates: [{
      factId,
      valueType: "text",
      value,
      evidence: value,
      confidence: ambiguity === "none" ? "high" : "low",
      ambiguity,
      ...(ambiguityNote ? { ambiguityNote } : {}),
    }],
  };
}

function providerTypedCandidate({
  factId,
  valueType,
  value,
  evidence,
  ambiguity = "none",
  ambiguityNote,
}) {
  return {
    candidates: [{
      factId,
      valueType,
      value,
      evidence,
      confidence: ambiguity === "none" ? "high" : "low",
      ambiguity,
      ...(ambiguityNote ? { ambiguityNote } : {}),
    }],
  };
}

function exerciseProviderBoundary(ledger, qualificationCase, workflow, values) {
  const beforeHash = hash(ledger);
  let adapterInvoked = false;
  let normalization = { candidates: [], rejected: [] };
  if (qualificationCase.providerOutcome === "success") {
    adapterInvoked = true;
    normalization = adaptTemplateCopilotV2ProviderCandidates({
      output: providerTextCandidate("workflow.name", values["workflow.name"]),
      message: values["workflow.name"],
      messageId: `provider:${qualificationCase.caseId}`,
    });
  } else if (qualificationCase.providerOutcome === "malformed_output") {
    adapterInvoked = true;
    normalization = adaptTemplateCopilotV2ProviderCandidates({
      output: { candidates: [{ factId: "not.allowed", value: "unsafe" }] },
      message: "unsafe",
      messageId: `provider:${qualificationCase.caseId}`,
    });
  }
  return {
    normalization,
    adapterInvoked,
    authoritativeLedgerUnchanged: beforeHash === hash(ledger),
    fallbackRequired: qualificationCase.providerOutcome !== "success",
    routeDecision:
      qualificationCase.providerOutcome === "privacy_route_rejected"
        ? "rejected_before_provider"
        : qualificationCase.providerOutcome === "outage"
          ? "provider_unavailable"
          : qualificationCase.providerOutcome === "timeout"
            ? "provider_timeout"
            : qualificationCase.providerOutcome === "malformed_output"
              ? "schema_rejected"
              : "provider_success",
  };
}

function questionContract(state, locale) {
  if (state.state !== "question") return null;
  const question = state.nextQuestion;
  const copy = templateCopilotV2ModeCopy(locale);
  return {
    questionId: question.questionId,
    promptPresent: question.prompt.trim().length > 0,
    helpControlPresent:
      question.helpLabel.trim().length > 0 && question.helpBody.trim().length > 0,
    interactionLabelsPresent: Boolean(
      question.interaction?.labels &&
      Object.values(question.interaction.labels).every(
        (label) => typeof label === "string" && label.trim().length > 0,
      ),
    ),
    modeSwitchLabelPresent: copy.switch.trim().length > 0,
  };
}

function answerSelectedQuestion(ledger, state, sourceId) {
  if (state.state !== "question") return ledger;
  const question = state.nextQuestion;
  const preferred = question.options?.find((option) => option.optionId === "no")
    || question.options?.[0];
  const answer = question.answerType === "choice" && preferred
    ? { kind: "choice", optionId: preferred.optionId, display: preferred.label }
    : { kind: "text", text: "Synthetic qualification answer" };
  return applyTemplateCopilotV2AtomicDecision({
    ledger,
    decisionId: question.primaryDecisionId,
    answer,
    provenance: provenance(sourceId),
    answeredAt: generatedAt,
    flag: enabled,
  });
}

function commitCandidate(ledger, candidateId, revision) {
  return confirmTemplateCopilotV2Candidate({
    ledger,
    candidateId,
    actorId,
    confirmedAt: generatedAt,
    beforeRevision: revision,
  });
}

function applyFact(ledger, factId, operation, canonicalValue, sourceId) {
  return applyTemplateCopilotV2FactTransition({
    ledger,
    factId,
    transition: {
      operation,
      payload: { canonicalValue: structuredClone(canonicalValue), provenance: provenance(sourceId) },
    },
    actorId,
    confirmedAt: generatedAt,
    flag: enabled,
  });
}

function applyEntryMode({
  ledger: input,
  qualificationCase,
  workflow,
  providerBoundary,
  revision,
}) {
  let ledger = input;
  const selectedQuestionIds = [];
  const contracts = [];
  const initial = getTemplateCopilotV2InterviewState(ledger);
  if (initial.state === "question") {
    selectedQuestionIds.push(initial.nextQuestion.questionId);
    contracts.push(questionContract(initial, qualificationCase.locale));
  }
  let candidateConfirmations = 0;
  let sourceCandidateCount = 0;
  let guidedFallbackUsed = false;
  if (qualificationCase.mode === "describe_everything" && !providerBoundary.fallbackRequired) {
    const projected = projectTemplateCopilotV2Candidates({
      ledger,
      candidates: providerBoundary.normalization.candidates,
    });
    ledger = projected.ledger;
    const candidate = ledger.extractionEvidence.candidates.find(
      (item) => item.factId === "workflow.name" && item.state === "open",
    );
    if (candidate) {
      ledger = commitCandidate(ledger, candidate.candidateId, revision);
      revision += 1;
      candidateConfirmations += 1;
    }
  } else if (qualificationCase.mode === "similar_template") {
    const snapshot = createTemplateCopilotV2SourceSnapshot({
      id: "55555555-5555-4555-8555-555555555555",
      version_number: 7,
      template_key: `source-${workflow.workflowId}`,
      updated_at: generatedAt,
      business_name: "Synthetic Qualification Business",
      department_name: "Synthetic Qualification Department",
      template_snapshot: {
        name: canonicalValues(workflow, qualificationCase.locale)["workflow.name"],
        fields: [],
        documents: [],
      },
    });
    const candidates = candidatesFromTemplateCopilotV2SourceSnapshot(snapshot);
    sourceCandidateCount = candidates.length;
    ledger = projectTemplateCopilotV2Candidates({ ledger, candidates }).ledger;
    const candidate = ledger.extractionEvidence.candidates.find(
      (item) => item.factId === "workflow.name" && item.state === "open",
    );
    if (candidate) {
      ledger = commitCandidate(ledger, candidate.candidateId, revision);
      revision += 1;
      candidateConfirmations += 1;
    }
  } else {
    guidedFallbackUsed =
      qualificationCase.mode === "describe_everything" &&
      providerBoundary.fallbackRequired;
    ledger = answerSelectedQuestion(
      ledger,
      initial,
      guidedFallbackUsed ? "guided:fallback" : "guided:answer",
    );
    revision += 1;
  }
  const after = getTemplateCopilotV2InterviewState(ledger);
  if (after.state === "question") {
    selectedQuestionIds.push(after.nextQuestion.questionId);
    contracts.push(questionContract(after, qualificationCase.locale));
  }
  return {
    ledger,
    revision,
    selectedQuestionIds,
    contracts,
    candidateConfirmations,
    sourceCandidateCount,
    guidedFallbackUsed,
  };
}

function ambiguityText(fixture) {
  if (fixture === "everyone") return "everyone";
  if (fixture === "one_week") return "one week";
  if (fixture === "over_one_million") return "over one million";
  return null;
}

function exerciseAmbiguity(ledger, qualificationCase, revision) {
  const text = ambiguityText(qualificationCase.ambiguityFixture);
  if (!text) return { ledger, revision, attempted: false, rejected: true };
  const normalized = adaptTemplateCopilotV2ProviderCandidates({
    output: providerTextCandidate(
      "workflow.purpose",
      text,
      "ambiguous",
      "The phrase cannot safely determine a person, duration rule, or numeric threshold.",
    ),
    message: text,
    messageId: `ambiguity:${qualificationCase.caseId}`,
  });
  ledger = projectTemplateCopilotV2Candidates({
    ledger,
    candidates: normalized.candidates,
  }).ledger;
  const candidate = ledger.extractionEvidence.candidates.find(
    (item) => item.factId === "workflow.purpose" && item.state === "open",
  );
  let rejected = false;
  if (candidate) {
    try {
      commitCandidate(ledger, candidate.candidateId, revision);
    } catch {
      rejected = true;
    }
  }
  return {
    ledger,
    revision: revision + 1,
    attempted: Boolean(candidate),
    rejected,
  };
}

function exerciseAnswerProfile(ledger, qualificationCase, values, revision) {
  let conflictOutcome = "none";
  let profileEvidenceCount = 0;
  const evidence = {
    unknownTransitionObserved: false,
    candidateConfirmed: false,
    mixedLanguageSourceUsed: false,
    typoValueCommitted: false,
    fragmentedMessageCount: 0,
    preCompletionOwnerStaleHistoryCount: 0,
  };
  const owner = values["governance.owner"];
  const source = `profile:${qualificationCase.answerProfile}`;
  if (qualificationCase.answerProfile === "uncertain") {
    ledger = applyTemplateCopilotV2FactTransition({
      ledger,
      factId: "governance.owner",
      transition: { operation: "mark_unknown" },
      actorId,
      confirmedAt: generatedAt,
      flag: enabled,
    });
    revision += 1;
    evidence.unknownTransitionObserved =
      ledger.facts["governance.owner"].status === "unknown";
  } else if (qualificationCase.answerProfile === "conflicting") {
    if (ledger.facts["workflow.name"].status !== "committed") {
      ledger = applyFact(ledger, "workflow.name", "human_commit", values["workflow.name"], source);
      revision += 1;
    }
    const alternative = `${values["workflow.name"]}-alternate`;
    const normalized = adaptTemplateCopilotV2ProviderCandidates({
      output: providerTextCandidate("workflow.name", alternative),
      message: alternative,
      messageId: `${source}:${qualificationCase.caseId}`,
    });
    const projected = projectTemplateCopilotV2Candidates({
      ledger,
      candidates: normalized.candidates,
    });
    ledger = projected.ledger;
    const conflict = ledger.extractionEvidence.conflicts.find(
      (item) => item.factId === "workflow.name" && item.state === "open",
    );
    if (conflict) {
      ledger = resolveTemplateCopilotV2CommittedExtractionConflict({
        ledger,
        conflictId: conflict.conflictId,
        resolution: "keep_existing",
        actorId,
        confirmedAt: generatedAt,
        beforeRevision: revision,
        rationale: "Pinned human-approved name remains authoritative.",
      });
      revision += 1;
      conflictOutcome = "human_kept_existing";
      profileEvidenceCount += 1;
    }
  } else if (["fragmented", "typo_heavy", "mixed_language"].includes(
    qualificationCase.answerProfile,
  )) {
    const candidateValue = qualificationCase.answerProfile === "typo_heavy"
      ? `${owner} typo`
      : owner;
    const message = qualificationCase.answerProfile === "mixed_language"
      ? `部門 owner: ${candidateValue}`
      : candidateValue;
    const normalized = adaptTemplateCopilotV2ProviderCandidates({
      output: providerTextCandidate("governance.owner", candidateValue),
      message,
      messageId: `${source}:${qualificationCase.caseId}`,
    });
    const projected = projectTemplateCopilotV2Candidates({
      ledger,
      candidates: normalized.candidates,
    });
    ledger = projected.ledger;
    const candidate = ledger.extractionEvidence.candidates.find(
      (item) => item.factId === "governance.owner" && item.state === "open",
    );
    if (candidate) {
      ledger = commitCandidate(ledger, candidate.candidateId, revision);
      revision += 1;
      profileEvidenceCount += 1;
      evidence.candidateConfirmed = true;
      if (qualificationCase.answerProfile === "fragmented") {
        evidence.fragmentedMessageCount += 1;
      }
      evidence.mixedLanguageSourceUsed =
        qualificationCase.answerProfile === "mixed_language" &&
        /[\u3400-\u9fff]/u.test(message);
      evidence.typoValueCommitted =
        qualificationCase.answerProfile === "typo_heavy" &&
        ledger.facts["governance.owner"].canonicalValue === candidateValue;
    }
    if (qualificationCase.answerProfile === "fragmented") {
      const policies = values["governance.policies"];
      const policyMessage = policies.join(" ");
      const normalizedPolicy = adaptTemplateCopilotV2ProviderCandidates({
        output: providerTypedCandidate({
          factId: "governance.policies",
          valueType: "policy",
          value: policies,
          evidence: policies,
        }),
        message: policyMessage,
        messageId: `${source}:policy:${qualificationCase.caseId}`,
      });
      const projectedPolicy = projectTemplateCopilotV2Candidates({
        ledger,
        candidates: normalizedPolicy.candidates,
      });
      ledger = projectedPolicy.ledger;
      const policyCandidate = ledger.extractionEvidence.candidates.find(
        (item) =>
          item.factId === "governance.policies" &&
          item.state === "open",
      );
      if (policyCandidate) {
        ledger = commitCandidate(ledger, policyCandidate.candidateId, revision);
        revision += 1;
        profileEvidenceCount += 1;
        evidence.fragmentedMessageCount += 1;
      }
    }
  } else if (qualificationCase.answerProfile === "correction_heavy") {
    ledger = applyFact(
      ledger,
      "governance.owner",
      "human_commit",
      "Temporary process owner",
      source,
    );
    revision += 1;
    ledger = applyFact(
      ledger,
      "governance.owner",
      "human_replace",
      "Corrected process owner",
      source,
    );
    revision += 1;
  }
  evidence.preCompletionOwnerStaleHistoryCount =
    ledger.facts["governance.owner"].staleHistory.length;
  return {
    ledger,
    revision,
    conflictOutcome,
    profileEvidenceCount,
    evidence,
  };
}

function completeThroughTransitions(ledger, workflow, values, revision) {
  for (const factId of templateCopilotFactIds) {
    if (factId === "notifications.rules") {
      if (ledger.facts[factId].status !== "not_applicable") {
        ledger = applyTemplateCopilotV2FactTransition({
          ledger,
          factId,
          transition: {
            operation: "mark_not_applicable",
            reason: "This qualification fixture does not send messages.",
          },
          actorId,
          confirmedAt: generatedAt,
          flag: enabled,
        });
        revision += 1;
      }
      continue;
    }
    if (
      factId === "workflow.conditions" &&
      workflow.featureCodes.includes("parallel_approval") &&
      !workflow.featureCodes.includes("conditional_route") &&
      !workflow.featureCodes.includes("dual_path")
    ) {
      if (ledger.facts[factId].status !== "not_applicable") {
        ledger = applyTemplateCopilotV2FactTransition({
          ledger,
          factId,
          transition: {
            operation: "mark_not_applicable",
            reason: "This simultaneous-review fixture has no conditional route.",
          },
          actorId,
          confirmedAt: generatedAt,
          flag: enabled,
        });
        revision += 1;
      }
      continue;
    }
    const current = ledger.facts[factId];
    if (current.status === "committed" && same(current.canonicalValue, values[factId])) {
      continue;
    }
    const operation = current.status === "committed" ? "human_replace" : "human_commit";
    ledger = applyFact(
      ledger,
      factId,
      operation,
      values[factId],
      `fixture:${workflow.workflowId}:${factId}`,
    );
    revision += 1;
  }
  return { ledger: templateCopilotV2LedgerSchema.parse(ledger), revision };
}

function exerciseRejectedMutation(ledger, values) {
  const before = hash(ledger);
  let rejected = false;
  try {
    applyTemplateCopilotV2FactTransition({
      ledger,
      factId: "workflow.scope",
      transition: {
        operation: "human_replace",
        payload: {
          canonicalValue: values["workflow.scope"],
          provenance: provenance("forbidden:actor"),
        },
      },
      actorId: "not-an-authorized-uuid",
      confirmedAt: generatedAt,
      flag: enabled,
    });
  } catch {
    rejected = true;
  }
  return { rejected, authoritativeLedgerUnchanged: before === hash(ledger) };
}

function representedFeatures(workflow, ledger) {
  const values = Object.fromEntries(
    templateCopilotFactIds.map((factId) => [factId, ledger.facts[factId].canonicalValue]),
  );
  const stages = Array.isArray(values["workflow.stages"]) ? values["workflow.stages"] : [];
  const attachments = Array.isArray(values["attachments.requirements"])
    ? values["attachments.requirements"]
    : [];
  const represented = {
    conditional_route: ledger.facts["workflow.conditions"].status === "committed",
    parallel_approval: new Set(stages.map((stage) => stage.sequence)).size < stages.length,
    dual_path: ledger.facts["workflow.conditions"].status === "committed",
    attachment: attachments.length > 0,
    native_form: attachments.some((item) => item.kind === "form"),
    information_handoff: Boolean(values["visibility.policy"]),
    document_handoff:
      attachments.length > 0 &&
      values["visibility.policy"]?.rules?.includes("documents:required_for_node"),
    fyi: stages.some((stage) => stage.kind === "for_information"),
    correction_loop:
      values["workflow.rejection_policy"]?.action === "return_for_correction",
    shared_submission: attachments.some(
      (item) => item.contributorPolicy === "allow_invited_contributors",
    ),
  };
  return workflow.featureCodes.filter((feature) => represented[feature]);
}

function runFailClosedFeatureFixtures() {
  const base = templateCopilotV2Step10WorkflowFixtures.find(
    (workflow) => workflow.workflowId === "workflow_expense_exception",
  );
  const parallelBase = templateCopilotV2Step10WorkflowFixtures.find(
    (workflow) => workflow.workflowId === "workflow_purchase_requisition",
  );
  if (!base || !parallelBase) throw new Error("Missing Step 10 fail-closed fixture base.");

  const formValues = canonicalValues(base, "en");
  formValues["attachments.requirements"] = [{
    id: "native_approval_form",
    label: "Native approval form",
    kind: "form",
    required: true,
    formats: [],
    minimumQuantity: 1,
    maximumQuantity: 1,
    stage: "request_submission",
    contributorPolicy: "requester_only",
    confirmationPolicy: "none",
  }];
  const formCompleted = completeThroughTransitions(
    createLedger(base, "en"),
    base,
    formValues,
    1,
  );
  const formIssues = validateTemplateCopilotV2DraftCompilation(
    formCompleted.ledger,
  );

  const combinedWorkflow = {
    ...parallelBase,
    featureCodes: [
      "conditional_route",
      "parallel_approval",
      "attachment",
      "information_handoff",
    ],
  };
  const combinedValues = canonicalValues(combinedWorkflow, "en");
  const combinedCompleted = completeThroughTransitions(
    createLedger(combinedWorkflow, "en"),
    combinedWorkflow,
    combinedValues,
    1,
  );
  const combinedIssues = validateTemplateCopilotV2DraftCompilation(
    combinedCompleted.ledger,
  );
  return {
    native_form_without_field_definitions: {
      blocked: formIssues.some((issue) => issue.code === "form_fields_required"),
      issueCodes: formIssues.map((issue) => issue.code),
    },
    conditional_parallel_route_not_representable: {
      blocked: combinedIssues.some(
        (issue) => issue.code === "condition_targets_parallel_member",
      ),
      issueCodes: combinedIssues.map((issue) => issue.code),
    },
  };
}

function behaviorProjection(compiled, simulations) {
  const graph = compiled.definition.template.graph;
  return {
    requestFields: compiled.definition.template.fields.map((field) => ({
      id: field.id,
      type: field.type,
      required: field.required,
      options: field.options,
    })),
    documents: compiled.definition.template.documents.map((document) => ({
      id: document.id,
      type: document.documentType,
      required: document.required,
      format: document.format,
      inputMode: document.inputMode,
    })),
    graph: {
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        dueInHours: node.dueInHours,
        conditionCases: node.conditionCases?.map((conditionCase) => ({
          id: conditionCase.id,
          isFallback: conditionCase.isFallback,
          isApprovalCount: conditionCase.isApprovalCount,
          approvalRule: conditionCase.approvalRule,
          numericRule: conditionCase.numericRule,
          join: conditionCase.join,
          targetNodeIds: conditionCase.targetNodeIds,
        })),
      })),
      edges: graph.edges.map((edge) => ({
        source: edge.sourceId,
        target: edge.targetId,
        branchType: edge.branchType,
        rule: edge.rule,
      })),
    },
    routes: {
      highAmount: simulations.high.route,
      lowAmount: simulations.low.route,
    },
  };
}

function expectedFactMismatches(ledger, workflow, values) {
  return templateCopilotFactIds.filter((factId) => {
    if (factId === "notifications.rules") {
      return ledger.facts[factId].status !== "not_applicable";
    }
    if (
      factId === "workflow.conditions" &&
      workflow.featureCodes.includes("parallel_approval") &&
      !workflow.featureCodes.includes("conditional_route") &&
      !workflow.featureCodes.includes("dual_path")
    ) {
      return ledger.facts[factId].status !== "not_applicable";
    }
    return (
      ledger.facts[factId].status !== "committed" ||
      !same(ledger.facts[factId].canonicalValue, values[factId])
    );
  });
}

function traceFor({
  qualificationCase,
  workflow,
  ledger,
  revision,
  entry,
  providerBoundary,
  ambiguity,
  profile,
  rejectedMutation,
  intermediateReadiness,
  compiled,
  simulations,
  readiness,
  validation,
  compilerIssues,
}) {
  const workflowIndex = templateCopilotV2Step10WorkflowFixtures.findIndex(
    (item) => item.workflowId === qualificationCase.workflowId,
  );
  const expectedValues = canonicalValues(workflow, qualificationCase.locale);
  const mismatches = expectedFactMismatches(ledger, workflow, expectedValues);
  const silentOverwriteFactIds = templateCopilotFactIds.filter((factId) => {
    const fact = ledger.facts[factId];
    return fact.confirmation?.operation === "human_replace" && fact.staleHistory.length === 0;
  });
  const falseComplete =
    readiness.publication === "ready" &&
    (mismatches.length > 0 ||
      !validation.valid ||
      compilerIssues.some((issue) => issue.blockingLevel === "publication"));
  const hasCondition = ledger.facts["workflow.conditions"].status === "committed";
  const routeOraclePassed = hasCondition
    ? simulations.high.route.activeBranchId?.endsWith("-matched") &&
      simulations.low.route.activeBranchId?.endsWith("-fallback") &&
      !same(simulations.high.route, simulations.low.route)
    : same(simulations.high.route, simulations.low.route);
  const terminalOraclePassed = hasCondition
    ? simulations.low.route.terminalNodeId !== null
    : simulations.high.route.currentNodeIds.length > 0 &&
      simulations.low.route.currentNodeIds.length > 0;
  const recovered = providerBoundary.fallbackRequired && entry.guidedFallbackUsed;
  const eventId = `a1100000-${String(workflowIndex + 1).padStart(4, "0")}-4000-8000-${String(
    qualificationCase.repetition +
      ["en", "zh-Hant", "zh-Hans"].indexOf(qualificationCase.locale) * 3,
  ).padStart(12, "0")}`;
  const telemetry = assertTemplateCopilotV2TelemetryMinimized({
    schemaVersion: 1,
    eventId,
    occurredAt: generatedAt,
    sessionPseudonym,
    actorPseudonym,
    locale: qualificationCase.locale,
    mode: qualificationCase.mode,
    eventType: "provider_call_completed",
    revision,
    outcomeCode: providerBoundary.routeDecision,
    provider: {
      providerCode: "openrouter",
      modelCode: templateCopilotV2DefaultOpenRouterModel.replaceAll("/", "_"),
      privacyMode: "zdr",
      outcome: qualificationCase.providerOutcome,
      latencyMs: providerBoundary.adapterInvoked ? 120 + workflowIndex : 0,
      inputTokens: providerBoundary.adapterInvoked ? 800 : 0,
      outputTokens: providerBoundary.adapterInvoked ? 240 : 0,
      estimatedCostUsd: 0,
    },
    counts: {
      selected_questions: entry.selectedQuestionIds.length,
      candidate_confirmations:
        entry.candidateConfirmations + profile.profileEvidenceCount,
      conflict_resolutions: profile.conflictOutcome === "none" ? 0 : 1,
      ambiguous_candidates_rejected: ambiguity.rejected && ambiguity.attempted ? 1 : 0,
      retries: recovered ? 1 : 0,
      compiler_errors: compilerIssues.filter((item) => item.blockingLevel === "draft").length,
      validation_errors: validation.errorCount,
    },
  });
  return {
    caseId: qualificationCase.caseId,
    workflowId: qualificationCase.workflowId,
    fixturePins: {
      fixtureVersion: qualificationCase.fixtureVersion,
      questionLibraryVersion: qualificationCase.questionLibraryVersion,
      promptVersion: qualificationCase.promptVersion,
      schemaVersion: qualificationCase.schemaVersion,
    },
    revisions: { initial: 1, committed: revision, compiledSource: revision },
    selectedQuestionIds: entry.selectedQuestionIds,
    modeEvidence: {
      selectedMode: qualificationCase.mode,
      guidedFallbackUsed: entry.guidedFallbackUsed,
      sourceCandidateCount: entry.sourceCandidateCount,
      candidateConfirmations: entry.candidateConfirmations,
    },
    answerProfile: qualificationCase.answerProfile,
    answerProfileEvidence: {
      ...profile.evidence,
      finalOwnerStaleHistoryCount:
        ledger.facts["governance.owner"].staleHistory.length,
      finalOwnerOperation:
        ledger.facts["governance.owner"].confirmation?.operation || "none",
    },
    localizedInputHash: hash({
      name: expectedValues["workflow.name"],
      purpose: expectedValues["workflow.purpose"],
    }),
    ambiguity: {
      fixture: qualificationCase.ambiguityFixture,
      candidateAttempted: ambiguity.attempted,
      unsafeConfirmationRejected: ambiguity.rejected,
    },
    conflictOutcome: profile.conflictOutcome,
    readiness: {
      intermediate: intermediateReadiness,
      final: readiness,
    },
    compiler: {
      draftBlockerCount: compilerIssues.filter((item) => item.blockingLevel === "draft").length,
      publicationBlockerCount: compilerIssues.filter((item) => item.blockingLevel === "publication").length,
      issueCodes: compilerIssues.map((item) => item.code),
      definitionHash: hash(compiled.definition),
      nodeKinds: compiled.definition.template.graph.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
      })),
    },
    validation: {
      valid: validation.valid,
      errorCount: validation.errorCount,
      warningCount: validation.warningCount,
      issueCodes: validation.issues.map((item) => item.code),
    },
    routes: {
      highAmount: simulations.high.route,
      lowAmount: simulations.low.route,
      oraclePassed: Boolean(routeOraclePassed),
      terminalOraclePassed,
    },
    provider: {
      outcome: qualificationCase.providerOutcome,
      adapterInvoked: providerBoundary.adapterInvoked,
      authoritativeLedgerUnchanged: providerBoundary.authoritativeLedgerUnchanged,
      routeDecision: providerBoundary.routeDecision,
      recoveredThroughGuidedFallback: recovered,
    },
    invalidActorSchemaCheck: rejectedMutation,
    accessibilityContracts: entry.contracts,
    representedFeatures: representedFeatures(workflow, ledger),
    missingDeclaredFeatures: workflow.featureCodes.filter(
      (feature) => !representedFeatures(workflow, ledger).includes(feature),
    ),
    factMismatches: mismatches,
    silentOverwriteFactIds,
    falseComplete,
    telemetry,
    behaviorHash: hash(behaviorProjection(compiled, simulations)),
  };
}

export function runTemplateCopilotV2Step10Qualification() {
  const matrix = buildTemplateCopilotV2Step10CoreMatrix();
  const traces = matrix.map((qualificationCase) => {
    const workflow = templateCopilotV2Step10WorkflowFixtures.find(
      (item) => item.workflowId === qualificationCase.workflowId,
    );
    if (!workflow) throw new Error(`Unknown fixture ${qualificationCase.workflowId}.`);
    const values = canonicalValues(workflow, qualificationCase.locale);
    let ledger = createLedger(workflow, qualificationCase.locale);
    let revision = 1;
    const providerBoundary = exerciseProviderBoundary(
      ledger,
      qualificationCase,
      workflow,
      values,
    );
    const entry = applyEntryMode({
      ledger,
      qualificationCase,
      workflow,
      providerBoundary,
      revision,
    });
    ledger = entry.ledger;
    revision = entry.revision;
    const ambiguity = exerciseAmbiguity(
      ledger,
      qualificationCase,
      revision,
    );
    ledger = ambiguity.ledger;
    revision = ambiguity.revision;
    const profile = exerciseAnswerProfile(
      ledger,
      qualificationCase,
      values,
      revision,
    );
    ledger = profile.ledger;
    revision = profile.revision;
    const intermediateReadiness = getTemplateCopilotReadiness(ledger, {
      compilerValid: false,
      publishedRevisionMatches: false,
    });
    const completed = completeThroughTransitions(
      ledger,
      workflow,
      values,
      revision,
    );
    ledger = completed.ledger;
    revision = completed.revision;
    const rejectedMutation = exerciseRejectedMutation(ledger, values);
    const compilerIssues = validateTemplateCopilotV2DraftCompilation(ledger);
    const compiled = compileTemplateCopilotV2AuthoringArtifacts({
      ledger,
      actorEmail: "synthetic-author@example.invalid",
      generatedAt,
      dossierId: `dossier-${workflow.workflowId}`,
      templateId: `template-${workflow.workflowId}`,
      sourceSessionId,
      sourceSessionRevision: revision,
    });
    const validation = validateTemplateAuthoringDefinition(compiled);
    const highSimulation = simulateTemplateAuthoringDefinition({
      ...compiled,
      extractedFields: { "field-amount": String(workflow.threshold + 1) },
    });
    const lowSimulation = simulateTemplateAuthoringDefinition({
      ...compiled,
      extractedFields: { "field-amount": String(Math.max(0, workflow.threshold - 1)) },
    });
    const readiness = getTemplateCopilotReadiness(ledger, {
      compilerValid: validation.valid,
      publishedRevisionMatches: false,
    });
    return traceFor({
      qualificationCase,
      workflow,
      ledger,
      revision,
      entry,
      providerBoundary,
      ambiguity,
      profile,
      rejectedMutation,
      intermediateReadiness,
      compiled,
      simulations: { high: highSimulation, low: lowSimulation },
      readiness,
      validation,
      compilerIssues,
    });
  });
  const groups = Map.groupBy(traces, (trace) =>
    trace.caseId.replace(/:(?:en|zh-Hant|zh-Hans):r[1-3]$/, ""),
  );
  const routeEquivalenceFailures = [...groups.entries()]
    .filter(([, group]) => new Set(group.map((trace) => trace.behaviorHash)).size !== 1)
    .map(([workflowId]) => workflowId);
  const failClosedFeatureFixtures = runFailClosedFeatureFixtures();
  const criticalHallucinations = traces.reduce(
    (count, trace) => count + trace.factMismatches.length,
    0,
  );
  const silentOverwrites = traces.reduce(
    (count, trace) => count + trace.silentOverwriteFactIds.length,
    0,
  );
  const falseCompleteResults = traces.filter((trace) => trace.falseComplete).length;
  const invalidActorSchemaRejectionFailures = traces.filter(
    (trace) =>
      !trace.invalidActorSchemaCheck.rejected ||
      !trace.invalidActorSchemaCheck.authoritativeLedgerUnchanged,
  ).length;
  const failures = [
    traces.length === 216 || `matrix_cardinality:${traces.length}`,
    traces.every((trace) => trace.compiler.draftBlockerCount === 0) || "draft_compiler_blocker",
    traces.every((trace) => trace.compiler.publicationBlockerCount === 0) || "publication_compiler_blocker",
    traces.every((trace) => trace.validation.valid) || "definition_invalid",
    routeEquivalenceFailures.length === 0 || "route_equivalence_failed",
    traces.every(
      (trace) =>
        trace.readiness.final.draft === "ready" &&
        trace.readiness.final.publication === "ready" &&
        trace.readiness.final.activation === "not_ready",
    ) || "readiness_invariant_failed",
    traces.every(
      (trace) =>
        trace.readiness.intermediate.draft === "not_ready" &&
        trace.readiness.intermediate.publication === "not_ready",
    ) || "intermediate_readiness_did_not_fail_closed",
    traces.every(
      (trace) =>
        trace.provider.authoritativeLedgerUnchanged &&
        (trace.provider.outcome === "success" ||
          trace.provider.recoveredThroughGuidedFallback ||
          trace.telemetry.mode !== "describe_everything"),
    ) || "provider_failure_not_fail_closed",
    traces.every((trace) =>
      trace.accessibilityContracts.every(
        (contract) =>
          contract.promptPresent &&
          contract.helpControlPresent &&
          contract.interactionLabelsPresent &&
          contract.modeSwitchLabelPresent,
      ),
    ) || "question_accessibility_contract_missing",
    traces.every((trace) => trace.missingDeclaredFeatures.length === 0) ||
      "declared_workflow_feature_not_represented",
    traces.every(
      (trace) => trace.routes.oraclePassed && trace.routes.terminalOraclePassed,
    ) || "route_or_terminal_oracle_failed",
    templateCopilotV2Step10FailClosedFeatureFixtures.every(
      (fixture) => failClosedFeatureFixtures[fixture]?.blocked,
    ) || "unsupported_feature_did_not_fail_closed",
    criticalHallucinations === 0 || `critical_hallucinations:${criticalHallucinations}`,
    silentOverwrites === 0 || `silent_overwrites:${silentOverwrites}`,
    falseCompleteResults === 0 || `false_complete:${falseCompleteResults}`,
    invalidActorSchemaRejectionFailures === 0 ||
      `invalid_actor_schema_rejection:${invalidActorSchemaRejectionFailures}`,
  ].filter((value) => typeof value === "string");
  return {
    status: failures.length ? "failed" : "passed",
    summary: {
      workflowCount: templateCopilotV2Step10WorkflowFixtures.length,
      localeCount: 3,
      repetitions: 3,
      conversationCount: traces.length,
      criticalHallucinations,
      silentOverwrites,
      falseCompleteResults,
      invalidActorSchemaRejectionFailures,
      routeEquivalenceFailures,
      failClosedFeatureFixtures,
    },
    failures,
    traces,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const result = runTemplateCopilotV2Step10Qualification();
  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      summary: result.summary,
      failures: result.failures,
    }, null, 2)}\n`,
  );
  if (result.status !== "passed") process.exitCode = 1;
}
