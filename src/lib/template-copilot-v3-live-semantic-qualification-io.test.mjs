import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  resolveTemplateCopilotV3QualificationOutput,
  templateCopilotV3QualificationRepositoryRoot,
  writeTemplateCopilotV3QualificationReportAtomic,
} from "../../scripts/template-copilot-v3-live-semantic-qualification-io.mjs";

test("qualification repository root derives from the script URL, not cwd", () => {
  const scriptPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../scripts/test-template-copilot-v3-live-semantic-qualification.mjs",
  );
  assert.equal(
    templateCopilotV3QualificationRepositoryRoot(
      pathToFileURL(scriptPath).href,
    ),
    resolve(dirname(scriptPath), ".."),
  );
  assert.throws(
    () => templateCopilotV3QualificationRepositoryRoot("not-a-file-url"),
    /script URL is invalid/u,
  );
});

test("qualification resolver rejects an output-root junction before creating a child", async (context) => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "template-copilot-v3-root-junction-"),
  );
  const outputPath = join(repositoryRoot, "output");
  const forbiddenChild = join(repositoryRoot, "must-not-be-created");
  try {
    try {
      await symlink(
        repositoryRoot,
        outputPath,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (error.code === "EPERM" || error.code === "EACCES")
      ) {
        context.skip(
          "This host cannot create a junction or directory symlink.",
        );
        return;
      }
      throw error;
    }
    await assert.rejects(
      () =>
        resolveTemplateCopilotV3QualificationOutput({
          repositoryRoot,
          requestedOutputDirectory: "output/must-not-be-created",
          defaultRelativeOutputDirectory: "output/default",
        }),
      /must be a real directory/u,
    );
    await assert.rejects(() => access(forbiddenChild), /ENOENT/u);
  } finally {
    await unlink(outputPath).catch(() => undefined);
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("qualification resolver rejects an escaping junction before creating outside children", async (context) => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "template-copilot-v3-junction-repo-"),
  );
  const outsideRoot = await mkdtemp(
    join(tmpdir(), "template-copilot-v3-junction-outside-"),
  );
  const escapePath = join(repositoryRoot, "output", "escape");
  const outsideChild = join(outsideRoot, "child");
  try {
    await mkdir(join(repositoryRoot, "output"));
    try {
      await symlink(
        outsideRoot,
        escapePath,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (error.code === "EPERM" || error.code === "EACCES")
      ) {
        context.skip(
          "This host cannot create a junction or directory symlink.",
        );
        return;
      }
      throw error;
    }
    await assert.rejects(
      () =>
        resolveTemplateCopilotV3QualificationOutput({
          repositoryRoot,
          requestedOutputDirectory: "output/escape/child",
          defaultRelativeOutputDirectory: "output/default",
        }),
      /component escapes the governed root/u,
    );
    await assert.rejects(() => access(outsideChild), /ENOENT/u);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("qualification output stays inside repository output and writes atomically", async () => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "template-copilot-v3-io-"),
  );
  try {
    const resolvedOutput = await resolveTemplateCopilotV3QualificationOutput({
      repositoryRoot,
      requestedOutputDirectory: "output/qualification/safe",
      defaultRelativeOutputDirectory: "output/default",
    });
    assert.equal(
      resolvedOutput.outputDirectory,
      await realpath(join(repositoryRoot, "output", "qualification", "safe")),
    );
    const reportPath = join(
      resolvedOutput.outputDirectory,
      "semantic-qualification-results.json",
    );
    await writeTemplateCopilotV3QualificationReportAtomic({
      governedOutputRoot: resolvedOutput.governedOutputRoot,
      reportPath,
      value: { version: 1 },
    });
    await writeTemplateCopilotV3QualificationReportAtomic({
      governedOutputRoot: resolvedOutput.governedOutputRoot,
      reportPath,
      value: { version: 2 },
    });
    assert.deepEqual(JSON.parse(await readFile(reportPath, "utf8")), {
      version: 2,
    });
    assert.deepEqual(await readdir(resolvedOutput.outputDirectory), [
      "semantic-qualification-results.json",
    ]);

    await assert.rejects(
      () =>
        resolveTemplateCopilotV3QualificationOutput({
          repositoryRoot,
          requestedOutputDirectory: "../outside",
          defaultRelativeOutputDirectory: "output/default",
        }),
      /inside the governed repository output root/u,
    );
    await assert.rejects(
      () =>
        writeTemplateCopilotV3QualificationReportAtomic({
          governedOutputRoot: resolvedOutput.governedOutputRoot,
          reportPath: join(repositoryRoot, "outside-report.json"),
          value: { forbidden: true },
        }),
      /escapes the governed output root/u,
    );
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});
