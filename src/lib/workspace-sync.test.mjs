import assert from "node:assert/strict";
import test from "node:test";
import {
  deactivateRemoteWorkspaceAdminRecord,
  loadRemoteWorkspaceState,
  saveRemoteWorkspaceState,
} from "./workspace-sync.ts";

test("loads remote workspace state from the workspace API", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        mode: "supabase",
        snapshot: { approvalTasks: [{ id: "task-1" }] },
      }),
    };
  };

  try {
    const result = await loadRemoteWorkspaceState();

    assert.equal(calls[0].url, "/api/workspace");
    assert.deepEqual(calls[0].init, { method: "GET" });
    assert.deepEqual(result, {
      mode: "supabase",
      snapshot: { approvalTasks: [{ id: "task-1" }] },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports local mode when remote workspace load fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ mode: "local" }),
  });

  try {
    assert.deepEqual(await loadRemoteWorkspaceState(), {
      mode: "local",
      reason: "GET failed: 500",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports fetch errors during remote workspace load", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network offline");
  };

  try {
    assert.deepEqual(await loadRemoteWorkspaceState(), {
      mode: "local",
      reason: "network offline",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saves remote workspace state to the workspace API", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const snapshot = { approvalTasks: [{ id: "task-1" }], workflowTemplates: [] };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({ mode: "supabase", snapshot }),
    };
  };

  try {
    const result = await saveRemoteWorkspaceState(snapshot);

    assert.equal(calls[0].url, "/api/workspace");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(calls[0].init.headers, { "content-type": "application/json" });
    assert.deepEqual(JSON.parse(calls[0].init.body), { snapshot });
    assert.deepEqual(result, { mode: "supabase", snapshot });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports local mode when remote workspace save fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ mode: "local" }),
  });

  try {
    assert.deepEqual(await saveRemoteWorkspaceState({ approvalTasks: [] }), {
      mode: "local",
      reason: "POST failed: 409",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports fetch errors during remote workspace save", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("write failed");
  };

  try {
    assert.deepEqual(await saveRemoteWorkspaceState({ approvalTasks: [] }), {
      mode: "local",
      reason: "write failed",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("includes the workspace API failure reason when admin deactivation fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({
      mode: "local",
      reason: "No active template version matched this delete request.",
    }),
  });

  try {
    const result = await deactivateRemoteWorkspaceAdminRecord({
      type: "template",
      templateKey: "missing-template",
      versionNumber: 10,
    });

    assert.deepEqual(result, {
      mode: "local",
      reason:
        "PATCH failed: 503 - No active template version matched this delete request.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to status-only admin failure when reason payload cannot be read", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("invalid json");
    },
  });

  try {
    const result = await deactivateRemoteWorkspaceAdminRecord({
      type: "department",
      departmentId: "finance",
    });

    assert.deepEqual(result, {
      mode: "local",
      reason: "PATCH failed: 502",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports fetch errors during admin deactivation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("patch unavailable");
  };

  try {
    const result = await deactivateRemoteWorkspaceAdminRecord({
      type: "business",
      businessId: "business-aai-db",
    });

    assert.deepEqual(result, {
      mode: "local",
      reason: "patch unavailable",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
