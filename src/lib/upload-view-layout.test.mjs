import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("request upload panel keeps compact draft controls above request content", () => {
  const source = readFileSync(new URL("../app/upload-view.tsx", import.meta.url), "utf8");
  const setupSource = readFileSync(
    new URL("../app/upload-request-setup-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.indexOf("<UploadDraftControls") <
      source.indexOf("<UploadRequestSetupPanel"),
    "Draft controls should render before request setup",
  );
  assert.ok(
    source.indexOf("<UploadRequestSetupPanel") <
      source.indexOf(">Current request information<"),
    "Files should render before current request information",
  );
  assert.match(setupSource, />\s*Request setup\s*</);
  assert.match(setupSource, />\s*Files\s*</);
});

test("document previews start unmodified at one hundred percent", () => {
  const source = readFileSync(new URL("../app/upload-view.tsx", import.meta.url), "utf8");

  assert.match(source, /useState<PreviewEnhancementMode>\("original"\)/);
  assert.match(source, /\[previewZoom, setPreviewZoom\] = useState\(100\)/);
  assert.match(source, /\[previewContrast, setPreviewContrast\] = useState\(100\)/);
  assert.match(source, /\[previewBrightness, setPreviewBrightness\] = useState\(100\)/);
});

test("new requests show a contextual workflow map", () => {
  const source = readFileSync(
    new URL("../app/request-workflow-mini-map.tsx", import.meta.url),
    "utf8",
  );
  const uploadSource = readFileSync(
    new URL("../app/upload-view.tsx", import.meta.url),
    "utf8",
  );
  const setupSource = readFileSync(
    new URL("../app/upload-request-setup-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Workflow map/);
  assert.match(source, /Current box:/);
  assert.match(
    uploadSource,
    /getWorkflowMapNodeIdForParticipantField\(nodeId\)/,
  );
  assert.match(setupSource, /onFocusParticipant\(field\.nodeId\)/);
  assert.match(uploadSource, /buildRequestWorkflowMapState/);
});

test("upload orchestration delegates focused form, map, and draft controls", () => {
  const source = readFileSync(new URL("../app/upload-view.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ NativeFormFieldInput \}/);
  assert.match(source, /import \{ RequestWorkflowMiniMap \}/);
  assert.match(source, /import \{ UploadDraftControls \}/);
  assert.match(source, /UploadRequestSetupPanel/);
  assert.doesNotMatch(source, /function NativeFormFieldInput/);
  assert.doesNotMatch(source, /function RequestWorkflowMiniMap/);
  assert.doesNotMatch(source, /function UploadDraftControls/);
  assert.doesNotMatch(source, />\s*Request setup\s*</);
});
