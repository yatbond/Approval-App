import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleTemplateCopilotV3Review,
} from "./template-copilot-v3-review-assembly.ts";
import {
  templateCopilotV3SourceSpanId,
} from "./template-copilot-v3-evidence.ts";
import {
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatches,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  buildTemplateCopilotV3ProviderQuoteDeveloperPrompt,
  templateCopilotV3ProviderPromptVersion,
} from "./template-copilot-v3-provider-prompt.ts";
import {
  templateCopilotQualificationScenarios,
} from "../../scripts/template-copilot-qualification-scenarios.mjs";
import {
  templateCopilotV3SemanticScenarioManifest,
} from "../../scripts/template-copilot-v3-semantic-scenario-manifests.mjs";
import {
  templateCopilotV3QualificationExpectedLocaleCount,
  templateCopilotV3QualificationExpectedScenarioCount,
  templateCopilotV3QualificationExpectedScenariosPerLocale,
} from "../../scripts/template-copilot-v3-live-semantic-qualification-runner.mjs";

function scenario(id) {
  const value = templateCopilotQualificationScenarios.find(
    (entry) => entry.id === id,
  );
  assert.ok(value, `Missing scenario ${id}`);
  return value;
}

function span(messageId, text, quote, occurrence = 0) {
  let startCodeUnit = -1;
  let cursor = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    startCodeUnit = text.indexOf(quote, cursor);
    assert.notEqual(startCodeUnit, -1, `Missing quote ${quote}`);
    cursor = startCodeUnit + quote.length;
  }
  const startCodePoint = Array.from(text.slice(0, startCodeUnit)).length;
  const supplied = {
    messageId,
    startCodePoint,
    endCodePoint: startCodePoint + Array.from(quote).length,
    exactText: quote,
  };
  return Object.freeze({
    spanId: templateCopilotV3SourceSpanId(supplied),
    ...supplied,
  });
}

function located({ kind, messageId, text, anchorQuote = text, leaves }) {
  return Object.freeze({
    itemIndex: 0,
    kind,
    slot: kind === "stage" ? "stages_participants" : "attachments",
    anchor: span(messageId, text, anchorQuote),
    leaves: Object.freeze(
      leaves.map((leaf) =>
        Object.freeze({
          role: leaf.role,
          hint: leaf.hint ?? null,
          sourceSpan: span(
            messageId,
            text,
            leaf.quote,
            leaf.occurrence ?? 0,
          ),
        }),
      ),
    ),
    confidence: "high",
    ambiguity: "none",
  });
}

function providerSlots(attachments) {
  return templateCopilotV3ProviderQuoteBatches.structure.slots.map((slot) => ({
    slot,
    messageId: `provider:${slot}`,
    text: slot === "attachments" ? attachments : `No ${slot} requirements.`,
  }));
}

test("conditional quantity increments are a closed quote-only role with explicit provider guidance", () => {
  const text = scenario("EN-01").attachments;
  const baseItem = {
    kind: "attachment",
    quote: text,
    leaves: [
      {
        role: "conditional_quantity_increment",
        quote: "two more quotation PDFs",
        hint: null,
      },
    ],
    confidence: "high",
    ambiguity: "none",
  };
  const accepted = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots: providerSlots(text),
    output: { contractVersion: 1, items: [baseItem] },
  });
  assert.equal(accepted.accepted.length, 1);
  assert.deepEqual(accepted.rejected, []);

  const rejected = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots: providerSlots(text),
    output: {
      contractVersion: 1,
      items: [{
        ...baseItem,
        leaves: [{ ...baseItem.leaves[0], hint: "maximum" }],
      }],
    },
  });
  assert.equal(rejected.accepted.length, 0);
  assert.equal(rejected.rejected[0]?.code, "hint_not_allowed");

  const prompt = buildTemplateCopilotV3ProviderQuoteDeveloperPrompt({
    batchId: "structure",
    locale: "en",
  });
  assert.equal(
    templateCopilotV3ProviderPromptVersion,
    "template-copilot-v3-provider-quotes-24",
  );
  assert.match(prompt, /conditional_quantity_increment/u);
  assert.match(prompt, /Never encode it as maximum_quantity or infer a total/u);
});

test("conditional increments and record updates remain review-only with no executable binding", () => {
  const attachmentText = scenario("EN-01").attachments;
  const attachmentMessageId = "EN-01:attachments";
  const attachmentInput = located({
    kind: "attachment",
    messageId: attachmentMessageId,
    text: attachmentText,
    leaves: [
      { role: "label", quote: "supplier quotation" },
      { role: "kind", quote: "PDF", hint: "attachment" },
      {
        role: "required",
        quote: "Require",
        hint: "required_with_conditional_extension",
      },
      { role: "minimum_quantity", quote: "one" },
      {
        role: "conditional_quantity_increment",
        quote: "two more quotation PDFs",
      },
    ],
  });
  const attachment = assembleTemplateCopilotV3Review({
    items: [attachmentInput],
    sourceMessages: { [attachmentMessageId]: attachmentText },
  });
  const requirement = attachment.review.items[0];
  assert.ok(requirement);
  assert.deepEqual(requirement.semanticValue.conditional_quantity_increment, [
    "two more quotation PDFs",
  ]);
  assert.equal(Object.hasOwn(requirement.value, "maximumQuantity"), false);
  assert.equal(
    requirement.bindings.some((binding) => binding.path === "/maximumQuantity"),
    false,
  );
  assert.equal(requirement.blockingReason, "unsupported_semantics_not_executable");
  assert.equal(requirement.semanticComplete, false);
  assert.equal(requirement.complete, false);
  assert.equal(requirement.fragmentId, null);
  assert.equal(attachment.envelope.fragments.length, 0);
  assert.equal(
    attachment.review.rejections.some(
      (entry) => entry.detail === "attachment:conditional_quantity_increment",
    ),
    false,
  );

  const mislabeled = assembleTemplateCopilotV3Review({
    items: [{
      ...attachmentInput,
      leaves: attachmentInput.leaves.map((leaf) =>
        leaf.role === "conditional_quantity_increment"
          ? Object.freeze({ ...leaf, role: "maximum_quantity" })
          : leaf,
      ),
    }],
    sourceMessages: { [attachmentMessageId]: attachmentText },
  });
  assert.equal(
    mislabeled.review.items[0]?.blockingReason,
    "unsupported_semantics_not_executable",
  );
  assert.equal(mislabeled.review.items[0]?.fragmentId, null);

  const stageText = scenario("TC-07").stages;
  const stageMessageId = "TC-07:stages_participants";
  const stage = assembleTemplateCopilotV3Review({
    items: [located({
      kind: "stage",
      messageId: stageMessageId,
      text: stageText,
      anchorQuote: "HR 更新資格紀錄",
      leaves: [
        { role: "label", quote: "HR" },
        { role: "participant", quote: "HR" },
        { role: "kind", quote: "更新", hint: "record_update" },
      ],
    })],
    sourceMessages: { [stageMessageId]: stageText },
  });
  const update = stage.review.items[0];
  assert.ok(update);
  assert.equal(update.blockingReason, "unsupported_semantics_not_executable");
  assert.equal(update.semanticComplete, false);
  assert.equal(update.complete, false);
  assert.equal(update.fragmentId, null);
  assert.equal(Object.hasOwn(update.value, "kind"), false);
  assert.deepEqual(update.semanticValue.kind, ["更新"]);
  assert.equal(stage.envelope.fragments.length, 0);
});

test("reviewed manifests preserve audited source facts independently of generated fixtures", () => {
  const en01 = scenario("EN-01");
  const en01Manifest = templateCopilotV3SemanticScenarioManifest("EN-01");
  assert.match(en01.attachments, /one supplier quotation PDF/u);
  assert.match(en01.attachments, /two more quotation PDFs/u);
  assert.deepEqual(
    en01Manifest.attachments[0].quantities.map(({ role, term }) => [role, term]),
    [
      ["minimum_quantity", "one"],
      ["conditional_quantity_increment", "two more quotation PDFs"],
    ],
  );
  assert.equal(
    en01Manifest.attachments[0].quantities.some(
      (entry) => entry.role === "maximum_quantity",
    ),
    false,
  );

  const tc01Manifest = templateCopilotV3SemanticScenarioManifest("TC-01");
  assert.match(scenario("TC-01").attachments, /每份檔案最多二十五 MB/u);
  assert.deepEqual(
    tc01Manifest.attachments.map((entry) => [
      entry.label,
      entry.maximumFileSizeTerms.map(({ term }) => term),
    ]),
    [
      ["商業登記證", ["每份檔案最多二十五 MB"]],
      ["銀行證明", ["每份檔案最多二十五 MB"]],
      ["稅務表格", ["每份檔案最多二十五 MB"]],
      ["利益衝突聲明表", []],
    ],
  );

  assert.match(scenario("EN-04").conditions, /Department Head approval before Finance/u);
  assert.deepEqual(
    templateCopilotV3SemanticScenarioManifest("EN-04").stages.map(
      ({ participant }) => participant,
    ),
    ["line manager", "Department Head", "Finance"],
  );
  assert.match(scenario("TC-01").stages, /採購總監最終批准/u);
  assert.deepEqual(
    tc01Manifest.stages.map(({ participant }) => participant),
    ["採購經理", "財務供應商資料組", "合規主任", "法務", "高級管理層", "採購總監"],
  );
  assert.match(
    scenario("TC-07").stages,
    /員工提交證書，主管確認，HR 更新資格紀錄/u,
  );
  const tc07Stages = templateCopilotV3SemanticScenarioManifest("TC-07").stages;
  assert.deepEqual(
    tc07Stages.map(({ participant }) => participant),
    ["直屬主管", "培訓經理", "部門主管", "員工", "主管確認", "HR"],
  );
  assert.deepEqual(
    tc07Stages.map(({ kind }) => kind),
    ["approval", "approval", "approval", "submission", "approval", "record_update"],
  );

  for (const contract of [
    ["EN-07", "Personal or sensitive data", "Data Protection"],
    ["TC-01", "註冊地或銀行所在地", "法務審查"],
    ["TC-06", "高風險或期限超過九十日", "行政總裁批准"],
    ["SC-06", "严重程度为高或需要监管报告", "高级管理层批准"],
  ]) {
    const [id, field, route] = contract;
    assert.match(scenario(id).conditions, new RegExp(field, "u"));
    const matching = templateCopilotV3SemanticScenarioManifest(id).conditions
      .filter((entry) => entry.matchingRoute.term === route);
    assert.equal(matching.length, 1, id);
    assert.equal(matching[0].field, field, id);
    assert.equal(matching[0].operator.hint, "unsupported_predicate", id);
    assert.equal(
      matching[0].predicateContext.executionMode,
      "unsupported_semantics_not_executable",
      id,
    );
  }
});

test("qualification metadata distinguishes three locales from eight scenarios per locale", () => {
  const distribution = Object.fromEntries(
    ["en", "zh-Hant", "zh-Hans"].map((language) => [
      language,
      templateCopilotQualificationScenarios.filter(
        (entry) => entry.language === language,
      ).length,
    ]),
  );
  assert.deepEqual(distribution, { en: 8, "zh-Hant": 8, "zh-Hans": 8 });
  assert.equal(templateCopilotV3QualificationExpectedLocaleCount, 3);
  assert.equal(templateCopilotV3QualificationExpectedScenariosPerLocale, 8);
  assert.equal(templateCopilotV3QualificationExpectedScenarioCount, 24);
});
