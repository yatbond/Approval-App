import assert from "node:assert/strict";
import test from "node:test";
import {
  templateCopilotV3AppendMaximumFragments,
  templateCopilotV3AppendMaximumNewSourceSpans,
  templateCopilotV3AppendMaximumPayloadUtf8Bytes,
  templateCopilotV3CanonicalJsonNumberText,
  templateCopilotV3CanonicalDecimalText,
  templateCopilotV3DirectEvidenceRules,
  templateCopilotV3ContainsNonWhitespace,
  templateCopilotV3DirectEvidenceDerivesLeaf,
  templateCopilotV3EvidenceAppendSchema,
  templateCopilotV3EvidenceAppendPayloadUtf8Bytes,
  templateCopilotV3EvidenceCompilerVersion,
  templateCopilotV3EvidenceContractVersion,
  templateCopilotV3EvidenceDeltaHash,
  templateCopilotV3ExtractionEnvelopeSchema,
  templateCopilotV3FragmentFactIds,
  templateCopilotV3FragmentId,
  templateCopilotV3FragmentSchema,
  templateCopilotV3LexicalAliases,
  templateCopilotV3NormalizeLexicalText,
  templateCopilotV3SourceSpanId,
  templateCopilotV3SourceSpanSchema,
  templateCopilotV3StringHasOuterTrimWhitespace,
  templateCopilotV3StringIsPostgresSafe,
  validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority,
  validateTemplateCopilotV3SourceSpan,
} from "./template-copilot-v3-evidence.ts";

function sourceSpan(messageId, message, exactText, occurrence = 0) {
  let startCodeUnit = -1;
  let searchFrom = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    startCodeUnit = message.indexOf(exactText, searchFrom);
    assert.notEqual(startCodeUnit, -1);
    searchFrom = startCodeUnit + exactText.length;
  }
  const startCodePoint = Array.from(message.slice(0, startCodeUnit)).length;
  const endCodePoint = startCodePoint + Array.from(exactText).length;
  const input = {
    messageId,
    startCodePoint,
    endCodePoint,
    exactText,
  };
  return {
    spanId: templateCopilotV3SourceSpanId(input),
    ...input,
  };
}

function fragment({
  factId = "request.fields",
  value = { label: "Amount" },
  bindings,
  missingPaths = ["/type", "/required", "/options"],
  ...overrides
} = {}) {
  const withoutId = {
    evidenceVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    factId,
    fragmentKind: "array_item",
    state: "open",
    value,
    bindings:
      bindings ??
      [{ path: "/label", spanIds: ["a".repeat(64)], rule: "exact" }],
    missingPaths,
    confidence: "high",
    ambiguity: "none",
    ...overrides,
  };
  return {
    fragmentId: templateCopilotV3FragmentId(withoutId),
    ...withoutId,
  };
}

function envelope(sourceSpans, fragments) {
  return {
    contractVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    sourceSpans,
    fragments,
  };
}

test("v3 foundation accepts only open incomplete canonical array-item fragments", () => {
  const message = "Amount";
  const span = sourceSpan("message:field-amount", message, message);
  const valid = fragment({
    bindings: [{ path: "/label", spanIds: [span.spanId], rule: "exact" }],
  });
  assert.equal(
    templateCopilotV3ExtractionEnvelopeSchema.safeParse(
      envelope([span], [valid]),
    ).success,
    true,
  );

  for (const invalid of [
    fragment({ ...valid, state: "promoted" }),
    fragment({ ...valid, fragmentKind: "fact" }),
    fragment({ ...valid, factId: "workflow.name" }),
    fragment({ ...valid, missingPaths: [] }),
  ]) {
    assert.equal(templateCopilotV3FragmentSchema.safeParse(invalid).success, false);
  }

  const bogusValue = fragment({
    value: { threshold: 10 },
    bindings: [
      { path: "/threshold", spanIds: [span.spanId], rule: "numeric_lexical" },
    ],
    missingPaths: ["/label", "/type", "/required", "/options"],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(bogusValue).success,
    false,
    "an invented /threshold leaf is not part of request.fields",
  );

  const bogusMissing = fragment({
    bindings: [{ path: "/label", spanIds: [span.spanId], rule: "exact" }],
    missingPaths: ["/type", "/required", "/options", "/threshold"],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(bogusMissing).success,
    false,
    "an invented /threshold missing path is rejected",
  );
});

test("bindings cover every primitive leaf exactly once and rules match leaf types", () => {
  const spanId = "b".repeat(64);
  const valid = fragment({
    value: {
      label: "Amount",
      type: "currency",
      required: true,
      options: [],
    },
    bindings: [
      { path: "/label", spanIds: [spanId], rule: "nfkc_trim_collapse" },
      { path: "/type", spanIds: [spanId], rule: "enum_lexical" },
      { path: "/required", spanIds: [spanId], rule: "boolean_lexical" },
      {
        path: "/options",
        spanIds: [spanId],
        rule: "explicit_empty_collection",
      },
    ],
    missingPaths: ["/label"],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(valid).success,
    false,
    "a present leaf cannot also be declared missing",
  );

  const partial = fragment({
    value: { label: "Amount", required: true },
    bindings: [
      { path: "/label", spanIds: [spanId], rule: "exact" },
      { path: "/required", spanIds: [spanId], rule: "boolean_lexical" },
    ],
    missingPaths: ["/type", "/options"],
  });
  assert.equal(templateCopilotV3FragmentSchema.safeParse(partial).success, true);

  assert.equal(
    templateCopilotV3FragmentSchema.safeParse({
      ...partial,
      bindings: partial.bindings.slice(0, 1),
    }).success,
    false,
    "an unbound primitive leaf is rejected",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse({
      ...partial,
      bindings: [
        partial.bindings[0],
        { ...partial.bindings[1], rule: "exact" },
      ],
    }).success,
    false,
    "text evidence cannot directly justify a boolean leaf",
  );

  const emptyOptions = fragment({
    value: { label: "Choice", options: [] },
    bindings: [
      { path: "/label", spanIds: [spanId], rule: "exact" },
      {
        path: "/options",
        spanIds: [spanId],
        rule: "explicit_empty_collection",
      },
    ],
    missingPaths: ["/type", "/required"],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(emptyOptions).success,
    true,
    "an empty nested collection is an evidence-bearing leaf",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse({
      ...emptyOptions,
      bindings: [
        emptyOptions.bindings[0],
        { ...emptyOptions.bindings[1], rule: "exact" },
      ],
    }).success,
    false,
  );
});

test("required paths need an exact present-or-missing complement", () => {
  const spanId = "c".repeat(64);
  const incompleteComplement = fragment({
    bindings: [{ path: "/label", spanIds: [spanId], rule: "exact" }],
    missingPaths: ["/type", "/required"],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(incompleteComplement).success,
    false,
    "the required /options path was neither present nor missing",
  );

  const stageWithMissingParent = fragment({
    factId: "workflow.stages",
    value: { label: "Manager approval" },
    bindings: [{ path: "/label", spanIds: [spanId], rule: "exact" }],
    missingPaths: ["/kind", "/participant", "/sequence"],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(stageWithMissingParent).success,
    true,
    "a missing structural parent covers its required descendant",
  );

  const stageWithMode = fragment({
    factId: "workflow.stages",
    value: { label: "Manager approval", participant: { mode: "requester" } },
    bindings: [
      { path: "/label", spanIds: [spanId], rule: "exact" },
      {
        path: "/participant/mode",
        spanIds: [spanId],
        rule: "enum_lexical",
      },
    ],
    missingPaths: ["/kind", "/sequence"],
  });
  assert.equal(templateCopilotV3FragmentSchema.safeParse(stageWithMode).success, true);
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse({
      ...stageWithMode,
      missingPaths: ["/kind", "/participant", "/sequence"],
    }).success,
    false,
    "a missing structural parent cannot overlap a bound descendant",
  );

  const notificationPrefixOverlap = fragment({
    factId: "notifications.rules",
    value: { id: "notice-1" },
    bindings: [{ path: "/id", spanIds: [spanId], rule: "exact" }],
    missingPaths: [
      "/event",
      "/recipients",
      "/timing",
      "/timing/mode",
      "/channel",
      "/visibility",
    ],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(notificationPrefixOverlap).success,
    false,
    "missing paths must be prefix-disjoint from one another",
  );

  const nestedEmptyObject = fragment({
    factId: "notifications.rules",
    value: { id: "notice-1", timing: {} },
    bindings: [
      { path: "/id", spanIds: [spanId], rule: "exact" },
      {
        path: "/timing",
        spanIds: [spanId],
        rule: "explicit_empty_collection",
      },
    ],
    missingPaths: [
      "/event",
      "/recipients",
      "/timing/mode",
      "/channel",
      "/visibility",
    ],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(nestedEmptyObject).success,
    false,
    "an empty object is a leaf and cannot conceal a required descendant",
  );
});

test("root-empty items and invalid canonical collection members are rejected", () => {
  const spanId = "1".repeat(64);
  const emptyRoot = fragment({
    value: {},
    bindings: [
      {
        path: "/",
        spanIds: [spanId],
        rule: "explicit_empty_collection",
      },
    ],
    missingPaths: ["/label", "/type", "/required", "/options"],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(emptyRoot).success,
    false,
  );

  const notification = (recipients) =>
    fragment({
      factId: "notifications.rules",
      value: { id: "notice-1", recipients },
      bindings: [
        { path: "/id", spanIds: [spanId], rule: "exact" },
        ...(recipients.length === 0
          ? [
              {
                path: "/recipients",
                spanIds: [spanId],
                rule: "explicit_empty_collection",
              },
            ]
          : recipients.map((_, index) => ({
              path: `/recipients/${index}`,
              spanIds: [spanId],
              rule: "enum_lexical",
            }))),
      ],
      missingPaths: ["/event", "/timing", "/channel", "/visibility"],
    });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(notification([])).success,
    false,
    "notification recipients cannot be an empty collection",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      notification(["requester", "requester"]),
    ).success,
    false,
    "notification recipient groups must be unique",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      notification(["requester", "workflow_owner"]),
    ).success,
    true,
  );
});

test("participant resolver fragments mirror canonical mode and value rules", () => {
  const spanId = "2".repeat(64);
  const stage = (participant, missingPaths = ["/label", "/kind", "/sequence"]) =>
    fragment({
      factId: "workflow.stages",
      value: { participant },
      bindings: [
        {
          path: "/participant/mode",
          spanIds: [spanId],
          rule: "enum_lexical",
        },
        ...(participant.value === undefined
          ? []
          : [
              {
                path: "/participant/value",
                spanIds: [spanId],
                rule: "exact",
              },
            ]),
      ],
      missingPaths,
    });

  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      stage({ mode: "fixed_email", value: "approver@example.com" }),
    ).success,
    true,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      stage({ mode: "fixed_email", value: ".bad@example.com" }),
    ).success,
    false,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      stage({ mode: "directory_position" }),
    ).success,
    false,
    "a resolver that needs a value cannot silently omit it",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      stage(
        { mode: "directory_position" },
        ["/label", "/kind", "/participant/value", "/sequence"],
      ),
    ).success,
    true,
    "an incomplete resolver may explicitly record its missing value",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      stage({ mode: "requester", value: "not allowed" }),
    ).success,
    false,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      stage(
        { mode: "requester" },
        ["/label", "/kind", "/participant/value", "/sequence"],
      ),
    ).success,
    false,
    "a value-forbidden resolver cannot declare that value unresolved",
  );
});

test("attachment partials preserve canonical kind and quantity invariants", () => {
  const spanId = "3".repeat(64);
  const attachment = ({
    value,
    bindings,
    missingPaths,
  }) =>
    fragment({
      factId: "attachments.requirements",
      value,
      bindings,
      missingPaths,
    });
  const requiredExcept = (...present) =>
    [
      "/id",
      "/label",
      "/kind",
      "/required",
      "/formats",
      "/minimumQuantity",
      "/maximumQuantity",
      "/stage",
      "/contributorPolicy",
      "/confirmationPolicy",
    ].filter((path) => !present.includes(path));

  const attachmentKindOnly = attachment({
    value: { kind: "attachment" },
    bindings: [
      { path: "/kind", spanIds: [spanId], rule: "enum_lexical" },
    ],
    missingPaths: [
      ...requiredExcept("/kind"),
      "/maximumFileSizeMb",
    ],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(attachmentKindOnly).success,
    true,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse({
      ...attachmentKindOnly,
      missingPaths: requiredExcept("/kind"),
    }).success,
    false,
    "attachment file size must be present or explicitly missing",
  );

  const emptyAttachmentFormats = attachment({
    value: { kind: "attachment", formats: [] },
    bindings: [
      { path: "/kind", spanIds: [spanId], rule: "enum_lexical" },
      {
        path: "/formats",
        spanIds: [spanId],
        rule: "explicit_empty_collection",
      },
    ],
    missingPaths: [
      ...requiredExcept("/kind", "/formats"),
      "/maximumFileSizeMb",
    ],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(emptyAttachmentFormats).success,
    false,
  );

  const emptyFormFormats = attachment({
    value: { kind: "form", formats: [] },
    bindings: [
      { path: "/kind", spanIds: [spanId], rule: "enum_lexical" },
      {
        path: "/formats",
        spanIds: [spanId],
        rule: "explicit_empty_collection",
      },
    ],
    missingPaths: requiredExcept("/kind", "/formats"),
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(emptyFormFormats).success,
    true,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      attachment({
        value: { kind: "form", formats: ["pdf"] },
        bindings: [
          { path: "/kind", spanIds: [spanId], rule: "enum_lexical" },
          {
            path: "/formats/0",
            spanIds: [spanId],
            rule: "enum_lexical",
          },
        ],
        missingPaths: requiredExcept("/kind", "/formats"),
      }),
    ).success,
    false,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      attachment({
        value: { kind: "form", formats: [], maximumFileSizeMb: 20 },
        bindings: [
          { path: "/kind", spanIds: [spanId], rule: "enum_lexical" },
          {
            path: "/formats",
            spanIds: [spanId],
            rule: "explicit_empty_collection",
          },
          {
            path: "/maximumFileSizeMb",
            spanIds: [spanId],
            rule: "numeric_lexical",
          },
        ],
        missingPaths: requiredExcept("/kind", "/formats"),
      }),
    ).success,
    false,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      attachment({
        value: { required: true, minimumQuantity: 0 },
        bindings: [
          {
            path: "/required",
            spanIds: [spanId],
            rule: "boolean_lexical",
          },
          {
            path: "/minimumQuantity",
            spanIds: [spanId],
            rule: "numeric_lexical",
          },
        ],
        missingPaths: requiredExcept("/required", "/minimumQuantity"),
      }),
    ).success,
    false,
  );
});

test("notification timing and stage dependencies stay explicit in partials", () => {
  const spanId = "4".repeat(64);
  const notification = ({ value, missingPaths }) =>
    fragment({
      factId: "notifications.rules",
      value,
      bindings: [
        ...(value.event === undefined
          ? []
          : [
              {
                path: "/event",
                spanIds: [spanId],
                rule: "enum_lexical",
              },
            ]),
        ...(value.recipients ?? []).map((_, index) => ({
          path: `/recipients/${index}`,
          spanIds: [spanId],
          rule: "enum_lexical",
        })),
        ...(value.timing?.mode === undefined
          ? []
          : [
              {
                path: "/timing/mode",
                spanIds: [spanId],
                rule: "enum_lexical",
              },
            ]),
        ...(value.timing?.offsetHours === undefined
          ? []
          : [
              {
                path: "/timing/offsetHours",
                spanIds: [spanId],
                rule: "numeric_lexical",
              },
            ]),
      ],
      missingPaths,
    });

  const timed = notification({
    value: {
      event: "due_soon",
      recipients: ["requester"],
      timing: { mode: "before_due" },
    },
    missingPaths: [
      "/id",
      "/timing/offsetHours",
      "/channel",
      "/visibility",
      "/stage",
    ],
  });
  assert.equal(templateCopilotV3FragmentSchema.safeParse(timed).success, true);
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse({
      ...timed,
      missingPaths: ["/id", "/channel", "/visibility", "/stage"],
    }).success,
    false,
    "a timed mode cannot silently omit its offset",
  );

  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      notification({
        value: {
          event: "due_soon",
          recipients: ["requester"],
          timing: { mode: "immediate" },
        },
        missingPaths: ["/id", "/channel", "/visibility", "/stage"],
      }),
    ).success,
    false,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      notification({
        value: {
          event: "request_submitted",
          recipients: ["requester"],
          timing: { mode: "immediate" },
        },
        missingPaths: [
          "/id",
          "/timing/offsetHours",
          "/channel",
          "/visibility",
        ],
      }),
    ).success,
    false,
    "an immediate notification cannot declare an impossible unresolved offset",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      notification({
        value: {
          event: "request_submitted",
          recipients: ["requester"],
          timing: { mode: "immediate", offsetHours: 2 },
        },
        missingPaths: ["/id", "/channel", "/visibility"],
      }),
    ).success,
    false,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      notification({
        value: {
          event: "stage_assigned",
          recipients: ["requester"],
          timing: { mode: "immediate" },
        },
        missingPaths: ["/id", "/channel", "/visibility"],
      }),
    ).success,
    false,
    "a stage-dependent event cannot silently omit its stage",
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(
      notification({
        value: {
          event: "request_submitted",
          recipients: ["current_stage_participants"],
          timing: { mode: "immediate" },
        },
        missingPaths: ["/id", "/channel", "/visibility"],
      }),
    ).success,
    false,
    "a stage-dependent recipient cannot silently omit its stage",
  );
});

test("fragment values reject nulls, unsafe Unicode, and non-canonical numbers", () => {
  const spanId = "d".repeat(64);
  for (const value of [
    { label: null },
    { label: "Safe", options: [null] },
    { label: "bad\u0000text" },
    { label: `bad${String.fromCharCode(0xd800)}text` },
    { label: `bad${String.fromCharCode(0xdc00)}text` },
  ]) {
    const unsafeFragment = fragment({
      value,
      bindings: [{ path: "/label", spanIds: [spanId], rule: "exact" }],
      missingPaths: ["/type", "/required", "/options"],
    });
    assert.equal(templateCopilotV3FragmentSchema.safeParse(unsafeFragment).success, false);
  }

  const condition = (value) =>
    fragment({
      factId: "workflow.conditions",
      value: { value },
      bindings: [
        { path: "/value", spanIds: [spanId], rule: "numeric_lexical" },
      ],
      missingPaths: [
        "/id",
        "/sequence",
        "/field",
        "/operator",
        "/matchingRoute",
        "/otherwiseRoute",
      ],
    });
  for (const value of [
    0,
    -0,
    0.000_001,
    -0.000_001,
    0.1,
    Number("999999999999999000000"),
    Number("100000000000000000000"),
  ]) {
    assert.equal(
      templateCopilotV3FragmentSchema.safeParse(condition(value)).success,
      true,
      `${value} remains in the canonical numeric domain`,
    );
  }
  for (const value of [
    0.000_000_1,
    -0.000_000_1,
    1e21,
    -1e21,
    Number("9007199254740993"),
    Number("78123677071134.76"),
    Number("999999999999999900000"),
  ]) {
    assert.equal(
      templateCopilotV3FragmentSchema.safeParse(condition(value)).success,
      false,
      `${value} is outside the shared non-exponent numeric domain`,
    );
  }
});

test("canonical JSON numbers share a 15-significant-digit round-trip domain", () => {
  assert.equal(templateCopilotV3CanonicalJsonNumberText(0), "0");
  assert.equal(templateCopilotV3CanonicalJsonNumberText(-0), "0");
  assert.equal(templateCopilotV3CanonicalJsonNumberText(0.1), "0.1");
  assert.equal(
    templateCopilotV3CanonicalJsonNumberText(
      Number("999999999999999000000"),
    ),
    "999999999999999000000",
  );
  assert.equal(
    templateCopilotV3CanonicalJsonNumberText(
      Number("100000000000000000000"),
    ),
    "100000000000000000000",
  );
  for (const value of [
    Number("9007199254740993"),
    Number("78123677071134.76"),
    Number("999999999999999900000"),
    0.000_000_1,
    1e21,
  ]) {
    assert.equal(templateCopilotV3CanonicalJsonNumberText(value), null);
  }
});

test("source strings use PostgreSQL-safe Unicode and the explicit whitespace set", () => {
  assert.equal(templateCopilotV3StringIsPostgresSafe("合同😀e\u0301"), true);
  assert.equal(templateCopilotV3StringIsPostgresSafe("bad\u0000text"), false);
  assert.equal(
    templateCopilotV3StringIsPostgresSafe(String.fromCharCode(0xd800)),
    false,
  );
  assert.equal(
    templateCopilotV3StringIsPostgresSafe(String.fromCharCode(0xdc00)),
    false,
  );
  assert.equal(templateCopilotV3ContainsNonWhitespace("\u00a0\u3000\t"), false);
  assert.equal(
    templateCopilotV3ContainsNonWhitespace("\u00a0\u200b"),
    true,
    "zero-width space is intentionally not in Unicode White_Space",
  );

  const validText = "  合同😀e\u0301  ";
  const valid = sourceSpan("message:unicode-safe", validText, validText);
  assert.equal(templateCopilotV3SourceSpanSchema.safeParse(valid).success, true);
  assert.equal(
    validateTemplateCopilotV3SourceSpan(valid, {
      "message:unicode-safe": validText,
    }),
    true,
  );

  for (const exactText of [
    "\u00a0\u3000\t",
    "bad\u0000text",
    String.fromCharCode(0xd800),
    String.fromCharCode(0xdc00),
  ]) {
    const unsafe = {
      messageId: "message:unicode-unsafe",
      startCodePoint: 0,
      endCodePoint: Array.from(exactText).length,
      exactText,
    };
    assert.equal(
      templateCopilotV3SourceSpanSchema.safeParse({
        spanId: templateCopilotV3SourceSpanId(unsafe),
        ...unsafe,
      }).success,
      false,
    );
  }
});

test("fragment leaves reject ECMAScript outer whitespace without altering source text", () => {
  const spanId = "5".repeat(64);
  assert.equal(templateCopilotV3StringHasOuterTrimWhitespace(" Manager"), true);
  assert.equal(
    templateCopilotV3StringHasOuterTrimWhitespace("\ufeffManager"),
    true,
  );
  assert.equal(
    templateCopilotV3StringHasOuterTrimWhitespace("\u0085Manager\u0085"),
    false,
    "U+0085 is Unicode White_Space but not ECMAScript trim whitespace",
  );
  assert.equal(
    templateCopilotV3NormalizeLexicalText(" \uff21\u3000B "),
    "a b",
  );

  for (const label of [" Manager", "Manager ", "\ufeffManager"]) {
    const item = fragment({
      value: { label },
      bindings: [{ path: "/label", spanIds: [spanId], rule: "exact" }],
    });
    assert.equal(templateCopilotV3FragmentSchema.safeParse(item).success, false);
  }
  const nelPreserved = fragment({
    value: { label: "\u0085Manager\u0085" },
    bindings: [{ path: "/label", spanIds: [spanId], rule: "exact" }],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(nelPreserved).success,
    true,
  );

  const sourceWithOuterWhitespace = " Manager ";
  const span = sourceSpan(
    "message:source-whitespace",
    sourceWithOuterWhitespace,
    sourceWithOuterWhitespace,
  );
  assert.equal(templateCopilotV3SourceSpanSchema.safeParse(span).success, true);
  assert.equal(span.exactText, sourceWithOuterWhitespace);
});

test("every direct evidence rule has deterministic en, zh-Hant, and zh-Hans semantics", () => {
  const derives = (factId, path, rule, value, sourceText) =>
    templateCopilotV3DirectEvidenceDerivesLeaf({
      factId,
      path,
      rule,
      value,
      sourceText,
    });

  for (const text of ["Manager", "經理", "经理"]) {
    assert.equal(
      derives("request.fields", "/label", "exact", { label: text }, text),
      true,
    );
  }
  for (const [sourceText, label] of [
    [" Manager\u3000Approval ", "Manager Approval"],
    [" 經理\u3000審批 ", "經理 審批"],
    [" 经理\u3000审批 ", "经理 审批"],
  ]) {
    assert.equal(
      derives(
        "request.fields",
        "/label",
        "nfkc_trim_collapse",
        { label },
        sourceText,
      ),
      true,
    );
  }
  assert.equal(
    derives(
      "request.fields",
      "/label",
      "nfkc_trim_collapse",
      { label: "manager" },
      "MANAGER",
    ),
    false,
    "NFKC trim/collapse preserves case",
  );
  assert.equal(
    derives(
      "request.fields",
      "/label",
      "nfkc_trim_collapse",
      { label: "\uff2danager" },
      "\uff2danager",
    ),
    false,
    "a non-normalized leaf cannot normalize itself into validity",
  );

  for (const alias of ["approval", "審批", "审批"]) {
    assert.equal(
      derives(
        "workflow.stages",
        "/kind",
        "enum_lexical",
        { kind: "approval" },
        alias,
      ),
      true,
    );
  }
  for (const alias of ["required", "必須", "必须"]) {
    assert.equal(
      derives(
        "request.fields",
        "/required",
        "boolean_lexical",
        { required: true },
        alias,
      ),
      true,
    );
  }
  for (const alias of ["first", "第一個", "第一个"]) {
    assert.equal(
      derives(
        "workflow.stages",
        "/sequence",
        "numeric_lexical",
        { sequence: 1 },
        alias,
      ),
      true,
    );
  }
  for (const alias of ["no options", "沒有選項", "没有选项"]) {
    assert.equal(
      derives(
        "request.fields",
        "/options",
        "explicit_empty_collection",
        { options: [] },
        alias,
      ),
      true,
    );
  }

  assert.equal(
    derives(
      "workflow.conditions",
      "/matchingRoute",
      "enum_lexical",
      { matchingRoute: "stage:Finance Review" },
      "Finance Review",
    ),
    true,
  );
  assert.equal(
    derives(
      "workflow.conditions",
      "/otherwiseRoute",
      "enum_lexical",
      { otherwiseRoute: "condition:budget-check" },
      "condition:budget-check",
    ),
    true,
  );
  assert.equal(
    derives(
      "request.fields",
      "/options",
      "explicit_empty_collection",
      { options: [] },
      "form",
    ),
    false,
    "a form mention is not evidence for an empty collection",
  );

  assert.equal(templateCopilotV3CanonicalDecimalText("+1,000.00"), "1000");
  assert.equal(templateCopilotV3CanonicalDecimalText("-0.000"), "0");
  assert.equal(templateCopilotV3CanonicalDecimalText("10,00"), null);
  assert.equal(
    templateCopilotV3CanonicalDecimalText(
      "+999,999,999,999,999,000,000.00",
    ),
    "999999999999999000000",
  );
  assert.equal(
    templateCopilotV3CanonicalDecimalText("100000000000000000000"),
    "100000000000000000000",
  );
  assert.equal(templateCopilotV3CanonicalDecimalText("9007199254740993"), null);
  assert.equal(templateCopilotV3CanonicalDecimalText("78123677071134.76"), null);
  assert.equal(templateCopilotV3CanonicalDecimalText("0.10000000000000001"), null);
  assert.equal(templateCopilotV3CanonicalDecimalText("0.10000000000000000"), "0.1");
  assert.equal(
    derives(
      "workflow.conditions",
      "/value",
      "numeric_lexical",
      { value: 1000 },
      "+1,000.00",
    ),
    true,
  );
  assert.equal(
    derives(
      "workflow.conditions",
      "/value",
      "numeric_lexical",
      { value: Number("999999999999999000000") },
      "+999,999,999,999,999,000,000.00",
    ),
    true,
  );
  assert.equal(
    derives(
      "workflow.conditions",
      "/value",
      "numeric_lexical",
      { value: 0.1 },
      "0.1",
    ),
    true,
  );
  assert.equal(
    derives(
      "workflow.conditions",
      "/value",
      "numeric_lexical",
      { value: 0.1 },
      "0.10000000000000001",
    ),
    false,
    "precision-loss source wording cannot evidence the rounded fragment value",
  );
  assert.equal(
    derives(
      "workflow.conditions",
      "/value",
      "numeric_lexical",
      { value: Number("999999999999999900000") },
      "999999999999999900000",
    ),
    false,
    "a 16-significant-digit leaf is outside the shared domain",
  );
  assert.equal(
    derives(
      "workflow.conditions",
      "/value",
      "numeric_lexical",
      { value: 9_007_199_254_740_993 },
      "9007199254740993",
    ),
    false,
    "unsafe integer text cannot round into a different JavaScript number",
  );
});

test("fragment identity binds confidence and closed ambiguity-note metadata", () => {
  const base = fragment();
  const medium = fragment({ confidence: "medium" });
  const possible = fragment({
    ambiguity: "possible",
    ambiguityNote: "The source may describe a synonym.",
  });
  const ambiguous = fragment({
    ambiguity: "ambiguous",
    ambiguityNote: "來源可指兩個欄位。",
  });

  for (const item of [base, medium, possible, ambiguous]) {
    assert.equal(templateCopilotV3FragmentSchema.safeParse(item).success, true);
  }
  assert.notEqual(base.fragmentId, medium.fragmentId);
  assert.notEqual(base.fragmentId, possible.fragmentId);
  assert.notEqual(possible.fragmentId, ambiguous.fragmentId);
  assert.notEqual(
    possible.fragmentId,
    fragment({
      ambiguity: "possible",
      ambiguityNote: "The source may describe two synonyms.",
    }).fragmentId,
  );

  for (const invalid of [
    fragment({ ambiguity: "none", ambiguityNote: "No ambiguity." }),
    fragment({ ambiguity: "possible" }),
    fragment({ ambiguity: "ambiguous", ambiguityNote: "   " }),
    fragment({ ambiguity: "possible", ambiguityNote: " leading" }),
    fragment({ ambiguity: "possible", ambiguityNote: "trailing\u3000" }),
    fragment({ ambiguity: "possible", ambiguityNote: "\u0000unsafe" }),
    fragment({ ambiguity: "possible", ambiguityNote: "😀".repeat(501) }),
  ]) {
    assert.equal(
      templateCopilotV3FragmentSchema.safeParse(invalid).success,
      false,
    );
  }
});

test("dynamic stage references are canonical across every stage-bearing fact", () => {
  const spanId = "9".repeat(64);
  const stageFragments = (stage) => [
    fragment({
      factId: "attachments.requirements",
      value: { stage },
      bindings: [
        { path: "/stage", spanIds: [spanId], rule: "enum_lexical" },
      ],
      missingPaths: [
        "/id",
        "/label",
        "/kind",
        "/required",
        "/formats",
        "/minimumQuantity",
        "/maximumQuantity",
        "/contributorPolicy",
        "/confirmationPolicy",
      ],
    }),
    fragment({
      factId: "workflow.conditions",
      value: { matchingRoute: stage },
      bindings: [
        {
          path: "/matchingRoute",
          spanIds: [spanId],
          rule: "enum_lexical",
        },
      ],
      missingPaths: [
        "/id",
        "/sequence",
        "/field",
        "/operator",
        "/value",
        "/otherwiseRoute",
      ],
    }),
    fragment({
      factId: "notifications.rules",
      value: { stage },
      bindings: [
        { path: "/stage", spanIds: [spanId], rule: "enum_lexical" },
      ],
      missingPaths: [
        "/id",
        "/event",
        "/recipients",
        "/timing/mode",
        "/channel",
        "/visibility",
      ],
    }),
  ];

  for (const canonical of [
    "stage:Finance Review",
    "stage:財務審批",
    `stage:${"F".repeat(200)}`,
  ]) {
    for (const item of stageFragments(canonical)) {
      assert.equal(
        templateCopilotV3FragmentSchema.safeParse(item).success,
        true,
        canonical,
      );
    }
  }

  for (const noncanonical of [
    "Stage:Finance",
    "stage:",
    "stage:  Finance",
    "stage:Finance  Review",
    "stage:Finance\u3000",
    "stage:Ｆｉｎａｎｃｅ",
    "stage:\u0085",
    "stage:unsafe\u0000",
    `stage:${"F".repeat(201)}`,
  ]) {
    for (const item of stageFragments(noncanonical)) {
      assert.equal(
        templateCopilotV3FragmentSchema.safeParse(item).success,
        false,
        noncanonical,
      );
    }
  }

  const derives = (leaf, sourceText) =>
    templateCopilotV3DirectEvidenceDerivesLeaf({
      factId: "workflow.conditions",
      path: "/matchingRoute",
      rule: "enum_lexical",
      value: { matchingRoute: leaf },
      sourceText,
    });
  assert.equal(derives("stage:Finance Review", "stage:Finance Review"), true);
  assert.equal(derives("stage:Finance Review", "Finance Review"), true);
  assert.equal(derives("stage:財務審批", "財務審批"), true);
  assert.equal(derives("stage:  Finance", "Finance"), false);
  assert.equal(derives("stage:Ｆｉｎａｎｃｅ", "Finance"), false);
  assert.equal(derives("condition:budget-check", "budget-check"), true);
  assert.equal(derives("condition:Budget-Check", "Budget-Check"), false);
});

test("enum aliases are exact fact-and-path scopes with isolated email wording", () => {
  const derives = (factId, path, value, sourceText) =>
    templateCopilotV3DirectEvidenceDerivesLeaf({
      factId,
      path,
      rule: "enum_lexical",
      value,
      sourceText,
    });

  assert.equal(
    derives("request.fields", "/type", { type: "email" }, "email field"),
    true,
  );
  assert.equal(
    derives(
      "notifications.rules",
      "/channel",
      { channel: "email" },
      "email field",
    ),
    false,
  );
  assert.equal(
    derives(
      "notifications.rules",
      "/channel",
      { channel: "email" },
      "by email",
    ),
    true,
  );
  assert.equal(
    derives("request.fields", "/type", { type: "email" }, "by email"),
    false,
  );
  assert.equal(
    derives("request.fields", "/type", { type: "email" }, "電郵欄位"),
    true,
  );
  assert.equal(
    derives(
      "notifications.rules",
      "/channel",
      { channel: "email" },
      "以電郵發送",
    ),
    true,
  );
  assert.equal(
    derives("request.fields", "/type", { type: "email" }, "email"),
    true,
    "the canonical token remains valid in its own scope",
  );
  assert.equal(
    derives(
      "notifications.rules",
      "/channel",
      { channel: "email" },
      "email",
    ),
    true,
    "a shared canonical token is valid without sharing path-specific aliases",
  );
  assert.equal(
    derives(
      "attachments.requirements",
      "/kind",
      { kind: "attachment" },
      "approve",
    ),
    false,
    "an alias from another fact cannot leak through a global fallback",
  );
  assert.equal(
    derives(
      "request.fields",
      "/type",
      { type: "approval" },
      "approval",
    ),
    false,
    "an out-of-domain canonical leaf is rejected before alias lookup",
  );
});

test("exported lexical contracts are recursively runtime immutable", () => {
  const visited = new Set();
  const assertDeepFrozen = (value, path = "aliases") => {
    if (value === null || typeof value !== "object" || visited.has(value)) {
      return;
    }
    visited.add(value);
    assert.equal(Object.isFrozen(value), true, path);
    for (const [key, child] of Object.entries(value)) {
      assertDeepFrozen(child, `${path}.${key}`);
    }
  };

  assertDeepFrozen(templateCopilotV3LexicalAliases);
  assert.equal(Object.isFrozen(templateCopilotV3FragmentFactIds), true);
  assert.equal(Object.isFrozen(templateCopilotV3DirectEvidenceRules), true);

  const fieldTypeAliases =
    templateCopilotV3LexicalAliases.enumByScope["request.fields:/type"];
  const emailAliases = fieldTypeAliases.email;
  const originalEmailAliases = [...emailAliases];
  const originalFactIds = [...templateCopilotV3FragmentFactIds];
  const originalRules = [...templateCopilotV3DirectEvidenceRules];
  const derivesEmail = (sourceText) =>
    templateCopilotV3DirectEvidenceDerivesLeaf({
      factId: "request.fields",
      path: "/type",
      rule: "enum_lexical",
      value: { type: "email" },
      sourceText,
    });

  assert.equal(derivesEmail("email field"), true);
  assert.equal(derivesEmail("mutable alias"), false);
  assert.throws(() => {
    emailAliases.push("mutable alias");
  }, TypeError);
  assert.throws(() => {
    emailAliases[0] = "tampered";
  }, TypeError);
  assert.equal(
    Reflect.set(fieldTypeAliases, "email", ["mutable alias"]),
    false,
  );
  assert.equal(
    Reflect.set(templateCopilotV3LexicalAliases, "mutable", true),
    false,
  );
  assert.deepEqual(emailAliases, originalEmailAliases);
  assert.equal(derivesEmail("email field"), true);
  assert.equal(derivesEmail("mutable alias"), false);

  assert.throws(() => {
    templateCopilotV3FragmentFactIds.push("workflow.mutable");
  }, TypeError);
  assert.equal(
    Reflect.set(
      templateCopilotV3FragmentFactIds,
      0,
      "workflow.mutable",
    ),
    false,
  );
  assert.deepEqual(templateCopilotV3FragmentFactIds, originalFactIds);

  assert.throws(() => {
    templateCopilotV3DirectEvidenceRules.push("mutable_rule");
  }, TypeError);
  assert.equal(
    Reflect.set(
      templateCopilotV3DirectEvidenceRules,
      0,
      "mutable_rule",
    ),
    false,
  );
  assert.deepEqual(templateCopilotV3DirectEvidenceRules, originalRules);
});

test("ordinal wording covers stages 1-100 and conditions 1-50 in all locales", () => {
  const smallEnglish = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
    "eleventh",
    "twelfth",
    "thirteenth",
    "fourteenth",
    "fifteenth",
    "sixteenth",
    "seventeenth",
    "eighteenth",
    "nineteenth",
  ];
  const tens = {
    2: ["twenty", "twentieth"],
    3: ["thirty", "thirtieth"],
    4: ["forty", "fortieth"],
    5: ["fifty", "fiftieth"],
    6: ["sixty", "sixtieth"],
    7: ["seventy", "seventieth"],
    8: ["eighty", "eightieth"],
    9: ["ninety", "ninetieth"],
  };
  const digits = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const english = (sequence) => {
    if (sequence <= 19) return smallEnglish[sequence - 1];
    if (sequence === 100) return "one hundredth";
    const [cardinal, ordinal] = tens[Math.floor(sequence / 10)];
    const units = sequence % 10;
    return units === 0 ? ordinal : `${cardinal}-${smallEnglish[units - 1]}`;
  };
  const chinese = (sequence) => {
    if (sequence < 10) return digits[sequence - 1];
    if (sequence === 10) return "十";
    if (sequence < 20) return `十${digits[(sequence % 10) - 1]}`;
    if (sequence < 100) {
      const units = sequence % 10;
      return `${digits[Math.floor(sequence / 10) - 1]}十${
        units === 0 ? "" : digits[units - 1]
      }`;
    }
    return "一百";
  };
  const derives = (factId, sequence, sourceText) =>
    templateCopilotV3DirectEvidenceDerivesLeaf({
      factId,
      path: "/sequence",
      rule: "numeric_lexical",
      value: { sequence },
      sourceText,
    });

  for (let sequence = 1; sequence <= 100; sequence += 1) {
    assert.equal(
      derives("workflow.stages", sequence, english(sequence)),
      true,
      `stage en ${sequence}`,
    );
    assert.equal(
      derives("workflow.stages", sequence, `第${chinese(sequence)}個`),
      true,
      `stage zh-Hant ${sequence}`,
    );
    assert.equal(
      derives("workflow.stages", sequence, `第${chinese(sequence)}个`),
      true,
      `stage zh-Hans ${sequence}`,
    );
    if (sequence <= 50) {
      assert.equal(
        derives("workflow.conditions", sequence, english(sequence)),
        true,
        `condition en ${sequence}`,
      );
      assert.equal(
        derives("workflow.conditions", sequence, `第${chinese(sequence)}個`),
        true,
        `condition zh-Hant ${sequence}`,
      );
      assert.equal(
        derives("workflow.conditions", sequence, `第${chinese(sequence)}个`),
        true,
        `condition zh-Hans ${sequence}`,
      );
    }
  }

  assert.equal(derives("workflow.stages", 21, "twenty first"), true);
  assert.equal(derives("workflow.stages", 21, "21st"), true);
  assert.equal(derives("workflow.stages", 11, "11st"), false);
  assert.equal(derives("workflow.stages", 12, "12nd"), false);
  assert.equal(derives("workflow.stages", 13, "13rd"), false);
  assert.equal(derives("workflow.stages", 21, "21th"), false);
  assert.equal(derives("workflow.stages", 21, "twenty-oneth"), false);
  assert.equal(derives("workflow.conditions", 51, "fifty-first"), false);
  assert.equal(derives("workflow.stages", 101, "101st"), false);

  const stageOutOfRange = fragment({
    factId: "workflow.stages",
    value: { sequence: 101 },
    bindings: [
      { path: "/sequence", spanIds: ["8".repeat(64)], rule: "numeric_lexical" },
    ],
    missingPaths: ["/label", "/kind", "/participant"],
  });
  const conditionOutOfRange = fragment({
    factId: "workflow.conditions",
    value: { sequence: 51 },
    bindings: [
      { path: "/sequence", spanIds: ["8".repeat(64)], rule: "numeric_lexical" },
    ],
    missingPaths: [
      "/id",
      "/field",
      "/operator",
      "/value",
      "/matchingRoute",
      "/otherwiseRoute",
    ],
  });
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(stageOutOfRange).success,
    false,
  );
  assert.equal(
    templateCopilotV3FragmentSchema.safeParse(conditionOutOfRange).success,
    false,
  );
});

test("envelopes reject banana-to-Manager and require every corroborating span", () => {
  const banana = sourceSpan("message:banana-exact", "banana", "banana");
  const falseExact = fragment({
    value: { label: "Manager" },
    bindings: [
      { path: "/label", spanIds: [banana.spanId], rule: "exact" },
    ],
  });
  assert.equal(
    templateCopilotV3ExtractionEnvelopeSchema.safeParse(
      envelope([banana], [falseExact]),
    ).success,
    false,
  );

  const mixedMessage = "Manager banana";
  const manager = sourceSpan(
    "message:every-span",
    mixedMessage,
    "Manager",
  );
  const irrelevant = sourceSpan(
    "message:every-span",
    mixedMessage,
    "banana",
  );
  const mixed = fragment({
    value: { label: "Manager" },
    bindings: [
      {
        path: "/label",
        spanIds: [manager.spanId, irrelevant.spanId],
        rule: "exact",
      },
    ],
  });
  assert.equal(
    templateCopilotV3ExtractionEnvelopeSchema.safeParse(
      envelope([manager, irrelevant], [mixed]),
    ).success,
    false,
    "one valid span cannot launder an irrelevant corroborating span",
  );

  const repeatedMessage = "Manager and Manager";
  const first = sourceSpan(
    "message:every-span-valid",
    repeatedMessage,
    "Manager",
    0,
  );
  const second = sourceSpan(
    "message:every-span-valid",
    repeatedMessage,
    "Manager",
    1,
  );
  const corroborated = fragment({
    value: { label: "Manager" },
    bindings: [
      {
        path: "/label",
        spanIds: [first.spanId, second.spanId],
        rule: "exact",
      },
    ],
  });
  assert.equal(
    templateCopilotV3ExtractionEnvelopeSchema.safeParse(
      envelope([first, second], [corroborated]),
    ).success,
    true,
  );
});

test("source authority checks parsed spans against bounded real transcripts", () => {
  const forgedInput = {
    messageId: "message:forged-source",
    startCodePoint: 0,
    endCodePoint: 6,
    exactText: "banana",
  };
  const forged = {
    spanId: templateCopilotV3SourceSpanId(forgedInput),
    ...forgedInput,
  };
  const forgedFragment = fragment({
    value: { label: "banana" },
    bindings: [
      { path: "/label", spanIds: [forged.spanId], rule: "exact" },
    ],
  });
  const parsed = templateCopilotV3ExtractionEnvelopeSchema.parse(
    envelope([forged], [forgedFragment]),
  );
  assert.equal(
    validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(parsed, {
      "message:forged-source": "Manager",
    }),
    false,
  );
  assert.equal(
    validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(parsed, {
      "message:forged-source": "banana",
    }),
    true,
  );
  assert.equal(
    validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(parsed, {
      "message:forged-source": `banana${"x".repeat(80_000)}`,
    }),
    false,
    "the real source message cannot exceed the shared 80,000-code-point bound",
  );
});

test("nested source spans pass while crossing overlaps fail", () => {
  const message = "excel/csv/excel";
  const outer = sourceSpan("message:span-nesting", message, "excel/csv");
  const inner = sourceSpan("message:span-nesting", message, "csv");
  const missingAttachmentPaths = [
    "/id",
    "/label",
    "/kind",
    "/required",
    "/minimumQuantity",
    "/maximumQuantity",
    "/stage",
    "/contributorPolicy",
    "/confirmationPolicy",
  ];
  const nestedFragment = fragment({
    factId: "attachments.requirements",
    value: { formats: ["excel_csv"] },
    bindings: [
      {
        path: "/formats/0",
        spanIds: [outer.spanId, inner.spanId],
        rule: "enum_lexical",
      },
    ],
    missingPaths: missingAttachmentPaths,
  });
  assert.equal(
    templateCopilotV3ExtractionEnvelopeSchema.safeParse(
      envelope([outer, inner], [nestedFragment]),
    ).success,
    true,
  );

  const crossing = sourceSpan("message:span-nesting", message, "csv/excel");
  const crossingFragment = fragment({
    factId: "attachments.requirements",
    value: { formats: ["excel_csv"] },
    bindings: [
      {
        path: "/formats/0",
        spanIds: [outer.spanId, crossing.spanId],
        rule: "enum_lexical",
      },
    ],
    missingPaths: missingAttachmentPaths,
  });
  assert.equal(
    templateCopilotV3ExtractionEnvelopeSchema.safeParse(
      envelope([outer, crossing], [crossingFragment]),
    ).success,
    false,
  );
});

test("persistence append separates new spans from reusable stored span IDs", () => {
  const knownSpanId = "e".repeat(64);
  const storedFragment = fragment({
    bindings: [
      { path: "/label", spanIds: [knownSpanId], rule: "exact" },
    ],
  });
  const append = {
    contractVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    newSourceSpans: [],
    knownSpanIds: [knownSpanId],
    fragments: [storedFragment],
    evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
      [],
      [knownSpanId],
      [storedFragment],
    ),
  };
  assert.equal(templateCopilotV3EvidenceAppendSchema.safeParse(append).success, true);

  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse({
      ...append,
      knownSpanIds: [],
      evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
        [],
        [],
        [storedFragment],
      ),
    }).success,
    false,
    "a binding cannot reference outside the new-plus-known union",
  );
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse({
      ...append,
      knownSpanIds: [knownSpanId, "f".repeat(64)],
      evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
        [],
        [knownSpanId, "f".repeat(64)],
        [storedFragment],
      ),
    }).success,
    false,
    "every supplied known span ID must be used",
  );

  const message = "Amount";
  const newSpan = sourceSpan("message:new-append", message, message);
  const newFragment = fragment({
    bindings: [
      { path: "/label", spanIds: [newSpan.spanId], rule: "exact" },
    ],
  });
  const newAppend = {
    ...append,
    newSourceSpans: [newSpan],
    knownSpanIds: [],
    fragments: [newFragment],
    evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
      [newSpan],
      [],
      [newFragment],
    ),
  };
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse(newAppend).success,
    true,
  );
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse({
      ...newAppend,
      knownSpanIds: [newSpan.spanId],
      evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
        [newSpan],
        [newSpan.spanId],
        [newFragment],
      ),
    }).success,
    false,
    "new and known source span sets are disjoint",
  );

  assert.equal(
    templateCopilotV3ExtractionEnvelopeSchema.safeParse({
      ...envelope([newSpan], [newFragment]),
      knownSpanIds: [],
    }).success,
    false,
    "the extraction envelope does not expose persistence-only fields",
  );
});

test("append count caps match the 500-span and 200-fragment command limits", () => {
  assert.equal(templateCopilotV3AppendMaximumNewSourceSpans, 500);
  assert.equal(templateCopilotV3AppendMaximumFragments, 200);

  const appendForNewSpanCount = (count) => {
    const spans = Array.from({ length: count }, (_, index) =>
      sourceSpan(
        `message:cap-${String(index).padStart(4, "0")}`,
        "Amount",
        "Amount",
      ),
    );
    const fragments = [];
    for (let index = 0; index < spans.length; index += 16) {
      fragments.push(
        fragment({
          bindings: [
            {
              path: "/label",
              spanIds: spans
                .slice(index, index + 16)
                .map((span) => span.spanId),
              rule: "exact",
            },
          ],
        }),
      );
    }
    return {
      contractVersion: templateCopilotV3EvidenceContractVersion,
      compilerVersion: templateCopilotV3EvidenceCompilerVersion,
      newSourceSpans: spans,
      knownSpanIds: [],
      fragments,
      evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
        spans,
        [],
        fragments,
      ),
    };
  };
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse(
      appendForNewSpanCount(500),
    ).success,
    true,
  );
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse(
      appendForNewSpanCount(501),
    ).success,
    false,
  );

  const knownSpanId = "6".repeat(64);
  const appendForFragmentCount = (count) => {
    const fragments = Array.from({ length: count }, (_, index) =>
      fragment({
        value: { label: `Field ${index}` },
        bindings: [
          { path: "/label", spanIds: [knownSpanId], rule: "exact" },
        ],
      }),
    );
    return {
      contractVersion: templateCopilotV3EvidenceContractVersion,
      compilerVersion: templateCopilotV3EvidenceCompilerVersion,
      newSourceSpans: [],
      knownSpanIds: [knownSpanId],
      fragments,
      evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
        [],
        [knownSpanId],
        fragments,
      ),
    };
  };
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse(
      appendForFragmentCount(200),
    ).success,
    true,
  );
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse(
      appendForFragmentCount(201),
    ).success,
    false,
  );
});

test("append rejects hostile deep fragment values without recursive sizing overflow", () => {
  let hostileValue = "leaf";
  for (let depth = 0; depth < 5_000; depth += 1) {
    hostileValue = { x: hostileValue };
  }
  const knownSpanId = "3".repeat(64);
  const rawFragment = {
    evidenceVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    fragmentId: "4".repeat(64),
    factId: "request.fields",
    fragmentKind: "array_item",
    state: "open",
    value: hostileValue,
    bindings: [
      {
        path: "/label",
        spanIds: [knownSpanId],
        rule: "exact",
      },
    ],
    missingPaths: ["/type", "/required", "/options"],
    confidence: "low",
    ambiguity: "none",
  };
  const rawAppend = {
    contractVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    newSourceSpans: [],
    knownSpanIds: [knownSpanId],
    fragments: [rawFragment],
    evidenceDeltaHash: "5".repeat(64),
  };

  let result;
  assert.doesNotThrow(() => {
    result = templateCopilotV3EvidenceAppendSchema.safeParse(rawAppend);
  });
  assert.equal(result.success, false);

  let exactBytes;
  assert.doesNotThrow(() => {
    exactBytes = templateCopilotV3EvidenceAppendPayloadUtf8Bytes({
      newSourceSpans: [],
      knownSpanIds: [knownSpanId],
      fragments: [rawFragment],
    });
  });
  assert.equal(Number.isSafeInteger(exactBytes), true);
  assert.equal(exactBytes > 0, true);
});

test("append payload uses the exact three-array stable-JSON 3 MiB material", () => {
  assert.equal(templateCopilotV3AppendMaximumPayloadUtf8Bytes, 3 * 1024 * 1024);
  assert.equal(
    templateCopilotV3EvidenceAppendPayloadUtf8Bytes({
      newSourceSpans: [],
      knownSpanIds: [],
      fragments: [],
    }),
    6,
    "three canonical empty JSON arrays contribute two UTF-8 bytes each",
  );

  const largeText = "x".repeat(8_000);
  const appendForGroups = (groupCount) => {
    const spans = Array.from({ length: groupCount * 16 }, (_, index) =>
      sourceSpan(
        `message:payload-${String(index).padStart(4, "0")}`,
        largeText,
        largeText,
      ),
    );
    const fragments = Array.from({ length: groupCount }, (_, index) =>
      fragment({
        factId: "workflow.conditions",
        value: { value: largeText },
        bindings: [
          {
            path: "/value",
            spanIds: spans
              .slice(index * 16, index * 16 + 16)
              .map((span) => span.spanId),
            rule: "exact",
          },
        ],
        missingPaths: [
          "/id",
          "/sequence",
          "/field",
          "/operator",
          "/matchingRoute",
          "/otherwiseRoute",
        ],
      }),
    );
    return {
      contractVersion: templateCopilotV3EvidenceContractVersion,
      compilerVersion: templateCopilotV3EvidenceCompilerVersion,
      newSourceSpans: spans,
      knownSpanIds: [],
      fragments,
      evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
        spans,
        [],
        fragments,
      ),
    };
  };
  const under = appendForGroups(20);
  const over = appendForGroups(25);
  assert.equal(
    templateCopilotV3EvidenceAppendPayloadUtf8Bytes(under) <=
      templateCopilotV3AppendMaximumPayloadUtf8Bytes,
    true,
  );
  assert.equal(templateCopilotV3EvidenceAppendSchema.safeParse(under).success, true);
  assert.equal(
    templateCopilotV3EvidenceAppendPayloadUtf8Bytes(over) >
      templateCopilotV3AppendMaximumPayloadUtf8Bytes,
    true,
  );
  assert.equal(templateCopilotV3EvidenceAppendSchema.safeParse(over).success, false);
});

test("append validates every new span but delegates known-span text to DB authority", () => {
  const banana = sourceSpan("message:append-banana", "banana", "banana");
  const falseExact = fragment({
    value: { label: "Manager" },
    bindings: [
      { path: "/label", spanIds: [banana.spanId], rule: "exact" },
    ],
  });
  const falseNewAppend = {
    contractVersion: templateCopilotV3EvidenceContractVersion,
    compilerVersion: templateCopilotV3EvidenceCompilerVersion,
    newSourceSpans: [banana],
    knownSpanIds: [],
    fragments: [falseExact],
    evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
      [banana],
      [],
      [falseExact],
    ),
  };
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse(falseNewAppend).success,
    false,
  );

  const knownOnly = {
    ...falseNewAppend,
    newSourceSpans: [],
    knownSpanIds: [banana.spanId],
    evidenceDeltaHash: templateCopilotV3EvidenceDeltaHash(
      [],
      [banana.spanId],
      [falseExact],
    ),
  };
  assert.equal(
    templateCopilotV3EvidenceAppendSchema.safeParse(knownOnly).success,
    true,
    "the app cannot inspect stored exactText; the DB must evaluate known spans",
  );
});

test("request submission cannot require confirmation from a nonexistent stage owner", () => {
  const spanId = "7".repeat(64);
  const invalid = fragment({
    factId: "attachments.requirements",
    value: {
      stage: "request_submission",
      confirmationPolicy: "stage_owner_confirms",
    },
    bindings: [
      { path: "/stage", spanIds: [spanId], rule: "enum_lexical" },
      {
        path: "/confirmationPolicy",
        spanIds: [spanId],
        rule: "enum_lexical",
      },
    ],
    missingPaths: [
      "/id",
      "/label",
      "/kind",
      "/required",
      "/formats",
      "/minimumQuantity",
      "/maximumQuantity",
      "/contributorPolicy",
    ],
  });
  assert.equal(templateCopilotV3FragmentSchema.safeParse(invalid).success, false);
});

test("fixed hash vectors pin UTF-8 prefixes, durable fragments, and tagged sets", () => {
  const exactText = "  合同😀e\u0301  ";
  const vectorSpan = {
    messageId: "message:unicode-vector",
    startCodePoint: 7,
    endCodePoint: 16,
    exactText,
  };
  const spanId =
    "97f09b9337a0546fa1becabbcb91510435bc26c46474eedc53332b9599f8d416";
  assert.equal(Array.from(exactText).length, 9);
  assert.equal(templateCopilotV3SourceSpanId(vectorSpan), spanId);

  const vectorFragment = fragment({
    value: { label: "Amount", required: true },
    bindings: [
      { path: "/required", spanIds: ["b".repeat(64)], rule: "boolean_lexical" },
      { path: "/label", spanIds: ["a".repeat(64)], rule: "exact" },
    ],
    missingPaths: ["/options", "/type"],
  });
  assert.equal(
    vectorFragment.fragmentId,
    "6eea54d855e646a2742a72301bfbad34c944e74f56f9892aecdde914727f5774",
  );

  assert.equal(
    templateCopilotV3EvidenceDeltaHash(
      [{ spanId }, { spanId: "0".repeat(64) }],
      ["e".repeat(64), "2".repeat(64)],
      [{ fragmentId: "f".repeat(64) }, { fragmentId: "1".repeat(64) }],
    ),
    "740275fd5d84453384810fbc78cd1574d7f013b542ad009cbb0b6d05984e9713",
  );
  assert.equal(
    templateCopilotV3EvidenceDeltaHash(
      [{ spanId: "0".repeat(64) }, { spanId }],
      ["2".repeat(64), "e".repeat(64)],
      [{ fragmentId: "1".repeat(64) }, { fragmentId: "f".repeat(64) }],
    ),
    "740275fd5d84453384810fbc78cd1574d7f013b542ad009cbb0b6d05984e9713",
    "presentation order must not change any tagged ID set",
  );
});
