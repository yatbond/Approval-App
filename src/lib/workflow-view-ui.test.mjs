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

test("workflow box details do not show a redundant connect button", () => {
  const source = readFileSync("src/app/workflow-view.tsx", "utf8");

  assert.equal(
    source.includes("Start drawing a connection from this box to another box on the canvas."),
    false,
  );
  assert.equal(source.includes("setConnectFromNodeId(selectedGraphNode.id)"), false);
  assert.equal(source.includes("Click target box"), false);
});

test("sample recognition trains existing fields with a large box selector", () => {
  const source = readFileSync("src/app/template-document-recognition-panel.tsx", "utf8");

  assert.equal(source.includes("Field to train"), true);
  assert.equal(source.includes("+ New field"), true);
  assert.equal(source.includes("Large extraction selector"), true);
  assert.equal(source.includes("Use this large view to zoom, pan, and draw the sample box."), true);
  assert.equal(source.includes("location hint, not an exact rule"), true);
  assert.equal(source.includes("Field, e.g. Invoice total"), false);
});
