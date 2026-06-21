import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowTemplateLibraryItems } from "./workflow-template-library-state.ts";

const templates = [
  {
    id: "invoice",
    name: "Invoice approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: ["Invoice"],
    documents: [{ id: "doc-1" }, { id: "doc-2" }],
    languages: ["English"],
    fields: [{ name: "amount" }],
    steps: [{ id: "step-1" }, { id: "step-2" }, { id: "step-3" }],
  },
  {
    id: "leave",
    name: "Leave approval",
    business: "Chun Wo Construction",
    department: "Human Resources",
    documentTypes: [],
    documents: [],
    languages: [],
    fields: [],
    steps: [],
  },
];

test("summarizes template library cards with counts and active state", () => {
  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates: templates,
    selectedTemplateId: "invoice",
  });

  assert.deepEqual(items, [
    {
      id: "invoice",
      template: templates[0],
      isSelected: true,
      businessDepartmentLabel: "Asia Allied Infrastructure - Finance",
      countsLabel: "2 document(s), 1 field(s), 3 step(s)",
      statusLabel: "Draft",
      ownershipLabel: "Cannot edit",
      canOpen: false,
      canDuplicate: true,
      canDelete: false,
      openActionLabel: "Open in Canvas",
      duplicateActionLabel: "Duplicate as New Template",
      archiveActionLabel: "Delete",
    },
    {
      id: "leave",
      template: templates[1],
      isSelected: false,
      businessDepartmentLabel: "Chun Wo Construction - Human Resources",
      countsLabel: "0 document(s), 0 field(s), 0 step(s)",
      statusLabel: "Draft",
      ownershipLabel: "Cannot edit",
      canOpen: false,
      canDuplicate: true,
      canDelete: false,
      openActionLabel: "Open in Canvas",
      duplicateActionLabel: "Duplicate as New Template",
      archiveActionLabel: "Delete",
    },
  ]);
});

test("falls back to the first template as selected when selected id is missing", () => {
  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates: templates,
    selectedTemplateId: "missing",
  });

  assert.equal(items[0].isSelected, true);
  assert.equal(items[1].isSelected, false);
});

test("returns no items for an empty library", () => {
  assert.deepEqual(
    getWorkflowTemplateLibraryItems({
      workflowTemplates: [],
      selectedTemplateId: "missing",
    }),
    [],
  );
});

test("labels template status, ownership, and available actions", () => {
  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates: [
      {
        ...templates[0],
        id: "own-draft",
        isDraft: true,
        createdByEmail: "dpang@chunwo.com",
      },
      {
        ...templates[0],
        id: "locked-published",
        isDraft: false,
        publishedAt: "2026-06-21T05:00:00.000Z",
        createdByEmail: "other@example.com",
      },
      {
        ...templates[0],
        id: "archived",
        isArchived: true,
        archivedAt: "2026-06-21T06:00:00.000Z",
        createdByEmail: "other@example.com",
      },
    ],
    selectedTemplateId: "own-draft",
    activeUserEmail: "dpang@chunwo.com",
    activeUserRole: "approver",
  });

  assert.deepEqual(
    items.map((item) => ({
      id: item.id,
      statusLabel: item.statusLabel,
      ownershipLabel: item.ownershipLabel,
      canOpen: item.canOpen,
      canDuplicate: item.canDuplicate,
      canDelete: item.canDelete,
    })),
    [
      {
        id: "own-draft",
        statusLabel: "Draft",
        ownershipLabel: "Created by me",
        canOpen: true,
        canDuplicate: true,
        canDelete: true,
      },
      {
        id: "locked-published",
        statusLabel: "Published",
        ownershipLabel: "Cannot edit",
        canOpen: false,
        canDuplicate: true,
        canDelete: false,
      },
      {
        id: "archived",
        statusLabel: "Archived",
        ownershipLabel: "Cannot edit",
        canOpen: false,
        canDuplicate: false,
        canDelete: false,
      },
    ],
  );
});

test("separates active templates from archived templates", () => {
  const activeTemplate = {
    ...templates[0],
    id: "active-template",
    createdByEmail: "dpang@chunwo.com",
  };
  const archivedTemplate = {
    ...templates[1],
    id: "archived-template",
    isArchived: true,
    archivedAt: "2026-06-21T06:00:00.000Z",
    createdByEmail: "dpang@chunwo.com",
  };

  const libraryItems = getWorkflowTemplateLibraryItems({
    workflowTemplates: [activeTemplate, archivedTemplate],
    selectedTemplateId: "active-template",
    activeUserEmail: "dpang@chunwo.com",
    activeUserRole: "approver",
    section: "library",
  });
  const archiveItems = getWorkflowTemplateLibraryItems({
    workflowTemplates: [activeTemplate, archivedTemplate],
    selectedTemplateId: "active-template",
    activeUserEmail: "dpang@chunwo.com",
    activeUserRole: "approver",
    section: "archive",
  });

  assert.deepEqual(
    libraryItems.map((item) => item.id),
    ["active-template"],
  );
  assert.deepEqual(
    archiveItems.map((item) => ({
      id: item.id,
      canOpen: item.canOpen,
      canDuplicate: item.canDuplicate,
      canDelete: item.canDelete,
      archiveActionLabel: item.archiveActionLabel,
    })),
    [
      {
        id: "archived-template",
        canOpen: false,
        canDuplicate: false,
        canDelete: false,
        archiveActionLabel: "Archived",
      },
    ],
  );
});
