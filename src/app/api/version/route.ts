import releaseManifest from "../../../../release.json";
import { resolvePublicBuildMetadata } from "@/lib/build-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const versionHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  const resolved = resolvePublicBuildMetadata({
    releaseName: releaseManifest.name,
    productionBranch: releaseManifest.productionBranch,
    expectedHosted:
      process.env.VERCEL === "1" || process.env.APP_EXPECT_VERCEL === "1",
    vercelEnvironment: process.env.VERCEL_ENV,
    vercelTargetEnvironment: process.env.VERCEL_TARGET_ENV,
    vercelGitRef: process.env.VERCEL_GIT_COMMIT_REF,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    vercelRuntimeGitRevision: process.env.VERCEL_GIT_COMMIT_SHA,
    injectedGitRevision: process.env.APP_BUILD_GIT_SHA,
    embeddedGitRevision: process.env.NEXT_PUBLIC_APP_BUILD_GIT_SHA,
    embeddedProvenance: process.env.NEXT_PUBLIC_APP_BUILD_PROVENANCE,
    embeddedArtifactId: process.env.NEXT_PUBLIC_APP_BUILD_ARTIFACT_ID,
    embeddedArtifactOrigin:
      process.env.NEXT_PUBLIC_APP_BUILD_ARTIFACT_ORIGIN,
    embeddedReleaseName: process.env.NEXT_PUBLIC_APP_RELEASE_NAME,
  });

  if (!resolved.ok) {
    console.error(
      JSON.stringify({
        event: "build_metadata_invalid",
        code: resolved.code,
      }),
    );
    return Response.json(
      {
        error: {
          code: "build_metadata_unavailable",
          message: "Build identity is unavailable for this deployment.",
        },
      },
      { status: 503, headers: versionHeaders },
    );
  }

  return Response.json(resolved.value, { headers: versionHeaders });
}
