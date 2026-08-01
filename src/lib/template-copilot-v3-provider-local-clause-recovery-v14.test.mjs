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

function structureSources({ initiatorsFields, attachments }) {
  return templateCopilotV3ProviderQuoteBatches.structure.slots.map((slot) => ({
    slot,
    messageId: `local-clause-v14:${slot}`,
    text: slot === "initiators_fields"
      ? initiatorsFields
      : slot === "attachments"
        ? attachments
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
  assert.equal(item.persisted, false);
  assert.equal(item.executable, false);
  assert.equal(item.value.label, "Go/No-Go 評分表");
  assert.deepEqual(item.semanticValue.kind, ["原生"]);
  assert.deepEqual(item.semanticValue.required, ["上載"]);
  assert.deepEqual(assembly.review.rejections, [
    {
      itemIndex: 0,
      kind: "attachment",
      code: "unverifiable_leaf",
      detail: "attachment:kind",
    },
    {
      itemIndex: 0,
      kind: "attachment",
      code: "unverifiable_leaf",
      detail: "attachment:required",
    },
  ]);
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
    {
      source: "Identity PDF is required. identity document is optional.",
      quote: "Identity PDF is required",
      label: "Identity PDF",
      requiredQuote: "required",
    },
    {
      source: "Identity PDF is required. identity file is optional.",
      quote: "Identity PDF is required",
      label: "Identity PDF",
      requiredQuote: "required",
    },
    {
      source: "Identity PDF is required. identity form is optional.",
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
    "Amount is required. Amount field notes are optional.",
    "Amount is required. Amount input notes are optional.",
    "Amount is required. This optional comment field is available.",
    "Amount is required. That optional notes field is visible.",
    "Amount is required. This potentially optional comment field is available.",
    "Amount is required. The comment was discussed. It is optional.",
    "Amount is required. Comment is optional. It can be omitted.",
    `Amount is required. It remains audited and ${"background ".repeat(450)}comments are optional.`,
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
