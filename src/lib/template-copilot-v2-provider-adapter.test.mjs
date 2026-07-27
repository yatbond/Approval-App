import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv from "ajv";
import { z } from "zod";
import {
  adaptTemplateCopilotV2ProviderCandidates,
  normalizeTemplateCopilotV2Candidates,
  templateCopilotV2ProviderCandidateOutputSchema,
  templateCopilotV2ProviderCandidateVariants,
} from "./template-copilot-v2-candidates.ts";

function candidate({ factId = "workflow.name", valueType = "text", value, evidence }) {
  return { factId, valueType, value, evidence, confidence: "high", ambiguity: "none" };
}

test("provider evidence tree derives Unicode offsets and durable wording without model coordinates", () => {
  const message = "😀 Purchase Approval";
  const result = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ value: "Purchase Approval", evidence: "Purchase Approval" })] }, message, messageId: "m1" });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].originalWording, "Purchase Approval");
  assert.deepEqual(result.candidates[0].evidence, [{ path: "/", messageId: "m1", startCodePoint: 2, endCodePoint: 19, exactText: "Purchase Approval" }]);
});

test("provider evidence coordinates remain valid for a bounded Describe source near 80k code points", () => {
  const prefix = "x".repeat(79_981);
  const message = `${prefix} Purchase Approval`;
  const result = adaptTemplateCopilotV2ProviderCandidates({
    output: { candidates: [candidate({ value: "Purchase Approval", evidence: "Purchase Approval" })] },
    message,
    messageId: "describe:near-bound",
  });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].evidence, [{
    path: "/", messageId: "describe:near-bound", startCodePoint: 79_982,
    endCodePoint: 79_999, exactText: "Purchase Approval",
  }]);
});

test("provider evidence tree accepts natural initiator, attachment, English, Traditional Chinese, and Simplified Chinese examples", () => {
  const initiatorMessage = "Any employee may request it";
  const initiator = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ factId: "request.initiator_policy", valueType: "initiator_policy", value: { mode: "any_employee", description: "may request it" }, evidence: { mode: "Any employee", description: "may request it" } })] }, message: initiatorMessage, messageId: "m1" });
  assert.equal(initiator.candidates.length, 1);
  const attachmentMessage = "Invoice is required PDF";
  const attachment = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ factId: "attachments.requirements", valueType: "attachments", value: [{ label: "Invoice", required: true, formats: ["pdf"] }], evidence: [{ label: "Invoice", required: "required", formats: ["PDF"] }] })] }, message: attachmentMessage, messageId: "m1" });
  assert.equal(attachment.candidates.length, 1);
  const cases = [
    { message: "Finance stage approval directory position Finance Manager first", label: "Finance stage", kind: "approval", mode: "directory position", participant: "Finance Manager", sequence: "first" },
    { message: "財務階段 審批 目錄職位 財務經理 第一", label: "財務階段", kind: "審批", mode: "目錄職位", participant: "財務經理", sequence: "第一" },
    { message: "财务阶段 审批 目录职位 财务经理 第一", label: "财务阶段", kind: "审批", mode: "目录职位", participant: "财务经理", sequence: "第一" },
  ];
  for (const entry of cases) {
    const output = { candidates: [candidate({ factId: "workflow.stages", valueType: "stages", value: [{ label: entry.label, kind: "approval", participant: { mode: "directory_position", value: entry.participant }, sequence: 1 }], evidence: [{ label: entry.label, kind: entry.kind, participant: { mode: entry.mode, value: entry.participant }, sequence: entry.sequence }] })] };
    assert.equal(adaptTemplateCopilotV2ProviderCandidates({ output, message: entry.message, messageId: "m1" }).candidates.length, 1, entry.message);
  }
});

test("mixed English, Traditional Chinese, and Simplified Chinese evidence remains exact and canonical", () => {
  const message = "流程叫 Supplier Payment，员工必须附上 invoice PDF。";
  const result = adaptTemplateCopilotV2ProviderCandidates({
    output: {
      candidates: [
        candidate({ factId: "workflow.name", valueType: "text", value: "Supplier Payment", evidence: "Supplier Payment" }),
        candidate({
          factId: "attachments.requirements",
          valueType: "attachments",
          value: [{ label: "invoice", required: true, formats: ["pdf"] }],
          evidence: [{ label: "invoice", required: "必须", formats: ["PDF"] }],
        }),
      ],
    },
    message,
    messageId: "mixed-scripts",
  });
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(result.candidates.map((item) => item.factId), ["attachments.requirements", "workflow.name"]);
  const attachment = result.candidates.find((item) => item.factId === "attachments.requirements");
  assert.deepEqual(attachment.value, [{ label: "invoice", required: true, formats: ["pdf"] }]);
  assert.deepEqual(attachment.evidence.map((item) => item.exactText).sort(), ["PDF", "invoice", "必须"].sort());
  for (const item of result.candidates.flatMap((candidateItem) => candidateItem.evidence)) {
    assert.equal(Array.from(message).slice(item.startCodePoint, item.endCodePoint).join(""), item.exactText);
  }
});

test("provider adapter preserves source order while using fact-aware attachment and policy equality", () => {
  const formatsMessage = "Invoice is required as PDF and image.";
  const formats = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ factId: "attachments.requirements", valueType: "attachments", value: [{ label: "Invoice", required: true, formats: ["pdf", "image"] }], evidence: [{ label: "Invoice", required: "required", formats: ["PDF", "image"] }] })] }, message: formatsMessage, messageId: "m1" });
  assert.equal(formats.candidates.length, 1);
  assert.deepEqual(formats.candidates[0].value, [{ label: "Invoice", required: true, formats: ["pdf", "image"] }]);
  assert.deepEqual(formats.candidates[0].evidence.map((item) => item.path), ["/0/formats/0", "/0/formats/1", "/0/label", "/0/required"]);

  const reverseMessage = "Zebra receipt is required PDF. Alpha invoice is required image.";
  const reverse = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ factId: "attachments.requirements", valueType: "attachments", value: [{ label: "Zebra receipt", required: true, formats: ["pdf"] }, { label: "Alpha invoice", required: true, formats: ["image"] }], evidence: [{ label: "Zebra receipt", required: "required", formats: ["PDF"] }, { label: "Alpha invoice", required: "required", formats: ["image"] }] })] }, message: reverseMessage, messageId: "m1" });
  assert.equal(reverse.candidates.length, 1);
  assert.deepEqual(reverse.candidates[0].value.map((item) => item.label), ["Zebra receipt", "Alpha invoice"]);

  const policiesMessage = "Policy B and Policy A apply.";
  const policies = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ factId: "governance.policies", valueType: "policy", value: ["Policy B", "Policy A"], evidence: ["Policy B", "Policy A"] })] }, message: policiesMessage, messageId: "m1" });
  assert.equal(policies.candidates.length, 1);
  assert.deepEqual(policies.candidates[0].value, ["Policy B", "Policy A"]);
});

test("semantic dedupe uses a separate fact-aware key without rewriting either value/evidence pairing", () => {
  const firstAttachment = {
    factId: "attachments.requirements",
    valueType: "attachments",
    value: [{ label: "Invoice", required: true, formats: ["pdf", "image"] }],
    originalWording: "Invoice required PDF image",
    evidence: [
      { path: "/0/label", messageId: "m1", startCodePoint: 0, endCodePoint: 7, exactText: "Invoice" },
      { path: "/0/required", messageId: "m1", startCodePoint: 8, endCodePoint: 16, exactText: "required", normalizationRule: "named_attachment_is_required" },
      { path: "/0/formats/0", messageId: "m1", startCodePoint: 17, endCodePoint: 20, exactText: "PDF", normalizationRule: "enum_lexical" },
      { path: "/0/formats/1", messageId: "m1", startCodePoint: 21, endCodePoint: 26, exactText: "image" },
    ],
    confidence: "high",
    ambiguity: "none",
  };
  const secondAttachment = {
    ...firstAttachment,
    value: [{ label: "Invoice", required: true, formats: ["image", "pdf"] }],
    originalWording: "Invoice required image PDF",
    evidence: [
      { path: "/0/label", messageId: "m2", startCodePoint: 0, endCodePoint: 7, exactText: "Invoice" },
      { path: "/0/required", messageId: "m2", startCodePoint: 8, endCodePoint: 16, exactText: "required", normalizationRule: "named_attachment_is_required" },
      { path: "/0/formats/0", messageId: "m2", startCodePoint: 17, endCodePoint: 22, exactText: "image" },
      { path: "/0/formats/1", messageId: "m2", startCodePoint: 23, endCodePoint: 26, exactText: "PDF", normalizationRule: "enum_lexical" },
    ],
  };
  const firstPolicies = {
    factId: "governance.policies",
    valueType: "policy",
    value: ["Policy B", "Policy A"],
    originalWording: "Policy B Policy A",
    evidence: [
      { path: "/0", messageId: "m3", startCodePoint: 0, endCodePoint: 8, exactText: "Policy B" },
      { path: "/1", messageId: "m3", startCodePoint: 9, endCodePoint: 17, exactText: "Policy A" },
    ],
    confidence: "high",
    ambiguity: "none",
  };
  const secondPolicies = {
    ...firstPolicies,
    value: ["policy a", "POLICY B"],
    originalWording: "policy a POLICY B",
    evidence: [
      { path: "/0", messageId: "m4", startCodePoint: 0, endCodePoint: 8, exactText: "policy a" },
      { path: "/1", messageId: "m4", startCodePoint: 9, endCodePoint: 17, exactText: "POLICY B" },
    ],
  };
  const result = normalizeTemplateCopilotV2Candidates({
    output: { candidates: [secondPolicies, secondAttachment, firstPolicies, firstAttachment] },
    messages: {
      m1: "Invoice required PDF image",
      m2: "Invoice required image PDF",
      m3: "Policy B Policy A",
      m4: "policy a POLICY B",
    },
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.find((item) => item.factId === "attachments.requirements").value[0].formats, ["pdf", "image"]);
  const policyCandidate = result.candidates.find((item) => item.factId === "governance.policies");
  const policySource = policyCandidate.evidence[0].messageId;
  assert.deepEqual(
    policyCandidate.value,
    policySource === "m3" ? ["Policy B", "Policy A"] : ["policy a", "POLICY B"],
    "semantic equality may pick either deterministic source, but it must never rewrite that source's paired value",
  );
});

test("evidence-tree shape rejects old model paths, repeated ambiguity, and zero invention", () => {
  const oldPaths = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ value: "Purchase Approval", evidence: [{ path: "/documents/policies", exactText: "Purchase Approval" }] })] }, message: "Purchase Approval", messageId: "m1" });
  assert.equal(oldPaths.candidates.length, 0); assert.equal(oldPaths.rejected[0].code, "model_schema_invalid");
  const repeated = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ value: "Approval", evidence: "Approval" })] }, message: "Approval Approval", messageId: "m1" });
  assert.equal(repeated.candidates.length, 0);
  const invented = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [candidate({ value: "Invented Approval", evidence: "Purchase Approval" })] }, message: "Purchase Approval", messageId: "m1" });
  assert.equal(invented.candidates.length, 0);
});

test("a candidate-local evidence-tree failure preserves valid candidates and is stable across provider order", () => {
  const message = "Purchase Approval. any employee can submit. Invoice is required PDF.";
  const name = candidate({ value: "Purchase Approval", evidence: "Purchase Approval" });
  const badInitiator = candidate({ factId: "request.initiator_policy", valueType: "initiator_policy", value: { mode: "any_employee", description: "any employee can submit" }, evidence: { mode: "any employee", description: "any employee can submit" } });
  const attachment = candidate({ factId: "attachments.requirements", valueType: "attachments", value: [{ label: "Invoice", required: true, formats: ["pdf"] }], evidence: [{ label: "Invoice", required: "required", formats: ["PDF"] }] });
  const first = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [name, badInitiator, attachment] }, message, messageId: "m1" });
  const reordered = adaptTemplateCopilotV2ProviderCandidates({ output: { candidates: [attachment, name, badInitiator] }, message, messageId: "m1" });
  assert.deepEqual(first, reordered);
  assert.deepEqual(first.candidates.map((item) => item.factId), ["attachments.requirements", "workflow.name"]);
  assert.deepEqual(first.rejected, [{ code: "overlapping_span", detail: "request.initiator_policy:m1" }]);
});

test("provider JSON Schema visibly exposes per-fact mirrored evidence trees with no path or coordinate fields", async () => {
  const schema = z.toJSONSchema(templateCopilotV2ProviderCandidateOutputSchema, { target: "draft-07" });
  const variants = schema.properties.candidates.items.oneOf;
  assert.equal(templateCopilotV2ProviderCandidateVariants.length, 16); assert.equal(variants.length, 16);
  const initiator = variants.find((variant) => variant.properties.factId.const === "request.initiator_policy");
  assert.deepEqual(Object.keys(initiator.properties.evidence.properties).sort(), ["description", "mode"]);
  assert.doesNotMatch(JSON.stringify(schema), /"path"|"messageId"|"startCodePoint"|"normalizationRule"/);
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate({ candidates: [candidate({ factId: "request.initiator_policy", valueType: "initiator_policy", value: { mode: "any_employee", description: "may request it" }, evidence: { mode: "Any employee", description: "may request it" } })] }), true, JSON.stringify(validate.errors));
  assert.equal(validate({ candidates: [candidate({ value: "Purchase Approval", evidence: [{ path: "/", exactText: "Purchase Approval" }] })] }), false, JSON.stringify(validate.errors));
  const ai = await readFile(new URL("./template-copilot-ai.ts", import.meta.url), "utf8");
  assert.match(ai, /evidence: \{mode:'Any employee', description:'may request it'\}/);
});
