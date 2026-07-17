import assert from "node:assert/strict";
import test from "node:test";
import {
  recordWorkflowOperationEvent,
  summarizeWorkflowOperationEvents,
} from "./workflow-operation-monitor.ts";

test("operation summary groups outcomes and retains recent failures", () => {
  const events = [
    {
      id: "3",
      owner_user_id: "user-1",
      owner_email: "owner@example.com",
      operation_type: "autosave",
      outcome: "succeeded",
      request_no: null,
      duration_ms: 20,
      message: "Saved",
      details: {},
      created_at: "2026-07-18T03:00:00.000Z",
    },
    {
      id: "2",
      owner_user_id: "user-1",
      owner_email: "owner@example.com",
      operation_type: "extraction",
      outcome: "failed",
      request_no: "APR-2",
      duration_ms: 200,
      message: "Provider timeout",
      details: {},
      created_at: "2026-07-18T02:00:00.000Z",
    },
    {
      id: "1",
      owner_user_id: "user-1",
      owner_email: "owner@example.com",
      operation_type: "autosave",
      outcome: "skipped",
      request_no: null,
      duration_ms: 5,
      message: "No changes",
      details: {},
      created_at: "2026-07-18T01:00:00.000Z",
    },
  ];

  const summary = summarizeWorkflowOperationEvents(events);
  assert.equal(summary.total, 3);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.byType.autosave, {
    succeeded: 1,
    failed: 0,
    skipped: 1,
    total: 2,
  });
  assert.equal(summary.recentFailures[0]?.message, "Provider timeout");
});

test("operation recording is best effort and normalizes duration", async () => {
  let inserted;
  const supabase = {
    from(table) {
      assert.equal(table, "workflow_operation_events");
      return {
        async insert(value) {
          inserted = value;
          return { error: null };
        },
      };
    },
  };

  assert.equal(
    await recordWorkflowOperationEvent(supabase, {
      ownerUserId: "user-1",
      ownerEmail: "owner@example.com",
      operationType: "routing",
      outcome: "succeeded",
      durationMs: 12.7,
    }),
    true,
  );
  assert.equal(inserted.duration_ms, 13);

  assert.equal(
    await recordWorkflowOperationEvent(
      {
        from() {
          return {
            async insert() {
              return { error: { message: "offline" } };
            },
          };
        },
      },
      {
        ownerUserId: "user-1",
        ownerEmail: "owner@example.com",
        operationType: "routing",
        outcome: "failed",
      },
    ),
    false,
  );
});
