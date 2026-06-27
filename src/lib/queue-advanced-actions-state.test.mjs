import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getQueueActionList,
  shouldShowQueueAdvancedActions,
} from "./queue-advanced-actions-state.ts";

test("keeps advanced queue actions hidden until the reviewer expands them", () => {
  assert.equal(
    shouldShowQueueAdvancedActions({
      isOriginatorAction: false,
      isExpanded: false,
    }),
    false,
  );
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: false,
      showAdvancedActions: false,
    }),
    ["approve", "approve_with_comment", "reject", "reject_with_comment"],
  );
});

test("shows reassign, delegate, and contributor controls when expanded", () => {
  assert.equal(
    shouldShowQueueAdvancedActions({
      isOriginatorAction: false,
      isExpanded: true,
    }),
    true,
  );
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: false,
      showAdvancedActions: true,
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

test("keeps originator returned-task actions focused on amend or cancel", () => {
  assert.equal(
    shouldShowQueueAdvancedActions({
      isOriginatorAction: true,
      isExpanded: true,
    }),
    false,
  );
  assert.deepEqual(
    getQueueActionList({
      isOriginatorAction: true,
      showAdvancedActions: true,
    }),
    ["amend_resubmit", "cancel"],
  );
});
