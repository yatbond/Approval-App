import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWorkflowParticipantEmails,
  getMissingWorkflowParticipantEmails,
  getWorkflowParticipantEmailFields,
} from "./workflow-participant-assignment-state.ts";

const template = {
  id: "template-1",
  name: "Payment approval",
  fields: [],
  documents: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      { id: "submit-1", kind: "submit_request", label: "QS", x: 160, y: 0 },
      {
        id: "review-1",
        kind: "review",
        label: "QS Manager",
        x: 320,
        y: 0,
        assigneeEmail: "manager@example.com",
        assigneeEmailFixed: true,
      },
      { id: "fyi-1", kind: "for_information", label: "Finance FYI", x: 480, y: 0 },
      { id: "end", kind: "end", label: "End", x: 640, y: 0 },
    ],
    edges: [],
  },
};

test("lists editable participant email fields for request start", () => {
  assert.deepEqual(getWorkflowParticipantEmailFields(template), [
    {
      nodeId: "submit-1",
      label: "QS",
      kind: "submit_request",
      email: "",
      inputLabel: "Submitter email",
      isFixed: false,
    },
    {
      nodeId: "review-1",
      label: "QS Manager",
      kind: "review",
      email: "manager@example.com",
      inputLabel: "Person email",
      isFixed: true,
    },
    {
      nodeId: "fyi-1",
      label: "Finance FYI",
      kind: "for_information",
      email: "",
      inputLabel: "FYI email",
      isFixed: false,
    },
  ]);
});

test("applies request-start participant email overrides without mutating template", () => {
  const assigned = applyWorkflowParticipantEmails(template, {
    "submit-1": "qs@example.com",
    "review-1": "lead@example.com",
    "fyi-1": "finance@example.com",
  });

  assert.equal(
    assigned.graph.nodes.find((node) => node.id === "submit-1")?.assigneeEmail,
    "qs@example.com",
  );
  assert.equal(
    assigned.graph.nodes.find((node) => node.id === "review-1")?.assigneeEmail,
    "manager@example.com",
  );
  assert.equal(
    template.graph.nodes.find((node) => node.id === "submit-1")?.assigneeEmail,
    undefined,
  );
});

test("does not list fixed participant emails as editable request-start fields", () => {
  const fields = getWorkflowParticipantEmailFields(template, { editableOnly: true });

  assert.deepEqual(
    fields.map((field) => field.nodeId),
    ["submit-1", "fyi-1"],
  );
});

test("finds missing participant emails needed before submission", () => {
  assert.deepEqual(getMissingWorkflowParticipantEmails(template), [
    "QS",
    "Finance FYI",
  ]);
});
