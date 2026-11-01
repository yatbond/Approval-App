import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export function templateCopilotV3QualificationRepositoryRoot(scriptUrl) {
  if (typeof scriptUrl !== "string" || !scriptUrl.startsWith("file:")) {
    throw new Error("The qualification script URL is invalid.");
  }
  return resolve(dirname(fileURLToPath(scriptUrl)), "..");
}

export async function resolveTemplateCopilotV3QualificationOutput({
  repositoryRoot,
  requestedOutputDirectory,
  defaultRelativeOutputDirectory,
}) {
  const repository = await realpath(repositoryRoot);
  const governedOutputCandidate = join(repository, "output");
  let governedOutputEntry;
  try {
    governedOutputEntry = await lstat(governedOutputCandidate);
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) {
      throw error;
    }
    try {
      await mkdir(governedOutputCandidate);
    } catch (mkdirError) {
      if (!(
        mkdirError &&
        typeof mkdirError === "object" &&
        mkdirError.code === "EEXIST"
      )) {
        throw mkdirError;
      }
    }
    governedOutputEntry = await lstat(governedOutputCandidate);
  }
  if (
    governedOutputEntry.isSymbolicLink() ||
    !governedOutputEntry.isDirectory()
  ) {
    throw new Error(
      "The governed qualification output root must be a real directory.",
    );
  }
  const governedOutputRoot = await realpath(governedOutputCandidate);
  const verifiedOutputEntry = await lstat(governedOutputCandidate);
  if (
    verifiedOutputEntry.isSymbolicLink() ||
    !verifiedOutputEntry.isDirectory()
  ) {
    throw new Error(
      "The governed qualification output root must be a real directory.",
    );
  }
  if (!samePath(governedOutputCandidate, governedOutputRoot)) {
    throw new Error(
      "The governed qualification output root must resolve exactly to repository output.",
    );
  }
  const raw =
    requestedOutputDirectory?.trim() || defaultRelativeOutputDirectory;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("The qualification output directory is missing.");
  }
  const candidate = resolve(repository, raw);
  if (!pathIsInside(governedOutputRoot, candidate)) {
    throw new Error(
      "Qualification output must stay inside the governed repository output root.",
    );
  }
  await ensureContainedDirectoryTree(governedOutputRoot, candidate);
  const outputDirectory = await realpath(candidate);
  if (!pathIsInside(governedOutputRoot, outputDirectory)) {
    throw new Error(
      "The resolved qualification output directory escapes the governed root.",
    );
  }
  return Object.freeze({
    repositoryRoot: repository,
    governedOutputRoot,
    outputDirectory,
  });
}

export async function writeTemplateCopilotV3QualificationReportAtomic({
  governedOutputRoot,
  reportPath,
  value,
}) {
  const outputRoot = await realpath(governedOutputRoot);
  const destinationDirectory = await realpath(dirname(reportPath));
  if (
    !pathIsInside(outputRoot, destinationDirectory) ||
    !pathIsInside(outputRoot, reportPath)
  ) {
    throw new Error(
      "The qualification report path escapes the governed output root.",
    );
  }
  try {
    const destination = await lstat(reportPath);
    if (destination.isSymbolicLink() || !destination.isFile()) {
      throw new Error(
        "The qualification report destination must be a regular file.",
      );
    }
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) {
      throw error;
    }
  }
  const temporaryPath = join(
    destinationDirectory,
    `.${basename(reportPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  if (!pathIsInside(outputRoot, temporaryPath)) {
    throw new Error("The qualification report temporary path is invalid.");
  }
  let renamed = false;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, reportPath);
    renamed = true;
  } finally {
    if (!renamed) {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}

async function ensureContainedDirectoryTree(governedOutputRoot, candidate) {
  const pathFromRoot = relative(governedOutputRoot, candidate);
  const components = pathFromRoot
    .split(sep)
    .filter((component) => component && component !== ".");
  let currentDirectory = governedOutputRoot;
  for (const component of components) {
    const nextDirectory = join(currentDirectory, component);
    let exists = true;
    try {
      await lstat(nextDirectory);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        exists = false;
      } else {
        throw error;
      }
    }
    if (!exists) {
      await mkdir(nextDirectory);
    }
    const resolvedDirectory = await realpath(nextDirectory);
    if (!pathIsInside(governedOutputRoot, resolvedDirectory)) {
      throw new Error(
        "An existing qualification output component escapes the governed root.",
      );
    }
    if (!(await stat(resolvedDirectory)).isDirectory()) {
      throw new Error(
        "Every qualification output component must be a directory.",
      );
    }
    currentDirectory = resolvedDirectory;
  }
}

function pathIsInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}

function samePath(left, right) {
  return relative(left, right) === "" && relative(right, left) === "";
}
