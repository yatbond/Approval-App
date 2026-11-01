import { createHash } from "node:crypto";
import type { TemplateCopilotAtomicAnswerInput } from "./template-copilot-question-library.ts";

export const templateCopilotV3ClarificationAuditVersion =
  "template-copilot-v3-clarification-audit.2";

export const templateCopilotV3ClarificationClassifications = Object.freeze([
  "recover_from_source",
  "ask_user",
  "governed_hold",
] as const);

export const templateCopilotV3ClarificationGapKinds = Object.freeze([
  "known_extraction_miss",
  "provider_failure",
  "genuine_ambiguity",
  "governed_semantics",
  "unclassified",
] as const);

export const templateCopilotV3ClarificationBlockingReasons = Object.freeze([
  "compound_predicate_not_executable",
  "unsupported_semantics_not_executable",
] as const);

export type TemplateCopilotV3ClarificationClassification =
  (typeof templateCopilotV3ClarificationClassifications)[number];
export type TemplateCopilotV3ClarificationGapKind =
  (typeof templateCopilotV3ClarificationGapKinds)[number];
export type TemplateCopilotV3ClarificationBlockingReason =
  (typeof templateCopilotV3ClarificationBlockingReasons)[number];

export type TemplateCopilotV3ClarificationGap = Readonly<{
  gapId: string;
  factId: string | null;
  gapKind: TemplateCopilotV3ClarificationGapKind;
  ambiguityContractId?: string | null;
  blockingReason?: TemplateCopilotV3ClarificationBlockingReason | null;
}>;

export type TemplateCopilotV3ClarificationAnswerContract =
  | Readonly<{ kind: "text"; minLength?: number; maxLength?: number }>
  | Readonly<{ kind: "choice"; optionIds: readonly string[] }>;

export type TemplateCopilotV3ServerQuestion = Readonly<{
  questionId: string;
  factId: string;
  ambiguityContractId: string;
  answerContract: TemplateCopilotV3ClarificationAnswerContract;
}>;

export type TemplateCopilotV3ClarificationDecision = Readonly<{
  gapId: string;
  factId: string | null;
  classification: TemplateCopilotV3ClarificationClassification;
  reasonCode:
    | "known_extraction_miss"
    | "provider_failure"
    | "genuine_ambiguity_requires_question"
    | "ambiguity_contract_unavailable"
    | "question_already_asked"
    | "governed_semantics"
    | "unclassified_gap";
  questionId?: string;
  ambiguityContractId?: string;
}>;

export type TemplateCopilotV3ClarificationAuditManifest = Readonly<{
  identity: string;
  fingerprint: string;
}>;

export type TemplateCopilotV3ClarificationAudit = Readonly<{
  version: typeof templateCopilotV3ClarificationAuditVersion;
  auditFingerprint: string;
  scenarioId: string;
  manifest: TemplateCopilotV3ClarificationAuditManifest;
  provisionalReviewIds: readonly string[];
  gaps: readonly TemplateCopilotV3ClarificationGap[];
  serverQuestions: readonly TemplateCopilotV3ServerQuestion[];
  previouslyAskedQuestionIds: readonly string[];
  decisions: readonly TemplateCopilotV3ClarificationDecision[];
  questions: readonly TemplateCopilotV3ServerQuestion[];
  metrics: Readonly<{
    gapCount: number;
    recoverFromSourceCount: number;
    askUserGapCount: number;
    governedHoldCount: number;
    askedQuestionCount: number;
    knownFactQuestionCount: number;
    repeatedQuestionCount: number;
    falsePositiveQuestionCount: number;
    uncoveredGapCount: number;
  }>;
}>;

export type TemplateCopilotV3ClarificationAnswerSubmission = Readonly<{
  auditFingerprint: string;
  questionId: string;
  answer: TemplateCopilotAtomicAnswerInput;
}>;

export type TemplateCopilotV3ClarificationAnswerReceipt = Readonly<{
  auditFingerprint: string;
  questionId: string;
}>;

type ClarificationAuditInput = Readonly<{
  scenarioId: string;
  manifest: TemplateCopilotV3ClarificationAuditManifest;
  provisionalReviewIds: readonly string[];
  gaps: readonly TemplateCopilotV3ClarificationGap[];
  serverQuestions: readonly TemplateCopilotV3ServerQuestion[];
  previouslyAskedQuestionIds?: readonly string[];
}>;

const boundedIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const auditFingerprintPattern = /^sha256:[0-9a-f]{64}$/u;
const maximumAuditEntries = 1_000;
const maximumAnswerLength = 4_000;
const maximumChoiceOptions = 100;

export class TemplateCopilotV3ClarificationAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateCopilotV3ClarificationAuditError";
  }
}

/** Hashes normalized, server-owned clarification authority. */
export function templateCopilotV3ClarificationAuditFingerprint(
  input: ClarificationAuditInput,
) {
  return hashAuditAuthority(normalizeAuditAuthority(input));
}

/**
 * Questions require an explicit genuine-ambiguity gap and an exact fixed
 * server ambiguity contract. Provider output and extraction failure cannot
 * create interview authority.
 */
export function auditTemplateCopilotV3ClarificationGaps(
  input: ClarificationAuditInput,
): TemplateCopilotV3ClarificationAudit {
  const authority = normalizeAuditAuthority(input);
  const previouslyAsked = new Set(authority.previouslyAskedQuestionIds);
  const serverQuestionIds = new Set(
    authority.serverQuestions.map((question) => question.questionId),
  );
  for (const questionId of previouslyAsked) {
    if (!serverQuestionIds.has(questionId)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Previously asked question is not server owned: ${questionId}.`,
      );
    }
  }

  const selectedQuestions = new Map<string, TemplateCopilotV3ServerQuestion>();
  const decisions = authority.gaps.map((gap) => {
    if (gap.gapKind === "known_extraction_miss") {
      return clarificationDecision(gap, "recover_from_source", "known_extraction_miss");
    }
    if (gap.gapKind === "provider_failure") {
      return clarificationDecision(gap, "recover_from_source", "provider_failure");
    }
    if (gap.gapKind === "governed_semantics") {
      return clarificationDecision(gap, "governed_hold", "governed_semantics");
    }
    if (gap.gapKind === "unclassified") {
      return clarificationDecision(gap, "governed_hold", "unclassified_gap");
    }

    const ambiguityContractId = gap.ambiguityContractId;
    if (!ambiguityContractId || !gap.factId) {
      return clarificationDecision(
        gap,
        "governed_hold",
        "ambiguity_contract_unavailable",
      );
    }
    const contractKey = `${gap.factId}:${ambiguityContractId}`;
    const matchingQuestions = authority.serverQuestions.filter(
      (question) =>
        question.factId === gap.factId &&
        question.ambiguityContractId === ambiguityContractId,
    );
    if (matchingQuestions.length === 0) {
      return clarificationDecision(
        gap,
        "governed_hold",
        "ambiguity_contract_unavailable",
        { ambiguityContractId },
      );
    }
    if (
      matchingQuestions.some((question) =>
        previouslyAsked.has(question.questionId),
      )
    ) {
      return clarificationDecision(
        gap,
        "governed_hold",
        "question_already_asked",
        { ambiguityContractId },
      );
    }
    const question = selectedQuestions.get(contractKey) ?? matchingQuestions[0];
    selectedQuestions.set(contractKey, question);
    return clarificationDecision(
      gap,
      "ask_user",
      "genuine_ambiguity_requires_question",
      { questionId: question.questionId, ambiguityContractId },
    );
  });

  const questions = Object.freeze([...selectedQuestions.values()]);
  const recoverFromSourceCount = decisions.filter(
    (decision) => decision.classification === "recover_from_source",
  ).length;
  const askUserGapCount = decisions.filter(
    (decision) => decision.classification === "ask_user",
  ).length;
  const governedHoldCount = decisions.filter(
    (decision) => decision.classification === "governed_hold",
  ).length;
  const falsePositiveQuestionCount = decisions.filter((decision) => {
    if (decision.classification !== "ask_user") return false;
    const gap = authority.gaps.find((candidate) => candidate.gapId === decision.gapId);
    return gap?.gapKind !== "genuine_ambiguity";
  }).length;

  return Object.freeze({
    version: templateCopilotV3ClarificationAuditVersion,
    auditFingerprint: hashAuditAuthority(authority),
    scenarioId: authority.scenarioId,
    manifest: authority.manifest,
    provisionalReviewIds: authority.provisionalReviewIds,
    gaps: authority.gaps,
    serverQuestions: authority.serverQuestions,
    previouslyAskedQuestionIds: authority.previouslyAskedQuestionIds,
    decisions: Object.freeze(decisions),
    questions,
    metrics: Object.freeze({
      gapCount: authority.gaps.length,
      recoverFromSourceCount,
      askUserGapCount,
      governedHoldCount,
      askedQuestionCount: questions.length,
      knownFactQuestionCount: decisions.filter((decision) =>
        decision.classification === "ask_user" &&
        authority.gaps.find((gap) => gap.gapId === decision.gapId)?.gapKind ===
          "known_extraction_miss"
      ).length,
      repeatedQuestionCount: questions.filter((question) =>
        previouslyAsked.has(question.questionId)
      ).length,
      falsePositiveQuestionCount,
      uncoveredGapCount:
        authority.gaps.length -
        recoverFromSourceCount -
        askUserGapCount -
        governedHoldCount,
    }),
  });
}

/** Validates an ordered answer prefix and returns answer-free telemetry. */
export function applyTemplateCopilotV3ClarificationAnswers({
  audit,
  auditFingerprint,
  answers,
}: Readonly<{
  audit: TemplateCopilotV3ClarificationAudit;
  auditFingerprint: string;
  answers: readonly TemplateCopilotV3ClarificationAnswerSubmission[];
}>) {
  assertAuditIntegrity(audit, auditFingerprint);
  assertBoundedArray(answers, "answers");
  const questionById = new Map(
    audit.questions.map((question) => [question.questionId, question]),
  );
  const seenQuestionIds = new Set<string>();
  for (const [index, submission] of answers.entries()) {
    assertAnswerSubmissionFingerprint(submission, auditFingerprint);
    assertIdentifier(submission?.questionId, "answer questionId");
    if (seenQuestionIds.has(submission.questionId)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Duplicate clarification answer: ${submission.questionId}.`,
      );
    }
    seenQuestionIds.add(submission.questionId);
    const expectedQuestion = audit.questions[index];
    if (!expectedQuestion || expectedQuestion.questionId !== submission.questionId) {
      throw new TemplateCopilotV3ClarificationAuditError(
        "Clarification answers must be an exact ordered prefix of the audit questions.",
      );
    }
    assertAtomicAnswer(submission.answer, questionById.get(submission.questionId));
  }
  return Object.freeze({
    auditFingerprint,
    appliedQuestionIds: Object.freeze(answers.map((answer) => answer.questionId)),
    nextQuestionId: audit.questions[answers.length]?.questionId ?? null,
    completed: answers.length === audit.questions.length,
  });
}

/** Releases one typed answer only for the exact next selected question. */
export function discloseNextTemplateCopilotV3ClarificationAnswer({
  audit,
  auditFingerprint,
  requestedQuestionId,
  answerLedger,
  disclosedAnswers = [],
}: Readonly<{
  audit: TemplateCopilotV3ClarificationAudit;
  auditFingerprint: string;
  requestedQuestionId: string;
  answerLedger: readonly TemplateCopilotV3ClarificationAnswerSubmission[];
  disclosedAnswers?: readonly TemplateCopilotV3ClarificationAnswerReceipt[];
}>) {
  assertAuditIntegrity(audit, auditFingerprint);
  assertIdentifier(requestedQuestionId, "requestedQuestionId");
  assertBoundedArray(answerLedger, "answerLedger");
  assertBoundedArray(disclosedAnswers, "disclosedAnswers");
  if (disclosedAnswers.length > audit.questions.length) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "The disclosed answer ledger is longer than the audit question list.",
    );
  }

  const disclosedQuestionIds = new Set<string>();
  for (const [index, receipt] of disclosedAnswers.entries()) {
    assertReceiptFingerprint(receipt, auditFingerprint);
    assertIdentifier(receipt?.questionId, "disclosed questionId");
    if (disclosedQuestionIds.has(receipt.questionId)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Duplicate disclosed answer: ${receipt.questionId}.`,
      );
    }
    disclosedQuestionIds.add(receipt.questionId);
    if (audit.questions[index]?.questionId !== receipt.questionId) {
      throw new TemplateCopilotV3ClarificationAuditError(
        "Disclosed answers must be an exact ordered prefix of the audit questions.",
      );
    }
  }

  const questionById = new Map(
    audit.questions.map((question) => [question.questionId, question]),
  );
  const ledgerByQuestionId = new Map<
    string,
    TemplateCopilotV3ClarificationAnswerSubmission
  >();
  for (const submission of answerLedger) {
    assertAnswerSubmissionFingerprint(submission, auditFingerprint);
    assertIdentifier(submission?.questionId, "answer questionId");
    if (ledgerByQuestionId.has(submission.questionId)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Duplicate clarification answer: ${submission.questionId}.`,
      );
    }
    const question = questionById.get(submission.questionId);
    if (!question) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Clarification answer is not selected by this audit: ${submission.questionId}.`,
      );
    }
    assertAtomicAnswer(submission.answer, question);
    ledgerByQuestionId.set(submission.questionId, submission);
  }

  const nextQuestion = audit.questions[disclosedAnswers.length];
  if (!nextQuestion || nextQuestion.questionId !== requestedQuestionId) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "An answer may be disclosed only for the exact next server question.",
    );
  }
  const submission = ledgerByQuestionId.get(requestedQuestionId);
  if (!submission) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "The requested server question has no qualification answer.",
    );
  }
  return Object.freeze({
    auditFingerprint,
    questionId: nextQuestion.questionId,
    factId: nextQuestion.factId,
    answer: Object.freeze({ ...submission.answer }),
  });
}

function normalizeAuditAuthority(input: ClarificationAuditInput) {
  assertIdentifier(input?.scenarioId, "scenarioId");
  assertIdentifier(input?.manifest?.identity, "manifest identity");
  if (!auditFingerprintPattern.test(input?.manifest?.fingerprint ?? "")) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "manifest fingerprint must be a SHA-256 authority fingerprint.",
    );
  }
  const provisionalReviewIds = normalizeUniqueIds(
    input.provisionalReviewIds,
    "provisionalReviewIds",
  );
  const gaps = normalizeGaps(input.gaps);
  const serverQuestions = normalizeServerQuestions(input.serverQuestions);
  const previouslyAskedQuestionIds = normalizeUniqueIds(
    input.previouslyAskedQuestionIds ?? [],
    "previouslyAskedQuestionIds",
  );
  return Object.freeze({
    scenarioId: input.scenarioId,
    manifest: Object.freeze({
      identity: input.manifest.identity,
      fingerprint: input.manifest.fingerprint,
    }),
    provisionalReviewIds,
    gaps,
    serverQuestions,
    previouslyAskedQuestionIds,
  });
}

function normalizeGaps(gaps: readonly TemplateCopilotV3ClarificationGap[]) {
  assertBoundedArray(gaps, "gaps");
  const seenGapIds = new Set<string>();
  const normalized = gaps.map((gap) => {
    assertIdentifier(gap?.gapId, "gapId");
    if (seenGapIds.has(gap.gapId)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Duplicate clarification gap: ${gap.gapId}.`,
      );
    }
    seenGapIds.add(gap.gapId);
    if (gap.factId !== null) assertIdentifier(gap.factId, "factId");
    if (!templateCopilotV3ClarificationGapKinds.includes(gap.gapKind)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Invalid gap kind for ${gap.gapId}.`,
      );
    }
    const ambiguityContractId = gap.ambiguityContractId ?? null;
    if (ambiguityContractId !== null) {
      assertIdentifier(ambiguityContractId, "ambiguityContractId");
    }
    const blockingReason = gap.blockingReason ?? null;
    if (
      blockingReason !== null &&
      !templateCopilotV3ClarificationBlockingReasons.includes(blockingReason)
    ) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Unknown governed blocking reason for ${gap.gapId}: ${blockingReason}.`,
      );
    }
    if (gap.gapKind === "governed_semantics" && blockingReason === null) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Governed semantics gap ${gap.gapId} requires a blocking reason.`,
      );
    }
    if (gap.gapKind !== "governed_semantics" && blockingReason !== null) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Blocking reason is not valid for ${gap.gapKind} gap ${gap.gapId}.`,
      );
    }
    if (gap.gapKind !== "genuine_ambiguity" && ambiguityContractId !== null) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Ambiguity contract is not valid for ${gap.gapKind} gap ${gap.gapId}.`,
      );
    }
    if (
      ["known_extraction_miss", "genuine_ambiguity", "governed_semantics"].includes(
        gap.gapKind,
      ) &&
      gap.factId === null
    ) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `${gap.gapKind} gap ${gap.gapId} requires a factId.`,
      );
    }
    return Object.freeze({
      gapId: gap.gapId,
      factId: gap.factId,
      gapKind: gap.gapKind,
      ambiguityContractId,
      blockingReason,
    });
  });
  normalized.sort((left, right) => left.gapId.localeCompare(right.gapId, "en"));
  return Object.freeze(normalized);
}

function normalizeServerQuestions(
  serverQuestions: readonly TemplateCopilotV3ServerQuestion[],
) {
  assertBoundedArray(serverQuestions, "serverQuestions");
  const seenQuestionIds = new Set<string>();
  const normalized = serverQuestions.map((question) => {
    assertIdentifier(question?.questionId, "questionId");
    assertIdentifier(question?.factId, "question factId");
    assertIdentifier(question?.ambiguityContractId, "question ambiguityContractId");
    if (seenQuestionIds.has(question.questionId)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Duplicate server question: ${question.questionId}.`,
      );
    }
    seenQuestionIds.add(question.questionId);
    return Object.freeze({
      questionId: question.questionId,
      factId: question.factId,
      ambiguityContractId: question.ambiguityContractId,
      answerContract: normalizeAnswerContract(question.answerContract),
    });
  });
  normalized.sort((left, right) =>
    left.questionId.localeCompare(right.questionId, "en")
  );
  return Object.freeze(normalized);
}

function normalizeAnswerContract(
  answerContract: TemplateCopilotV3ClarificationAnswerContract,
): TemplateCopilotV3ClarificationAnswerContract {
  if (answerContract?.kind === "text") {
    const minLength = answerContract.minLength ?? 1;
    const maxLength = answerContract.maxLength ?? maximumAnswerLength;
    if (
      !Number.isInteger(minLength) ||
      !Number.isInteger(maxLength) ||
      minLength < 1 ||
      maxLength < minLength ||
      maxLength > maximumAnswerLength
    ) {
      throw new TemplateCopilotV3ClarificationAuditError(
        "Text answer contract must have bounded integer lengths.",
      );
    }
    return Object.freeze({ kind: "text", minLength, maxLength });
  }
  if (answerContract?.kind === "choice") {
    const optionIds = normalizeUniqueIds(answerContract.optionIds, "choice optionIds");
    if (optionIds.length === 0 || optionIds.length > maximumChoiceOptions) {
      throw new TemplateCopilotV3ClarificationAuditError(
        "Choice answer contract must have bounded options.",
      );
    }
    return Object.freeze({ kind: "choice", optionIds });
  }
  throw new TemplateCopilotV3ClarificationAuditError(
    "Server question has an invalid answer contract.",
  );
}

function clarificationDecision(
  gap: TemplateCopilotV3ClarificationGap,
  classification: TemplateCopilotV3ClarificationClassification,
  reasonCode: TemplateCopilotV3ClarificationDecision["reasonCode"],
  extra: Readonly<{ questionId?: string; ambiguityContractId?: string }> = {},
) {
  return Object.freeze({
    gapId: gap.gapId,
    factId: gap.factId,
    classification,
    reasonCode,
    ...extra,
  });
}

function assertAuditIntegrity(
  audit: TemplateCopilotV3ClarificationAudit,
  auditFingerprint: string,
) {
  if (!auditFingerprintPattern.test(auditFingerprint)) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "auditFingerprint must be a SHA-256 authority fingerprint.",
    );
  }
  if (audit?.version !== templateCopilotV3ClarificationAuditVersion) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "Clarification audit version is not supported.",
    );
  }
  const regenerated = auditTemplateCopilotV3ClarificationGaps({
    scenarioId: audit.scenarioId,
    manifest: audit.manifest,
    provisionalReviewIds: audit.provisionalReviewIds,
    gaps: audit.gaps,
    serverQuestions: audit.serverQuestions,
    previouslyAskedQuestionIds: audit.previouslyAskedQuestionIds,
  });
  if (
    audit.auditFingerprint !== auditFingerprint ||
    regenerated.auditFingerprint !== auditFingerprint ||
    stableJson(regenerated.questions) !== stableJson(audit.questions)
  ) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "Clarification audit fingerprint is stale or does not match its authority.",
    );
  }
}

function assertAtomicAnswer(
  answer: TemplateCopilotAtomicAnswerInput,
  question: TemplateCopilotV3ServerQuestion | undefined,
) {
  if (!question) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "Clarification answer has no selected server question.",
    );
  }
  if (question.answerContract.kind === "choice") {
    if (
      answer?.kind !== "choice" ||
      typeof answer.optionId !== "string" ||
      !question.answerContract.optionIds.includes(answer.optionId)
    ) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `Question ${question.questionId} requires a bounded server choice.`,
      );
    }
    return;
  }
  if (answer?.kind !== "text" || typeof answer.text !== "string") {
    throw new TemplateCopilotV3ClarificationAuditError(
      `Question ${question.questionId} requires a text answer.`,
    );
  }
  const trimmedLength = answer.text.trim().length;
  const minLength = question.answerContract.minLength ?? 1;
  const maxLength = question.answerContract.maxLength ?? maximumAnswerLength;
  if (
    trimmedLength < minLength ||
    answer.text.length > maxLength ||
    answer.text.length > maximumAnswerLength
  ) {
    throw new TemplateCopilotV3ClarificationAuditError(
      `Question ${question.questionId} requires a bounded text answer.`,
    );
  }
}

function assertAnswerSubmissionFingerprint(
  submission: TemplateCopilotV3ClarificationAnswerSubmission,
  auditFingerprint: string,
) {
  if (submission?.auditFingerprint !== auditFingerprint) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "Clarification answer has a stale audit fingerprint.",
    );
  }
}

function assertReceiptFingerprint(
  receipt: TemplateCopilotV3ClarificationAnswerReceipt,
  auditFingerprint: string,
) {
  if (receipt?.auditFingerprint !== auditFingerprint) {
    throw new TemplateCopilotV3ClarificationAuditError(
      "Disclosed answer has a stale audit fingerprint.",
    );
  }
}

function normalizeUniqueIds(values: readonly string[], label: string) {
  assertBoundedArray(values, label);
  const seen = new Set<string>();
  for (const value of values) {
    assertIdentifier(value, label);
    if (seen.has(value)) {
      throw new TemplateCopilotV3ClarificationAuditError(
        `${label} contains a duplicate identifier: ${value}.`,
      );
    }
    seen.add(value);
  }
  return Object.freeze([...seen].sort((left, right) =>
    left.localeCompare(right, "en")
  ));
}

function hashAuditAuthority(authority: ReturnType<typeof normalizeAuditAuthority>) {
  const payload = {
    version: templateCopilotV3ClarificationAuditVersion,
    scenarioId: authority.scenarioId,
    manifest: authority.manifest,
    provisionalReviewIds: authority.provisionalReviewIds,
    gaps: authority.gaps,
    serverQuestions: authority.serverQuestions,
    previouslyAskedQuestionIds: authority.previouslyAskedQuestionIds,
  };
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function assertBoundedArray(value: readonly unknown[], label: string) {
  if (!Array.isArray(value) || value.length > maximumAuditEntries) {
    throw new TemplateCopilotV3ClarificationAuditError(
      `${label} must be a bounded array.`,
    );
  }
}

function assertIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !boundedIdentifierPattern.test(value)) {
    throw new TemplateCopilotV3ClarificationAuditError(
      `${label} must be a bounded identifier.`,
    );
  }
}
