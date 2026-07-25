import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the public version route is dynamic, uncached, and deliberately unauthenticated", async () => {
  const route = await source("src/app/api/version/route.ts");

  assert.match(route, /dynamic = "force-dynamic"/);
  assert.match(route, /revalidate = 0/);
  assert.match(route, /Cache-Control": "no-store, max-age=0"/);
  assert.doesNotMatch(route, /createApprovalServerContext|approvalJson|process\.env\)/);
});

test("browser build identity is embedded and checked against the live alias", async () => {
  const [config, hook] = await Promise.all([
    source("next.config.ts"),
    source("src/app/use-build-version.ts"),
  ]);

  assert.match(config, /NEXT_PUBLIC_APP_BUILD_GIT_SHA/);
  assert.match(config, /NEXT_PUBLIC_APP_BUILD_ARTIFACT_ID/);
  assert.match(config, /Build identity validation failed/);
  assert.match(config, /release\.json must declare schemaVersion 1/);
  assert.match(hook, /fetch\("\/api\/version", \{ cache: "no-store" \}\)/);
  assert.match(hook, /visibilitychange/);
});

test("build identity is visible on login, in the workspace, and in Admin", async () => {
  const [login, shell, admin] = await Promise.all([
    source("src/app/login/page.tsx"),
    source("src/app/workspace-shell.tsx"),
    source("src/app/admin-view.tsx"),
  ]);

  assert.match(login, /<BuildVersionIndicator \/>/);
  assert.match(shell, /<BuildVersionIndicator collapsed=\{sidebarCollapsed\} \/>/);
  assert.match(admin, /<BuildVersionIndicator variant="panel" \/>/);
});
