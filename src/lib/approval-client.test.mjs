import assert from "node:assert/strict";
import test from "node:test";
import {
  ApprovalApiError,
  executeCanonicalApprovalAction,
  loadCanonicalApprovalTasks,
  submitCanonicalApprovalRequest,
} from "./approval-client.ts";

function task(overrides = {}) {
  return {
    id: "APR-CLIENT-1",
    stateVersion: 2,
    title: "Client request",
    workflow: "Client workflow",
    requester: "Requester",
    requesterEmail: "requester@example.com",
    department: "Finance",
    status: "pending",
    due: "Tomorrow",
    value: "HKD 100",
    currentStep: "Approval",
    currentOwner: "actor@example.com",
    participants: ["requester@example.com", "actor@example.com"],
    lastAction: "Submitted",
    extractedFields: {},
    auditTrail: [],
    ...overrides,
  };
}

function dto(overrides = {}) {
  const value = task();
  return {
    requestNo: value.id,
    version: 3,
    task: { ...value, stateVersion: undefined },
    events: [
      {
        id: "event-1",
        action: "approved",
        actor: { name: "Actor", email: "actor@example.com" },
        detail: "Approved.",
        target: null,
        createdAt: "2026-07-20T00:00:00Z",
      },
    ],
    attachments: [],
    availableActions: [],
    ...overrides,
  };
}

test("canonical action sends intent/version/key without client authority fields", async () => {
  const originalFetch = global.fetch;
  let sentBody;
  global.fetch = async (_input, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({ outcome: "applied", request: dto() });
  };
  try {
    const result = await executeCanonicalApprovalAction({
      task: task(),
      action: "approve",
      idempotencyKey: "client-command-1",
      comment: "Looks good",
    });
    assert.equal(result.task.stateVersion, 3);
    assert.equal(result.task.auditTrail.length, 1);
    assert.deepEqual(sentBody, {
      action: "approve",
      expectedVersion: 2,
      idempotencyKey: "client-command-1",
      comment: "Looks good",
    });
    assert.equal("actor" in sentBody, false);
    assert.equal("timestamp" in sentBody, false);
    assert.equal("nextState" in sentBody, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("target actions resolve an exact active directory profile ID", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input).startsWith("/api/directory")) {
      return Response.json({
        users: [
          {
            id: "00000000-0000-4000-8000-000000000009",
            email: "target@example.com",
          },
        ],
      });
    }
    return Response.json({ outcome: "applied", request: dto() });
  };
  try {
    await executeCanonicalApprovalAction({
      task: task(),
      action: "delegate",
      idempotencyKey: "client-command-2",
      targetEmail: "TARGET@example.com",
    });
    const body = JSON.parse(calls[1].init.body);
    assert.equal(body.targetProfileId, "00000000-0000-4000-8000-000000000009");
    assert.equal("targetEmail" in body, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("409 errors carry the fresh canonical task for reconciliation", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    Response.json(
      {
        error: { code: "stale_version", message: "Changed." },
        request: dto({ version: 7 }),
      },
      { status: 409 },
    );
  try {
    await assert.rejects(
      executeCanonicalApprovalAction({
        task: task(),
        action: "approve",
        idempotencyKey: "client-command-3",
      }),
      (error) => {
        assert.ok(error instanceof ApprovalApiError);
        assert.equal(error.status, 409);
        assert.equal(error.code, "stale_version");
        assert.equal(error.canonicalTask.stateVersion, 7);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("401, 403, 422, and 503 preserve stable status and machine codes", async () => {
  const originalFetch = global.fetch;
  try {
    for (const [status, code] of [
      [401, "authentication_required"],
      [403, "forbidden"],
      [422, "invalid_target"],
      [503, "dependency_unavailable"],
    ]) {
      global.fetch = async () =>
        Response.json({ error: { code, message: code } }, { status });
      await assert.rejects(
        executeCanonicalApprovalAction({
          task: task(),
          action: "approve",
          idempotencyKey: `client-${status}-key`,
        }),
        (error) =>
          error instanceof ApprovalApiError &&
          error.status === status &&
          error.code === code,
      );
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test("request pagination follows opaque cursors and produces disposable task summaries", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (input) => {
    calls.push(String(input));
    return calls.length === 1
      ? Response.json({
          items: [
            {
              requestNo: "APR-PAGE-1",
              version: 1,
              task: task({ id: "APR-PAGE-1" }),
              availableActions: ["approve"],
            },
          ],
          nextCursor: "cursor-2",
        })
      : Response.json({
          items: [
            {
              requestNo: "APR-PAGE-2",
              version: 4,
              task: task({ id: "APR-PAGE-2" }),
              availableActions: [],
            },
          ],
          nextCursor: null,
        });
  };
  try {
    const tasks = await loadCanonicalApprovalTasks("tracking");
    assert.deepEqual(
      tasks.map((item) => [item.id, item.stateVersion, item.auditTrail.length]),
      [
        ["APR-PAGE-1", 1, 0],
        ["APR-PAGE-2", 4, 0],
      ],
    );
    assert.match(calls[1], /cursor=cursor-2/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("canonical submission sends bounded attachment metadata without actor fields", async () => {
  const originalFetch = global.fetch;
  let sentBody;
  global.fetch = async (_input, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({ outcome: "applied", request: dto() }, { status: 201 });
  };
  try {
    await submitCanonicalApprovalRequest({
      templateVersionId: "00000000-0000-4000-8000-000000000020",
      title: "New request",
      extractedFields: { amount: "100" },
      participantEmails: { "approval-1": "actor@example.com" },
      attachments: [
        {
          id: "local-attachment",
          fileName: "invoice.pdf",
          documentType: "Invoice",
          format: "pdf",
          storagePath: "00000000-0000-4000-8000-000000000001/invoice/file.pdf",
          uploadedBy: "requester@example.com",
          uploadedAt: "2026-07-20T00:00:00Z",
        },
      ],
      idempotencyKey: "client-submission-1",
    });
    assert.equal(sentBody.attachments[0].storagePath.endsWith("file.pdf"), true);
    assert.equal("uploadedBy" in sentBody.attachments[0], false);
    assert.equal("actorId" in sentBody, false);
  } finally {
    global.fetch = originalFetch;
  }
});
