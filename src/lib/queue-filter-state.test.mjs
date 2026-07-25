import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterQueueTasks,
  getQueueFilterCounts,
} from "./queue-filter-state.ts";

const baseTask = {
  id: "TASK-1",
  title: "Invoice",
  workflow: "Invoice approval",
  requester: "Requester",
  requesterEmail: "requester@example.com",
  department: "Finance",
  status: "pending",
  due: "Today",
  value: "HKD 100",
  currentStep: "Finance approval",
  currentOwner: "owner@example.com",
  participants: [],
  lastAction: "Submitted",
  extractedFields: {},
  auditTrail: [],
};

test("filters attention and delegated queue tasks", () => {
  const tasks = [
    baseTask,
    { ...baseTask, id: "TASK-2", status: "overdue" },
    { ...baseTask, id: "TASK-3", status: "escalated" },
    { ...baseTask, id: "TASK-4", status: "delegated" },
  ];

  assert.deepEqual(
    filterQueueTasks({
      tasks,
      filter: "attention",
      activeUserEmail: "owner@example.com",
    }).map((task) => task.id),
    ["TASK-2", "TASK-3"],
  );
  assert.deepEqual(
    filterQueueTasks({
      tasks,
      filter: "delegated",
      activeUserEmail: "owner@example.com",
    }).map((task) => task.id),
    ["TASK-4"],
  );
});

test("only shows reassignment requests addressed to the active user", () => {
  const tasks = [
    {
      ...baseTask,
      id: "TASK-2",
      reassignmentRequests: [
        {
          id: "reassign-1",
          fromEmail: "owner@example.com",
          toEmail: "NEXT@example.com",
          status: "requested",
          requestedAt: "2026-07-13T00:00:00.000Z",
        },
      ],
    },
    {
      ...baseTask,
      id: "TASK-3",
      reassignmentRequests: [
        {
          id: "reassign-2",
          fromEmail: "owner@example.com",
          toEmail: "other@example.com",
          status: "requested",
          requestedAt: "2026-07-13T00:00:00.000Z",
        },
      ],
    },
  ];

  assert.deepEqual(
    filterQueueTasks({
      tasks,
      filter: "reassignment",
      activeUserEmail: "next@example.com",
    }).map((task) => task.id),
    ["TASK-2"],
  );
});

test("returns stable counts for every filter", () => {
  const tasks = [
    baseTask,
    { ...baseTask, id: "TASK-2", status: "overdue" },
    { ...baseTask, id: "TASK-3", status: "delegated" },
  ];

  assert.deepEqual(
    getQueueFilterCounts({ tasks, activeUserEmail: "owner@example.com" }),
    { all: 3, attention: 1, delegated: 1, reassignment: 0 },
  );
});
