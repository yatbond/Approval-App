import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const uploadViewSource = readFileSync(
  new URL("../app/upload-view.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../app/approval-workspace.tsx", import.meta.url),
  "utf8",
);
const attachmentRouteSource = readFileSync(
  new URL("../app/api/attachments/file/route.ts", import.meta.url),
  "utf8",
);

test("saved draft files expose extraction editing and confirmed removal", () => {
  assert.match(uploadViewSource, /Edit extraction/);
  assert.match(uploadViewSource, /Remove/);
  assert.match(uploadViewSource, /editAttachmentExtraction\(attachment\)/);
  assert.match(uploadViewSource, /currentRequestInformationRef\.current\?\.scrollIntoView/);
  assert.match(workspaceSource, /openUploadAttachmentForEditing/);
  assert.match(workspaceSource, /getDraftAttachmentRemoveConfirmation/);
  assert.match(workspaceSource, /setUploadRequestDraftRows\(remainingRows\)/);
});

test("stored draft files are retrieved and deleted through an owner-scoped route", () => {
  assert.match(attachmentRouteSource, /supabase\.auth\.getUser\(\)/);
  assert.match(
    attachmentRouteSource,
    /storagePath\.startsWith\(`\$\{user\.id\}\/`\)/,
  );
  assert.match(attachmentRouteSource, /\.download\(attachment\.storagePath\)/);
  assert.match(attachmentRouteSource, /\.remove\(\[attachment\.storagePath\]\)/);
  assert.match(attachmentRouteSource, /"Cache-Control": "private, no-store"/);
});
