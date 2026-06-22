import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteSavedUploadRequestDraft,
  loadSavedUploadRequestDrafts,
  saveSavedUploadRequestDraft,
} from "./upload-request-draft-api.ts";

const savedDraft = {
  id: "upload-draft-1",
  title: "Invoice draft",
  createdByEmail: "dpang@chunwo.com",
  createdByUserId: "user-1",
  savedAt: "2026-06-23T00:02:00.000Z",
  draft: {
    version: 1,
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult: null,
    editedFields: {},
    uploadedAttachments: [],
    highlightGroups: [],
    activeHighlightGroupId: "",
    highlightBoxCounter: 1,
    savedAt: "2026-06-23T00:02:00.000Z",
  },
};

test("loads saved upload request drafts from the draft API", async () => {
  let capturedUrl = "";
  const drafts = await loadSavedUploadRequestDrafts({
    fetcher: async (url) => {
      capturedUrl = String(url);
      return Response.json({ drafts: [savedDraft] });
    },
  });

  assert.equal(capturedUrl, "/api/upload-drafts");
  assert.deepEqual(drafts, [savedDraft]);
});

test("saves a creator-owned upload request draft through the draft API", async () => {
  let capturedUrl = "";
  let capturedInit;
  await saveSavedUploadRequestDraft({
    draft: savedDraft,
    fetcher: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({ draft: savedDraft });
    },
  });

  assert.equal(capturedUrl, "/api/upload-drafts");
  assert.equal(capturedInit.method, "POST");
  assert.deepEqual(JSON.parse(capturedInit.body), { draft: savedDraft });
});

test("deletes a saved upload request draft through the draft API", async () => {
  let capturedUrl = "";
  let capturedInit;
  await deleteSavedUploadRequestDraft({
    draftId: "upload-draft-1",
    fetcher: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({ ok: true });
    },
  });

  assert.equal(capturedUrl, "/api/upload-drafts?id=upload-draft-1");
  assert.equal(capturedInit.method, "DELETE");
});

test("throws draft API errors", async () => {
  await assert.rejects(
    loadSavedUploadRequestDrafts({
      fetcher: async () =>
        Response.json({ error: "Sign in before loading drafts." }, { status: 401 }),
    }),
    /Sign in before loading drafts\./,
  );
});
