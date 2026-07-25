import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWorkflowEditorTab,
  workflowEditorTabs,
} from "./workflow-editor-tabs-state.ts";

test("puts Builder before Canvas in the workflow editor tabs", () => {
  assert.deepEqual(
    workflowEditorTabs.map((tab) => tab.id),
    ["builder", "canvas", "library"],
  );
});

test("opens Builder first when entering workflow editing", () => {
  assert.equal(defaultWorkflowEditorTab, "builder");
});

test("keeps publishing as a canvas action instead of an editor tab", () => {
  assert.equal(
    workflowEditorTabs.some((tab) => tab.label === "Publish"),
    false,
  );
});

test("marks Canvas as unavailable on mobile screens", () => {
  const canvasTab = workflowEditorTabs.find((tab) => tab.id === "canvas");

  assert.equal(canvasTab?.mobileDisabled, true);
});
