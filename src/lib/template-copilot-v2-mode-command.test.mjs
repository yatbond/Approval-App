import assert from "node:assert/strict";
import test from "node:test";
import {
  createTemplateCopilotV2PendingModeCommand,
  nextTemplateCopilotV2PendingModeCommand,
  parseTemplateCopilotV2PendingModeCommand,
  templateCopilotDocumentIdentity,
  templateCopilotV2PendingModeCommandRequest,
  templateCopilotV2PendingModeCommandFailureDisposition,
} from "./template-copilot-v2-mode-command.ts";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("mode commands survive serialization and preserve the exact retry body", () => {
  const first = createTemplateCopilotV2PendingModeCommand({
    sessionId,
    expectedRevision: 7,
    idempotencyKey: "mode:12345678",
    operation: { kind: "switch_mode", mode: "similar_template", sourceVersionId },
  });
  const restored = parseTemplateCopilotV2PendingModeCommand(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(restored, first);
  assert.deepEqual(templateCopilotV2PendingModeCommandRequest(restored), {
    path: "modes",
    body: {
      expectedRevision: 7,
      idempotencyKey: "mode:12345678",
      mode: "similar_template",
      sourceVersionId,
    },
  });
});

test("broad descriptions retain all 80,000 Unicode code points on replay", () => {
  const message = `${"採".repeat(79_999)}😀`;
  const command = createTemplateCopilotV2PendingModeCommand({
    sessionId,
    expectedRevision: 4,
    idempotencyKey: "describe:12345678",
    operation: { kind: "describe", mode: "describe_everything", message },
  });
  const restored = parseTemplateCopilotV2PendingModeCommand(JSON.parse(JSON.stringify(command)));
  assert.equal(restored?.operation.kind, "describe");
  assert.equal(restored?.operation.kind === "describe" ? [...restored.operation.message].length : 0, 80_000);
  assert.deepEqual(templateCopilotV2PendingModeCommandRequest(restored).body, {
    expectedRevision: 4,
    idempotencyKey: "describe:12345678",
    message,
    mode: "describe_everything",
  });
});

test("the same intent reuses its key while a different two-tab intent is blocked", () => {
  const pending = createTemplateCopilotV2PendingModeCommand({
    sessionId,
    expectedRevision: 2,
    idempotencyKey: "describe:existing",
    operation: { kind: "describe", mode: "similar_template", message: "Keep finance approval; change the limit to HKD 50,000." },
  });
  const same = nextTemplateCopilotV2PendingModeCommand({
    pending,
    requested: {
      sessionId,
      expectedRevision: 2,
      idempotencyKey: "describe:discarded",
      operation: { kind: "describe", mode: "similar_template", message: "Keep finance approval; change the limit to HKD 50,000." },
    },
  });
  assert.equal(same, pending);
  assert.throws(
    () => nextTemplateCopilotV2PendingModeCommand({
      pending,
      requested: {
        sessionId,
        expectedRevision: 2,
        idempotencyKey: "mode:different",
        operation: { kind: "switch_mode", mode: "guided" },
      },
    }),
    /previous Copilot mode action/u,
  );
});

test("invalid mode/source combinations and oversized descriptions are rejected", () => {
  assert.equal(parseTemplateCopilotV2PendingModeCommand({
    schemaVersion: 1,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: "mode:12345678",
    operation: { kind: "switch_mode", mode: "guided", sourceVersionId },
  }), null);
  assert.equal(parseTemplateCopilotV2PendingModeCommand({
    schemaVersion: 1,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: "describe:12345678",
    operation: { kind: "describe", mode: "describe_everything", message: "😀".repeat(80_001) },
  }), null);
});

test("document retries persist only bounded identity metadata and reuse the exact command key", () => {
  const pending = createTemplateCopilotV2PendingModeCommand({
    sessionId,
    expectedRevision: 9,
    idempotencyKey: "document:12345678",
    operation: {
      kind: "document",
      fileName: "採購要求.pdf",
      size: 123_456,
      sha256: "a".repeat(64),
    },
  });
  const restored = parseTemplateCopilotV2PendingModeCommand(JSON.parse(JSON.stringify(pending)));
  assert.deepEqual(restored, pending);
  assert.deepEqual(templateCopilotV2PendingModeCommandRequest(restored), {
    path: "documents",
    body: { expectedRevision: 9, idempotencyKey: "document:12345678" },
  });
  assert.equal(JSON.stringify(restored).includes("file bytes"), false);
});

test("requirements file identity is content-derived, CJK-safe, and stable after reselection", async () => {
  const first = mockFile("供應商審批要求.md", "# 採購\n超過港幣 50,000 元需要財務審批。");
  const reselected = mockFile("供應商審批要求.md", "# 採購\n超過港幣 50,000 元需要財務審批。");
  const changed = mockFile("供應商審批要求.md", "# 採購\n超過港幣 80,000 元需要財務審批。");
  const [firstIdentity, reselectedIdentity, changedIdentity] = await Promise.all([
    templateCopilotDocumentIdentity(first),
    templateCopilotDocumentIdentity(reselected),
    templateCopilotDocumentIdentity(changed),
  ]);
  assert.deepEqual(reselectedIdentity, firstIdentity);
  assert.notEqual(changedIdentity.sha256, firstIdentity.sha256);
  assert.match(firstIdentity.sha256, /^[0-9a-f]{64}$/u);
});

test("an interrupted document command accepts only the exact same file identity", async () => {
  const exact = await templateCopilotDocumentIdentity(mockFile("requirements.txt", "same bytes"));
  const changed = await templateCopilotDocumentIdentity(mockFile("requirements.txt", "other text"));
  const pending = createTemplateCopilotV2PendingModeCommand({
    sessionId,
    expectedRevision: 12,
    idempotencyKey: "document:existing",
    operation: { kind: "document", ...exact },
  });
  const replay = nextTemplateCopilotV2PendingModeCommand({
    pending,
    requested: {
      sessionId,
      expectedRevision: 12,
      idempotencyKey: "document:discarded",
      operation: { kind: "document", ...exact },
    },
  });
  assert.equal(replay.idempotencyKey, "document:existing");
  assert.throws(
    () => nextTemplateCopilotV2PendingModeCommand({
      pending,
      requested: {
        sessionId,
        expectedRevision: 12,
        idempotencyKey: "document:different",
        operation: { kind: "document", ...changed },
      },
    }),
    /exact same requirements file/u,
  );
});

test("document identity rejects empty, oversized, and overlong metadata before hashing", async () => {
  await assert.rejects(() => templateCopilotDocumentIdentity(mockFile("", "content")), /named requirements file/u);
  await assert.rejects(
    () => templateCopilotDocumentIdentity({
      name: "large.pdf",
      size: (5 * 1024 * 1024) + 1,
      async arrayBuffer() { throw new Error("must not read"); },
    }),
    /no larger than 5 MB/u,
  );
  await assert.rejects(() => templateCopilotDocumentIdentity(mockFile("名".repeat(256), "content")), /named requirements file/u);
});

test("mode-command recovery retains only ambiguous failures and reloads stale two-tab state", () => {
  assert.equal(templateCopilotV2PendingModeCommandFailureDisposition(409, "describe_pending"), "retain");
  assert.equal(templateCopilotV2PendingModeCommandFailureDisposition(503, "dependency_unavailable"), "retain");
  assert.equal(templateCopilotV2PendingModeCommandFailureDisposition(null, null), "retain");
  assert.equal(templateCopilotV2PendingModeCommandFailureDisposition(409, "stale_revision"), "reload");
  for (const [status, code] of [
    [400, "invalid_command"],
    [409, "idempotency_conflict"],
    [413, "invalid_request"],
    [415, "unsafe_requirement_document"],
    [422, "too_many_documents"],
  ]) {
    assert.equal(templateCopilotV2PendingModeCommandFailureDisposition(status, code), "clear", `${status}/${code}`);
  }
});

function mockFile(name, content) {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}
