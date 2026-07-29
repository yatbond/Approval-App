import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  nextTemplateCopilotV2PendingStart,
  parseTemplateCopilotV2PendingStart,
} from "./template-copilot-v2-client-command.ts";
import { templateCopilotStartSchema } from "./template-copilot-ledger.ts";
import {
  evaluateTemplateCopilotV2Step8LocaleGate,
  resolveTemplateCopilotV2Step8QualificationDeployment,
  resolveTemplateCopilotV2Step8QualificationMode,
} from "./template-copilot-v2-step8-rollout.ts";
import { isTemplateCopilotQuestionLibraryStartAllowed } from "./template-copilot-v2-step8-review.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("new starts remain on v2.1 while Step 8 accessibility qualification is pending without changing legacy recovery", () => {
  const createKey = () => "start:step8:test";
  const scope = {
    businessUnitId: "00000000-0000-4000-8000-000000000001",
    departmentName: "Finance",
    locale: "zh-Hant",
  };
  const current = nextTemplateCopilotV2PendingStart({ pending: null, ...scope, createKey });
  assert.equal(current.questionLibraryVersion, "v2.1");
  assert.equal(parseTemplateCopilotV2PendingStart(current).questionLibraryVersion, "v2.1");
  assert.equal(parseTemplateCopilotV2PendingStart({ ...current, questionLibraryVersion: undefined }).questionLibraryVersion, "v2.0");
  assert.equal(parseTemplateCopilotV2PendingStart({ ...current, questionLibraryVersion: "v2.1" }).questionLibraryVersion, "v2.1");
  assert.equal(templateCopilotStartSchema.safeParse({ ...scope, questionLibraryVersion: "v2.2", clientMessageId: "start:step8:test" }).success, true);
});

test("the Step 8 qualification switch is explicit, case-sensitive, and disabled by default", () => {
  assert.equal(resolveTemplateCopilotV2Step8QualificationMode(undefined), false);
  assert.equal(resolveTemplateCopilotV2Step8QualificationMode(""), false);
  assert.equal(resolveTemplateCopilotV2Step8QualificationMode("false"), false);
  assert.equal(resolveTemplateCopilotV2Step8QualificationMode("TRUE"), false);
  assert.equal(resolveTemplateCopilotV2Step8QualificationMode("1"), false);
  assert.equal(resolveTemplateCopilotV2Step8QualificationMode("true"), true);
});

test("qualification authority is Preview-only and every other deployment fails closed", () => {
  for (const qualificationMode of [false, true]) {
    for (const vercelEnvironment of [undefined, "", "development", "production", "Preview", "PREVIEW"]) {
      assert.equal(resolveTemplateCopilotV2Step8QualificationDeployment({
        qualificationMode,
        vercelEnvironment,
      }), false);
    }
  }
  assert.equal(resolveTemplateCopilotV2Step8QualificationDeployment({
    qualificationMode: true,
    vercelEnvironment: "preview",
  }), true);
});

test("v2.0 and v2.1 remain safe starts while v2.2 requires Production or isolated Preview authority", () => {
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    assert.equal(isTemplateCopilotQuestionLibraryStartAllowed("v2.0", locale), true);
    assert.equal(isTemplateCopilotQuestionLibraryStartAllowed("v2.1", locale), true);
    assert.equal(isTemplateCopilotQuestionLibraryStartAllowed("v2.2", locale), false);
  }
});

test("the real environment-bound gate enables reviewed v2.2 only in Preview and never marks it Production-ready", () => {
  const rolloutUrl = new URL("./template-copilot-v2-step8-rollout.ts", import.meta.url).href;
  const reviewUrl = new URL("./template-copilot-v2-step8-review.ts", import.meta.url).href;
  const script = `
    import { getTemplateCopilotPreferredQuestionLibraryVersion } from ${JSON.stringify(rolloutUrl)};
    import {
      isTemplateCopilotQuestionLibraryStartAllowed,
      isTemplateCopilotQuestionLocaleProductionReady,
      isTemplateCopilotQuestionLocaleQualificationReady,
    } from ${JSON.stringify(reviewUrl)};
    const locales = ["en", "zh-Hant", "zh-Hans"];
    console.log(JSON.stringify({
      preferred: getTemplateCopilotPreferredQuestionLibraryVersion(),
      locales: Object.fromEntries(locales.map((locale) => [locale, {
        startAllowed: isTemplateCopilotQuestionLibraryStartAllowed("v2.2", locale),
        qualificationReady: isTemplateCopilotQuestionLocaleQualificationReady(locale),
        productionReady: isTemplateCopilotQuestionLocaleProductionReady(locale),
      }])),
    }));
  `;
  const run = (vercelEnvironment) => spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "--input-type=module", "-e", script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        NEXT_PUBLIC_TEMPLATE_COPILOT_V2_STEP8_QUALIFICATION: "true",
        VERCEL_ENV: vercelEnvironment,
      },
    },
  );
  const preview = run("preview");
  assert.equal(preview.status, 0, preview.stderr);
  const previewResult = JSON.parse(preview.stdout);
  assert.equal(previewResult.preferred, "v2.2");
  for (const locale of Object.values(previewResult.locales)) {
    assert.equal(locale.startAllowed, true);
    assert.equal(locale.qualificationReady, true);
    assert.equal(locale.productionReady, false);
  }
  const production = run("production");
  assert.equal(production.status, 0, production.stderr);
  const productionResult = JSON.parse(production.stdout);
  assert.equal(productionResult.preferred, "v2.2");
  for (const locale of Object.values(productionResult.locales)) {
    assert.equal(locale.startAllowed, false);
    assert.equal(locale.qualificationReady, false);
    assert.equal(locale.productionReady, false);
  }
});

test("the locale gate requires rollout enablement, named human question evidence, and approved concept content together", () => {
  const approvedQuestionReview = {
    status: "approved",
    reviewerType: "human",
    reviewer: "Ada Wong",
    reviewedAt: "2026-07-28T10:00:00+08:00",
    evidenceRef: "review-ticket/STEP8-EN",
  };
  assert.equal(evaluateTemplateCopilotV2Step8LocaleGate({
    rolloutEnabled: true,
    questionReview: approvedQuestionReview,
    conceptReady: true,
  }), true);
  assert.equal(evaluateTemplateCopilotV2Step8LocaleGate({
    rolloutEnabled: false,
    questionReview: approvedQuestionReview,
    conceptReady: true,
  }), false);
  assert.equal(evaluateTemplateCopilotV2Step8LocaleGate({
    rolloutEnabled: true,
    questionReview: { ...approvedQuestionReview, status: "pending" },
    conceptReady: true,
  }), false);
  assert.equal(evaluateTemplateCopilotV2Step8LocaleGate({
    rolloutEnabled: true,
    questionReview: { ...approvedQuestionReview, reviewer: "AI reviewer" },
    conceptReady: true,
  }), false);
  assert.equal(evaluateTemplateCopilotV2Step8LocaleGate({
    rolloutEnabled: true,
    questionReview: approvedQuestionReview,
    conceptReady: false,
  }), false);
});

test("Step 8 is wired through the real client, server contracts, Admin view, telemetry, and rollback-compatible interaction", async () => {
  const [
    client,
    serverData,
    startRoute,
    sessionRoute,
    questionLibrary,
    step4,
    http,
    adminView,
    adminPanel,
    rollout,
  ] = await Promise.all([
    read("../app/template-copilot.tsx"),
    read("./template-copilot-v2-server-data.ts"),
    read("../app/api/template-authoring/copilot/sessions/route.ts"),
    read("../app/api/template-authoring/copilot/sessions/[sessionId]/route.ts"),
    read("./template-copilot-question-library.ts"),
    read("./template-copilot-v2-step4.ts"),
    read("./template-authoring-http.ts"),
    read("../app/admin-view.tsx"),
    read("../app/admin-copilot-concept-review-panel.tsx"),
    read("./template-copilot-v2-step8-rollout.ts"),
  ]);
  assert.ok((client.match(/getTemplateCopilotPreferredQuestionLibraryVersion\(\)/g) || []).length >= 2);
  assert.match(client, /<TemplateCopilotConceptHelp detail=\{state\.interview\.nextQuestion\.helpDetail\}/);
  assert.match(serverData, /questionLibraryVersion\?: "v2\.0" \| "v2\.1" \| "v2\.2"/);
  assert.match(startRoute, /isTemplateCopilotQuestionLibraryStartAllowed\(parsed\.data\.questionLibraryVersion, locale\)/);
  assert.match(startRoute, /question_library_locale_not_approved/);
  assert.match(startRoute, /current browsers persist and send the rollout-selected pin/);
  assert.match(sessionRoute, /logTemplateCopilotHelpFallback\(correlationId, interview\)/);
  assert.match(questionLibrary, /conceptLibraryVersion: "concepts\.v1\.0"/);
  assert.match(questionLibrary, /"v2\.2": v22QuestionLibrary/);
  assert.match(step4, /libraryVersion !== "v2\.1" && libraryVersion !== "v2\.2"/);
  assert.match(http, /logTemplateCopilotHelpFallback\(correlationId, result\)/);
  assert.match(adminView, /<AdminCopilotConceptReviewPanel \/>/);
  assert.match(adminPanel, /Runtime AI translation is not used/);
  assert.match(adminPanel, /Concept topics reviewed/);
  assert.match(adminPanel, /Guided questions reviewed/);
  assert.match(adminPanel, /Language review approved; accessibility qualification pending/);
  assert.doesNotMatch(adminPanel, /Pending human approval/);
  assert.match(adminPanel, /Question content:/);
  assert.match(adminPanel, /template_copilot_help_fallback/);
  assert.match(rollout, /preferredNewSessionVersion: "v2\.1"/);
  assert.match(rollout, /enabledCandidateLocales: Object\.freeze\(\[\]/);
  assert.match(rollout, /NEXT_PUBLIC_TEMPLATE_COPILOT_V2_STEP8_QUALIFICATION/);
  assert.match(rollout, /qualificationCandidateLocales: Object\.freeze\(\["en", "zh-Hant", "zh-Hans"\]/);
});

test("the Step 8 runtime library is static reviewed content with no model translation path", async () => {
  const concepts = await read("./template-copilot-concepts.ts");
  assert.doesNotMatch(concepts, /\b(?:fetch|OpenAI|chat\.completions|responses\.create|translateText)\s*\(/);
  assert.doesNotMatch(concepts, /TEMPLATE_COPILOT_MODEL|OPENROUTER_API_KEY|ZAI_API_KEY/);
  assert.match(concepts, /mode: z\.literal\("approved_content_only"\)/);
  assert.match(concepts, /reviewerType: z\.enum\(\["human", "system"\]\)/);
  assert.match(concepts, /options\.production/);
});

test("the authenticated browser gate covers all locales, keyboard, CJK/mobile layout, dark mode, and automated axe", async () => {
  const [script, packageJson] = await Promise.all([
    read("../../scripts/test-template-copilot-v2-step8-browser.mjs"),
    read("../../package.json"),
  ]);
  assert.match(script, /for \(const locale of \["en", "zh-Hant", "zh-Hans"\]\)/);
  assert.match(script, /database\.auth\.admin\.createUser/);
  assert.match(script, /database\.auth\.admin\.deleteUser/);
  assert.match(script, /email_confirm: true/);
  assert.match(script, /await establishPreviewAccess\(browser\)/);
  assert.match(script, /page\.goto\(previewUrl/);
  assert.match(script, /deployment\?\.environment, "preview"/);
  assert.match(script, /source\?\.revision, expectedRevision/);
  assert.match(script, /page\.keyboard\.press\("Enter"\)/);
  assert.match(script, /page\.keyboard\.press\("Space"\)/);
  assert.match(script, /new AxeBuilder\(\{ page \}\)\.analyze\(\)/);
  assert.match(script, /dataset\.theme = "dark"/);
  assert.match(script, /setViewportSize\(\{ width: 390, height: 844 \}\)/);
  assert.match(script, /locator\("#copilot-current-question-help"\)/);
  assert.match(script, /data-help-section='explanation'/);
  assert.match(script, /renderedStressText/);
  assert.match(script, /實際寫入說明元件/);
  assert.match(script, /实际写入说明组件/);
  assert.match(script, /scrollWidth <= document\.documentElement\.clientWidth/);
  assert.match(packageJson, /test:e2e:template-copilot-v2-step8/);
});

test("the Phase 2 runbook documents pins, evidence, fallback, telemetry, qualification, and non-destructive rollback", async () => {
  const docs = await read("../../docs/template-authoring/phase-2-template-copilot.md");
  assert.match(docs, /## Step 8 language-review candidate/);
  assert.match(docs, /questionLibraryVersion: v2\.2/);
  assert.match(docs, /conceptLibraryVersion: concepts\.v1\.0/);
  assert.match(docs, /Human language review approved; accessibility qualification pending/);
  assert.match(docs, /v2\.1 remains the preferred version for new sessions/);
  assert.match(docs, /template_copilot_help_fallback/);
  assert.match(docs, /Runtime model\s+translation is never permitted/);
  assert.match(docs, /test:e2e:template-copilot-v2-step8/);
  assert.match(docs, /server must retain `v2\.2` and `concepts\.v1\.0`/);
  assert.match(docs, /requires no database\s+migration/);
});

test("the durable human-review package covers every concept and question in every locale without prefilled approval", async () => {
  const [csv, exporter] = await Promise.all([
    read("../../docs/template-authoring/step-8-language-review.csv"),
    read("../../scripts/export-template-copilot-v2-step8-language-review.mjs"),
  ]);
  const lines = csv.replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1177);
  assert.equal(lines.filter((line) => line.includes('"concepts.v1.0"')).length, 0);
  assert.equal(lines.filter((line) => line.includes('"fnv1a64:4a149e693daab18d"')).length, 48);
  assert.equal(lines.filter((line) => line.includes('"fnv1a64:df415823535ac40f"')).length, 1128);
  assert.equal(lines.filter((line) => /,"(?:en|zh-Hant|zh-Hans)",/.test(line)).length, 1176);
  assert.equal(lines.filter((line) => line.endsWith(',"","","","",""')).length, 1176);
  assert.equal(lines.filter((line) => line.startsWith('"question_prompt_variant",')).length, 180);
  assert.equal(lines.filter((line) => /#fixed_email"/.test(line)).length, 60);
  assert.equal(lines.filter((line) => /#directory_role"/.test(line)).length, 60);
  assert.equal(lines.filter((line) => /#request_field"/.test(line)).length, 60);
  assert.match(exporter, /for \(const entry of conceptLibrary\.entries\)/);
  assert.match(exporter, /for \(const question of questionLibrary\.questions\)/);
  assert.match(exporter, /question\.personResolverPromptVariants\?\.variants/);
  assert.match(exporter, /reviewer_decision: ""/);
});
