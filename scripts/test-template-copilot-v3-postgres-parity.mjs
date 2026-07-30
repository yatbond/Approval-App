import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  templateCopilotV3CanonicalJsonNumberText,
  templateCopilotV3DirectEvidenceDerivesLeaf,
  templateCopilotV3EvidenceAppendPayloadUtf8Bytes,
  templateCopilotV3EvidenceCompilerVersion,
  templateCopilotV3EvidenceDeltaHash,
  templateCopilotV3FragmentId,
  templateCopilotV3FragmentSchema,
  templateCopilotV3LexicalAliases,
  templateCopilotV3SourceSpanId,
} from "../src/lib/template-copilot-v3-evidence.ts";

const optInVariable = "RUN_TEMPLATE_COPILOT_V3_POSTGRES_PARITY";
if (process.env[optInVariable] !== "1") {
  throw new Error(
    `Disposable PostgreSQL parity is opt-in. Set ${optInVariable}=1 to run it.`,
  );
}

const imageId =
  "sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453";
const imageRef =
  "public.ecr.aws/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453";
const containerName = `approval-v3-parity-${randomUUID()
  .replaceAll("-", "")
  .slice(0, 20)}`;
const runLabel = `approval.workflow.test.run=${containerName}`;
const migrationPath = new URL(
  "../supabase/migrations/20260730151355_template_copilot_v3_evidence_foundation.sql",
  import.meta.url,
);
const immutableHelperNames = [
  "template_copilot_v3_stable_json",
  "template_copilot_v3_json_node_count",
  "template_copilot_v3_number_is_canonical",
  "template_copilot_v3_json_value_is_bounded",
  "template_copilot_v3_text_has_non_whitespace",
  "template_copilot_v3_primitive_leaves",
  "template_copilot_v3_required_fragment_paths",
  "template_copilot_v3_missing_path_is_allowed",
  "template_copilot_v3_binding_rule_is_compatible",
  "template_copilot_v3_fragment_leaf_is_canonical",
  "template_copilot_v3_fragment_text_has_canonical_edges",
  "template_copilot_v3_pointer_contains",
  "template_copilot_v3_normalize_trim_collapse_text",
  "template_copilot_v3_normalize_lexical_text",
  "template_copilot_v3_dynamic_stage_reference_is_canonical",
  "template_copilot_v3_enum_leaf_is_allowed",
  "template_copilot_v3_enum_alias_matches",
  "template_copilot_v3_ordinal_alias_matches",
  "template_copilot_v3_direct_evidence_derives_leaf",
];

const exactText = "  合同😀e\u0301  ";
const vectorSpan = {
  messageId: "message:unicode-vector",
  startCodePoint: 7,
  endCodePoint: 16,
  exactText,
};
const expectedSpanId =
  "97f09b9337a0546fa1becabbcb91510435bc26c46474eedc53332b9599f8d416";
const vectorFragmentWithoutId = {
  evidenceVersion: 3,
  compilerVersion: templateCopilotV3EvidenceCompilerVersion,
  factId: "request.fields",
  fragmentKind: "array_item",
  state: "open",
  value: { label: "Amount", required: true },
  bindings: [
    {
      path: "/required",
      spanIds: ["b".repeat(64)],
      rule: "boolean_lexical",
    },
    { path: "/label", spanIds: ["a".repeat(64)], rule: "exact" },
  ],
  missingPaths: ["/options", "/type"],
  confidence: "high",
  ambiguity: "none",
};
const expectedFragmentId =
  "6eea54d855e646a2742a72301bfbad34c944e74f56f9892aecdde914727f5774";
const expectedDeltaHash =
  "740275fd5d84453384810fbc78cd1574d7f013b542ad009cbb0b6d05984e9713";
const vectorFragment = {
  fragmentId: expectedFragmentId,
  ...vectorFragmentWithoutId,
};
const newSpanIds = [expectedSpanId, "0".repeat(64)];
const knownSpanIds = ["e".repeat(64), "2".repeat(64)];
const fragmentIds = ["f".repeat(64), "1".repeat(64)];

assert.equal(Array.from(exactText).length, 9);
assert.equal(templateCopilotV3SourceSpanId(vectorSpan), expectedSpanId);
assert.equal(
  templateCopilotV3FragmentId(vectorFragmentWithoutId),
  expectedFragmentId,
);
assert.equal(templateCopilotV3FragmentSchema.safeParse(vectorFragment).success, true);
assert.equal(
  templateCopilotV3EvidenceDeltaHash(
    newSpanIds.map((spanId) => ({ spanId })),
    knownSpanIds,
    fragmentIds.map((fragmentId) => ({ fragmentId })),
  ),
  expectedDeltaHash,
);

const jsonCases = createJsonCases();
const expectedBoundedJson = Object.fromEntries(
  jsonCases.map(({ name, fragment }) => [
    name,
    templateCopilotV3FragmentSchema.safeParse(fragment).success,
  ]),
);
assert.equal(expectedBoundedJson.valid, true);
for (const name of Object.keys(expectedBoundedJson).filter(
  (name) => name !== "valid",
)) {
  assert.equal(expectedBoundedJson[name], false, `${name} TS fixture`);
}

const semanticVectors = createSemanticVectors();
const expectedSemantic = Object.fromEntries(
  semanticVectors.map((vector) => {
    const actual = templateCopilotV3DirectEvidenceDerivesLeaf(vector);
    const combined = vector.requireCanonicalLeaf
      ? actual && canonicalLeafFixtureIsValid(vector)
      : actual;
    assert.equal(combined, vector.expected, vector.description);
    return [vector.id, combined];
  }),
);
const semanticStats = Object.fromEntries(
  [...new Set(semanticVectors.map(({ category }) => category))]
    .sort()
    .map((category) => [
      category,
      semanticVectors.filter((vector) => vector.category === category).length,
    ]),
);
const spanGroups = createSpanGroups();
const expectedSpanGroups = Object.fromEntries(
  spanGroups.map((group) => {
    const actual = group.sourceTexts.every((sourceText) =>
      templateCopilotV3DirectEvidenceDerivesLeaf({ ...group, sourceText }),
    );
    const combined = group.requireCanonicalLeaf
      ? actual && canonicalLeafFixtureIsValid(group)
      : actual;
    assert.equal(combined, group.expected, group.description);
    return [group.id, combined];
  }),
);
const stableJsonCases = createStableJsonCases();
const expectedStableJsonHashes = Object.fromEntries(
  stableJsonCases.map(({ id, fragment }) => [id, fragment.fragmentId]),
);
const expectedFragmentValueBytes = Object.fromEntries(
  stableJsonCases.map(({ id, fragment }) => [
    id,
    stableJsonValueUtf8Bytes(fragment.value),
  ]),
);
assert.equal(
  new Set(Object.values(expectedStableJsonHashes)).size,
  stableJsonCases.length,
  "Each metadata and JSON fixture must produce a distinct fragment ID.",
);
const deltaCases = createDeltaCases(stableJsonCases);
const expectedDeltaHashes = Object.fromEntries(
  deltaCases.map((fixture) => [
    fixture.id,
    templateCopilotV3EvidenceDeltaHash(
      fixture.newSpanIds.map((spanId) => ({ spanId })),
      fixture.knownSpanIds,
      fixture.fragmentIds.map((fragmentId) => ({ fragmentId })),
    ),
  ]),
);
assert.equal(expectedDeltaHashes.pinned, expectedDeltaHash);
const payloadCases = createPayloadCases(stableJsonCases);
const expectedPayloadBytes = Object.fromEntries(
  payloadCases.map(({ id, payload }) => [
    id,
    templateCopilotV3EvidenceAppendPayloadUtf8Bytes(payload),
  ]),
);
assert.equal(expectedPayloadBytes.empty, 6);
const numericDomainCases = createNumericDomainCases();
const expectedNumericDomain = Object.fromEntries(
  numericDomainCases.map(({ id, raw, expected }) => {
    assert.equal(
      templateCopilotV3CanonicalJsonNumberText(Number(raw)) === raw,
      expected,
      id,
    );
    return [
      id,
      {
        bounded: expected,
        canonical: expected,
      },
    ];
  }),
);
const rootValueCases = createRootValueCases();
const expectedRootValueParity = Object.fromEntries(
  rootValueCases.map(({ id, value, expected }) => [
    id,
    { bounded: expected, stableBytes: stableJsonValueUtf8Bytes(value) },
  ]),
);

const fullRpcParticipantCases = createNonResolverParticipantRpcCases();
const fullRpcBaseCase = fullRpcParticipantCases.find(
  ({ expectedApplied }) => expectedApplied,
);
assert.ok(fullRpcBaseCase, "full-RPC valid participant fixture");
const fullRpcHostileNullCases = createHostileNullRpcCases(fullRpcBaseCase);
const fullRpcCases = [...fullRpcParticipantCases, ...fullRpcHostileNullCases];
const expectedFullRpcParity = Object.fromEntries(
  fullRpcCases.map(({ id, expectedApplied, sourceSpans }) => [
    id,
    {
      auditCount: 1,
      auditDetailKeys: expectedApplied
        ? [
            "compilerVersion",
            "evidenceHash",
            "evidenceVersion",
            "fragmentCount",
            "spanCount",
          ]
        : [
            "compilerVersion",
            "evidenceHash",
            "evidenceVersion",
            "fragmentCount",
            "reason",
            "spanCount",
          ],
      auditHasEvidencePayload: false,
      auditOutcome: expectedApplied ? "applied" : "invalid_command",
      auditReason: expectedApplied ? null : "fragment",
      fragmentCount: expectedApplied ? 1 : 0,
      outcome: expectedApplied ? "applied" : "invalid_command",
      receiptCount: expectedApplied ? 1 : 0,
      revision: expectedApplied ? 2 : 1,
      sourceSpanCount: expectedApplied ? sourceSpans.length : 0,
    },
  ]),
);

const migration = await readFile(migrationPath, "utf8");
const helperSql = immutableHelperNames
  .map((name) => copyImmutableHelper(migration, name))
  .join("\n\n")
  .replaceAll(
    "private.template_copilot_v3_",
    "pg_temp.template_copilot_v3_",
  );
assert.doesNotMatch(helperSql, /\bprivate\./i);
assert.equal(
  (helperSql.match(/\bcreate\s+function\s+pg_temp\./gi) ?? []).length,
  immutableHelperNames.length,
);

const sql = buildParitySql(
  helperSql,
  jsonCases,
  semanticVectors,
  spanGroups,
  stableJsonCases,
  deltaCases,
  payloadCases,
  numericDomainCases,
  rootValueCases,
);
let containerId = "";
let cleanupPromise;
let passed = false;

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(exitCode));
  });
}

try {
  await verifyPinnedImage();
  const password = randomBytes(24).toString("hex");
  const start = await docker([
    "run",
    "--detach",
    "--name",
    containerName,
    "--pull=never",
    "--network",
    "none",
    "--tmpfs",
    "/var/lib/postgresql/data:rw,nosuid,nodev,size=512m",
    "--label",
    "approval.workflow.test=template-copilot-v3-evidence-parity",
    "--label",
    runLabel,
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "--env",
    "POSTGRES_DB=postgres",
    imageRef,
  ]);
  containerId = start.stdout.trim();
  assert.match(containerId, /^[0-9a-f]{64}$/);
  await assertIsolatedRuntime();
  await waitUntilHealthy();
  const result = await psql(sql);
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(lines.length, 1, `Expected one parity result row: ${result.stdout}`);
  const actual = JSON.parse(lines[0]);
  assert.equal(actual.serverVersionMajor, 17);
  assert.match(actual.serverVersion, /^17\.6(?:\s|$)/);
  assert.equal(actual.serverEncoding, "UTF8");
  assert.equal(actual.spanId, expectedSpanId);
  assert.equal(actual.fragmentId, expectedFragmentId);
  assert.equal(actual.deltaHash, expectedDeltaHash);
  assert.deepEqual(actual.boundedJson, expectedBoundedJson);
  assert.deepEqual(actual.semanticParity, expectedSemantic);
  assert.deepEqual(actual.spanGroupParity, expectedSpanGroups);
  assert.deepEqual(actual.payloadBytes, expectedPayloadBytes);
  assert.deepEqual(actual.fragmentValueBytes, expectedFragmentValueBytes);
  assert.deepEqual(actual.stableJsonHashes, expectedStableJsonHashes);
  assert.deepEqual(actual.deltaHashes, expectedDeltaHashes);
  assert.deepEqual(actual.numericDomain, expectedNumericDomain);
  assert.deepEqual(actual.rootValueParity, expectedRootValueParity);
  assert.deepEqual(actual.helperChecks, {
    canonicalLabel: true,
    compatibleBooleanRule: true,
    missingParticipantParentAllowed: true,
    nonWhitespace: true,
    participantParentContainsMode: true,
    primitiveLeaves: ["/items", "/participant/mode"],
    requiredStagePaths: [
      "/kind",
      "/label",
      "/participant/mode",
      "/participant/value",
      "/sequence",
    ],
    whitespaceOnly: false,
  });
  const fullRpcResult = await psql(
    buildFullRpcParticipantParitySql(migration, fullRpcCases),
  );
  const fullRpcLines = fullRpcResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(
    fullRpcLines.length,
    1,
    `Expected one full-RPC parity result row: ${fullRpcResult.stdout}`,
  );
  assert.deepEqual(JSON.parse(fullRpcLines[0]), expectedFullRpcParity);
  passed = true;
} finally {
  await cleanup();
}

if (passed) {
  await assertCleanupComplete();
  console.log("template_copilot_v3_postgres_parity=PASS");
  console.log(`postgres_image=${imageRef}`);
  console.log("postgres_version=17.6");
  console.log("network=none");
  console.log("ports=none");
  console.log("binds=none");
  console.log("persistent_volumes=none");
  console.log("cleanup=verified");
  console.log(`semantic_vectors=${semanticVectors.length}`);
  console.log(`semantic_vector_counts=${JSON.stringify(semanticStats)}`);
  console.log(`every_span_groups=${spanGroups.length}`);
  console.log(`stable_json_vectors=${stableJsonCases.length}`);
  console.log(`fragment_value_byte_vectors=${stableJsonCases.length}`);
  console.log(`delta_hash_vectors=${deltaCases.length}`);
  console.log(`payload_byte_vectors=${payloadCases.length}`);
  console.log(`bounded_json_vectors=${jsonCases.length}`);
  console.log(`numeric_domain_vectors=${numericDomainCases.length}`);
  console.log(`root_value_vectors=${rootValueCases.length}`);
  console.log(`full_rpc_participant_vectors=${fullRpcParticipantCases.length}`);
  console.log(`full_rpc_hostile_null_vectors=${fullRpcHostileNullCases.length}`);
  console.log(`full_rpc_total_vectors=${fullRpcCases.length}`);
}

function createJsonCases() {
  const fragment = (value) => {
    const withoutId = { ...vectorFragmentWithoutId, value };
    return {
      fragmentId: templateCopilotV3FragmentId(withoutId),
      ...withoutId,
    };
  };
  let tooDeep = "Amount";
  for (let index = 0; index < 17; index += 1) tooDeep = { x: tooDeep };
  const tooManyNodes = Array.from({ length: 20 }, () =>
    Array.from({ length: 100 }, () => true),
  );
  const tooManyKeys = Object.fromEntries(
    Array.from({ length: 201 }, (_, index) => [
      `key${String(index).padStart(3, "0")}`,
      true,
    ]),
  );
  return [
    { name: "valid", fragment: vectorFragment },
    {
      name: "nonAsciiKey",
      fragment: fragment({ label: "Amount", required: true, 名稱: "Approval" }),
    },
    {
      name: "overlongString",
      fragment: fragment({ label: "😀".repeat(8_001), required: true }),
    },
    {
      name: "tooDeep",
      fragment: fragment({ label: tooDeep, required: true }),
    },
    {
      name: "tooManyNodes",
      fragment: fragment({ label: tooManyNodes, required: true }),
    },
    {
      name: "tooManyKeys",
      fragment: fragment({ label: "Amount", required: true, ...tooManyKeys }),
    },
  ];
}

function createSemanticVectors() {
  const vectors = [];
  const push = ({
    category,
    description,
    factId,
    path,
    rule,
    leafValue,
    sourceText,
    expected = true,
    requireCanonicalLeaf = false,
  }) => {
    vectors.push({
      id: `v${String(vectors.length + 1).padStart(4, "0")}`,
      category,
      description,
      factId,
      path,
      rule,
      leafValue,
      value: valueAtPath(path, leafValue),
      sourceText,
      expected,
      requireCanonicalLeaf,
    });
  };

  for (const [scope, canonicals] of Object.entries(
    templateCopilotV3LexicalAliases.enumByScope,
  )) {
    const split = scope.indexOf(":");
    const factId = scope.slice(0, split);
    const scopePath = scope.slice(split + 1);
    const path = scopePath.replace("/*", "/0");
    for (const [leafValue, aliases] of Object.entries(canonicals)) {
      push({
        category: "enum_canonical",
        description: `${scope} canonical ${leafValue}`,
        factId,
        path,
        rule: "enum_lexical",
        leafValue,
        sourceText: leafValue,
      });
      for (const alias of aliases) {
        push({
          category: "enum_alias",
          description: `${scope} ${leafValue} alias ${alias}`,
          factId,
          path,
          rule: "enum_lexical",
          leafValue,
          sourceText: alias,
        });
      }
    }
  }

  for (const [truth, aliases] of [
    [true, templateCopilotV3LexicalAliases.boolean.true],
    [false, templateCopilotV3LexicalAliases.boolean.false],
  ]) {
    for (const alias of aliases) {
      push({
        category: "boolean_alias",
        description: `boolean ${truth} alias ${alias}`,
        factId: "request.fields",
        path: "/required",
        rule: "boolean_lexical",
        leafValue: truth,
        sourceText: alias,
      });
    }
  }
  for (const alias of templateCopilotV3LexicalAliases.emptyCollection) {
    push({
      category: "empty_collection_alias",
      description: `empty collection alias ${alias}`,
      factId: "request.fields",
      path: "/options",
      rule: "explicit_empty_collection",
      leafValue: [],
      sourceText: alias,
    });
  }
  push({
    category: "empty_collection_alias",
    description: "empty object alias",
    factId: "workflow.stages",
    path: "/participant",
    rule: "explicit_empty_collection",
    leafValue: {},
    sourceText: "none",
  });

  push({
    category: "scope_isolation",
    description: "email field is not a notification channel alias",
    factId: "notifications.rules",
    path: "/channel",
    rule: "enum_lexical",
    leafValue: "email",
    sourceText: "email field",
    expected: false,
  });
  push({
    category: "scope_isolation",
    description: "by email is not a request field type alias",
    factId: "request.fields",
    path: "/type",
    rule: "enum_lexical",
    leafValue: "email",
    sourceText: "by email",
    expected: false,
  });

  for (const { factId, path } of [
    { factId: "attachments.requirements", path: "/stage" },
    { factId: "workflow.conditions", path: "/matchingRoute" },
    { factId: "workflow.conditions", path: "/otherwiseRoute" },
    { factId: "notifications.rules", path: "/stage" },
  ]) {
    push({
      category: "dynamic_reference",
      description: `${factId}:${path} canonical dynamic stage`,
      factId,
      path,
      rule: "enum_lexical",
      leafValue: "stage:Legal Review",
      sourceText: "legal review",
    });
  }
  for (const badLeaf of [
    "stage: Legal Review",
    "stage:Legal  Review",
    "stage:Ａpproval",
  ]) {
    push({
      category: "dynamic_reference_negative",
      description: `noncanonical dynamic stage ${badLeaf}`,
      factId: "notifications.rules",
      path: "/stage",
      rule: "enum_lexical",
      leafValue: badLeaf,
      sourceText: badLeaf,
      expected: false,
    });
  }
  push({
    category: "dynamic_reference",
    description: "canonical condition suffix",
    factId: "workflow.conditions",
    path: "/matchingRoute",
    rule: "enum_lexical",
    leafValue: "condition:risk_gate",
    sourceText: "risk_gate",
  });
  push({
    category: "dynamic_reference_negative",
    description: "noncanonical condition suffix",
    factId: "workflow.conditions",
    path: "/matchingRoute",
    rule: "enum_lexical",
    leafValue: "condition:Risk_Gate",
    sourceText: "Risk_Gate",
    expected: false,
  });

  push({
    category: "text_normalization",
    description: "NFKC and whitespace collapse preserves case",
    factId: "request.fields",
    path: "/label",
    rule: "nfkc_trim_collapse",
    leafValue: "Legal Review",
    sourceText: " \u3000Ｌｅｇａｌ\tReview\u00a0 ",
  });
  push({
    category: "text_normalization",
    description: "NFKC text normalization must not fold case",
    factId: "request.fields",
    path: "/label",
    rule: "nfkc_trim_collapse",
    leafValue: "Legal Review",
    sourceText: "legal review",
    expected: false,
  });
  push({
    category: "text_normalization",
    description: "exact does not normalize",
    factId: "request.fields",
    path: "/label",
    rule: "exact",
    leafValue: "Legal Review",
    sourceText: "Legal  Review",
    expected: false,
  });

  for (const [factId, maximum] of [
    ["workflow.stages", 100],
    ["workflow.conditions", 50],
  ]) {
    for (let sequence = 1; sequence <= maximum; sequence += 1) {
      for (const wording of ordinalWordings(sequence)) {
        push({
          category:
            factId === "workflow.stages"
              ? "stage_ordinal"
              : "condition_ordinal",
          description: `${factId} sequence ${sequence} wording ${wording}`,
          factId,
          path: "/sequence",
          rule: "numeric_lexical",
          leafValue: sequence,
          sourceText: wording,
        });
      }
    }
  }
  for (const [factId, leafValue, sourceText] of [
    ["workflow.stages", 1, "01"],
    ["workflow.stages", 1, "1th"],
    ["workflow.stages", 0, "0"],
    ["workflow.stages", 101, "101"],
    ["workflow.stages", 1.5, "1.5"],
    ["workflow.conditions", 0, "0"],
    ["workflow.conditions", 51, "51"],
  ]) {
    push({
      category: "ordinal_negative",
      description: `${factId} rejected sequence ${leafValue} wording ${sourceText}`,
      factId,
      path: "/sequence",
      rule: "numeric_lexical",
      leafValue,
      sourceText,
      expected: false,
      requireCanonicalLeaf: true,
    });
  }

  for (const [leafValue, sourceText, expected] of [
    [1.25, "+1.2500", true],
    [1234.5, "1,234.500", true],
    [1234.5, "12,34.5", false],
    [0, "-0.000", true],
    [0.000001, "0.0000010", true],
    [0.000001, "1e-6", false],
    [100000000000000000000, "100,000,000,000,000,000,000", true],
    [
      Number("999999999999999000000"),
      "+999,999,999,999,999,000,000.00",
      true,
    ],
    [
      Number("999999999999999900000"),
      "999999999999999900000",
      false,
    ],
    [
      Number("9007199254740993"),
      "9007199254740993",
      false,
    ],
    [
      Number("78123677071134.76"),
      "78123677071134.76",
      false,
    ],
    [
      0.1,
      "0.10000000000000001",
      false,
    ],
  ]) {
    push({
      category: "numeric_decimal",
      description: `numeric ${leafValue} wording ${sourceText}`,
      factId: "workflow.conditions",
      path: "/value",
      rule: "numeric_lexical",
      leafValue,
      sourceText,
      expected,
    });
  }
  return vectors;
}

function createSpanGroups() {
  const group = (
    id,
    description,
    factId,
    path,
    rule,
    leafValue,
    sourceTexts,
    expected,
  ) => ({
    id,
    description,
    factId,
    path,
    rule,
    leafValue,
    value: valueAtPath(path, leafValue),
    sourceTexts,
    expected,
    requireCanonicalLeaf: false,
  });
  return [
    group(
      "enum_all_good",
      "every enum span derives the email field type",
      "request.fields",
      "/type",
      "enum_lexical",
      "email",
      ["email", "email field", "电子邮件"],
      true,
    ),
    group(
      "enum_mixed_bad",
      "one unrelated enum span rejects the binding",
      "request.fields",
      "/type",
      "enum_lexical",
      "email",
      ["email field", "banana"],
      false,
    ),
    group(
      "boolean_all_good",
      "every boolean span derives required",
      "request.fields",
      "/required",
      "boolean_lexical",
      true,
      ["required", "必須", "必须提供"],
      true,
    ),
    group(
      "boolean_mixed_bad",
      "one negating boolean span rejects the binding",
      "request.fields",
      "/required",
      "boolean_lexical",
      true,
      ["required", "optional"],
      false,
    ),
    group(
      "dynamic_all_good",
      "full and suffix dynamic stage spans both derive",
      "notifications.rules",
      "/stage",
      "enum_lexical",
      "stage:Legal Review",
      ["stage:Legal Review", "legal review"],
      true,
    ),
    group(
      "numeric_mixed_bad",
      "one malformed numeric span rejects the binding",
      "workflow.conditions",
      "/value",
      "numeric_lexical",
      1234.5,
      ["1,234.500", "12,34.5"],
      false,
    ),
  ];
}

function createStableJsonCases() {
  const make = (id, overrides = {}) => {
    const withoutId = {
      ...vectorFragmentWithoutId,
      ...overrides,
      value: {
        ...vectorFragmentWithoutId.value,
        ...(overrides.value ?? {}),
      },
    };
    return {
      id,
      fragment: {
        fragmentId: templateCopilotV3FragmentId(withoutId),
        ...withoutId,
      },
    };
  };
  return [
    { id: "pinned", fragment: vectorFragment },
    make("confidence_low", { confidence: "low" }),
    make("ambiguity_possible", {
      ambiguity: "possible",
      ambiguityNote: "Needs confirmation",
    }),
    make("ambiguity_ambiguous", {
      ambiguity: "ambiguous",
      ambiguityNote: "含糊😀\u2028second line",
    }),
    make("json_escaping", {
      value: {
        label: "A\"quote\\slash\b\f\n\r\t中😀\u2028\u2029Z",
      },
    }),
    make("numeric_zero", { value: { numericBoundary: 0 } }),
    make("numeric_minimum", { value: { numericBoundary: 0.000001 } }),
    make("numeric_power_of_ten", {
      value: { numericBoundary: Number("100000000000000000000") },
    }),
    make("numeric_fifteen_digits", {
      value: { numericBoundary: Number("999999999999999000000") },
    }),
    make("numeric_sixteen_digits", {
      value: { numericBoundary: 999999999999999900000 },
    }),
  ];
}

function createDeltaCases(stableCases) {
  const byId = Object.fromEntries(
    stableCases.map(({ id, fragment }) => [id, fragment.fragmentId]),
  );
  return [
    {
      id: "pinned",
      newSpanIds,
      knownSpanIds,
      fragmentIds,
    },
    {
      id: "confidence_bound",
      newSpanIds: [expectedSpanId],
      knownSpanIds: ["e".repeat(64)],
      fragmentIds: [byId.confidence_low],
    },
    {
      id: "ambiguity_bound",
      newSpanIds: [expectedSpanId],
      knownSpanIds: ["e".repeat(64)],
      fragmentIds: [byId.ambiguity_possible],
    },
  ];
}

function createPayloadCases(stableCases) {
  const byId = Object.fromEntries(
    stableCases.map(({ id, fragment }) => [id, fragment]),
  );
  return [
    {
      id: "empty",
      payload: { newSourceSpans: [], knownSpanIds: [], fragments: [] },
    },
    {
      id: "baseline",
      payload: {
        newSourceSpans: [{ spanId: expectedSpanId }],
        knownSpanIds: ["e".repeat(64)],
        fragments: [vectorFragment],
      },
    },
    {
      id: "unicode_and_escaping",
      payload: {
        newSourceSpans: [
          {
            spanId: expectedSpanId,
            messageId: vectorSpan.messageId,
            startCodePoint: vectorSpan.startCodePoint,
            endCodePoint: vectorSpan.endCodePoint,
            exactText: "A\"\\\n中😀\u2028\u2029Z",
          },
        ],
        knownSpanIds: ["2".repeat(64), "e".repeat(64)],
        fragments: [byId.json_escaping, byId.ambiguity_ambiguous],
      },
    },
  ];
}

function createNumericDomainCases() {
  return [
    { id: "zero", raw: "0", expected: true },
    { id: "decimal", raw: "0.1", expected: true },
    { id: "minimum", raw: "0.000001", expected: true },
    {
      id: "fifteen_significant_digits",
      raw: "999999999999999000000",
      expected: true,
    },
    {
      id: "power_of_ten",
      raw: "100000000000000000000",
      expected: true,
    },
    { id: "below_minimum", raw: "0.0000001", expected: false },
    {
      id: "upper_magnitude",
      raw: "1000000000000000000000",
      expected: false,
    },
    {
      id: "sixteen_significant_digits",
      raw: "999999999999999900000",
      expected: false,
    },
    {
      id: "unsafe_integer",
      raw: "9007199254740993",
      expected: false,
    },
    {
      id: "rounded_large_decimal",
      raw: "78123677071134.76",
      expected: false,
    },
    {
      id: "rounded_small_decimal",
      raw: "0.10000000000000001",
      expected: false,
    },
  ];
}

function createRootValueCases() {
  const atLimit = valueWithStableJsonUtf8Bytes(262_144);
  const overLimit = valueWithStableJsonUtf8Bytes(262_145);
  return [
    {
      id: "stable_json_at_limit",
      value: atLimit,
      expected: true,
    },
    {
      id: "stable_json_over_limit",
      value: overLimit,
      expected: false,
    },
  ];
}

function valueWithStableJsonUtf8Bytes(targetBytes) {
  const value = { chunks: [] };
  while (stableJsonValueUtf8Bytes(value) < targetBytes) {
    const currentBytes = stableJsonValueUtf8Bytes(value);
    const itemOverhead = value.chunks.length === 0 ? 2 : 3;
    const remainingTextBytes = targetBytes - currentBytes - itemOverhead;
    assert.ok(remainingTextBytes >= 0, `Cannot reach ${targetBytes} bytes`);
    value.chunks.push("x".repeat(Math.min(8_000, remainingTextBytes)));
    assert.ok(value.chunks.length <= 200);
  }
  assert.equal(stableJsonValueUtf8Bytes(value), targetBytes);
  return value;
}

function stableJsonValueUtf8Bytes(value) {
  return (
    templateCopilotV3EvidenceAppendPayloadUtf8Bytes({
      newSourceSpans: [],
      knownSpanIds: [],
      fragments: [value],
    }) - 6
  );
}

function createNonResolverParticipantRpcCases() {
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const make = ({
    id,
    sessionId,
    sourceMessageId,
    label,
    kind,
    kindWording,
    mode,
    modeWording,
    commandHash,
    expectedApplied,
  }) => {
    const messageId = `message:rpc-${id}`;
    const segments = [
      { key: "label", sourceText: label },
      { key: "kind", sourceText: kindWording },
      { key: "mode", sourceText: modeWording },
      { key: "sequence", sourceText: "first" },
    ];
    const content = segments.map(({ sourceText }) => sourceText).join(" | ");
    let searchFrom = 0;
    const sourceSpans = segments.map(({ key, sourceText }) => {
      const startCodeUnit = content.indexOf(sourceText, searchFrom);
      assert.ok(startCodeUnit >= searchFrom, `${id} ${key} source segment`);
      searchFrom = startCodeUnit + sourceText.length;
      const span = {
        messageId,
        startCodePoint: Array.from(content.slice(0, startCodeUnit)).length,
        endCodePoint:
          Array.from(content.slice(0, startCodeUnit)).length +
          Array.from(sourceText).length,
        exactText: sourceText,
      };
      return { spanId: templateCopilotV3SourceSpanId(span), ...span, key };
    });
    const spanIdByKey = Object.fromEntries(
      sourceSpans.map(({ key, spanId }) => [key, spanId]),
    );
    const durableSpans = sourceSpans.map(
      ({ spanId, messageId, startCodePoint, endCodePoint, exactText }) => ({
        spanId,
        messageId,
        startCodePoint,
        endCodePoint,
        exactText,
      }),
    );
    const fragmentWithoutId = {
      evidenceVersion: 3,
      compilerVersion: templateCopilotV3EvidenceCompilerVersion,
      factId: "workflow.stages",
      fragmentKind: "array_item",
      state: "open",
      value: {
        label,
        kind,
        participant: { mode },
        sequence: 1,
      },
      bindings: [
        { path: "/label", spanIds: [spanIdByKey.label], rule: "exact" },
        { path: "/kind", spanIds: [spanIdByKey.kind], rule: "enum_lexical" },
        {
          path: "/participant/mode",
          spanIds: [spanIdByKey.mode],
          rule: "enum_lexical",
        },
        {
          path: "/sequence",
          spanIds: [spanIdByKey.sequence],
          rule: "numeric_lexical",
        },
      ],
      missingPaths: ["/participant/value"],
      confidence: "high",
      ambiguity: "none",
    };
    const fragment = {
      fragmentId: templateCopilotV3FragmentId(fragmentWithoutId),
      ...fragmentWithoutId,
    };
    assert.equal(
      templateCopilotV3FragmentSchema.safeParse(fragment).success,
      expectedApplied,
      `${id} TypeScript participant-mode control`,
    );
    return {
      id,
      ownerId,
      sessionId,
      sourceMessageId,
      messageId,
      content,
      sourceSpans: durableSpans,
      fragment,
      commandHash,
      expectedApplied,
      idempotencyKey: `v3frag:${id}`,
      evidenceHash: templateCopilotV3EvidenceDeltaHash(
        durableSpans,
        [],
        [fragment],
      ),
    };
  };
  return [
    make({
      id: "requester_missing_participant_value",
      sessionId: "22222222-2222-4222-8222-222222222222",
      sourceMessageId: "33333333-3333-4333-8333-333333333333",
      label: "Requester stage",
      kind: "approval",
      kindWording: "approve",
      mode: "requester",
      modeWording: "requester",
      commandHash: "a".repeat(64),
      expectedApplied: false,
    }),
    make({
      id: "unassigned_missing_participant_value",
      sessionId: "44444444-4444-4444-8444-444444444444",
      sourceMessageId: "55555555-5555-4555-8555-555555555555",
      label: "Unassigned stage",
      kind: "review",
      kindWording: "review",
      mode: "unassigned_at_template",
      modeWording: "unassigned",
      commandHash: "b".repeat(64),
      expectedApplied: false,
    }),
    make({
      id: "directory_position_missing_participant_value",
      sessionId: "66666666-6666-4666-8666-666666666666",
      sourceMessageId: "77777777-7777-4777-8777-777777777777",
      label: "Directory stage",
      kind: "approval",
      kindWording: "approve",
      mode: "directory_position",
      modeWording: "directory position",
      commandHash: "c".repeat(64),
      expectedApplied: true,
    }),
  ];
}

function createHostileNullRpcCases(base) {
  const make = ({ id, sessionId, sourceMessageId, field, commandHash }) => {
    const messageId = `message:rpc-${id}`;
    const spanIdMap = new Map();
    const sourceSpans = base.sourceSpans.map((span) => {
      const material = {
        messageId,
        startCodePoint: span.startCodePoint,
        endCodePoint: span.endCodePoint,
        exactText: span.exactText,
      };
      const spanId = templateCopilotV3SourceSpanId(material);
      spanIdMap.set(span.spanId, spanId);
      return { spanId, ...material };
    });
    const fragmentWithoutId = {
      evidenceVersion: base.fragment.evidenceVersion,
      compilerVersion: base.fragment.compilerVersion,
      factId: base.fragment.factId,
      fragmentKind: base.fragment.fragmentKind,
      state: base.fragment.state,
      value: base.fragment.value,
      bindings: base.fragment.bindings.map((binding) => ({
        ...binding,
        spanIds: binding.spanIds.map((spanId) => {
          const remapped = spanIdMap.get(spanId);
          assert.ok(remapped, `${id} remapped binding span`);
          return remapped;
        }),
      })),
      missingPaths: base.fragment.missingPaths,
      confidence: base.fragment.confidence,
      ambiguity: base.fragment.ambiguity,
    };
    const validFragment = {
      fragmentId: templateCopilotV3FragmentId(fragmentWithoutId),
      ...fragmentWithoutId,
    };
    assert.equal(
      templateCopilotV3FragmentSchema.safeParse(validFragment).success,
      true,
      `${id} valid control before hostile JSON null`,
    );
    const hostileFragmentWithoutId = { ...fragmentWithoutId, [field]: null };
    const fragment = {
      fragmentId:
        field === "factId"
          ? templateCopilotV3FragmentId(hostileFragmentWithoutId)
          : validFragment.fragmentId,
      ...hostileFragmentWithoutId,
    };
    assert.equal(
      templateCopilotV3FragmentSchema.safeParse(fragment).success,
      false,
      `${id} TypeScript hostile JSON-null control`,
    );
    if (field === "factId") {
      assert.notEqual(
        fragment.fragmentId,
        validFragment.fragmentId,
        `${id} null-bearing fragment ID reaches the historical insert fault`,
      );
    }
    return {
      id,
      ownerId: base.ownerId,
      sessionId,
      sourceMessageId,
      messageId,
      content: base.content,
      sourceSpans,
      fragment,
      commandHash,
      expectedApplied: false,
      idempotencyKey: `v3frag:${id}`,
      evidenceHash: templateCopilotV3EvidenceDeltaHash(
        sourceSpans,
        [],
        [fragment],
      ),
    };
  };

  return [
    make({
      id: "compiler_version_json_null",
      sessionId: "88888888-8888-4888-8888-888888888888",
      sourceMessageId: "99999999-9999-4999-8999-999999999999",
      field: "compilerVersion",
      commandHash: "d".repeat(64),
    }),
    make({
      id: "fact_id_json_null",
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceMessageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      field: "factId",
      commandHash: "e".repeat(64),
    }),
  ];
}

function ordinalWordings(sequence) {
  const values = new Set([String(sequence)]);
  const lastTwo = sequence % 100;
  const last = sequence % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : last === 1
        ? "st"
        : last === 2
          ? "nd"
          : last === 3
            ? "rd"
            : "th";
  values.add(`${sequence}${suffix}`);
  const small = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
    "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
    "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
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
  if (sequence <= 19) {
    values.add(small[sequence - 1]);
  } else if (sequence === 100) {
    values.add("one hundredth");
  } else {
    const units = sequence % 10;
    const [cardinal, ordinal] = tens[Math.floor(sequence / 10)];
    if (units === 0) {
      values.add(ordinal);
    } else {
      values.add(`${cardinal}-${small[units - 1]}`);
      values.add(`${cardinal} ${small[units - 1]}`);
    }
  }
  const digits = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
  let chinese;
  if (sequence < 10) chinese = digits[sequence - 1];
  else if (sequence === 10) chinese = "十";
  else if (sequence < 20) chinese = `十${digits[(sequence % 10) - 1]}`;
  else if (sequence < 100) {
    const units = sequence % 10;
    chinese = `${digits[Math.floor(sequence / 10) - 1]}十${
      units === 0 ? "" : digits[units - 1]
    }`;
  } else chinese = "一百";
  for (const wording of [
    chinese,
    `第${chinese}`,
    `第${chinese}個`,
    `第${chinese}个`,
    `第${sequence}`,
    `第${sequence}個`,
    `第${sequence}个`,
  ]) {
    values.add(wording);
  }
  return [...values];
}

function valueAtPath(path, leafValue) {
  const root = {};
  const parts = path.slice(1).split("/");
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index === parts.length - 1) {
      current[part] = leafValue;
      break;
    }
    const nextIsIndex = /^(?:0|[1-9][0-9]*)$/.test(parts[index + 1]);
    current[part] = nextIsIndex ? [] : {};
    current = current[part];
  }
  return root;
}

function canonicalLeafFixtureIsValid({ factId, path, leafValue }) {
  if (path !== "/sequence" || !Number.isInteger(leafValue)) return false;
  if (factId === "workflow.stages") {
    return leafValue >= 1 && leafValue <= 100;
  }
  if (factId === "workflow.conditions") {
    return leafValue >= 1 && leafValue <= 50;
  }
  return false;
}

function copyImmutableHelper(source, name) {
  const marker = `create function private.${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} definition`);
  const bodyStart = source.indexOf("as $$", start);
  const bodyEnd = source.indexOf("$$;", bodyStart + "as $$".length);
  assert.ok(bodyStart > start && bodyEnd > bodyStart, `${name} terminator`);
  const definition = source.slice(start, bodyEnd + "$$;".length);
  assert.equal(
    (definition.match(/\bcreate\s+function\b/gi) ?? []).length,
    1,
    `${name} contains one function`,
  );
  assert.match(definition, /\blanguage\s+(?:plpgsql|sql)\b/i);
  assert.match(definition, /\bimmutable\b/i);
  assert.match(definition, /\bstrict\b/i);
  assert.match(definition, /\bsecurity\s+invoker\b/i);
  assert.match(definition, /\bset\s+search_path\s*=\s*''/i);
  assert.doesNotMatch(definition, /\bsecurity\s+definer\b/i);
  assert.doesNotMatch(
    definition,
    /\b(?:insert|update|delete|merge|alter|drop|truncate|grant|revoke|copy)\b/i,
  );
  assert.doesNotMatch(definition, /\b(?:public|auth|storage|extensions)\./i);
  return definition;
}

function buildFullRpcParticipantParitySql(migrationSql, cases) {
  const profiles = [
    ...new Set(cases.map(({ ownerId }) => ownerId)),
  ].map((ownerId) => `(${sqlText(ownerId)}::uuid)`).join(",\n  ");
  const sessions = cases
    .map(
      ({ sessionId, ownerId }) =>
        `(${sqlText(sessionId)}::uuid, ${sqlText(ownerId)}::uuid, 1, 'interviewing', '{"schemaVersion":2}'::jsonb)`,
    )
    .join(",\n  ");
  const messages = cases
    .map(
      ({ sourceMessageId, sessionId, ownerId, messageId, content }) =>
        `(${sqlText(sourceMessageId)}::uuid, ${sqlText(sessionId)}::uuid, ${sqlText(ownerId)}::uuid, ${sqlText(messageId)}, 'user', ${sqlText(content)})`,
    )
    .join(",\n  ");
  const invocations = cases
    .map(
      (fixture) => `
insert into pg_temp.template_copilot_v3_rpc_results(id, session_id, response)
values (
  ${sqlText(fixture.id)},
  ${sqlText(fixture.sessionId)}::uuid,
  public.apply_template_copilot_v3_evidence_fragments(
    ${sqlText(fixture.ownerId)}::uuid,
    ${sqlText(fixture.sessionId)}::uuid,
    1,
    ${sqlText(fixture.idempotencyKey)},
    ${sqlText(fixture.commandHash)},
    ${sqlJson(fixture.sourceSpans)},
    '[]'::jsonb,
    ${sqlJson([fixture.fragment])},
    ${sqlText(fixture.evidenceHash)}
  )
);`,
    )
    .join("\n");

  return `
begin;
create schema if not exists private;
create table public.profiles (
  id uuid primary key
);
create table public.template_copilot_sessions (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  revision bigint not null,
  status text not null,
  ledger jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.template_copilot_messages (
  id uuid primary key,
  session_id uuid not null,
  owner_id uuid not null,
  client_message_id text not null,
  role text not null,
  content text not null,
  unique (id, session_id, owner_id)
);
create table public.template_copilot_v2_operation_receipts (
  session_id uuid not null references public.template_copilot_sessions(id),
  idempotency_key text not null,
  command_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (session_id, idempotency_key)
);
create table public.template_copilot_v2_audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.template_copilot_sessions(id),
  owner_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  command_hash text not null,
  operation text not null,
  fact_id text,
  before_revision bigint,
  after_revision bigint,
  outcome text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint template_copilot_v2_audit_events_operation_check
    check (operation in ('create_session'))
);

${migrationSql}

insert into public.profiles(id) values
  ${profiles};
insert into public.template_copilot_sessions(
  id, owner_id, revision, status, ledger
) values
  ${sessions};
insert into public.template_copilot_messages(
  id, session_id, owner_id, client_message_id, role, content
) values
  ${messages};

create temporary table template_copilot_v3_rpc_results (
  id text primary key,
  session_id uuid not null,
  response jsonb not null
) on commit drop;
${invocations}

select jsonb_object_agg(
  result.id,
  jsonb_build_object(
    'outcome', result.response->>'outcome',
    'revision', (
      select session.revision
      from public.template_copilot_sessions as session
      where session.id = result.session_id
    ),
    'sourceSpanCount', (
      select count(*)
      from private.template_copilot_v3_source_spans as span
      where span.session_id = result.session_id
    ),
    'fragmentCount', (
      select count(*)
      from private.template_copilot_v3_fragments as fragment
      where fragment.session_id = result.session_id
    ),
    'receiptCount', (
      select count(*)
      from public.template_copilot_v2_operation_receipts as receipt
      where receipt.session_id = result.session_id
    ),
    'auditOutcome', (
      select audit.outcome
      from public.template_copilot_v2_audit_events as audit
      where audit.session_id = result.session_id
      order by audit.created_at desc, audit.id desc
      limit 1
    ),
    'auditCount', (
      select count(*)
      from public.template_copilot_v2_audit_events as audit
      where audit.session_id = result.session_id
    ),
    'auditDetailKeys', (
      select jsonb_agg(detail_key.key order by detail_key.key collate "C")
      from jsonb_object_keys((
        select audit.detail
        from public.template_copilot_v2_audit_events as audit
        where audit.session_id = result.session_id
        order by audit.created_at desc, audit.id desc
        limit 1
      )) as detail_key(key)
    ),
    'auditHasEvidencePayload', coalesce((
      select audit.detail ?| array[
        'sourceSpans',
        'fragments',
        'exactText',
        'bindings',
        'missingPaths',
        'value'
      ]
      from public.template_copilot_v2_audit_events as audit
      where audit.session_id = result.session_id
      order by audit.created_at desc, audit.id desc
      limit 1
    ), false),
    'auditReason', (
      select audit.detail->>'reason'
      from public.template_copilot_v2_audit_events as audit
      where audit.session_id = result.session_id
      order by audit.created_at desc, audit.id desc
      limit 1
    )
  ) order by result.id
)::text
from pg_temp.template_copilot_v3_rpc_results as result;
rollback;
`;
}

function buildParitySql(
  copiedHelpers,
  boundedCases,
  vectors,
  groups,
  stableCases,
  deltas,
  payloads,
  numericCases,
  rootCases,
) {
  const sourceVector = sqlJson(vectorSpan);
  const boundedValues = boundedCases
    .map(({ name, fragment }) => `(${sqlText(name)}, ${sqlJson(fragment.value)})`)
    .join(",\n      ");
  const semanticValues = vectors
    .map(
      (vector) =>
        `(${sqlText(vector.id)}, ${sqlText(vector.factId)}, ${sqlText(
          vector.path,
        )}, ${sqlText(vector.rule)}, ${sqlJson(vector.leafValue)}, ${sqlText(
          vector.sourceText,
        )}, ${vector.requireCanonicalLeaf ? "true" : "false"})`,
    )
    .join(",\n      ");
  const spanGroupValues = groups
    .flatMap((group) =>
      group.sourceTexts.map(
        (sourceText) =>
          `(${sqlText(group.id)}, ${sqlText(group.factId)}, ${sqlText(
            group.path,
          )}, ${sqlText(group.rule)}, ${sqlJson(group.leafValue)}, ${sqlText(
            sourceText,
          )}, ${group.requireCanonicalLeaf ? "true" : "false"})`,
      ),
    )
    .join(",\n      ");
  const stableValues = stableCases
    .map(({ id, fragment }) => `(${sqlText(id)}, ${sqlJson(fragment)})`)
    .join(",\n      ");
  const deltaValues = deltas
    .map(
      (fixture) =>
        `(${sqlText(fixture.id)}, ${sqlJson(fixture.newSpanIds)}, ${sqlJson(
          fixture.knownSpanIds,
        )}, ${sqlJson(fixture.fragmentIds)})`,
    )
    .join(",\n      ");
  const payloadValues = payloads
    .map(({ id, payload }) => `(${sqlText(id)}, ${sqlJson(payload)})`)
    .join(",\n      ");
  const numericDomainValues = numericCases
    .map(({ id, raw }) => `(${sqlText(id)}, ${sqlRawJsonNumber(raw)})`)
    .join(",\n      ");
  const rootValueValues = rootCases
    .map(({ id, value }) => `(${sqlText(id)}, ${sqlJson(value)})`)
    .join(",\n      ");
  const pinnedNewSpans = sqlJson(newSpanIds);
  const pinnedKnownSpans = sqlJson(knownSpanIds);
  const pinnedFragments = sqlJson(fragmentIds);

  return `
begin;
create temporary table template_copilot_v3_parity_bootstrap(value integer) on commit drop;

${copiedHelpers}

with
span_fixture as (
  select ${sourceVector} as value
),
bounded_json as (
  select jsonb_object_agg(
    name,
    pg_temp.template_copilot_v3_json_value_is_bounded(value, 0)
  ) as value
  from (values
      ${boundedValues}
  ) as fixture(name, value)
),
numeric_domain as (
  select jsonb_object_agg(
    id,
    jsonb_build_object(
      'bounded',
        pg_temp.template_copilot_v3_json_value_is_bounded(value, 0),
      'canonical',
        pg_temp.template_copilot_v3_number_is_canonical(value)
    )
  ) as value
  from (values
      ${numericDomainValues}
  ) as fixture(id, value)
),
root_value_parity as (
  select jsonb_object_agg(
    id,
    jsonb_build_object(
      'bounded',
        pg_temp.template_copilot_v3_json_value_is_bounded(value, 0),
      'stableBytes',
        octet_length(convert_to(
          pg_temp.template_copilot_v3_stable_json(value),
          'UTF8'
        ))
    )
  ) as value
  from (values
      ${rootValueValues}
  ) as fixture(id, value)
),
semantic_parity as (
  select jsonb_object_agg(
    id,
    pg_temp.template_copilot_v3_direct_evidence_derives_leaf(
      fact_id, path, rule, leaf_value, source_text
    ) and (
      not require_canonical_leaf
      or pg_temp.template_copilot_v3_fragment_leaf_is_canonical(
        fact_id, path, leaf_value
      )
    )
  ) as value
  from (values
      ${semanticValues}
  ) as fixture(
    id, fact_id, path, rule, leaf_value, source_text, require_canonical_leaf
  )
),
span_group_parity as (
  select jsonb_object_agg(id, derives) as value
  from (
    select
      id,
      bool_and(
        pg_temp.template_copilot_v3_direct_evidence_derives_leaf(
          fact_id, path, rule, leaf_value, source_text
        ) and (
          not require_canonical_leaf
          or pg_temp.template_copilot_v3_fragment_leaf_is_canonical(
            fact_id, path, leaf_value
          )
        )
      ) as derives
    from (values
        ${spanGroupValues}
    ) as fixture(
      id, fact_id, path, rule, leaf_value, source_text, require_canonical_leaf
    )
    group by id
  ) as grouped
),
stable_fixtures as (
  select id, fragment
  from (values
      ${stableValues}
  ) as fixture(id, fragment)
),
fragment_value_bytes as (
  select jsonb_object_agg(
    id,
    octet_length(convert_to(
      pg_temp.template_copilot_v3_stable_json(fragment->'value'),
      'UTF8'
    ))
  ) as value
  from stable_fixtures
),
canonical_fragments as (
  select
    id,
    jsonb_build_object(
      'evidenceVersion', fragment->'evidenceVersion',
      'compilerVersion', fragment->'compilerVersion',
      'factId', fragment->'factId',
      'fragmentKind', fragment->'fragmentKind',
      'value', fragment->'value',
      'bindings', (
        select jsonb_agg(
          canonical_binding.value
          order by pg_temp.template_copilot_v3_stable_json(
            canonical_binding.value
          ) collate "C"
        )
        from (
          select jsonb_build_object(
            'path', binding.value->'path',
            'spanIds', (
              select jsonb_agg(to_jsonb(span_id.value) order by span_id.value collate "C")
              from jsonb_array_elements_text(binding.value->'spanIds') as span_id(value)
            ),
            'rule', binding.value->'rule'
          ) as value
          from jsonb_array_elements(fragment->'bindings') as binding(value)
        ) as canonical_binding
      ),
      'missingPaths', (
        select jsonb_agg(to_jsonb(path.value) order by path.value collate "C")
        from jsonb_array_elements_text(fragment->'missingPaths') as path(value)
      ),
      'confidence', fragment->'confidence',
      'ambiguity', fragment->'ambiguity',
      'ambiguityNote', coalesce(fragment->'ambiguityNote', 'null'::jsonb)
    ) as durable
  from stable_fixtures
),
stable_json_hashes as (
  select jsonb_object_agg(
    id,
    encode(
      sha256(convert_to(
        pg_temp.template_copilot_v3_stable_json(durable),
        'UTF8'
      )),
      'hex'
    )
  ) as value
  from canonical_fragments
),
delta_hashes as (
  select jsonb_object_agg(
    id,
    encode(
      sha256(convert_to(
        'v3frag|new:' ||
        coalesce((
          select string_agg(value, ',' order by value collate "C")
          from jsonb_array_elements_text(new_span_ids)
        ), '') ||
        '|known:' ||
        coalesce((
          select string_agg(value, ',' order by value collate "C")
          from jsonb_array_elements_text(known_span_ids)
        ), '') ||
        '|fragments:' ||
        coalesce((
          select string_agg(value, ',' order by value collate "C")
          from jsonb_array_elements_text(fragment_ids)
        ), ''),
        'UTF8'
      )),
      'hex'
    )
  ) as value
  from (values
      ${deltaValues}
  ) as fixture(id, new_span_ids, known_span_ids, fragment_ids)
),
payload_bytes as (
  select jsonb_object_agg(
    id,
    octet_length(convert_to(
      pg_temp.template_copilot_v3_stable_json(payload->'newSourceSpans'),
      'UTF8'
    )) +
    octet_length(convert_to(
      pg_temp.template_copilot_v3_stable_json(payload->'knownSpanIds'),
      'UTF8'
    )) +
    octet_length(convert_to(
      pg_temp.template_copilot_v3_stable_json(payload->'fragments'),
      'UTF8'
    ))
  ) as value
  from (values
      ${payloadValues}
  ) as fixture(id, payload)
),
helper_checks as (
  select jsonb_build_object(
    'canonicalLabel',
      pg_temp.template_copilot_v3_fragment_leaf_is_canonical(
        'request.fields', '/label', '"Amount"'::jsonb
      ),
    'compatibleBooleanRule',
      pg_temp.template_copilot_v3_binding_rule_is_compatible(
        'request.fields', '/required', 'true'::jsonb, 'boolean_lexical'
      ),
    'missingParticipantParentAllowed',
      pg_temp.template_copilot_v3_missing_path_is_allowed(
        'workflow.stages', '/participant'
      ),
    'participantParentContainsMode',
      pg_temp.template_copilot_v3_pointer_contains(
        '/participant', '/participant/mode'
      ),
    'nonWhitespace',
      pg_temp.template_copilot_v3_text_has_non_whitespace('合同'),
    'primitiveLeaves', (
      select jsonb_agg(to_jsonb(path) order by path collate "C")
      from pg_temp.template_copilot_v3_primitive_leaves(
        '{"participant":{"mode":"fixed_email"},"items":[]}'::jsonb, ''
      )
    ),
    'requiredStagePaths', (
      select jsonb_agg(to_jsonb(path) order by path collate "C")
      from pg_temp.template_copilot_v3_required_fragment_paths(
        'workflow.stages',
        '{"label":"Approval","kind":"approval","participant":{"mode":"fixed_email","value":"approver@example.test"},"sequence":1}'::jsonb
      ) as path
    ),
    'whitespaceOnly',
      pg_temp.template_copilot_v3_text_has_non_whitespace(
        E' \\t\\n' || U&'\\00A0\\3000'
      )
  ) as value
)
select jsonb_build_object(
  'serverVersionMajor', current_setting('server_version_num')::integer / 10000,
  'serverVersion', current_setting('server_version'),
  'serverEncoding', current_setting('server_encoding'),
  'spanId', (
    select encode(
      sha256(convert_to(
        octet_length(convert_to((span_fixture.value::jsonb->>'messageId'), 'UTF8'))::text || ':' ||
          (span_fixture.value::jsonb->>'messageId') || '|' ||
        octet_length(convert_to((span_fixture.value::jsonb->>'startCodePoint'), 'UTF8'))::text || ':' ||
          (span_fixture.value::jsonb->>'startCodePoint') || '|' ||
        octet_length(convert_to((span_fixture.value::jsonb->>'endCodePoint'), 'UTF8'))::text || ':' ||
          (span_fixture.value::jsonb->>'endCodePoint') || '|' ||
        octet_length(convert_to((span_fixture.value::jsonb->>'exactText'), 'UTF8'))::text || ':' ||
          (span_fixture.value::jsonb->>'exactText'),
        'UTF8'
      )),
      'hex'
    )
    from span_fixture
  ),
  'fragmentId', stable_json_hashes.value->>'pinned',
  'deltaHash', (
    select encode(
      sha256(convert_to(
        'v3frag|new:' ||
        coalesce((
          select string_agg(value, ',' order by value collate "C")
          from jsonb_array_elements_text(${pinnedNewSpans})
        ), '') ||
        '|known:' ||
        coalesce((
          select string_agg(value, ',' order by value collate "C")
          from jsonb_array_elements_text(${pinnedKnownSpans})
        ), '') ||
        '|fragments:' ||
        coalesce((
          select string_agg(value, ',' order by value collate "C")
          from jsonb_array_elements_text(${pinnedFragments})
        ), ''),
        'UTF8'
      )),
      'hex'
    )
  ),
  'boundedJson', bounded_json.value,
  'numericDomain', numeric_domain.value,
  'rootValueParity', root_value_parity.value,
  'semanticParity', semantic_parity.value,
  'spanGroupParity', span_group_parity.value,
  'stableJsonHashes', stable_json_hashes.value,
  'fragmentValueBytes', fragment_value_bytes.value,
  'deltaHashes', delta_hashes.value,
  'payloadBytes', payload_bytes.value,
  'helperChecks', helper_checks.value
)::text
from bounded_json
cross join numeric_domain
cross join root_value_parity
cross join semantic_parity
cross join span_group_parity
cross join fragment_value_bytes
cross join stable_json_hashes
cross join delta_hashes
cross join payload_bytes
cross join helper_checks;

rollback;
`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function sqlRawJsonNumber(value) {
  const raw = String(value);
  assert.match(
    raw,
    /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/,
    "Raw numeric parity tokens must be reviewed plain JSON numbers.",
  );
  return `${sqlText(raw)}::jsonb`;
}

async function verifyPinnedImage() {
  const result = await docker(["image", "inspect", imageRef]);
  const images = JSON.parse(result.stdout);
  assert.equal(images.length, 1);
  assert.equal(images[0].Id, imageId);
  assert.ok(images[0].RepoDigests?.includes(imageRef));
}

async function assertIsolatedRuntime() {
  const runtime = await inspectContainer();
  assert.equal(runtime.Name, `/${containerName}`);
  assert.equal(runtime.Image, imageId);
  assert.equal(runtime.HostConfig.NetworkMode, "none");
  assert.deepEqual(runtime.HostConfig.Binds ?? [], []);
  assert.deepEqual(runtime.HostConfig.PortBindings ?? {}, {});
  assert.equal(
    runtime.Config.Labels?.["approval.workflow.test"],
    "template-copilot-v3-evidence-parity",
  );
  assert.equal(
    runtime.Config.Labels?.["approval.workflow.test.run"],
    containerName,
  );
  assert.equal(
    runtime.Mounts.some((mount) => mount.Type === "bind" || mount.Type === "volume"),
    false,
  );
  const dataTmpfs =
    runtime.HostConfig.Tmpfs?.["/var/lib/postgresql/data"] ?? "";
  assert.match(dataTmpfs, /(?:^|,)rw(?:,|$)/);
  assert.match(dataTmpfs, /(?:^|,)nosuid(?:,|$)/);
  assert.match(dataTmpfs, /(?:^|,)nodev(?:,|$)/);
  assert.match(dataTmpfs, /(?:^|,)size=(?:512m|536870912)(?:,|$)/);
}

async function waitUntilHealthy() {
  const deadline = Date.now() + 90_000;
  let lastState = "";
  while (Date.now() < deadline) {
    const runtime = await inspectContainer();
    lastState = `${runtime.State.Status}|${runtime.State.Health?.Status ?? ""}`;
    if (
      runtime.State.Status === "running" &&
      runtime.State.Health?.Status === "healthy"
    ) {
      return;
    }
    if (runtime.State.Status === "exited" || runtime.State.Status === "dead") {
      const logs = await docker(["logs", "--tail", "120", containerId], {
        allowFailure: true,
      });
      throw new Error(
        `Disposable PostgreSQL exited (${lastState}).\n${logs.stderr}${logs.stdout}`,
      );
    }
    await delay(250);
  }
  const logs = await docker(["logs", "--tail", "120", containerId], {
    allowFailure: true,
  });
  throw new Error(
    `Disposable PostgreSQL did not become healthy (${lastState}).\n${logs.stderr}${logs.stdout}`,
  );
}

async function inspectContainer() {
  const result = await docker(["container", "inspect", containerId]);
  const containers = JSON.parse(result.stdout);
  assert.equal(containers.length, 1);
  assert.equal(containers[0].Id, containerId);
  return containers[0];
}

async function psql(input) {
  return docker(
    [
      "exec",
      "-i",
      containerId,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input },
  );
}

function cleanup() {
  cleanupPromise ??= (async () => {
    if (!containerId) return;
    const inspected = await docker(["container", "inspect", containerId], {
      allowFailure: true,
    });
    if (inspected.code !== 0) return;
    const [runtime] = JSON.parse(inspected.stdout);
    assert.equal(runtime.Id, containerId);
    assert.equal(runtime.Name, `/${containerName}`);
    assert.equal(
      runtime.Config.Labels?.["approval.workflow.test"],
      "template-copilot-v3-evidence-parity",
    );
    assert.equal(
      runtime.Config.Labels?.["approval.workflow.test.run"],
      containerName,
    );
    await docker(["rm", "--force", containerId]);
    containerId = "";
  })();
  return cleanupPromise;
}

async function assertCleanupComplete() {
  const inspect = await docker(["container", "inspect", containerName], {
    allowFailure: true,
  });
  assert.notEqual(inspect.code, 0, "Disposable container still exists by name.");
  const labeled = await docker(
    ["ps", "-aq", "--filter", `label=${runLabel}`],
    { allowFailure: true },
  );
  assert.equal(labeled.code, 0);
  assert.equal(labeled.stdout.trim(), "", "Disposable labeled container remains.");
}

async function docker(args, { input, allowFailure = false } = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(input);
  });
  if (!allowFailure && result.code !== 0) {
    throw new Error(
      `Disposable Docker command failed with ${
        result.signal ? `signal ${result.signal}` : `exit code ${result.code}`
      }.\n${result.stderr}${result.stdout}`,
    );
  }
  return result;
}
