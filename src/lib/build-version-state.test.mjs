import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicBuildMetadata,
  resolveBuildVersionState,
} from "./build-version-state.ts";

const revision = "a".repeat(40);
const deploymentId = `dpl_${"A".repeat(24)}`;
const metadata = {
  schemaVersion: 1,
  application: "approval-app",
  release: { name: "production-2026-07-25-version-identity" },
  source: {
    kind: "git",
    revision,
    shortRevision: revision.slice(0, 8),
    provenance: "vercel-git",
  },
  artifact: { id: deploymentId, origin: "vercel" },
  deployment: {
    platform: "vercel",
    environment: "preview",
    id: deploymentId,
  },
  canonicalProduction: false,
};

test("matching browser and server artifacts are current", () => {
  assert.deepEqual(
    resolveBuildVersionState({
      browser: {
        releaseName: metadata.release.name,
        revision,
        artifactId: deploymentId,
      },
      server: metadata,
    }),
    { kind: "current", metadata },
  );
});

test("a different artifact or source revision requires a reload", () => {
  const differentArtifact = resolveBuildVersionState({
    browser: {
      releaseName: metadata.release.name,
      revision,
      artifactId: `dpl_${"B".repeat(24)}`,
    },
    server: metadata,
  });
  const oldBrowser = resolveBuildVersionState({
    browser: {
      releaseName: metadata.release.name,
      revision: null,
      artifactId: null,
    },
    server: metadata,
  });

  assert.equal(differentArtifact.kind, "update-available");
  assert.equal(oldBrowser.kind, "update-available");
});

test("local and unavailable version states are explicit", () => {
  const localMetadata = {
    ...metadata,
    source: null,
    artifact: { id: null, origin: "local" },
    deployment: { platform: "local", environment: "local", id: null },
  };

  assert.equal(
    resolveBuildVersionState({
      browser: { releaseName: null, revision: null, artifactId: null },
      server: localMetadata,
    }).kind,
    "local",
  );
  assert.deepEqual(
    resolveBuildVersionState({
      browser: { releaseName: null, revision: null, artifactId: null },
      server: null,
    }),
    { kind: "unavailable" },
  );
});

test("the client rejects malformed version payloads", () => {
  assert.equal(isPublicBuildMetadata(metadata), true);
  assert.equal(isPublicBuildMetadata({ ...metadata, schemaVersion: 2 }), false);
  assert.equal(
    isPublicBuildMetadata({
      ...metadata,
      deployment: { platform: "vercel", environment: "preview" },
    }),
    false,
  );
});
