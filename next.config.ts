import type { NextConfig } from "next";
import releaseManifest from "./release.json";
import {
  isValidReleaseName,
  resolveEmbeddedBuildIdentity,
} from "./src/lib/build-metadata";

if (
  releaseManifest.schemaVersion !== 1 ||
  !isValidReleaseName(releaseManifest.name) ||
  releaseManifest.productionBranch !== "main"
) {
  throw new Error(
    "release.json must declare schemaVersion 1, a production-YYYY-MM-DD-description name, and productionBranch main.",
  );
}

const expectedHosted =
  process.env.VERCEL === "1" || process.env.APP_EXPECT_VERCEL === "1";
const embeddedIdentity = resolveEmbeddedBuildIdentity({
  expectedHosted,
  vercelGitRevision: process.env.VERCEL_GIT_COMMIT_SHA,
  injectedGitRevision: process.env.APP_BUILD_GIT_SHA,
  vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  customArtifactId: process.env.APP_BUILD_ARTIFACT_ID,
});

if (!embeddedIdentity.ok) {
  throw new Error(
    `Build identity validation failed: ${embeddedIdentity.code}. ` +
      "Use a Vercel Git deployment or inject a clean full Git SHA and artifact ID.",
  );
}

const nextConfig: NextConfig = {
  ...(embeddedIdentity.value.artifact.origin === "prebuilt" &&
  embeddedIdentity.value.artifact.id
    ? { deploymentId: embeddedIdentity.value.artifact.id }
    : {}),
  env: {
    NEXT_PUBLIC_APP_RELEASE_NAME: releaseManifest.name,
    NEXT_PUBLIC_APP_BUILD_GIT_SHA:
      embeddedIdentity.value.source?.revision ?? "",
    NEXT_PUBLIC_APP_BUILD_PROVENANCE:
      embeddedIdentity.value.source?.provenance ?? "",
    NEXT_PUBLIC_APP_BUILD_ARTIFACT_ID:
      embeddedIdentity.value.artifact.id ?? "",
    NEXT_PUBLIC_APP_BUILD_ARTIFACT_ORIGIN:
      embeddedIdentity.value.artifact.origin,
  },
};

export default nextConfig;
