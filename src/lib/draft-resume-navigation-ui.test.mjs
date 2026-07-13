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

test("resumed drafts keep Drafts active and use clear draft progress wording", () => {
  assert.match(workspaceSource, /activeTab=\{navigationActiveTab\}/);
  assert.match(uploadViewSource, />\s*Draft progress\s*</);
  assert.doesNotMatch(uploadViewSource, />\s*Work\s*</);
});
