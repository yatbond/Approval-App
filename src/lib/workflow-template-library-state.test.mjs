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
      versionLabel: "v1",
      versionComment: "",
      statusLabel: "Draft",
      statusTone: "draft",
      ownershipLabel: "Cannot edit",
      canOpen: false,
      canDuplicate: false,
      canDelete: false,
      canActivate: false,
      canComment: false,
      openActionLabel: "Open",
      duplicateActionLabel: "Duplicate",
      archiveActionLabel: "Archive",
      activateActionLabel: "Make active",
      commentActionLabel: "Save note",
    },
    {
      id: "leave",
      template: templates[1],
      isSelected: false,
      businessDepartmentLabel: "Chun Wo Construction - Human Resources",
      countsLabel: "0 document(s), 0 field(s), 0 step(s)",
      versionLabel: "v1",
      versionComment: "",
      statusLabel: "Draft",
      statusTone: "draft",
      ownershipLabel: "Cannot edit",
      canOpen: false,
      canDuplicate: false,
      canDelete: false,
      canActivate: false,
      canComment: false,
      openActionLabel: "Open",
      duplicateActionLabel: "Duplicate",
      archiveActionLabel: "Archive",
      activateActionLabel: "Make active",
      commentActionLabel: "Save note",
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
    section: "all",
  });

  assert.deepEqual(
    items.map((item) => ({
      id: item.id,
      statusLabel: item.statusLabel,
      statusTone: item.statusTone,
      ownershipLabel: item.ownershipLabel,
      canOpen: item.canOpen,
      canDuplicate: item.canDuplicate,
      canDelete: item.canDelete,
    })),
    [
      {
        id: "own-draft",
        statusLabel: "Draft",
        statusTone: "draft",
        ownershipLabel: "Mine",
        canOpen: true,
        canDuplicate: true,
        canDelete: true,
      },
      {
        id: "locked-published",
        statusLabel: "Active",
        statusTone: "active",
        ownershipLabel: "Cannot edit",
        canOpen: false,
        canDuplicate: false,
        canDelete: false,
      },
      {
        id: "archived",
        statusLabel: "Archived",
        statusTone: "archived",
        ownershipLabel: "Cannot edit",
        canOpen: false,
        canDuplicate: false,
        canDelete: false,
      },
    ],
  );
});

test("defaults to usable library templates instead of mixing archived templates", () => {
  const archivedTemplate = {
    ...templates[1],
    id: "archived-default",
    isArchived: true,
  };

  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates: [templates[0], archivedTemplate],
    selectedTemplateId: "invoice",
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ["invoice"],
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
      statusTone: item.statusTone,
    })),
    [
      {
        id: "archived-template",
        canOpen: false,
        canDuplicate: false,
        canDelete: false,
        archiveActionLabel: "Archived",
        statusTone: "archived",
      },
    ],
  );
});

test("keeps inactive published versions in the versions section only", () => {
  const activeTemplate = {
    ...templates[0],
    id: "invoice-v2",
    version: 2,
    isDraft: false,
    isActiveVersion: true,
    sourceTemplateId: "invoice",
    createdByEmail: "dpang@chunwo.com",
    versionComment: "Use for current finance routing.",
  };
  const inactiveTemplate = {
    ...templates[0],
    id: "invoice-v1",
    version: 1,
    isDraft: false,
    isActiveVersion: false,
    sourceTemplateId: "invoice",
    createdByEmail: "dpang@chunwo.com",
  };

  const libraryItems = getWorkflowTemplateLibraryItems({
    workflowTemplates: [inactiveTemplate, activeTemplate],
    selectedTemplateId: "invoice-v1",
    activeUserEmail: "dpang@chunwo.com",
    activeUserRole: "approver",
    section: "library",
  });
  const versionItems = getWorkflowTemplateLibraryItems({
    workflowTemplates: [inactiveTemplate, activeTemplate],
    selectedTemplateId: "invoice-v1",
    activeUserEmail: "dpang@chunwo.com",
    activeUserRole: "approver",
    section: "versions",
  });

  assert.deepEqual(
    libraryItems.map((item) => item.id),
    ["invoice-v2"],
  );
  assert.deepEqual(
    versionItems.map((item) => ({
      id: item.id,
      statusLabel: item.statusLabel,
      statusTone: item.statusTone,
      versionLabel: item.versionLabel,
      versionComment: item.versionComment,
      canActivate: item.canActivate,
      canComment: item.canComment,
      activateActionLabel: item.activateActionLabel,
    })),
    [
      {
        id: "invoice-v1",
        statusLabel: "Inactive",
        statusTone: "inactive",
        versionLabel: "v1",
        versionComment: "",
        canActivate: true,
        canComment: true,
        activateActionLabel: "Make active",
      },
      {
        id: "invoice-v2",
        statusLabel: "Active",
        statusTone: "active",
        versionLabel: "v2",
        versionComment: "Use for current finance routing.",
        canActivate: false,
        canComment: true,
        activateActionLabel: "Active",
      },
    ],
  );
});
