import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runTemplateCopilotV2FocusedRecovery } from "./template-copilot-v2-focused-recovery.ts";

const facts = ["workflow.conditions", "workflow.rejection_policy"];

test("a valid primary result makes one call and does not enter recovery", async () => {
  const calls = [];
  const result = await runTemplateCopilotV2FocusedRecovery({
    section: "conditions_exceptions",
    allowedFactIds: facts,
    isRecoverableFailure: () => true,
    request: async (input) => {
      calls.push(input);
      return { atoms: [{ factId: "workflow.conditions" }] };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].phase, "primary");
  assert.equal(result.recovery, null);
  assert.equal(result.outputs.length, 1);
  assert.deepEqual(result.outputs[0].allowedFactIds, facts);
});

test("a malformed section response recovers each fact independently", async () => {
  const calls = [];
  const result = await runTemplateCopilotV2FocusedRecovery({
    section: "conditions_exceptions",
    allowedFactIds: facts,
    isRecoverableFailure: (error) => error?.reasonCode === "schema_validation",
    request: async (input) => {
      calls.push(input);
      if (input.phase === "primary") {
        throw Object.assign(new Error("invalid"), {
          reasonCode: "schema_validation",
        });
      }
      if (input.allowedFactIds[0] === "workflow.rejection_policy") {
        throw new Error("one focused call still failed");
      }
      return { atoms: [{ factId: input.allowedFactIds[0] }] };
    },
  });
  assert.deepEqual(
    calls.map((call) => [call.phase, [...call.allowedFactIds]]),
    [
      ["primary", facts],
      ["focused_recovery", ["workflow.conditions"]],
      ["focused_recovery", ["workflow.rejection_policy"]],
    ],
  );
  assert.deepEqual(result.recovery, {
    attemptedFactCount: 2,
    completedFactCount: 1,
    failedFactCount: 1,
  });
  assert.deepEqual(result.outputs, [
    {
      output: { atoms: [{ factId: "workflow.conditions" }] },
      allowedFactIds: ["workflow.conditions"],
    },
  ]);
});

test("recovery never multiplies outages or broad all/document calls", async () => {
  for (const [section, reasonCode] of [
    ["conditions_exceptions", "provider_error"],
    ["all", "schema_validation"],
    ["document", "schema_validation"],
  ]) {
    const original = Object.assign(new Error(`${section}:${reasonCode}`), {
      reasonCode,
    });
    let calls = 0;
    await assert.rejects(
      runTemplateCopilotV2FocusedRecovery({
        section,
        allowedFactIds: facts,
        isRecoverableFailure: (error) =>
          error?.reasonCode === "schema_validation",
        request: async () => {
          calls += 1;
          throw original;
        },
      }),
      (error) => error === original,
    );
    assert.equal(calls, 1);
  }
});

test("all failed focused calls rethrow the original bounded failure", async () => {
  const original = Object.assign(new Error("primary"), {
    reasonCode: "invalid_json",
  });
  let calls = 0;
  await assert.rejects(
    runTemplateCopilotV2FocusedRecovery({
      section: "identity_scope",
      allowedFactIds: [
        "workflow.name",
        "workflow.purpose",
        "workflow.scope",
      ],
      isRecoverableFailure: (error) => error?.reasonCode === "invalid_json",
      request: async ({ phase }) => {
        calls += 1;
        if (phase === "primary") throw original;
        throw new Error("focused");
      },
    }),
    (error) => error === original,
  );
  assert.equal(calls, 4);
});

test("production extraction uses bounded focused recovery and persists only counts", async () => {
  const [ai, describe] = await Promise.all([
    readFile(new URL("./template-copilot-ai.ts", import.meta.url), "utf8"),
    readFile(
      new URL("./template-copilot-v2-describe-command.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(ai, /runTemplateCopilotV2FocusedRecovery/);
  assert.match(ai, /isRecoverableTemplateCopilotV2StructuredFailure/);
  assert.match(ai, /phase === "focused_recovery"/);
  assert.match(describe, /focusedRecovery: extracted\.recovery/);
});
