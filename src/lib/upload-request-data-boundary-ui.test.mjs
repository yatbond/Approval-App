import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const uploadSource = readFileSync("src/app/upload-view.tsx", "utf8");
const dataPanelSource = readFileSync(
  "src/app/upload-request-data-panel.tsx",
  "utf8",
);

test("upload orchestration delegates native forms and parsed data review", () => {
  assert.match(uploadSource, /<UploadRequestDataPanel/);
  assert.doesNotMatch(uploadSource, />\s*Request form\s*</);
  assert.doesNotMatch(uploadSource, />\s*Extraction details\s*</);
  assert.match(dataPanelSource, /export function UploadRequestDataPanel/);
  assert.match(dataPanelSource, />\s*Request form\s*</);
  assert.match(dataPanelSource, />\s*Extraction details\s*</);
});

test("request data panel owns form attachments and editable extracted fields", () => {
  assert.match(dataPanelSource, /getWorkflowFormAttachmentFields/);
  assert.match(dataPanelSource, /isUploadedWorkflowFormAttachment/);
  assert.match(dataPanelSource, /<NativeFormFieldInput/);
  assert.match(dataPanelSource, /getExtractionFieldSourceLabel/);
  assert.match(dataPanelSource, /parseResult\.tables\?\.\[0\]/);
});
