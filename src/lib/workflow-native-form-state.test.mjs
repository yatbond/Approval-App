import assert from "node:assert/strict";
import test from "node:test";
import {
  getNativeFormFieldPlaceholder,
  isNativeFormChoiceField,
  nativeFormFieldTypeOptions,
  parseNativeFormOptions,
  toggleNativeFormCheckboxOption,
} from "./workflow-native-form-state.ts";

test("offers practical native request field types", () => {
  assert.deepEqual(
    nativeFormFieldTypeOptions.map((option) => option.value),
    [
      "text",
      "long_text",
      "number",
      "currency",
      "date",
      "email",
      "select",
      "radio",
      "checkbox",
    ],
  );
});

test("normalizes form choices from lines or commas", () => {
  assert.deepEqual(
    parseNativeFormOptions("Finance\nOperations, Finance\nCommercial"),
    ["Finance", "Operations", "Commercial"],
  );
  assert.equal(isNativeFormChoiceField("select"), true);
  assert.equal(isNativeFormChoiceField("radio"), true);
  assert.equal(isNativeFormChoiceField("checkbox"), true);
  assert.equal(isNativeFormChoiceField("text"), false);
});

test("adds and removes checkbox choices without losing other selections", () => {
  assert.equal(
    toggleNativeFormCheckboxOption("Finance, Commercial", "Operations", true),
    "Finance, Commercial, Operations",
  );
  assert.equal(
    toggleNativeFormCheckboxOption("Finance, Commercial", "Finance", false),
    "Commercial",
  );
});

test("uses configured placeholders before generated fallbacks", () => {
  const baseField = {
    name: "project",
    label: "Project name",
    type: "text",
    source: "manual",
    required: true,
    instructions: "",
  };

  assert.equal(getNativeFormFieldPlaceholder(baseField), "Enter project name");
  assert.equal(
    getNativeFormFieldPlaceholder({ ...baseField, placeholder: "Select project" }),
    "Select project",
  );
});
