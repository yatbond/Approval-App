import type { ApprovalAction } from "./types.ts";

const defaultQueueActions: ApprovalAction[] = [
  "approve",
  "approve_with_comment",
  "reject",
  "reject_with_comment",
];

const advancedQueueActions: ApprovalAction[] = ["reassign", "delegate"];
const originatorQueueActions: ApprovalAction[] = ["amend_resubmit", "cancel"];

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
  showAdvancedActions,
  showReassignActions,
}: {
  isOriginatorAction: boolean;
  showAdvancedActions?: boolean;
  showReassignActions?: boolean;
}) {
  if (isOriginatorAction) {
    return originatorQueueActions;
  }

  return (showReassignActions ?? showAdvancedActions)
    ? [...defaultQueueActions, ...advancedQueueActions]
    : defaultQueueActions;
}
