import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(
  new URL("../app/approval-workspace.tsx", import.meta.url),
  "utf8",
);
const uploadViewSource = readFileSync(
  new URL("../app/upload-view.tsx", import.meta.url),
  "utf8",
);

test("resumed drafts keep Drafts active and use clear draft controls", () => {
  assert.match(workspaceSource, /activeTab=\{navigationActiveTab\}/);
  assert.match(uploadViewSource, />\s*Draft controls\s*</);
  assert.match(uploadViewSource, /Drafts \(\{workInProgressItems\.length\}\)/);
  assert.match(uploadViewSource, />\s*Available drafts\s*</);
  assert.match(uploadViewSource, />\s*Save as new draft\s*</);
  assert.match(uploadViewSource, />\s*Discard current work\s*</);
  assert.match(uploadViewSource, />\s*Request setup\s*</);
  assert.match(uploadViewSource, />\s*Current request information\s*</);
  assert.ok(
    uploadViewSource.indexOf(">Files<") <
      uploadViewSource.indexOf(">Current request information<"),
  );
  assert.match(
    workspaceSource,
    /options\?\.asNew \? crypto\.randomUUID\(\) : selectedUploadDraftId/,
  );
  assert.doesNotMatch(uploadViewSource, />\s*Work\s*</);
  assert.doesNotMatch(uploadViewSource, />\s*Draft progress\s*</);
});
