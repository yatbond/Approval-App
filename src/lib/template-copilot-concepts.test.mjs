import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getTemplateCopilotConceptLibrary,
  getTemplateCopilotConceptReviewSummary,
  getTemplateCopilotHelpFallbackTelemetry,
  resolveTemplateCopilotConcept,
  templateCopilotConceptContentFingerprint,
  templateCopilotConceptLocales,
  validateTemplateCopilotConceptLibrary,
} from "./template-copilot-concepts.ts";
import {
  getTemplateCopilotQuestionLibrary,
  getTemplateCopilotV2InterviewState,
  validateTemplateCopilotQuestionLibrary,
} from "./template-copilot-question-library.ts";
import {
  getTemplateCopilotQuestionReviewSummary,
  isTemplateCopilotQuestionLocaleProductionReady,
} from "./template-copilot-v2-step8-review.ts";
import {
  applyTemplateCopilotV2AtomicDecision,
  createTemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";

const enabled = { enabled: true };
const scope = {
  businessUnitId: "00000000-0000-4000-8000-000000000001",
  businessName: "Example Business",
  departmentId: "00000000-0000-4000-8000-000000000002",
  departmentName: "Finance",
};

function approvedConceptLibrary() {
  const library = structuredClone(getTemplateCopilotConceptLibrary("concepts.v1.0"));
  library.enabledLocales = [...templateCopilotConceptLocales];
  for (const entry of library.entries) {
    for (const locale of templateCopilotConceptLocales) {
      entry.review[locale] = {
        status: "approved",
        reviewerType: "human",
        reviewer: `Named test reviewer for ${locale}`,
        reviewedAt: "2026-07-28T10:00:00+08:00",
        evidenceRef: `test-evidence/step8/${locale}`,
      };
    }
  }
  return library;
}

test("the pinned concept candidate is complete and immutable but honestly pending in all three locales", () => {
  const library = getTemplateCopilotConceptLibrary("concepts.v1.0");
  const summary = getTemplateCopilotConceptReviewSummary();
  assert.equal(summary.version, library.version);
  assert.equal(summary.conceptCount, 16);
  assert.equal(summary.productionReady, false);
  assert.deepEqual(summary.enabledLocales, []);
  assert.equal(new Set(library.entries.map((entry) => entry.conceptId)).size, library.entries.length);
  for (const entry of library.entries) {
    assert.match(entry.conceptId, /^copilot\./);
    assert.match(entry.version, /^\d+\.\d+$/);
    assert.ok(entry.semanticContract.length > 0);
    for (const locale of templateCopilotConceptLocales) {
      const localized = entry.content[locale];
      const review = entry.review[locale];
      assert.ok(localized.plainLabel.length > 0, `${entry.conceptId}:${locale}:label`);
      assert.ok(Array.from(localized.explanation).length > 10, `${entry.conceptId}:${locale}:explanation`);
      assert.ok(localized.example.length > 3, `${entry.conceptId}:${locale}:example`);
      assert.ok(Array.from(localized.workflowEffect).length > 10, `${entry.conceptId}:${locale}:effect`);
      assert.equal(review.status, "pending");
      assert.equal(review.reviewerType, "human");
      assert.equal(review.reviewer, "Unassigned reviewer");
      assert.equal(review.reviewedAt, undefined);
      assert.equal(review.evidenceRef, undefined);
    }
  }
  assert.equal(Object.isFrozen(library), true);
  assert.equal(Object.isFrozen(library.entries), true);
  assert.equal(Object.isFrozen(library.entries[0].content["zh-Hant"]), true);
  assert.throws(() => { library.entries[0].content.en.plainLabel = "changed"; }, TypeError);
});

test("production validation refuses missing, system-reviewed, pending, or review-evidence-free localized content", () => {
  const base = () => approvedConceptLibrary();
  assert.doesNotThrow(() => validateTemplateCopilotConceptLibrary(base(), { production: true }));
  const missing = base();
  delete missing.entries[0].content["zh-Hant"];
  missing.entries[0].review["zh-Hant"] = { status: "pending", reviewerType: "human", reviewer: "HK content owner" };
  missing.contentReviewFingerprint = templateCopilotConceptContentFingerprint(missing.entries);
  assert.throws(() => validateTemplateCopilotConceptLibrary(missing, { production: true }), /not production-approved/);

  const system = base();
  system.entries[0].review.en.reviewerType = "system";
  assert.throws(() => validateTemplateCopilotConceptLibrary(system), /invalid approved review evidence/);

  const aiNamed = base();
  aiNamed.entries[0].review.en.reviewer = "AI translation reviewer";
  assert.throws(() => validateTemplateCopilotConceptLibrary(aiNamed), /invalid approved review evidence/);

  const unassigned = base();
  unassigned.entries[0].review.en.reviewer = "Unassigned reviewer";
  assert.throws(() => validateTemplateCopilotConceptLibrary(unassigned), /invalid approved review evidence/);

  const noEvidence = base();
  delete noEvidence.entries[0].review.en.evidenceRef;
  assert.throws(() => validateTemplateCopilotConceptLibrary(noEvidence), /invalid approved review evidence/);

  const contentDrift = base();
  contentDrift.entries[0].content.en.explanation = "Changed after review.";
  assert.throws(() => validateTemplateCopilotConceptLibrary(contentDrift), /human-review fingerprint/);
});

test("missing or unreviewed locale content uses only an approved explicit fallback and emits bounded telemetry metadata", () => {
  const draft = approvedConceptLibrary();
  const target = draft.entries.find((entry) => entry.conceptId === "copilot.workflow.conditions");
  delete target.content["zh-Hant"];
  target.review["zh-Hant"] = { status: "pending", reviewerType: "human", reviewer: "HK content owner" };
  draft.contentReviewFingerprint = templateCopilotConceptContentFingerprint(draft.entries);
  const library = validateTemplateCopilotConceptLibrary(draft);
  const resolved = resolveTemplateCopilotConcept({
    libraryVersion: library.version,
    conceptId: target.conceptId,
    locale: "zh-Hant",
    libraryInput: library,
  });
  assert.equal(resolved.displayedLocale, "en");
  assert.equal(resolved.fallback.reason, "missing_locale");
  assert.equal(resolved.fallback.event, "template_copilot_help_fallback");
  assert.match(resolved.fallback.visibleNotice, /英文版本/);
  assert.deepEqual(resolved.content, target.content.en);

  const telemetry = getTemplateCopilotHelpFallbackTelemetry({
    nextQuestion: { helpDetail: { fallback: resolved.fallback } },
  });
  assert.equal(telemetry.conceptId, "copilot.workflow.conditions");
  assert.equal(telemetry.requestedLocale, "zh-Hant");
  assert.equal(telemetry.displayedLocale, "en");
});

test("a reviewed but disabled locale is not displayed before rollout approval", () => {
  const draft = approvedConceptLibrary();
  draft.enabledLocales = ["en", "zh-Hans"];
  const library = validateTemplateCopilotConceptLibrary(draft, { production: true });
  const resolved = resolveTemplateCopilotConcept({
    libraryVersion: library.version,
    conceptId: "copilot.workflow.name",
    locale: "zh-Hant",
    libraryInput: library,
  });
  assert.equal(resolved.displayedLocale, "en");
  assert.equal(resolved.fallback.reason, "locale_disabled");
  assert.match(resolved.fallback.visibleNotice, /英文版本/);
});

test("an unavailable concept is visible and does not fabricate or translate help", () => {
  const resolved = resolveTemplateCopilotConcept({
    libraryVersion: "concepts.v1.0",
    conceptId: "copilot.not.present",
    locale: "zh-Hans",
  });
  assert.equal(resolved.fallback.reason, "concept_unavailable");
  assert.equal(resolved.displayedLocale, "zh-Hans");
  assert.match(resolved.content.explanation, /暂时无法提供/);
  assert.equal(resolved.content.explanation, resolved.content.example);
});

test("v2.2 pins the pending candidate while v2.0 and v2.1 remain historically unchanged", () => {
  const v20 = getTemplateCopilotQuestionLibrary("v2.0");
  const v21 = getTemplateCopilotQuestionLibrary("v2.1");
  const v22 = getTemplateCopilotQuestionLibrary("v2.2");
  assert.equal(v20.conceptLibraryVersion, undefined);
  assert.equal(v21.conceptLibraryVersion, undefined);
  assert.equal(v22.conceptLibraryVersion, "concepts.v1.0");
  assert.equal(v22.contentReview.questionCount, 316);
  assert.equal(getTemplateCopilotQuestionReviewSummary().contentFingerprint, v22.contentReview.contentFingerprint);
  assert.equal(getTemplateCopilotQuestionReviewSummary().productionReady, false);
  assert.equal(isTemplateCopilotQuestionLocaleProductionReady("en"), false);
  assert.equal(v22.questions.length, 316);
  assert.notDeepEqual(v22.questions, v21.questions);
  assert.deepEqual(v20.questions, v21.questions);
  assert.equal(v21.questions.find((question) => question.primaryDecision.decisionId.endsWith("person_mode")).answer.options.find((option) => option.optionId === "directory_role").label.en, "A directory role");
  assert.equal(v22.questions.find((question) => question.primaryDecision.decisionId.endsWith("person_mode")).answer.options.find((option) => option.optionId === "directory_role").label.en, "A job role from the staff directory");
  const knownConceptIds = new Set(getTemplateCopilotConceptLibrary(v22.conceptLibraryVersion).entries.map((entry) => entry.conceptId));
  for (const question of v22.questions) assert.equal(knownConceptIds.has(question.help.conceptRef), true, question.questionId);

  const legacy = getTemplateCopilotV2InterviewState(createTemplateCopilotV2Ledger({ ...scope, locale: "en", questionLibraryVersion: "v2.1" }, enabled));
  const current = getTemplateCopilotV2InterviewState(createTemplateCopilotV2Ledger({ ...scope, locale: "en", questionLibraryVersion: "v2.2" }, enabled));
  assert.equal(legacy.nextQuestion.helpDetail, undefined);
  assert.equal(current.conceptLibraryVersion, "concepts.v1.0");
  assert.equal(current.nextQuestion.helpDetail.libraryVersion, "concepts.v1.0");
  assert.equal(current.nextQuestion.helpDetail.fallback.reason, "concept_unavailable");
  assert.equal(current.nextQuestion.interaction.enabled, true);

  const malformed = structuredClone(v22);
  malformed.conceptLibraryVersion = "concepts.v9.9";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(malformed), /does not pin its required concept library/);
  const contentDrift = structuredClone(v22);
  contentDrift.questions[0].prompt.en = "Changed after the recorded human review.";
  assert.throws(() => validateTemplateCopilotQuestionLibrary(contentDrift), /bound to its exact localized content/);
});

test("v2.2 primary questions use plain language and retain language-independent decision semantics", () => {
  const library = getTemplateCopilotQuestionLibrary("v2.2");
  const visibleEnglish = library.questions.flatMap((question) => [
    question.prompt.en,
    ...(question.answer.options || []).map((option) => option.label.en),
  ]).join("\n");
  assert.doesNotMatch(visibleEnglish, /\b(?:directory role|different route|route change|threshold|parallel branch|handoff|escalation|business-calendar|ad-hoc contributor|shared fulfilment|conditional route)\b/iu);
  assert.match(visibleEnglish, /job role from the staff directory/);
  assert.match(visibleEnglish, /different approval steps/);
  assert.match(visibleEnglish, /file or an in-app form/);
  assert.deepEqual(
    library.questions.map((question) => [question.questionId, question.primaryDecision, question.applicability]),
    getTemplateCopilotQuestionLibrary("v2.1").questions.map((question) => [question.questionId, question.primaryDecision, question.applicability]),
  );
});

test("concept meanings cover both file/form requirements and sequential/simultaneous stages in every locale", () => {
  const library = getTemplateCopilotConceptLibrary("concepts.v1.0");
  const attachments = library.entries.find((entry) => entry.conceptId === "copilot.attachments.requirements");
  const stages = library.entries.find((entry) => entry.conceptId === "copilot.workflow.stages");
  assert.deepEqual(attachments.semanticContract, ["collects.files", "collects.forms", "may_bind.stage"]);
  assert.deepEqual(stages.semanticContract, ["orders.actions", "may_run.parallel", "resolves.participants"]);
  for (const locale of templateCopilotConceptLocales) {
    assert.match(`${attachments.content[locale].plainLabel} ${attachments.content[locale].explanation} ${attachments.content[locale].example}`, locale === "en" ? /in-app form/iu : /表格|表单/u);
    assert.match(`${stages.content[locale].explanation} ${stages.content[locale].example}`, locale === "en" ? /same time/iu : /同時|同时/u);
  }
});

test("language changes presentation only: question order, semantic identity, and stored values remain equivalent", () => {
  const ledgers = Object.fromEntries(templateCopilotConceptLocales.map((locale) => [
    locale,
    createTemplateCopilotV2Ledger({ ...scope, locale, questionLibraryVersion: "v2.2" }, enabled),
  ]));
  const initial = Object.values(ledgers).map((ledger) => getTemplateCopilotV2InterviewState(ledger));
  assert.equal(new Set(initial.map((state) => state.nextQuestion.questionId)).size, 1);
  assert.equal(new Set(initial.map((state) => state.nextQuestion.targetFactId)).size, 1);
  assert.equal(new Set(initial.map((state) => state.nextQuestion.helpConceptRef)).size, 1);
  assert.equal(new Set(initial.map((state) => state.nextQuestion.helpDetail.conceptVersion)).size, 1);
  assert.equal(new Set(initial.map((state) => state.nextQuestion.prompt)).size, 3);

  const advanced = Object.fromEntries(Object.entries(ledgers).map(([locale, ledger]) => [
    locale,
    applyTemplateCopilotV2AtomicDecision({
      ledger,
      decisionId: "decision.workflow.name.name",
      answer: { kind: "text", text: "Global supplier payment" },
      provenance: [{ kind: "human_editor", sourceId: `test:${locale}`, sourceMessageIds: [] }],
      answeredAt: "2026-07-28T01:00:00Z",
      flag: enabled,
    }),
  ]));
  const advancedStates = Object.values(advanced).map((ledger) => getTemplateCopilotV2InterviewState(ledger));
  assert.equal(new Set(advancedStates.map((state) => state.nextQuestion.questionId)).size, 1);
  for (const ledger of Object.values(advanced)) {
    assert.equal(ledger.atomicDecisions["decision.workflow.name.name"].answer, "Global supplier payment");
    assert.equal(ledger.atomicDecisions["decision.workflow.name.name"].display, "Global supplier payment");
  }
});

test("pseudo-localized and long CJK help remains structurally safe without changing concept semantics", () => {
  const library = getTemplateCopilotConceptLibrary("concepts.v1.0");
  const entry = library.entries.find((candidate) => candidate.conceptId === "copilot.workflow.conditions");
  const pseudo = `［${entry.content.en.explanation.replace(/[A-Za-z]/g, (value) => `${value}\u0301`)}］`;
  assert.ok(Array.from(pseudo).length > Array.from(entry.content.en.explanation).length);
  assert.deepEqual(entry.semanticContract, ["compares.request_field", "selects.route"]);
  for (const locale of ["zh-Hant", "zh-Hans"]) {
    const localized = entry.content[locale];
    assert.match(localized.example, /HK\$10,000/u);
    assert.doesNotMatch(localized.explanation, /\b(?:threshold|parallel branch|handoff|escalation)\b/iu);
  }
});

test("the help control exposes native keyboard semantics, screen-reader relationships, and overflow-safe CJK layout", async () => {
  const source = await readFile(new URL("../app/template-copilot-concept-help.tsx", import.meta.url), "utf8");
  assert.match(source, /<button[\s\S]*type="button"[\s\S]*aria-expanded=\{open\}[\s\S]*aria-controls=\{panelId\}/);
  assert.match(source, /role="region"/);
  assert.match(source, /aria-labelledby=\{`\$\{panelId\}-title`\}/);
  assert.match(source, /<BookOpenText aria-hidden="true"/);
  assert.match(source, /role="status"/);
  assert.match(source, /min-h-11/);
  assert.match(source, /break-words/);
  assert.match(source, /\[overflow-wrap:anywhere\]/);
  assert.match(source, /data-help-section="explanation"/);
  assert.doesNotMatch(source, /onMouseEnter|onMouseOver|group-hover|title=/);
});
