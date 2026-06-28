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

test("sample recognition supports training multiple fields from one upload", () => {
  const source = readFileSync("src/app/template-document-recognition-panel.tsx", "utf8");

  assert.equal(source.includes("Saved sample fields"), true);
  assert.equal(source.includes("No sample fields saved yet."), true);
  assert.equal(source.includes("Save and next field"), true);
  assert.equal(source.includes("selectNextUnsavedField"), true);
});

test("sample recognition can AI recognize the selected field before saving", () => {
  const source = readFileSync("src/app/template-document-recognition-panel.tsx", "utf8");

  assert.equal(source.includes("AI Recognize"), true);
  assert.equal(source.includes("recognizeSampleField"), true);
  assert.equal(source.includes("setSampleFile(file)"), true);
  assert.equal(source.includes("setSamplePageImages(pageImages)"), true);
  assert.equal(
    source.includes(
      "Recognize the selected field from the uploaded sample using the current instruction.",
    ),
    true,
  );
});

test("sample recognition actions fit inside the narrow workflow side panel", () => {
  const source = readFileSync("src/app/template-document-recognition-panel.tsx", "utf8");

  assert.equal(source.includes("sm:grid-cols-3"), false);
  assert.equal(source.includes("min-h-9"), true);
  assert.equal(source.includes("whitespace-normal"), true);
  assert.equal(source.includes("leading-tight"), true);
});
