import type { FormLayout, FormLayoutSection, WorkflowField } from "./types.ts";

export function createDefaultFormLayout(fields: Pick<WorkflowField, "name">[]): FormLayout {
  return {
    sections: [
      {
        id: "section-main",
        title: "Form details",
        items: fields.map((field) => ({ fieldName: field.name, width: "full" })),
      },
    ],
  };
}

export function normalizeFormLayout(
  layout: FormLayout | undefined,
  fields: Pick<WorkflowField, "name">[],
): FormLayout {
  const validNames = new Set(fields.map((field) => field.name));
  const seenNames = new Set<string>();
  const sections = (layout?.sections || [])
    .map((section, index) => ({
      ...section,
      id: section.id || `section-${index + 1}`,
      title: section.title.trim() || `Section ${index + 1}`,
      items: section.items.filter((item) => {
        if (!validNames.has(item.fieldName) || seenNames.has(item.fieldName)) {
          return false;
        }
        seenNames.add(item.fieldName);
        return true;
      }),
    }));

  if (!sections.length) {
    sections.push(createDefaultFormLayout([]).sections[0]);
  }
  fields.forEach((field) => {
    if (!seenNames.has(field.name)) {
      sections[0].items.push({ fieldName: field.name, width: "full" });
    }
  });
  return { sections };
}

export function renameFormLayoutField(
  layout: FormLayout,
  previousName: string,
  nextName: string,
): FormLayout {
  return {
    sections: layout.sections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        item.fieldName === previousName ? { ...item, fieldName: nextName } : item,
      ),
    })),
  };
}

export function updateFormLayoutItem({
  layout,
  fieldName,
  sectionId,
  width,
}: {
  layout: FormLayout;
  fieldName: string;
  sectionId?: string;
  width?: "full" | "half";
}) {
  if (!sectionId && width) {
    return {
      sections: layout.sections.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.fieldName === fieldName ? { ...item, width } : item,
        ),
      })),
    };
  }
  let movedItem = { fieldName, width: width || "full" };
  const sections = layout.sections.map((section) => {
    const existing = section.items.find((item) => item.fieldName === fieldName);
    if (existing) {
      movedItem = { ...existing, ...(width ? { width } : {}) };
    }
    return {
      ...section,
      items: section.items.filter((item) => item.fieldName !== fieldName),
    };
  });
  const targetId = sectionId;
  return {
    sections: sections.map((section) =>
      section.id === targetId
        ? { ...section, items: [...section.items, movedItem] }
        : section,
    ),
  };
}

export function moveFormLayoutItem(
  layout: FormLayout,
  sectionId: string,
  fieldName: string,
  direction: -1 | 1,
) {
  return {
    sections: layout.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const index = section.items.findIndex((item) => item.fieldName === fieldName);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= section.items.length) return section;
      const items = [...section.items];
      [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
      return { ...section, items };
    }),
  };
}

export function addFormLayoutSection(layout: FormLayout): FormLayout {
  const nextNumber = layout.sections.length + 1;
  return {
    sections: [
      ...layout.sections,
      { id: `section-${Date.now()}-${nextNumber}`, title: `Section ${nextNumber}`, items: [] },
    ],
  };
}

export function removeFormLayoutSection(layout: FormLayout, sectionId: string): FormLayout {
  if (layout.sections.length <= 1) return layout;
  const removed = layout.sections.find((section) => section.id === sectionId);
  const remaining = layout.sections.filter((section) => section.id !== sectionId);
  return {
    sections: [
      { ...remaining[0], items: [...remaining[0].items, ...(removed?.items || [])] },
      ...remaining.slice(1),
    ],
  };
}

export function updateFormLayoutSection(
  layout: FormLayout,
  sectionId: string,
  patch: Partial<Pick<FormLayoutSection, "title" | "description">>,
): FormLayout {
  return {
    sections: layout.sections.map((section) =>
      section.id === sectionId ? { ...section, ...patch } : section,
    ),
  };
}
