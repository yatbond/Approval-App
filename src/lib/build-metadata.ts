export type BuildMetadataErrorCode =
  | "artifact_integrity_mismatch"
  | "conflicting_revision"
  | "invalid_artifact_id"
  | "invalid_release"
  | "invalid_revision"
  | "missing_deployment_environment"
  | "missing_deployment_id"
  | "missing_hosted_artifact"
  | "missing_hosted_revision"
  | "production_branch_mismatch";

export type Resolution<T> =
  | { ok: true; value: T }
  | { ok: false; code: BuildMetadataErrorCode };

export type BuildSource = Readonly<{
  kind: "git";
  revision: string;
  shortRevision: string;
  provenance: "vercel-git" | "injected-clean-git";
}>;

export type BuildArtifact = Readonly<{
  id: string | null;
  origin: "vercel" | "prebuilt" | "local";
}>;

export type PublicBuildMetadata = Readonly<{
  schemaVersion: 1;
  application: "approval-app";
  release: Readonly<{
    name: string;
  }>;
  source: BuildSource | null;
  artifact: BuildArtifact;
  deployment: Readonly<
    | {
        platform: "vercel";
        environment: "production" | "preview" | "development" | "custom";
        id: string;
      }
    | {
        platform: "local";
        environment: "local";
        id: null;
      }
  >;
  canonicalProduction: boolean;
}>;

export type EmbeddedBuildIdentity = Readonly<{
  source: BuildSource | null;
  artifact: BuildArtifact;
}>;

const fullGitRevisionPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const vercelDeploymentIdPattern = /^dpl_[A-Za-z0-9]{16,80}$/;
const customArtifactIdPattern = /^(?!dpl_)[A-Za-z0-9._-]{1,32}$/;
const releaseNamePattern =
  /^production-\d{4}-\d{2}-\d{2}-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export function isValidReleaseName(value: string): boolean {
  return releaseNamePattern.test(value);
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeRevision(value: string | undefined): Resolution<string | null> {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    return { ok: true, value: null };
  }
  if (!fullGitRevisionPattern.test(normalized)) {
    return { ok: false, code: "invalid_revision" };
  }
  return { ok: true, value: normalized.toLowerCase() };
}

function resolveSource(input: {
  vercelGitRevision?: string;
  injectedGitRevision?: string;
}): Resolution<BuildSource | null> {
  const vercelRevision = normalizeRevision(input.vercelGitRevision);
  if (!vercelRevision.ok) {
    return vercelRevision;
  }
  const injectedRevision = normalizeRevision(input.injectedGitRevision);
  if (!injectedRevision.ok) {
    return injectedRevision;
  }
  if (
    vercelRevision.value &&
    injectedRevision.value &&
    vercelRevision.value !== injectedRevision.value
  ) {
    return { ok: false, code: "conflicting_revision" };
  }

  const revision = vercelRevision.value ?? injectedRevision.value;
  if (!revision) {
    return { ok: true, value: null };
  }

  return {
    ok: true,
    value: {
      kind: "git",
      revision,
      shortRevision: revision.slice(0, 8),
      provenance: vercelRevision.value ? "vercel-git" : "injected-clean-git",
    },
  };
}

function normalizeVercelDeploymentId(
  value: string | undefined,
): Resolution<string | null> {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    return { ok: true, value: null };
  }
  if (!vercelDeploymentIdPattern.test(normalized)) {
    return { ok: false, code: "invalid_artifact_id" };
  }
  return { ok: true, value: normalized };
}

function normalizeCustomArtifactId(
  value: string | undefined,
): Resolution<string | null> {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    return { ok: true, value: null };
  }
  if (!customArtifactIdPattern.test(normalized)) {
    return { ok: false, code: "invalid_artifact_id" };
  }
  return { ok: true, value: normalized };
}

export function resolveEmbeddedBuildIdentity(input: {
  expectedHosted: boolean;
  vercelGitRevision?: string;
  injectedGitRevision?: string;
  vercelDeploymentId?: string;
  customArtifactId?: string;
}): Resolution<EmbeddedBuildIdentity> {
  const source = resolveSource(input);
  if (!source.ok) {
    return source;
  }
  if (input.expectedHosted && !source.value) {
    return { ok: false, code: "missing_hosted_revision" };
  }

  const vercelDeploymentId = normalizeVercelDeploymentId(
    input.vercelDeploymentId,
  );
  if (!vercelDeploymentId.ok) {
    return vercelDeploymentId;
  }
  const customArtifactId = normalizeCustomArtifactId(input.customArtifactId);
  if (!customArtifactId.ok) {
    return customArtifactId;
  }

  if (vercelDeploymentId.value && customArtifactId.value) {
    return { ok: false, code: "invalid_artifact_id" };
  }
  if (input.expectedHosted && !vercelDeploymentId.value && !customArtifactId.value) {
    return { ok: false, code: "missing_hosted_artifact" };
  }

  const artifact: BuildArtifact = vercelDeploymentId.value
    ? { id: vercelDeploymentId.value, origin: "vercel" }
    : customArtifactId.value
      ? { id: customArtifactId.value, origin: "prebuilt" }
      : { id: null, origin: "local" };

  return { ok: true, value: { source: source.value, artifact } };
}

function normalizeEnvironment(input: {
  vercelEnvironment?: string;
  vercelTargetEnvironment?: string;
}): PublicBuildMetadata["deployment"]["environment"] | null {
  const environment = normalizeOptional(input.vercelEnvironment)?.toLowerCase();
  if (
    environment === "production" ||
    environment === "preview" ||
    environment === "development"
  ) {
    return environment;
  }
  return normalizeOptional(input.vercelTargetEnvironment) ? "custom" : null;
}

export function resolvePublicBuildMetadata(input: {
  releaseName: string;
  productionBranch: string;
  expectedHosted: boolean;
  vercelEnvironment?: string;
  vercelTargetEnvironment?: string;
  vercelGitRef?: string;
  vercelDeploymentId?: string;
  vercelRuntimeGitRevision?: string;
  injectedGitRevision?: string;
  embeddedGitRevision?: string;
  embeddedProvenance?: string;
  embeddedArtifactId?: string;
  embeddedArtifactOrigin?: string;
  embeddedReleaseName?: string;
}): Resolution<PublicBuildMetadata> {
  if (!isValidReleaseName(input.releaseName)) {
    return { ok: false, code: "invalid_release" };
  }

  const runtimeSource = resolveSource({
    vercelGitRevision: input.vercelRuntimeGitRevision,
    injectedGitRevision: input.injectedGitRevision,
  });
  if (!runtimeSource.ok) {
    return runtimeSource;
  }

  if (!input.expectedHosted) {
    return {
      ok: true,
      value: {
        schemaVersion: 1,
        application: "approval-app",
        release: { name: input.releaseName },
        source: runtimeSource.value,
        artifact: { id: null, origin: "local" },
        deployment: {
          platform: "local",
          environment: "local",
          id: null,
        },
        canonicalProduction: false,
      },
    };
  }

  if (!runtimeSource.value) {
    return { ok: false, code: "missing_hosted_revision" };
  }

  const deploymentId = normalizeVercelDeploymentId(input.vercelDeploymentId);
  if (!deploymentId.ok) {
    return deploymentId;
  }
  if (!deploymentId.value) {
    return { ok: false, code: "missing_deployment_id" };
  }

  const environment = normalizeEnvironment(input);
  if (!environment || environment === "local") {
    return { ok: false, code: "missing_deployment_environment" };
  }

  const embeddedRevision = normalizeRevision(input.embeddedGitRevision);
  if (!embeddedRevision.ok) {
    return embeddedRevision;
  }
  if (
    !embeddedRevision.value ||
    embeddedRevision.value !== runtimeSource.value.revision
  ) {
    return { ok: false, code: "artifact_integrity_mismatch" };
  }
  if (input.embeddedProvenance !== runtimeSource.value.provenance) {
    return { ok: false, code: "artifact_integrity_mismatch" };
  }
  if (input.embeddedReleaseName !== input.releaseName) {
    return { ok: false, code: "artifact_integrity_mismatch" };
  }

  let artifact: BuildArtifact;
  if (input.embeddedArtifactOrigin === "vercel") {
    if (input.embeddedArtifactId !== deploymentId.value) {
      return { ok: false, code: "artifact_integrity_mismatch" };
    }
    artifact = { id: deploymentId.value, origin: "vercel" };
  } else if (input.embeddedArtifactOrigin === "prebuilt") {
    const customArtifactId = normalizeCustomArtifactId(input.embeddedArtifactId);
    if (!customArtifactId.ok || !customArtifactId.value) {
      return { ok: false, code: "artifact_integrity_mismatch" };
    }
    artifact = { id: customArtifactId.value, origin: "prebuilt" };
  } else {
    return { ok: false, code: "artifact_integrity_mismatch" };
  }

  const canonicalProduction =
    environment === "production" &&
    runtimeSource.value.provenance === "vercel-git" &&
    artifact.origin === "vercel" &&
    input.vercelGitRef === input.productionBranch;

  if (environment === "production" && !canonicalProduction) {
    return { ok: false, code: "production_branch_mismatch" };
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      application: "approval-app",
      release: { name: input.releaseName },
      source: runtimeSource.value,
      artifact,
      deployment: {
        platform: "vercel",
        environment,
        id: deploymentId.value,
      },
      canonicalProduction,
    },
  };
}
