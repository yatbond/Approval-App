import assert from "node:assert/strict";
import test from "node:test";
import { getRejectReturnTargetOptions } from "./reject-return-routing-state.ts";

function makeParallelTemplate() {
  return {
    id: "payment-cert",
    name: "Payment cert",
    business: "Chun Wo",
    department: "Commercial",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
        {
          id: "qs",
          kind: "approval",
          label: "QS",
          x: 200,
          y: 0,
          assigneeEmail: "qs@example.com",
        },
        {
          id: "qs-manager",
          kind: "approval",
          label: "QS Manager",
          x: 400,
          y: -80,
          assigneeEmail: "qs-manager@example.com",
        },
        {
          id: "commercial-director",
          kind: "approval",
          label: "Commercial Director",
          x: 400,
          y: 80,
          assigneeEmail: "commercial@example.com",
        },
        {
          id: "supervisor",
          kind: "review",
          label: "Supervisor endorsement",
          x: 640,
          y: 0,
          assigneeEmail: "supervisor@example.com",
        },
        {
          id: "cfo",
          kind: "approval",
          label: "CFO approval",
          x: 860,
          y: -80,
          assigneeEmail: "cfo@example.com",
        },
        {
          id: "chairman",
          kind: "approval",
          label: "Chairman",
          x: 860,
          y: 80,
          assigneeEmail: "chairman@example.com",
        },
        { id: "end", kind: "end", label: "End", x: 1080, y: 0 },
      ],
      edges: [
        { id: "edge-start-qs", sourceId: "start", targetId: "qs", label: "Start", branchType: "main" },
        { id: "edge-qs-manager", sourceId: "qs", targetId: "qs-manager", label: "Main", branchType: "main" },
        { id: "edge-qs-director", sourceId: "qs", targetId: "commercial-director", label: "Main", branchType: "main" },
        { id: "edge-manager-supervisor", sourceId: "qs-manager", targetId: "supervisor", label: "Main", branchType: "main" },
        { id: "edge-director-supervisor", sourceId: "commercial-director", targetId: "supervisor", label: "Main", branchType: "main" },
        { id: "edge-supervisor-cfo", sourceId: "supervisor", targetId: "cfo", label: "Main", branchType: "main" },
        { id: "edge-supervisor-chairman", sourceId: "supervisor", targetId: "chairman", label: "Main", branchType: "main" },
        { id: "edge-cfo-end", sourceId: "cfo", targetId: "end", label: "Main", branchType: "main" },
        { id: "edge-chairman-end", sourceId: "chairman", targetId: "end", label: "Main", branchType: "main" },
      ],
    },
  };
}

test("lists originator, upstream boxes, and parallel upstream stages as reject return targets", () => {
  const options = getRejectReturnTargetOptions({
    task: {
      currentNodeId: "supervisor",
      requester: "Mandy Chan",
      requesterEmail: "mandy@example.com",
      completedNodeIds: ["start", "qs", "qs-manager", "commercial-director"],
      nodeDecisions: {
        qs: "approved",
        "qs-manager": "approved",
        "commercial-director": "approved",
      },
    },
    template: makeParallelTemplate(),
  });

  assert.deepEqual(
    options.map((option) => ({
      id: option.id,
      label: option.label,
      nodeIds: option.nodeIds,
    })),
    [
      {
        id: "originator",
        label: "Return to original submitter",
        nodeIds: [],
      },
      {
        id: "stage-qs-manager-commercial-director",
        label: "QS Manager + Commercial Director",
        nodeIds: ["qs-manager", "commercial-director"],
      },
      {
        id: "node-commercial-director",
        label: "Commercial Director",
        nodeIds: ["commercial-director"],
      },
      {
        id: "node-qs-manager",
        label: "QS Manager",
        nodeIds: ["qs-manager"],
      },
      {
        id: "node-qs",
        label: "QS",
        nodeIds: ["qs"],
      },
    ],
  );
  assert.equal(options.some((option) => option.label.includes("CFO")), false);
  assert.equal(options.some((option) => option.label.includes("Chairman")), false);
});

test("returns only the originator option when there is no graph context", () => {
  const options = getRejectReturnTargetOptions({
    task: {
      currentNodeId: "",
      requester: "Mandy Chan",
      requesterEmail: "mandy@example.com",
    },
    template: undefined,
  });

  assert.deepEqual(options, [
    {
      id: "originator",
      label: "Return to original submitter",
      nodeIds: [],
      description: "Mandy Chan",
    },
  ]);
});
