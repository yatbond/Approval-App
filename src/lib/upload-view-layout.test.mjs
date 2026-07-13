import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("request upload panel keeps compact draft controls above request content", () => {
  const source = readFileSync(new URL("../app/upload-view.tsx", import.meta.url), "utf8");

  assert.ok(
    source.indexOf("<UploadDraftControls") < source.indexOf(">Request setup<"),
    "Draft controls should render before request setup",
  );
  assert.ok(
    source.indexOf(">Files<") < source.indexOf(">Current request information<"),
    "Files should render before current request information",
  );
});

test("document previews start unmodified at one hundred percent", () => {
  const source = readFileSync(new URL("../app/upload-view.tsx", import.meta.url), "utf8");

  assert.match(source, /useState<PreviewEnhancementMode>\("original"\)/);
  assert.match(source, /\[previewZoom, setPreviewZoom\] = useState\(100\)/);
  assert.match(source, /\[previewContrast, setPreviewContrast\] = useState\(100\)/);
  assert.match(source, /\[previewBrightness, setPreviewBrightness\] = useState\(100\)/);
});

test("new requests show a contextual workflow map", () => {
  const source = readFileSync(new URL("../app/upload-view.tsx", import.meta.url), "utf8");

  assert.match(source, /Workflow map/);
  assert.match(source, /Current box:/);
  assert.match(source, /getWorkflowMapNodeIdForParticipantField\(field\.nodeId\)/);
  assert.match(source, /buildRequestWorkflowMapState/);
});
