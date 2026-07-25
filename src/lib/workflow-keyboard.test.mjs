import assert from "node:assert/strict";
import { test } from "node:test";
import {
  shouldHandleCanvasDeleteKey,
  shouldHandleCanvasRedoKey,
  shouldHandleCanvasUndoKey,
} from "./workflow-keyboard.ts";

test("handles delete shortcuts when a canvas item is selected", () => {
  assert.equal(
    shouldHandleCanvasDeleteKey({
      key: "Delete",
      hasSelection: true,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    true,
  );
  assert.equal(
    shouldHandleCanvasDeleteKey({
      key: "Backspace",
      hasSelection: true,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    true,
  );
});

test("ignores delete shortcuts while editing form fields", () => {
  for (const targetTagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    assert.equal(
      shouldHandleCanvasDeleteKey({
        key: "Delete",
        hasSelection: true,
        targetTagName,
        isContentEditable: false,
      }),
      false,
    );
  }

  assert.equal(
    shouldHandleCanvasDeleteKey({
      key: "Delete",
      hasSelection: true,
      targetTagName: "DIV",
      isContentEditable: true,
    }),
    false,
  );
});

test("ignores non-delete keys and empty canvas selection", () => {
  assert.equal(
    shouldHandleCanvasDeleteKey({
      key: "Enter",
      hasSelection: true,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    false,
  );
  assert.equal(
    shouldHandleCanvasDeleteKey({
      key: "Delete",
      hasSelection: false,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    false,
  );
});

test("handles undo shortcuts when workflow history exists", () => {
  assert.equal(
    shouldHandleCanvasUndoKey({
      key: "z",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      hasUndoHistory: true,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    true,
  );
  assert.equal(
    shouldHandleCanvasUndoKey({
      key: "Z",
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      hasUndoHistory: true,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    true,
  );
});

test("ignores undo shortcuts without history or while editing text", () => {
  assert.equal(
    shouldHandleCanvasUndoKey({
      key: "z",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      hasUndoHistory: false,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    false,
  );

  for (const targetTagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    assert.equal(
      shouldHandleCanvasUndoKey({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        hasUndoHistory: true,
        targetTagName,
        isContentEditable: false,
      }),
      false,
    );
  }

  assert.equal(
    shouldHandleCanvasUndoKey({
      key: "z",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      hasUndoHistory: true,
      targetTagName: "DIV",
      isContentEditable: true,
    }),
    false,
  );
});

test("handles redo shortcuts when workflow future history exists", () => {
  assert.equal(
    shouldHandleCanvasRedoKey({
      key: "z",
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      hasRedoHistory: true,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    true,
  );
  assert.equal(
    shouldHandleCanvasRedoKey({
      key: "y",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      hasRedoHistory: true,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    true,
  );
});

test("ignores redo shortcuts without history or while editing text", () => {
  assert.equal(
    shouldHandleCanvasRedoKey({
      key: "z",
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      hasRedoHistory: false,
      targetTagName: "DIV",
      isContentEditable: false,
    }),
    false,
  );
  assert.equal(
    shouldHandleCanvasRedoKey({
      key: "y",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      hasRedoHistory: true,
      targetTagName: "INPUT",
      isContentEditable: false,
    }),
    false,
  );
});
