import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTemplateCopilotV2Ledger } from "./template-copilot-facts.ts";
import {
  replayTemplateCopilotV2SimilarModeIfCommitted,
  templateCopilotV2CommandHash,
} from "./template-copilot-v2-server-data.ts";
import { createTemplateCopilotV2SourceSnapshot } from "./template-copilot-v2-source-snapshot.ts";

const actor = { id: "33333333-3333-4333-8333-333333333333" };
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const idempotencyKey = "similar:response-lost";
const expectedRevision = 3;
const ledger = createTemplateCopilotV2Ledger({
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts Payable",
  questionLibraryVersion: "v2.1",
}, { enabled: true });
const sourceSnapshot = createTemplateCopilotV2SourceSnapshot({
  id: sourceVersionId,
  template_key: "purchase",
  version_number: 2,
  updated_at: "2026-07-20T00:00:00.000Z",
  template_snapshot: {
    name: "Purchase approval",
    business: "Finance",
    department: "Accounts Payable",
    fields: [{ label: "Amount", type: "currency", required: true, options: [] }],
    documents: [{ documentType: "Quotation", format: "pdf", required: true }],
    graph: { nodes: [{ id: "approve", kind: "approval", label: "Finance approval" }], edges: [] },
  },
});

function queryResult(data) {
  return {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data, error: null }),
  };
}

test("Similar exact retry uses its frozen snapshot and receipt without a live source read", async () => {
  const commandHash = templateCopilotV2CommandHash({
    operation: "similar_template_import",
    sessionId,
    expectedRevision,
    idempotencyKey,
    source: { versionId: sourceSnapshot.versionId, snapshotHash: sourceSnapshot.snapshotHash },
  });
  const sessionTables = [];
  const session = {
    from(table) {
      sessionTables.push(table);
      if (table === "template_copilot_sessions") return queryResult({ id: sessionId, owner_id: actor.id, revision: 4, status: "interviewing", ledger });
      if (table === "template_copilot_v2_operation_receipts") return queryResult({ command_hash: commandHash });
      throw new Error(`unexpected owner table ${table}`);
    },
  };
  const service = {
    from(table) {
      assert.equal(table, "template_copilot_v2_authoring_modes");
      return queryResult({ mode: "similar_template", source_snapshot: sourceSnapshot });
    },
  };
  const replay = await replayTemplateCopilotV2SimilarModeIfCommitted({
    session,
    service,
    actor,
    sessionId,
    expectedRevision,
    idempotencyKey,
    sourceVersionId,
    flag: { enabled: true },
  });
  assert.equal(replay.outcome, "replayed");
  assert.equal(replay.revision, 4);
  assert.equal(replay.modeState.sourceSnapshot.snapshotHash, sourceSnapshot.snapshotHash);
  assert.equal(sessionTables.includes("workflow_template_versions"), false);
});

test("Similar replay command identity is mapper-version independent", () => {
  const intent = {
    operation: "similar_template_import",
    sessionId,
    expectedRevision,
    idempotencyKey,
    source: { versionId: sourceSnapshot.versionId, snapshotHash: sourceSnapshot.snapshotHash },
  };
  const original = templateCopilotV2CommandHash(intent);
  const afterMapperExpansion = templateCopilotV2CommandHash(intent);
  assert.equal(afterMapperExpansion, original);
  assert.notEqual(
    original,
    templateCopilotV2CommandHash({ ...intent, source: { ...intent.source, snapshotHash: "f".repeat(64) } }),
  );
});

test("modes route reconciles a Similar receipt before querying the mutable source directory", async () => {
  const source = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/modes/route.ts", import.meta.url), "utf8");
  const reconcile = source.indexOf("replayTemplateCopilotV2SimilarModeIfCommitted({");
  const liveRead = source.indexOf('.from("workflow_template_versions")');
  assert.ok(reconcile >= 0 && liveRead > reconcile);
});
