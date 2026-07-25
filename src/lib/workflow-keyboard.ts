type CanvasDeleteKeyInput = {
  key: string;
  hasSelection: boolean;
  targetTagName?: string;
  isContentEditable?: boolean;
};

type CanvasUndoKeyInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  hasUndoHistory: boolean;
  targetTagName?: string;
  isContentEditable?: boolean;
};

type CanvasRedoKeyInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  hasRedoHistory: boolean;
  targetTagName?: string;
  isContentEditable?: boolean;
};

const textEditingTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTextEditingTarget(targetTagName?: string, isContentEditable?: boolean) {
  return Boolean(isContentEditable) || textEditingTags.has(targetTagName || "");
}

export function shouldHandleCanvasDeleteKey({
  key,
  hasSelection,
  targetTagName,
  isContentEditable,
}: CanvasDeleteKeyInput) {
  if (!hasSelection || (key !== "Delete" && key !== "Backspace")) {
    return false;
  }

  if (isTextEditingTarget(targetTagName, isContentEditable)) {
    return false;
  }

  return true;
}

export function shouldHandleCanvasUndoKey({
  key,
  ctrlKey,
  metaKey,
  shiftKey,
  hasUndoHistory,
  targetTagName,
  isContentEditable,
}: CanvasUndoKeyInput) {
  if (!hasUndoHistory || shiftKey || !(ctrlKey || metaKey)) {
    return false;
  }

  if (key.toLowerCase() !== "z") {
    return false;
  }

  return !isTextEditingTarget(targetTagName, isContentEditable);
}

export function shouldHandleCanvasRedoKey({
  key,
  ctrlKey,
  metaKey,
  shiftKey,
  hasRedoHistory,
  targetTagName,
  isContentEditable,
}: CanvasRedoKeyInput) {
  if (!hasRedoHistory || !(ctrlKey || metaKey)) {
    return false;
  }

  const normalizedKey = key.toLowerCase();
  const isRedoKey = (normalizedKey === "z" && shiftKey) || normalizedKey === "y";
  if (!isRedoKey) {
    return false;
  }

  return !isTextEditingTarget(targetTagName, isContentEditable);
}
