import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTemplateCopilotV2AtomicDecision,
  createTemplateCopilotV2Ledger,
  templateCopilotFactIds,
} from "./template-copilot-facts.ts";
import {
  getTemplateCopilotQuestionLibrary,
  getTemplateCopilotV2InterviewState,
  getTemplateCopilotV2SpecialReview,
  assembleTemplateCopilotV2FactCandidates,
  reopenTemplateCopilotV2Decision,
  TemplateCopilotQuestionLibraryError,
  validateTemplateCopilotQuestionLibrary,
} from "./template-copilot-question-library.ts";

const enabled = { enabled: true };
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts Payable" };
const confirmedAt = "2026-07-27T08:00:00.000Z";

test("pinned v2 controller reaches its real 316-decision maximum through declared localized choices", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  assert.ok(library.questions.length > templateCopilotFactIds.length);
  assert.deepEqual(new Set(library.questions.map((question) => question.targetFactId)), new Set(templateCopilotFactIds));
  for (const question of library.questions) {
    assert.equal(question.primaryDecision.factId, question.targetFactId);
    assert.match(question.primaryDecision.decisionId, /^decision\./);
  }
  const chooseMaximumPathOption = (question) => {
    const desiredOptionId = question.primaryDecisionId === "decision.request.initiator_policy.who_can_start"
      ? "selected_roles"
      : question.primaryDecisionId.endsWith("person_mode")
        ? "fixed_email"
        : question.primaryDecisionId.includes("needed") || question.primaryDecisionId.includes("add_another")
          ? "yes"
          : question.options?.[0]?.optionId;
    const option = question.options?.find((candidate) => candidate.optionId === desiredOptionId) ?? question.options?.[0];
    assert.ok(option, `Declared choice missing for ${question.primaryDecisionId}`);
    return option;
  };
  const playMaximumPath = (locale) => {
    let ledger = createTemplateCopilotV2Ledger({ ...scope, locale }, enabled);
    const sequence = [];
    const choiceDisplays = [];
    for (let turn = 0; turn <= library.questions.length; turn += 1) {
      const state = getTemplateCopilotV2InterviewState(ledger);
      if (state.state === "complete") return { ledger, sequence, choiceDisplays };
      assert.equal(state.state, "question", JSON.stringify(state.gaps));
      const question = state.nextQuestion;
      sequence.push(question.primaryDecisionId);
      assert.equal(state.rationale.code, "highest_priority_applicable_pending_fact");
      assert.equal(state.rationale.priorityPolicy, "unique_priority");
      const answer = question.answerType === "choice"
        ? (() => { const option = chooseMaximumPathOption(question); choiceDisplays.push(option.label); return { kind: "choice", optionId: option.optionId, display: option.label }; })()
        : { kind: "text", text: `Required detail ${turn + 1}` };
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: question.primaryDecisionId, answer, provenance: [{ kind: "human_editor", sourceId: `answer:${question.primaryDecisionId}`, sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
    }
    assert.fail("Maximum path did not complete within its declared library bound.");
  };
  const english = playMaximumPath("en");
  const traditional = playMaximumPath("zh-Hant");
  const simplified = playMaximumPath("zh-Hans");
  assert.equal(english.sequence.length, 316);
  assert.deepEqual(traditional.sequence, english.sequence);
  assert.deepEqual(simplified.sequence, english.sequence);
  assert.equal(new Set(english.sequence).size, 316, "each maximum-path decision is answered exactly once");
  assert.ok(traditional.choiceDisplays.some((display, index) => display !== english.choiceDisplays[index]));
  assert.ok(simplified.choiceDisplays.some((display, index) => display !== english.choiceDisplays[index]));
  assert.deepEqual(english.sequence.slice(0, 6), ["decision.workflow.name.name", "decision.workflow.purpose.purpose", "decision.workflow.scope.included", "decision.workflow.scope.excluded", "decision.request.initiator_policy.who_can_start", "decision.request.initiator_policy.initiator_roles"]);
  const maximumCjkAndEmojiAnswer = "中🙂".repeat(4_000); // 8,000 Unicode code points, exactly the v2 answer boundary.
  const worstCaseLedger = structuredClone(english.ledger);
  for (const decision of Object.values(worstCaseLedger.atomicDecisions)) {
    if (decision.kind === "text") decision.answer = maximumCjkAndEmojiAnswer;
  }
  assert.equal(getTemplateCopilotV2InterviewState(worstCaseLedger).state, "complete");
  assert.ok(Buffer.byteLength(JSON.stringify(worstCaseLedger), "utf8") < 12 * 1024 * 1024, "maximum CJK and emoji ledger stays below the database 12 MiB guardrail");
  const ledger = english.ledger;
  assert.equal(ledger.facts["workflow.scope"].status, "unresolved");
  const candidates = assembleTemplateCopilotV2FactCandidates(ledger);
  assert.equal(candidates["workflow.scope"].state, "ready_for_review");
  assert.equal(candidates["workflow.scope"].answers.length, 2);
  assert.equal(getTemplateCopilotV2InterviewState(ledger).state, "complete");
  assert.deepEqual(getTemplateCopilotV2InterviewState(ledger), getTemplateCopilotV2InterviewState(structuredClone(ledger)));
});

test("zero/minimum collection choices terminate transitive branches without a blocked prerequisite gap", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  let ledger = createTemplateCopilotV2Ledger(scope, enabled);
  for (let turn = 0; turn < library.questions.length; turn += 1) {
    const state = getTemplateCopilotV2InterviewState(ledger);
    if (state.state === "complete") break;
    assert.equal(state.state, "question", JSON.stringify(state.gaps));
    const question = state.nextQuestion;
    const answer = question.answerType === "choice" ? "no" : "Minimum answer";
    ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: question.primaryDecisionId, answer, provenance: [{ kind: "human_editor", sourceId: question.questionId, sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
    assert.deepEqual(getTemplateCopilotV2InterviewState(ledger), getTemplateCopilotV2InterviewState(structuredClone(ledger)), "resume is deterministic at every gate");
  }
  const done = getTemplateCopilotV2InterviewState(ledger);
  assert.equal(done.state, "complete");
  assert.equal(done.gaps.some((gap) => gap.code === "prerequisite_pending"), false);
});

test("each bounded collection plays back at one and middle cardinality without deadlock", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const stops = [
    "decision.request.fields.add_another_01", "decision.request.fields.add_another_10",
    "decision.attachments.requirements.add_another_01", "decision.attachments.requirements.add_another_10",
    "decision.workflow.stages.add_another_02", "decision.workflow.stages.add_another_10",
    "decision.workflow.conditions.add_another_01", "decision.workflow.conditions.add_another_05",
    "decision.notifications.rules.add_another_01", "decision.notifications.rules.add_another_10",
  ];
  for (const stop of stops) {
    let ledger = createTemplateCopilotV2Ledger(scope, enabled);
    for (let turn = 0; turn <= library.questions.length; turn += 1) {
      const state = getTemplateCopilotV2InterviewState(ledger);
      if (state.state === "complete") break;
      assert.equal(state.state, "question", `${stop}: ${JSON.stringify(state.gaps)}`);
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: state.nextQuestion.primaryDecisionId, answer: state.nextQuestion.primaryDecisionId === stop ? "no" : "yes", provenance: [{ kind: "human_editor", sourceId: state.nextQuestion.questionId, sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
    }
    assert.equal(getTemplateCopilotV2InterviewState(ledger).state, "complete", stop);
  }
});

test("conditional applicability is pending until its deciding answer, and only then becomes inapplicable", () => {
  const pinned = getTemplateCopilotQuestionLibrary("v2.0");
  let ledger = createTemplateCopilotV2Ledger(scope, enabled);
  assert.equal(getTemplateCopilotV2InterviewState(ledger, pinned).inapplicableFactIds.includes("notifications.rules"), false);
  // Answer every earlier decision with neutral values, then say no to messages.
  while (getTemplateCopilotV2InterviewState(ledger, pinned).nextQuestion?.primaryDecisionId !== "decision.notifications.rules.needed") {
    const question = getTemplateCopilotV2InterviewState(ledger, pinned).nextQuestion;
    ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: question.primaryDecisionId, answer: "no", provenance: [{ kind: "human_editor", sourceId: question.questionId, sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
  }
  ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.notifications.rules.needed", answer: "no", provenance: [{ kind: "human_editor", sourceId: "notification-no", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
  const state = getTemplateCopilotV2InterviewState(ledger, pinned);
  assert.equal(state.inapplicableFactIds.includes("notifications.rules"), false, "a fact is not hidden merely because some follow-up decisions are N/A");
  assert.equal(state.nextQuestion.primaryDecisionId, "decision.governance.owner.owning_department");
});

test("selected initiator roles and person resolvers ask only the details that apply", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const initiatorRoles = library.questions.find((question) => question.primaryDecision.decisionId === "decision.request.initiator_policy.initiator_roles");
  assert.deepEqual(initiatorRoles.applicability, { kind: "decision_equals", decisionId: "decision.request.initiator_policy.who_can_start", values: ["selected_roles"] });
  for (const question of library.questions.filter((candidate) => candidate.primaryDecision.decisionId.endsWith("person_detail"))) {
    assert.equal(question.applicability.kind, "decision_equals", question.questionId);
    assert.deepEqual(question.applicability.values, ["fixed_email", "directory_role", "request_field"], question.questionId);
  }
  const stageTwo = library.questions.find((question) => question.primaryDecision.decisionId === "decision.workflow.stages.stage_2_needed");
  assert.deepEqual(stageTwo.prerequisiteDecisionIds, ["decision.workflow.stages.first_stage_person_mode"]);
});

test("person resolver detail prompt is deterministic, mode-specific, and localized", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    for (const mode of ["fixed_email", "directory_role", "request_field"]) {
      let ledger = createTemplateCopilotV2Ledger({ ...scope, locale }, enabled);
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.workflow.name.name", answer: "Workflow", provenance: [{ kind: "human_editor", sourceId: "answer:name", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.workflow.purpose.purpose", answer: "Purpose", provenance: [{ kind: "human_editor", sourceId: "answer:purpose", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.workflow.scope.included", answer: "Included", provenance: [{ kind: "human_editor", sourceId: "answer:included", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.workflow.scope.excluded", answer: "Excluded", provenance: [{ kind: "human_editor", sourceId: "answer:excluded", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.request.initiator_policy.who_can_start", answer: { kind: "choice", optionId: "any_employee", display: "Any employee" }, provenance: [{ kind: "human_editor", sourceId: "answer:initiator", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.request.fields.first_required_field", answer: "Field", provenance: [{ kind: "human_editor", sourceId: "answer:field", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.attachments.requirements.needed", answer: { kind: "choice", optionId: "no", display: "No" }, provenance: [{ kind: "human_editor", sourceId: "answer:attachment", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.workflow.stages.first_stage", answer: "Approval", provenance: [{ kind: "human_editor", sourceId: "answer:stage", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId: "decision.workflow.stages.first_stage_person_mode", answer: { kind: "choice", optionId: mode, display: mode }, provenance: [{ kind: "human_editor", sourceId: "answer:mode", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
      const state = getTemplateCopilotV2InterviewState(ledger, library);
      assert.equal(state.nextQuestion?.primaryDecisionId, "decision.workflow.stages.first_stage_person_detail");
      assert.equal(state.nextQuestion?.prompt.includes(locale === "en" ? "email address, job role, or request field" : locale === "zh-Hant" ? "電郵地址、職位或申請欄位" : "电子邮件地址、职位或申请字段"), false);
    }
  }
});

test("every pinned person resolver selects its declared localized prompt variant and skips assigned later", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const resolverDetails = library.questions.filter((question) => question.primaryDecision.decisionId.endsWith("person_detail"));
  assert.equal(resolverDetails.length, 20);
  const answerBefore = (target, mode, locale) => {
    let ledger = createTemplateCopilotV2Ledger({ ...scope, locale }, enabled);
    for (const question of library.questions.filter((candidate) => candidate.priority < target.priority)) {
      const optionId = question.primaryDecision.decisionId === target.personResolverPromptVariants.selectorDecisionId
        ? mode
        : question.primaryDecision.decisionId.endsWith("person_mode")
          ? "fixed_email"
          : question.answer.type === "choice"
            ? question.answer.options[0].optionId
            : "pre-filled answer";
      ledger = applyTemplateCopilotV2AtomicDecision({
        ledger,
        decisionId: question.primaryDecision.decisionId,
        answer: question.answer.type === "choice" ? { kind: "choice", optionId, display: optionId } : optionId,
        provenance: [{ kind: "human_editor", sourceId: `test:${question.questionId}`, sourceMessageIds: [] }],
        answeredAt: confirmedAt,
        flag: enabled,
      });
    }
    return ledger;
  };
  for (const target of resolverDetails) {
    assert.ok(target.personResolverPromptVariants, target.questionId);
    for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
      for (const mode of ["fixed_email", "directory_role", "request_field"]) {
        const state = getTemplateCopilotV2InterviewState(answerBefore(target, mode, locale), library);
        assert.equal(state.nextQuestion?.questionId, target.questionId, `${target.questionId}:${locale}:${mode}`);
        assert.equal(state.nextQuestion?.prompt, target.personResolverPromptVariants.variants[mode][locale], `${target.questionId}:${locale}:${mode}`);
      }
      const assignedLater = getTemplateCopilotV2InterviewState(answerBefore(target, "assigned_later", locale), library);
      assert.notEqual(assignedLater.nextQuestion?.questionId, target.questionId, `${target.questionId}:${locale}:assigned_later`);
    }
  }
});

test("explicit N/A eligibility is narrow and reopening a gating answer removes its reverse closure", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const excluded = library.questions.find((question) => question.primaryDecision.decisionId === "decision.workflow.scope.excluded");
  const requiredRoot = library.questions.find((question) => question.primaryDecision.decisionId === "decision.workflow.name.name");
  assert.equal(excluded.uncertainty.notApplicable, "when_optional");
  assert.equal(requiredRoot.uncertainty.notApplicable, "never");
  let ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const answers = [
    ["decision.workflow.name.name", "Name"], ["decision.workflow.purpose.purpose", "Purpose"], ["decision.workflow.scope.included", "Included"], ["decision.workflow.scope.excluded", "Excluded"], ["decision.request.initiator_policy.who_can_start", { kind: "choice", optionId: "selected_roles", display: "Selected roles" }], ["decision.request.initiator_policy.initiator_roles", "Managers"],
  ];
  for (const [decisionId, answer] of answers) ledger = applyTemplateCopilotV2AtomicDecision({ ledger, decisionId, answer, provenance: [{ kind: "human_editor", sourceId: `answer:${decisionId}`, sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
  const reopened = reopenTemplateCopilotV2Decision({ ledgerInput: ledger, decisionId: "decision.request.initiator_policy.who_can_start", libraryInput: library });
  assert.ok(reopened.removedDecisionIds.includes("decision.request.initiator_policy.initiator_roles"));
  assert.equal(reopened.ledger.atomicDecisions["decision.request.initiator_policy.who_can_start"], undefined);
  assert.equal(reopened.ledger.atomicDecisions["decision.request.initiator_policy.initiator_roles"], undefined);
});

test("a deferred root continues with independent questions, keeps dependents closed, then blocks for reopen", () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const deferred = { ...ledger, atomicDecisions: { "decision.workflow.name.name": { kind: "unknown", answer: "unknown", display: "Not sure", provenance: [{ kind: "human_editor", sourceId: "special:test", sourceMessageIds: [] }], answeredAt: confirmedAt } } };
  const interview = getTemplateCopilotV2InterviewState(deferred);
  assert.equal(interview.state, "question");
  assert.equal(interview.nextQuestion.primaryDecisionId, "decision.workflow.purpose.purpose");
  const allIndependent = structuredClone(deferred);
  for (const question of getTemplateCopilotQuestionLibrary("v2.0").questions) {
    if (question.primaryDecision.decisionId === "decision.workflow.name.name" || question.prerequisiteDecisionIds.includes("decision.workflow.name.name")) continue;
    allIndependent.atomicDecisions[question.primaryDecision.decisionId] = { kind: question.answer.type === "choice" ? "choice" : "text", answer: question.answer.type === "choice" ? question.answer.options[0].optionId : "answered", ...(question.answer.type === "choice" ? { optionId: question.answer.options[0].optionId } : {}), display: "answered", provenance: [{ kind: "human_editor", sourceId: `answer:${question.questionId}`, sourceMessageIds: [] }], answeredAt: confirmedAt };
  }
  assert.equal(getTemplateCopilotV2InterviewState(allIndependent).state, "blocked");
  const candidates = assembleTemplateCopilotV2FactCandidates(deferred);
  assert.equal(candidates["workflow.name"].state, "incomplete");
});

test("special review uses the original pinned localized question, never the generic decision display", () => {
  const expected = {
    en: "What should we call this approval workflow?",
    "zh-Hant": "這個審批流程應叫甚麼名稱？",
    "zh-Hans": "这个审批流程应叫什么名称？",
  };
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const ledger = createTemplateCopilotV2Ledger({ ...scope, locale }, enabled);
    const special = { ...ledger, atomicDecisions: { "decision.workflow.name.name": { kind: "unknown", answer: "unknown", display: locale === "en" ? "Not sure" : "不確定", provenance: [{ kind: "human_editor", sourceId: "special:review", sourceMessageIds: [] }], answeredAt: confirmedAt } } };
    const review = getTemplateCopilotV2SpecialReview(special);
    assert.deepEqual(review.map(({ decisionId, questionId, prompt, kind }) => ({ decisionId, questionId, prompt, kind })), [{ decisionId: "decision.workflow.name.name", questionId: "v2.workflow.name.name", prompt: expected[locale], kind: "unknown" }]);
    assert.notEqual(review[0].prompt, special.atomicDecisions["decision.workflow.name.name"].display);
  }
});

test("controller is locale-independent and refresh/resume stays on the ledger-pinned version", () => {
  const english = createTemplateCopilotV2Ledger({ ...scope, locale: "en" }, enabled);
  const traditional = createTemplateCopilotV2Ledger({ ...scope, locale: "zh-Hant" }, enabled);
  const englishState = getTemplateCopilotV2InterviewState(english);
  const traditionalState = getTemplateCopilotV2InterviewState(traditional);
  assert.equal(englishState.libraryVersion, "v2.0");
  assert.equal(englishState.nextQuestion.questionId, traditionalState.nextQuestion.questionId);
  assert.equal(englishState.nextQuestion.targetFactId, traditionalState.nextQuestion.targetFactId);
  assert.notEqual(englishState.nextQuestion.prompt, traditionalState.nextQuestion.prompt);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const state = getTemplateCopilotV2InterviewState(createTemplateCopilotV2Ledger({ ...scope, locale }, enabled));
    assert.equal(state.nextQuestion.helpLabel, locale === "en" ? "Help" : locale === "zh-Hant" ? "說明" : "说明");
    assert.equal(state.nextQuestion.helpBody.length > 0, true);
  }
  const exampleQuestion = getTemplateCopilotQuestionLibrary("v2.0").questions.find((question) => question.example);
  const exampleState = getTemplateCopilotV2InterviewState(createTemplateCopilotV2Ledger({ ...scope, locale: "en" }, enabled), validateTemplateCopilotQuestionLibrary({ ...getTemplateCopilotQuestionLibrary("v2.0"), questions: [{ ...exampleQuestion, priority: 1 }, ...getTemplateCopilotQuestionLibrary("v2.0").questions.filter((question) => question !== exampleQuestion).map((question, index) => ({ ...question, priority: index + 1000 }))] }));
  assert.equal(exampleState.nextQuestion.exampleLabel, "Example");
  assert.equal(exampleState.nextQuestion.example.startsWith("Example:"), false);
  assert.deepEqual(englishState, getTemplateCopilotV2InterviewState(structuredClone(english)));
});

test("library validation rejects unknown IDs, duplicate identity/priority, multi-target decisions, and cycles", () => {
  const base = () => structuredClone(getTemplateCopilotQuestionLibrary("v2.0"));
  const unknown = base();
  unknown.questions[0].targetFactId = "unknown.field";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(unknown), TemplateCopilotQuestionLibraryError);
  const duplicateId = base();
  duplicateId.questions[1].questionId = duplicateId.questions[0].questionId;
  assert.throws(() => validateTemplateCopilotQuestionLibrary(duplicateId), /Duplicate question ID/);
  const duplicatePriority = base();
  duplicatePriority.questions[1].priority = duplicatePriority.questions[0].priority;
  assert.throws(() => validateTemplateCopilotQuestionLibrary(duplicatePriority), /Duplicate question priority/);
  const multiTarget = base();
  multiTarget.questions[0].primaryDecision.factId = "workflow.purpose";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(multiTarget), /one declared fact/);
  const cycle = base();
  cycle.questions.find((question) => question.primaryDecision.decisionId === "decision.workflow.stages.stage_2_person_mode").prerequisiteDecisionIds = ["decision.workflow.stages.stage_2_person_detail"];
  assert.throws(() => validateTemplateCopilotQuestionLibrary(cycle), /prerequisite cycle/);
});

test("library validation rejects malformed choice options and non-canonical applicability values", () => {
  const base = () => structuredClone(getTemplateCopilotQuestionLibrary("v2.0"));
  const missingChoiceOptions = base();
  missingChoiceOptions.questions.find((question) => question.answer.type === "choice").answer.options = undefined;
  assert.throws(() => validateTemplateCopilotQuestionLibrary(missingChoiceOptions), /must declare options/);
  const textWithOptions = base();
  textWithOptions.questions.find((question) => question.answer.type === "short_text").answer.options = structuredClone(base().questions.find((question) => question.answer.type === "choice").answer.options);
  assert.throws(() => validateTemplateCopilotQuestionLibrary(textWithOptions), /cannot declare options/);
  const duplicateOption = base();
  const choice = duplicateOption.questions.find((question) => question.answer.type === "choice");
  choice.answer.options[1].optionId = choice.answer.options[0].optionId;
  assert.throws(() => validateTemplateCopilotQuestionLibrary(duplicateOption), /duplicate option IDs/);
  const textApplicability = base();
  const dependent = textApplicability.questions.find((question) => question.primaryDecision.decisionId === "decision.attachments.requirements.first_file");
  dependent.applicability.decisionId = "decision.workflow.name.name";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(textApplicability), /choice decision for applicability/);
  const unknownApplicabilityOption = base();
  unknownApplicabilityOption.questions.find((question) => question.primaryDecision.decisionId === "decision.attachments.requirements.first_file").applicability.values = ["not_an_option"];
  assert.throws(() => validateTemplateCopilotQuestionLibrary(unknownApplicabilityOption), /invalid applicability option/);
});

test("resolver prompt variants require a pinned earlier resolver choice and exactly the applicable modes", () => {
  const base = () => structuredClone(getTemplateCopilotQuestionLibrary("v2.0"));
  const detail = (library) => library.questions.find((question) => question.primaryDecision.decisionId === "decision.workflow.stages.first_stage_person_detail");
  const missing = base();
  delete detail(missing).personResolverPromptVariants;
  assert.throws(() => validateTemplateCopilotQuestionLibrary(missing), /must declare pinned prompt variants/);
  const wrongSelector = base();
  detail(wrongSelector).personResolverPromptVariants.selectorDecisionId = "decision.attachments.requirements.needed";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(wrongSelector), /selector as a prerequisite/);
  const missingMode = base();
  missingMode.questions.find((question) => question.primaryDecision.decisionId === "decision.workflow.stages.first_stage_person_mode").answer.options = [
    { optionId: "fixed_email", label: { en: "Fixed", "zh-Hant": "固定", "zh-Hans": "固定" } },
    { optionId: "assigned_later", label: { en: "Later", "zh-Hant": "稍後", "zh-Hans": "稍后" } },
  ];
  assert.throws(() => validateTemplateCopilotQuestionLibrary(missingMode), /prompt variants|invalid applicability option/);
  const extraVariant = base();
  extraVariant.questions.find((question) => question.primaryDecision.decisionId === "decision.workflow.stages.first_stage_person_detail").personResolverPromptVariants.variants.unexpected = { en: "Unexpected", "zh-Hant": "意外", "zh-Hans": "意外" };
  assert.throws(() => validateTemplateCopilotQuestionLibrary(extraVariant), /invalid shape/);
  const inapplicableLater = base();
  detail(inapplicableLater).applicability.values.push("assigned_later");
  assert.throws(() => validateTemplateCopilotQuestionLibrary(inapplicableLater), /applicable only/);
});

test("guided primary prompts are single-decision plain language and reserve examples outside the question", () => {
  const banned = /\b(conditional route|escalation|governing polic|ad-hoc contributor|shared fulfilment|business-calendar|threshold|parallel branch|handoff)\b/i;
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  for (const question of library.questions) {
    assert.equal(banned.test(question.prompt.en), false, question.questionId);
    assert.equal(question.prompt.en.split("?").filter(Boolean).length <= 1, true, question.questionId);
  }
  for (const question of library.questions.filter((question) => question.example)) {
    for (const body of Object.values(question.example)) assert.equal(/^(Example:|例如[：:]|示例[：:])/u.test(body), false, question.questionId);
  }
});

test("pinned contextual help explains each difficult topic in plain language across all three locales", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const byDecision = (id) => library.questions.find((question) => question.primaryDecision.decisionId === id);
  const keyTopics = [
    "decision.workflow.name.name",
    "decision.request.fields.first_required_field",
    "decision.attachments.requirements.first_file",
    "decision.workflow.stages.first_stage_person_mode",
    "decision.workflow.conditions.comparison",
    "decision.workflow.rejection_policy.after_rejection",
    "decision.collaboration.policy.another_person_upload",
    "decision.timing.rules.overdue_action",
    "decision.visibility.policy.who_can_view",
    "decision.notifications.rules.event",
    "decision.governance.owner.owning_department",
    "decision.governance.policies.policy_name",
    "decision.governance.retention.retention",
  ];
  const banned = /\b(conditional route|escalation|governing polic|ad-hoc contributor|shared fulfilment|business-calendar|threshold|parallel branch|handoff)\b/i;
  for (const question of library.questions) {
    assert.equal(banned.test(question.help.body.en), false, question.questionId);
    assert.equal(/use the example/i.test(question.help.body.en), false, question.questionId);
    assert.equal(question.help.conceptRef, `copilot.${question.targetFactId}`);
  }
  for (const decisionId of keyTopics) {
    const question = byDecision(decisionId);
    assert.ok(question, decisionId);
    for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
      assert.ok(question.help.body[locale].length > 10, `${decisionId}:${locale}`);
      assert.notEqual(question.help.body[locale], "Use the example if helpful. You can choose Not sure and come back later.");
    }
  }
  assert.ok(new Set(library.questions.map((question) => question.help.body.en)).size > 20, "help must not be one generic body repeated for every question");
});

test("bounded collections have server-owned stable IDs, continue gates, and a clear maximum", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const questionsFor = (factId, prefix) => library.questions.filter((question) => question.targetFactId === factId && question.primaryDecision.decisionId.includes(prefix));
  assert.equal(questionsFor("request.fields", ".field_").length, 19, "first_required_field plus 19 stable follow-up IDs gives a maximum of 20");
  assert.equal(questionsFor("attachments.requirements", ".file_").length, 19, "the first attachment uses the stable first_file ID");
  assert.equal(questionsFor("workflow.stages", ".stage_").length >= 56, true);
  assert.equal(questionsFor("workflow.conditions", ".condition_").length, 45, "each of nine repeated conditions has five atomic decisions");
  assert.equal(questionsFor("notifications.rules", ".notification_").length, 57, "each of nineteen repeated notifications has three atomic decisions");
  assert.equal(library.questions.some((question) => question.primaryDecision.decisionId.endsWith("add_another_20")), false);
  for (const question of library.questions.filter((question) => question.answer.type === "choice")) {
    assert.ok(question.answer.options?.every((option) => /^[a-z][a-z0-9_-]+$/.test(option.optionId)));
  }
});

test("every repeated condition comparison and notification channel has stable, localized choice options", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const comparisons = library.questions.filter((question) => /^decision\.workflow\.conditions\.(?:comparison|condition_\d{2}_comparison)$/.test(question.primaryDecision.decisionId));
  const channels = library.questions.filter((question) => /^decision\.notifications\.rules\.(?:channel|notification_\d{2}_channel)$/.test(question.primaryDecision.decisionId));
  assert.equal(comparisons.length, 10);
  assert.equal(channels.length, 20);
  const comparisonIds = ["equals", "not_equals", "greater_than", "at_least", "less_than", "at_most"];
  const channelIds = ["in_app", "email"];
  for (const question of comparisons) {
    assert.deepEqual(question.answer.options.map((option) => option.optionId), comparisonIds, question.questionId);
    for (const option of question.answer.options) {
      assert.notEqual(option.label["zh-Hant"], option.label.en, `${question.questionId}:${option.optionId}:traditional`);
      assert.notEqual(option.label["zh-Hans"], option.label.en, `${question.questionId}:${option.optionId}:simplified`);
    }
  }
  for (const question of channels) {
    assert.deepEqual(question.answer.options.map((option) => option.optionId), channelIds, question.questionId);
    for (const option of question.answer.options) {
      assert.notEqual(option.label["zh-Hant"], option.label.en, `${question.questionId}:${option.optionId}:traditional`);
      assert.notEqual(option.label["zh-Hans"], option.label.en, `${question.questionId}:${option.optionId}:simplified`);
    }
  }
});

test("required facts cannot be hidden by a malformed library", () => {
  const hidden = structuredClone(getTemplateCopilotQuestionLibrary("v2.0"));
  for (const question of hidden.questions.filter((question) => question.targetFactId === "workflow.name")) question.applicability = { kind: "decision_equals", decisionId: "decision.workflow.purpose.purpose", values: ["yes"] };
  assert.throws(() => validateTemplateCopilotQuestionLibrary(hidden), /always-applicable root/);
  const missing = structuredClone(getTemplateCopilotQuestionLibrary("v2.0"));
  missing.questions = missing.questions.filter((question) => question.targetFactId !== "workflow.name");
  assert.throws(() => validateTemplateCopilotQuestionLibrary(missing), /no questions/);
});

test("the pinned library is deeply immutable and its known references are bound to its target", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const visited = new WeakSet();
  const assertRecursivelyFrozen = (value, path = "library") => {
    if (value === null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
    for (const key of Reflect.ownKeys(value)) {
      assertRecursivelyFrozen(value[key], `${path}.${String(key)}`);
    }
  };
  assertRecursivelyFrozen(library);
  assert.equal(Object.isFrozen(library.questions[0].prompt), true);
  assert.equal(Object.isFrozen(library.questions[0].primaryDecision), true);
  assert.equal(Object.isFrozen(library.questions[0].prerequisiteDecisionIds), true);
  assert.equal(Object.isFrozen(library.questions[0].uncertainty), true);
  assert.throws(() => { library.questions[0].prompt.en = "Mutated"; }, TypeError);
  assert.throws(() => { library.questions[0].uncertainty.notApplicable = "when_optional"; }, TypeError);
  const choice = library.questions.find((question) => question.answer.type === "choice");
  assert.equal(Object.isFrozen(choice.answer.options), true);
  assert.equal(Object.isFrozen(choice.answer.options[0]), true);
  assert.equal(Object.isFrozen(choice.answer.options[0].label), true);
  assert.throws(() => { choice.answer.options[0].optionId = "mutated"; }, TypeError);
  assert.throws(() => { choice.answer.options[0].label.en = "Mutated"; }, TypeError);
  assert.throws(() => { choice.answer.options[0].label["zh-Hant"] = "已變更"; }, TypeError);
  assert.throws(() => { choice.answer.options[0].label["zh-Hans"] = "已更改"; }, TypeError);
  const resolverDetail = library.questions.find((question) => question.primaryDecision.decisionId.endsWith("person_detail"));
  assert.equal(Object.isFrozen(resolverDetail.personResolverPromptVariants), true);
  assert.equal(Object.isFrozen(resolverDetail.personResolverPromptVariants.variants), true);
  assert.equal(Object.isFrozen(resolverDetail.personResolverPromptVariants.variants.fixed_email), true);
  assert.throws(() => { resolverDetail.personResolverPromptVariants.variants.fixed_email.en = "Mutated"; }, TypeError);
  assert.equal(Object.isFrozen(library.questions[0].help.body), true);
  assert.throws(() => { library.questions[0].help.body.en = "Mutated"; }, TypeError);
  const malformedSchema = structuredClone(library);
  malformedSchema.questions[0].answer.schemaRef = "v2.fact.workflow.purpose.v1";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(malformedSchema), /schema reference/);
  const malformedHelp = structuredClone(library);
  malformedHelp.questions[0].help.conceptRef = "copilot.unknown";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(malformedHelp), /help reference/);
  const bumped = structuredClone(library);
  bumped.version = "v2.1";
  bumped.questions.find((question) => question.personResolverPromptVariants).personResolverPromptVariants.variants.fixed_email.en = "Changed only in a new library version";
  assert.throws(() => getTemplateCopilotV2InterviewState(createTemplateCopilotV2Ledger(scope, enabled), bumped), /does not match the ledger's pinned version/);
});
