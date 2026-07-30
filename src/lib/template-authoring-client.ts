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
type ActivationResult = Readonly<{
  outcome: "applied" | "replayed";
  familyId: string;
  publishedVersionId: string;
  versionNumber: number;
  active: true;
}>;
type ActivationAttempt = {
  idempotencyKey: string;
  inFlight: Promise<ActivationResult> | null;
};
const activationAttempts = new Map<string, ActivationAttempt>();

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

export function activateTemplateAuthoringVersionClient({
  publishedVersionId,
  expectedVersionNumber,
}: {
  publishedVersionId: string;
  expectedVersionNumber: number;
}) {
  const attemptKey = `${publishedVersionId}:${expectedVersionNumber}`;
  const prior = activationAttempts.get(attemptKey);
  if (prior?.inFlight) return prior.inFlight;
  const attempt =
    prior || {
      idempotencyKey: `activate:${crypto.randomUUID()}`,
      inFlight: null,
    };
  const request = (async () => {
    try {
      const response = await fetch(
        `/api/template-authoring/versions/${publishedVersionId}/activate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersionNumber,
            idempotencyKey: attempt.idempotencyKey,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        outcome?: string;
        familyId?: string;
        publishedVersionId?: string;
        versionNumber?: number;
        active?: boolean;
        currentVersionNumber?: number;
        error?: { message?: string };
      };
      if (
        response.ok &&
        ["applied", "replayed"].includes(String(payload.outcome)) &&
        payload.familyId &&
        payload.publishedVersionId === publishedVersionId &&
        payload.versionNumber === expectedVersionNumber &&
        payload.active === true
      ) {
        activationAttempts.delete(attemptKey);
        return payload as ActivationResult;
      }
      if (response.status < 500) {
        activationAttempts.delete(attemptKey);
      }
      if (response.status === 409 && payload.currentVersionNumber) {
        throw new Error(
          `This published version is now v${payload.currentVersionNumber}. Reload before activating it.`,
        );
      }
      throw new Error(
        payload.error?.message ||
          "The exact published template version could not be activated.",
      );
    } finally {
      const current = activationAttempts.get(attemptKey);
      if (current === attempt) current.inFlight = null;
    }
  })();
  attempt.inFlight = request;
  activationAttempts.set(attemptKey, attempt);
  return request;
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
