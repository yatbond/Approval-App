import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const uploadViewSource = readFileSync(
  new URL("../app/upload-view.tsx", import.meta.url),
  "utf8",
);
const uploadRequestSetupSource = readFileSync(
  new URL("../app/upload-request-setup-panel.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../app/workspace-upload-tab.tsx", import.meta.url),
  "utf8",
);
const uploadDraftStateSource = readFileSync(
  new URL("../app/use-workspace-upload-drafts.ts", import.meta.url),
  "utf8",
);
const attachmentRouteSource = readFileSync(
  new URL("../app/api/attachments/file/route.ts", import.meta.url),
  "utf8",
);

test("saved draft files expose extraction editing and confirmed removal", () => {
  assert.match(uploadRequestSetupSource, /Edit extraction/);
  assert.match(uploadRequestSetupSource, /Remove/);
  assert.match(
    uploadRequestSetupSource,
    /onEditAttachmentExtraction\(attachment\)/,
  );
  assert.match(uploadViewSource, /editAttachmentExtraction\(attachment\)/);
  assert.match(uploadViewSource, /currentRequestInformationRef\.current\?\.scrollIntoView/);
  assert.match(uploadRequestSetupSource, /Opening saved file/);
  assert.match(workspaceSource, /openUploadAttachmentForEditing/);
  assert.match(uploadDraftStateSource, /getDraftAttachmentRemoveConfirmation/);
  assert.match(uploadDraftStateSource, /setUploadRequestDraftRows\(remainingRows\)/);
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
