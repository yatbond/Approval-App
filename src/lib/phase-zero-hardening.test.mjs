import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("package and CI run recursive tests and explicit typechecking", () => {
  const packageJson = JSON.parse(read("../../package.json"));
  const workflow = read("../../.github/workflows/ci.yml");

  assert.equal(packageJson.engines.node, ">=22.6.0");
  assert.match(packageJson.scripts.test, /src\/\*\*\/\*\.test\.mjs/);
  assert.equal(packageJson.scripts.typegen, "next typegen");
  assert.match(packageJson.scripts.typecheck, /npm run typegen/);
  assert.match(packageJson.scripts.typecheck, /tsc --noEmit/);
  assert.match(workflow, /npm run typecheck/);
});

test("Admin surfaces contain no mock alerts, inert delegation, or silent role limits", () => {
  const admin = read("../app/admin-view.tsx");
  const mockData = read("./mock-data.ts");

  assert.doesNotMatch(admin, /@\/lib\/mock-data/);
  assert.doesNotMatch(admin, /Save delegation/);
  assert.doesNotMatch(admin, /userDirectory\.slice\(0,\s*10\)/);
  assert.doesNotMatch(admin, /roleAssignments\.slice\(0,\s*8\)/);
  assert.doesNotMatch(mockData, /export const notifications/);
});

test("Supabase JSON API routes preserve refreshed response cookies", () => {
  const routeFiles = [
    "../app/api/attachments/file/route.ts",
    "../app/api/attachments/upload/route.ts",
    "../app/api/email/task-notifications/route.ts",
    "../app/api/email/test/route.ts",
    "../app/api/operations/route.ts",
    "../app/api/parse/route.ts",
    "../app/api/upload-drafts/route.ts",
    "../app/api/workflow-collaboration/route.ts",
    "../app/api/workspace/route.ts",
  ];

  for (const routeFile of routeFiles) {
    assert.match(read(routeFile), /createSupabaseJsonResponse/);
  }
});

test("workspace has a recoverable render error boundary", () => {
  const errorBoundary = read("../app/error.tsx");

  assert.match(errorBoundary, /unstable_retry/);
  assert.match(errorBoundary, /clearRecoverableApprovalLocalState/);
  assert.doesNotMatch(errorBoundary, /Your server data is safe/);
});

test("confirmation dialog manages keyboard focus and duplicate actions", () => {
  const confirmationModal = read("../app/confirmation-modal.tsx");

  assert.match(confirmationModal, /aria-modal="true"/);
  assert.match(confirmationModal, /event\.key === "Escape"/);
  assert.match(confirmationModal, /event\.key !== "Tab"/);
  assert.match(confirmationModal, /previouslyFocused\?\.focus\(\)/);
  assert.match(confirmationModal, /actionHandledRef\.current/);
});

test("large local upload drafts are serialized after a debounce", () => {
  const uploadDrafts = read("../app/use-workspace-upload-drafts.ts");

  assert.match(uploadDrafts, /localUploadAutosaveDelayMs = 500/);
  assert.match(uploadDrafts, /window\.setTimeout/);
  assert.match(uploadDrafts, /serializeUploadRequestDraft\(nextDraft\)/);
  assert.match(uploadDrafts, /window\.clearTimeout/);
});
