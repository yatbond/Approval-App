import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const barrelSource = readFileSync("src/app/task-views.tsx", "utf8");
const queueSource = readFileSync("src/app/queue-view.tsx", "utf8");
const trackingSource = readFileSync("src/app/tracking-view.tsx", "utf8");
const detailSource = readFileSync("src/app/task-detail-panels.tsx", "utf8");
const currentFormsSource = readFileSync("src/app/current-node-forms-panel.tsx", "utf8");
const currentDocumentDataSource = readFileSync(
  "src/app/current-node-document-data-panel.tsx",
  "utf8",
);

test("task views remain a compatibility barrel with focused owners", () => {
  assert.match(barrelSource, /QueueView.*queue-view/);
  assert.match(barrelSource, /TrackingView.*tracking-view/);
  assert.match(barrelSource, /UserDirectoryDatalist.*task-detail-panels/);
  assert.doesNotMatch(barrelSource, /function QueueView/);
  assert.doesNotMatch(barrelSource, /function TrackingView/);
});

test("queue and tracking own their separate interaction state", () => {
  assert.match(queueSource, /export function QueueView/);
  assert.match(queueSource, /getQueueActionList/);
  assert.doesNotMatch(queueSource, /export function TrackingView/);
  assert.match(trackingSource, /export function TrackingView/);
  assert.match(trackingSource, /expandedHistoryTaskId/);
  assert.doesNotMatch(trackingSource, /getQueueActionList/);
});

test("reusable task detail panels have one implementation owner", () => {
  assert.match(detailSource, /function HandoffVisibilityPanel/);
  assert.match(detailSource, /function TaskPathAndHistory/);
  assert.match(detailSource, /export function UserDirectoryDatalist/);
  assert.doesNotMatch(queueSource, /function TaskPathAndHistory/);
  assert.doesNotMatch(trackingSource, /function TaskPathAndHistory/);
});

test("Inbox renders and enforces Approval-box forms and extracted document data", () => {
  assert.match(queueSource, /<CurrentNodeFormsPanel/);
  assert.match(queueSource, /<CurrentNodeDocumentDataPanel/);
  assert.match(queueSource, /currentFormIssues\.length > 0/);
  assert.match(queueSource, /currentDocumentFieldIssues\.length > 0/);
  assert.match(currentFormsSource, /Open Microsoft Form/);
  assert.match(currentFormsSource, /Save form/);
  assert.match(currentDocumentDataSource, /Save document data/);
});
