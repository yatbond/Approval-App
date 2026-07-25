export function getWorkflowCanvasInstanceKey({
  workflowId,
  resetNonce,
}: {
  workflowId: string;
  resetNonce: number;
}) {
  return `${workflowId || "empty"}:reset-${resetNonce}`;
}
