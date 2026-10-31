import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "libpg-query";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260730062000_fix_template_copilot_v2_reviewed_library_specials_and_documents.sql",
    import.meta.url,
  ),
  "utf8",
);

test("reviewed v2 library pins retain special decisions and the immutable dependency graph", async () => {
  await parse(migration);
  assert.match(
    migration,
    /p_library_version = any\(array\[''v2\.0'',''v2\.1'',''v2\.2''\]\)/i,
  );
  assert.match(
    migration,
    /ledger_library_version IS DISTINCT FROM session_library_version/i,
  );
  assert.match(migration, /template_copilot_v2_dependency_graph_drift/i);
});

test("document candidate finalization validates provenance before one-revision atomic retention", async () => {
  await parse(migration);
  assert.match(
    migration,
    /document_candidate_provenance/i,
  );
  assert.match(
    migration,
    /candidate_ledger := jsonb_set\(p_ledger,''\{requirementDocumentExtracts\}''/i,
  );
  assert.match(
    migration,
    /jsonb_set\(result,''\{ledger,requirementDocumentExtracts\}''/i,
  );
  assert.doesNotMatch(
    migration,
    /update public\.template_copilot_v2_operation_receipts set response=result/i,
  );
  assert.match(
    migration,
    /where id=p_session_id and owner_id=p_actor_id/i,
  );
  assert.match(
    migration,
    /template_copilot_v2_document_session_finalize_missing/i,
  );
  assert.match(
    migration,
    /template_copilot_v2_document_ordinal_drift/i,
  );
  assert.match(
    migration,
    /->\(\(n-1\)::integer\)/i,
  );
});
