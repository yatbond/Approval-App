import assert from "node:assert/strict";
import test from "node:test";
import { saveTaskFormValuesState } from "./task-form-values-state.ts";

const task = {
  id: "APR-FORM",
  extractedFields: { Existing: "Keep" },
  participants: ["owner@example.com"],
  auditTrail: [],
  lastAction: "Submitted",
};

test("saves current-node form values without clearing existing request data", () => {
  const result = saveTaskFormValuesState({
    tasks: [task],
    taskId: task.id,
    values: { "Site status": " Complete " },
    actor: { name: "Approver", email: "approver@example.com" },
    savedAt: "2026-07-16T00:00:00.000Z",
  });
  assert.equal(result.didUpdate, true);
  assert.deepEqual(result.tasks[0].extractedFields, {
    Existing: "Keep",
    "Site status": "Complete",
  });
  assert.ok(result.tasks[0].participants.includes("approver@example.com"));
  assert.match(result.tasks[0].auditTrail[0].detail, /Updated the form/);
});

test("does not create duplicate audit events when form values are unchanged", () => {
  const tasks = [task];
  const result = saveTaskFormValuesState({
    tasks,
    taskId: task.id,
    values: { Existing: "Keep" },
    actor: { name: "Approver", email: "approver@example.com" },
  });
  assert.equal(result.didUpdate, false);
  assert.equal(result.tasks, tasks);
  assert.equal(result.tasks[0], task);
});
