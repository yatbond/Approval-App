import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getQueueActionList,
  getQueueActionModeToggleState,
  shouldShowQueueAdvancedActions,
  shouldShowQueueContributorRequest,
  shouldShowQueueReassignActions,
} from "./queue-advanced-actions-state.ts";

test("keeps the combined advanced queue toggle hidden for originator actions", () => {
  assert.equal(
    shouldShowQueueAdvancedActions({
      isOriginatorAction: true,
      isExpanded: true,
    }),
    false,
  );
  assert.equal(
    shouldShowQueueAdvancedActions({
      isOriginatorAction: false,
      isExpanded: false,
    }),
    false,
  );
  assert.equal(
    shouldShowQueueAdvancedActions({
      isOriginatorAction: false,
      isExpanded: true,
    }),
    true,
  );
});

test("keeps reassign and contributor options hidden until expanded", () => {
  assert.equal(
    shouldShowQueueReassignActions({
      isOriginatorAction: false,
      isExpanded: false,
    }),
    false,
  );
  assert.equal(
    shouldShowQueueContributorRequest({
      isOriginatorAction: false,
      isExpanded: false,
    }),
    false,
  );
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: false,
      showReassignActions: false,
    }),
    ["approve", "approve_with_comment", "reject", "reject_with_comment"],
  );
});

test("shows only reassign while reassign mode is expanded", () => {
  assert.equal(
    shouldShowQueueReassignActions({
      isOriginatorAction: false,
      isExpanded: true,
    }),
    true,
  );
  assert.equal(
    shouldShowQueueContributorRequest({
      isOriginatorAction: false,
      isExpanded: false,
    }),
    false,
  );
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: false,
      actionMode: "reassign",
    }),
    ["reassign"],
  );
});

test("shows only delegate while delegate mode is expanded", () => {
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: false,
      actionMode: "delegate",
    }),
    ["delegate"],
  );
});

test("shows only reassignment decision actions for a pending reassignee", () => {
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: false,
      hasPendingReassignmentRequest: true,
    }),
    ["accept_reassignment", "decline_reassignment"],
  );
});

test("shows contributor controls without showing reassign and delegate actions", () => {
  assert.equal(
    shouldShowQueueReassignActions({
      isOriginatorAction: false,
      isExpanded: false,
    }),
    false,
  );
  assert.equal(
    shouldShowQueueContributorRequest({
      isOriginatorAction: false,
      isExpanded: true,
    }),
    true,
  );
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: false,
      showReassignActions: false,
    }),
    ["approve", "approve_with_comment", "reject", "reject_with_comment"],
  );
});

test("allows reassign and contributor options to be expanded together", () => {
  assert.equal(
    shouldShowQueueReassignActions({
      isOriginatorAction: false,
      isExpanded: true,
    }),
    true,
  );
  assert.equal(
    shouldShowQueueContributorRequest({
      isOriginatorAction: false,
      isExpanded: true,
    }),
    true,
  );
});

test("keeps reassign and delegate toggles mutually exclusive", () => {
  assert.deepEqual(
    getQueueActionModeToggleState({
      currentMode: "normal",
      toggledMode: "reassign",
      checked: true,
    }),
    { actionMode: "reassign" },
  );
  assert.deepEqual(
    getQueueActionModeToggleState({
      currentMode: "reassign",
      toggledMode: "delegate",
      checked: true,
    }),
    { actionMode: "delegate" },
  );
  assert.deepEqual(
    getQueueActionModeToggleState({
      currentMode: "delegate",
      toggledMode: "delegate",
      checked: false,
    }),
    { actionMode: "normal" },
  );
});

test("keeps originator returned-task actions focused on amend or cancel", () => {
  assert.equal(
    shouldShowQueueReassignActions({
      isOriginatorAction: true,
      isExpanded: true,
    }),
    false,
  );
  assert.equal(
    shouldShowQueueContributorRequest({
      isOriginatorAction: true,
      isExpanded: true,
    }),
    false,
  );
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: true,
      showReassignActions: true,
    }),
    ["amend_resubmit", "cancel"],
  );
});
