import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workspace delegates request parsing and submission to a focused pipeline", () => {
  const workspaceSource = readFileSync(
    "src/app/workspace-upload-tab.tsx",
    "utf8",
  );
  const pipelineSource = readFileSync(
    "src/app/use-workspace-request-pipeline.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes("useWorkspaceRequestPipeline({"), true);
  assert.equal(workspaceSource.includes("getWorkspaceParseFileStartState("), false);
  assert.equal(workspaceSource.includes("getWorkspaceRequestSubmissionState({"), false);
  assert.equal(pipelineSource.includes("getWorkspaceParseFileStartState("), true);
  assert.equal(pipelineSource.includes("getWorkspaceRequestSubmissionState({"), true);
  assert.equal(pipelineSource.includes("getWorkspaceBatchRequestSubmissionState({"), true);
});

test("request pipeline owns parse and submission status", () => {
  const workspaceSource = readFileSync(
    "src/app/workspace-upload-tab.tsx",
    "utf8",
  );
  const pipelineSource = readFileSync(
    "src/app/use-workspace-request-pipeline.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes('const [isParsing, setIsParsing] = useState(false)'), false);
  assert.equal(pipelineSource.includes('const [isParsing, setIsParsing] = useState(false)'), true);
  assert.equal(pipelineSource.includes('const [submissionMessage, setSubmissionMessage]'), true);
});
