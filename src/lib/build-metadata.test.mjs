import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveEmbeddedBuildIdentity,
  resolvePublicBuildMetadata,
} from "./build-metadata.ts";

const revisionA = "a".repeat(40);
const revisionB = "b".repeat(40);
const deploymentId = `dpl_${"A".repeat(24)}`;
const releaseName = "production-2026-07-25-version-identity";

function hostedFixture(overrides = {}) {
  return {
    releaseName,
    productionBranch: "main",
    expectedHosted: true,
    vercelEnvironment: "preview",
    vercelTargetEnvironment: "preview",
    vercelGitRef: "codex/version-visibility",
    vercelDeploymentId: deploymentId,
    vercelRuntimeGitRevision: revisionA,
    embeddedGitRevision: revisionA,
    embeddedProvenance: "vercel-git",
    embeddedArtifactId: deploymentId,
    embeddedArtifactOrigin: "vercel",
    embeddedReleaseName: releaseName,
    ...overrides,
  };
}

test("embedded identity uses a canonical full Vercel Git revision", () => {
  const result = resolveEmbeddedBuildIdentity({
    expectedHosted: true,
    vercelGitRevision: revisionA.toUpperCase(),
    vercelDeploymentId: deploymentId,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.source.revision, revisionA);
  assert.equal(result.value.source.shortRevision, revisionA.slice(0, 8));
  assert.equal(result.value.source.provenance, "vercel-git");
  assert.deepEqual(result.value.artifact, {
    id: deploymentId,
    origin: "vercel",
  });
});

test("embedded identity accepts an explicitly injected clean revision", () => {
  const result = resolveEmbeddedBuildIdentity({
    expectedHosted: true,
    injectedGitRevision: revisionA,
    customArtifactId: "workflow-run-123",
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.source.provenance, "injected-clean-git");
  assert.deepEqual(result.value.artifact, {
    id: "workflow-run-123",
    origin: "prebuilt",
  });
});

test("embedded identity fails closed for invalid, missing, or conflicting hosted data", () => {
  assert.deepEqual(
    resolveEmbeddedBuildIdentity({
      expectedHosted: true,
      vercelGitRevision: revisionA.slice(0, 7),
      vercelDeploymentId: deploymentId,
    }),
    { ok: false, code: "invalid_revision" },
  );
  assert.deepEqual(
    resolveEmbeddedBuildIdentity({
      expectedHosted: true,
      vercelDeploymentId: deploymentId,
    }),
    { ok: false, code: "missing_hosted_revision" },
  );
  assert.deepEqual(
    resolveEmbeddedBuildIdentity({
      expectedHosted: true,
      vercelGitRevision: revisionA,
    }),
    { ok: false, code: "missing_hosted_artifact" },
  );
  assert.deepEqual(
    resolveEmbeddedBuildIdentity({
      expectedHosted: true,
      vercelGitRevision: revisionA,
      injectedGitRevision: revisionB,
      vercelDeploymentId: deploymentId,
    }),
    { ok: false, code: "conflicting_revision" },
  );
});

test("local development is explicit and never masquerades as a hosted build", () => {
  const embedded = resolveEmbeddedBuildIdentity({ expectedHosted: false });
  const runtime = resolvePublicBuildMetadata({
    releaseName,
    productionBranch: "main",
    expectedHosted: false,
  });

  assert.deepEqual(embedded, {
    ok: true,
    value: {
      source: null,
      artifact: { id: null, origin: "local" },
    },
  });
  assert.equal(runtime.ok, true);
  assert.deepEqual(runtime.value.deployment, {
    platform: "local",
    environment: "local",
    id: null,
  });
  assert.equal(runtime.value.canonicalProduction, false);
});

test("a traceable Preview exposes immutable source and deployment identity", () => {
  const result = resolvePublicBuildMetadata(hostedFixture());

  assert.equal(result.ok, true);
  assert.equal(result.value.release.name, releaseName);
  assert.equal(result.value.source.revision, revisionA);
  assert.equal(result.value.deployment.environment, "preview");
  assert.equal(result.value.deployment.id, deploymentId);
  assert.equal(result.value.canonicalProduction, false);
});

test("only a matching main-branch Production Git artifact is canonical", () => {
  const canonical = resolvePublicBuildMetadata(
    hostedFixture({
      vercelEnvironment: "production",
      vercelTargetEnvironment: "production",
      vercelGitRef: "main",
    }),
  );
  const wrongBranch = resolvePublicBuildMetadata(
    hostedFixture({
      vercelEnvironment: "production",
      vercelTargetEnvironment: "production",
      vercelGitRef: "codex/version-visibility",
    }),
  );
  const injectedProduction = resolvePublicBuildMetadata(
    hostedFixture({
      vercelEnvironment: "production",
      vercelTargetEnvironment: "production",
      vercelGitRef: "main",
      vercelRuntimeGitRevision: undefined,
      injectedGitRevision: revisionA,
      embeddedProvenance: "injected-clean-git",
    }),
  );

  assert.equal(canonical.ok, true);
  assert.equal(canonical.value.canonicalProduction, true);
  assert.deepEqual(wrongBranch, {
    ok: false,
    code: "production_branch_mismatch",
  });
  assert.deepEqual(injectedProduction, {
    ok: false,
    code: "production_branch_mismatch",
  });
});

test("runtime and embedded artifact identities must agree", () => {
  assert.deepEqual(
    resolvePublicBuildMetadata(
      hostedFixture({ embeddedGitRevision: revisionB }),
    ),
    { ok: false, code: "artifact_integrity_mismatch" },
  );
  assert.deepEqual(
    resolvePublicBuildMetadata(
      hostedFixture({ embeddedArtifactId: `dpl_${"B".repeat(24)}` }),
    ),
    { ok: false, code: "artifact_integrity_mismatch" },
  );
  assert.deepEqual(
    resolvePublicBuildMetadata(
      hostedFixture({ embeddedReleaseName: "production-2026-07-01-old" }),
    ),
    { ok: false, code: "artifact_integrity_mismatch" },
  );
});

test("release names follow the immutable production tag convention", () => {
  assert.deepEqual(
    resolvePublicBuildMetadata(
      hostedFixture({ releaseName: "latest", embeddedReleaseName: "latest" }),
    ),
    { ok: false, code: "invalid_release" },
  );
});

test("the public DTO is deterministic and deliberately excludes mutable or sensitive fields", () => {
  const first = resolvePublicBuildMetadata(hostedFixture());
  const second = resolvePublicBuildMetadata(hostedFixture());
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);

  const serialized = JSON.stringify(first.value);
  for (const prohibited of [
    "commitMessage",
    "author",
    "repository",
    "projectId",
    "region",
    "productionUrl",
    "commitRef",
    "0.1.0",
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
});
