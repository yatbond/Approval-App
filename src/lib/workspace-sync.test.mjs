import assert from "node:assert/strict";
import test from "node:test";
import { deactivateRemoteWorkspaceAdminRecord } from "./workspace-sync.ts";

test("sends admin deactivation commands to the workspace API", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({ mode: "supabase" }),
    };
  };

  try {
    const result = await deactivateRemoteWorkspaceAdminRecord({
      type: "template",
      templateKey: "template-finance",
      versionNumber: 2,
    });

    assert.equal(result.mode, "supabase");
    assert.equal(calls[0].url, "/api/workspace");
    assert.equal(calls[0].init.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      action: "deactivate_admin_record",
      record: {
        type: "template",
        templateKey: "template-finance",
        versionNumber: 2,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports local mode when admin deactivation fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ mode: "local" }),
  });

  try {
    const result = await deactivateRemoteWorkspaceAdminRecord({
      type: "business",
      businessId: "business-aai-db",
    });

    assert.deepEqual(result, { mode: "local", reason: "PATCH failed: 403" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
