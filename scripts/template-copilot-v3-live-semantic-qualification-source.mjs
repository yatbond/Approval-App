import { execFileSync } from "node:child_process";

const sourceStateErrorMessage =
  "The governed qualification Git source state could not be read.";

export function readTemplateCopilotV3QualificationGitState(
  repositoryRoot,
  { execGit = execFileSync } = {},
) {
  if (
    typeof repositoryRoot !== "string" ||
    !repositoryRoot.trim() ||
    typeof execGit !== "function"
  ) {
    throw new Error(sourceStateErrorMessage);
  }
  return Object.freeze({
    sourceRevision: readGit(["rev-parse", "HEAD"], repositoryRoot, execGit),
    worktreeStatus: readGit(["status", "--porcelain"], repositoryRoot, execGit),
  });
}

function readGit(args, repositoryRoot, execGit) {
  try {
    const output = execGit("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (typeof output !== "string") {
      throw new Error(sourceStateErrorMessage);
    }
    return output.trim();
  } catch {
    throw new Error(sourceStateErrorMessage);
  }
}
