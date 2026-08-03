import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTemplateCopilotV3ClarificationAnswers,
  auditTemplateCopilotV3ClarificationGaps,
  discloseNextTemplateCopilotV3ClarificationAnswer,
  templateCopilotV3ClarificationAuditFingerprint,
} from "./template-copilot-v3-clarification-audit.ts";

const manifest = Object.freeze({
  identity: "manifest:qualification:en-01",
  fingerprint: `sha256:${"a".repeat(64)}`,
});
const baseAuthority = Object.freeze({
  scenarioId: "qualification:en-01",
  manifest,
  provisionalReviewIds: ["review:01", "review:02"],
});
const questions = Object.freeze([
  Object.freeze({
    questionId: "server:01-workflow-name",
    factId: "workflow.name",
    ambiguityContractId: "ambiguity:workflow-name",
    answerContract: Object.freeze({
      kind: "text",
      minLength: 2,
      maxLength: 80,
    }),
  }),
  Object.freeze({
    questionId: "server:02-workflow-owner",
    factId: "governance.owner",
    ambiguityContractId: "ambiguity:workflow-owner",
    answerContract: Object.freeze({
      kind: "choice",
      optionIds: Object.freeze(["finance", "procurement"]),
    }),
  }),
]);

function auditFor({ gaps, serverQuestions = questions, ...rest }) {
  return auditTemplateCopilotV3ClarificationGaps({
    ...baseAuthority,
    gaps,
    serverQuestions,
    ...rest,
  });
}

function twoQuestionAudit() {
  return auditFor({
    gaps: [
      {
        gapId: "gap:01-name",
        factId: "workflow.name",
        gapKind: "genuine_ambiguity",
        ambiguityContractId: "ambiguity:workflow-name",
      },
      {
        gapId: "gap:02-owner",
        factId: "governance.owner",
        gapKind: "genuine_ambiguity",
        ambiguityContractId: "ambiguity:workflow-owner",
      },
    ],
  });
}

function answersFor(audit) {
  return [
    {
      auditFingerprint: audit.auditFingerprint,
      questionId: "server:01-workflow-name",
      answer: { kind: "text", text: "Purchase approval" },
    },
    {
      auditFingerprint: audit.auditFingerprint,
      questionId: "server:02-workflow-owner",
      answer: { kind: "choice", optionId: "procurement" },
    },
  ];
}

test("known extraction misses and provider failures recover without questions", () => {
  const audit = auditFor({
    gaps: [
      {
        gapId: "gap:known",
        factId: "workflow.name",
        gapKind: "known_extraction_miss",
      },
      {
        gapId: "gap:provider",
        factId: null,
        gapKind: "provider_failure",
      },
    ],
  });
  assert.deepEqual(
    audit.decisions.map(({ classification, reasonCode }) => ({
      classification,
      reasonCode,
    })),
    [
      {
        classification: "recover_from_source",
        reasonCode: "known_extraction_miss",
      },
      {
        classification: "recover_from_source",
        reasonCode: "provider_failure",
      },
    ],
  );
  assert.deepEqual(audit.questions, []);
  assert.equal(audit.metrics.recoverFromSourceCount, 2);
  assert.equal(audit.metrics.knownFactQuestionCount, 0);
  assert.equal(audit.metrics.falsePositiveQuestionCount, 0);
});

test("a provider ambiguity without an exact server contract cannot ask", () => {
  const withoutContract = auditFor({
    gaps: [{
      gapId: "gap:provider-ambiguity",
      factId: "workflow.name",
      gapKind: "genuine_ambiguity",
    }],
  });
  assert.equal(withoutContract.decisions[0].classification, "governed_hold");
  assert.equal(
    withoutContract.decisions[0].reasonCode,
    "ambiguity_contract_unavailable",
  );
  assert.deepEqual(withoutContract.questions, []);

  const mismatchedContract = auditFor({
    gaps: [{
      gapId: "gap:mismatched-ambiguity",
      factId: "workflow.name",
      gapKind: "genuine_ambiguity",
      ambiguityContractId: "ambiguity:provider-invented",
    }],
  });
  assert.equal(mismatchedContract.decisions[0].classification, "governed_hold");
  assert.deepEqual(mismatchedContract.questions, []);
});

test("an exact synthetic ambiguity selects exactly one server question", () => {
  const audit = auditFor({
    gaps: [{
      gapId: "gap:workflow-name",
      factId: "workflow.name",
      gapKind: "genuine_ambiguity",
      ambiguityContractId: "ambiguity:workflow-name",
    }],
  });
  assert.equal(audit.decisions[0].classification, "ask_user");
  assert.equal(
    audit.decisions[0].questionId,
    "server:01-workflow-name",
  );
  assert.deepEqual(audit.questions, [questions[0]]);
  assert.equal(audit.metrics.askedQuestionCount, 1);
  assert.equal(audit.metrics.falsePositiveQuestionCount, 0);
});

test("one exact server question covers repeated gaps for the same ambiguity", () => {
  const audit = auditFor({
    gaps: ["01", "02"].map((suffix) => ({
      gapId: `gap:name:${suffix}`,
      factId: "workflow.name",
      gapKind: "genuine_ambiguity",
      ambiguityContractId: "ambiguity:workflow-name",
    })),
  });
  assert.equal(audit.metrics.askUserGapCount, 2);
  assert.equal(audit.metrics.askedQuestionCount, 1);
  assert.deepEqual(
    audit.decisions.map((decision) => decision.questionId),
    ["server:01-workflow-name", "server:01-workflow-name"],
  );
});

test("governed semantics remain holds and never select questions", () => {
  for (const blockingReason of [
    "compound_predicate_not_executable",
    "unsupported_semantics_not_executable",
  ]) {
    const audit = auditFor({
      gaps: [{
        gapId: `gap:${blockingReason}`,
        factId: "workflow.conditions",
        gapKind: "governed_semantics",
        blockingReason,
      }],
    });
    assert.equal(audit.decisions[0].classification, "governed_hold");
    assert.equal(audit.decisions[0].reasonCode, "governed_semantics");
    assert.deepEqual(audit.questions, []);
  }
});

test("unknown or misplaced governed blocking reasons fail closed", () => {
  assert.throws(
    () => auditFor({
      gaps: [{
        gapId: "gap:unknown-hold",
        factId: "workflow.conditions",
        gapKind: "governed_semantics",
        blockingReason: "provider_suggested_reason",
      }],
    }),
    /Unknown governed blocking reason/u,
  );
  assert.throws(
    () => auditFor({
      gaps: [{
        gapId: "gap:misplaced-hold",
        factId: "workflow.conditions",
        gapKind: "known_extraction_miss",
        blockingReason: "compound_predicate_not_executable",
      }],
    }),
    /Blocking reason is not valid/u,
  );
});

test("the audit fingerprint is deterministic and binds all authority inputs", () => {
  const input = {
    ...baseAuthority,
    gaps: [
      {
        gapId: "gap:z",
        factId: null,
        gapKind: "provider_failure",
      },
      {
        gapId: "gap:a",
        factId: "workflow.name",
        gapKind: "known_extraction_miss",
      },
    ],
    serverQuestions: [...questions].reverse(),
  };
  const reversed = {
    ...input,
    gaps: [...input.gaps].reverse(),
    provisionalReviewIds: [...input.provisionalReviewIds].reverse(),
    serverQuestions: [...input.serverQuestions].reverse(),
  };
  const fingerprint = templateCopilotV3ClarificationAuditFingerprint(input);
  assert.match(fingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    fingerprint,
    templateCopilotV3ClarificationAuditFingerprint(reversed),
  );
  assert.notEqual(
    fingerprint,
    templateCopilotV3ClarificationAuditFingerprint({
      ...input,
      manifest: { ...manifest, identity: "manifest:qualification:en-02" },
    }),
  );
  assert.notEqual(
    fingerprint,
    templateCopilotV3ClarificationAuditFingerprint({
      ...input,
      provisionalReviewIds: ["review:03"],
    }),
  );
  assert.notEqual(
    fingerprint,
    templateCopilotV3ClarificationAuditFingerprint({
      ...input,
      serverQuestions: [{
        ...questions[0],
        answerContract: { kind: "text", minLength: 2, maxLength: 81 },
      }],
    }),
  );
  assert.throws(
    () => templateCopilotV3ClarificationAuditFingerprint({
      ...input,
      manifest: { ...manifest, fingerprint: "manifest:not-a-digest" },
    }),
    /manifest fingerprint must be a SHA-256/u,
  );
});

test("answer application rejects stale, wrong, out-of-order, and duplicate entries", () => {
  const audit = twoQuestionAudit();
  const answers = answersFor(audit);
  const stale = `sha256:${"b".repeat(64)}`;
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: stale,
      answers,
    }),
    /stale or does not match/u,
  );
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [{ ...answers[0], questionId: "server:not-selected" }],
    }),
    /exact ordered prefix/u,
  );
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [answers[1], answers[0]],
    }),
    /exact ordered prefix/u,
  );
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [answers[0], answers[0]],
    }),
    /Duplicate clarification answer/u,
  );
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [{ ...answers[0], auditFingerprint: stale }],
    }),
    /stale audit fingerprint/u,
  );
});

test("typed answer contracts reject wrong kinds and unbounded values", () => {
  const audit = twoQuestionAudit();
  const answers = answersFor(audit);
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [{
        ...answers[0],
        answer: { kind: "choice", optionId: "procurement" },
      }],
    }),
    /requires a text answer/u,
  );
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [
        answers[0],
        { ...answers[1], answer: { kind: "text", text: "Procurement" } },
      ],
    }),
    /requires a bounded server choice/u,
  );
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [
        answers[0],
        { ...answers[1], answer: { kind: "choice", optionId: "legal" } },
      ],
    }),
    /requires a bounded server choice/u,
  );
  assert.throws(
    () => applyTemplateCopilotV3ClarificationAnswers({
      audit,
      auditFingerprint: audit.auditFingerprint,
      answers: [{ ...answers[0], answer: { kind: "text", text: "x" } }],
    }),
    /requires a bounded text answer/u,
  );
});

test("valid application returns IDs only and disclosure follows exact order", () => {
  const audit = twoQuestionAudit();
  const answers = answersFor(audit);
  const applied = applyTemplateCopilotV3ClarificationAnswers({
    audit,
    auditFingerprint: audit.auditFingerprint,
    answers,
  });
  assert.deepEqual(applied.appliedQuestionIds, [
    "server:01-workflow-name",
    "server:02-workflow-owner",
  ]);
  assert.equal(applied.completed, true);
  assert.equal(applied.nextQuestionId, null);
  assert.doesNotMatch(JSON.stringify(applied), /Purchase|procurement/u);

  assert.throws(
    () => discloseNextTemplateCopilotV3ClarificationAnswer({
      audit,
      auditFingerprint: audit.auditFingerprint,
      requestedQuestionId: "server:02-workflow-owner",
      answerLedger: answers,
    }),
    /exact next server question/u,
  );
  const first = discloseNextTemplateCopilotV3ClarificationAnswer({
    audit,
    auditFingerprint: audit.auditFingerprint,
    requestedQuestionId: "server:01-workflow-name",
    answerLedger: answers,
  });
  assert.deepEqual(first.answer, {
    kind: "text",
    text: "Purchase approval",
  });
  const second = discloseNextTemplateCopilotV3ClarificationAnswer({
    audit,
    auditFingerprint: audit.auditFingerprint,
    requestedQuestionId: "server:02-workflow-owner",
    answerLedger: answers,
    disclosedAnswers: [{
      auditFingerprint: first.auditFingerprint,
      questionId: first.questionId,
    }],
  });
  assert.deepEqual(second.answer, {
    kind: "choice",
    optionId: "procurement",
  });
});

test("disclosure rejects stale, duplicate, and non-prefix receipt ledgers", () => {
  const audit = twoQuestionAudit();
  const answers = answersFor(audit);
  const stale = `sha256:${"b".repeat(64)}`;
  assert.throws(
    () => discloseNextTemplateCopilotV3ClarificationAnswer({
      audit,
      auditFingerprint: audit.auditFingerprint,
      requestedQuestionId: "server:02-workflow-owner",
      answerLedger: answers,
      disclosedAnswers: [{
        auditFingerprint: stale,
        questionId: "server:01-workflow-name",
      }],
    }),
    /stale audit fingerprint/u,
  );
  assert.throws(
    () => discloseNextTemplateCopilotV3ClarificationAnswer({
      audit,
      auditFingerprint: audit.auditFingerprint,
      requestedQuestionId: "server:01-workflow-name",
      answerLedger: [answers[0], answers[0]],
    }),
    /Duplicate clarification answer/u,
  );
  assert.throws(
    () => discloseNextTemplateCopilotV3ClarificationAnswer({
      audit,
      auditFingerprint: audit.auditFingerprint,
      requestedQuestionId: "server:02-workflow-owner",
      answerLedger: answers,
      disclosedAnswers: [{
        auditFingerprint: audit.auditFingerprint,
        questionId: "server:02-workflow-owner",
      }],
    }),
    /exact ordered prefix/u,
  );
});

test("a previously asked exact ambiguity contract is never selected again", () => {
  const audit = auditFor({
    gaps: [{
      gapId: "gap:workflow-name",
      factId: "workflow.name",
      gapKind: "genuine_ambiguity",
      ambiguityContractId: "ambiguity:workflow-name",
    }],
    previouslyAskedQuestionIds: ["server:01-workflow-name"],
  });
  assert.equal(audit.decisions[0].classification, "governed_hold");
  assert.equal(audit.decisions[0].reasonCode, "question_already_asked");
  assert.deepEqual(audit.questions, []);
});

test("duplicate and non-server audit identities fail closed", () => {
  assert.throws(
    () => auditFor({
      gaps: ["a", "a"].map((gapId) => ({
        gapId,
        factId: "workflow.name",
        gapKind: "known_extraction_miss",
      })),
    }),
    /Duplicate clarification gap/u,
  );
  assert.throws(
    () => auditFor({
      gaps: [],
      previouslyAskedQuestionIds: ["provider:invented-question"],
    }),
    /not server owned/u,
  );
});
