import assert from "node:assert/strict";
import test from "node:test";

import { loadTemplateCopilotV2PublishedSourceRevision } from "./template-copilot-v2-server-data.ts";

const sessionId = "44444444-4444-4444-8444-444444444444";
const draftId = "55555555-5555-4555-8555-555555555555";
const dossier = { dossierId: "dossier-1", purpose: "Approved purchases" };
const definition = {
  generation: {
    mode: "copilot",
    sourceSessionId: sessionId,
    sourceSessionRevision: 9,
  },
  template: { name: "Purchase approval" },
};

function serviceFor({ storedArtifact, draft = {} }) {
  const rows = {
    template_authoring_drafts: {
      data: {
        status: "published",
        dossier,
        definition,
        published_version_id: "66666666-6666-4666-8666-666666666666",
        ...draft,
      },
      error: null,
    },
    template_copilot_sessions: {
      data: {
        status: "draft_created",
        draft_id: draftId,
        generated_source_revision: 9,
        generated_artifact: storedArtifact,
      },
      error: null,
    },
  };
  return {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve(rows[table]);
        },
      };
    },
  };
}

test("published readiness accepts only the exact server-owned generated artifact", async () => {
  assert.equal(
    await loadTemplateCopilotV2PublishedSourceRevision({
      service: serviceFor({
        storedArtifact: { dossier, definition },
      }),
      sessionId,
      draftId,
    }),
    9,
  );
});

test("published readiness fails closed after a dossier or definition edit", async () => {
  for (const storedArtifact of [
    { dossier: { ...dossier, purpose: "Earlier purpose" }, definition },
    {
      dossier,
      definition: {
        ...definition,
        template: { name: "Earlier workflow" },
      },
    },
  ]) {
    assert.equal(
      await loadTemplateCopilotV2PublishedSourceRevision({
        service: serviceFor({ storedArtifact }),
        sessionId,
        draftId,
      }),
      undefined,
    );
  }
});
