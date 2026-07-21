import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedFormData, readBoundedJson } from "./bounded-request.ts";

test("bounded JSON rejects declared and chunked oversized bodies", async () => {
  const declared = new Request("https://example.test", {
    method: "POST", headers: { "content-length": "100" }, body: "{}",
  });
  assert.deepEqual(await readBoundedJson(declared, 10), { ok: false, reason: "too_large" });

  const chunked = new Request("https://example.test", {
    method: "POST",
    body: new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"'));
      controller.enqueue(new TextEncoder().encode('1234567890"}'));
      controller.close();
    } }),
    duplex: "half",
  });
  assert.deepEqual(await readBoundedJson(chunked, 12), { ok: false, reason: "too_large" });
});

test("bounded multipart parsing preserves valid fields", async () => {
  const data = new FormData();
  data.set("documentId", "invoice");
  data.set("file", new File(["proof"], "proof.txt", { type: "text/plain" }));
  const source = new Request("https://example.test", { method: "POST", body: data });
  const parsed = await readBoundedFormData(source, 10_000);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.get("documentId"), "invoice");
  assert.equal(await parsed.value.get("file").text(), "proof");
});
