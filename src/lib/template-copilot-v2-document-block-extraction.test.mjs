import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  runTemplateCopilotV2DocumentBlockExtraction,
  templateCopilotV2DocumentBlockConcurrency,
  templateCopilotV2DocumentMaximumAtoms,
} from "./template-copilot-v2-document-block-extraction.ts";
import {
  adaptTemplateCopilotV2AtomicProviderCandidates,
} from "./template-copilot-v2-atomic-candidates.ts";

function blocks(count) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    text: `Block ${index}`,
    startCodePoint: index * 10,
    endCodePoint: index * 10 + 7,
    startCodeUnit: index * 10,
    endCodeUnit: index * 10 + 7,
  }));
}

test("document blocks retain successful outputs in source order", async () => {
  const result = await runTemplateCopilotV2DocumentBlockExtraction({
    blocks: blocks(4),
    request: async (block) => {
      if (block.index === 1) throw new Error("one block failed");
      await new Promise((resolve) => setTimeout(resolve, 4 - block.index));
      return { atoms: [{ block: block.index }] };
    },
  });
  assert.deepEqual(
    result.output.atoms.map((atom) => atom.block),
    [0, 2, 3],
  );
  assert.deepEqual(result.output.sourceScopes, [
    { startCodeUnit: 0, endCodeUnit: 7 },
    { startCodeUnit: 20, endCodeUnit: 27 },
    { startCodeUnit: 30, endCodeUnit: 37 },
  ]);
  assert.deepEqual(result.summary, {
    attemptedBlockCount: 4,
    completedBlockCount: 3,
    failedBlockCount: 1,
    retainedAtomCount: 3,
    truncatedAtomCount: 0,
  });
});

test("document extraction has bounded concurrency and atom retention", async () => {
  let active = 0;
  let maximumActive = 0;
  const result = await runTemplateCopilotV2DocumentBlockExtraction({
    blocks: blocks(8),
    request: async (block) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return {
        atoms: Array.from({ length: 10 }, (_, index) => ({
          block: block.index,
          index,
        })),
      };
    },
  });
  assert.equal(maximumActive, templateCopilotV2DocumentBlockConcurrency);
  assert.equal(result.output.atoms.length, templateCopilotV2DocumentMaximumAtoms);
  assert.equal(result.summary.truncatedAtomCount, 16);
});

test("fair atom retention prevents one early block from erasing later blocks", async () => {
  const result = await runTemplateCopilotV2DocumentBlockExtraction({
    blocks: blocks(2),
    request: async (block) => ({
      atoms:
        block.index === 0
          ? Array.from({ length: 80 }, (_, index) => ({
              block: block.index,
              index,
            }))
          : [{ block: block.index, index: 0, validLaterAtom: true }],
    }),
  });
  assert.equal(result.output.atoms.length, 64);
  assert.ok(
    result.output.atoms.some((atom) => atom.validLaterAtom === true),
  );
  assert.equal(result.summary.truncatedAtomCount, 17);
});

test("invalid early atoms cannot erase a valid later-block candidate", async () => {
  const message =
    "Untrusted extraction noise.\nThe workflow name is Purchase approval.";
  const secondStart = message.indexOf("The workflow");
  const sourceBlocks = [
    {
      index: 0,
      text: message.slice(0, secondStart),
      startCodePoint: 0,
      endCodePoint: secondStart,
      startCodeUnit: 0,
      endCodeUnit: secondStart,
    },
    {
      index: 1,
      text: message.slice(secondStart),
      startCodePoint: secondStart,
      endCodePoint: message.length,
      startCodeUnit: secondStart,
      endCodeUnit: message.length,
    },
  ];
  const advisory = { confidence: "high", ambiguity: "none" };
  const extracted = await runTemplateCopilotV2DocumentBlockExtraction({
    blocks: sourceBlocks,
    request: async (block) => ({
      atoms:
        block.index === 0
          ? Array.from({ length: 80 }, (_, index) => ({
              atomType: "text_fact",
              factId: "workflow.name",
              value: `Fabricated ${index}`,
              sourceQuote: `missing-${index}`,
              evidence: `Fabricated ${index}`,
              ...advisory,
            }))
          : [{
              atomType: "text_fact",
              factId: "workflow.name",
              value: "Purchase approval",
              sourceQuote: "Purchase approval",
              evidence: "Purchase approval",
              ...advisory,
            }],
    }),
  });
  const normalized = adaptTemplateCopilotV2AtomicProviderCandidates({
    output: { atoms: extracted.output.atoms },
    sourceScopes: extracted.output.sourceScopes,
    message,
    messageId: "document-fair-retention",
    allowedFactIds: ["workflow.name"],
  });
  assert.equal(normalized.candidates.length, 1);
  assert.equal(normalized.candidates[0].value, "Purchase approval");
});

test("all failed document blocks preserve the first provider failure", async () => {
  const first = Object.assign(new Error("first"), {
    reasonCode: "schema_validation",
  });
  await assert.rejects(
    runTemplateCopilotV2DocumentBlockExtraction({
      blocks: blocks(3),
      request: async (block) => {
        throw block.index === 0 ? first : new Error(`failure ${block.index}`);
      },
    }),
    (error) => error === first,
  );
});

test("production document extraction uses safe blocks and persists bounded summaries", async () => {
  const [ai, route, describe, documentation] = await Promise.all([
    readFile(new URL("./template-copilot-ai.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/api/template-authoring/copilot/sessions/[sessionId]/documents/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("./template-copilot-v2-describe-command.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../docs/template-authoring/phase-2-template-copilot.md",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(ai, /runTemplateCopilotV2DocumentBlockExtraction/);
  assert.match(ai, /createTemplateCopilotRequirementDocumentBlocks/);
  assert.match(route, /documentQuarantine: safe\.quarantine/);
  assert.match(describe, /documentBlockExtraction: extracted\.documentBlocks/);
  assert.match(describe, /documentQuarantine: input\.documentQuarantine/);
  assert.match(documentation, /at most eight source-ordered/);
  assert.match(
    documentation,
    /At most three\s+provider calls run\s+concurrently/,
  );
  assert.match(documentation, /never stores quarantined text/);
});
