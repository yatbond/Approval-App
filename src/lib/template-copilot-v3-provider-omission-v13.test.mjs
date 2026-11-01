import assert from "node:assert/strict";
import test from "node:test";
import {
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatches,
} from "./template-copilot-v3-provider-quotes.ts";
import { assembleTemplateCopilotV3Review } from "./template-copilot-v3-review-assembly.ts";

function locateAndAssemble({ id, kind, slot, text, quote, leaves }) {
  const sourceSlots = templateCopilotV3ProviderQuoteBatches.structure.slots.map(
    (sourceSlot) => ({
      slot: sourceSlot,
      messageId: `provider-omission:${id}:${sourceSlot}`,
      text: sourceSlot === slot
        ? text
        : `No ${sourceSlot} requirements supplied.`,
    }),
  );
  const locatedResult = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [{
        kind,
        quote,
        leaves: leaves.map(({ role, quote: leafQuote, hint = null }) => ({
          role,
          quote: leafQuote,
          hint,
        })),
        confidence: "high",
        ambiguity: "none",
      }],
    },
  });
  assert.deepEqual(locatedResult.rejected, [], id);
  assert.equal(locatedResult.accepted.length, 1, id);
  const assembled = assembleTemplateCopilotV3Review({
    items: locatedResult.accepted,
    sourceMessages: Object.fromEntries(
      sourceSlots.map(({ messageId, text: sourceText }) => [
        messageId,
        sourceText,
      ]),
    ),
    sourceMessageOrder: sourceSlots.map(({ messageId }) => messageId),
  });
  return { located: locatedResult.accepted[0], assembled };
}

function assertHeld(result, id) {
  const item = result.review.items[0];
  assert.ok(item, id);
  assert.equal(
    item.blockingReason,
    "unsupported_semantics_not_executable",
    id,
  );
  assert.equal(item.semanticComplete, false, id);
  assert.equal(item.fragmentId, null, id);
  assert.equal(result.envelope.fragments.length, 0, id);
}

test("real locator path holds cross-sentence and open-domain conditional attachments", () => {
  const crossSentenceCases = [
    {
      id: "en",
      text:
        "The risk assessment attachment is optional. If the work is high risk, upload it.",
      quote: "The risk assessment attachment is optional",
      label: "risk assessment",
      kind: "attachment",
      required: "optional",
    },
    {
      id: "zh-Hant",
      text: "風險評估 PDF 為選填。若工作屬高風險，便上載它。",
      quote: "風險評估 PDF 為選填",
      label: "風險評估 PDF",
      kind: "PDF",
      required: "選填",
    },
    {
      id: "zh-Hans",
      text: "风险评估 PDF 为选填。如果工作属高风险，便上传它。",
      quote: "风险评估 PDF 为选填",
      label: "风险评估 PDF",
      kind: "PDF",
      required: "选填",
    },
    {
      id: "zh-Hant-elided",
      text: "風險評估 PDF 為選填。若工作屬高風險，便上載。",
      quote: "風險評估 PDF 為選填",
      label: "風險評估 PDF",
      kind: "PDF",
      required: "選填",
    },
    {
      id: "zh-Hans-elided",
      text: "风险评估 PDF 为选填。如果工作属高风险，便上传。",
      quote: "风险评估 PDF 为选填",
      label: "风险评估 PDF",
      kind: "PDF",
      required: "选填",
    },
  ];
  for (const entry of crossSentenceCases) {
    assertHeld(
      locateAndAssemble({
        id: `attachment-cross-sentence:${entry.id}`,
        kind: "attachment",
        slot: "attachments",
        text: entry.text,
        quote: entry.quote,
        leaves: [
          { role: "label", quote: entry.label },
          { role: "kind", quote: entry.kind, hint: "attachment" },
          { role: "required", quote: entry.required, hint: "false" },
        ],
      }).assembled,
      entry.id,
    );
  }

  const openDomainCases = [
    {
      id: "en",
      text: "A consent form PDF is required for projects involving minors.",
      label: "consent form",
      kind: "PDF",
      required: "required",
    },
    {
      id: "zh-Hant",
      text: "涉及未成年人的項目須提供同意書 PDF。",
      label: "同意書",
      kind: "PDF",
      required: "須提供",
    },
    {
      id: "zh-Hans",
      text: "涉及未成年人的项目须提供同意书 PDF。",
      label: "同意书",
      kind: "PDF",
      required: "须提供",
    },
    {
      id: "en-in",
      text: "A consent form PDF is required in projects involving minors.",
      label: "consent form",
      kind: "PDF",
      required: "required",
    },
  ];
  for (const entry of openDomainCases) {
    assertHeld(
      locateAndAssemble({
        id: `attachment-open-domain:${entry.id}`,
        kind: "attachment",
        slot: "attachments",
        text: entry.text,
        quote: entry.text.slice(0, -1),
        leaves: [
          { role: "label", quote: entry.label },
          { role: "kind", quote: entry.kind, hint: "attachment" },
          { role: "required", quote: entry.required, hint: "true" },
        ],
      }).assembled,
      `open-domain:${entry.id}`,
    );
  }

  const ordinaryCases = [
    {
      id: "en",
      text: "A consent form PDF is required for every submission.",
      quote: "A consent form PDF is required for every submission",
      label: "consent form",
      kind: "PDF",
      required: "required",
    },
    {
      id: "zh-Hant",
      text: "必須上載同意書 PDF。",
      quote: "必須上載同意書 PDF",
      label: "同意書",
      kind: "PDF",
      required: "必須",
    },
    {
      id: "zh-Hans",
      text: "必须上传同意书 PDF。",
      quote: "必须上传同意书 PDF",
      label: "同意书",
      kind: "PDF",
      required: "必须",
    },
  ];
  for (const entry of ordinaryCases) {
    const ordinary = locateAndAssemble({
      id: `attachment-ordinary:${entry.id}`,
      kind: "attachment",
      slot: "attachments",
      text: entry.text,
      quote: entry.quote,
      leaves: [
        { role: "label", quote: entry.label },
        { role: "kind", quote: entry.kind, hint: "attachment" },
        { role: "required", quote: entry.required, hint: "true" },
      ],
    }).assembled;
    assert.equal(ordinary.review.items[0]?.semanticComplete, true, entry.id);
    assert.equal(ordinary.review.items[0]?.blockingReason, undefined, entry.id);
  }

  const differentEntity = locateAndAssemble({
    id: "attachment-different-entity",
    kind: "attachment",
    slot: "attachments",
    text:
      "A supplier attachment PDF is optional. If the work is high risk, require a nonsupplier record.",
    quote: "A supplier attachment PDF is optional",
    leaves: [
      { role: "label", quote: "supplier attachment" },
      { role: "kind", quote: "PDF", hint: "attachment" },
      { role: "required", quote: "optional", hint: "false" },
    ],
  }).assembled;
  assert.equal(differentEntity.review.items[0]?.semanticComplete, true);
  assert.equal(differentEntity.review.items[0]?.blockingReason, undefined);

  const sharedTokenDifferentEntity = locateAndAssemble({
    id: "attachment-shared-token-different-entity",
    kind: "attachment",
    slot: "attachments",
    text:
      "The risk assessment attachment is optional. If the work is high risk, upload a high-risk permit.",
    quote: "The risk assessment attachment is optional",
    leaves: [
      { role: "label", quote: "risk assessment" },
      { role: "kind", quote: "attachment", hint: "attachment" },
      { role: "required", quote: "optional", hint: "false" },
    ],
  }).assembled;
  assert.equal(
    sharedTokenDifferentEntity.review.items[0]?.semanticComplete,
    true,
  );
  assert.equal(
    sharedTokenDifferentEntity.review.items[0]?.blockingReason,
    undefined,
  );

  assertHeld(
    locateAndAssemble({
      id: "attachment-unique-token-true-referent",
      kind: "attachment",
      slot: "attachments",
      text:
        "The supplier attachment is optional. If the work is high risk, upload the supplier file.",
      quote: "The supplier attachment is optional",
      leaves: [
        { role: "label", quote: "supplier attachment" },
        { role: "kind", quote: "attachment", hint: "attachment" },
        { role: "required", quote: "optional", hint: "false" },
      ],
    }).assembled,
    "unique-token-true-referent",
  );
});

test("real locator path holds same-subject record updates omitted from review stages", () => {
  const cases = [
    {
      id: "en",
      text: "HR performs review and updates the employee record.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "zh-Hant",
      text: "HR 進行審核並更新員工紀錄。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hans",
      text: "HR 进行审核并更新员工记录。",
      quote: "HR 进行审核",
      kind: "审核",
    },
    {
      id: "en-comma-then",
      text: "HR performs review, then updates the employee record.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "en-before-updating",
      text: "HR performs review before updating the employee record.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "en-must-update",
      text: "HR performs review and must update the employee record.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "en-passive",
      text:
        "HR performs review, after which the employee record is updated by HR.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "en-next-sentence",
      text: "HR performs review. HR then updates the employee record.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "zh-Hant-comma-then",
      text: "HR 進行審核，然後更新員工紀錄。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hant-after-updating",
      text: "HR 進行審核後更新員工紀錄。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hant-must-update",
      text: "HR 進行審核並須更新員工紀錄。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hant-passive",
      text: "HR 進行審核，之後員工紀錄由 HR 更新。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hant-next-sentence",
      text: "HR 進行審核。HR 隨後更新員工紀錄。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hans-comma-then",
      text: "HR 进行审核，然后更新员工记录。",
      quote: "HR 进行审核",
      kind: "审核",
    },
    {
      id: "zh-Hans-after-updating",
      text: "HR 进行审核后更新员工记录。",
      quote: "HR 进行审核",
      kind: "审核",
    },
    {
      id: "zh-Hans-must-update",
      text: "HR 进行审核并须更新员工记录。",
      quote: "HR 进行审核",
      kind: "审核",
    },
    {
      id: "zh-Hans-passive",
      text: "HR 进行审核，之后员工记录由 HR 更新。",
      quote: "HR 进行审核",
      kind: "审核",
    },
    {
      id: "zh-Hans-next-sentence",
      text: "HR 进行审核。HR 随后更新员工记录。",
      quote: "HR 进行审核",
      kind: "审核",
    },
  ];
  for (const entry of cases) {
    assertHeld(
      locateAndAssemble({
        id: `stage-record-update:${entry.id}`,
        kind: "stage",
        slot: "stages_participants",
        text: entry.text,
        quote: entry.quote,
        leaves: [
          { role: "label", quote: "HR" },
          { role: "participant", quote: "HR" },
          { role: "kind", quote: entry.kind, hint: "review" },
        ],
      }).assembled,
      entry.id,
    );
  }

  const separateSubjectCases = [
    {
      id: "en",
      text: "HR performs review and Finance updates the employee record.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "zh-Hant",
      text: "HR 進行審核，而財務更新員工紀錄。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hans",
      text: "HR 进行审核，而财务更新员工记录。",
      quote: "HR 进行审核",
      kind: "审核",
    },
  ];
  for (const entry of separateSubjectCases) {
    const separateSubject = locateAndAssemble({
      id: `stage-separate-subject:${entry.id}`,
      kind: "stage",
      slot: "stages_participants",
      text: entry.text,
      quote: entry.quote,
      leaves: [
        { role: "label", quote: "HR" },
        { role: "participant", quote: "HR" },
        { role: "kind", quote: entry.kind, hint: "review" },
      ],
    }).assembled;
    assert.equal(
      separateSubject.review.items[0]?.semanticComplete,
      true,
      entry.id,
    );
    assert.equal(
      separateSubject.review.items[0]?.blockingReason,
      undefined,
      entry.id,
    );
  }
  const wrongObjectCases = [
    {
      id: "en",
      text:
        "HR performs review and updates the policy after reading the employee record.",
      quote: "HR performs review",
      kind: "review",
    },
    {
      id: "zh-Hant",
      text: "HR 進行審核並更新政策，之後查閱員工紀錄。",
      quote: "HR 進行審核",
      kind: "審核",
    },
    {
      id: "zh-Hans",
      text: "HR 进行审核并更新政策，之后查阅员工记录。",
      quote: "HR 进行审核",
      kind: "审核",
    },
  ];
  for (const entry of wrongObjectCases) {
    const wrongObject = locateAndAssemble({
      id: `stage-wrong-update-object:${entry.id}`,
      kind: "stage",
      slot: "stages_participants",
      text: entry.text,
      quote: entry.quote,
      leaves: [
        { role: "label", quote: "HR" },
        { role: "participant", quote: "HR" },
        { role: "kind", quote: entry.kind, hint: "review" },
      ],
    }).assembled;
    assert.equal(wrongObject.review.items[0]?.semanticComplete, true, entry.id);
    assert.equal(wrongObject.review.items[0]?.blockingReason, undefined, entry.id);
  }
});

test("real locator path holds an omitted adjacent default branch", () => {
  const cases = [
    {
      id: "en",
      text:
        "If amount exceeds 1,000, route to Finance Review. Otherwise, update the ledger.",
      quote: "If amount exceeds 1,000, route to Finance Review",
      field: "amount",
      operator: "exceeds",
      matching: "Finance Review",
    },
    {
      id: "zh-Hant",
      text: "若金額超過 1,000，便路由至財務覆核。否則，更新分類帳。",
      quote: "若金額超過 1,000，便路由至財務覆核",
      field: "金額",
      operator: "超過",
      matching: "財務覆核",
    },
    {
      id: "zh-Hans",
      text: "如果金额超过 1,000，便路由至财务复核。否则，更新分类账。",
      quote: "如果金额超过 1,000，便路由至财务复核",
      field: "金额",
      operator: "超过",
      matching: "财务复核",
    },
    {
      id: "en-if-not",
      text:
        "If status equals urgent, route to Finance Review. If not, update the ledger.",
      quote: "If status equals urgent, route to Finance Review",
      field: "status",
      operator: "equals",
      operatorHint: "=",
      value: "urgent",
      matching: "Finance Review",
    },
    {
      id: "zh-Hant-if-not",
      text: "若狀態等於緊急，便路由至財務覆核。若非如此，更新分類帳。",
      quote: "若狀態等於緊急，便路由至財務覆核",
      field: "狀態",
      operator: "等於",
      operatorHint: "=",
      value: "緊急",
      matching: "財務覆核",
    },
    {
      id: "zh-Hans-if-not",
      text: "如果状态等于紧急，便路由至财务复核。若非如此，更新分类账。",
      quote: "如果状态等于紧急，便路由至财务复核",
      field: "状态",
      operator: "等于",
      operatorHint: "=",
      value: "紧急",
      matching: "财务复核",
    },
  ];
  for (const entry of cases) {
    assertHeld(
      locateAndAssemble({
        id: `condition-default:${entry.id}`,
        kind: "condition",
        slot: "conditions_exceptions",
        text: entry.text,
        quote: entry.quote,
        leaves: [
          { role: "field", quote: entry.field },
          {
            role: "operator",
            quote: entry.operator,
            hint: entry.operatorHint ?? ">",
          },
          { role: "value", quote: entry.value ?? "1,000" },
          {
            role: "matching_route",
            quote: entry.matching,
            hint: "stage_reference",
          },
          {
            role: "otherwise_route",
            quote: entry.matching,
            hint: "stage_reference",
          },
        ],
      }).assembled,
      entry.id,
    );
  }

  const explicitDefault = locateAndAssemble({
    id: "condition-explicit-default",
    kind: "condition",
    slot: "conditions_exceptions",
    text:
      "If amount exceeds 1,000, route to Finance Review. Otherwise, route to Finance Director. Accounting updates the ledger separately.",
    quote:
      "If amount exceeds 1,000, route to Finance Review. Otherwise, route to Finance Director",
    leaves: [
      { role: "field", quote: "amount" },
      { role: "operator", quote: "exceeds", hint: ">" },
      { role: "value", quote: "1,000" },
      {
        role: "matching_route",
        quote: "Finance Review",
        hint: "stage_reference",
      },
      {
        role: "otherwise_route",
        quote: "Finance Director",
        hint: "stage_reference",
      },
    ],
  }).assembled;
  assert.equal(explicitDefault.review.items[0]?.semanticComplete, true);
  assert.equal(explicitDefault.review.items[0]?.blockingReason, undefined);
  const unrelatedIfNot = locateAndAssemble({
    id: "condition-unrelated-if-not",
    kind: "condition",
    slot: "conditions_exceptions",
    text:
      "If status equals urgent, route to Finance Review. If not documented, the requester adds notes.",
    quote: "If status equals urgent, route to Finance Review",
    leaves: [
      { role: "field", quote: "status" },
      { role: "operator", quote: "equals", hint: "=" },
      { role: "value", quote: "urgent" },
      {
        role: "matching_route",
        quote: "Finance Review",
        hint: "stage_reference",
      },
    ],
  }).assembled;
  assert.equal(
    unrelatedIfNot.review.items[0]?.semanticComplete,
    true,
  );
  assert.equal(
    unrelatedIfNot.review.items[0]?.blockingReason,
    undefined,
  );
});

test("real locator path retains source currency as a governed semantic hold", () => {
  const cases = [
    {
      id: "en",
      text: "If amount exceeds HKD 1,000, route to Finance Review.",
      quote: "If amount exceeds HKD 1,000, route to Finance Review",
      field: "amount",
      operator: "exceeds",
      currency: "HKD",
      route: "Finance Review",
    },
    {
      id: "zh-Hant",
      text: "若金額超過港幣 1,000，便路由至財務覆核。",
      quote: "若金額超過港幣 1,000，便路由至財務覆核",
      field: "金額",
      operator: "超過",
      currency: "港幣",
      route: "財務覆核",
    },
    {
      id: "zh-Hans",
      text: "如果金额超过港币 1,000，便路由至财务复核。",
      quote: "如果金额超过港币 1,000，便路由至财务复核",
      field: "金额",
      operator: "超过",
      currency: "港币",
      route: "财务复核",
    },
  ];
  for (const entry of cases) {
    const { assembled } = locateAndAssemble({
      id: `condition-currency:${entry.id}`,
      kind: "condition",
      slot: "conditions_exceptions",
      text: entry.text,
      quote: entry.quote,
      leaves: [
        { role: "field", quote: entry.field },
        { role: "operator", quote: entry.operator, hint: ">" },
        { role: "value", quote: "1,000" },
        { role: "currency", quote: entry.currency },
        {
          role: "matching_route",
          quote: entry.route,
          hint: "stage_reference",
        },
      ],
    });
    assert.equal(
      assembled.review.rejections.some(
        (rejection) => rejection.code === "invalid_fragment",
      ),
      false,
      entry.id,
    );
    assertHeld(assembled, entry.id);
    const item = assembled.review.items[0];
    assert.equal(Object.hasOwn(item.value, "currency"), false, entry.id);
    assert.equal(
      item.semanticLeaves.find((leaf) => leaf.role === "currency")
        ?.sourceSpan.exactText,
      entry.currency,
      entry.id,
    );
  }
});
