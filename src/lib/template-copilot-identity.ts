import { createHash } from "node:crypto";

export function createStableTemplateCopilotArtifactIdentity({
  sessionId,
  idempotencyKey,
  generatedAt,
}: {
  sessionId: string;
  idempotencyKey: string;
  generatedAt: string;
}) {
  const digest = createHash("sha256")
    .update(`${sessionId}\n${idempotencyKey}`)
    .digest("hex");
  return {
    generatedAt,
    dossierId: `dossier-${digest.slice(0, 32)}`,
    templateId: `template-${digest.slice(32, 64)}`,
    suffix: digest.slice(0, 12),
  };
}
