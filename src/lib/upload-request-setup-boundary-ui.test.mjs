import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const uploadSource = readFileSync("src/app/upload-view.tsx", "utf8");
const setupSource = readFileSync(
  "src/app/upload-request-setup-panel.tsx",
  "utf8",
);

test("upload orchestration delegates request setup to one component", () => {
  assert.match(uploadSource, /<UploadRequestSetupPanel/);
  assert.doesNotMatch(uploadSource, />\s*Request setup\s*</);
  assert.match(setupSource, /export function UploadRequestSetupPanel/);
  assert.match(setupSource, />\s*Request setup\s*</);
});

test("request setup owns template participants files and draft row selection", () => {
  assert.match(setupSource, /getWorkflowParticipantEmailFields/);
  assert.match(setupSource, /renderUploadDocumentRequirement/);
  assert.match(setupSource, /onEditAttachmentExtraction\(attachment\)/);
  assert.match(setupSource, /requestDrafts\.map/);
  assert.match(setupSource, /Missing uploads:/);
});
