import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWorkflowEditorTab,
  workflowEditorTabs,
} from "./workflow-editor-tabs-state.ts";

test("puts Template Builder before Canvas in the workflow editor tabs", () => {
  assert.deepEqual(
    workflowEditorTabs.map((tab) => tab.id),
    ["builder", "canvas", "library"],
  );
});

test("opens Template Builder first when entering workflow editing", () => {
  assert.equal(defaultWorkflowEditorTab, "builder");
});

test("keeps publishing as a canvas action instead of an editor tab", () => {
  assert.equal(
    workflowEditorTabs.some((tab) => tab.label === "Publish"),
    false,
  );
});
