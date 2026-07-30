import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { templateCopilotV2DescribeResponseDisposition } from "./template-copilot-v2-describe-response.ts";

test("persisted Guided fallback is a visible successful Describe response", () => {
  const result = { outcome: "guided_fallback", revision: 7, ledger: { schemaVersion: 2 }, messages: [{ role: "user" }, { role: "assistant" }], modeState: { mode: "guided" } };
  const response = templateCopilotV2DescribeResponseDisposition(result);
  assert.equal(response.status, 200);
  assert.equal(response.body, result, "the persisted fallback ledger and transcript must not be stripped at the API boundary");
  assert.equal(templateCopilotV2DescribeResponseDisposition({ ...result, outcome: "replayed" }), null, "normal replay remains an ordinary 200 RPC response");
});

test("pending and malformed Describe commands have deliberate retry-safe HTTP mappings", () => {
  const pending = templateCopilotV2DescribeResponseDisposition({ outcome: "pending", revision: 4, status: "interviewing", ledger: { schemaVersion: 2 }, sourceMessageId: "modecmd:source" });
  assert.equal(pending.status, 409);
  assert.equal(pending.body.error.code, "describe_pending");
  assert.deepEqual(pending.body.ledger, { schemaVersion: 2 });
  assert.equal(templateCopilotV2DescribeResponseDisposition({ outcome: "invalid_command" }).status, 400);
  const limit = templateCopilotV2DescribeResponseDisposition({ outcome: "document_limit" });
  assert.equal(limit.status, 422);
  assert.equal(limit.body.error.code, "too_many_documents");
});

test("Describe and document endpoints apply the terminal mapping before generic RPC errors", async () => {
  const routes = [
    "../app/api/template-authoring/copilot/sessions/[sessionId]/describe/route.ts",
    "../app/api/template-authoring/copilot/sessions/[sessionId]/documents/route.ts",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(route, import.meta.url), "utf8");
    const mapping = source.indexOf("templateCopilotV2DescribeResponseDisposition(result)");
    const generic = source.indexOf("templateAuthoringRpcResponse({ cookieSource, correlationId, result })");
    assert.ok(mapping >= 0 && generic > mapping, `${route} must expose a durable fallback/retry state instead of mapping it to dependency_unavailable`);
  }
});

test("Describe route byte bound admits every 80,000-code-point UTF-8 narrative", async () => {
  const source = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/describe/route.ts", import.meta.url), "utf8");
  assert.match(source, /readBoundedJson\(request,\s*512 \* 1024\)/u);
});
