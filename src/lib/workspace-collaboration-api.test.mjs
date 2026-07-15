import assert from "node:assert/strict";
import { test } from "node:test";
import { persistWorkspaceCollaborationTransition } from "./workspace-collaboration-api.ts";

test("posts collaboration transitions to the workspace API", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return {
      ok: true,
      json: async () => ({}),
    };
  };

  try {
    const task = { id: "APR-1" };
    const notifications = [{ id: "notice-1" }];
    await persistWorkspaceCollaborationTransition({ task, notifications });

    assert.equal(request.url, "/api/workflow-collaboration");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(request.init.body), { task, notifications });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports collaboration API failure reasons", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ reason: "Write rejected" }),
  });

  try {
    await assert.rejects(
      persistWorkspaceCollaborationTransition({
        task: { id: "APR-1" },
        notifications: [],
      }),
      /Write rejected/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses a stable collaboration failure when the response has no JSON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => {
      throw new Error("Invalid JSON");
    },
  });

  try {
    await assert.rejects(
      persistWorkspaceCollaborationTransition({
        task: { id: "APR-1" },
        notifications: [],
      }),
      /Collaboration persistence failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
