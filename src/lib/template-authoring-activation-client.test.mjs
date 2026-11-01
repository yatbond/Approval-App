import assert from "node:assert/strict";
import test from "node:test";
import { activateTemplateAuthoringVersionClient } from "./template-authoring-client.ts";

const response = (versionId, versionNumber) => ({
  ok: true,
  status: 200,
  json: async () => ({
    outcome: "applied",
    familyId: "11111111-1111-4111-8111-111111111111",
    publishedVersionId: versionId,
    versionNumber,
    active: true,
  }),
});

test("simultaneous activation clicks share one request and one audit command", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const versionId = "22222222-2222-4222-8222-222222222222";
  let resolveRequest;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    await new Promise((resolve) => {
      resolveRequest = resolve;
    });
    return response(versionId, 7);
  };
  const first = activateTemplateAuthoringVersionClient({
    publishedVersionId: versionId,
    expectedVersionNumber: 7,
  });
  const second = activateTemplateAuthoringVersionClient({
    publishedVersionId: versionId,
    expectedVersionNumber: 7,
  });
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  resolveRequest();
  await Promise.all([first, second]);
});

test("an ambiguous network retry reuses the original idempotency key", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const versionId = "33333333-3333-4333-8333-333333333333";
  const requests = [];
  let call = 0;
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    call += 1;
    if (call === 1) throw new Error("connection lost after send");
    return response(versionId, 8);
  };
  await assert.rejects(
    activateTemplateAuthoringVersionClient({
      publishedVersionId: versionId,
      expectedVersionNumber: 8,
    }),
    /connection lost after send/,
  );
  await activateTemplateAuthoringVersionClient({
    publishedVersionId: versionId,
    expectedVersionNumber: 8,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
});
