import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  collectAssignmentEmailsRequiringValidation,
  collectPublishedAssignmentEmails,
  collectTemplateAssignmentEmails,
} from "./workspace-assignment-validation.ts";

function template(overrides = {}) {
  return {
    id: "payment",
    version: 2,
    isDraft: false,
    isActiveVersion: true,
    name: "Payment approval",
    business: "Construction",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["en"],
    fields: [],
    steps: [{ approverEmail: " Approver@Example.com " }],
    graph: {
      nodes: [{ assigneeEmail: "finance@example.com" }],
      edges: [],
    },
    ...overrides,
  };
}

test("collects normalized unique assignments from steps and graph nodes", () => {
  assert.deepEqual(collectTemplateAssignmentEmails(template()), [
    "approver@example.com",
    "finance@example.com",
  ]);
  assert.deepEqual(collectPublishedAssignmentEmails([template(), template()]), [
    "approver@example.com",
    "finance@example.com",
  ]);
});

test("grandfathers only assignments on the same already-active template version", () => {
  const stored = [
    {
      template_key: "payment",
      version_number: 2,
      is_active_version: true,
      template_snapshot: template({
        steps: [{ approverEmail: "approver@example.com" }],
        graph: { nodes: [], edges: [] },
      }),
    },
  ];

  assert.deepEqual(
    collectAssignmentEmailsRequiringValidation([template()], stored),
    ["finance@example.com"],
  );
  assert.deepEqual(
    collectAssignmentEmailsRequiringValidation(
      [template({ id: "another-template" })],
      stored,
    ),
    ["approver@example.com", "finance@example.com"],
  );
});

test("does not grandfather assignments from an inactive stored version", () => {
  const stored = [
    {
      template_key: "payment",
      version_number: 2,
      is_active_version: false,
      template_snapshot: template(),
    },
  ];

  assert.deepEqual(
    collectAssignmentEmailsRequiringValidation([template()], stored),
    ["approver@example.com", "finance@example.com"],
  );
});

test("ignores drafts and historical versions because publishing validates active versions", () => {
  assert.deepEqual(
    collectAssignmentEmailsRequiringValidation(
      [template({ isDraft: true })],
      [],
    ),
    [],
  );
  assert.deepEqual(
    collectAssignmentEmailsRequiringValidation(
      [template({ isActiveVersion: false, isArchived: true })],
      [],
    ),
    [],
  );
  assert.deepEqual(
    collectPublishedAssignmentEmails([
      template({ isActiveVersion: false }),
      template({ isArchived: true }),
    ]),
    [],
  );
});

test("database grandfathering is scoped to the same active template version", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260721081638_allow_existing_inactive_template_assignments.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /existing\.template_key = trim\(v_template ->> 'templateKey'\)/);
  assert.match(migration, /existing\.version_number = .*'versionNumber'/);
  assert.match(migration, /existing\.is_active_version/);
  assert.match(migration, /except[\s\S]*unnest\(v_existing_assignment_emails\)/);
  assert.match(migration, /inactive or missing template assignment: %s/);
});
