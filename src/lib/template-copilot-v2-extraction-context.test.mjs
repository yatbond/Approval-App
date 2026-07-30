import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  templateCopilotV2ExtractionContext,
  templateCopilotV2ExtractionLocales,
  templateCopilotV2ExtractionSections,
  templateCopilotV2FactAllowedInExtractionContext,
} from "./template-copilot-v2-extraction-context.ts";
import { templateCopilotV2AtomicProviderOutputSchemaForFacts } from "./template-copilot-v2-atomic-candidates.ts";
import { z } from "zod";

test("nine qualification sections map to exact non-overlapping fact coverage", () => {
  const sections = templateCopilotV2ExtractionSections.filter(
    (section) => section !== "all" && section !== "document",
  );
  assert.equal(sections.length, 9);
  const facts = sections.flatMap(
    (section) =>
      templateCopilotV2ExtractionContext({ section }).allowedFactIds,
  );
  assert.equal(facts.length, 16);
  assert.equal(new Set(facts).size, 16);
});

test("locale changes extraction guidance but never canonical fact authority", () => {
  const contexts = templateCopilotV2ExtractionLocales.map((locale) =>
    templateCopilotV2ExtractionContext({
      locale,
      section: "attachments",
    }),
  );
  assert.deepEqual(
    contexts.map((context) => context.allowedFactIds),
    [
      ["attachments.requirements"],
      ["attachments.requirements"],
      ["attachments.requirements"],
    ],
  );
  assert.match(contexts[0].developerInstruction, /English \(en\)/);
  assert.match(
    contexts[1].developerInstruction,
    /Traditional Chinese \(zh-Hant\)/,
  );
  assert.match(
    contexts[2].developerInstruction,
    /Simplified Chinese \(zh-Hans\)/,
  );
  assert.ok(
    contexts.every((context) =>
      context.developerInstruction.includes(
        "Do not translate, rewrite, or convert",
      ),
    ),
  );
});

test("all and document contexts retain all facts while focused sections fail closed", () => {
  const all = templateCopilotV2ExtractionContext({ section: "all" });
  const document = templateCopilotV2ExtractionContext({
    locale: "zh-Hant",
    section: "document",
  });
  assert.equal(all.allowedFactIds.length, 16);
  assert.deepEqual(document.allowedFactIds, all.allowedFactIds);
  const attachments = templateCopilotV2ExtractionContext({
    section: "attachments",
  });
  assert.equal(
    templateCopilotV2FactAllowedInExtractionContext(
      attachments,
      "attachments.requirements",
    ),
    true,
  );
  assert.equal(
    templateCopilotV2FactAllowedInExtractionContext(
      attachments,
      "workflow.name",
    ),
    false,
  );
});

test("focused context narrows the provider-visible atomic union", () => {
  const attachments = templateCopilotV2ExtractionContext({
    section: "attachments",
  });
  const schema = z.toJSONSchema(
    templateCopilotV2AtomicProviderOutputSchemaForFacts(
      attachments.allowedFactIds,
    ),
    { target: "draft-07" },
  );
  const variants = schema.properties.atoms.items.oneOf;
  assert.equal(variants.length, 1);
  assert.equal(
    variants[0].properties.atomType.const,
    "attachment_requirement",
  );
  assert.equal(
    variants[0].properties.factId.const,
    "attachments.requirements",
  );
});

test("production Describe and qualification calls carry locale and section context", async () => {
  const [ai, describe, describeRoute, documentRoute, qualification] = await Promise.all([
    readFile(new URL("./template-copilot-ai.ts", import.meta.url), "utf8"),
    readFile(
      new URL("./template-copilot-v2-describe-command.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/template-authoring/copilot/sessions/[sessionId]/describe/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/template-authoring/copilot/sessions/[sessionId]/documents/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../scripts/test-template-copilot-qualification.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(ai, /extractionContext\.developerInstruction/);
  assert.match(ai, /templateCopilotV2AtomicProviderOutputSchemaForFacts/);
  assert.match(ai, /allowedFactIds: extractionContext\.allowedFactIds/);
  assert.match(describe, /locale: prepared\.ledger\.locale/);
  assert.match(describe, /section: input\.sectionHint/);
  assert.match(describeRoute, /sectionHint: templateCopilotV2ExtractionSectionSchema/);
  assert.match(describeRoute, /sectionHint: parsed\.data\.sectionHint/);
  assert.match(documentRoute, /sectionHint: "document"/);
  assert.match(qualification, /sectionHint: sectionId/);
});
