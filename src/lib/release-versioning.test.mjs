import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Production release promotes only a verified immutable staged deployment", async () => {
  const script = await source("scripts/release-production.ps1");

  for (const contract of [
    '"readySubstate") "STAGED"',
    '"source") "git"',
    '"target") "production"',
    '"githubCommitSha"',
    '"githubCommitRef"',
    '"autoExposeSystemEnvs"',
    '"autoAssignCustomDomains"',
    "Get-ConfiguredProductionAliases",
    "Get-AssignedProductionAliases",
    "Set-AutoAssignCustomDomains",
    "$startMatches = [regex]::Matches($joinedText",
    "$candidate.LastIndexOf('}'",
    "$candidate.LastIndexOf(']'",
    "Get-VersionIdentity $deploymentUrl",
    "Assert-VersionIdentity $immutableIdentity",
    '"promote", $deploymentId',
    "Wait-ForProductionAlias $normalizedProductionAlias $deploymentId",
    "Assert-VersionIdentity $liveIdentity",
  ]) {
    assert.ok(script.includes(contract), contract);
  }

  assert.doesNotMatch(script, /"deploy"\s*,|"--prod"|promote"\s*,\s*\$normalizedProductionAlias/);
  assert.doesNotMatch(script, /aliasAssigned/);
  assert.doesNotMatch(script, /--silent|--show-error/);
  assert.ok(
    script.indexOf("Assert-VersionIdentity $immutableIdentity") <
      script.indexOf('"promote", $deploymentId'),
  );
  assert.ok(
    script.indexOf("Assert-VersionIdentity $liveIdentity") <
      script.indexOf('"tag", "--annotate"'),
  );
  assert.ok(
    script.indexOf("Set-AutoAssignCustomDomains $Project $false") >
      script.indexOf('"promote", $deploymentId'),
  );
  assert.ok(
    script.indexOf("Set-AutoAssignCustomDomains $Project $false") <
      script.indexOf("Assert-VersionIdentity $liveIdentity"),
  );
});

test("Preview verifies immutable identity before moving its convenience alias", async () => {
  const script = await source("scripts/deploy-preview.ps1");

  assert.match(script, /Invoke-Checked "npm" @\("run", "verify"\)/);
  assert.match(script, /Get-VersionIdentity \$deploymentUrl/);
  assert.match(script, /Assert-VersionIdentity \$immutableIdentity/);
  assert.match(script, /"alias", "set", \$deploymentUrl, \$normalizedAlias/);
  assert.ok(
    script.indexOf("Assert-VersionIdentity $immutableIdentity") <
      script.indexOf('"alias", "set", $deploymentUrl, $normalizedAlias'),
  );
  assert.doesNotMatch(script, /"promote"/);
  assert.doesNotMatch(script, /--silent|--show-error/);
});

test("the runbook and package expose the staged Production release command", async () => {
  const [runbook, packageJson] = await Promise.all([
    source("docs/deployment-runbook.md"),
    source("package.json"),
  ]);
  const packageDefinition = JSON.parse(packageJson);

  assert.equal(
    packageDefinition.scripts["release:production"],
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-production.ps1",
  );
  assert.match(runbook, /Staged Production/);
  assert.match(runbook, /npm run release:production|scripts\/release-production\.ps1/);
  assert.match(runbook, /must never be passed to `vercel promote`/);
  assert.doesNotMatch(
    runbook,
    /vercel promote https:\/\/approval-app-git-codex-approval-tracking/i,
  );
});
