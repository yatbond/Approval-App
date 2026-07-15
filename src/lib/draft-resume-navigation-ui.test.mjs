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
const uploadDraftControlsSource = readFileSync(
  new URL("../app/upload-draft-controls.tsx", import.meta.url),
  "utf8",
);
const uploadDraftsViewSource = readFileSync(
  new URL("../app/upload-drafts-view.tsx", import.meta.url),
  "utf8",
);

test("resumed drafts keep Drafts active and use clear draft controls", () => {
  assert.match(workspaceSource, /activeTab=\{navigationActiveTab\}/);
  assert.match(uploadDraftControlsSource, />\s*Draft controls\s*</);
  assert.match(
    uploadDraftControlsSource,
    /Drafts \(\{workInProgressItems\.length\}\)/,
  );
  assert.match(uploadDraftControlsSource, />\s*Available drafts\s*</);
  assert.match(uploadDraftControlsSource, />\s*Save as new draft\s*</);
  assert.match(uploadDraftControlsSource, />\s*Discard current work\s*</);
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
  assert.doesNotMatch(uploadDraftControlsSource, />\s*Work\s*</);
  assert.doesNotMatch(uploadDraftControlsSource, />\s*Draft progress\s*</);
});

test("draft badge and Drafts page use the same visible items", () => {
  assert.match(workspaceSource, /const uploadDraftResumeItems = useMemo/);
  assert.match(workspaceSource, /draftItemCount: uploadDraftResumeItems\.length/);
  assert.match(workspaceSource, /resumeItems=\{uploadDraftResumeItems\}/);
  assert.match(uploadDraftsViewSource, /resumeItems: UploadDraftResumeItem\[\]/);
  assert.doesNotMatch(
    workspaceSource,
    /\(uploadDraftStatus\.hasDraft \? 1 : 0\) \+ savedUploadDrafts\.length/,
  );
});
