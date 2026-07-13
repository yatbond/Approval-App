import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRequestWorkflowMapState,
  getWorkflowMapNodeIdForParticipantField,
} from "./request-workflow-map-state.ts";

const template = {
  id: "request-map",
  name: "Request map",
  business: "Chun Wo",
  department: "Finance",
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", assignee: "", assigneeEmail: "", dueHours: 0, blocking: false, documents: [], position: { x: 0, y: 0 } },
      { id: "submit", kind: "submit_request", label: "Submit request", assignee: "Submitter", assigneeEmail: "", dueHours: 0, blocking: true, documents: [], position: { x: 100, y: 0 } },
      { id: "manager", kind: "approval", label: "Manager", assignee: "Manager", assigneeEmail: "", dueHours: 24, blocking: true, documents: [], position: { x: 200, y: 0 } },
      { id: "end", kind: "end", label: "End", assignee: "", assigneeEmail: "", dueHours: 0, blocking: false, documents: [], position: { x: 300, y: 0 } },
    ],
    edges: [
      { id: "start-submit", sourceId: "start", targetId: "submit", branchType: "main", label: "Main", blocking: true },
      { id: "submit-manager", sourceId: "submit", targetId: "manager", branchType: "main", label: "Main", blocking: true },
      { id: "manager-end", sourceId: "manager", targetId: "end", branchType: "main", label: "Main", blocking: true },
    ],
  },
};

test("defaults the new request workflow map to the submit box", () => {
  const state = buildRequestWorkflowMapState(template);

  assert.equal(state.activeNodeId, "submit");
  assert.deepEqual(state.stages.flatMap((stage) => stage.nodes.map((node) => node.id)), [
    "submit",
    "manager",
    "end",
  ]);
});

test("highlights the requested participant box when it exists", () => {
  assert.equal(buildRequestWorkflowMapState(template, "manager").activeNodeId, "manager");
  assert.equal(buildRequestWorkflowMapState(template, "missing").activeNodeId, "submit");
  assert.equal(getWorkflowMapNodeIdForParticipantField("manager:escalation"), "manager");
});
