import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("upload draft API preserves current versus named draft kind", () => {
  const source = readFileSync(
    new URL("../app/api/upload-drafts/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /draftKind:\s*parsedDraft\.draftKind/,
    "POST should rebuild saved drafts with the parsed draft kind",
  );
});
