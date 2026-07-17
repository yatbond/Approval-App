import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceCoreSource = readFileSync(
  new URL("../app/approval-workspace-core.tsx", import.meta.url),
  "utf8",
);
const workspaceDraftsSource = readFileSync(
  new URL("../app/workspace-drafts-tab.tsx", import.meta.url),
  "utf8",
);
const uploadViewSource = readFileSync(
  new URL("../app/upload-view.tsx", import.meta.url),
  "utf8",
);
const uploadRequestSetupSource = readFileSync(
  new URL("../app/upload-request-setup-panel.tsx", import.meta.url),
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
const uploadDraftStateSource = readFileSync(
  new URL("../app/use-workspace-upload-drafts.ts", import.meta.url),
  "utf8",
);

test("resumed drafts keep Drafts active and use clear draft controls", () => {
  assert.match(workspaceCoreSource, /activeTab=\{navigationActiveTab\}/);
  assert.match(uploadDraftControlsSource, />\s*Draft controls\s*</);
  assert.match(
    uploadDraftControlsSource,
    /Drafts \(\{workInProgressItems\.length\}\)/,
  );
  assert.match(uploadDraftControlsSource, />\s*Available drafts\s*</);
  assert.match(uploadDraftControlsSource, />\s*Save as new draft\s*</);
  assert.match(uploadDraftControlsSource, />\s*Discard current work\s*</);
  assert.match(uploadRequestSetupSource, />\s*Request setup\s*</);
  assert.match(uploadViewSource, />\s*Current request information\s*</);
  assert.match(
    uploadViewSource,
    /Changes stay with this draft and do not train the workflow template\./,
  );
  assert.doesNotMatch(
    uploadViewSource,
    /Corrections here become training examples for workflow-specific extraction\./,
  );
  assert.ok(
    uploadViewSource.indexOf("<UploadRequestSetupPanel") <
      uploadViewSource.indexOf(">Current request information<"),
  );
  assert.match(uploadRequestSetupSource, />\s*Files\s*</);
  assert.match(
    uploadDraftStateSource,
    /options\?\.asNew\s*\?\s*crypto\.randomUUID\(\)\s*:\s*selectedUploadDraftId/,
  );
  assert.doesNotMatch(uploadDraftControlsSource, />\s*Work\s*</);
  assert.doesNotMatch(uploadDraftControlsSource, />\s*Draft progress\s*</);
  assert.doesNotMatch(uploadDraftsViewSource, />\s*New\s*</);
});

test("draft badge and Drafts page use the same visible items", () => {
  assert.match(uploadDraftStateSource, /const uploadDraftResumeItems = useMemo/);
  assert.match(
    workspaceDraftsSource,
    /setDraftItemCount\(drafts\.uploadDraftResumeItems\.length\)/,
  );
  assert.match(
    workspaceDraftsSource,
    /resumeItems=\{drafts\.uploadDraftResumeItems\}/,
  );
  assert.match(uploadDraftsViewSource, /resumeItems: UploadDraftResumeItem\[\]/);
  assert.doesNotMatch(
    uploadDraftStateSource,
    /\(uploadDraftStatus\.hasDraft \? 1 : 0\) \+ savedUploadDrafts\.length/,
  );
});
