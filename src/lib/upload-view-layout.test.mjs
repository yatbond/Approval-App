import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("request upload panel puts workflow template before draft recovery", () => {
  const source = readFileSync(new URL("../app/upload-view.tsx", import.meta.url), "utf8");

  assert.ok(
    source.indexOf("Workflow template") < source.indexOf("<UploadDraftPanel"),
    "Workflow template selector should render before the draft recovery panel",
  );
});
