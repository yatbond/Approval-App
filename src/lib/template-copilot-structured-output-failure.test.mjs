import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { z } from "zod";
import { classifyTemplateCopilotStructuredDecodeFailure } from "./template-copilot-structured-output-failure.ts";

test("Responses JSON and Zod parse failures retain recoverable classifications", () => {
  assert.deepEqual(
    classifyTemplateCopilotStructuredDecodeFailure(
      new SyntaxError("Unexpected token"),
    ),
    { reasonCode: "invalid_json", issuePaths: [] },
  );
  const parsed = z.object({ atoms: z.array(z.string()) }).safeParse({
    atoms: [1],
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.deepEqual(
    classifyTemplateCopilotStructuredDecodeFailure(parsed.error),
    { reasonCode: "schema_validation", issuePaths: ["atoms.0"] },
  );
});

test("transport and API failures remain non-recoverable provider failures", () => {
  assert.equal(
    classifyTemplateCopilotStructuredDecodeFailure(
      Object.assign(new Error("rate limited"), { status: 429 }),
    ),
    null,
  );
  assert.equal(
    classifyTemplateCopilotStructuredDecodeFailure(
      Object.assign(new Error("timeout"), { name: "AbortError" }),
    ),
    null,
  );
});

test("the Responses request catch maps SDK decode errors before bounded transport failures", async () => {
  const source = await readFile(
    new URL("./template-copilot-ai.ts", import.meta.url),
    "utf8",
  );
  const catchBody = source.slice(
    source.indexOf("  } catch (error) {", source.indexOf("async function requestStructuredOutput")),
    source.indexOf("\n}\n\nexport async function extractTemplateCopilotTurn"),
  );
  assert.match(catchBody, /classifyTemplateCopilotStructuredDecodeFailure/);
  assert.match(
    catchBody,
    /classifyTemplateCopilotProviderFailureReasonCode\(error\)/,
  );
  assert.ok(
    catchBody.indexOf("classifyTemplateCopilotStructuredDecodeFailure") <
      catchBody.lastIndexOf(
        "classifyTemplateCopilotProviderFailureReasonCode(error)",
      ),
  );
});
