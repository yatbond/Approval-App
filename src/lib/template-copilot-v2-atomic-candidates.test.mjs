import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv from "ajv";
import { z } from "zod";
import {
  adaptTemplateCopilotV2AtomicProviderCandidates,
  templateCopilotV2AtomicProviderOutputSchema,
  templateCopilotV2AtomicProviderVariants,
} from "./template-copilot-v2-atomic-candidates.ts";

const advisory = {
  confidence: "high",
  ambiguity: "none",
};

function atom(atomType, factId, value, sourceQuote, evidence) {
  return {
    atomType,
    factId,
    value,
    sourceQuote,
    evidence,
    ...advisory,
  };
}

test("atomic provider schema exposes independent typed units with bounded source passages", () => {
  const schema = z.toJSONSchema(templateCopilotV2AtomicProviderOutputSchema, {
    target: "draft-07",
  });
  const variants = schema.properties.atoms.items.oneOf;
  assert.equal(templateCopilotV2AtomicProviderVariants.length, 18);
  assert.equal(variants.length, 18);
  assert.deepEqual(
    new Set(
      variants.map((variant) => variant.properties.atomType.const),
    ).size,
    18,
  );
  assert.ok(
    variants.every(
      (variant) =>
        variant.properties.factId &&
        variant.properties.value &&
        variant.properties.sourceQuote &&
        variant.properties.evidence,
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(schema),
    /"messageId"|"startCodePoint"|"normalizationRule"|"originalWording"/,
  );
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const valid = {
    atoms: [
      atom(
        "attachment_requirement",
        "attachments.requirements",
        { label: "Invoice", required: true, formats: ["pdf"] },
        "Invoice is required as PDF",
        { label: "Invoice", required: "required", formats: ["PDF"] },
      ),
    ],
  };
  assert.equal(
    templateCopilotV2AtomicProviderOutputSchema.safeParse(valid).success,
    true,
  );
  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.equal(
    validate({
      atoms: [
        {
          ...valid.atoms[0],
          factId: "workflow.name",
        },
      ],
    }),
    false,
    JSON.stringify(validate.errors),
  );
});

test("one untraceable atom does not discard valid atoms for other facts", () => {
  const message =
    "Call it Purchase Approval. Invoice is required as PDF. Receipt is optional.";
  const result = adaptTemplateCopilotV2AtomicProviderCandidates({
    message,
    messageId: "atomic-local-rejection",
    output: {
      atoms: [
        atom(
          "text_fact",
          "workflow.name",
          "Purchase Approval",
          "Call it Purchase Approval",
          "Purchase Approval",
        ),
        atom(
          "attachment_requirement",
          "attachments.requirements",
          { label: "Invoice", required: true, formats: ["pdf"] },
          "Invoice is required as PDF",
          { label: "Invoice", required: "required", formats: ["PDF"] },
        ),
        atom(
          "attachment_requirement",
          "attachments.requirements",
          { label: "Receipt", required: true, formats: [] },
          "Receipt is optional",
          { label: "Receipt", required: "optional", formats: [] },
        ),
      ],
    },
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.factId),
    ["attachments.requirements", "workflow.name"],
  );
  assert.deepEqual(
    result.candidates.find(
      (candidate) => candidate.factId === "attachments.requirements",
    ).value,
    [{ label: "Invoice", required: true, formats: ["pdf"] }],
  );
  assert.deepEqual(result.rejected, [
    {
      code: "untraceable",
      detail: "attachments.requirements:normalization",
    },
  ]);
});

test("section authority rejects out-of-section atoms while preserving allowed facts", () => {
  const message =
    "Call it Purchase Approval. Invoice is required as PDF.";
  const result = adaptTemplateCopilotV2AtomicProviderCandidates({
    message,
    messageId: "atomic-section-authority",
    allowedFactIds: ["attachments.requirements"],
    output: {
      atoms: [
        atom(
          "text_fact",
          "workflow.name",
          "Purchase Approval",
          "Call it Purchase Approval",
          "Purchase Approval",
        ),
        atom(
          "attachment_requirement",
          "attachments.requirements",
          { label: "Invoice", required: true, formats: ["pdf"] },
          "Invoice is required as PDF",
          { label: "Invoice", required: "required", formats: ["PDF"] },
        ),
      ],
    },
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.factId),
    ["attachments.requirements"],
  );
  assert.deepEqual(result.rejected, [
    { code: "untraceable", detail: "workflow.name:out_of_section" },
  ]);
});

test("repeated common wording is safely resolved inside unique atomic passages", () => {
  const message =
    "Invoice is required as PDF. Quotation is required as image.";
  const result = adaptTemplateCopilotV2AtomicProviderCandidates({
    message,
    messageId: "atomic-repeated-wording",
    output: {
      atoms: [
        atom(
          "attachment_requirement",
          "attachments.requirements",
          { label: "Invoice", required: true, formats: ["pdf"] },
          "Invoice is required as PDF",
          { label: "Invoice", required: "required", formats: ["PDF"] },
        ),
        atom(
          "attachment_requirement",
          "attachments.requirements",
          { label: "Quotation", required: true, formats: ["image"] },
          "Quotation is required as image",
          {
            label: "Quotation",
            required: "required",
            formats: ["image"],
          },
        ),
      ],
    },
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].value, [
    { label: "Invoice", required: true, formats: ["pdf"] },
    { label: "Quotation", required: true, formats: ["image"] },
  ]);
  assert.deepEqual(
    result.candidates[0].evidence.map((item) => item.path),
    [
      "/0/formats/0",
      "/0/label",
      "/0/required",
      "/1/formats/0",
      "/1/label",
      "/1/required",
    ],
  );
});

test("atomic evidence normalization is equivalent in Traditional and Simplified Chinese", () => {
  const cases = [
    {
      message: "發票必須是 PDF。財務階段是審批，由目錄職位財務經理處理，第一。",
      attachment: "發票必須是 PDF",
      invoice: "發票",
      required: "必須",
      stage: "財務階段是審批，由目錄職位財務經理處理，第一",
      label: "財務階段",
      kind: "審批",
      mode: "目錄職位",
      participant: "財務經理",
      sequence: "第一",
    },
    {
      message: "发票必须是 PDF。财务阶段是审批，由目录职位财务经理处理，第一。",
      attachment: "发票必须是 PDF",
      invoice: "发票",
      required: "必须",
      stage: "财务阶段是审批，由目录职位财务经理处理，第一",
      label: "财务阶段",
      kind: "审批",
      mode: "目录职位",
      participant: "财务经理",
      sequence: "第一",
    },
  ];
  for (const [index, item] of cases.entries()) {
    const result = adaptTemplateCopilotV2AtomicProviderCandidates({
      message: item.message,
      messageId: `atomic-chinese-${index}`,
      output: {
        atoms: [
          atom(
            "attachment_requirement",
            "attachments.requirements",
            { label: item.invoice, required: true, formats: ["pdf"] },
            item.attachment,
            {
              label: item.invoice,
              required: item.required,
              formats: ["PDF"],
            },
          ),
          atom(
            "workflow_stage",
            "workflow.stages",
            {
              label: item.label,
              kind: "approval",
              participant: {
                mode: "directory_position",
                value: item.participant,
              },
              sequence: 1,
            },
            item.stage,
            {
              label: item.label,
              kind: item.kind,
              participant: {
                mode: item.mode,
                value: item.participant,
              },
              sequence: item.sequence,
            },
          ),
        ],
      },
    });
    assert.equal(result.rejected.length, 0, item.message);
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.factId),
      ["attachments.requirements", "workflow.stages"],
    );
  }
});

test("independent policy, timing, and initiator atoms assemble into strict fact candidates", () => {
  const message =
    "Any employee may request. Finish within 48 hours. Escalate late work to the workflow owner. Finance only. Keep an audit trail.";
  const result = adaptTemplateCopilotV2AtomicProviderCandidates({
    message,
    messageId: "atomic-assembly",
    output: {
      atoms: [
        atom(
          "initiator_mode",
          "request.initiator_policy",
          "any_employee",
          "Any employee may request",
          "Any employee",
        ),
        atom(
          "initiator_description",
          "request.initiator_policy",
          "may request",
          "Any employee may request",
          "may request",
        ),
        atom(
          "default_due_hours",
          "timing.rules",
          48,
          "Finish within 48 hours",
          "48 hours",
        ),
        atom(
          "escalation_description",
          "timing.rules",
          "Escalate late work",
          "Escalate late work to the workflow owner",
          "Escalate late work",
        ),
        atom(
          "escalation_rule",
          "timing.rules",
          "workflow owner",
          "Escalate late work to the workflow owner",
          "workflow owner",
        ),
        atom(
          "policy_description",
          "workflow.scope",
          "Finance only",
          "Finance only",
          "Finance only",
        ),
        atom(
          "policy_rule",
          "workflow.scope",
          "Keep an audit trail",
          "Keep an audit trail",
          "Keep an audit trail",
        ),
      ],
    },
  });
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(
    Object.fromEntries(
      result.candidates.map((candidate) => [
        candidate.factId,
        candidate.value,
      ]),
    ),
    {
      "request.initiator_policy": {
        mode: "any_employee",
        description: "may request",
      },
      "timing.rules": {
        defaultDueHours: 48,
        escalation: {
          description: "Escalate late work",
          rules: ["workflow owner"],
        },
      },
      "workflow.scope": {
        description: "Finance only",
        rules: ["Keep an audit trail"],
      },
    },
  );
});

test("incomplete atoms fail one fact without fabricating missing components", () => {
  const result = adaptTemplateCopilotV2AtomicProviderCandidates({
    message: "Directory role may request. Purchase Approval.",
    messageId: "atomic-incomplete",
    output: {
      atoms: [
        atom(
          "initiator_mode",
          "request.initiator_policy",
          "directory_role",
          "Directory role may request",
          "Directory role",
        ),
        atom(
          "text_fact",
          "workflow.name",
          "Purchase Approval",
          "Purchase Approval",
          "Purchase Approval",
        ),
      ],
    },
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.factId),
    ["workflow.name"],
  );
  assert.deepEqual(result.rejected, [
    {
      code: "untraceable",
      detail: "request.initiator_policy:atomic_incomplete",
    },
  ]);
});

test("a canonically invalid assembled atom is rejected locally", () => {
  const result = adaptTemplateCopilotV2AtomicProviderCandidates({
    message:
      "Purchase Approval. Finance review needs approval by a fixed email first.",
    messageId: "atomic-canonical-local",
    output: {
      atoms: [
        atom(
          "text_fact",
          "workflow.name",
          "Purchase Approval",
          "Purchase Approval",
          "Purchase Approval",
        ),
        atom(
          "workflow_stage",
          "workflow.stages",
          {
            label: "Finance review",
            kind: "approval",
            participant: { mode: "fixed_email" },
            sequence: 1,
          },
          "Finance review needs approval by a fixed email first",
          {
            label: "Finance review",
            kind: "approval",
            participant: { mode: "fixed email" },
            sequence: "first",
          },
        ),
      ],
    },
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.factId),
    ["workflow.name"],
  );
  assert.deepEqual(result.rejected, [
    {
      code: "untraceable",
      detail: "workflow.stages:atomic_value_invalid",
    },
  ]);
});

test("production extraction uses atomic schema v2 rather than whole-fact provider candidates", async () => {
  const source = await readFile(
    new URL("./template-copilot-ai.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /templateCopilotV2AtomicProviderOutputSchema/);
  assert.match(source, /adaptTemplateCopilotV2AtomicProviderCandidates/);
  assert.match(source, /schemaName: "template_copilot_v2_atomic_provider_output"/);
  assert.doesNotMatch(
    source.slice(source.indexOf("export async function extractTemplateCopilotV2Candidates")),
    /templateCopilotV2ProviderCandidateOutputSchema|adaptTemplateCopilotV2ProviderCandidates/,
  );
});
