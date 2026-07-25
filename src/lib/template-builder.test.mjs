import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkflowTemplateFromDraft } from "./template-builder.ts";

test("creates a workflow template with multiple upload document slots and fields", () => {
  const template = createWorkflowTemplateFromDraft({
    name: "Medical reimbursement",
    business: "Asia Allied Infrastructure",
    department: "Human Resources",
    documents: [
      {
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [
          { label: "Invoice number", instructions: "Find the invoice reference." },
          { label: "Total amount", instructions: "Find the payable total." },
        ],
      },
      {
        documentType: "Doctor slip",
        format: "image",
        required: false,
        fields: [{ label: "Visit date", instructions: "Find the consultation date." }],
      },
    ],
    approverName: "Mandy Chan",
    approverEmail: "mandy.chan@example.com",
    dueInHours: 24,
    escalationName: "Finance Head",
    escalationEmail: "finance.head@example.com",
    condition: "Total amount >= 1000",
  });

  assert.equal(template.name, "Medical reimbursement");
  assert.deepEqual(template.documentTypes, ["Invoice", "Doctor slip"]);
  assert.equal(template.documents.length, 2);
  assert.equal(template.documents[0].format, "pdf");
  assert.equal(template.documents[0].required, true);
  assert.equal(template.documents[0].fields.length, 2);
  assert.equal(template.documents[0].fields[0].label, "Invoice number");
  assert.equal(template.documents[1].format, "image");
  assert.equal(template.documents[1].required, false);
  assert.equal(template.fields.length, 3);
});

test("creates an approval step with approver and escalation contacts", () => {
  const template = createWorkflowTemplateFromDraft({
    name: "Annual leave",
    business: "Asia Allied Infrastructure",
    department: "Human Resources",
    documents: [
      {
        documentType: "Leave form",
        format: "text",
        required: true,
        fields: [{ label: "Leave dates", instructions: "Extract requested dates." }],
      },
    ],
    approverName: "HR Approver",
    approverEmail: "hr.approver@example.com",
    dueInHours: 48,
    escalationName: "HR Head",
    escalationEmail: "hr.head@example.com",
    condition: "Always",
  });

  assert.equal(template.steps[0].role, "HR Approver");
  assert.equal(template.steps[0].approverName, "HR Approver");
  assert.equal(template.steps[0].approverEmail, "hr.approver@example.com");
  assert.equal(template.steps[0].dueInHours, 48);
  assert.equal(template.steps[0].escalationRole, "HR Head");
  assert.equal(template.steps[0].escalationName, "HR Head");
  assert.equal(template.steps[0].escalationEmail, "hr.head@example.com");
  assert.equal(template.steps[0].condition, "Always");
});

test("creates multiple sequential approval steps", () => {
  const template = createWorkflowTemplateFromDraft({
    name: "Capital approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documents: [
      {
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [{ label: "Total amount", instructions: "Extract total." }],
      },
    ],
    steps: [
      {
        approverName: "Finance Reviewer",
        approverEmail: "finance.reviewer@example.com",
        dueInHours: 24,
        escalationName: "Finance Manager",
        escalationEmail: "finance.manager@example.com",
        condition: "Always",
      },
      {
        approverName: "CFO",
        approverEmail: "cfo@example.com",
        dueInHours: 12,
        escalationName: "CEO",
        escalationEmail: "ceo@example.com",
        condition: "Total amount >= 100000",
      },
    ],
  });

  assert.equal(template.steps.length, 2);
  assert.equal(template.steps[0].name, "Finance approval 1");
  assert.equal(template.steps[0].approverEmail, "finance.reviewer@example.com");
  assert.equal(template.steps[0].escalationEmail, "finance.manager@example.com");
  assert.equal(template.steps[1].name, "Finance approval 2");
  assert.equal(template.steps[1].approverName, "CFO");
  assert.equal(template.steps[1].dueInHours, 12);
  assert.equal(template.steps[1].condition, "Total amount >= 100000");
});

test("creates a canvas-first workflow template without global uploads or form steps", () => {
  const template = createWorkflowTemplateFromDraft({
    name: "Canvas first workflow",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documents: [],
    steps: [],
  });

  assert.deepEqual(template.documents, []);
  assert.deepEqual(template.documentTypes, []);
  assert.deepEqual(template.fields, []);
  assert.deepEqual(template.steps, []);
});
