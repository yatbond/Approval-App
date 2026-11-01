import assert from "node:assert/strict";
import test from "node:test";
import {
  getTemplateCopilotV2PlaybackSourceRevision,
  getTemplateCopilotV2PublishedSourceRevision,
} from "./template-copilot-v2-lifecycle.ts";

const sessionId = "11111111-1111-4111-8111-111111111111";

test("playback uses the frozen fact revision before the draft-link increment", () => {
  assert.equal(
    getTemplateCopilotV2PlaybackSourceRevision({
      revision: 21,
      status: "draft_created",
      draftId: "22222222-2222-4222-8222-222222222222",
    }),
    20,
  );
  assert.equal(
    getTemplateCopilotV2PlaybackSourceRevision({
      revision: 20,
      status: "ready",
      draftId: null,
    }),
    20,
  );
});

test("only an immutable publication with the exact session binding satisfies activation readiness", () => {
  const exact = {
    status: "published",
    published_version_id: "33333333-3333-4333-8333-333333333333",
    definition: {
      generation: {
        sourceSessionId: sessionId,
        sourceSessionRevision: 20,
      },
    },
  };
  assert.equal(
    getTemplateCopilotV2PublishedSourceRevision({ draft: exact, sessionId }),
    20,
  );
  for (const draft of [
    { ...exact, status: "approved" },
    { ...exact, published_version_id: null },
    {
      ...exact,
      definition: {
        generation: {
          sourceSessionId: "44444444-4444-4444-8444-444444444444",
          sourceSessionRevision: 20,
        },
      },
    },
    {
      ...exact,
      definition: {
        generation: {
          sourceSessionId: sessionId,
        },
      },
    },
    {
      ...exact,
      definition: {
        generation: {
          mode: "manual",
        },
      },
    },
  ]) {
    assert.equal(
      getTemplateCopilotV2PublishedSourceRevision({ draft, sessionId }),
      undefined,
    );
  }
});


