export function getTemplateCopilotV2PlaybackSourceRevision({
  revision,
  status,
  draftId,
}: {
  revision: number;
  status: string;
  draftId?: string | null;
}) {
  if (!Number.isInteger(revision) || revision < 1) return undefined;
  // Linking the exact generated draft is the only lifecycle operation that
  // increments the frozen session after its final fact revision.
  return status === "draft_created" && draftId && revision > 1
    ? revision - 1
    : revision;
}

export function getTemplateCopilotV2PublishedSourceRevision({
  draft,
  sessionId,
}: {
  draft: unknown;
  sessionId: string;
}) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return undefined;
  }
  const row = draft as Record<string, unknown>;
  if (
    row.status !== "published" ||
    typeof row.published_version_id !== "string" ||
    !row.published_version_id
  ) {
    return undefined;
  }
  const definition =
    row.definition &&
    typeof row.definition === "object" &&
    !Array.isArray(row.definition)
      ? (row.definition as Record<string, unknown>)
      : {};
  const generation =
    definition.generation &&
    typeof definition.generation === "object" &&
    !Array.isArray(definition.generation)
      ? (definition.generation as Record<string, unknown>)
      : {};
  return generation.sourceSessionId === sessionId &&
    Number.isInteger(generation.sourceSessionRevision) &&
    Number(generation.sourceSessionRevision) > 0
    ? Number(generation.sourceSessionRevision)
    : undefined;
}
