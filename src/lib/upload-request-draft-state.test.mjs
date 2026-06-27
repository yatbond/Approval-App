import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSavedUploadRequestDraft,
  buildUploadRequestDraft,
  clearUploadRequestDraft,
  createEmptyUploadRequestDraftStatus,
  getCreatorVisibleUploadRequestDrafts,
  getCurrentAutosaveUploadRequestDraft,
  getNextSavedUploadRequestDrafts,
  getNamedSavedUploadRequestDrafts,
  getSavedUploadRequestDraftAccess,
  getUploadAutosaveIdentity,
  getUploadDraftResumeItems,
  getUploadWorkInProgressItems,
  parseUploadRequestDraft,
  parseUploadRequestDraftList,
  serializeUploadRequestDraftList,
  serializeUploadRequestDraft,
  shouldRestoreUploadRequestDraftHighlightState,
} from "./upload-request-draft-state.ts";

const attachment = {
  id: "attachment-1",
  fileName: "invoice.pdf",
  documentId: "invoice-doc",
  documentType: "Invoice",
  format: "pdf",
  storagePath: "user/ad-hoc/invoice.pdf",
  publicUrl: "https://example.test/invoice.pdf",
  uploadedBy: "dpang@chunwo.com",
  uploadedAt: "2026-06-23T00:00:00.000Z",
};

const parseResult = {
  strategy: "pdf-ocr",
  fields: {
    Vendor: "Gleneagles",
    Amount: "500,000.00",
  },
  confidence: {
    Vendor: "high",
    Amount: "medium",
  },
  evidence: {
    Amount: "OUTSTANDING BALANCE 500,000.00",
  },
  suggestedFields: [
    {
      name: "suggested_project",
      label: "Project",
      value: "Hospital Works",
      confidence: "medium",
      evidence: "Project Hospital Works",
      instructions: "Extract Project.",
    },
  ],
  notes: ["Parsed with visual model."],
};

const highlightGroups = [
  {
    id: "highlight-field-1",
    fieldLabel: "Payment milestones",
    boxes: [
      {
        id: "highlight-value-box-1",
        pageId: "pdf-page-1",
        pageNumber: 1,
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
        value: "100,000.00",
        confidence: "high",
        evidence: "Milestone 1 100,000.00",
        status: "done",
      },
    ],
  },
];

test("builds a recoverable upload request draft without raw file data", () => {
  const draft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Vendor: "Gleneagles Hospital", Amount: "500,000.00" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });

  assert.equal(draft.selectedTemplateId, "template-finance");
  assert.equal(draft.fileName, "invoice.pdf");
  assert.deepEqual(draft.uploadedAttachments, [attachment]);
  assert.equal(draft.parseResult?.fields.Amount, "500,000.00");
  assert.equal(draft.highlightGroups[0].boxes[0].value, "100,000.00");
  assert.equal(JSON.stringify(draft).includes("File"), false);
});

test("round trips a valid upload request draft through storage serialization", () => {
  const draft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Vendor: "Gleneagles Hospital" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });

  const restored = parseUploadRequestDraft(serializeUploadRequestDraft(draft));

  assert.deepEqual(restored, draft);
});

test("rejects malformed or obsolete upload request drafts", () => {
  assert.equal(parseUploadRequestDraft("not-json"), null);
  assert.equal(
    parseUploadRequestDraft(
      JSON.stringify({
        version: 999,
        selectedTemplateId: "template-finance",
        uploadedAttachments: [],
        editedFields: {},
      }),
    ),
    null,
  );
  assert.equal(
    parseUploadRequestDraft(
      JSON.stringify({
        version: 1,
        selectedTemplateId: 42,
        uploadedAttachments: [],
        editedFields: {},
      }),
    ),
    null,
  );
});

test("reports whether a draft contains recoverable request work", () => {
  assert.deepEqual(createEmptyUploadRequestDraftStatus(null), {
    hasDraft: false,
    label: "No draft",
  });

  const draft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult: null,
    editedFields: {},
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups: [],
    activeHighlightGroupId: "",
    highlightBoxCounter: 1,
    savedAt: "2026-06-23T00:01:00.000Z",
  });

  assert.deepEqual(createEmptyUploadRequestDraftStatus(draft), {
    hasDraft: true,
    label: "Autosaved 1 attachment",
  });
});

test("clears upload request draft state after submit or discard", () => {
  assert.deepEqual(clearUploadRequestDraft(), {
    fileName: "",
    parseResult: null,
    editedFields: {},
    uploadedAttachments: [],
    parsedDocumentId: undefined,
    highlightGroups: [],
    activeHighlightGroupId: "",
    highlightBoxCounter: 1,
  });
});

test("restores upload highlight state only once for a draft restore token", () => {
  assert.equal(
    shouldRestoreUploadRequestDraftHighlightState({
      restoreToken: "",
      lastRestoredToken: "",
    }),
    false,
  );
  assert.equal(
    shouldRestoreUploadRequestDraftHighlightState({
      restoreToken: "2026-06-23T00:01:00.000Z",
      lastRestoredToken: "",
    }),
    true,
  );
  assert.equal(
    shouldRestoreUploadRequestDraftHighlightState({
      restoreToken: "2026-06-23T00:01:00.000Z",
      lastRestoredToken: "2026-06-23T00:01:00.000Z",
    }),
    false,
  );
});

test("builds creator-owned saved upload request drafts", () => {
  const draft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Vendor: "Gleneagles Hospital" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });

  const savedDraft = buildSavedUploadRequestDraft({
    draft,
    id: "upload-draft-1",
    title: "Gleneagles final account",
    createdByEmail: "dpang@chunwo.com",
    createdByUserId: "user-1",
    savedAt: "2026-06-23T00:02:00.000Z",
  });

  assert.equal(savedDraft.id, "upload-draft-1");
  assert.equal(savedDraft.title, "Gleneagles final account");
  assert.equal(savedDraft.createdByEmail, "dpang@chunwo.com");
  assert.equal(savedDraft.createdByUserId, "user-1");
  assert.equal(savedDraft.draft.fileName, "invoice.pdf");
});

test("separates private current autosave drafts from named saved drafts", () => {
  const baseDraft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Vendor: "Gleneagles Hospital" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });
  const currentAutosave = buildSavedUploadRequestDraft({
    draft: baseDraft,
    id: "current-autosave-id",
    title: "",
    createdByEmail: "dpang@chunwo.com",
    createdByUserId: "user-1",
    savedAt: "2026-06-23T00:03:00.000Z",
    draftKind: "current",
  });
  const namedDraft = buildSavedUploadRequestDraft({
    draft: baseDraft,
    id: "named-draft-id",
    title: "Named draft",
    createdByEmail: "dpang@chunwo.com",
    createdByUserId: "user-1",
    savedAt: "2026-06-23T00:02:00.000Z",
    draftKind: "named",
  });

  assert.equal(currentAutosave.title, "Autosave");
  assert.equal(currentAutosave.draftKind, "current");
  assert.deepEqual(getNamedSavedUploadRequestDrafts([currentAutosave, namedDraft]), [
    namedDraft,
  ]);
  assert.deepEqual(
    getCurrentAutosaveUploadRequestDraft([namedDraft, currentAutosave]),
    currentAutosave,
  );
});

test("round trips only valid saved upload request drafts", () => {
  const draft = buildSavedUploadRequestDraft({
    draft: buildUploadRequestDraft({
      selectedTemplateId: "template-finance",
      fileName: "invoice.pdf",
      parseResult,
      editedFields: { Amount: "500,000.00" },
      uploadedAttachments: [attachment],
      parsedDocumentId: "invoice-doc",
      highlightGroups,
      activeHighlightGroupId: "highlight-field-1",
      highlightBoxCounter: 2,
      savedAt: "2026-06-23T00:01:00.000Z",
    }),
    id: "upload-draft-1",
    title: "",
    createdByEmail: "dpang@chunwo.com",
    createdByUserId: "user-1",
    savedAt: "2026-06-23T00:02:00.000Z",
  });

  const restored = parseUploadRequestDraftList(
    serializeUploadRequestDraftList([draft, { invalid: true }]),
  );

  assert.deepEqual(restored, [draft]);
  assert.deepEqual(parseUploadRequestDraftList("not-json"), []);
});

test("filters saved upload request drafts by creator", () => {
  const baseDraft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Amount: "500,000.00" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });
  const visible = buildSavedUploadRequestDraft({
    draft: baseDraft,
    id: "own-draft",
    title: "Own draft",
    createdByEmail: "dpang@chunwo.com",
    savedAt: "2026-06-23T00:03:00.000Z",
  });
  const hidden = buildSavedUploadRequestDraft({
    draft: baseDraft,
    id: "other-draft",
    title: "Other draft",
    createdByEmail: "other@example.com",
    savedAt: "2026-06-23T00:04:00.000Z",
  });

  assert.deepEqual(
    getCreatorVisibleUploadRequestDrafts({
      drafts: [hidden, visible],
      activeUserEmail: "DPANG@CHUNWO.COM",
      activeUserId: "",
    }).map((item) => item.id),
    ["own-draft"],
  );
});

test("upserts and removes saved upload request drafts only for their creator", () => {
  const baseDraft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Amount: "500,000.00" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });
  const ownDraft = buildSavedUploadRequestDraft({
    draft: baseDraft,
    id: "own-draft",
    title: "Own draft",
    createdByEmail: "dpang@chunwo.com",
    savedAt: "2026-06-23T00:03:00.000Z",
  });
  const otherDraft = buildSavedUploadRequestDraft({
    draft: baseDraft,
    id: "other-draft",
    title: "Other draft",
    createdByEmail: "other@example.com",
    savedAt: "2026-06-23T00:04:00.000Z",
  });

  const updated = getNextSavedUploadRequestDrafts({
    drafts: [ownDraft, otherDraft],
    action: "upsert",
    draft: {
      ...ownDraft,
      title: "Updated own draft",
      savedAt: "2026-06-23T00:05:00.000Z",
    },
    activeUserEmail: "dpang@chunwo.com",
    activeUserId: "",
  });
  assert.deepEqual(
    updated.map((item) => `${item.id}:${item.title}`),
    ["own-draft:Updated own draft", "other-draft:Other draft"],
  );

  const removed = getNextSavedUploadRequestDrafts({
    drafts: updated,
    action: "remove",
    draftId: "other-draft",
    activeUserEmail: "dpang@chunwo.com",
    activeUserId: "",
  });
  assert.deepEqual(
    removed.map((item) => item.id),
    ["own-draft", "other-draft"],
  );

  assert.deepEqual(
    getNextSavedUploadRequestDrafts({
      drafts: updated,
      action: "remove",
      draftId: "own-draft",
      activeUserEmail: "dpang@chunwo.com",
      activeUserId: "",
    }).map((item) => item.id),
    ["other-draft"],
  );
});

test("denies saved upload draft access to non-creators including superusers", () => {
  const draft = buildSavedUploadRequestDraft({
    draft: buildUploadRequestDraft({
      selectedTemplateId: "template-finance",
      fileName: "invoice.pdf",
      parseResult,
      editedFields: { Amount: "500,000.00" },
      uploadedAttachments: [attachment],
      parsedDocumentId: "invoice-doc",
      highlightGroups,
      activeHighlightGroupId: "highlight-field-1",
      highlightBoxCounter: 2,
      savedAt: "2026-06-23T00:01:00.000Z",
    }),
    id: "own-draft",
    title: "Own draft",
    createdByEmail: "dpang@chunwo.com",
    createdByUserId: "user-1",
    savedAt: "2026-06-23T00:03:00.000Z",
  });

  assert.deepEqual(
    getSavedUploadRequestDraftAccess({
      draft,
      activeUserEmail: "dpang@chunwo.com",
      activeUserId: "user-1",
    }),
    {
      canView: true,
      canLoad: true,
      canDelete: true,
      label: "Mine",
    },
  );

  assert.deepEqual(
    getSavedUploadRequestDraftAccess({
      draft,
      activeUserEmail: "admin@example.com",
      activeUserId: "admin-user",
    }),
    {
      canView: false,
      canLoad: false,
      canDelete: false,
      label: "Creator",
    },
  );
});

test("builds work-in-progress items from current autosave and saved drafts", () => {
  const draft = buildSavedUploadRequestDraft({
    draft: buildUploadRequestDraft({
      selectedTemplateId: "template-finance",
      fileName: "invoice.pdf",
      parseResult,
      editedFields: { Amount: "500,000.00" },
      uploadedAttachments: [attachment],
      parsedDocumentId: "invoice-doc",
      highlightGroups,
      activeHighlightGroupId: "highlight-field-1",
      highlightBoxCounter: 2,
      savedAt: "2026-06-23T00:01:00.000Z",
    }),
    id: "saved-draft",
    title: "Named saved draft",
    createdByEmail: "dpang@chunwo.com",
    savedAt: "2026-06-23T00:03:00.000Z",
  });

  assert.deepEqual(
    getUploadWorkInProgressItems({
      currentDraftStatus: {
        hasDraft: true,
        label: "Autosaved 1 attachment, 1 field",
      },
      savedDrafts: [draft],
    }),
    [
      {
        id: "current-autosave",
        title: "Autosave",
        detail: "Autosaved 1 attachment, 1 field",
        type: "current",
      },
      {
        id: "saved-draft",
        title: "Named saved draft",
        detail: "1 attachment(s), 1 field(s)",
        type: "saved",
      },
    ],
  );
});

test("reuses the loaded saved draft identity for autosave", () => {
  assert.deepEqual(
    getUploadAutosaveIdentity({
      selectedUploadDraftId: "saved-draft",
      remoteUploadAutosaveId: "current-autosave",
      storedUploadAutosaveId: "stored-autosave",
      createUploadAutosaveId: () => "new-autosave",
    }),
    {
      id: "saved-draft",
      draftKind: "named",
      isCurrentAutosave: false,
    },
  );

  assert.deepEqual(
    getUploadAutosaveIdentity({
      selectedUploadDraftId: "",
      remoteUploadAutosaveId: "",
      storedUploadAutosaveId: "stored-autosave",
      createUploadAutosaveId: () => "new-autosave",
    }),
    {
      id: "stored-autosave",
      draftKind: "current",
      isCurrentAutosave: true,
    },
  );
});

test("hides current autosave when it represents the active saved draft", () => {
  const draft = buildSavedUploadRequestDraft({
    draft: buildUploadRequestDraft({
      selectedTemplateId: "template-finance",
      fileName: "invoice.pdf",
      parseResult,
      editedFields: { Amount: "500,000.00" },
      uploadedAttachments: [attachment],
      parsedDocumentId: "invoice-doc",
      highlightGroups,
      activeHighlightGroupId: "highlight-field-1",
      highlightBoxCounter: 2,
      savedAt: "2026-06-23T00:01:00.000Z",
    }),
    id: "saved-draft",
    title: "Named saved draft",
    createdByEmail: "dpang@chunwo.com",
    savedAt: "2026-06-23T00:03:00.000Z",
  });

  assert.deepEqual(
    getUploadWorkInProgressItems({
      activeDraftId: "saved-draft",
      currentDraftStatus: {
        hasDraft: true,
        label: "Autosaved 1 attachment, 1 field",
      },
      savedDrafts: [draft],
    }),
    [
      {
        id: "saved-draft",
        title: "Named saved draft",
        detail: "1 attachment(s), 1 field(s)",
        type: "saved",
      },
    ],
  );
});

test("builds resume items with template names for current and saved drafts", () => {
  const currentDraft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "current.pdf",
    parseResult,
    editedFields: { Amount: "500,000.00" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });
  const savedDraft = buildSavedUploadRequestDraft({
    draft: buildUploadRequestDraft({
      selectedTemplateId: "template-hr",
      fileName: "leave.pdf",
      parseResult,
      editedFields: { Date: "2026-06-23" },
      uploadedAttachments: [],
      parsedDocumentId: "doctor-slip",
      highlightGroups,
      activeHighlightGroupId: "highlight-field-1",
      highlightBoxCounter: 2,
      savedAt: "2026-06-23T00:03:00.000Z",
    }),
    id: "saved-hr-draft",
    title: "HR request",
    createdByEmail: "dpang@chunwo.com",
    savedAt: "2026-06-23T00:04:00.000Z",
  });

  assert.deepEqual(
    getUploadDraftResumeItems({
      activeUserEmail: "dpang@chunwo.com",
      currentDraft,
      currentDraftStatus: {
        hasDraft: true,
        label: "Autosaved 1 attachment, 1 field",
      },
      savedDrafts: [savedDraft],
      templates: [
        { id: "template-finance", name: "Finance invoice approval" },
        { id: "template-hr", name: "HR annual leave" },
      ],
    }),
    [
      {
        id: "current-autosave",
        title: "Autosave",
        detail: "Autosaved 1 attachment, 1 field",
        fileName: "current.pdf",
        templateName: "Finance invoice approval",
        type: "current",
        updatedAt: "2026-06-23T00:01:00.000Z",
        accessLabel: "Private",
        canResume: true,
        canDelete: true,
      },
      {
        id: "saved-hr-draft",
        title: "HR request",
        detail: "0 attachment(s), 1 field(s)",
        fileName: "leave.pdf",
        templateName: "HR annual leave",
        type: "saved",
        updatedAt: "2026-06-23T00:04:00.000Z",
        accessLabel: "Mine",
        canResume: true,
        canDelete: true,
      },
    ],
  );
});

test("hides current resume item when editing an active saved draft", () => {
  const currentDraft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Amount: "500,000.00" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });
  const savedDraft = buildSavedUploadRequestDraft({
    draft: currentDraft,
    id: "saved-draft",
    title: "Named saved draft",
    createdByEmail: "dpang@chunwo.com",
    savedAt: "2026-06-23T00:04:00.000Z",
  });

  assert.deepEqual(
    getUploadDraftResumeItems({
      activeUserEmail: "dpang@chunwo.com",
      activeDraftId: "saved-draft",
      currentDraft,
      currentDraftStatus: {
        hasDraft: true,
        label: "Autosaved 1 attachment, 1 field",
      },
      savedDrafts: [savedDraft],
      templates: [{ id: "template-finance", name: "Finance invoice approval" }],
    }).map((item) => item.id),
    ["saved-draft"],
  );
});

test("marks non-creator saved drafts as inaccessible in resume items", () => {
  const savedDraft = buildSavedUploadRequestDraft({
    draft: buildUploadRequestDraft({
      selectedTemplateId: "template-hr",
      fileName: "leave.pdf",
      parseResult,
      editedFields: { Date: "2026-06-23" },
      uploadedAttachments: [],
      parsedDocumentId: "doctor-slip",
      highlightGroups,
      activeHighlightGroupId: "highlight-field-1",
      highlightBoxCounter: 2,
      savedAt: "2026-06-23T00:03:00.000Z",
    }),
    id: "other-draft",
    title: "Other user draft",
    createdByEmail: "other@example.com",
    savedAt: "2026-06-23T00:04:00.000Z",
  });

  assert.deepEqual(
    getUploadDraftResumeItems({
      activeUserEmail: "dpang@chunwo.com",
      currentDraft: null,
      currentDraftStatus: {
        hasDraft: false,
        label: "No draft",
      },
      savedDrafts: [savedDraft],
      templates: [{ id: "template-hr", name: "HR annual leave" }],
    }).map((item) => ({
      accessLabel: item.accessLabel,
      canDelete: item.canDelete,
      canResume: item.canResume,
    })),
    [
      {
        accessLabel: "Creator",
        canDelete: false,
        canResume: false,
      },
    ],
  );
});
