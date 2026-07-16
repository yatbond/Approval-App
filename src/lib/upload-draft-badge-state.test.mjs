import assert from "node:assert/strict";
import test from "node:test";
import { getLocalUploadDraftCount } from "./upload-draft-badge-state.ts";

const draft = {
  version: 1,
  selectedTemplateId: "template-1",
  fileName: "invoice.pdf",
  parseResult: null,
  editedFields: {},
  uploadedAttachments: [{ id: "attachment-1", fileName: "invoice.pdf" }],
  parsedDocumentId: "",
  participantEmails: {},
  highlightGroups: [],
  activeHighlightGroupId: "",
  highlightBoxCounter: 1,
  savedAt: "2026-07-16T00:00:00.000Z",
};

test("draft badge does not count a resumed named draft twice", () => {
  const savedDraft = {
    id: "draft-1",
    title: "Invoice",
    createdByEmail: "owner@example.com",
    draftKind: "named",
    savedAt: draft.savedAt,
    draft,
  };

  assert.equal(
    getLocalUploadDraftCount({
      activeDraftId: savedDraft.id,
      currentDraftJson: JSON.stringify(draft),
      savedDraftsJson: JSON.stringify([savedDraft]),
    }),
    1,
  );
});

test("draft badge counts an independent autosave and named draft", () => {
  const savedDraft = {
    id: "draft-1",
    title: "Invoice",
    createdByEmail: "owner@example.com",
    draftKind: "named",
    savedAt: draft.savedAt,
    draft,
  };

  assert.equal(
    getLocalUploadDraftCount({
      activeDraftId: "",
      currentDraftJson: JSON.stringify(draft),
      savedDraftsJson: JSON.stringify([savedDraft]),
    }),
    2,
  );
});
