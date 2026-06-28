import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("workflow box details do not expose the technical blocking toggle", () => {
  const source = readFileSync("src/app/workflow-view.tsx", "utf8");

  assert.equal(source.includes(">Blocking<"), false);
  assert.equal(source.includes("selectedGraphNode.blocking"), false);
  assert.equal(source.includes("updateSelectedNode({ blocking:"), false);
});

test("submit workflow box controls explain submitter and shared upload behavior", () => {
  const source = readFileSync("src/app/workflow-view.tsx", "utf8");

  assert.equal(
    source.includes(
      "The person or team required to complete this submit box's documents or form fields.",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "Lets this submitter see and fulfill other submit boxes' upload requirements.",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "Shared uploads must be accepted by the assigned submitter or current reviewer before they count.",
    ),
    true,
  );
});
