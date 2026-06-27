import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getQueueActionList,
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

test("shows reassign and delegate actions independently from contributor controls", () => {
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
      showReassignActions: true,
    }),
    [
      "approve",
      "approve_with_comment",
      "reject",
      "reject_with_comment",
      "reassign",
      "delegate",
    ],
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
