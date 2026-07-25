import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultFormLayout,
  moveFormLayoutItem,
  normalizeFormLayout,
  renameFormLayoutField,
  updateFormLayoutItem,
} from "./form-layout-state.ts";

const fields = [{ name: "vendor" }, { name: "amount" }];

test("creates a stable one-section layout for existing native forms", () => {
  assert.deepEqual(createDefaultFormLayout(fields).sections[0].items, [
    { fieldName: "vendor", width: "full" },
    { fieldName: "amount", width: "full" },
  ]);
});

test("normalizes stale layout fields and appends newly added fields", () => {
  const layout = normalizeFormLayout(
    {
      sections: [
        {
          id: "main",
          title: "Details",
          items: [
            { fieldName: "vendor", width: "half" },
            { fieldName: "removed", width: "full" },
          ],
        },
      ],
    },
    fields,
  );
  assert.deepEqual(layout.sections[0].items, [
    { fieldName: "vendor", width: "half" },
    { fieldName: "amount", width: "full" },
  ]);
});

test("preserves empty sections while the user is arranging a form", () => {
  const layout = normalizeFormLayout(
    {
      sections: [
        { id: "main", title: "Details", items: [{ fieldName: "vendor", width: "full" }] },
        { id: "supporting", title: "Supporting information", items: [] },
      ],
    },
    fields,
  );

  assert.equal(layout.sections.length, 2);
  assert.deepEqual(layout.sections[1].items, []);
});

test("renames, moves, and resizes form layout fields", () => {
  const renamed = renameFormLayoutField(
    createDefaultFormLayout(fields),
    "vendor",
    "supplier",
  );
  const resized = updateFormLayoutItem({
    layout: renamed,
    fieldName: "supplier",
    width: "half",
  });
  const moved = moveFormLayoutItem(resized, "section-main", "supplier", 1);
  assert.deepEqual(moved.sections[0].items, [
    { fieldName: "amount", width: "full" },
    { fieldName: "supplier", width: "half" },
  ]);
});
