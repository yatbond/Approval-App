import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("workflow box details do not expose the technical blocking toggle", () => {
  const source = readFileSync("src/app/workflow-view.tsx", "utf8");

  assert.equal(source.includes(">Blocking<"), false);
  assert.equal(source.includes("selectedGraphNode.blocking"), false);
  assert.equal(source.includes("updateSelectedNode({ blocking:"), false);
});
