import type { ApprovalAction } from "./types.ts";

const defaultQueueActions: ApprovalAction[] = [
  "approve",
  "approve_with_comment",
  "reject",
  "reject_with_comment",
];

const advancedQueueActions: ApprovalAction[] = ["reassign", "delegate"];
const originatorQueueActions: ApprovalAction[] = ["amend_resubmit", "cancel"];
const reassignmentDecisionActions: ApprovalAction[] = [
  "accept_reassignment",
  "decline_reassignment",
];

export type QueueActionMode = "normal" | "reassign" | "delegate";

export function shouldShowQueueAdvancedActions({
  isOriginatorAction,
  isExpanded,
}: {
  isOriginatorAction: boolean;
  isExpanded: boolean;
}) {
  return !isOriginatorAction && isExpanded;
}

export function shouldShowQueueReassignActions({
  isOriginatorAction,
  isExpanded,
}: {
  isOriginatorAction: boolean;
  isExpanded: boolean;
}) {
  return !isOriginatorAction && isExpanded;
}

export function shouldShowQueueContributorRequest({
  isOriginatorAction,
  isExpanded,
}: {
  isOriginatorAction: boolean;
  isExpanded: boolean;
}) {
  return !isOriginatorAction && isExpanded;
}

export function getQueueActionList({
  isOriginatorAction,
  hasPendingReassignmentRequest = false,
  showAdvancedActions,
  showReassignActions,
  actionMode = "normal",
}: {
  isOriginatorAction: boolean;
  hasPendingReassignmentRequest?: boolean;
  showAdvancedActions?: boolean;
  showReassignActions?: boolean;
  actionMode?: QueueActionMode;
}): ApprovalAction[] {
  if (isOriginatorAction) {
    return originatorQueueActions;
  }

  if (hasPendingReassignmentRequest) {
    return reassignmentDecisionActions;
  }

  if (actionMode === "reassign") {
    return ["reassign"];
  }

  if (actionMode === "delegate") {
    return ["delegate"];
  }

  return (showReassignActions ?? showAdvancedActions)
    ? [...defaultQueueActions, ...advancedQueueActions]
    : defaultQueueActions;
}

export function getQueueActionModeToggleState({
  toggledMode,
  checked,
}: {
  currentMode: QueueActionMode;
  toggledMode: Exclude<QueueActionMode, "normal">;
  checked: boolean;
}): { actionMode: QueueActionMode } {
  return {
    actionMode: checked ? toggledMode : "normal",
  };
}
