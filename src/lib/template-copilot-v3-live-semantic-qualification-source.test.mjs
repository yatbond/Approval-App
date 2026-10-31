import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTemplateCopilotV3QualificationSource,
  templateCopilotV3QualificationSourceStateMatches,
} from "../../scripts/template-copilot-v3-live-semantic-qualification-runner.mjs";
import { readTemplateCopilotV3QualificationGitState } from "../../scripts/template-copilot-v3-live-semantic-qualification-source.mjs";

const repositoryRoot = "C:\\governed-qualification-repository";
const sourceRevision = "a".repeat(40);
const sourceStateErrorMessage =
  "The governed qualification Git source state could not be read.";

test("initial Git status failure throws safely and produces no comparable source identity", () => {
  const calls = [];
  let sourceIdentity;
  let thrown;
  try {
    const initialSourceState = readTemplateCopilotV3QualificationGitState(
      repositoryRoot,
      {
        execGit: statusFailingGitExecutor(calls),
      },
    );
    sourceIdentity = assertTemplateCopilotV3QualificationSource({
      ...initialSourceState,
      allowDirtySource: false,
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.equal(thrown.message, sourceStateErrorMessage);
  assert.doesNotMatch(thrown.message, /apiKeyABC123|credential/u);
  assert.equal(sourceIdentity, undefined);
  assert.deepEqual(calls, [
    ["rev-parse", "HEAD"],
    ["status", "--porcelain"],
  ]);
});

test("ending Git status failure throws safely and cannot mark a run comparable", () => {
  const initialSourceState = readTemplateCopilotV3QualificationGitState(
    repositoryRoot,
    {
      execGit: successfulGitExecutor,
    },
  );
  const sourceIdentity = assertTemplateCopilotV3QualificationSource({
    ...initialSourceState,
    allowDirtySource: false,
  });
  assert.equal(sourceIdentity.comparableCleanSource, true);

  const calls = [];
  let sourceEndCheckPassed = false;
  let thrown;
  try {
    const endingSourceState = readTemplateCopilotV3QualificationGitState(
      repositoryRoot,
      {
        execGit: statusFailingGitExecutor(calls),
      },
    );
    sourceEndCheckPassed = templateCopilotV3QualificationSourceStateMatches({
      sourceRevision: initialSourceState.sourceRevision,
      worktreeStatus: initialSourceState.worktreeStatus,
      endingSourceRevision: endingSourceState.sourceRevision,
      endingWorktreeStatus: endingSourceState.worktreeStatus,
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.equal(thrown.message, sourceStateErrorMessage);
  assert.doesNotMatch(thrown.message, /apiKeyABC123|credential/u);
  assert.equal(sourceEndCheckPassed, false);
  assert.deepEqual(calls, [
    ["rev-parse", "HEAD"],
    ["status", "--porcelain"],
  ]);
});

function successfulGitExecutor(file, args, options) {
  assert.equal(file, "git");
  assert.equal(options.cwd, repositoryRoot);
  assert.equal(options.encoding, "utf8");
  assert.deepEqual(options.stdio, ["ignore", "pipe", "ignore"]);
  return args[0] === "rev-parse" ? `${sourceRevision}\n` : "";
}

function statusFailingGitExecutor(calls) {
  return (file, args, options) => {
    calls.push([...args]);
    if (args[0] === "rev-parse") {
      return successfulGitExecutor(file, args, options);
    }
    const error = new Error(
      "credential apiKeyABC123 must never reach the surfaced error",
    );
    error.status = 128;
    throw error;
  };
}
