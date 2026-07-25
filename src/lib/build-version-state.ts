import type { PublicBuildMetadata } from "./build-metadata";

export type BrowserBuildIdentity = Readonly<{
  releaseName: string | null;
  revision: string | null;
  artifactId: string | null;
}>;

export type BuildVersionState =
  | { kind: "loading" }
  | { kind: "local"; metadata: PublicBuildMetadata }
  | { kind: "current"; metadata: PublicBuildMetadata }
  | {
      kind: "update-available";
      metadata: PublicBuildMetadata;
      runningRevision: string | null;
      runningArtifactId: string | null;
    }
  | { kind: "unavailable" };

export function isPublicBuildMetadata(
  value: unknown,
): value is PublicBuildMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const deployment = candidate.deployment as Record<string, unknown> | undefined;
  const release = candidate.release as Record<string, unknown> | undefined;
  const artifact = candidate.artifact as Record<string, unknown> | undefined;
  const source = candidate.source as Record<string, unknown> | null | undefined;
  const validSource =
    source === null ||
    (source?.kind === "git" &&
      typeof source.revision === "string" &&
      /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(source.revision) &&
      source.shortRevision === source.revision.slice(0, 8) &&
      (source.provenance === "vercel-git" ||
        source.provenance === "injected-clean-git"));
  const validLocalDeployment =
    deployment?.platform === "local" &&
    deployment.environment === "local" &&
    deployment.id === null &&
    artifact?.origin === "local" &&
    artifact.id === null;
  const validHostedDeployment =
    deployment?.platform === "vercel" &&
    (deployment.environment === "production" ||
      deployment.environment === "preview" ||
      deployment.environment === "development" ||
      deployment.environment === "custom") &&
    typeof deployment.id === "string" &&
    (artifact?.origin === "vercel" || artifact?.origin === "prebuilt") &&
    typeof artifact.id === "string" &&
    source !== null;

  return (
    candidate.schemaVersion === 1 &&
    candidate.application === "approval-app" &&
    typeof release?.name === "string" &&
    typeof candidate.canonicalProduction === "boolean" &&
    validSource &&
    (validLocalDeployment || validHostedDeployment)
  );
}

export function resolveBuildVersionState(input: {
  browser: BrowserBuildIdentity;
  server: PublicBuildMetadata | null;
}): BuildVersionState {
  if (!input.server) {
    return { kind: "unavailable" };
  }
  if (input.server.deployment.platform === "local") {
    return { kind: "local", metadata: input.server };
  }

  const availableRevision = input.server.source?.revision ?? null;
  const availableArtifactId = input.server.artifact.id;
  if (
    !input.browser.revision ||
    !input.browser.artifactId ||
    input.browser.releaseName !== input.server.release.name ||
    input.browser.revision !== availableRevision ||
    input.browser.artifactId !== availableArtifactId
  ) {
    return {
      kind: "update-available",
      metadata: input.server,
      runningRevision: input.browser.revision,
      runningArtifactId: input.browser.artifactId,
    };
  }

  return { kind: "current", metadata: input.server };
}
