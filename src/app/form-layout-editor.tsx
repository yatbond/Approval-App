"use client";

import { ArrowDown, ArrowUp, Columns2, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  addFormLayoutSection,
  moveFormLayoutItem,
  normalizeFormLayout,
  removeFormLayoutSection,
  updateFormLayoutItem,
  updateFormLayoutSection,
} from "@/lib/form-layout-state";
import type { FormLibraryDraft } from "@/lib/form-library-state";

export function FormLayoutEditor({
  draft,
  setDraft,
}: {
  draft: FormLibraryDraft;
  setDraft: Dispatch<SetStateAction<FormLibraryDraft>>;
}) {
  if (draft.source === "microsoft_forms") {
    return (
      <section className="rounded-md border border-[#e6e6e6] bg-white p-5 dark:border-neutral-700 dark:bg-neutral-950">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">Layout</h2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">
          Microsoft Forms controls its own question layout. Approval App keeps the
          field mapping, attachments, and workflow integration, but does not alter
          the external form design.
        </p>
      </section>
    );
  }

  const layout = normalizeFormLayout(draft.layout, draft.fields);
  const fieldByName = new Map(draft.fields.map((field) => [field.name, field]));
  const updateLayout = (nextLayout: FormLibraryDraft["layout"]) =>
    setDraft((current) => ({ ...current, layout: nextLayout }));

  return (
    <section className="rounded-md border border-[#e6e6e6] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">Form layout</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Arrange fields into sections. Half-width fields share a row on desktop and
            automatically become full-width on mobile.
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateLayout(addFormLayoutSection(layout))}
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#f7941d]/50 bg-[#fff4e6] px-3 text-sm font-medium text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100"
        >
          <Plus size={15} /> Add section
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {layout.sections.map((section) => (
          <div
            key={section.id}
            className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
              <label>
                <span className="mb-1 block text-xs text-neutral-500">Section title</span>
                <input
                  value={section.title}
                  onChange={(event) =>
                    updateLayout(
                      updateFormLayoutSection(layout, section.id, {
                        title: event.target.value,
                      }),
                    )
                  }
                  className={inputClassName}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-neutral-500">Description (optional)</span>
                <input
                  value={section.description || ""}
                  onChange={(event) =>
                    updateLayout(
                      updateFormLayoutSection(layout, section.id, {
                        description: event.target.value,
                      }),
                    )
                  }
                  className={inputClassName}
                />
              </label>
              <button
                type="button"
                onClick={() => updateLayout(removeFormLayoutSection(layout, section.id))}
                disabled={layout.sections.length <= 1}
                title="Remove this section and move its fields to the first section"
                className="mt-5 flex size-10 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {section.items.map((item, index) => {
                const field = fieldByName.get(item.fieldName);
                if (!field) return null;
                return (
                  <div
                    key={item.fieldName}
                    className="grid gap-2 rounded-md border border-[#e6e6e6] bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950 sm:grid-cols-[minmax(0,1fr)_160px_150px_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {field.label}
                      </p>
                      <p className="text-xs text-neutral-500">{field.type}</p>
                    </div>
                    <select
                      value={section.id}
                      aria-label={`Section for ${field.label}`}
                      onChange={(event) =>
                        updateLayout(
                          updateFormLayoutItem({
                            layout,
                            fieldName: field.name,
                            sectionId: event.target.value,
                          }),
                        )
                      }
                      className={inputClassName}
                    >
                      {layout.sections.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        updateLayout(
                          updateFormLayoutItem({
                            layout,
                            fieldName: field.name,
                            width: item.width === "full" ? "half" : "full",
                          }),
                        )
                      }
                      className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#e6e6e6] px-3 text-sm dark:border-neutral-700"
                    >
                      <Columns2 size={15} /> {item.width === "full" ? "Full" : "Half"}
                    </button>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => updateLayout(moveFormLayoutItem(layout, section.id, field.name, -1))}
                        disabled={index === 0}
                        title="Move field up"
                        className={iconButtonClassName}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateLayout(moveFormLayoutItem(layout, section.id, field.name, 1))}
                        disabled={index === section.items.length - 1}
                        title="Move field down"
                        className={iconButtonClassName}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {!section.items.length && (
                <p className="rounded-md border border-dashed border-[#d2d2d2] p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
                  Move a field into this section.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const inputClassName =
  "min-h-10 w-full rounded-md border border-[#d2d2d2] bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#f7941d] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const iconButtonClassName =
  "flex size-10 items-center justify-center rounded-md border border-[#e6e6e6] disabled:cursor-not-allowed disabled:opacity-35 dark:border-neutral-700";
