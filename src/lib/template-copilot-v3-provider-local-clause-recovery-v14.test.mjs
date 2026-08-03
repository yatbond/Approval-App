import assert from "node:assert/strict";
import test from "node:test";
import {
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatches,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  assembleTemplateCopilotV3Review,
} from "./template-copilot-v3-review-assembly.ts";
import {
  templateCopilotV3DirectEvidenceDerivesLeaf,
} from "./template-copilot-v3-evidence.ts";
import {
  templateCopilotV3RequirementAuthorityContinuationIsQualified,
  templateCopilotV3RequirementSameHardTailIsQualified,
} from "./template-copilot-v3-clause-boundaries.ts";

function structureSources({
  initiatorsFields,
  attachments,
  stagesParticipants = "No stage or notification requirements supplied.",
}) {
  return templateCopilotV3ProviderQuoteBatches.structure.slots.map((slot) => ({
    slot,
    messageId: `local-clause-v14:${slot}`,
    text: slot === "initiators_fields"
      ? initiatorsFields
      : slot === "attachments"
        ? attachments
        : slot === "stages_participants"
          ? stagesParticipants
        : `No ${slot} requirements supplied.`,
  }));
}

function providerItem(kind, quote, leaves) {
  return {
    kind,
    quote,
    leaves,
    confidence: "high",
    ambiguity: "none",
  };
}

function assembleLocated(located, sourceSlots) {
  return assembleTemplateCopilotV3Review({
    items: located.accepted,
    sourceMessages: Object.fromEntries(
      sourceSlots.map(({ messageId, text }) => [messageId, text]),
    ),
    sourceMessageOrder: sourceSlots.map(({ messageId }) => messageId),
  });
}

function locatorAssemblyResult({ kind, source, anchorQuote, leaves }) {
  const sourceSlots = structureSources({
    initiatorsFields: kind === "request_field" ? source : "Require purpose.",
    attachments: "No attachment requirements supplied.",
    stagesParticipants:
      kind === "stage" || kind === "notification"
        ? source
        : "No stage or notification requirements supplied.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [providerItem(kind, anchorQuote, leaves)],
    },
  });
  return {
    located,
    assembly: assembleLocated(located, sourceSlots),
  };
}

function valueAtPath(value, path) {
  return path.split("/").slice(1).reduce(
    (current, segment) =>
      current !== null && typeof current === "object"
        ? current[segment]
        : undefined,
    value,
  );
}

function requestFieldSemanticResult({
  source,
  anchorQuote,
  label = "Amount",
  requiredQuote = "required",
}) {
  const sourceSlots = structureSources({
    initiatorsFields: source,
    attachments: "No attachment requirements supplied.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [providerItem("request_field", anchorQuote, [
        { role: "label", quote: label, hint: null },
        { role: "required", quote: requiredQuote, hint: "true" },
      ])],
    },
  });
  const assembly = assembleLocated(located, sourceSlots);
  const item = assembly.review.items.find(
    (entry) => entry.factId === "request.fields",
  );
  return { located, assembly, item };
}

function attachmentSemanticResult({
  source,
  anchorQuote,
  label = "Identity PDF",
  kindQuote = "PDF",
  kindHint = "attachment",
  requiredQuote = "required",
}) {
  const sourceSlots = structureSources({
    initiatorsFields: "Require purpose.",
    attachments: source,
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [providerItem("attachment", anchorQuote, [
        { role: "label", quote: label, hint: null },
        { role: "kind", quote: kindQuote, hint: kindHint },
        { role: "required", quote: requiredQuote, hint: "true" },
      ])],
    },
  });
  const assembly = assembleLocated(located, sourceSlots);
  const item = assembly.review.items.find(
    (entry) => entry.factId === "attachments.requirements",
  );
  return { located, assembly, item };
}

function assertGovernedHold(result, context) {
  assert.equal(result.item?.semanticComplete ?? false, false, context);
  assert.equal(result.item?.fragmentId ?? null, null, context);
  assert.deepEqual(result.assembly.envelope.fragments, [], context);
}

function assertSemanticPass(result, context) {
  assert.deepEqual(result.located.rejected, [], context);
  assert.ok(result.item, context);
  assert.equal(result.item.semanticComplete, true, context);
}

test("EN-05 narrow field and attachment anchors remain exact and assemble semantic-complete cores", () => {
  const initiatorsFields =
    "Contract owners initiate. Require counterparty, contract type, start and end dates, value, currency, auto-renewal choice, personal-data choice, governing law and business owner.";
  const attachments =
    "Require one editable contract file as text or PDF and an optional redline PDF. Add a native deviation form with clause, standard position, proposed deviation and rationale.";
  const fieldLabels = [
    "counterparty",
    "contract type",
    "start",
    "end dates",
    "value",
    "currency",
    "auto-renewal choice",
    "personal-data choice",
    "governing law",
    "business owner",
  ];
  const output = {
    contractVersion: 1,
    items: [
      ...fieldLabels.map((label) =>
        providerItem("request_field", label, [
          { role: "label", quote: label, hint: null },
          { role: "required", quote: "Require", hint: "true" },
        ])
      ),
      providerItem("attachment", "editable contract file", [
        {
          role: "label",
          quote: "editable contract file",
          hint: null,
        },
        { role: "kind", quote: "file", hint: "attachment" },
        { role: "required", quote: "Require", hint: "true" },
      ]),
      providerItem("attachment", "redline PDF", [
        { role: "label", quote: "redline PDF", hint: null },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "optional", hint: "false" },
      ]),
      providerItem("attachment", "native deviation form", [
        { role: "label", quote: "native deviation form", hint: null },
        { role: "kind", quote: "form", hint: "form" },
        { role: "required", quote: "Add", hint: "true" },
      ]),
    ],
  };
  const sourceSlots = structureSources({ initiatorsFields, attachments });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output,
  });

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted.length, 13);
  assert.equal(
    located.accepted.reduce(
      (total, entry) =>
        total + entry.sameLocalClauseRecoveredLeafCount,
      0,
    ),
    13,
  );
  assert.ok(located.accepted.every((entry) => entry.anchorExpanded));

  const assembly = assembleLocated(located, sourceSlots);
  const fields = assembly.review.items.filter(
    (entry) => entry.factId === "request.fields",
  );
  const documents = assembly.review.items.filter(
    (entry) => entry.factId === "attachments.requirements",
  );
  assert.equal(fields.length, 10);
  assert.equal(documents.length, 3);
  assert.ok(fields.every((entry) => entry.semanticComplete));
  assert.ok(documents.every((entry) => entry.semanticComplete));
  assert.ok(
    fields.every(
      (entry) => !entry.bindings.some((binding) => binding.path === "/required"),
    ),
  );
  const documentByLabel = new Map(
    documents.map((entry) => [entry.value.label, entry]),
  );
  const contract = documentByLabel.get("editable contract file");
  const redline = documentByLabel.get("redline PDF");
  const deviation = documentByLabel.get("native deviation form");
  assert.ok(contract && redline && deviation);
  assert.ok(!contract.bindings.some((binding) => binding.path === "/kind"));
  assert.ok(
    [redline, deviation].every((entry) =>
      entry.bindings.some((binding) => binding.path === "/kind"),
    ),
  );
  assert.ok(
    [contract, redline, deviation].every(
      (entry) =>
        !entry.bindings.some((binding) => binding.path === "/required"),
    ),
  );
  assert.ok([...fields, ...documents].every((entry) => !entry.complete));
  assert.deepEqual(assembly.review.rejections, []);
});

test("a Go/No-Go title does not turn a legitimate required native form into negation", () => {
  const attachmentClause =
    "必須上載招標文件 PDF、估算 Excel、風險登記表 Excel，以及原生 Go/No-Go 評分表";
  const sourceSlots = structureSources({
    initiatorsFields: "必填投標名稱。",
    attachments: `${attachmentClause}。`,
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("attachment", attachmentClause, [
          { role: "label", quote: "Go/No-Go 評分表", hint: null },
          { role: "kind", quote: "原生", hint: "form" },
          { role: "required", quote: "上載", hint: "true" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted.length, 1);
  const assembly = assembleLocated(located, sourceSlots);
  assert.equal(assembly.review.items.length, 1);
  const [item] = assembly.review.items;
  assert.equal(item.semanticComplete, true);
  assert.equal(item.complete, false);
  assert.ok(item.fragmentId);
  assert.equal(item.persisted, false);
  assert.equal(item.executable, false);
  assert.equal(item.value.label, "Go/No-Go 評分表");
  assert.equal(item.value.kind, undefined);
  assert.equal(item.value.required, undefined);
  assert.deepEqual(item.semanticValue.kind, ["原生"]);
  assert.deepEqual(item.semanticValue.required, ["上載"]);
  assert.ok(
    !item.bindings.some(
      (binding) => binding.path === "/kind" || binding.path === "/required",
    ),
  );
  const fragment = assembly.envelope.fragments.find(
    (candidate) => candidate.fragmentId === item.fragmentId,
  );
  assert.ok(fragment);
  assert.deepEqual(fragment.value, { label: "Go/No-Go 評分表" });
  assert.deepEqual(fragment.bindings.map((binding) => binding.path), ["/label"]);
  assert.deepEqual(assembly.review.rejections, []);
});

test("stage and notification semantic aliases stay rejected through the real locator path", () => {
  const cases = [
    {
      caseId: "comma-cross-paired-notification",
      kind: "notification",
      source:
        "Assignment alerts requester, completion alerts current stage participants.",
      anchorQuote:
        "Assignment alerts requester, completion alerts current stage participants",
      leaves: [
        { role: "event", quote: "Assignment", hint: "stage_assigned" },
        {
          role: "recipient",
          quote: "current stage participants",
          hint: "current_stage_participants",
        },
      ],
      fallbackPaths: ["/event", "/recipients/0"],
      expectedDetails: ["notification:event", "notification:recipient"],
    },
    {
      caseId: "narrow-question-notification",
      kind: "notification",
      source: "Question: Should assignment alert current stage participants?",
      anchorQuote: "assignment alert current stage participants",
      leaves: [
        { role: "event", quote: "assignment", hint: "stage_assigned" },
        {
          role: "recipient",
          quote: "current stage participants",
          hint: "current_stage_participants",
        },
      ],
      fallbackPaths: ["/event", "/recipients/0"],
      expectedDetails: ["notification:event", "notification:recipient"],
    },
    {
      caseId: "narrow-example-notification",
      kind: "notification",
      source: "Example: assignment alerts current stage participants.",
      anchorQuote: "assignment alerts current stage participants",
      leaves: [
        { role: "event", quote: "assignment", hint: "stage_assigned" },
        {
          role: "recipient",
          quote: "current stage participants",
          hint: "current_stage_participants",
        },
      ],
      fallbackPaths: ["/event", "/recipients/0"],
      expectedDetails: ["notification:event", "notification:recipient"],
    },
    {
      caseId: "narrow-negated-notification",
      kind: "notification",
      source: "Do not let assignment alert current stage participants.",
      anchorQuote: "assignment alert current stage participants",
      leaves: [
        { role: "event", quote: "assignment", hint: "stage_assigned" },
        {
          role: "recipient",
          quote: "current stage participants",
          hint: "current_stage_participants",
        },
      ],
      fallbackPaths: ["/event", "/recipients/0"],
      expectedDetails: ["notification:event", "notification:recipient"],
    },
    {
      caseId: "visibility-only-notification",
      kind: "notification",
      source: "Current stage participants can view assignment",
      anchorQuote: "Current stage participants can view assignment",
      leaves: [
        { role: "event", quote: "assignment", hint: "stage_assigned" },
        {
          role: "recipient",
          quote: "Current stage participants",
          hint: "current_stage_participants",
        },
      ],
      fallbackPaths: ["/event", "/recipients/0"],
      expectedDetails: ["notification:event", "notification:recipient"],
    },
    {
      caseId: "stage-visibility",
      kind: "stage",
      source: "申请人可查看核对记录",
      anchorQuote: "申请人可查看核对记录",
      leaves: [
        { role: "label", quote: "记录", hint: null },
        { role: "kind", quote: "核对", hint: "review" },
        { role: "participant_mode", quote: "申请人", hint: "requester" },
      ],
      fallbackPaths: ["/kind"],
      expectedDetails: ["stage:kind"],
    },
  ];

  for (const entry of cases) {
    const result = locatorAssemblyResult(entry);
    assert.deepEqual(result.located.rejected, [], entry.caseId);
    assert.equal(result.located.accepted.length, 1, entry.caseId);
    const item = result.assembly.review.items[0];
    assert.ok(item, entry.caseId);
    for (const path of entry.fallbackPaths) {
      assert.equal(valueAtPath(item.value, path), undefined, `${entry.caseId}:${path}:value`);
      assert.equal(
        item.bindings.some(
          (binding) =>
            binding.path === path || binding.path.startsWith(path + "/"),
        ),
        false,
        `${entry.caseId}:${path}:binding`,
      );
      for (const fragment of result.assembly.envelope.fragments) {
        assert.equal(valueAtPath(fragment.value, path), undefined, `${entry.caseId}:${path}:fragment-value`);
        assert.equal(
          fragment.bindings.some(
            (binding) =>
              binding.path === path || binding.path.startsWith(path + "/"),
          ),
          false,
          `${entry.caseId}:${path}:fragment-binding`,
        );
      }
    }
    for (const detail of entry.expectedDetails) {
      assert.ok(
        result.assembly.review.rejections.some(
          (rejection) =>
            rejection.code === "unverifiable_leaf" &&
            rejection.detail === detail,
        ),
        `${entry.caseId}:${detail}:${JSON.stringify(result.assembly.review.rejections)}`,
      );
    }
  }
});

test("request fallback sees narrow framing through the full authority context", () => {
  const cases = [
    {
      caseId: "question",
      source: "Question: Should Purpose be must?",
      anchorQuote: "Purpose be must",
    },
    {
      caseId: "example",
      source: "Example: Purpose must.",
      anchorQuote: "Purpose must",
    },
    {
      caseId: "negated",
      source: "Do not treat Purpose as must.",
      anchorQuote: "Purpose as must",
    },
  ];

  for (const entry of cases) {
    const result = locatorAssemblyResult({
      ...entry,
      kind: "request_field",
      leaves: [
        { role: "label", quote: "Purpose", hint: null },
        { role: "required", quote: "must", hint: "true" },
      ],
    });
    assert.deepEqual(result.located.rejected, [], entry.caseId);
    assert.equal(result.located.accepted.length, 1, entry.caseId);
    const item = result.assembly.review.items[0];
    assert.ok(item, entry.caseId);
    assert.equal(item.value.required, undefined, entry.caseId);
    assert.ok(
      !item.bindings.some((binding) => binding.path === "/required"),
      entry.caseId,
    );
    for (const fragment of result.assembly.envelope.fragments) {
      assert.equal(fragment.value.required, undefined, entry.caseId);
      assert.ok(
        !fragment.bindings.some((binding) => binding.path === "/required"),
        entry.caseId,
      );
    }
    assert.ok(
      result.assembly.review.rejections.some(
        (rejection) =>
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === "request_field:required",
      ),
      `${entry.caseId}:${JSON.stringify(result.assembly.review.rejections)}`,
    );
  }
});

test("local-clause recovery cannot turn an optional sibling into a required attachment", () => {
  const initiatorsFields = "Require purpose.";
  const attachments =
    "Require one editable contract file and an optional redline PDF.";
  const sourceSlots = structureSources({ initiatorsFields, attachments });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("attachment", "redline PDF", [
          { role: "label", quote: "redline PDF", hint: null },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: "Require", hint: "true" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.accepted, []);
  assert.deepEqual(located.rejected, [{
    itemIndex: 0,
    code: "leaf_not_found",
    detail: "attachment:required",
  }]);
});

test("unpromoted recovered hints stay semantic-only while fixed-corpus aliases are direct evidence", () => {
  const booleanEvidence = (sourceText) =>
    templateCopilotV3DirectEvidenceDerivesLeaf({
      factId: "request.fields",
      path: "/required",
      rule: "boolean_lexical",
      value: { required: true },
      sourceText,
    });
  const attachmentKindEvidence = (sourceText, kind) =>
    templateCopilotV3DirectEvidenceDerivesLeaf({
      factId: "attachments.requirements",
      path: "/kind",
      rule: "enum_lexical",
      value: { kind },
      sourceText,
    });

  assert.equal(booleanEvidence("Require"), false);
  assert.equal(booleanEvidence("Add"), false);
  assert.equal(attachmentKindEvidence("file", "attachment"), false);
  assert.equal(attachmentKindEvidence("PDF", "attachment"), true);
  assert.equal(attachmentKindEvidence("form", "form"), true);
});

test("direct Chinese boolean aliases also satisfy semantic verification", () => {
  const sourceSlots = structureSources({
    initiatorsFields: "用途：是。備註：否。",
    attachments: "No attachment requirements supplied.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("request_field", "用途：是", [
          { role: "label", quote: "用途", hint: null },
          { role: "required", quote: "是", hint: "true" },
        ]),
        providerItem("request_field", "備註：否", [
          { role: "label", quote: "備註", hint: null },
          { role: "required", quote: "否", hint: "false" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.rejected, []);
  assert.ok(located.accepted.every((entry) => !entry.anchorExpanded));
  const assembly = assembleLocated(located, sourceSlots);
  assert.deepEqual(assembly.review.rejections, []);
  assert.equal(assembly.review.items.length, 2);
  assert.ok(assembly.review.items.every((entry) => entry.semanticComplete));
  assert.deepEqual(
    assembly.review.items.map((entry) => entry.value.required).sort(),
    [false, true],
  );
});

test("a non-expanded attachment binds a fixed-corpus alias without admitting recovered hints", () => {
  const sourceSlots = structureSources({
    initiatorsFields: "Require purpose.",
    attachments: "An optional redline PDF is allowed.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("attachment", "optional redline PDF", [
          { role: "label", quote: "redline PDF", hint: null },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: "optional", hint: "false" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted[0].anchorExpanded, false);
  assert.equal(located.accepted[0].sameLocalClauseRecoveredLeafCount, 0);
  const assembly = assembleLocated(located, sourceSlots);
  const document = assembly.review.items[0];
  assert.equal(document.semanticComplete, true);
  assert.equal(document.complete, false);
  assert.ok(document.bindings.some((binding) => binding.path === "/kind"));
  assert.deepEqual(assembly.review.rejections, []);
});

test("contradicted recovered required evidence stays rejected and incomplete", () => {
  const sourceSlots = structureSources({
    initiatorsFields: "Require purpose.",
    attachments: "Add an optional native deviation form.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("attachment", "deviation form", [
          { role: "label", quote: "deviation form", hint: null },
          { role: "kind", quote: "form", hint: "form" },
          { role: "required", quote: "Add", hint: "true" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted[0].anchorExpanded, true);
  const assembly = assembleLocated(located, sourceSlots);
  const document = assembly.review.items[0];
  assert.equal(document.semanticComplete, false);
  assert.equal(document.complete, false);
  assert.equal(document.fragmentId, null);
  assert.deepEqual(assembly.envelope.fragments, []);
  assert.deepEqual(assembly.review.rejections, [{
    itemIndex: 0,
    kind: "attachment",
    code: "unverifiable_leaf",
    detail: "attachment:required",
  }]);
});

test("directly quoted negation variants cannot become semantically complete required fields", () => {
  for (const { source, label, requiredQuote } of [
    { source: "Don't require amount.", label: "amount", requiredQuote: "require" },
    { source: "Never require amount.", label: "amount", requiredQuote: "require" },
    { source: "Don't ever require amount.", label: "amount", requiredQuote: "require" },
    {
      source: "Never explicitly require amount.",
      label: "amount",
      requiredQuote: "require",
    },
    {
      source: "Do not normally require amount.",
      label: "amount",
      requiredQuote: "require",
    },
    {
      source: "Amount is never required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is not normally required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount should not be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount should never be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount must not be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount cannot be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount can't be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount will never be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is not at all required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is not expected or intended to be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is neither expected nor intended to be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is not expected to ever become required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is not supposed to be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount isn't meant to be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount should not have to be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount does not have to be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is not — under any circumstances — required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount cannot, under any circumstances, be required.",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Do not, under any circumstances, require amount.",
      label: "amount",
      requiredQuote: "require",
    },
    {
      source: "Never, ever require amount.",
      label: "amount",
      requiredQuote: "require",
    },
    {
      source: "Under no circumstances require amount.",
      label: "amount",
      requiredQuote: "require",
    },
    {
      source: "No need whatsoever to require amount.",
      label: "amount",
      requiredQuote: "require",
    },
    {
      source: "Don't, ever, require amount.",
      label: "amount",
      requiredQuote: "require",
    },
    { source: "Amount required maybe.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required perhaps.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required potentially.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required conditionally.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required unlikely.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required not always.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required allegedly.", label: "Amount", requiredQuote: "required" },
    {
      source: "Amount required according to unverified guidance.",
      label: "Amount",
      requiredQuote: "required",
    },
    { source: "Amount required? No.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required? Maybe.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required, but maybe waived.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required although waiver may apply.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required unless exempt.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required if applicable.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required when requested.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required except for interns.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required, but explicitly waived.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required, but the requirement is waived.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required. Maybe.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required... perhaps.", label: "Amount", requiredQuote: "required" },
    { source: "Amount required. Waived.", label: "Amount", requiredQuote: "required" },
    { source: "Amount is required, but it is optional.", label: "Amount", requiredQuote: "required" },
    { source: "Amount is required, but the field is optional.", label: "Amount", requiredQuote: "required" },
    { source: "Amount is required, but no longer needed.", label: "Amount", requiredQuote: "required" },
    { source: "Amount is required. It is optional.", label: "Amount", requiredQuote: "required" },
    { source: "Amount is required, but amount is optional.", label: "Amount", requiredQuote: "required" },
    { source: "Amount is required. amount is not needed.", label: "Amount", requiredQuote: "required" },
    { source: "Amount is required, but it can be omitted.", label: "Amount", requiredQuote: "required" },
    { source: "Amount seems required.", label: "Amount", requiredQuote: "required" },
    { source: "Amount appears required.", label: "Amount", requiredQuote: "required" },
    { source: "Amount allegedly required.", label: "Amount", requiredQuote: "required" },
    { source: "Amount purportedly required.", label: "Amount", requiredQuote: "required" },
    { source: "Amount reportedly required.", label: "Amount", requiredQuote: "required" },
    { source: "Amount ostensibly required.", label: "Amount", requiredQuote: "required" },
    {
      source: "Require purpose, amount doesn't need to be entered.",
      label: "amount",
      requiredQuote: "Require",
    },
    { source: "毋需填寫金額。", label: "金額", requiredQuote: "填寫" },
    { source: "無需填寫金額。", label: "金額", requiredQuote: "填寫" },
    { source: "No amount is required.", label: "amount", requiredQuote: "required" },
    { source: "No amount required.", label: "amount", requiredQuote: "required" },
    {
      source: "No purpose or amount is required.",
      label: "amount",
      requiredQuote: "required",
    },
  ]) {
    const anchor = source.slice(0, -1);
    const sourceSlots = structureSources({
      initiatorsFields: source,
      attachments: "No attachment requirements supplied.",
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [
          providerItem("request_field", anchor, [
            { role: "label", quote: label, hint: null },
            { role: "required", quote: requiredQuote, hint: "true" },
          ]),
        ],
      },
    });

    assert.deepEqual(located.rejected, [], source);
    assert.equal(located.accepted.length, 1, source);
    const assembly = assembleLocated(located, sourceSlots);
    const field = assembly.review.items.find(
      (entry) => entry.factId === "request.fields",
    );
    assert.ok(field, source);
    assert.equal(field.semanticComplete, false, source);
    assert.equal(field.complete, false, source);
    assert.equal(field.fragmentId, null, source);
    assert.equal(field.persisted, false, source);
    assert.equal(field.executable, false, source);
    assert.deepEqual(assembly.envelope.fragments, [], source);
  }
});

test("repeated generic attachment kinds stay item-local after qualifier recovery", () => {
  const attachments = "Require one identity file and one address file.";
  const sourceSlots = structureSources({
    initiatorsFields: "Require purpose.",
    attachments,
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("attachment", "identity file", [
          { role: "label", quote: "identity", hint: null },
          { role: "kind", quote: "file", hint: "attachment" },
          { role: "required", quote: "Require", hint: "true" },
        ]),
        providerItem("attachment", "address file", [
          { role: "label", quote: "address", hint: null },
          { role: "kind", quote: "file", hint: "attachment" },
          { role: "required", quote: "Require", hint: "true" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted.length, 2);
  const assembly = assembleLocated(located, sourceSlots);
  const documents = assembly.review.items.filter(
    (entry) => entry.factId === "attachments.requirements",
  );
  assert.equal(documents.length, 2);
  assert.ok(documents.every((entry) => entry.semanticComplete));
  assert.ok(documents.every((entry) => !entry.complete));
  assert.ok(
    documents.every(
      (entry) =>
        !entry.bindings.some(
          (binding) => binding.path === "/kind" || binding.path === "/required",
        ),
    ),
  );
  assert.deepEqual(assembly.review.rejections, []);
});

test("not-only wording retains a legitimate required-field assertion", () => {
  const source = "Amount is not only required but also audited.";
  const sourceSlots = structureSources({
    initiatorsFields: source,
    attachments: "No attachment requirements supplied.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("request_field", "Amount is not only required", [
          { role: "label", quote: "Amount", hint: null },
          { role: "required", quote: "required", hint: "true" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.rejected, []);
  const assembly = assembleLocated(located, sourceSlots);
  const field = assembly.review.items.find(
    (entry) => entry.factId === "request.fields",
  );
  assert.ok(field);
  assert.equal(field.semanticComplete, true);
  assert.equal(field.value.required, true);
});

test("boundary authority checks do not poison a requirement with another entity or later sentence", () => {
  for (const { source, quote, label } of [
    {
      source: "Amount is required but also audited.",
      quote: "Amount is required",
      label: "Amount",
    },
    {
      source: "Amount is required, but comments are optional.",
      quote: "Amount is required",
      label: "Amount",
    },
    {
      source: "Purpose is required, but comments are not required.",
      quote: "Purpose is required",
      label: "Purpose",
    },
    {
      source: "Amount is required. Notes may be provided.",
      quote: "Amount is required",
      label: "Amount",
    },
    {
      source: "Amount is required. Maybe add notes.",
      quote: "Amount is required",
      label: "Amount",
    },
    {
      source: "Amount is required. Perhaps Finance reviews it.",
      quote: "Amount is required",
      label: "Amount",
    },
    {
      source: "Amount is required. The attachment is waived.",
      quote: "Amount is required",
      label: "Amount",
    },
    {
      source: "Amount is required. The requirement for attachments is waived.",
      quote: "Amount is required",
      label: "Amount",
    },
    {
      source: "Amount is required, but amount may be reviewed.",
      quote: "Amount is required",
      label: "Amount",
    },
  ]) {
    const sourceSlots = structureSources({
      initiatorsFields: source,
      attachments: "No attachment requirements supplied.",
    });
    for (const anchorQuote of [quote, label]) {
      const located = locateTemplateCopilotV3ProviderQuotes({
        batchId: "structure",
        sourceSlots,
        output: {
          contractVersion: 1,
          items: [
            providerItem("request_field", anchorQuote, [
              { role: "label", quote: label, hint: null },
              { role: "required", quote: "required", hint: "true" },
            ]),
          ],
        },
      });

      assert.deepEqual(located.rejected, [], `${source} :: ${anchorQuote}`);
      const assembly = assembleLocated(located, sourceSlots);
      const field = assembly.review.items.find(
        (entry) => entry.factId === "request.fields",
      );
      assert.ok(field, `${source} :: ${anchorQuote}`);
      assert.equal(field.semanticComplete, true, `${source} :: ${anchorQuote}`);
      if (anchorQuote === quote) {
        assert.equal(field.value.required, true, `${source} :: ${anchorQuote}`);
      }
    }
  }
});

test("a later uncertain sibling does not poison shared required-field recovery", () => {
  const sourceSlots = structureSources({
    initiatorsFields: "Require purpose, amount, and maybe comments.",
    attachments: "No attachment requirements supplied.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: ["purpose", "amount"].map((label) =>
        providerItem("request_field", label, [
          { role: "label", quote: label, hint: null },
          { role: "required", quote: "Require", hint: "true" },
        ])
      ),
    },
  });

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted.length, 2);
  const assembly = assembleLocated(located, sourceSlots);
  const fields = assembly.review.items.filter(
    (entry) => entry.factId === "request.fields",
  );
  assert.equal(fields.length, 2);
  assert.ok(fields.every((field) => field.semanticComplete));
});

test("request-field authority accepts a source above the condition-context limit", () => {
  const source = `${"Background context. ".repeat(900)}Amount is required.`;
  assert.ok(Array.from(source).length > 16_000);
  const sourceSlots = structureSources({
    initiatorsFields: source,
    attachments: "No attachment requirements supplied.",
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [
        providerItem("request_field", "Amount is required", [
          { role: "label", quote: "Amount", hint: null },
          { role: "required", quote: "required", hint: "true" },
        ]),
      ],
    },
  });

  assert.deepEqual(located.rejected, []);
  const assembly = assembleLocated(located, sourceSlots);
  const field = assembly.review.items.find(
    (entry) => entry.factId === "request.fields",
  );
  assert.ok(field, JSON.stringify(assembly.review.rejections));
  assert.equal(field.semanticComplete, true);
});

test("narrow affirmative anchors cannot hide bounded qualifiers or corrections", () => {
  const sources = [
    "Maybe Amount is required.",
    "Perhaps Amount is required.",
    "Allegedly Amount is required.",
    "If applicable, Amount is required.",
    "Amount required? No.",
    "Amount required? Not really.",
    "Amount required? Never.",
    "Amount required if total exceeds 100.",
    "Amount required when the project involves minors.",
    "Amount required for requests over 1000.",
    "Amount required provided that Finance approves.",
    "Amount required depending on jurisdiction.",
    "Amount is required and may be waived.",
    "Amount is required and is optional.",
    "Amount is required and not always required.",
    "Amount is required yet may be waived.",
    "Amount is required though it may be waived.",
    "Amount required; optional for interns.",
    "Amount required. Exempt for interns.",
    "Amount required; not required for interns.",
    "Amount is required. After review, it is optional.",
    "Amount is required. However, after review it is optional.",
    "Amount is required, but after review it is optional.",
    "Amount is required, but in practice it is optional.",
    "Amount is required. Policy review completed. amount is optional.",
    "Amount is required. Policy review completed. Notes archived. Amount is optional.",
    "Amount is required; policy review completed; notes archived; Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. However, Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. After review, Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. According to policy, Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. Policy states: Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. For interns, Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. As an exception, Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. “Amount is optional.”",
    'Amount is required. Policy review completed. Notes archived. "Amount is optional."',
    "Amount is required. Policy review completed. Notes archived. • Amount is optional.",
    "Amount is required. Policy review completed. Notes archived. / Amount is optional.",
    "Amount is required and the amount field is optional.",
    "Amount is required, but the Amount field is not required.",
    "Amount is required. The Amount field is optional.",
    "Amount is required. The field for Amount is optional.",
    "Amount is required. The requirement for Amount is waived.",
    "Amount required… perhaps.",
    "Amount required… maybe waived.",
    "Amount required… optional.",
  ];
  for (const source of sources) {
    const quote = source.includes("Amount is required")
      ? "Amount is required"
      : "Amount required";
    const sourceSlots = structureSources({
      initiatorsFields: source,
      attachments: "No attachment requirements supplied.",
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [
          providerItem("request_field", quote, [
            { role: "label", quote: "Amount", hint: null },
            { role: "required", quote: "required", hint: "true" },
          ]),
        ],
      },
    });

    assert.deepEqual(located.rejected, [], source);
    const assembly = assembleLocated(located, sourceSlots);
    const field = assembly.review.items.find(
      (entry) => entry.factId === "request.fields",
    );
    assert.equal(field?.semanticComplete ?? false, false, source);
    assert.equal(field?.fragmentId ?? null, null, source);
    assert.deepEqual(assembly.envelope.fragments, [], source);
  }
});

test("multilingual same-entity corrections block required fields and attachments", () => {
  for (const { source, quote, label, requiredQuote } of [
    {
      source: "金額是必填，但該欄位為選填。",
      quote: "金額是必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金额是必填，但该字段为选填。",
      quote: "金额是必填",
      label: "金额",
      requiredQuote: "必填",
    },
    {
      source: "金額是必填。金額欄位為選填。",
      quote: "金額是必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額是必填。該金額欄位不需要填寫。",
      quote: "金額是必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額是必填。政策檢討完成。備註已存檔。根據政策，金額欄位為選填。",
      quote: "金額是必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金额是必填。政策检查完成。备注已存档。根据政策，金额字段为选填。",
      quote: "金额是必填",
      label: "金额",
      requiredQuote: "必填",
    },
    {
      source: "必填项目、图纸编号和紧急选项。更正：该字段免填。",
      quote: "必填项目、图纸编号和紧急选项",
      label: "图纸编号",
      requiredQuote: "必填",
    },
    {
      source: "必填項目、圖紙編號和緊急選項。修正：該欄位自願填寫。",
      quote: "必填項目、圖紙編號和緊急選項",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
    {
      source: "必填项目、图纸编号和紧急选项。现改为图纸编号豁免。",
      quote: "必填项目、图纸编号和紧急选项",
      label: "图纸编号",
      requiredQuote: "必填",
    },
    {
      source: "必填項目、圖紙編號和緊急選項。改為圖紙編號免除。",
      quote: "必填項目、圖紙編號和緊急選項",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
    {
      source: "Amount field is required, but the amount input is optional.",
      quote: "Amount field is required",
      label: "Amount field",
      requiredQuote: "required",
    },
    {
      source: "Amount field is required, but the amount question is optional.",
      quote: "Amount field is required",
      label: "Amount field",
      requiredQuote: "required",
    },
    {
      source: "Amount field is required, but the amount value is optional.",
      quote: "Amount field is required",
      label: "Amount field",
      requiredQuote: "required",
    },
  ]) {
    const sourceSlots = structureSources({
      initiatorsFields: source,
      attachments: "No attachment requirements supplied.",
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [providerItem("request_field", quote, [
          { role: "label", quote: label, hint: null },
          { role: "required", quote: requiredQuote, hint: "true" },
        ])],
      },
    });
    assert.deepEqual(located.rejected, [], source);
    const assembly = assembleLocated(located, sourceSlots);
    const field = assembly.review.items.find(
      (entry) => entry.factId === "request.fields",
    );
    assert.equal(field?.semanticComplete ?? false, false, source);
    assert.equal(field?.fragmentId ?? null, null, source);
    assert.deepEqual(assembly.envelope.fragments, [], source);
  }

  for (const { source, quote, label, requiredQuote } of [
    {
      source: "合約 PDF 必須上載，但該附件為選填。",
      quote: "合約 PDF 必須上載",
      label: "合約 PDF",
      requiredQuote: "上載",
    },
    {
      source: "合同 PDF 必须上传，但该附件为选填。",
      quote: "合同 PDF 必须上传",
      label: "合同 PDF",
      requiredQuote: "上传",
    },
    {
      source: "Identity PDF is required, but the identity attachment is optional.",
      quote: "Identity PDF is required",
      label: "Identity PDF",
      requiredQuote: "required",
    },
  ]) {
    const sourceSlots = structureSources({
      initiatorsFields: "必填用途。",
      attachments: source,
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [providerItem("attachment", quote, [
          { role: "label", quote: label, hint: null },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: requiredQuote, hint: "true" },
        ])],
      },
    });
    assert.deepEqual(located.rejected, [], source);
    const assembly = assembleLocated(located, sourceSlots);
    const attachment = assembly.review.items.find(
      (entry) => entry.factId === "attachments.requirements",
    );
    assert.equal(attachment?.semanticComplete ?? false, false, source);
    assert.equal(attachment?.fragmentId ?? null, null, source);
    assert.deepEqual(assembly.envelope.fragments, [], source);
  }

  const recoveredSource = "金額是必填，但該欄位為選填。";
  const recoveredSourceSlots = structureSources({
    initiatorsFields: recoveredSource,
    attachments: "No attachment requirements supplied.",
  });
  const recovered = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots: recoveredSourceSlots,
    output: {
      contractVersion: 1,
      items: [providerItem("request_field", "金額", [
        { role: "label", quote: "金額", hint: null },
        { role: "required", quote: "必填", hint: "true" },
      ])],
    },
  });
  assert.deepEqual(recovered.accepted, []);
  assert.deepEqual(recovered.rejected, [{
    itemIndex: 0,
    code: "leaf_not_found",
    detail: "request_field:required",
  }]);
});

test("an adjacent correction for a different CJK field does not revoke the target", () => {
  assertSemanticPass(
    requestFieldSemanticResult({
      source: "必填项目、图纸编号和紧急选项。更正：成本影响免填。",
      anchorQuote: "必填项目、图纸编号和紧急选项",
      label: "图纸编号",
      requiredQuote: "必填",
    }),
    "different corrected field",
  );
});

test("affirmative-negated CJK corrections preserve required fields", () => {
  for (const { source, anchorQuote, label } of [
    {
      source: "图纸编号必填。更正：该字段并非免填。",
      anchorQuote: "图纸编号必填",
      label: "图纸编号",
    },
    {
      source: "圖紙編號必填。修正：該欄位並非自願填寫。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
    },
    {
      source: "图纸编号必填。现改为该字段不可豁免。",
      anchorQuote: "图纸编号必填",
      label: "图纸编号",
    },
    {
      source: "圖紙編號必填。改為該欄位不得免填。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
    },
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote: "必填",
      }),
      source,
    );
  }
});

test("compound CJK corrections cannot hide a later optional or exempt predicate", () => {
  for (const source of [
    "必填項目、圖紙編號和緊急選項。更正：該欄位並非免填但可豁免。",
    "必填項目、圖紙編號和緊急選項。更正：該欄位不是自願填寫而是選填。",
    "必填項目、圖紙編號和緊急選項。更正：該欄位不可豁免但可以免填。",
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote: "必填項目、圖紙編號和緊急選項",
        label: "圖紙編號",
        requiredQuote: "必填",
      }),
      source,
    );
  }
});

test("full correction tails cannot hide later optional or waiver authority", () => {
  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "Amount is required. Correction: the field is not optional, but may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "圖紙編號必填。更正：該欄位並非選填，但可豁免。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. Correction: the field cannot be waived, but may be omitted.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not only required, but also optional.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "圖紙編號必填。更正：該欄位不得免填，但可以選填。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote,
      }),
      source,
    );
  }
});

test("closed benign and mandatory correction tails preserve required authority", () => {
  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "Amount is required. Correction: the field is not optional but required.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field cannot be waived and is required.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is never optional and always required.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional under any circumstances.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field cannot be waived by Finance.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is never optional for any request.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "圖紙編號必填。更正：該欄位並非選填而是必填。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote,
      }),
      source,
    );
  }
});

test("deceptive and unknown correction tails remain governed holds", () => {
  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "Amount is required. Correction: the field cannot be waived and is required, but optional for interns.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional, but may be waived, and is required.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional, pending policy review.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "圖紙編號必填。更正：該欄位並非免填，另按政策處理。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote,
      }),
      source,
    );
  }
});

test("competing siblings and additive audit facts do not revoke the target", () => {
  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "Amount is required. Correction: Amount is not optional, but a different field is optional.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: Amount is not optional, but the other field is optional.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "圖紙編號不但必填，而且須核對。",
      anchorQuote: "圖紙編號不但必填",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote,
      }),
      source,
    );
  }

  assertSemanticPass(
    attachmentSemanticResult({
      source: "Identity PDF is required. Correction: Identity PDF is not optional, but a different document is optional.",
      anchorQuote: "Identity PDF is required",
      label: "Identity PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    "explicitly different attachment",
  );
});

test("same-target anaphoric waiver tails survive competing-entity truncation", () => {
  for (const source of [
    "Amount is required. Correction: the field is not optional but required, although it may be waived.",
    "Amount is required. Revision: the field is not only required but also audited, yet may be waived.",
    "Amount is required. Correction: the field is not optional but required, even though it may be waived.",
    "Amount is required. Revision: the field is not only required but also audited, whereas it may be waived.",
    "Amount is required. Correction: the field is not optional but required, except that it may be waived.",
    "Amount is required. Correction: the field is not optional but required, although the field itself may be waived.",
    "Amount is required. Revision: the field is not only required but audited, although the requirement itself may be waived.",
    "Amount is required. Correction: the field is not optional but required, although this very field may be waived.",
    "Amount is required. Correction: the field is not optional but required, although the same field may be waived.",
    "Amount is required. Correction: the field is not optional but required, although it itself may be waived.",
    "Amount is required. Correction: the field is not optional but required, although its requirement may be waived.",
    "Amount is required. Correction: the field is not optional but required, although Amount field may be waived.",
    `Amount is required. Correction: the field is not optional but required and ${"background ".repeat(20)}the field itself may be waived.`,
    "Amount is required. Correction: Amount is not optional, but the current field is optional.",
    "Amount is required. Correction: Amount is not optional, but the target field is optional.",
    "Amount is required. Correction: Amount is not optional, but the relevant requirement is waived.",
    "Amount is required. Correction: Amount is not optional, but the field's requirement is waived.",
    "Amount is required. Correction: Amount is not optional, but Amount's requirement is waived.",
    "Amount is required. Correction: the field is not optional but required, although the field under the current policy review in the finance committee meeting may be waived.",
    "Amount is required. Correction: Amount is not optional, but Notes are optional.",
    "Amount is required. Correction: Amount is not optional, but Cost field is optional.",
    "Amount is required. Correction: Amount is not optional, but this exact field is optional.",
    "Amount is required. Correction: Amount is not optional, but the above field is optional.",
    "Amount is required. Correction: Amount is not optional, but the selfsame field is optional.",
    "Amount is required. Correction: Amount is not optional, but the foregoing requirement is waived.",
    "Amount is required. Correction: Amount is not optional, but the referenced field is optional.",
    "Amount is required. Correction: Amount is not optional, but Amount's own requirement is waived.",
    "Amount is required. Correction: Amount is not optional, but Total Value field is optional.",
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Amount is required",
        label: "Amount",
        requiredQuote: "required",
      }),
      source,
    );
  }

  assertGovernedHold(
    requestFieldSemanticResult({
      source: "Cost is required. Correction: the field is not optional but required, although Cost field may be waived.",
      anchorQuote: "Cost is required",
      label: "Cost",
      requiredQuote: "required",
    }),
    "same-target named field waiver tail",
  );

  for (const { source, anchorQuote, label } of [
    {
      source: "Cost Impact field is required. Correction: Cost Impact field is not optional, but Cost field is optional.",
      anchorQuote: "Cost Impact field is required",
      label: "Cost Impact field",
    },
    {
      source: "Still Amount is required. Correction: Still Amount is not optional, but Still Amount is optional.",
      anchorQuote: "Still Amount is required",
      label: "Still Amount",
    },
    {
      source: `Total Amount is required. Correction: Total Amount is not optional, but ${"background ".repeat(20)}Total Amount may be waived.`,
      anchorQuote: "Total Amount is required",
      label: "Total Amount",
    },
    {
      source: "Purchase Order Number is required. Correction: Purchase Order Number is not optional, but PO Number field is optional.",
      anchorQuote: "Purchase Order Number is required",
      label: "Purchase Order Number",
    },
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({ source, anchorQuote, label }),
      source,
    );
  }

  assertGovernedHold(
    attachmentSemanticResult({
      source: "Identity PDF is required. Correction: the attachment is not optional but required, although it may be waived.",
      anchorQuote: "Identity PDF is required",
      label: "Identity PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    "same-target attachment waiver tail",
  );

  assertGovernedHold(
    attachmentSemanticResult({
      source: "Identity PDF is required. Correction: the attachment is not optional but required, while it may be waived.",
      anchorQuote: "Identity PDF is required",
      label: "Identity PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    "same-target attachment while waiver tail",
  );

  assertGovernedHold(
    attachmentSemanticResult({
      source: "Identity PDF is required. Correction: the attachment is not optional but required, although the attachment itself may be waived.",
      anchorQuote: "Identity PDF is required",
      label: "Identity PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    "modified same-target attachment waiver tail",
  );


  assertGovernedHold(
    attachmentSemanticResult({
      source: "Redline PDF is required. Correction: the attachment is not optional but required, although Redline PDF document may be waived.",
      anchorQuote: "Redline PDF is required",
      label: "Redline PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    "same-target named attachment waiver tail",
  );

  for (const source of [
    "Identity PDF is required. Correction: Identity PDF is not optional, but the current document is optional.",
    "Identity PDF is required. Correction: Identity PDF is not optional, but the original Identity PDF document is optional.",
    "Identity PDF is required. Correction: Identity PDF is not optional, but Identity PDF's requirement is waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required, although the attachment under the current policy review in the finance committee meeting may be waived.",
    `Identity PDF is required. Correction: Identity PDF is not optional, but ${"background ".repeat(20)}Identity PDF may be waived.`,
    "Identity PDF is required. Correction: Identity PDF is not optional, but this exact document is optional.",
    "Identity PDF is required. Correction: Identity PDF is not optional, but Identity PDF's own requirement is waived.",
    "Identity PDF is required. Correction: Identity PDF is not optional, but ID PDF document is optional.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF is required",
        label: "Identity PDF",
        kindQuote: "PDF",
        kindHint: "attachment",
        requiredQuote: "required",
      }),
      source,
    );
  }
});

test("adjacent correction chains retain same-target authority", () => {
  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "Amount is required. Correction: the field is not optional but required. However it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. It remains required. However it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. This remains mandatory. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. It is audited. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. The same field remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. This requirement remains mandatory. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. The aforementioned field remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. Even so, it remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. The same field may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。然而該欄位可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。它仍為必填。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。相同欄位仍然必填。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。相同欄位可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. Correction — the field is optional.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction. The field is optional.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. A different field was reviewed, but Amount remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。更正—該欄位免填。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。更正。該欄位免填。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。另一欄位已審核，但金額仍然必填。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. Correction. Another field is optional, but the target field may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. No other field is involved. It remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. We discussed another field. It remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. The phrase ‘other field’ was quoted. It remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. A different field was reviewed. The original one remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。更正。另一欄位是選填，但目標欄位可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。沒有其他欄位。它仍然必填。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    ...["其", "此", "該項"].map((pronoun) => ({
      source: `金額必填。更正：該欄位並非免填而是必填。${pronoun}可豁免。`,
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    })),
    ...[
      "Amount is required. Correction: Amount remains required although another field may replace it. It may be waived.",
      "Amount is required. Correction: Amount remains required because another field exists. It may be waived.",
      "Amount is required. A different field remains required because policy changed, but Amount remains required. It may be waived.",
      "Amount is required. Correction: Another field remains required, whereas Amount remains required. It may be waived.",
      "Amount is required. Correction: Another field remains required because a third field exists, but Amount remains required. It may be waived.",
      "Amount is required. Correction. Another field remains required. The original field: optional.",
      "Amount is required. Correction. Another field remains required. Amount: optional.",
      "Amount is required. Correction. Another field remains required. Amount - optional.",
      "Amount is required. Correction. Another field remains required. Amount — optional.",
      "Amount is required. Correction. Another field remains required. Regarding the original requirement: optional.",
      "Amount is required. Correction: the field is not optional but required. The field (after review) may be waived.",
      "Amount is required. Correction: the field is not optional but required. It (after review) may be waived.",
      "Amount is required. Correction: the field is not optional but required. It (under policy) may be waived.",
      "Amount is required. Correction: the field is not optional but required. Amount (may be waived) remains required.",
      "Amount is required. Correction: the field is not optional but required. It (not optional) may be waived.",
      "Amount is required. We discussed another field that Finance reviewed. It may be waived.",
      "Amount is required. No other field is involved. It may be waived.",
      "Amount is required. Another field, which was reviewed, remains required. Amount remains required. It may be waived.",
      "Amount is required. Correction − the field is optional.",
      "Amount is required. Correction: the field is not optional but required. The entry may be waived.",
      "Amount is required. Correction. Another field remains required. As for the target field, it may be waived.",
      "Amount is required. Correction. Another field remains required. Returning to the original field, it may be optional.",
      "Amount is required. Correction. Another field remains required. The initially required field may be waived.",
      "Amount is required. Correction. Another field remains required. The field that was originally required may be waived.",
      "Amount is required. Correction. Another field remains required. The formerly mandatory field may be waived.",
      "Amount is required. Correction. Another field remains required. The field previously marked as required may be waived.",
      "Amount is required. Correction: the field is not optional but required. The entry (after review) may be waived.",
      "Amount is required. Correction: the field is not optional but required. The entry may be left blank.",
      "Amount is required. Correction. Another field remains required. The field that had been required may be waived.",
      "Amount is required. Correction: the field is not optional but required. The entry (after review by Finance) may be waived.",
      "Amount is required. Correction: the field is not optional but required. The entry is elective.",
      "Amount is required. Correction: the field is not optional but required. The entry need not be filled in.",
      "Amount is required. Correction. Another field remains required. Required from the outset, the field may now be optional.",
      "Amount is required. Correction: the field is not optional but required. The entry (optional) remains required.",
      "Amount is required. Correction: the field is not optional but required. The entry (which may be waived) remains required.",
      "Amount is required. Correction. Another field remains required. As for the field, it may be waived.",
    ].map((source) => ({
      source,
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    })),
    ...[
      "金額必填。更正：該欄位並非免填而是必填。其本身可豁免。",
      "金額必填。更正：該欄位並非免填而是必填。它本身可豁免。",
      "金額必填。更正：該欄位並非免填而是必填。此本身可豁免。",
      "金額必填。更正。另一欄位仍然必填。至於目標欄位，它可豁免。",
    ].map((source) => ({
      source,
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    })),
    {
      source: "圖紙編號必填。更正：該欄免填。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
    {
      source: "图纸编号必填。更正：本字段免填。",
      anchorQuote: "图纸编号必填",
      label: "图纸编号",
      requiredQuote: "必填",
    },
    ...[
      "圖紙編號必填。更正：此欄自願填寫。",
      "圖紙編號必填。更正：本欄位可豁免。",
      "图纸编号必填。更正：该栏免填。",
      "图纸编号必填。更正：本项目可豁免。",
    ].map((source) => ({
      source,
      anchorQuote: source.includes("圖")
        ? "圖紙編號必填"
        : "图纸编号必填",
      label: source.includes("圖") ? "圖紙編號" : "图纸编号",
      requiredQuote: "必填",
    })),
    ...[
      "Amount is required. Correction: it, however, may be waived.",
      "Amount is required. Correction — the field, however, may be waived.",
      "Amount is required. Revision: this, nevertheless, is optional.",
    ].map((source) => ({
      source,
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    })),
    ...[
      "金額必填。更正：它本身則可豁免。",
      "金额必填。修正：它本身则可以豁免。",
      "金額必填。更正：該欄位，然而，可豁免。",
      "金额必填。修正：本字段，不过，可以豁免。",
      "金額必填。更正：該欄位並非免填而是必填。該資料可豁免。",
      "金额必填。更正：该字段并非免填而是必填。该资料可豁免。",
      "金額必填。更正。另一欄位仍然必填。原先必填的欄位可豁免。",
      "金额必填。修正。另一字段仍然必填。原先必填的字段可以豁免。",
      "金額必填。另一欄位仍然必填，因為政策已改，但金額仍然必填。它可豁免。",
      "金額必填。更正：該欄位並非免填而是必填。該 KYC 資料可豁免。",
      "金額必填。更正：該欄位並非免填而是必填。該資料可以不填。",
      "金额必填。修正：该字段并非免填而是必填。该资料可以留空。",
      "金額必填。更正：它本身卻可豁免。",
      "金额必填。修正：它本身却可以豁免。",
      "金額必填。更正：它—然而—可豁免。",
      "金额必填。修正：它本身反而可以豁免。",
      "金額必填。更正：除非另一欄位已核准，否則金額可豁免。",
      "金额必填。修正：除非另一字段已批准，否则金额可以豁免。",
      "金額必填。更正。另一欄位仍然必填。先前列為必填的欄位可豁免。",
      "金额必填。修正。另一字段仍然必填。之前列为必填的字段可以豁免。",
      "金額必填。更正：該欄位並非免填而是必填。該資料（經審查後）可豁免。",
      "金額必填。更正。另一欄位仍然必填。曾經必填的欄位可豁免。",
      "金額必填。更正。另一欄位仍然必填。原規定必填的欄位可豁免。",
      "金額必填。更正：該欄位並非免填而是必填。該資料（經財務審查後）可豁免。",
      "金額必填。更正。另一欄位仍然必填。起初規定為必填的欄位現可豁免。",
      "金額必填。更正：該欄位並非免填而是必填。該資料（可豁免）仍然必填。",
      "金額必填。更正：該欄位並非免填而是必填。其他欄位仍然必填。這個欄位可豁免。",
    ].map((source) => ({
      source,
      anchorQuote: source.includes("金額") ? "金額必填" : "金额必填",
      label: source.includes("金額") ? "金額" : "金额",
      requiredQuote: "必填",
    })),
    {
      source: "圖紙編號必填。更正：這個欄位免填。",
      anchorQuote: "圖紙編號必填",
      label: "圖紙編號",
      requiredQuote: "必填",
    },
    {
      source: "图纸编号必填。更正：上述字段免填。",
      anchorQuote: "图纸编号必填",
      label: "图纸编号",
      requiredQuote: "必填",
    },
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote,
      }),
      source,
    );
  }

  for (const attachmentSource of [
    "Identity PDF is required. Correction: Identity PDF remains required although another document may replace it. It may be omitted.",
    "Identity PDF is required. Correction: Identity PDF remains required because another document exists. It may be omitted.",
    "Identity PDF is required. A different document remains required because policy changed, but Identity PDF remains required. It may be omitted.",
    "Identity PDF is required. Correction: Another document remains required, whereas Identity PDF remains required. It may be omitted.",
    "Identity PDF is required. Correction: Another document remains required because a third document exists, but Identity PDF remains required. It may be omitted.",
    "Identity PDF is required. Correction. Another document remains required. Identity PDF: waived.",
    "Identity PDF is required. Correction. Another document remains required. The original document: waived.",
    "Identity PDF is required. Correction. Another document remains required. Identity PDF - waived.",
    "Identity PDF is required. Correction. Another document remains required. Identity PDF — waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The attachment (after review) may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The attachment (under policy) may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. It (after review) may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. Identity PDF (may be omitted) remains required.",
    "Identity PDF is required. Correction: the attachment is not optional but required. It (not optional) may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. It may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. It remains required. However it may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. It remains required. It may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. It is audited. It may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The same document remains required. It may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. This document remains required. It may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The requirement remains mandatory. It may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. Even so, it remains required. It may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The same document may be omitted.",
    "Identity PDF is required. Revision – the attachment may be waived.",
    "Identity PDF is required. Revision. The attachment may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. A different document was reviewed, but Identity PDF remains required. It may be omitted.",
    "Identity PDF is required. Correction. Another document is optional, but the target attachment may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The submission may be omitted.",
    "Identity PDF is required. Correction. Another document remains required. As for the target attachment, it may be waived.",
    "Identity PDF is required. Revision: the document, however, may be omitted.",
    "Identity PDF is required. Correction. Another document remains required. The initially required document may be waived.",
    "Identity PDF is required. Correction. Another document remains required. The document that was originally required may be waived.",
    "Identity PDF is required. Correction. Another document remains required. The formerly mandatory document may be waived.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The submission, after review, may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The submission (under policy) may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The submission (may be omitted) remains required.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source: attachmentSource,
        anchorQuote: "Identity PDF is required",
        label: "Identity PDF",
        kindQuote: "PDF",
        kindHint: "attachment",
        requiredQuote: "required",
      }),
      attachmentSource,
    );
  }

  const cjkDeicticAttachment =
    "身份 PDF 必須上載。修正：本文件可豁免。";
  assertGovernedHold(
    attachmentSemanticResult({
      source: cjkDeicticAttachment,
      anchorQuote: "身份 PDF 必須上載",
      label: "身份 PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "必須",
    }),
    cjkDeicticAttachment,
  );

  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "身份 PDF 必填。修正：它本身則可豁免。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身分 PDF 必填。更正：該附件並非免填而是必填。該提交物可豁免。",
      anchorQuote: "身分 PDF 必填",
      label: "身分 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必填。更正：该附件并非免填而是必填。该提交物可豁免。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必須上載。修正：這份文件可豁免。",
      anchorQuote: "身份 PDF 必須上載",
      label: "身份 PDF",
      requiredQuote: "必須",
    },
    {
      source: "身份 PDF 必須上載。修正。另一份文件仍然必須上載。原先必須上載的文件可豁免。",
      anchorQuote: "身份 PDF 必須上載",
      label: "身份 PDF",
      requiredQuote: "必須",
    },
    {
      source: "身分 PDF 必填。更正：該附件並非免填而是必填。該 KYC 提交物可省略。",
      anchorQuote: "身分 PDF 必填",
      label: "身分 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必填。修正：該附件並非免填而是必填。該提交物可以省略。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必填。修正：它本身卻可豁免。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必填。修正：除非另一份文件已核准，否則身份 PDF 可豁免。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必填。修正：除非另一份文件已批准，否则身份 PDF 可以豁免。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必須上載。修正。另一文件仍然必填。之前要求上載的文件可豁免。",
      anchorQuote: "身份 PDF 必須上載",
      label: "身份 PDF",
      requiredQuote: "必須",
    },
    {
      source: "身份 PDF 必須上傳。修正。另一文件仍然必填。之前要求上传的文件可以豁免。",
      anchorQuote: "身份 PDF 必須上傳",
      label: "身份 PDF",
      requiredQuote: "必須",
    },
    {
      source: "身份 PDF 必填。修正：該附件並非免填而是必填。該提交物（經審查後）可省略。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身份 PDF 必須上載。修正。另一文件仍然必填。原要求提交的文件可豁免。",
      anchorQuote: "身份 PDF 必須上載",
      label: "身份 PDF",
      requiredQuote: "必須",
    },
    {
      source: "身份 PDF 必填。修正：該附件並非免填而是必填。該提交物（經財務審查後）可省略。",
      anchorQuote: "身份 PDF 必填",
      label: "身份 PDF",
      requiredQuote: "必填",
    },
    {
      source: "身分 PDF 必填。更正：該附件並非免填而是必填。該提交物（可省略）仍然必填。",
      anchorQuote: "身分 PDF 必填",
      label: "身分 PDF",
      requiredQuote: "必填",
    },
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote,
        label,
        kindQuote: "PDF",
        kindHint: "attachment",
        requiredQuote,
      }),
      source,
    );
  }

  const explicitlyDifferentField =
    "Amount is required. Correction: the field is not optional but required. A different field remains required. It may be waived.";
  assertSemanticPass(
    requestFieldSemanticResult({
      source: explicitlyDifferentField,
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    }),
    explicitlyDifferentField,
  );

  const explicitlyDifferentAttachment =
    "Identity PDF is required. Correction: the attachment is not optional but required. The other document remains required. It may be omitted.";
  assertSemanticPass(
    attachmentSemanticResult({
      source: explicitlyDifferentAttachment,
      anchorQuote: "Identity PDF is required",
      label: "Identity PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    explicitlyDifferentAttachment,
  );

  for (const source of [
    "Field is required. A different field may be waived.",
    "Field is required. A different field (may be waived) remains required.",
    "Field is required. The other field may be waived.",
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Field is required",
        label: "Field",
        requiredQuote: "required",
      }),
      source,
    );
  }

  for (const source of [
    "Document is required. A different document may be omitted.",
    "Document is required. A different document (may be omitted) remains required.",
    "Document is required. The other document may be omitted.",
  ]) {
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "Document is required",
        label: "Document",
        kindQuote: "Document",
        kindHint: "attachment",
        requiredQuote: "required",
      }),
      source,
    );
  }

  const genericTargetField =
    "Field is required. The field may be waived.";
  assertGovernedHold(
    requestFieldSemanticResult({
      source: genericTargetField,
      anchorQuote: "Field is required",
      label: "Field",
      requiredQuote: "required",
    }),
    genericTargetField,
  );

  const bridgedGenericTargetField =
    "Field is required. The field (after review) remains required.";
  assertGovernedHold(
    requestFieldSemanticResult({
      source: bridgedGenericTargetField,
      anchorQuote: "Field is required",
      label: "Field",
      requiredQuote: "required",
    }),
    bridgedGenericTargetField,
  );

  const genericTargetDocument =
    "Document is required. The document may be omitted.";
  assertGovernedHold(
    attachmentSemanticResult({
      source: genericTargetDocument,
      anchorQuote: "Document is required",
      label: "Document",
      kindQuote: "Document",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    genericTargetDocument,
  );

  const genericCarriesDistinctField =
    "Amount is required. Correction: the field is not optional but required. A different field remains required. The field remains mandatory. It may be waived.";
  assertGovernedHold(
    requestFieldSemanticResult({
      source: genericCarriesDistinctField,
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    }),
    genericCarriesDistinctField,
  );

  const genericCarriesDistinctAttachment =
    "Identity PDF is required. Correction: the attachment is not optional but required. A different document remains required. The document remains mandatory. It may be omitted.";
  assertGovernedHold(
    attachmentSemanticResult({
      source: genericCarriesDistinctAttachment,
      anchorQuote: "Identity PDF is required",
      label: "Identity PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    genericCarriesDistinctAttachment,
  );

  const explicitlyDifferentCjkField =
    "金額必填。更正：該欄位並非免填而是必填。另一欄位仍然必填。它可豁免。";
  assertSemanticPass(
    requestFieldSemanticResult({
      source: explicitlyDifferentCjkField,
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    }),
    explicitlyDifferentCjkField,
  );

  const genericCarriesDistinctCjkField =
    "金額必填。更正：該欄位並非免填而是必填。另一欄位仍然必填。該欄位仍是必填。其可豁免。";
  assertGovernedHold(
    requestFieldSemanticResult({
      source: genericCarriesDistinctCjkField,
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    }),
    genericCarriesDistinctCjkField,
  );

  const reverseMixedCjkField =
    "金額必填。更正：該欄位並非免填而是必填。金額仍然必填，但另一欄位已審核。它可豁免。";
  assertSemanticPass(
    requestFieldSemanticResult({
      source: reverseMixedCjkField,
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    }),
    reverseMixedCjkField,
  );

  const reverseMixedField =
    "Amount is required. Correction: the field is not optional but required. Amount remains required, but a different field was reviewed. It may be waived.";
  assertSemanticPass(
    requestFieldSemanticResult({
      source: reverseMixedField,
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    }),
    reverseMixedField,
  );

  const reverseMixedAttachment =
    "Identity PDF is required. Correction: the attachment is not optional but required. Identity PDF remains required, but the other document was reviewed. It may be omitted.";
  assertSemanticPass(
    attachmentSemanticResult({
      source: reverseMixedAttachment,
      anchorQuote: "Identity PDF is required",
      label: "Identity PDF",
      kindQuote: "PDF",
      kindHint: "attachment",
      requiredQuote: "required",
    }),
    reverseMixedAttachment,
  );

  for (const { source, anchorQuote, label, requiredQuote } of [
    ...[
      "Amount is required. Correction: Another field remains required although Amount may replace it. It may be waived.",
      "Amount is required. Correction: Another field remains required because Amount exists. It may be waived.",
      "Amount is required. Amount remains required because policy changed, but a different field remains required. It may be waived.",
      "Amount is required. Correction: Amount remains required, whereas another field remains required. It may be waived.",
      "Amount is required. Correction: Amount remains required because a third field exists, but another field remains required. It may be waived.",
      "Amount is required. Correction. Another field remains required. Amount-based field is optional.",
      "Amount is required. Correction. Another field remains required. Amount-based field is optional. It may be waived.",
      "Amount is required. Correction. Another field remains required. Amount-based-field is optional.",
      "Amount is required. Correction. Another field remains required. Amount‐based field is optional.",
      "Amount is required. Correction. Another field remains required. Amount‑based field is optional.",
      "Amount is required. Correction. Another field remains required. Amount‐based‐field is optional.",
      "Amount is required. Correction. Another field remains required. Amount‑based‑field remains required. It may be waived.",
      "Amount is required. Correction: the field is not optional but required. The field (not optional) remains required.",
      "Amount is required. Correction: the field is not optional but required. It (not optional) remains required.",
      "Amount is required. Correction: the field is not optional but required. Amount (not optional) remains required.",
      "Amount is required. Amount: required.",
      "Amount is required. A different field, which was reviewed, may be waived.",
      "Amount is required. Another field (which is optional) remains required. It may be waived.",
      "Amount is required. A separate field that Finance reviewed may be waived.",
      "Amount is required. The other field, which exists, may be waived.",
      "Amount is required. Another field: required. It may be waived.",
      "Amount is required. A different field: optional.",
    ].map((source) => ({
      source,
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    })),
    {
      source: "Amount is required. Correction: the field is not optional but required. Although a different field remains required, it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. A different field exists. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. A different field remains required. Correction. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。雖然另一欄位仍然必填，但它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。不同欄位仍然必填。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金额必填。另外一个字段仍然必填。它可豁免。",
      anchorQuote: "金额必填",
      label: "金额",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。另一欄位仍然必填。更正。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "金額必填。金額仍然必填，因為政策已改，但另一欄位仍然必填。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. If a different field remains required, it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Despite a different field remaining required, it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Provided that a different field remains required, it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Once a different field is reviewed, it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。一旦另一欄位已審核，它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. Where a different field remains required, it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. A separate field remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. A separate formerly mandatory field may be waived. It remains required.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。如果另一欄位仍然必填，它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. Given that a different field remains required, it may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. An unrelated field remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Another field which was initially mandatory remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. A separate field previously required remains mandatory. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。另一個曾經必填的欄位仍然必填。它可豁免。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. Correction: the field is not optional but required. The entry (not optional) remains required.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "金額必填。更正：該欄位並非免填而是必填。該資料（並非免填）仍然必填。",
      anchorQuote: "金額必填",
      label: "金額",
      requiredQuote: "必填",
    },
    {
      source: "Amount is required. Another field, which was initially mandatory, remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Another field (which was initially mandatory) remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Another field which had previously been mandatory remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
    {
      source: "Amount is required. Another field which had been previously mandatory remains required. It may be waived.",
      anchorQuote: "Amount is required",
      label: "Amount",
      requiredQuote: "required",
    },
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote,
      }),
      source,
    );
  }

  for (const source of [
    "Identity PDF is required. Correction: Another document remains required although Identity PDF may replace it. It may be omitted.",
    "Identity PDF is required. Correction: Another document remains required because Identity PDF exists. It may be omitted.",
    "Identity PDF is required. Identity PDF remains required because policy changed, but a different document remains required. It may be omitted.",
    "Identity PDF is required. Correction: Identity PDF remains required, whereas another document remains required. It may be omitted.",
    "Identity PDF is required. Correction: Identity PDF remains required because a third document exists, but another document remains required. It may be omitted.",
    "Identity PDF is required. Correction. Another document remains required. Identity-PDF document is optional.",
    "Identity PDF is required. Correction. Another document remains required. Identity-PDF document is optional. It may be omitted.",
    "Identity PDF is required. Correction. Another document remains required. Identity-PDF-document is optional.",
    "Identity PDF is required. Correction. Another document remains required. Identity‐PDF document is optional.",
    "Identity PDF is required. Correction. Another document remains required. Identity‑PDF document is optional.",
    "Identity PDF is required. Correction. Another document remains required. Identity‐PDF‐document is optional.",
    "Identity PDF is required. Correction. Another document remains required. Identity‑PDF‑document remains required. It may be omitted.",
    "Identity PDF is required. Correction: the attachment is not optional but required. The attachment (not optional) remains required.",
    "Identity PDF is required. Correction: the attachment is not optional but required. It (not optional) remains required.",
    "Identity PDF is required. Correction: the attachment is not optional but required. Identity PDF (not optional) remains required.",
    "Identity PDF is required. Identity PDF — remains required.",
    "Identity PDF is required. A different document, which was reviewed, may be omitted.",
    "Identity PDF is required. Another document (which is optional) remains required. It may be omitted.",
    "Identity PDF is required. A separate document that Finance reviewed may be omitted.",
    "Identity PDF is required. The other document, which exists, may be omitted.",
    "Identity PDF is required. Another document: required. It may be omitted.",
    "Identity PDF is required. A different document exists. It may be omitted.",
    "Identity PDF is required. A different document remains required. Revision. It may be omitted.",
    "身份 PDF 必填。另一份文件仍然必填。它可豁免。",
    "Identity PDF is required. If a different document remains required, it may be omitted.",
    "Identity PDF is required. Despite a different document remaining required, it may be omitted.",
    "Identity PDF is required. Whenever a different document remains required, it may be omitted.",
    "Identity PDF is required. Assuming a different document remains required, it may be omitted.",
    "Identity PDF is required. A separate formerly mandatory document may be omitted.",
    "Identity PDF is required. Supposing a different document remains required, it may be omitted.",
    "Identity PDF is required. Another document which was initially mandatory remains required. It may be omitted.",
    "Identity PDF is required. A separate document previously uploaded remains mandatory. It may be omitted.",
    "身份 PDF 必填。另一份曾經必填的文件仍然必填。它可豁免。",
    "Identity PDF is required. Correction: the attachment is not optional but required. The submission (not optional) remains required.",
    "身份 PDF 必填。更正：該附件並非免填而是必填。該提交物（並非免填）仍然必填。",
    "Identity PDF is required. Another document, which was initially mandatory, remains required. It may be omitted.",
    "Identity PDF is required. Another document (which was initially mandatory) remains required. It may be omitted.",
    "Identity PDF is required. Another document which had previously been mandatory remains required. It may be omitted.",
    "Identity PDF is required. Another document which had been previously mandatory remains required. It may be omitted.",
  ]) {
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: source.startsWith("Identity")
          ? "Identity PDF is required"
          : "身份 PDF 必填",
        label: source.startsWith("Identity") ? "Identity PDF" : "身份 PDF",
        kindQuote: "PDF",
        kindHint: "attachment",
        requiredQuote: source.startsWith("Identity") ? "required" : "必填",
      }),
      source,
    );
  }
});

test("attachment correction tails distinguish mandatory and omission authority", () => {
  const mandatory = attachmentSemanticResult({
    source: "Identity PDF is required. Correction: the attachment cannot be waived and remains required.",
    anchorQuote: "Identity PDF is required",
    label: "Identity PDF",
    kindQuote: "PDF",
    kindHint: "attachment",
    requiredQuote: "required",
  });
  assertSemanticPass(mandatory, "mandatory attachment correction");

  const omitted = attachmentSemanticResult({
    source: "Identity PDF is required. Correction: the attachment cannot be waived, but may be omitted.",
    anchorQuote: "Identity PDF is required",
    label: "Identity PDF",
    kindQuote: "PDF",
    kindHint: "attachment",
    requiredQuote: "required",
  });
  assertGovernedHold(omitted, "omitted attachment correction");
});

test("closed affirmative recovery is invariant to narrow provider quote breadth", () => {
  for (const source of [
    "Amount is not only required but also audited.",
    "Amount is absolutely required.",
    "Amount is definitely required.",
    "Amount will be required.",
    "Amount will remain required.",
    "Amount has to be required.",
    "Amount remains required.",
    "Amount is marked as required.",
    "Amount was marked as required.",
    "Amount has been marked as required.",
  ]) {
    const sourceSlots = structureSources({
      initiatorsFields: source,
      attachments: "No attachment requirements supplied.",
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [providerItem("request_field", "Amount", [
          { role: "label", quote: "Amount", hint: null },
          { role: "required", quote: "required", hint: "true" },
        ])],
      },
    });
    assert.deepEqual(located.rejected, [], source);
    assert.equal(located.accepted[0]?.sameLocalClauseRecoveredLeafCount, 1);
    const assembly = assembleLocated(located, sourceSlots);
    const field = assembly.review.items.find(
      (entry) => entry.factId === "request.fields",
    );
    assert.equal(field?.semanticComplete ?? false, true, source);
  }

  for (const source of [
    "Identity PDF is not only required but also audited.",
    "Identity PDF is absolutely required.",
    "Identity PDF is definitely required.",
    "Identity PDF will be required.",
    "Identity PDF will remain required.",
    "Identity PDF has to be required.",
    "Identity PDF remains required.",
    "Identity PDF is marked as required.",
    "Identity PDF was marked as required.",
    "Identity PDF has been marked as required.",
  ]) {
    const sourceSlots = structureSources({
      initiatorsFields: "Require purpose.",
      attachments: source,
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [providerItem("attachment", "Identity PDF", [
          { role: "label", quote: "Identity PDF", hint: null },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: "required", hint: "true" },
        ])],
      },
    });
    assert.deepEqual(located.rejected, [], source);
    assert.equal(located.accepted[0]?.sameLocalClauseRecoveredLeafCount, 1);
    const assembly = assembleLocated(located, sourceSlots);
    const attachment = assembly.review.items.find(
      (entry) => entry.factId === "attachments.requirements",
    );
    assert.equal(attachment?.semanticComplete ?? false, true, source);
  }
});

test("authority context fails closed instead of truncating a long governing clause", () => {
  for (const source of [
    `Amount is required ${"padding ".repeat(997)}unless exempt.`,
    `Maybe ${"padding ".repeat(997)}Amount is required.`,
    `Amount is required. It ${"padding ".repeat(996)}is optional.`,
  ]) {
    assert.ok(Array.from(source).length > 8_000);
    const sourceSlots = structureSources({
      initiatorsFields: source,
      attachments: "No attachment requirements supplied.",
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [
          providerItem("request_field", "Amount is required", [
            { role: "label", quote: "Amount", hint: null },
            { role: "required", quote: "required", hint: "true" },
          ]),
        ],
      },
    });

    assert.deepEqual(located.rejected, [], source);
    const assembly = assembleLocated(located, sourceSlots);
    assert.equal(
      assembly.review.items.some(
        (entry) =>
          entry.factId === "request.fields" && entry.semanticComplete,
      ),
      false,
      source,
    );
    assert.deepEqual(assembly.envelope.fragments, [], source);
  }
});

test("subject affinity keeps related sibling entities from poisoning a required field", () => {
  for (const source of [
    "Amount is required, but amount notes are optional.",
    "Amount is required. amount attachments may be waived.",
    "Amount is required. The amount notes are optional.",
    "Amount is required. The requirement for amount notes is optional.",
    "Amount is required. The requirement for amount attachments is waived.",
    "Amount is required. This comment field is optional.",
    "Amount is required. This amount notes field is optional.",
    `Amount is required. ${"background ".repeat(450)}Comments are optional.`,
    `Amount is required. ${"background ".repeat(760)}Comments are described.`,
  ]) {
    const sourceSlots = structureSources({
      initiatorsFields: source,
      attachments: "No attachment requirements supplied.",
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [
          providerItem("request_field", "Amount is required", [
            { role: "label", quote: "Amount", hint: null },
            { role: "required", quote: "required", hint: "true" },
          ]),
        ],
      },
    });

    assert.deepEqual(located.rejected, [], source);
    const assembly = assembleLocated(located, sourceSlots);
    const field = assembly.review.items.find(
      (entry) => entry.factId === "request.fields",
    );
    assert.ok(field, source);
    assert.equal(field.semanticComplete, true, source);
  }
});

test("a prohibited attachment sibling cannot poison the required target", () => {
  for (const { source, quote, label, requiredQuote } of [
    {
      source: "Do not upload contract PDF and upload identity PDF.",
      quote: "upload identity PDF",
      label: "identity PDF",
      requiredQuote: "upload",
    },
    {
      source: "Contract PDF is optional, and identity PDF is required.",
      quote: "identity PDF is required",
      label: "identity PDF",
      requiredQuote: "required",
    },
    {
      source: "Identity PDF is required. identity notes attachment is optional.",
      quote: "Identity PDF is required",
      label: "Identity PDF",
      requiredQuote: "required",
    },
    {
      source: "Identity PDF is required. identity document notes are optional.",
      quote: "Identity PDF is required",
      label: "Identity PDF",
      requiredQuote: "required",
    },
  ]) {
    const sourceSlots = structureSources({
      initiatorsFields: "Require purpose.",
      attachments: source,
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [
          providerItem("attachment", quote, [
            { role: "label", quote: label, hint: null },
            { role: "kind", quote: "PDF", hint: "attachment" },
            { role: "required", quote: requiredQuote, hint: "true" },
          ]),
        ],
      },
    });

    assert.deepEqual(located.rejected, [], source);
    const assembly = assembleLocated(located, sourceSlots);
    const attachment = assembly.review.items.find(
      (entry) => entry.factId === "attachments.requirements",
    );
    assert.ok(attachment, source);
    assert.equal(attachment.semanticComplete, true, source);
  }
});

test("a stripped attachment alias cannot prove a distinct optional sibling", () => {
  for (const { source, label } of [
    {
      source: "Require Identity PDF; Identity document may be omitted.",
      label: "Identity PDF",
    },
    {
      source: "Require Identity PDF; Identity file may be omitted.",
      label: "Identity PDF",
    },
    {
      source: "Require Identity PDF; Identity form may be omitted.",
      label: "Identity PDF",
    },
    {
      source: "Require purchase order PDF; Purchase order document may be omitted.",
      label: "purchase order PDF",
    },
    {
      source: "Require invoice PDF; Requirements for invoice document may be omitted.",
      label: "invoice PDF",
    },
  ]) {
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        label,
        "attachment",
      ),
      true,
      source,
    );
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: label,
        label,
        requiredQuote: "Require",
      }),
      source,
    );
  }
});

test("an independently named prefix keeps a stripped attachment alias sibling-local", () => {
  for (const source of [
    "Require Identity PDF; onboarding identity document may be omitted.",
    "Require Identity PDF; Vendor onboarding identity document may be omitted.",
    "Require Identity PDF; Due diligence identity document may be omitted.",
    "Require Identity PDF; requirement for vendor registration identity document may be waived.",
    "Require Identity PDF; requirement for onboarding identity document may be waived.",
  ]) {
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        "Identity PDF",
        "attachment",
      ),
      false,
      source,
    );
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF",
        label: "Identity PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }
  for (const source of [
    "Require Identity PDF; governed identity document may be omitted.",
    "Require Identity PDF; requirement for governed identity document may be waived.",
  ]) {
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        "Identity PDF",
        "attachment",
      ),
      true,
      source,
    );
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF",
        label: "Identity PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }
});

test("a full attachment alias outranks shorter stripped-alias sibling heuristics", () => {
  for (const continuation of [
    "; optional Identity PDF document",
    "; optional governed Identity PDF document",
    "; optional Vendor onboarding Identity PDF document",
    "; optional requirement for Identity PDF",
    "; optional requirements for Identity PDF under policy",
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        "Identity PDF",
        "attachment",
      ),
      true,
      continuation,
    );
  }
  for (const { continuation, label } of [
    {
      continuation: "; optional PDF identity document",
      label: "Identity PDF",
    },
    {
      continuation: "; optional PDF invoice document",
      label: "invoice PDF",
    },
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        label,
        "attachment",
      ),
      true,
      continuation,
    );
  }
  for (const { source, anchorQuote, label = "Identity PDF" } of [
    {
      source: "Require optional Identity PDF document.",
      anchorQuote: "Identity PDF",
    },
    {
      source: "Require an optional requirement for Identity PDF.",
      anchorQuote: "Identity PDF",
    },
    {
      source: "Require Identity PDF. Optional PDF identity document.",
      anchorQuote: "Identity PDF",
    },
    {
      source: "Require invoice PDF. Optional PDF invoice document.",
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
    },
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote: "Require",
      }),
      source,
    );
  }
});

test("a governed terminal type alone cannot prove an independent sibling", () => {
  for (const tail of [
    "PDF may be omitted",
    "Any PDF may be omitted",
    "All PDFs may be omitted",
    "governed PDF may be omitted",
    "Both PDFs may be omitted",
    "Some PDF may be omitted",
    "PDF about policy may be omitted",
    "PDFs regarding policy may be omitted",
    "Some PDF of record may be omitted",
    "PDF document may be omitted",
    "Any PDF document may be omitted",
    "All PDF documents may be omitted",
    "Every governed PDF document may be omitted",
  ]) {
    const source = `Require invoice PDF; ${tail}.`;
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        "invoice PDF",
        "attachment",
      ),
      true,
      source,
    );
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "invoice PDF",
        label: "invoice PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }
  const namedControl = "Require invoice PDF; Any optional Excel file may be omitted.";
  assertSemanticPass(
    attachmentSemanticResult({
      source: namedControl,
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    }),
    namedControl,
  );
});

test("open governing prefixes and scoped suffixes never become unconditional fields", () => {
  const english = [
    "Subject to review, Amount is required.",
    "Subject to Finance approval, Amount is required.",
    "Pending review, Amount is required.",
    "Depending on jurisdiction, Amount is required.",
    "At times, Amount is required.",
    "Occasionally, Amount is required.",
    "As appropriate, Amount is required.",
    "Barring an exemption, Amount is required.",
    "Absent a waiver, Amount is required.",
    "Should Finance request it, Amount is required.",
    "Were Finance to request it, Amount is required.",
    "Assuming approval, Amount is required.",
    "Given approval, Amount is required.",
    "Throughout Finance, Amount is required.",
    "Amongst interns, Amount is required.",
    "Following review, Amount is required.",
    "Per policy and subject to review, Amount is required.",
    "If approved, Amount is required.",
    "When requested, Amount is required.",
    "Whenever requested, Amount is required.",
    "Provided that Finance approves, Amount is required.",
    "Upon Finance approval, Amount is required.",
    "Where required by law, Amount is required.",
    "After review, Amount is required.",
    "As needed, Amount is required.",
    "For high-risk requests, Amount is required.",
    "Only if approved, Amount is required.",
    "High-risk requests: Amount is required.",
    "Approved cases, Amount is required.",
    "External vendors: Amount is required.",
    "Interns, Amount is required.",
    "Finance-approved projects: Amount is required.",
    "(Interns) Amount is required.",
    "[Interns] Amount is required.",
    "Interns / Amount is required.",
    "Interns only (Amount is required).",
    "Amount is normally required.",
    "Amount is generally required.",
    "Amount is ordinarily required.",
    "Amount is typically required.",
    "Amount is usually required.",
    "Amount is required for interns.",
    "Amount is required for external vendors.",
    "Amount is required only for high-risk requests.",
    "Amount is required solely for approved cases.",
    "Amount is required exclusively for Finance.",
    "Amount is required just for interns.",
    "Amount is required among interns.",
    "Amount is required in approved cases.",
    "Amount is required to the extent applicable.",
    "Amount is required insofar as law applies.",
    "Amount is required subject only to approval.",
    "Amount is required at the manager's discretion.",
    "Amount is required at the manager's option.",
    "Amount is required with approval.",
    "Amount is required at times.",
    "Amount is required occasionally.",
    "Amount is required periodically.",
    "Amount is required as necessary.",
    "Amount is required as appropriate.",
    "Amount is required as relevant.",
    "Amount is required as circumstances dictate.",
    "Amount is required as directed by Finance.",
    "Amount is required at Finance's request.",
    "Amount is required at the request of Finance.",
    "Amount is required at Finance's election.",
    "Amount is required per manager discretion.",
    "Amount is required subject solely to approval.",
    "Amount is required conditioned on approval.",
    "Amount is required dependent upon risk.",
    "Amount is required wherever applicable.",
    "Amount is required after review.",
    "Amount is required upon approval.",
    "Amount is required once approved.",
    "Amount is required on approved cases.",
    "Amount is required during review.",
    "Amount is required provided that Finance approves.",
    "Amount is required, high-risk requests only.",
    "Amount is required: approved cases only.",
    "Amount is required — external vendors only.",
    "Amount is required, but only for interns.",
    "Amount is required (but only for interns).",
    "Amount is required—but only for interns.",
    "Amount for interns is required.",
    "Amount in approved cases is required.",
    "Amount, for high-risk requests, is required.",
    "Amount is required for all interns.",
    "Amount is required for every high-risk request.",
    "Amount is required in all approved cases.",
    "For all high-risk cases, Amount is required.",
    "In every approved case, Amount is required.",
    "For everyone in Finance, Amount is required.",
  ];
  for (const source of english) {
    for (const anchorQuote of ["Amount", "Amount is required", source]) {
      assertGovernedHold(
        requestFieldSemanticResult({ source, anchorQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }

  for (const { source, label, narrow, requiredQuote } of [
    { source: "待確認，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "待財務確認，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "如獲批准，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "如果獲批，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "若財務批准，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "當有要求時，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "經審查後，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "經財務批准後，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "僅在獲批時，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "经财务批准后，金额是必填。", label: "金额", narrow: "金额是必填", requiredQuote: "必填" },
    { source: "金額是必填：僅限高風險申請。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "金额是必填，只限外部供应商。", label: "金额", narrow: "金额是必填", requiredQuote: "必填" },
    { source: "（實習生）金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "金額只對高風險申請必填。", label: "金額", narrow: "金額只對高風險申請必填", requiredQuote: "必填" },
    { source: "金額僅對高風險申請是必填。", label: "金額", narrow: "金額僅對高風險申請是必填", requiredQuote: "必填" },
    { source: "金額對所有高風險申請均為必填。", label: "金額", narrow: "金額對所有高風險申請均為必填", requiredQuote: "必填" },
    { source: "金額適用於所有高風險申請時是必填。", label: "金額", narrow: "金額適用於所有高風險申請時是必填", requiredQuote: "必填" },
    { source: "金额只对高风险申请必填。", label: "金额", narrow: "金额只对高风险申请必填", requiredQuote: "必填" },
    { source: "金額通常是必填。", label: "金額", narrow: "金額通常是必填", requiredQuote: "必填" },
    { source: "金额一般是必填。", label: "金额", narrow: "金额一般是必填", requiredQuote: "必填" },
    { source: "金額視乎風險而定時為必填。", label: "金額", narrow: "金額視乎風險而定時為必填", requiredQuote: "必填" },
    { source: "金額酌情必填。", label: "金額", narrow: "金額酌情必填", requiredQuote: "必填" },
    { source: "金額由經理決定是否必填。", label: "金額", narrow: "金額由經理決定是否必填", requiredQuote: "必填" },
    { source: "金額應財務要求時必填。", label: "金額", narrow: "金額應財務要求時必填", requiredQuote: "必填" },
    { source: "金额应财务要求时必填。", label: "金额", narrow: "金额应财务要求时必填", requiredQuote: "必填" },
    { source: "金額在某些司法管轄區必填。", label: "金額", narrow: "金額在某些司法管轄區必填", requiredQuote: "必填" },
    { source: "金額按經理酌情決定為必填。", label: "金額", narrow: "金額按經理酌情決定為必填", requiredQuote: "必填" },
    { source: "金額按風險是必填。", label: "金額", narrow: "金額按風險是必填", requiredQuote: "必填" },
    { source: "金额按风险是必填。", label: "金额", narrow: "金额按风险是必填", requiredQuote: "必填" },
    { source: "金額是否必填由經理決定。", label: "金額", narrow: "金額是否必填", requiredQuote: "必填" },
    { source: "金額應要求時是必填。", label: "金額", narrow: "金額應要求時是必填", requiredQuote: "必填" },
    { source: "金額視經理選擇是必填。", label: "金額", narrow: "金額視經理選擇是必填", requiredQuote: "必填" },
    { source: "金額偶爾必填。", label: "金額", narrow: "金額偶爾必填", requiredQuote: "必填" },
    { source: "金額間中必填。", label: "金額", narrow: "金額間中必填", requiredQuote: "必填" },
    { source: "金額經常必填。", label: "金額", narrow: "金額經常必填", requiredQuote: "必填" },
    { source: "金額按需要必填。", label: "金額", narrow: "金額按需要必填", requiredQuote: "必填" },
    { source: "金額視需要必填。", label: "金額", narrow: "金額視需要必填", requiredQuote: "必填" },
    { source: "金額在有需要時必填。", label: "金額", narrow: "金額在有需要時必填", requiredQuote: "必填" },
    { source: "金額預計為必填。", label: "金額", narrow: "金額預計為必填", requiredQuote: "必填" },
    { source: "金额拟为必填。", label: "金额", narrow: "金额拟为必填", requiredQuote: "必填" },
    { source: "金額暫定為必填。", label: "金額", narrow: "金額暫定為必填", requiredQuote: "必填" },
    { source: "金額經批准後為必填。", label: "金額", narrow: "金額經批准後為必填", requiredQuote: "必填" },
  ]) {
    for (const anchorQuote of [label, narrow, source]) {
      assertGovernedHold(
        requestFieldSemanticResult({
          source,
          anchorQuote,
          label,
          requiredQuote,
        }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
});

test("affirmative discourse, rationale, and truly universal scopes remain requirements", () => {
  for (const source of [
    "For clarity, Amount is required.",
    "For the avoidance of doubt, Amount is required.",
    "For avoidance of doubt, Amount is required.",
    "For completeness, Amount is required.",
    "In summary, Amount is required.",
    "In particular, Amount is required.",
    "In accordance with policy, Amount is required.",
    "According to policy, Amount is required.",
    "Under company policy, Amount is required.",
    "By policy, Amount is required.",
    "Pursuant to policy, Amount is required.",
    "Per policy, Amount is required.",
    "As a rule, Amount is required.",
    "To be clear, Amount is required.",
    "As stated, Amount is required.",
    "Please note: Amount is required.",
    "Important: Amount is required.",
    "Requirement: Amount is required.",
    "Mandatory information: Amount is required.",
    "In this workflow, Amount is required.",
    "For this workflow, Amount is required.",
    "For all requests, Amount is required.",
    "In every case, Amount is required.",
    "Amount is required for every submission.",
    "Amount is required for all requests.",
    "Amount is required for everyone.",
    "Amount is required on every submission.",
    "Amount is required across all submissions.",
    "Amount is required in each and every case.",
    "Amount is required for every single request.",
    "Amount is required for any and all requests.",
    "Amount is still required.",
    "Amount is indeed required.",
    "Amount continues to be required.",
    "Amount is required for compliance.",
    "Amount is required for audit purposes.",
    "Amount is required solely for compliance.",
    "Amount is required just for record keeping.",
    "Amount is required in this workflow.",
    "Amount is required in the process.",
    "Amount is required according to policy.",
    "Amount is required per policy.",
    "Amount is required for reporting purposes.",
    "Amount is required for tax compliance.",
    "Amount is required for validation.",
    "Amount is required for operational reasons.",
    "Amount for every submission is required.",
    "Amount for compliance is required.",
    "Amount in this workflow is required.",
    "Amount is not optional but required.",
    "Amount cannot be waived and is required.",
    "Amount is never optional and always required.",
  ]) {
    const narrow = source.includes("Amount is required")
      ? "Amount is required"
      : source.slice(0, -1);
    for (const anchorQuote of ["Amount", narrow, source]) {
      assertSemanticPass(
        requestFieldSemanticResult({ source, anchorQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }

  for (const { source, label, narrow, requiredQuote } of [
    { source: "經理要求，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "按公司政策，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "依公司政策，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "如上所述，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "當然，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "僅為清楚起見，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "所有申請：金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "按公司政策，金额是必填。", label: "金额", narrow: "金额是必填", requiredQuote: "必填" },
    { source: "為清楚起見，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "总括而言，金额是必填。", label: "金额", narrow: "金额是必填", requiredQuote: "必填" },
    { source: "根據政策，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "根据政策，金额是必填。", label: "金额", narrow: "金额是必填", requiredQuote: "必填" },
    { source: "在所有情況下，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "金額對所有申請均為必填。", label: "金額", narrow: "金額對所有申請均為必填", requiredQuote: "必填" },
    { source: "金額在所有申請中均為必填。", label: "金額", narrow: "金額在所有申請中均為必填", requiredQuote: "必填" },
    { source: "金额在所有申请中均为必填。", label: "金额", narrow: "金额在所有申请中均为必填", requiredQuote: "必填" },
    { source: "金額並非選填，而是必填。", label: "金額", narrow: "金額並非選填，而是必填", requiredQuote: "必填" },
    { source: "金额不是选填，而是必填。", label: "金额", narrow: "金额不是选填，而是必填", requiredQuote: "必填" },
    { source: "金額不但必填，而且須核對。", label: "金額", narrow: "金額不但必填", requiredQuote: "必填" },
    { source: "金额不但必填，而且须核对。", label: "金额", narrow: "金额不但必填", requiredQuote: "必填" },
    { source: "每個申請，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "每个申请，金额是必填。", label: "金额", narrow: "金额是必填", requiredQuote: "必填" },
    { source: "在任何情況下，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "無一例外，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
    { source: "依據現行政策，金額是必填。", label: "金額", narrow: "金額是必填", requiredQuote: "必填" },
  ]) {
    for (const anchorQuote of [label, narrow, source]) {
      assertSemanticPass(
        requestFieldSemanticResult({
          source,
          anchorQuote,
          label,
          requiredQuote,
        }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
});

test("same-entity parentheticals, modals, hedges, and deep anaphors revoke unconditional authority", () => {
  for (const source of [
    "Amount is required. Amount, according to policy, is optional.",
    "Amount is required. Amount is, according to policy, optional.",
    "Amount is required. Amount (according to policy) is optional.",
    "Amount is required. Amount (for interns) is optional.",
    `Amount is required. Amount, according to ${"x".repeat(500)}, is optional.`,
    "Amount is required. Amount for interns is optional.",
    "Amount is required. Amount under policy is optional.",
    "Amount is required. Amount after review is optional.",
    "Amount is required. Amount according to policy is optional.",
    "Amount is required. Amount may be optional.",
    "Amount is required. Amount might be optional.",
    "Amount is required. Amount could be optional.",
    "Amount is required. Amount can be optional.",
    "Amount is required. Amount should be optional.",
    "Amount is required. Amount would be optional.",
    "Amount is required. Amount will be optional.",
    "Amount is required. Amount is sometimes optional.",
    "Amount is required. Amount is usually optional.",
    "Amount is required. Amount is generally optional.",
    "Amount is required. Amount is reportedly optional.",
    "Amount is required. Amount is allegedly optional.",
    "Amount is required. Amount is potentially optional.",
    "Amount is required. Amount is possibly optional.",
    "Amount is required. Amount is not necessarily required.",
    "Amount is required. Amount is not mandatory.",
    "Amount is required. Amount is not compulsory.",
    "Amount is required. Amount is discretionary.",
    "Amount is required. Amount is voluntary.",
    "Amount is required. Amount is subject to waiver.",
    "Amount is required. Amount is only required in special cases.",
    "Amount is required. Amount need not be provided.",
    "Amount is required. Amount does not need to be entered.",
    "Amount is required. Amount is conditionally required.",
    `Amount is required, ${"background ".repeat(450)}Amount is optional.`,
    "Amount is required, policy review confirms Amount is optional.",
    "Amount is required, the policy says Amount is optional.",
    "Amount is required. According to policy, the field is optional.",
    "Amount is required. Policy states: the field is optional.",
    "Amount is required. For interns, the field is optional.",
    "Amount is required. According to policy, After review, For interns, As an exception, it is optional.",
    `Amount is required. According to ${"policy ".repeat(40)}, it is optional.`,
    `Amount is required. A waiver ${"x".repeat(200)} may apply.`,
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Amount is required",
      }),
      source,
    );
  }

  for (const { source, label, requiredQuote } of [
    { source: "金額是必填。金額，根據政策，為選填。", label: "金額", requiredQuote: "必填" },
    { source: "金额是必填。金额，根据政策，为选填。", label: "金额", requiredQuote: "必填" },
    { source: `金額是必填。金額，根據${"政".repeat(501)}，為選填。`, label: "金額", requiredQuote: "必填" },
    { source: "金額是必填。根據政策，審查後，對實習生，作為例外，該欄位為選填。", label: "金額", requiredQuote: "必填" },
    { source: "金额是必填。根据政策，审查后，对实习生，作为例外，该字段为选填。", label: "金额", requiredQuote: "必填" },
    { source: "金額是必填。金額可能為選填。", label: "金額", requiredQuote: "必填" },
    { source: "金额是必填。金额通常为选填。", label: "金额", requiredQuote: "必填" },
    { source: "金額是必填。金額未必需要填寫。", label: "金額", requiredQuote: "必填" },
  ]) {
    const narrow = `${label}是必填`;
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote: narrow,
        label,
        requiredQuote,
      }),
      source,
    );
  }

  for (const source of [
    "Amount is required. Amount is not optional.",
    "Amount is required. Amount is never optional.",
    "Amount is required. Amount is not only required but also audited.",
    "Amount is required. Amount cannot be waived.",
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Amount is required",
      }),
      source,
    );
  }
});

test("subject identity excludes sibling compounds and broken anaphor chains", () => {
  for (const source of [
    "Amount is required. The notes for Amount are optional.",
    "Amount is required. The notes for the Amount field are optional.",
    "Amount is required. The notes about the Amount field are optional.",
    "Amount is required. The notes regarding the Amount field are optional.",
    "Amount is required. The notes of the Amount field are optional.",
    "Amount is required. Amount field notes are optional.",
    "Amount is required. Amount input notes are optional.",
    "Amount is required. This optional comment field is available.",
    "Amount is required. That optional notes field is visible.",
    "Amount is required. This potentially optional comment field is available.",
    "Amount is required. The comment was discussed. It is optional.",
    "Amount is required. Comment is optional. It can be omitted.",
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Amount is required",
      }),
      source,
    );
  }
});

  const unboundedSiblingIdentity =
    `Amount is required. It remains audited and ${"background ".repeat(450)}comments are optional.`;
  assertGovernedHold(
    requestFieldSemanticResult({
      source: unboundedSiblingIdentity,
      anchorQuote: "Amount is required",
    }),
    unboundedSiblingIdentity,
  );

test("intrinsic label words do not become authority while widened scoped labels still hold", () => {
  for (const label of [
    "Read-only access",
    "Specific amount",
    "Applicable law",
    "Restricted party screening",
    "Conditional approval reason",
    "Supplier-specific reference",
    "Optional-field explanation",
  ]) {
    const source = `${label} is required.`;
    for (const anchorQuote of [label, source]) {
      assertSemanticPass(
        requestFieldSemanticResult({ source, anchorQuote, label }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
  for (const label of [
    "Read-only PDF",
    "Restricted-party declaration PDF",
    "Conditional approval PDF",
    "Applicant-specific certificate PDF",
  ]) {
    const source = `${label} is required.`;
    for (const anchorQuote of [label, source]) {
      assertSemanticPass(
        attachmentSemanticResult({ source, anchorQuote, label }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
  for (const label of [
    "限制條款",
    "限制条款",
    "不可撤銷承諾",
    "非居民稅號",
    "未成年人監護人",
    "人才編號",
    "人才编号",
  ]) {
    const source = `${label}是必填。`;
    for (const anchorQuote of [label, source]) {
      assertSemanticPass(
        requestFieldSemanticResult({
          source,
          anchorQuote,
          label,
          requiredQuote: "必填",
        }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
  for (const label of ["只讀文件", "只读文件"]) {
    const source = `${label}必須上載。`;
    for (const anchorQuote of [label, source]) {
      assertSemanticPass(
        attachmentSemanticResult({
          source,
          anchorQuote,
          label,
          kindQuote: "文件",
          requiredQuote: source.includes("上載") ? "上載" : "上传",
        }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }

  for (const { source, label, requiredQuote } of [
    { source: "Amount for interns is required.", label: "Amount for interns", requiredQuote: "required" },
    { source: "Amount, limited to interns, is required.", label: "Amount, limited to interns", requiredQuote: "required" },
    { source: "Amount applies only to interns and is required.", label: "Amount applies only to interns", requiredQuote: "required" },
    { source: "Maybe Amount is required.", label: "Maybe Amount", requiredQuote: "required" },
    { source: "No Amount is required.", label: "No Amount", requiredQuote: "required" },
    { source: "金額限高風險申請時是必填。", label: "金額限高風險申請時", requiredQuote: "必填" },
    { source: "金額只對高風險申請是必填。", label: "金額只對高風險申請", requiredQuote: "必填" },
    { source: "可能金額是必填。", label: "可能金額", requiredQuote: "必填" },
  ]) {
    for (const anchorQuote of [label, source]) {
      assertGovernedHold(
        requestFieldSemanticResult({ source, anchorQuote, label, requiredQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }

  assertSemanticPass(
    requestFieldSemanticResult({
      source: "For clarity, Read-only access is required.",
      anchorQuote: "Read-only access is required",
      label: "Read-only access",
    }),
    "affirmative context around an intrinsic label",
  );
  assertGovernedHold(
    requestFieldSemanticResult({
      source: "Read-only access is required for interns.",
      anchorQuote: "Read-only access is required",
      label: "Read-only access",
    }),
    "external scope around an intrinsic label",
  );
});

test("shared comma lists remain affirmative while actual bridges stay fail-closed", () => {
  const fieldList =
    " supplier, invoice number, invoice date, PO number, currency, invoice total, PO total, goods-received total, and tax amount";
  for (const label of [
    "supplier",
    "invoice number",
    "invoice date",
    "PO number",
    "currency",
    "invoice total",
    "PO total",
    "goods-received total",
    "tax amount",
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        fieldList,
        label,
        "request_field",
      ),
      false,
      label,
    );
  }

  const attachmentList =
    " one invoice PDF, one purchase order PDF, and one goods receipt PDF";
  for (const label of [
    "invoice PDF",
    "purchase order PDF",
    "goods receipt PDF",
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        attachmentList,
        label,
        "attachment",
      ),
      false,
      label,
    );
  }

  for (const [value, label, kind, expected] of [
    [" invoice number, after review, may be waived", "invoice number", "request_field", true],
    [" invoice number, not optional, remains required", "invoice number", "request_field", false],
    [" invoice PDF, optional, remains required", "invoice PDF", "attachment", true],
    [" invoice PDF, not optional, remains required", "invoice PDF", "attachment", false],
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        label,
        kind,
      ),
      expected,
      value,
    );
  }
  for (const value of [
    " invoice PDF, after review, perhaps may be omitted",
    " invoice PDF, not optional, perhaps may be omitted",
    " invoice PDF, after review, maybe optional",
    " invoice PDF, which Finance reviewed, perhaps optional",
    " invoice PDF, after review, unlikely to be required",
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        "invoice PDF",
        "attachment",
      ),
      true,
      value,
    );
  }

  for (const label of [
    "invoice PDF",
    "purchase order PDF",
    "goods receipt PDF",
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        "; each up to 25 MB. Allow an optional Excel line-item schedule.",
        label,
        "attachment",
      ),
      false,
      "unrelated optional sibling after shared size for " + label,
    );
  }

  for (const [value, label, kind] of [
    [
      "; audited. Allow an optional Excel line-item schedule.",
      "invoice PDF",
      "attachment",
    ],
    [
      "; audited. Include an optional redline PDF.",
      "invoice PDF",
      "attachment",
    ],
    [
      "; audited. Add an optional notes field.",
      "Amount",
      "request_field",
    ],
    [
      "; audited. Accept an optional comments field.",
      "Amount",
      "request_field",
    ],
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        label,
        kind,
      ),
      false,
      value,
    );
  }

  for (const [value, label, kind] of [
    ["; each may be omitted.", "invoice PDF", "attachment"],
    ["; each is optional.", "invoice PDF", "attachment"],
    ["; each remains optional.", "invoice PDF", "attachment"],
    ["; each becomes optional.", "invoice PDF", "attachment"],
    ["; each is exempt.", "invoice PDF", "attachment"],
    ["; each was waived.", "invoice PDF", "attachment"],
    ["; each need not be provided.", "invoice PDF", "attachment"],
    ["; each does not need to be entered.", "Amount", "request_field"],
    ["; each is not required.", "Amount", "request_field"],
    ["; each, however, is optional.", "Amount", "request_field"],
    ["; each up to 25 MB. It may be omitted.", "invoice PDF", "attachment"],
    ["; audited. Allow an optional invoice PDF.", "invoice PDF", "attachment"],
    ["; audited. Allow an optional attachment.", "invoice PDF", "attachment"],
    [
      "; audited. Allow an optional copy of the invoice PDF.",
      "invoice PDF",
      "attachment",
    ],
    ["; audited. Add an optional Amount field.", "Amount", "request_field"],
    ["; audited. Add an optional field.", "Amount", "request_field"],
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        label,
        kind,
      ),
      true,
      value,
    );
  }
});

test("extended quantified anaphors bind the governed target without capturing distinct noun phrases", () => {
  for (const [value, label, kind] of [
    ["; each one may be omitted.", "invoice PDF", "attachment"],
    ["; all three may be omitted.", "invoice PDF", "attachment"],
    ["; each of them may be omitted.", "invoice PDF", "attachment"],
    ["; both of the attachments may be absent.", "invoice PDF", "attachment"],
    ["; all attachments may be omitted.", "invoice PDF", "attachment"],
    ["; both items may be left blank.", "Amount", "request_field"],
    ["。兩者均可豁免。", "身份 PDF", "attachment"],
    ["。两者均可豁免。", "身份 PDF", "attachment"],
    ["。全部均可豁免。", "身份 PDF", "attachment"],
    ["。所有附件均可豁免。", "身份 PDF", "attachment"],
    ["。各附件均可豁免。", "身份 PDF", "attachment"],
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        label,
        kind,
      ),
      true,
      value,
    );
  }

  for (const [value, label, kind] of [
    ["; each is audited.", "invoice PDF", "attachment"],
    ["; each remains required.", "invoice PDF", "attachment"],
    ["; each is not optional.", "Amount", "request_field"],
    ["; each optional Excel schedule may be omitted.", "invoice PDF", "attachment"],
    ["; each waived redline PDF is audited.", "invoice PDF", "attachment"],
    ["; each optional Notes field may be left blank.", "Amount", "request_field"],
    ["; audited. Each optional Excel schedule is audited.", "invoice PDF", "attachment"],
    ["; audited. Each optional Notes field is audited.", "Amount", "request_field"],
    ["。兩者均仍為必須上載。", "身份 PDF", "attachment"],
    ["。两者仍须上传。", "身份 PDF", "attachment"],
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        label,
        kind,
      ),
      false,
      value,
    );
  }

  for (const label of ["invoice PDF", "purchase order PDF"]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source:
          "Require invoice PDF and purchase order PDF; each of them may be omitted.",
        anchorQuote: label,
        label,
        requiredQuote: "Require",
      }),
      "extended quantified attachment " + label,
    );
  }
  assertGovernedHold(
    attachmentSemanticResult({
      source: "Require invoice PDF, purchase order PDF, and goods receipt PDF; all three may be omitted.",
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    }),
    "all-three attachment anaphor",
  );
  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "必須上載身份 PDF 和紅線文件。兩者均可豁免。",
      anchorQuote: "必須上載身份 PDF 和紅線文件",
      label: "身份 PDF",
      requiredQuote: "必須",
    },
    {
      source: "必须上传身份 PDF 和红线文件。两者均可豁免。",
      anchorQuote: "必须上传身份 PDF 和红线文件",
      label: "身份 PDF",
      requiredQuote: "必须",
    },
  ]) {
    const result = attachmentSemanticResult({
      source,
      anchorQuote,
      label,
      requiredQuote,
    });
    assert.deepEqual(result.located.rejected, [], source);
    assertGovernedHold(
      result,
      source,
    );
  }
  for (const { source, anchorQuote, label, requiredQuote } of [
    {
      source: "必須上載身份 PDF 和紅線文件。兩者均仍為必須上載。",
      anchorQuote: "必須上載身份 PDF 和紅線文件",
      label: "身份 PDF",
      requiredQuote: "必須",
    },
    {
      source: "必须上传身份 PDF 和红线文件。两者仍须上传。",
      anchorQuote: "必须上传身份 PDF 和红线文件",
      label: "身份 PDF",
      requiredQuote: "必须",
    },
  ]) {
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote,
      }),
      source,
    );
  }
  assertSemanticPass(
    attachmentSemanticResult({
      source: "Require invoice PDF; audited. Each optional Excel schedule is audited.",
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    }),
    "quantified distinct optional attachment",
  );
});

test("comma-and optional generic siblings stay fail-closed while named siblings remain local", () => {
  for (const [value, label, kind, expected] of [
    [", and optional attachment", "invoice PDF", "attachment", true],
    [", and optional field", "Amount", "request_field", true],
    [", and optional redline PDF", "invoice PDF", "attachment", false],
    [", and optional Notes field", "Amount", "request_field", false],
  ]) {
    assert.equal(
      templateCopilotV3RequirementSameHardTailIsQualified(
        value,
        label,
        kind,
        "marker_before_subject",
      ),
      expected,
      value,
    );
  }

  for (const source of [
    "Require invoice PDF, and optional attachment.",
    "Require invoice PDF, and optional redline PDF in place of the required attachment.",
  ]) {
    const result = attachmentSemanticResult({
      source,
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    });
    assertGovernedHold(result, source);
  }
  for (const source of [
    "Require Amount, and optional field.",
    "Require Amount, and optional Notes field as a replacement for the required field.",
  ]) {
    const result = requestFieldSemanticResult({
      source,
      anchorQuote: "Amount",
      label: "Amount",
      requiredQuote: "Require",
    });
    assertGovernedHold(result, source);
  }

  assertSemanticPass(
    attachmentSemanticResult({
      source: "Require invoice PDF, and optional redline PDF.",
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    }),
    "comma-and named optional attachment",
  );
  assertSemanticPass(
    requestFieldSemanticResult({
      source: "Require Amount, and optional Notes field.",
      anchorQuote: "Amount",
      label: "Amount",
      requiredQuote: "Require",
    }),
    "comma-and named optional field",
  );
});

test("distributed English quantifiers distinguish anaphors from complete nominal subjects", () => {
  for (const [value, label, kind] of [
    ["; either may be omitted.", "invoice PDF", "attachment"],
    ["; either one may be omitted.", "invoice PDF", "attachment"],
    ["; either of them may be omitted.", "invoice PDF", "attachment"],
    ["; any one may be omitted.", "invoice PDF", "attachment"],
    ["; any one of them may be omitted.", "invoice PDF", "attachment"],
    ["; one or more may be omitted.", "invoice PDF", "attachment"],
    ["; one or more of them may be omitted.", "invoice PDF", "attachment"],
    ["; Each of these attachments may be omitted.", "invoice PDF", "attachment"],
    ["; Each one of these attachments may be omitted.", "invoice PDF", "attachment"],
    ["; All of those documents may be omitted.", "invoice PDF", "attachment"],
    ["; All three of these attachments may be omitted.", "invoice PDF", "attachment"],
    ["; Any one of these attachments may be omitted.", "invoice PDF", "attachment"],
    ["; Any of the attachments may be omitted.", "invoice PDF", "attachment"],
    ["; Every one of these attachments may be omitted.", "invoice PDF", "attachment"],
    ["; Every one of the attachments may be omitted.", "invoice PDF", "attachment"],
    ["; Any required attachment may be omitted.", "invoice PDF", "attachment"],
    ["; Every mandatory document may be omitted.", "invoice PDF", "attachment"],
    ["; Every governed attachment may be omitted.", "invoice PDF", "attachment"],
    ["; Any unidentified document may be omitted.", "invoice PDF", "attachment"],
    ["; each may, however, be omitted.", "invoice PDF", "attachment"],
    ["; each may (however) be omitted.", "invoice PDF", "attachment"],
    ["; each may, in fact, be omitted.", "invoice PDF", "attachment"],
    ["; each is, clearly, optional.", "invoice PDF", "attachment"],
    ["; each is (explicitly) optional.", "invoice PDF", "attachment"],
    ["; either may be left blank.", "Amount", "request_field"],
    ["; any one may be left blank.", "Amount", "request_field"],
    ["; one or more may be left blank.", "Amount", "request_field"],
    ["; Each of these fields may be left blank.", "Amount", "request_field"],
    ["; Any one of those fields may be left blank.", "Amount", "request_field"],
    ["; Any of the fields may be left blank.", "Amount", "request_field"],
    ["; Every one of these fields may be left blank.", "Amount", "request_field"],
    ["; Any required field may be left blank.", "Amount", "request_field"],
    ["; Every governed field may be left blank.", "Amount", "request_field"],
    ["; Any unidentified input may be left blank.", "Amount", "request_field"],
    ["; each may, however, be left blank.", "Amount", "request_field"],
    ["; each may, in fact, be left blank.", "Amount", "request_field"],
    ["; each is, clearly, optional.", "Amount", "request_field"],
    ["; each is (explicitly) optional.", "Amount", "request_field"],
    ["; Each invoice PDF may be omitted.", "invoice PDF", "attachment"],
    ["; Every invoice PDF may be omitted.", "invoice PDF", "attachment"],
    ["; Each attachment may be omitted.", "invoice PDF", "attachment"],
    ["; Any attachment may be omitted.", "invoice PDF", "attachment"],
    ["; Each Amount may be left blank.", "Amount", "request_field"],
    ["; Every Amount may be left blank.", "Amount", "request_field"],
    ["; Each field may be left blank.", "Amount", "request_field"],
    ["; Any field may be left blank.", "Amount", "request_field"],
    [
      "; Every unrelated invoice PDF in place of the required attachment may be omitted.",
      "invoice PDF",
      "attachment",
    ],
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        label,
        kind,
      ),
      true,
      value,
    );
  }

  for (const modifier of [
    "authorized",
    "verified",
    "selected",
    "configured",
    "validated",
    "screened",
    "reviewed",
    "certified",
    "flagged",
    "primary",
    "secondary",
    "opaque",
    "newly approved",
    "currently required",
    "provisionally selected",
    "externally validated",
    "system-generated",
    "policy governed",
  ]) {
    const attachmentTail = `; Every ${modifier} attachment may be omitted.`;
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        attachmentTail,
        "invoice PDF",
        "attachment",
      ),
      true,
      attachmentTail,
    );
    const attachmentSource =
      `Require invoice PDF; Every ${modifier} attachment may be omitted.`;
    for (const anchorQuote of ["invoice PDF", "Require invoice PDF"]) {
      assertGovernedHold(
        attachmentSemanticResult({
          source: attachmentSource,
          anchorQuote,
          label: "invoice PDF",
          requiredQuote: "Require",
        }),
        `${attachmentSource} @ ${anchorQuote}`,
      );
    }

    const fieldTail = `; Every ${modifier} field may be left blank.`;
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        fieldTail,
        "Amount",
        "request_field",
      ),
      true,
      fieldTail,
    );
    const fieldSource =
      `Require Amount; Every ${modifier} field may be left blank.`;
    for (const anchorQuote of ["Amount", "Require Amount"]) {
      assertGovernedHold(
        requestFieldSemanticResult({
          source: fieldSource,
          anchorQuote,
          label: "Amount",
          requiredQuote: "Require",
        }),
        `${fieldSource} @ ${anchorQuote}`,
      );
    }
  }

  for (const [value, label, kind] of [
    ["; either remains required.", "invoice PDF", "attachment"],
    ["; any one remains required.", "invoice PDF", "attachment"],
    ["; one or more remain required.", "invoice PDF", "attachment"],
    ["; Each unrelated attachment may be omitted.", "invoice PDF", "attachment"],
    ["; Any optional Excel file may be omitted.", "invoice PDF", "attachment"],
    ["; Every authorized reference document may be omitted.", "invoice PDF", "attachment"],
    ["; Any newly approved purchase order document may be omitted.", "invoice PDF", "attachment"],
    ["; Any optional Reference field may be left blank.", "Amount", "request_field"],
    ["; Every configured Comments field may be left blank.", "Amount", "request_field"],
    ["; each is, clearly, required.", "invoice PDF", "attachment"],
    ["; each is (explicitly) audited.", "invoice PDF", "attachment"],
    ["; each may, in fact, remain required.", "Amount", "request_field"],
    ["; Any optional purchase order spreadsheet may be omitted.", "invoice PDF", "attachment"],
    ["; Any required purchase order spreadsheet may be omitted.", "invoice PDF", "attachment"],
    ["; Each unrelated required attachment may be omitted.", "invoice PDF", "attachment"],
    ["; Every governed Excel schedule may be omitted.", "invoice PDF", "attachment"],
    ["; Every attachment remains required.", "invoice PDF", "attachment"],
    ["; Any day may elapse.", "invoice PDF", "attachment"],
    ["; Every day may elapse.", "invoice PDF", "attachment"],
    ["; each may, however, remain required.", "invoice PDF", "attachment"],
    ["; each may (however) be audited.", "invoice PDF", "attachment"],
    ["; Every optional Excel schedule is audited.", "invoice PDF", "attachment"],
    ["; Any optional Excel schedule may be omitted.", "invoice PDF", "attachment"],
    ["; Every optional Notes field is audited.", "Amount", "request_field"],
    ["; Any optional Notes field may be left blank.", "Amount", "request_field"],
    ["; Each unrelated invoice PDF may be omitted.", "invoice PDF", "attachment"],
    ["; Every unrelated invoice PDF may be omitted.", "invoice PDF", "attachment"],
    ["; either Finance or Legal may approve.", "invoice PDF", "attachment"],
    ["; one or more days may elapse.", "invoice PDF", "attachment"],
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        value,
        label,
        kind,
      ),
      false,
      value,
    );
  }

  for (const tail of [
    "either may be omitted",
    "either one may be omitted",
    "either of them may be omitted",
    "any one may be omitted",
    "any one of them may be omitted",
    "one or more may be omitted",
    "one or more of them may be omitted",
  ]) {
    const source = `Require invoice PDF; ${tail}.`;
    const result = attachmentSemanticResult({
      source,
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    });
    assertGovernedHold(result, source);
  }
  for (const tail of [
    "either may be left blank",
    "any one may be left blank",
    "one or more may be left blank",
  ]) {
    const source = `Require Amount; ${tail}.`;
    const result = requestFieldSemanticResult({
      source,
      anchorQuote: "Amount",
      label: "Amount",
      requiredQuote: "Require",
    });
    assertGovernedHold(result, source);
  }

  for (const quantifier of ["Each", "Every", "Any"]) {
    for (const predicate of ["is audited", "may be omitted"]) {
      const source =
        `Require invoice PDF; audited. ${quantifier} optional Excel schedule ${predicate}.`;
      assertSemanticPass(
        attachmentSemanticResult({
          source,
          anchorQuote: "invoice PDF",
          label: "invoice PDF",
          requiredQuote: "Require",
        }),
        source,
      );
    }
    for (const predicate of ["is audited", "may be left blank"]) {
      const source =
        `Require Amount; audited. ${quantifier} optional Notes field ${predicate}.`;
      assertSemanticPass(
        requestFieldSemanticResult({
          source,
          anchorQuote: "Amount",
          label: "Amount",
          requiredQuote: "Require",
        }),
        source,
      );
    }
  }

  for (const source of [
    "Require invoice PDF; Each of these attachments may be omitted.",
    "Require invoice PDF; Each one of these attachments may be omitted.",
    "Require invoice PDF; All of those documents may be omitted.",
    "Require invoice PDF; All three of these attachments may be omitted.",
    "Require invoice PDF; Any one of these attachments may be omitted.",
    "Require invoice PDF; Any of the attachments may be omitted.",
    "Require invoice PDF; Every one of these attachments may be omitted.",
    "Require invoice PDF; Every one of the attachments may be omitted.",
    "Require invoice PDF; Any required attachment may be omitted.",
    "Require invoice PDF; Every mandatory document may be omitted.",
    "Require invoice PDF; Every governed attachment may be omitted.",
    "Require invoice PDF; Any unidentified document may be omitted.",
    "Require invoice PDF; each may, however, be omitted.",
    "Require invoice PDF; each may (however) be omitted.",
    "Require invoice PDF; each may, in fact, be omitted.",
    "Require invoice PDF; each is, clearly, optional.",
    "Require invoice PDF; each is (explicitly) optional.",
    "Require invoice PDF; Each invoice PDF may be omitted.",
    "Require invoice PDF; Every invoice PDF may be omitted.",
    "Require invoice PDF; Any invoice PDF may be omitted.",
    "Require invoice PDF; Each attachment may be omitted.",
    "Require invoice PDF; Every attachment may be omitted.",
    "Require invoice PDF; Any attachment may be omitted.",
    "Require invoice PDF; Every unrelated invoice PDF in place of the required attachment may be omitted.",
  ]) {
    const result = attachmentSemanticResult({
      source,
      anchorQuote: source.includes("unrelated invoice PDF")
        ? "Require invoice PDF"
        : "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    });
    assertGovernedHold(result, source);
  }
  for (const source of [
    "Require Amount; Each of these fields may be left blank.",
    "Require Amount; Any one of those fields may be left blank.",
    "Require Amount; Any of the fields may be left blank.",
    "Require Amount; Every one of these fields may be left blank.",
    "Require Amount; Any required field may be left blank.",
    "Require Amount; Every governed field may be left blank.",
    "Require Amount; Any unidentified input may be left blank.",
    "Require Amount; each may, however, be left blank.",
    "Require Amount; each may, in fact, be left blank.",
    "Require Amount; each is, clearly, optional.",
    "Require Amount; each is (explicitly) optional.",
    "Require Amount; Each Amount may be left blank.",
    "Require Amount; Every Amount may be left blank.",
    "Require Amount; Any Amount may be left blank.",
    "Require Amount; Each field may be left blank.",
    "Require Amount; Every field may be left blank.",
    "Require Amount; Any field may be left blank.",
  ]) {
    const result = requestFieldSemanticResult({
      source,
      anchorQuote: "Amount",
      label: "Amount",
      requiredQuote: "Require",
    });
    assertGovernedHold(result, source);
  }

  for (const source of [
    "Require invoice PDF; Each unrelated attachment may be omitted.",
    "Require invoice PDF; Any optional Excel file may be omitted.",
    "Require invoice PDF; Every authorized reference document may be omitted.",
    "Require invoice PDF; Any newly approved purchase order document may be omitted.",
    "Require invoice PDF; each is, clearly, required.",
    "Require invoice PDF; each is (explicitly) audited.",
    "Require invoice PDF; Any optional purchase order spreadsheet may be omitted.",
    "Require invoice PDF; Any required purchase order spreadsheet may be omitted.",
    "Require invoice PDF; Each unrelated required attachment may be omitted.",
    "Require invoice PDF; Every governed Excel schedule may be omitted.",
    "Require invoice PDF; Any day may elapse.",
    "Require invoice PDF; Every day may elapse.",
    "Require invoice PDF; each may, however, remain required.",
    "Require invoice PDF; each may (however) be audited.",
    "Require invoice PDF; Each unrelated invoice PDF may be omitted.",
    "Require invoice PDF; Every unrelated invoice PDF may be omitted.",
    "Require invoice PDF; Any optional Excel schedule may be omitted.",
    "Require invoice PDF; either Finance or Legal may approve.",
    "Require invoice PDF; one or more days may elapse.",
    "Require invoice PDF; Every attachment remains required.",
  ]) {
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: source.includes("unrelated invoice PDF")
          ? "Require invoice PDF"
          : "invoice PDF",
        label: "invoice PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }
  for (const source of [
    "Require Amount; Any unidentified Notes field may be left blank.",
    "Require Amount; Every governed Comments field may be left blank.",
    "Require Amount; Any optional Reference field may be left blank.",
    "Require Amount; Every configured Comments field may be left blank.",
    "Require Amount; each may, however, remain required.",
    "Require Amount; each may, in fact, remain required.",
    "Require Amount; Every optional Notes field may be left blank.",
    "Require Amount; Any optional Notes field is audited.",
    "Require Amount; Any field remains required.",
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Amount",
        label: "Amount",
        requiredQuote: "Require",
      }),
      source,
    );
  }

  const structurallyAmbiguousHolds = [
    {
      source:
        "Require invoice PDF; Every required attachment under policy may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every currently required attachment in this workflow may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every required attachment that Finance reviews may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require Amount; Any configured field for Finance may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Amount",
    },
    {
      source:
        "Require invoice PDF; Every high priority attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source: "Require Amount; Any low risk field may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Amount",
    },
    {
      source:
        "Require invoice PDF; Every one-page attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every Chartreuse attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every average attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every high quality attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every unknown status document may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require Amount; Any standard priority field may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Amount",
    },
    {
      source:
        "Require Amount; Any low quality field may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Amount",
    },
    {
      source:
        "Require invoice PDF; Every high-quality supporting attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require Amount; Any low-quality supplemental field may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Amount",
    },
    {
      source:
        "Require invoice PDF; Every 2-page attachment under policy may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every 2 attachments under policy may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Any 2 attachments in this workflow may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require Amount; Any 2 fields for Finance may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Amount",
    },
    {
      source:
        "Require invoice PDF; Every 2-page attachment in place of the required attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Every 2-page invoice PDF attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "Require invoice PDF",
    },
    {
      source:
        "Require invoice PDF; Invoice PDF for interns may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "Require invoice PDF",
    },
    {
      source:
        "Require Amount; Amount for contractors may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Require Amount",
    },
    {
      source:
        "Require invoice PDF; Every Reference document in place of the required attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
      anchorQuote: "invoice PDF",
    },
    {
      source:
        "Require Amount; Any Cost center field to replace Amount may be left blank.",
      label: "Amount",
      kind: "request_field",
      anchorQuote: "Require Amount",
    },
    {
      source:
        "Require purchase order PDF; Every governed purchase order PDF document may be omitted.",
      label: "purchase order PDF",
      kind: "attachment",
      anchorQuote: "Require purchase order PDF",
    },
    {
      source:
        "Require Comments; Every governed Comments field may be left blank.",
      label: "Comments",
      kind: "request_field",
      anchorQuote: "Require Comments",
    },
  ];
  for (
    const { source, label, kind, anchorQuote } of structurallyAmbiguousHolds
  ) {
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        label,
        kind,
      ),
      true,
      continuation,
    );
    const result = kind === "attachment"
      ? attachmentSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote: "Require",
      })
      : requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote: "Require",
      });
    assertGovernedHold(result, source);
  }

  for (const [tail, label, kind] of [
    ["Average attachment may be omitted", "invoice PDF", "attachment"],
    ["High quality attachment may be omitted", "invoice PDF", "attachment"],
    ["Unknown status document may be omitted", "invoice PDF", "attachment"],
    ["Standard priority attachment may be omitted", "invoice PDF", "attachment"],
    ["Low quality file may be omitted", "invoice PDF", "attachment"],
    ["AVERAGE ATTACHMENT may be omitted", "invoice PDF", "attachment"],
    ["Average field may be left blank", "Amount", "request_field"],
    ["High quality input may be left blank", "Amount", "request_field"],
    ["Unknown status field may be left blank", "Amount", "request_field"],
    ["Standard priority field may be waived", "Amount", "request_field"],
    ["Low quality field may be left blank", "Amount", "request_field"],
    ["2-page attachment under policy may be omitted", "invoice PDF", "attachment"],
    ["2 fields for Finance may be left blank", "Amount", "request_field"],
    ["High-quality supporting attachment may be omitted", "invoice PDF", "attachment"],
    ["Low-quality supplemental field may be left blank", "Amount", "request_field"],
    ["Every VAT-2 document may replace the required attachment and be omitted", "invoice PDF", "attachment"],
    ["Every VAT-2 document may replace it and be omitted", "invoice PDF", "attachment"],
    ["Every VAT-2 document may substitute for the required attachment and be omitted", "invoice PDF", "attachment"],
    ["Every VAT-2 document may supersede the required attachment and be omitted", "invoice PDF", "attachment"],
    ["Every VAT-2 document can serve as a replacement for the required attachment and may be omitted", "invoice PDF", "attachment"],
    ["VAT-2 document may replace the required attachment and be omitted", "invoice PDF", "attachment"],
  ]) {
    const source = `Require ${label}; ${tail}.`;
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        label,
        kind,
      ),
      true,
      continuation,
    );
    const result = kind === "attachment"
      ? attachmentSemanticResult({
        source,
        anchorQuote: label,
        label,
        requiredQuote: "Require",
      })
      : requestFieldSemanticResult({
        source,
        anchorQuote: label,
        label,
        requiredQuote: "Require",
      });
    assertGovernedHold(result, source);
  }

  for (const { source, label, kind } of [
    {
      source:
        "Require invoice PDF. Invoice PDF for interns may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
    },
    {
      source:
        "Require Amount. Amount for contractors may be left blank.",
      label: "Amount",
      kind: "request_field",
    },
    {
      source:
        "Require invoice PDF. Average attachment may be omitted!",
      label: "invoice PDF",
      kind: "attachment",
    },
    {
      source:
        "Require invoice PDF. AVERAGE ATTACHMENT may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
    },
    {
      source:
        "Require Amount. Standard Priority Field may be waived.",
      label: "Amount",
      kind: "request_field",
    },
    {
      source:
        "Require invoice PDF. 2-page attachment under policy may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
    },
    {
      source:
        "Require Amount. Low-quality supplemental field may be left blank.",
      label: "Amount",
      kind: "request_field",
    },
  ]) {
    const continuation = source.slice(source.indexOf("."));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        label,
        kind,
      ),
      true,
      continuation,
    );
    const anchorQuote = `Require ${label}`;
    const result = kind === "attachment"
      ? attachmentSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote: "Require",
      })
      : requestFieldSemanticResult({
        source,
        anchorQuote,
        label,
        requiredQuote: "Require",
      });
    assertGovernedHold(result, source);
  }

  for (const { source, continuation, label, kind } of [
    {
      source:
        "Require invoice PDF — High-priority attachment may be omitted.",
      continuation: " — High-priority attachment may be omitted.",
      label: "invoice PDF",
      kind: "attachment",
    },
    {
      source:
        "Require Amount — Standard-priority field may be left blank.",
      continuation: " — Standard-priority field may be left blank.",
      label: "Amount",
      kind: "request_field",
    },
  ]) {
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        label,
        kind,
      ),
      true,
      continuation,
    );
    const result = kind === "attachment"
      ? attachmentSemanticResult({
        source,
        anchorQuote: label,
        label,
        requiredQuote: "Require",
      })
      : requestFieldSemanticResult({
        source,
        anchorQuote: label,
        label,
        requiredQuote: "Require",
      });
    assertGovernedHold(result, source);
  }

  const structurallyNamedSiblingPasses = [
    "Every Bank confirmation document may be omitted.",
    "Each Insurance policy document may be omitted.",
    "Any Budget narrative document may be omitted.",
    "Every Supporting evidence file may be omitted.",
    "Each Risk assessment form may be omitted.",
    "Every Board minutes document may be omitted.",
    "Any Annual report document may be omitted.",
    "Every one-way delivery document may be omitted.",
    "Every one-page summary document may be omitted.",
    "Any all-purpose supporting document may be omitted.",
    "Every authorized Reference document under policy may be omitted.",
    "Any newly approved Purchase order document in this workflow may be omitted.",
    "Every one-page Excel schedule may be omitted.",
    "Every invoice-redline document may be omitted.",
    "Every VAT-2 document may be omitted.",
    "Every unrelated 2-page attachment may be omitted.",
    "Bank confirmation document may be omitted.",
    "Invoice-redline document may be omitted.",
    "VAT-2 document may be omitted.",
    "Vendor onboarding document may be omitted.",
    "Contract intake document may be omitted.",
    "Due diligence document may be omitted.",
    "Vendor registration document may be omitted.",
    "Any authorized attachment is audited.",
  ];
  for (const tail of structurallyNamedSiblingPasses) {
    const source = `Require invoice PDF; ${tail}`;
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        "invoice PDF",
        "attachment",
      ),
      false,
      continuation,
    );
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "invoice PDF",
        label: "invoice PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }

  for (const tail of [
    "Every governed Cost center field may be left blank.",
    "Each Business unit field may be left blank.",
    "Any Employee ID field may be left blank.",
    "Every Tax jurisdiction field may be left blank.",
    "Each Legal entity field may be left blank.",
    "Any Vendor category field may be left blank.",
    "Every Budget owner field may be left blank.",
    "Any one-time password field may be left blank.",
    "Every configured Comments field for Finance may be left blank.",
    "Each one-way Notes field may be left blank.",
    "Any VAT-2 field may be left blank.",
    "VAT-2 field may be left blank.",
    "Cost center field may be left blank.",
    "Every configured field remains required.",
  ]) {
    const source = `Require Amount; ${tail}`;
    const continuation = source.slice(source.indexOf(";"));
    assert.equal(
      templateCopilotV3RequirementAuthorityContinuationIsQualified(
        continuation,
        "Amount",
        "request_field",
      ),
      false,
      continuation,
    );
    assertSemanticPass(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Amount",
        label: "Amount",
        requiredQuote: "Require",
      }),
      source,
    );
  }});
test("marker-before optional targets cannot inherit a required marker", () => {
  for (const [value, label, kind] of [
    [" an optional invoice PDF", "invoice PDF", "attachment"],
    [" optional invoice PDF", "invoice PDF", "attachment"],
    [" invoice PDF as an optional attachment", "invoice PDF", "attachment"],
    [" invoice PDF, optional", "invoice PDF", "attachment"],
    [" an optional Amount field", "Amount", "request_field"],
    [" Amount as an optional field", "Amount", "request_field"],
    ["一份選填的身份 PDF", "身份 PDF", "attachment"],
    ["選填身份 PDF", "身份 PDF", "attachment"],
    ["選填金額", "金額", "request_field"],
    ["一個選填金額欄位", "金額", "request_field"],
  ]) {
    assert.equal(
      templateCopilotV3RequirementSameHardTailIsQualified(
        value,
        label,
        kind,
        "marker_before_subject",
      ),
      true,
      value,
    );
  }
  assert.equal(
    templateCopilotV3RequirementSameHardTailIsQualified(
      " one invoice PDF, one purchase order PDF",
      "invoice PDF",
      "attachment",
      "marker_before_subject",
    ),
    false,
  );
  assertSemanticPass(
    attachmentSemanticResult({
      source: "Require one invoice PDF, one purchase order PDF.",
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    }),
    "affirmative marker-before attachment list",
  );


  for (const source of [
    "Require an optional invoice PDF.",
    "Require optional invoice PDF.",
    "Require invoice PDF as an optional attachment.",
    "Require invoice PDF, optional.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "invoice PDF",
        label: "invoice PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }
  for (const source of [
    "Require an optional Amount field.",
    "Require optional Amount.",
    "Require Amount as an optional field.",
    "Require Amount, optional.",
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({
        source,
        anchorQuote: "Amount",
        label: "Amount",
        requiredQuote: "Require",
      }),
      source,
    );
  }
  for (const { source, label, requiredQuote, kind } of [
    {
      source: "必須上載一份選填的身份 PDF。",
      label: "身份 PDF",
      requiredQuote: "必須",
      kind: "attachment",
    },
    {
      source: "必须上传选填身份 PDF。",
      label: "身份 PDF",
      requiredQuote: "必须",
      kind: "attachment",
    },
    {
      source: "必填選填金額。",
      label: "金額",
      requiredQuote: "必填",
      kind: "request_field",
    },
    {
      source: "必填一个选填金额字段。",
      label: "金额",
      requiredQuote: "必填",
      kind: "request_field",
    },
  ]) {
    const result = kind === "attachment"
      ? attachmentSemanticResult({
        source,
        anchorQuote: label,
        label,
        requiredQuote,
      })
      : requestFieldSemanticResult({
        source,
        anchorQuote: label,
        label,
        requiredQuote,
      });
    assertGovernedHold(result, source);
  }
});

test("postnominal target qualifiers and named optional siblings remain entity-local", () => {
  for (const source of [
    "Require invoice PDF, which is optional.",
    "Require invoice PDF, which is not required.",
    "Require invoice PDF, which may be left out.",
    "Require invoice PDF, an optional attachment.",
  ]) {
    const result = attachmentSemanticResult({
      source,
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    });
    assert.deepEqual(result.located.rejected, [], source);
    assertGovernedHold(result, source);
  }
  for (const source of [
    "Require Amount, which is optional.",
    "Require Amount, which is not required.",
    "Require Amount, which need not be provided.",
    "Require Amount, an optional field.",
  ]) {
    const result = requestFieldSemanticResult({
      source,
      anchorQuote: "Amount",
      label: "Amount",
      requiredQuote: "Require",
    });
    assert.deepEqual(result.located.rejected, [], source);
    assertGovernedHold(result, source);
  }
  for (const { source, anchorQuote } of [
    {
      source: "Require invoice PDF, optional purchase order spreadsheet.",
      anchorQuote: "Require invoice PDF, optional purchase order spreadsheet",
    },
    {
      source: "Require invoice PDF and optional purchase order spreadsheet.",
      anchorQuote: "Require invoice PDF and optional purchase order spreadsheet",
    },
  ]) {
    for (const providerAnchor of ["invoice PDF", anchorQuote]) {
      assertSemanticPass(
        attachmentSemanticResult({
          source,
          anchorQuote: providerAnchor,
          label: "invoice PDF",
          requiredQuote: "Require",
        }),
        `${source} :: ${providerAnchor}`,
      );
    }
  }
  for (const { source, anchorQuote } of [
    {
      source: "Require Amount, optional Notes field.",
      anchorQuote: "Require Amount, optional Notes field",
    },
    {
      source: "Require Amount and optional Notes field.",
      anchorQuote: "Require Amount and optional Notes field",
    },
  ]) {
    for (const providerAnchor of ["Amount", anchorQuote]) {
      assertSemanticPass(
        requestFieldSemanticResult({
          source,
          anchorQuote: providerAnchor,
          label: "Amount",
          requiredQuote: "Require",
        }),
        `${source} :: ${providerAnchor}`,
      );
    }
  }
});

test("immediate optional imperatives preserve target identity", () => {
  for (const source of [
    "Require invoice PDF; Allow an optional invoice PDF.",
    "Require invoice PDF; Allow an optional copy of the invoice PDF.",
    "Require invoice PDF; Allow an optional attachment.",
  ]) {
    const result = attachmentSemanticResult({
      source,
      anchorQuote: "Require invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    });
    assert.deepEqual(result.located.rejected, [], source);
    assertGovernedHold(result, source);
  }
  for (const source of [
    "Require Amount; Add an optional Amount field.",
    "Require Amount; Add an optional copy of the Amount field.",
    "Require Amount; Add an optional field.",
  ]) {
    const result = requestFieldSemanticResult({
      source,
      anchorQuote: "Require Amount",
      label: "Amount",
      requiredQuote: "Require",
    });
    assert.deepEqual(result.located.rejected, [], source);
    assertGovernedHold(result, source);
  }
  assertSemanticPass(
    attachmentSemanticResult({
      source: "Require invoice PDF; Allow an optional redline PDF.",
      anchorQuote: "Require invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    }),
    "immediate distinct optional attachment",
  );
  assertSemanticPass(
    requestFieldSemanticResult({
      source: "Require Amount; Add an optional Notes field.",
      anchorQuote: "Require Amount",
      label: "Amount",
      requiredQuote: "Require",
    }),
    "immediate distinct optional field",
  );
  assertSemanticPass(
    attachmentSemanticResult({
      source: "Require invoice PDF, which is audited.",
      anchorQuote: "invoice PDF",
      label: "invoice PDF",
      requiredQuote: "Require",
    }),
    "benign relative attachment fact",
  );
  assertSemanticPass(
    requestFieldSemanticResult({
      source: "Require Amount, which is audited.",
      anchorQuote: "Amount",
      label: "Amount",
      requiredQuote: "Require",
    }),
    "benign relative field fact",
  );
});

test("optional imperative siblings stay entity-local while substitutions and explicit target qualifiers hold", () => {
  for (const source of [
    "Require invoice PDF; audited. Also allow an optional Excel schedule.",
    "Require invoice PDF; audited. Then include an optional redline PDF.",
    "Require invoice PDF; audited. Please also allow an optional Excel schedule.",
    "Require invoice PDF; audited. We allow an optional Excel schedule.",
    "Require invoice PDF; audited. Users may add an optional Excel schedule.",
  ]) {
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "invoice PDF",
        label: "invoice PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }
  for (const source of [
    "Require invoice PDF; audited. Allow an optional redline PDF to replace it.",
    "Require invoice PDF; audited. Allow an optional redline PDF in lieu of the required attachment.",
    "Require invoice PDF; audited. Allow an optional redline PDF in place of the required attachment.",
    "Require invoice PDF. Invoice PDF, clearly optional.",
    "Require invoice PDF. Invoice PDF, explicitly optional.",
    "Require invoice PDF. Invoice PDF, demonstrably not required.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "invoice PDF",
        label: "invoice PDF",
        requiredQuote: "Require",
      }),
      source,
    );
  }
});

test("long comma-delimited authority context completes without changing the target", () => {
  const source = `Amount is required. ${Array(30).fill("Amount is audited").join(", ")}.`;
  assertSemanticPass(
    requestFieldSemanticResult({ source, anchorQuote: "Amount is required" }),
    source,
  );
});

test("attachment authority is entity-local, chunk-safe, and quote-width invariant", () => {
  for (const source of [
    "Subject to review, Identity PDF is required.",
    "Following review, Identity PDF is required.",
    "Identity PDF is required for interns.",
    "Identity PDF is required, high-risk requests only.",
    "Identity PDF is required to the extent applicable.",
    "Identity PDF is required at the manager's discretion.",
    "Identity PDF is required with approval.",
    "待確認，合約 PDF 必須上載。",
    "經財務批准後，合約 PDF 必須上載。",
  ]) {
    const cjk = source.includes("合約");
    const label = cjk ? "合約 PDF" : "Identity PDF";
    const requiredQuote = cjk ? "上載" : "required";
    const narrow = cjk ? "合約 PDF 必須上載" : "Identity PDF is required";
    for (const anchorQuote of [label, narrow, source]) {
      assertGovernedHold(
        attachmentSemanticResult({
          source,
          anchorQuote,
          label,
          requiredQuote,
        }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }

  for (const source of [
    "For the avoidance of doubt, Identity PDF is required.",
    "In this workflow, Identity PDF is required.",
    "Identity PDF is required for every submission.",
    "Identity PDF is required for compliance.",
    "Identity PDF is marked as required.",
    "Identity PDF will remain required.",
  ]) {
    const narrow = source.includes("Identity PDF is required")
      ? "Identity PDF is required"
      : source.slice(0, -1);
    for (const anchorQuote of ["Identity PDF", narrow, source]) {
      assertSemanticPass(
        attachmentSemanticResult({ source, anchorQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }

  for (const source of [
    "Identity PDF is required. Identity PDF, according to policy, is optional.",
    "Identity PDF is required. Identity PDF is, according to policy, optional.",
    "Identity PDF is required. According to policy, After review, For interns, As an exception, the attachment is optional.",
    "合約 PDF 必須上載。合約 PDF，根據政策，為選填。",
  ]) {
    const cjk = source.includes("合約");
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: cjk ? "合約 PDF 必須上載" : "Identity PDF is required",
        label: cjk ? "合約 PDF" : "Identity PDF",
        requiredQuote: cjk ? "上載" : "required",
      }),
      source,
    );
  }

  for (const source of [
    "Identity PDF is required and redline PDF is optional if notes are missing.",
    "Identity PDF is required, and redline PDF is optional if notes are missing.",
    "Identity PDF is required and if notes are missing upload redline PDF.",
    "Redline is optional if notes are missing, and Identity PDF is required.",
    "合約 PDF 必須上載，若有需要則上載紅線 PDF。",
    "合同 PDF 必须上传，若有需要则上传红线 PDF。",
    "Identity PDF is required. The notes for Identity PDF are optional.",
    "Identity PDF is required. Identity PDF attachment notes are optional.",
    "Identity PDF is required. This optional redline PDF is allowed.",
    "Identity PDF is required. That optional identity form is allowed.",
  ]) {
    const traditional = source.includes("合約");
    const simplified = source.includes("合同");
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: traditional
          ? "合約 PDF 必須上載"
          : simplified
            ? "合同 PDF 必须上传"
            : "Identity PDF is required",
        label: traditional ? "合約 PDF" : simplified ? "合同 PDF" : "Identity PDF",
        requiredQuote: traditional ? "上載" : simplified ? "上传" : "required",
      }),
      source,
    );
  }

  for (const source of [
    "Identity PDF is required if requested.",
    "Identity PDF is required and if notes are missing upload Identity PDF.",
    "Identity PDF is required and if missing it may be waived.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF is required",
      }),
      source,
    );
  }

  for (const size of [8_001, 16_001, 80_000]) {
    const start = "Identity PDF is required. ";
    const end = " Context completed.";
    const source = `${start}${"x".repeat(size - start.length - end.length)}${end}`;
    assert.equal(Array.from(source).length, size);
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF is required",
      }),
      `attachment semantic context length ${size}`,
    );
  }

  for (const startCodePoint of [
    7_900,
    7_990,
    7_999,
    8_000,
    8_001,
    11_999,
    12_000,
    15_990,
    15_999,
    16_000,
    16_001,
    23_999,
    24_000,
    31_999,
    32_000,
    39_999,
    40_000,
    71_999,
    72_000,
  ]) {
    const source = `${"x".repeat(startCodePoint - 1)}.Identity PDF is required.${".".repeat(100)}`;
    assert.equal(source.indexOf("Identity PDF"), startCodePoint);
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF is required",
      }),
      `attachment crossing former context boundary at ${startCodePoint}`,
    );
  }
});

test("earlier and coordinated same-target contradictions cannot be overwritten silently", () => {
  for (const { source, label = "Amount", requiredQuote = "required", anchorQuote = `${label} is ${requiredQuote}` } of [
    { source: "Amount is optional. Amount is required." },
    { source: "Amount may be omitted. Amount is required." },
    { source: "Amount may be left blank. Amount is required." },
    { source: "Amount may be absent. Amount is required." },
    { source: "Amount is elective. Amount is required." },
    { source: "Amount may be excluded. Amount is required." },
    { source: "Amount doesn’t have to be entered. Amount is required." },
    { source: "Amount is not essential. Amount is required." },
    { source: "Amount is non-mandatory. Amount is required." },
    { source: "Amount is at the applicant’s choice. Amount is required." },
    { source: "Amount is not a prerequisite. Amount is required." },
    { source: "Amount can be dispensed with. Amount is required." },
    { source: "Amount does not have to be provided. Amount is required." },
    { source: "Amount is not obligatory. Amount is required." },
    { source: "Do not require Amount. Amount is required." },
    { source: "Amount is not required. Amount is required." },
    { source: "Amount optional and Amount is required." },
    { source: "Amount optional or Amount is required." },
    { source: "Amount can be left blank and Amount is required." },
    { source: "金額選填。金額是必填。", label: "金額", requiredQuote: "必填", anchorQuote: "金額是必填" },
    { source: "金額可留空。金額是必填。", label: "金額", requiredQuote: "必填", anchorQuote: "金額是必填" },
    { source: "金額毋須提供。金額是必填。", label: "金額", requiredQuote: "必填", anchorQuote: "金額是必填" },
    { source: "金额选填。金额是必填。", label: "金额", requiredQuote: "必填", anchorQuote: "金额是必填" },
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({ source, anchorQuote, label, requiredQuote }),
      source,
    );
  }

  for (const source of [
    "Identity PDF is optional. Identity PDF is required.",
    "Identity PDF may be omitted. Identity PDF is required.",
    "Identity PDF may be left out. Identity PDF is required.",
    "Identity PDF may be absent. Identity PDF is required.",
    "Identity PDF may be excluded. Identity PDF is required.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({ source, anchorQuote: "Identity PDF is required" }),
      source,
    );
  }

  for (const source of [
    "Notes are optional. Amount is required.",
    "Amount is optional. Correction: Amount is required.",
    "Amount is audited. Amount is required.",
    "Amount has been audited. Amount is required.",
    "Amount is already required. Amount is required.",
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({ source, anchorQuote: "Amount is required" }),
      source,
    );
  }

  for (const source of [
    "Amount is optional, no correction: Amount is required.",
    "Amount is optional, correction rejected: Amount is required.",
    "Amount is optional, proposed correction: Amount is required.",
    "Amount is optional, possible correction: Amount is required.",
    "Amount is optional, correction: Notes are required, Amount is required.",
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({ source, anchorQuote: "Amount is required" }),
      source,
    );
  }

  for (const source of [
    "Identity PDF is optional, no correction: Identity PDF is required.",
    "Identity PDF is optional, correction: Redline PDF is required, Identity PDF is required.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({ source, anchorQuote: "Identity PDF is required" }),
      source,
    );
  }
});

test("a closed optional sibling before a comma is distinct from the required target", () => {
  for (const { source, label = "Amount", requiredQuote = "required" } of [
    { source: "Notes optional, Amount is required." },
    { source: "Notes are optional, Amount is required." },
    { source: "Notes may be omitted, Amount is required." },
    { source: "備註選填，金額必填。", label: "金額", requiredQuote: "必填" },
    { source: "备注选填，金额必填。", label: "金额", requiredQuote: "必填" },
  ]) {
    const narrow = requiredQuote === "required"
      ? `${label} is required`
      : `${label}${requiredQuote}`;
    for (const anchorQuote of [label, narrow, source]) {
      assertSemanticPass(
        requestFieldSemanticResult({ source, anchorQuote, label, requiredQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }

  assertSemanticPass(
    attachmentSemanticResult({
      source: "Redline PDF is optional, Identity PDF is required.",
      anchorQuote: "Identity PDF",
    }),
    "distinct optional attachment sibling",
  );
  assertGovernedHold(
    requestFieldSemanticResult({
      source: "Amount optional, Amount is required.",
      anchorQuote: "Amount is required",
    }),
    "same target before comma",
  );
  assertGovernedHold(
    requestFieldSemanticResult({
      source: "For high-risk requests, Amount is required.",
      anchorQuote: "Amount",
    }),
    "governing scope before comma",
  );
});

test("closed punctuation may separate a subject from an affirmative required marker", () => {
  for (const source of [
    "Amount: required.",
    "Amount (required).",
    "Amount [required].",
    "Amount — required.",
    "Amount, required.",
    "Amount - required.",
  ]) {
    for (const anchorQuote of ["Amount", source.slice(0, -1)]) {
      assertSemanticPass(
        requestFieldSemanticResult({ source, anchorQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
  for (const { source, label } of [
    { source: "用途：必填。", label: "用途" },
    { source: "用途（必填）。", label: "用途" },
    { source: "用途【必填】。", label: "用途" },
  ]) {
    assertSemanticPass(
      requestFieldSemanticResult({ source, anchorQuote: label, label, requiredQuote: "必填" }),
      source,
    );
  }
  for (const source of [
    "Amount (required.",
    "Amount required).",
    "Amount: required only for Finance.",
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({ source, anchorQuote: "Amount" }),
      source,
    );
  }
});

test("frequency, preference, inversion, and subgroup scopes stay review-only", () => {
  for (const source of [
    "Amount is required frequently.",
    "Amount is required more often than not.",
    "Amount is required per manager preference.",
    "Amount is required should Finance request it.",
    "Amount is required per TBD.",
    "Amount is required subjectively.",
    "Amount is required as management sees fit.",
  ]) {
    for (const anchorQuote of ["Amount", "Amount is required", source]) {
      assertGovernedHold(
        requestFieldSemanticResult({ source, anchorQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
  for (const { source, label, requiredQuote } of [
    { source: "金額往往是必填。", label: "金額", requiredQuote: "必填" },
    { source: "金额往往是必填。", label: "金额", requiredQuote: "必填" },
    { source: "金額按經理意願是必填。", label: "金額", requiredQuote: "必填" },
    { source: "金额按经理意愿是必填。", label: "金额", requiredQuote: "必填" },
    { source: "高風險申請必須填寫金額。", label: "金額", requiredQuote: "必須填寫" },
    { source: "高风险申请必须填写金额。", label: "金额", requiredQuote: "必须填写" },
    { source: "申請獲批後必須填寫金額。", label: "金額", requiredQuote: "必須填寫" },
  ]) {
    for (const anchorQuote of [label, source]) {
      assertGovernedHold(
        requestFieldSemanticResult({ source, anchorQuote, label, requiredQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
  for (const { source, label = "Amount", requiredQuote = "must provide" } of [
    { source: "High-risk requests must provide Amount." },
    { source: "External vendors must provide Amount." },
    { source: "Temporary suppliers must provide Amount." },
    { source: "Hong Kong suppliers must provide Amount." },
    { source: "Finance employees must provide Amount." },
    { source: "First-time applicants must provide Amount." },
    { source: "高風險時必須填寫金額及用途。", label: "金額", requiredQuote: "必須填寫" },
    { source: "臨時供應商必須填寫金額。", label: "金額", requiredQuote: "必須填寫" },
    { source: "財務部員工必須填寫金額。", label: "金額", requiredQuote: "必須填寫" },
  ]) {
    assertGovernedHold(
      requestFieldSemanticResult({ source, anchorQuote: label, label, requiredQuote }),
      source,
    );
  }
  for (const source of [
    "Identity PDF is required frequently.",
    "Identity PDF is required per manager preference.",
    "Identity PDF is required should Finance request it.",
    "High-risk requests must provide Identity PDF.",
    "Temporary suppliers must provide Identity PDF.",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF",
        requiredQuote: source.includes("must provide") ? "must provide" : "required",
      }),
      source,
    );
  }

  for (const source of [
    "Supplier must provide Identity PDF.",
    "Suppliers must provide Identity PDF.",
  ]) {
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "Identity PDF",
        requiredQuote: "must provide",
      }),
      source,
    );
  }
});

test("explicit universal adverbs remain unconditional requirements", () => {
  for (const source of [
    "Amount is invariably required.",
    "Amount is categorically required.",
  ]) {
    for (const anchorQuote of ["Amount", "Amount is required".replace(" is ", source.includes("invariably") ? " is invariably " : " is categorically "), source]) {
      assertSemanticPass(
        requestFieldSemanticResult({ source, anchorQuote }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
  for (const { source, label } of [
    { source: "金額一律必填。", label: "金額" },
    { source: "金额一概必填。", label: "金额" },
    { source: "一律必填金額。", label: "金額" },
  ]) {
    for (const anchorQuote of [label, source]) {
      assertSemanticPass(
        requestFieldSemanticResult({ source, anchorQuote, label, requiredQuote: "必填" }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
});

test("CJK clause boundaries do not split lexical labels", () => {
  for (const { source, label } of [
    { source: "免責但書是必填。", label: "免責但書" },
    { source: "免责但书是必填。", label: "免责但书" },
    { source: "若干金額是必填。", label: "若干金額" },
    { source: "若干金额是必填。", label: "若干金额" },
  ]) {
    for (const anchorQuote of [label, source]) {
      assertSemanticPass(
        requestFieldSemanticResult({
          source,
          anchorQuote,
          label,
          requiredQuote: "必填",
        }),
        `${source} :: ${anchorQuote}`,
      );
    }
  }
});

test("TC-06 shared lists and bare native-form fill retain exact authority", () => {
  assertSemanticPass(
    requestFieldSemanticResult({
      source: "必填政策名稱及條款、豁免原因、開始及結束日期、風險等級、受影響人數、補償控制及負責人。",
      anchorQuote: "政策名稱及條款",
      label: "政策名稱及條款",
      requiredQuote: "必填",
    }),
    "TC-06 first shared required field",
  );
  for (const source of [
    "填原生補償控制表。",
    "必須上載風險評估 PDF，並填原生補償控制表，包括控制、負責人、頻率及證據。",
  ]) {
    assertSemanticPass(
      attachmentSemanticResult({
        source,
        anchorQuote: "原生補償控制表",
        label: "原生補償控制表",
        kindQuote: "原生",
        kindHint: "form",
        requiredQuote: "填",
      }),
      source,
    );
  }
  for (const source of [
    "可填原生補償控制表。",
    "若需要可填原生補償控制表。",
    "不要填原生補償控制表。",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: "原生補償控制表",
        label: "原生補償控制表",
        kindQuote: "原生",
        kindHint: "form",
        requiredQuote: "填",
      }),
      source,
    );
  }
});

test("attachment substitutions cannot preserve the original unconditional requirement", () => {
  for (const source of [
    "Identity PDF is required and if notes are missing upload redline PDF, which may replace Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF, which may replace it.",
    "Identity PDF is required and if notes are missing upload redline PDF to replace it.",
    "Identity PDF is required and if notes are missing upload redline PDF instead.",
    "Identity PDF is required and if notes are missing upload redline PDF as a substitute.",
    "Identity PDF is required and if notes are missing upload redline PDF, which may be used in lieu of Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF in place of Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF to stand in for Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF to take the place of Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF to supersede Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF to serve as the equivalent of Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF, which may obviate the need for Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF, which may remove the need for Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF, which may make Identity PDF unnecessary.",
    "Identity PDF is required and if notes are missing upload redline PDF, which may allow omission of Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF to satisfy the Identity PDF requirement.",
    "Identity PDF is required and if notes are missing upload redline PDF to supplant Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF to displace Identity PDF.",
    "Identity PDF is required and if notes are missing upload redline PDF to stand as a proxy for Identity PDF.",
    "身分 PDF 必須上載，若備註缺失可上載紅線 PDF 頂替身分 PDF。",
  ]) {
    assertGovernedHold(
      attachmentSemanticResult({
        source,
        anchorQuote: source.includes("身分") ? "身分 PDF 必須上載" : "Identity PDF is required",
        label: source.includes("身分") ? "身分 PDF" : "Identity PDF",
        requiredQuote: source.includes("身分") ? "上載" : "required",
      }),
      source,
    );
  }
});

test("repeated benign same-subject clauses do not have a 32-item semantic cliff", () => {
  for (const count of [32, 33, 96]) {
    const source = `Amount is required, ${Array(count).fill("Amount is audited").join(", ")}.`;
    assertSemanticPass(
      requestFieldSemanticResult({ source, anchorQuote: "Amount is required" }),
      `${count} repeated candidates`,
    );
  }
});

test("policy notification lists use distinct progressive anchors across varied multilingual lengths", () => {
  const cases = [
    {
      caseId: "EN",
      source:
        "Notify only directly involved people for submitted, assignment, stage completed, rejection, correction, completion, due soon, and overdue.",
      anchorStart: "only",
      recipient: "directly involved people",
      visibility: "only",
      events: [
        ["submitted", "request_submitted"],
        ["assignment", "stage_assigned"],
        ["stage completed", "stage_completed"],
        ["rejection", "request_rejected"],
        ["correction", "correction_requested"],
        ["completion", "request_completed"],
        ["due soon", "due_soon"],
        ["overdue", "overdue"],
      ],
    },
    {
      caseId: "TC",
      source:
        "只通知直接相關人士，事件包括獲指派、逾期及完成。",
      anchorStart: "只",
      recipient: "直接相關人士",
      visibility: "只",
      events: [
        ["獲指派", "stage_assigned"],
        ["逾期", "overdue"],
        ["完成", "request_completed"],
      ],
    },
    {
      caseId: "SC",
      source:
        "仅通知直接相关人员拒绝。",
      anchorStart: "仅",
      recipient: "直接相关人员",
      visibility: "仅",
      events: [
        ["拒绝", "request_rejected"],
      ],
    },
  ];

  for (const entry of cases) {
    const sourceSlots = templateCopilotV3ProviderQuoteBatches.policy_context
      .slots.map((slot) => ({
        slot,
        messageId: `notification-list:${entry.caseId}:${slot}`,
        text: slot === "visibility_notifications"
          ? entry.source
          : `No ${slot} requirements supplied.`,
      }));
    const anchorStart = entry.source.indexOf(entry.anchorStart);
    assert.ok(anchorStart >= 0, entry.caseId);
    const items = entry.events.map(([event, hint]) => {
      const eventStart = entry.source.indexOf(event, anchorStart);
      assert.ok(eventStart >= 0, `${entry.caseId}:${event}`);
      return providerItem(
        "notification",
        entry.source.slice(anchorStart, eventStart + event.length),
        [
          { role: "event", quote: event, hint },
          {
            role: "recipient",
            quote: entry.recipient,
            hint: "source_named_group",
          },
          {
            role: "visibility",
            quote: entry.visibility,
            hint: "recipients_only",
          },
        ],
      );
    });
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "policy_context",
      sourceSlots,
      output: { contractVersion: 1, items },
    });
    assert.deepEqual(located.rejected, [], entry.caseId);
    assert.equal(located.accepted.length, entry.events.length, entry.caseId);
    assert.equal(
      new Set(located.accepted.map((item) => item.anchor.spanId)).size,
      entry.events.length,
      entry.caseId,
    );
    const assembly = assembleLocated(located, sourceSlots);
    const notifications = assembly.review.items.filter(
      (item) => item.factId === "notifications.rules",
    );
    assert.equal(notifications.length, entry.events.length, entry.caseId);
    assert.ok(
      notifications.every((item) => item.semanticComplete),
      `${entry.caseId}:${JSON.stringify(assembly.review.rejections)}`,
    );
  }
});

test("notification visibility cannot strip multilingual not-only scope", () => {
  const cases = [
    {
      caseId: "EN",
      source:
        "Notify not only directly involved people on rejection, but all participants.",
      quote: "only directly involved people on rejection",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "directly involved people",
      visibility: "only",
    },
    {
      caseId: "TC-not-only-zhi",
      source: "不只通知直接相關人士拒絕，也通知所有流程參與者。",
      quote: "只通知直接相關人士拒絕",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "直接相關人士",
      visibility: "只",
    },
    {
      caseId: "TC-not-only-jin",
      source: "不僅通知直接相關人士拒絕，也通知所有流程參與者。",
      quote: "僅通知直接相關人士拒絕",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "直接相關人士",
      visibility: "僅",
    },
    {
      caseId: "TC-not-merely",
      source: "非僅通知直接相關人士拒絕，也通知所有流程參與者。",
      quote: "僅通知直接相關人士拒絕",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "直接相關人士",
      visibility: "僅",
    },
    {
      caseId: "SC-not-only",
      source: "不仅通知直接相关人员拒绝，也通知所有流程参与者。",
      quote: "仅通知直接相关人员拒绝",
      event: "拒绝",
      eventHint: "request_rejected",
      recipient: "直接相关人员",
      visibility: "仅",
    },
    {
      caseId: "SC-not-merely",
      source: "非仅通知直接相关人员拒绝，也通知所有流程参与者。",
      quote: "仅通知直接相关人员拒绝",
      event: "拒绝",
      eventHint: "request_rejected",
      recipient: "直接相关人员",
      visibility: "仅",
    },
  ];

  for (const entry of cases) {
    const sourceSlots = templateCopilotV3ProviderQuoteBatches.policy_context
      .slots.map((slot) => ({
        slot,
        messageId: `notification-not-only:${entry.caseId}:${slot}`,
        text: slot === "visibility_notifications"
          ? entry.source
          : `No ${slot} requirements supplied.`,
      }));
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "policy_context",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [
          providerItem("notification", entry.quote, [
            {
              role: "event",
              quote: entry.event,
              hint: entry.eventHint,
            },
            {
              role: "recipient",
              quote: entry.recipient,
              hint: "source_named_group",
            },
            {
              role: "visibility",
              quote: entry.visibility,
              hint: "recipients_only",
            },
          ]),
        ],
      },
    });
    assert.deepEqual(located.rejected, [], entry.caseId);
    const assembly = assembleLocated(located, sourceSlots);
    const notification = assembly.review.items.find(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notification, entry.caseId);
    assert.equal(notification.semanticComplete, false, entry.caseId);
    assert.equal(notification.value.visibility, undefined, entry.caseId);
    for (const field of ["semanticLeaves", "semanticObservations"]) {
      assert.ok(
        !notification[field].some((leaf) => leaf.role === "visibility"),
        `${entry.caseId}:${field}`,
      );
    }
    assert.ok(
      !notification.bindings.some(
        (binding) => binding.path === "/visibility",
      ),
      entry.caseId,
    );
    assert.equal(notification.fragmentId, null, entry.caseId);
    assert.ok(
      assembly.review.rejections.some(
        (rejection) =>
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === "notification:visibility",
      ),
      entry.caseId,
    );
  }
});

test("notification visibility retains exact affirmative multilingual markers", () => {
  const cases = [
    {
      caseId: "EN-only",
      source: "Notify only directly involved people on rejection.",
      quote: "only directly involved people on rejection",
      event: "rejection",
      recipient: "directly involved people",
      visibility: "only",
    },
    {
      caseId: "TC-zhi",
      source: "只通知直接相關人士拒絕。",
      quote: "只通知直接相關人士拒絕",
      event: "拒絕",
      recipient: "直接相關人士",
      visibility: "只",
    },
    {
      caseId: "TC-jin",
      source: "僅通知直接相關人士拒絕。",
      quote: "僅通知直接相關人士拒絕",
      event: "拒絕",
      recipient: "直接相關人士",
      visibility: "僅",
    },
    {
      caseId: "SC-jin",
      source: "仅通知直接相关人员拒绝。",
      quote: "仅通知直接相关人员拒绝",
      event: "拒绝",
      recipient: "直接相关人员",
      visibility: "仅",
    },
  ];

  for (const entry of cases) {
    const sourceSlots = templateCopilotV3ProviderQuoteBatches.policy_context
      .slots.map((slot) => ({
        slot,
        messageId: `notification-affirmative:${entry.caseId}:${slot}`,
        text: slot === "visibility_notifications"
          ? entry.source
          : `No ${slot} requirements supplied.`,
      }));
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "policy_context",
      sourceSlots,
      output: {
        contractVersion: 1,
        items: [
          providerItem("notification", entry.quote, [
            {
              role: "event",
              quote: entry.event,
              hint: "request_rejected",
            },
            {
              role: "recipient",
              quote: entry.recipient,
              hint: "source_named_group",
            },
            {
              role: "visibility",
              quote: entry.visibility,
              hint: "recipients_only",
            },
          ]),
        ],
      },
    });
    assert.deepEqual(located.rejected, [], entry.caseId);
    const assembly = assembleLocated(located, sourceSlots);
    const notification = assembly.review.items.find(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notification, entry.caseId);
    assert.equal(notification.semanticComplete, true, entry.caseId);
    assert.ok(
      notification.semanticObservations.some(
        (leaf) => leaf.role === "visibility",
      ),
      entry.caseId,
    );
  }
});
