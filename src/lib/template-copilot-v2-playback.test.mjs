import assert from "node:assert/strict";
import test from "node:test";
import {
  createTemplateCopilotV2Ledger,
  templateCopilotFactIds,
} from "./template-copilot-facts.ts";
import { projectTemplateCopilotV2AuthoritativeLedger } from "./template-copilot-v2-authoritative-projection.ts";

const enabled = { enabled: true };
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts",
};
const actorId = "33333333-3333-4333-8333-333333333333";
const confirmedAt = "2026-07-30T00:00:00Z";

const values = {
  "workflow.name": "Purchase approval",
  "workflow.purpose": "Review purchases before commitment.",
  "workflow.scope": {
    description: "Purchases by Finance",
    rules: ["Emergency purchases use the emergency process."],
  },
  "request.initiator_policy": {
    mode: "any_employee",
    description: "Any employee may submit.",
  },
  "request.fields": [
    {
      label: "Amount",
      type: "currency",
      required: true,
      options: ["HKD"],
    },
  ],
  "attachments.requirements": [
    {
      id: "invoice_file",
      label: "Invoice",
      kind: "attachment",
      required: true,
      formats: ["pdf"],
      minimumQuantity: 1,
      maximumQuantity: 2,
      maximumFileSizeMb: 10,
      stage: "request_submission",
      contributorPolicy: "requester_only",
      confirmationPolicy: "none",
    },
  ],
  "workflow.stages": [
    {
      label: "Manager",
      kind: "approval",
      participant: { mode: "directory_position", value: "Manager" },
      sequence: 1,
    },
  ],
  "workflow.conditions": [
    {
      id: "amount_route",
      sequence: 1,
      field: "Amount",
      operator: ">",
      value: 10000,
      currency: "HKD",
      matchingRoute: "stage:Manager",
      otherwiseRoute: "complete",
    },
  ],
  "workflow.rejection_policy": { action: "return_for_correction" },
  "collaboration.policy": {
    description: "The requester corrects returned information.",
    rules: ["Keep the prior submission in history."],
  },
  "timing.rules": {
    defaultDueHours: 24,
    escalation: {
      description: "Notify the workflow owner after the due time.",
      rules: ["Escalate after 24 hours."],
    },
  },
  "visibility.policy": {
    description: "Requester and participants can view the request.",
    rules: ["Documents follow the configured workflow stage."],
  },
  "notifications.rules": [
    {
      id: "manager_assigned",
      event: "stage_assigned",
      recipients: ["current_stage_participants"],
      timing: { mode: "immediate" },
      channel: "in_app_and_email",
      visibility: "recipients_only",
      stage: "stage:Manager",
    },
  ],
  "governance.owner": "Finance",
  "governance.policies": ["Procurement policy"],
  "governance.retention": {
    period: "7 years",
    rationale: "Audit records",
  },
};

function completeLedger(locale = "en") {
  const ledger = createTemplateCopilotV2Ledger(
    { ...scope, locale, questionLibraryVersion: "v2.2" },
    enabled,
  );
  for (const factId of templateCopilotFactIds) {
    ledger.facts[factId] = {
      ...ledger.facts[factId],
      status: "committed",
      canonicalValue: structuredClone(values[factId]),
      provenance: [
        {
          kind: "human_editor",
          sourceId: `map:${factId}`,
          sourceMessageIds: [`message:${factId}`],
        },
      ],
      confirmation: {
        actorId,
        confirmedAt,
        operation: "human_confirm",
      },
    };
  }
  return ledger;
}

test("final playback covers every required workflow behavior with evidence and exact revision", () => {
  const playback = projectTemplateCopilotV2AuthoritativeLedger(
    completeLedger(),
    { sourceRevision: 17 },
  ).playback;
  assert.equal(playback.sourceRevision, 17);
  assert.equal(playback.interview.state, "complete");
  assert.equal(playback.readiness.draft, "ready");
  assert.equal(playback.readiness.publication, "not_ready");
  assert.equal(playback.readiness.activation, "not_ready");
  assert.deepEqual(
    playback.sections.map((section) => section.id),
    [
      "start",
      "request",
      "stages",
      "routing",
      "correction",
      "timing",
      "handoffs",
      "notifications",
      "governance",
    ],
  );
  assert.match(
    playback.sections.flatMap((section) => section.items.map((item) => item.text)).join(" "),
    /Any employee.*Amount.*Invoice.*Manager.*10000.*correct.*24.*view.*assigned.*Finance/s,
  );
  assert.ok(
    playback.sections
      .flatMap((section) => section.items)
      .every(
        (item) =>
          item.evidence.length > 0 &&
          item.evidence.every(
            (evidence) =>
              evidence.sourceId &&
              evidence.sourceMessageIds.length > 0,
          ),
      ),
  );
  assert.deepEqual(playback.assumptions, []);
  assert.ok(
    playback.compilerErrors.some(
      (item) => item.code === "visibility_requires_review",
    ),
  );
  assert.ok(
    playback.compilerErrors.some(
      (item) => item.code === "notification_delivery_requires_review",
    ),
  );
});

test("computed inapplicability removes an unresolved fact from open work and records why", () => {
  const ledger = completeLedger();
  ledger.facts["workflow.conditions"] = {
    ...ledger.facts["workflow.conditions"],
    status: "unresolved",
    canonicalValue: undefined,
    provenance: [],
    confirmation: undefined,
  };
  const playback = projectTemplateCopilotV2AuthoritativeLedger(ledger, {
    sourceRevision: 19,
    inapplicableFactIds: ["workflow.conditions"],
  }).playback;
  assert.equal(
    playback.unresolved.some(
      (item) => item.factId === "workflow.conditions",
    ),
    false,
  );
  assert.ok(
    playback.notApplicable.some(
      (item) =>
        item.factId === "workflow.conditions" &&
        item.code === "not_applicable_by_answer",
    ),
  );
});

test("parallel playback states the all-blocking completion rule", () => {
  const ledger = completeLedger();
  ledger.facts["workflow.stages"] = {
    ...ledger.facts["workflow.stages"],
    canonicalValue: [
      ...ledger.facts["workflow.stages"].canonicalValue,
      {
        label: "Finance review",
        kind: "review",
        participant: {
          mode: "directory_position",
          value: "Finance reviewer",
        },
        sequence: 1,
      },
      {
        label: "Requester FYI",
        kind: "for_information",
        participant: { mode: "requester" },
        sequence: 1,
      },
    ],
  };
  const playback = projectTemplateCopilotV2AuthoritativeLedger(ledger, {
    sourceRevision: 20,
  }).playback;
  const warning = playback.warnings.find(
    (item) => item.code === "simultaneous_stages",
  );
  assert.match(warning.detail, /Every blocking approval or review must finish/);
  assert.match(warning.detail, /Manager, Finance review/);
  assert.match(warning.detail, /FYI steps do not block/);
});

test("readiness separates interview, draft, publication, and activation", () => {
  const ledger = completeLedger();
  ledger.facts["governance.policies"] = {
    ...ledger.facts["governance.policies"],
    status: "unresolved",
    canonicalValue: undefined,
    provenance: [],
    confirmation: undefined,
  };
  const playback = projectTemplateCopilotV2AuthoritativeLedger(ledger, {
    sourceRevision: 18,
  }).playback;
  assert.equal(playback.readiness.draft, "ready");
  assert.equal(playback.readiness.publication, "not_ready");
  assert.equal(playback.readiness.activation, "not_ready");
  assert.ok(
    playback.unresolved.some(
      (item) => item.factId === "governance.policies",
    ),
  );
});

test("assumptions, N/A, conflicts, unresolved items, compiler errors, and warnings stay separate", () => {
  const ledger = completeLedger();
  ledger.facts["attachments.requirements"] = {
    ...ledger.facts["attachments.requirements"],
    status: "not_applicable",
    canonicalValue: undefined,
    notApplicableReason: "No files are needed.",
  };
  ledger.facts["workflow.purpose"] = {
    ...ledger.facts["workflow.purpose"],
    status: "conflicting",
    confirmation: undefined,
    conflictValues: ["Purpose A", "Purpose B"],
    conflictEvidence: [
      {
        canonicalValue: "Purpose A",
        provenance: [
          {
            kind: "message",
            sourceId: "message:a",
            sourceMessageIds: ["message:a"],
          },
        ],
      },
      {
        canonicalValue: "Purpose B",
        provenance: [
          {
            kind: "message",
            sourceId: "message:b",
            sourceMessageIds: ["message:b"],
          },
        ],
      },
    ],
  };
  ledger.facts["governance.retention"] = {
    ...ledger.facts["governance.retention"],
    status: "unknown",
    canonicalValue: undefined,
    provenance: [],
    confirmation: undefined,
  };
  ledger.facts["workflow.conditions"] = {
    ...ledger.facts["workflow.conditions"],
    canonicalValue: [
      {
        field: "Amount",
        operator: ">",
        value: 10000,
        matchingRoute: "Manager",
        otherwiseRoute: "Complete",
      },
    ],
  };
  ledger.facts["workflow.stages"] = {
    ...ledger.facts["workflow.stages"],
    canonicalValue: [
      ...ledger.facts["workflow.stages"].canonicalValue,
      {
        label: "Finance review",
        kind: "review",
        participant: { mode: "unassigned_at_template" },
        sequence: 1,
      },
    ],
  };
  const playback = projectTemplateCopilotV2AuthoritativeLedger(ledger).playback;
  assert.deepEqual(playback.assumptions, []);
  assert.equal(playback.notApplicable[0].factId, "attachments.requirements");
  assert.equal(playback.conflicts[0].factId, "workflow.purpose");
  assert.ok(
    playback.unresolved.some(
      (item) => item.factId === "governance.retention",
    ),
  );
  assert.ok(
    playback.compilerErrors.some(
      (item) => item.factId === "workflow.conditions",
    ),
  );
  assert.ok(
    playback.warnings.some(
      (item) => item.code === "participant_assigned_later",
    ),
  );
  assert.ok(
    playback.warnings.some((item) => item.code === "simultaneous_stages"),
  );
});

test("playback is deterministic and language-independent in behavior", () => {
  const outputs = ["en", "zh-Hant", "zh-Hans"].map((locale) =>
    projectTemplateCopilotV2AuthoritativeLedger(completeLedger(locale), {
      sourceRevision: 19,
    }).playback,
  );
  for (const output of outputs) {
    assert.equal(output.readiness.draft, "ready");
    assert.equal(output.readiness.publication, "not_ready");
    assert.equal(output.readiness.activation, "not_ready");
    assert.deepEqual(
      output.sections.map((section) => section.id),
      outputs[0].sections.map((section) => section.id),
    );
    assert.deepEqual(
      output.sections.map((section) =>
        section.items.map((item) => item.factId),
      ),
      outputs[0].sections.map((section) =>
        section.items.map((item) => item.factId),
      ),
    );
  }
  assert.match(outputs[1].sections[0].title, /誰|流程/u);
  assert.match(outputs[2].sections[0].title, /谁|流程/u);
});

test("activation becomes ready only for the exact published source revision", () => {
  const ledger = completeLedger();
  ledger.facts["timing.rules"].canonicalValue = {
    defaultDueHours: 24,
  };
  ledger.facts["visibility.policy"].canonicalValue = {
    description: "Participants see the request and its stage documents.",
    rules: [
      "status:participants",
      "fields:all",
      "documents:required_for_node",
    ],
  };
  ledger.facts["notifications.rules"] = {
    ...ledger.facts["notifications.rules"],
    status: "not_applicable",
    canonicalValue: undefined,
    notApplicableReason: "No notifications are required.",
  };
  const stale = projectTemplateCopilotV2AuthoritativeLedger(ledger, {
    sourceRevision: 20,
    publishedSourceRevision: 19,
  }).playback;
  const exact = projectTemplateCopilotV2AuthoritativeLedger(ledger, {
    sourceRevision: 20,
    publishedSourceRevision: 20,
  }).playback;
  assert.equal(stale.readiness.activation, "not_ready");
  assert.equal(exact.readiness.activation, "ready");
  assert.ok(
    stale.readiness.gaps.some(
      (gap) => gap.code === "published_revision_mismatch",
    ),
  );
  assert.equal(
    exact.readiness.gaps.some(
      (gap) => gap.code === "published_revision_mismatch",
    ),
    false,
  );
});
