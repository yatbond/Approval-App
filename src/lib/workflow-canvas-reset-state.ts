type WorkflowCanvasResetState = {
  selectedNodeId: null;
  selectedEdgeId: null;
  connectFromNodeId: null;
  conditionOutcomeCaseId: null;
  canvasViewResetNonce: number;
};

export function getWorkflowCanvasResetState({
  canvasViewResetNonce,
}: {
  canvasViewResetNonce: number;
}): WorkflowCanvasResetState {
  return {
    selectedNodeId: null,
    selectedEdgeId: null,
    connectFromNodeId: null,
    conditionOutcomeCaseId: null,
    canvasViewResetNonce: canvasViewResetNonce + 1,
  };
}
