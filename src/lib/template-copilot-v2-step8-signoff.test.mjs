import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTemplateCopilotV2Step8Signoff } from "./template-copilot-v2-step8-signoff.ts";

const metadata = {
  schemaVersion: 1,
  candidateSourceRevision: "884c70e0cac38744eade26557b5c99b3c6696232",
  questionLibraryVersion: "v2.2",
  conceptLibraryVersion: "concepts.v1.0",
  reviewPackageRows: 1176,
  conceptContentFingerprint: "fnv1a64:4a149e693daab18d",
  questionContentFingerprint: "fnv1a64:df415823535ac40f",
};

const approved = (reviewerName, evidenceReference) => ({
  decision: "approved",
  reviewerName,
  reviewedAt: "2026-07-28T18:00:00+08:00",
  evidenceReference,
  attestsAllRowsReviewed: true,
});

test("pending signoff is structurally valid but cannot satisfy the Step 8 production gate", () => {
  const result = validateTemplateCopilotV2Step8Signoff({
    ...metadata,
    locales: {
      en: { decision: "pending" },
      "zh-Hant": { decision: "pending" },
      "zh-Hans": { decision: "pending" },
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.productionReady, false);
});

test("all three exact candidate locales require complete accountable human approval", () => {
  const result = validateTemplateCopilotV2Step8Signoff({
    ...metadata,
    locales: {
      en: approved("Alex Chan", "CORP-STEP8-EN"),
      "zh-Hant": approved("王偉", "CORP-STEP8-HK"),
      "zh-Hans": approved("李伟", "CORP-STEP8-CN"),
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.productionReady, true);
});

test("placeholder reviewers, missing evidence, false attestations, and candidate drift fail closed", () => {
  const base = {
    ...metadata,
    locales: {
      en: approved("Alex Chan", "CORP-STEP8-EN"),
      "zh-Hant": approved("Mei Wong", "CORP-STEP8-HK"),
      "zh-Hans": approved("Li Wei", "CORP-STEP8-CN"),
    },
  };
  for (const invalid of [
    { ...base, locales: { ...base.locales, en: approved("Unassigned reviewer", "CORP-STEP8-EN") } },
    { ...base, locales: { ...base.locales, en: approved("TBD", "N/A") } },
    { ...base, locales: { ...base.locales, en: approved("Test Reviewer", "xxx") } },
    { ...base, locales: { ...base.locales, en: approved("Unknown Person", "test") } },
    { ...base, locales: { ...base.locales, en: approved("John Doe", "none") } },
    { ...base, locales: { ...base.locales, en: approved("Jane Doe", "example reference") } },
    { ...base, locales: { ...base.locales, en: { ...approved("Alex Chan", "CORP-STEP8-EN"), evidenceReference: "" } } },
    { ...base, locales: { ...base.locales, en: { ...approved("Alex Chan", "CORP-STEP8-EN"), attestsAllRowsReviewed: false } } },
    { ...base, questionContentFingerprint: "fnv1a64:0000000000000000" },
    { ...base, reviewPackageRows: 1175 },
  ]) {
    const result = validateTemplateCopilotV2Step8Signoff(invalid);
    assert.equal(result.valid, false);
    assert.equal(result.productionReady, false);
    assert.ok(result.issues.length > 0);
  }
});

test("a rejection requires accountable evidence and never becomes production-ready", () => {
  const result = validateTemplateCopilotV2Step8Signoff({
    ...metadata,
    locales: {
      en: {
        ...approved("Alex Chan", "CORP-STEP8-EN"),
        decision: "rejected",
        issuesSummary: "The terminology requires revision.",
      },
      "zh-Hant": approved("Mei Wong", "CORP-STEP8-HK"),
      "zh-Hans": approved("Li Wei", "CORP-STEP8-CN"),
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.productionReady, false);
});

test("the CLI distinguishes pending, approved, rejected, and invalid operational outcomes", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "step8-signoff-"));
  const script = fileURLToPath(new URL("../../scripts/validate-template-copilot-v2-step8-signoff.mjs", import.meta.url));
  const run = (path) => spawnSync(process.execPath, ["--import", "tsx", script, path], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    encoding: "utf8",
  });
  const write = async (name, value) => {
    const path = join(temporaryDirectory, name);
    await writeFile(path, JSON.stringify(value), "utf8");
    return path;
  };
  try {
    const pendingPath = await write("pending.json", {
      ...metadata,
      locales: { en: { decision: "pending" }, "zh-Hant": { decision: "pending" }, "zh-Hans": { decision: "pending" } },
    });
    const approvedPath = await write("approved.json", {
      ...metadata,
      locales: {
        en: approved("Alex Chan", "CORP-STEP8-EN"),
        "zh-Hant": approved("Mei Wong", "CORP-STEP8-HK"),
        "zh-Hans": approved("Li Wei", "CORP-STEP8-CN"),
      },
    });
    const rejectedPath = await write("rejected.json", {
      ...metadata,
      locales: {
        en: { ...approved("Alex Chan", "CORP-STEP8-EN"), decision: "rejected", issuesSummary: "Revise terminology." },
        "zh-Hant": approved("Mei Wong", "CORP-STEP8-HK"),
        "zh-Hans": approved("Li Wei", "CORP-STEP8-CN"),
      },
    });
    const invalidPath = await write("invalid.json", {
      ...metadata,
      locales: {
        en: approved("TBD", "N/A"),
        "zh-Hant": approved("Mei Wong", "CORP-STEP8-HK"),
        "zh-Hans": approved("Li Wei", "CORP-STEP8-CN"),
      },
    });

    const pending = run(pendingPath);
    assert.equal(pending.status, 2);
    assert.match(pending.stderr, /step8_signoff=PENDING/);
    const complete = run(approvedPath);
    assert.equal(complete.status, 0);
    assert.match(complete.stdout, /step8_signoff=APPROVED/);
    const rejected = run(rejectedPath);
    assert.equal(rejected.status, 3);
    assert.match(rejected.stderr, /step8_signoff=REJECTED/);
    const invalid = run(invalidPath);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /step8_signoff=INVALID/);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
