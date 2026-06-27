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

export function getQueueActionList({
  isOriginatorAction,
  showAdvancedActions,
}: {
  isOriginatorAction: boolean;
  showAdvancedActions: boolean;
}) {
  if (isOriginatorAction) {
    return originatorQueueActions;
  }

  return showAdvancedActions
    ? [...defaultQueueActions, ...advancedQueueActions]
    : defaultQueueActions;
}
