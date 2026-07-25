"use client";

import type { WorkflowTemplate } from "./types.ts";
import { templateRequirementsDossierV1Schema } from "./template-authoring-contracts.ts";
import { createTemplateDefinitionV1 } from "./template-authoring-definition.ts";

type SyncCallbacks = {
  onRevision: (revision: number) => void;
  onError: (message: string) => void;
};

const queues = new Map<string, Promise<void>>();
const knownRevisions = new Map<string, number>();

export function queueTemplateAuthoringDraftSync({
  template,
  actorEmail,
  changeReason,
  callbacks,
}: {
  template: WorkflowTemplate;
  actorEmail: string;
  changeReason: string;
  callbacks: SyncCallbacks;
}) {
  const draftId = template.authoringDraftId;
  const parsedDossier = templateRequirementsDossierV1Schema.safeParse(
    template.authoringDossier,
  );
  if (!draftId || !parsedDossier.success) return;

  const previous = queues.get(draftId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const expectedRevision =
        knownRevisions.get(draftId) || template.authoringRevision || 1;
      const definition = createTemplateDefinitionV1({
        template,
        sourceDossierId: parsedDossier.data.dossierId,
        mode: "manual",
        generatedAt: new Date().toISOString(),
        generatedByEmail: actorEmail,
      });
      const result = await putDraft({
        draftId,
        expectedRevision,
        dossier: parsedDossier.data,
        definition,
        changeReason,
      });
      knownRevisions.set(draftId, result.revision);
      callbacks.onRevision(result.revision);
    })
    .catch((error) => {
      callbacks.onError(
        error instanceof Error
          ? error.message
          : "The authoritative template draft could not be synchronized.",
      );
    });
  queues.set(draftId, next);
}

async function putDraft({
  draftId,
  expectedRevision,
  dossier,
  definition,
  changeReason,
}: {
  draftId: string;
  expectedRevision: number;
  dossier: unknown;
  definition: unknown;
  changeReason: string;
}) {
  const response = await fetch(`/api/template-authoring/drafts/${draftId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedRevision,
      dossier,
      definition,
      changeReason: changeReason.slice(0, 2_000) || "Updated in visual builder",
      idempotencyKey: `builder:${crypto.randomUUID()}`,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    revision?: number;
    currentRevision?: number;
    error?: { message?: string };
  };
  if (response.status === 409 && payload.currentRevision) {
    knownRevisions.set(draftId, payload.currentRevision);
    throw new Error(
      "This template changed in another tab. Reload it before making more edits.",
    );
  }
  if (!response.ok || !payload.revision) {
    throw new Error(
      payload.error?.message ||
        "The authoritative template draft could not be synchronized.",
    );
  }
  return { revision: payload.revision };
}
