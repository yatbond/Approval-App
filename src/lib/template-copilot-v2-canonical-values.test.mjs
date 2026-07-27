import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeTemplateCopilotCommittedValue,
  templateCopilotFactIds,
} from "./template-copilot-v2-canonical-values.ts";
import {
  applyTemplateCopilotV2FactTransition,
  createTemplateCopilotV2Ledger,
  TemplateCopilotFactTransitionError,
} from "./template-copilot-facts.ts";
import {
  createPendingTemplateCopilotV2MapCommand,
  parsePendingTemplateCopilotV2MapCommand,
  templateCopilotV2PendingMapCommandBody,
} from "./template-copilot-v2-map-command.ts";
import {
  applyTemplateCopilotV2Mutation,
  templateCopilotV2CommandHash,
} from "./template-copilot-v2-server-data.ts";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "owner@example.com",
  fullName: "Owner",
  isAdmin: false,
};
const enabled = { enabled: true };
const ws = (value) => `\uFEFF\u2003${value}\u00A0`;

const rawValues = {
  "workflow.name": ws("Invoice approval"),
  "workflow.purpose": ws("Approve supplier invoices"),
  "workflow.scope": {
    description: ws("Supplier invoices"),
    rules: [ws("Exclude expenses")],
  },
  "request.initiator_policy": {
    mode: "directory_role",
    description: ws("Finance staff"),
  },
  "request.fields": [{
    label: ws("Amount"),
    type: "currency",
    required: true,
  }],
  "attachments.requirements": [{
    label: ws("Invoice"),
    required: true,
    stage: ws("Finance review"),
  }],
  "workflow.stages": [{
    label: ws("Manager approval"),
    kind: "approval",
    participant: { mode: "directory_position", value: ws("Manager") },
    sequence: 1,
  }],
  "workflow.conditions": [{
    field: ws("Cost centre"),
    operator: "=",
    value: ws("001"),
    matchingRoute: ws("Finance review"),
    otherwiseRoute: ws("Manager approval"),
  }],
  "workflow.rejection_policy": {
    action: "route_to_stage",
    route: ws("Requester correction"),
  },
  "collaboration.policy": {
    description: ws("Requester can correct"),
    rules: [ws("Retain history")],
  },
  "timing.rules": {
    defaultDueHours: 24,
    escalation: {
      description: ws("Escalate overdue work"),
      rules: [ws("Notify Finance")],
    },
  },
  "visibility.policy": {
    description: ws("Participants only"),
  },
  "notifications.rules": [{
    event: ws("Assigned"),
    recipients: [ws("Requester"), ws("Approver")],
    channel: "email",
  }],
  "governance.owner": ws("Finance Operations"),
  "governance.policies": [ws("Quarterly review")],
  "governance.retention": {
    period: ws("7 years"),
    rationale: ws("Audit requirement"),
  },
};

const invalidValues = {
  "workflow.name": null,
  "workflow.purpose": "\uFEFF\u2003\u00A0",
  "workflow.scope": { description: "Scope", forged: true },
  "request.initiator_policy": { mode: "forged", description: "Finance" },
  "request.fields": [],
  "attachments.requirements": [{ label: "", required: true }],
  "workflow.stages": [{ label: "Review", kind: "approval", participant: { mode: "directory_position" }, sequence: 1 }],
  "workflow.conditions": [{ field: "Amount", operator: "=", value: {}, matchingRoute: "A", otherwiseRoute: "B" }],
  "workflow.rejection_policy": { action: "close", route: "Forged route" },
  "collaboration.policy": { rules: [] },
  "timing.rules": { defaultDueHours: 0 },
  "visibility.policy": { description: "Visible", rules: [" "] },
  "notifications.rules": [{ event: "Assigned", recipients: [" "], channel: "email" }],
  "governance.owner": "x".repeat(201),
  "governance.policies": {},
  "governance.retention": { rationale: "Missing period" },
};

const alternateValues = {
  "workflow.name": "Expense approval",
  "workflow.purpose": "Approve employee expenses",
  "workflow.scope": { description: "Employee expenses", rules: ["Exclude invoices"] },
  "request.initiator_policy": { mode: "any_employee", description: "Any employee" },
  "request.fields": [{ label: "Department", type: "text", required: false }],
  "attachments.requirements": [{ label: "Receipt", required: false }],
  "workflow.stages": [{ label: "Finance approval", kind: "approval", participant: { mode: "fixed_email", value: "finance@example.com" }, sequence: 1 }],
  "workflow.conditions": [{ field: "Amount", operator: ">", value: 1000, matchingRoute: "Finance approval", otherwiseRoute: "Manager approval" }],
  "workflow.rejection_policy": { action: "route_to_stage", route: "Finance review" },
  "collaboration.policy": { description: "Finance can correct", rules: [] },
  "timing.rules": { defaultDueHours: 48 },
  "visibility.policy": { description: "Finance only", rules: [] },
  "notifications.rules": [{ event: "Completed", recipients: ["Requester"], channel: "in_app" }],
  "governance.owner": "Compliance",
  "governance.policies": ["Annual review"],
  "governance.retention": { period: "6 years", rationale: "Policy" },
};

test("all 16 client commands and server RPCs use identical schema-normalized canonical bytes", async () => {
  assert.deepEqual(Object.keys(rawValues), [...templateCopilotFactIds]);
  for (const [index, factId] of templateCopilotFactIds.entries()) {
    const idempotencyKey = `map:canonical:${index}`;
    const expected = normalizeTemplateCopilotCommittedValue(
      factId,
      rawValues[factId],
    );
    const pending = createPendingTemplateCopilotV2MapCommand({
      sessionId,
      expectedRevision: 7,
      idempotencyKey,
      factId,
      factStatus: "unresolved",
      intent: { action: "save", canonicalValue: rawValues[factId] },
    });
    const storedBytes = JSON.stringify(pending);
    const clientBody = templateCopilotV2PendingMapCommandBody(pending);
    const canonicalBytes = JSON.stringify(expected);
    assert.equal(JSON.stringify(pending.canonicalValue), canonicalBytes, factId);
    assert.equal(
      JSON.stringify(clientBody.transition.payload.canonicalValue),
      canonicalBytes,
      factId,
    );
    if (factId === "workflow.conditions") {
      assert.equal(expected[0].value, "001");
      assert.equal(typeof expected[0].value, "string");
    }
    if (factId === "request.fields") assert.deepEqual(expected[0].options, []);
    if (factId === "attachments.requirements") assert.deepEqual(expected[0].formats, []);
    if (factId === "visibility.policy") assert.deepEqual(expected.rules, []);

    let rpcArgs;
    await applyTemplateCopilotV2Mutation({
      session: {},
      service: {
        rpc: async (_name, args) => {
          rpcArgs = args;
          return { data: { outcome: "invalid_transition" }, error: null };
        },
      },
      actor,
      sessionId,
      expectedRevision: 7,
      idempotencyKey,
      factId,
      transition: {
        operation: "human_commit",
        payload: {
          canonicalValue: rawValues[factId],
          provenance: [{
            kind: "human_editor",
            sourceId: `map:${idempotencyKey}`,
            sourceMessageIds: [],
          }],
        },
      },
      flag: enabled,
    });
    assert.equal(JSON.stringify(rpcArgs.p_canonical_value), canonicalBytes, factId);
    assert.equal(
      rpcArgs.p_command_hash,
      templateCopilotV2CommandHash({
        operation: "human_commit",
        sessionId,
        expectedRevision: 7,
        factId,
        canonicalValue: expected,
        reason: null,
      }),
      `${factId} normalized hash`,
    );

    const remounted = parsePendingTemplateCopilotV2MapCommand(
      JSON.parse(storedBytes),
    );
    assert.ok(remounted, factId);
    assert.equal(JSON.stringify(remounted), storedBytes, `${factId} stored bytes`);
    assert.equal(
      JSON.stringify(templateCopilotV2PendingMapCommandBody(remounted)),
      JSON.stringify(clientBody),
      `${factId} request bytes`,
    );
  }
});

test("all human reducer operations normalize every fact before entry and history construction", () => {
  const scope = {
    businessUnitId: "11111111-1111-4111-8111-111111111111",
    businessName: "Finance",
    departmentId: "22222222-2222-4222-8222-222222222222",
    departmentName: "Accounts Payable",
  };
  const payload = (factId, canonicalValue, source) => ({
    canonicalValue,
    originalWording: ws(`${factId} wording`),
    provenance: [{
      kind: "human_editor",
      sourceId: source,
      sourceMessageIds: [],
    }],
  });
  const apply = (ledger, factId, operation, canonicalValue, source, confirmedAt) =>
    applyTemplateCopilotV2FactTransition({
      ledger,
      factId,
      actorId: actor.id,
      confirmedAt,
      flag: enabled,
      transition: operation === "record_candidate"
        ? { operation, payload: payload(factId, canonicalValue, source) }
        : { operation, payload: payload(factId, canonicalValue, source) },
    });

  for (const [index, factId] of templateCopilotFactIds.entries()) {
    const expected = normalizeTemplateCopilotCommittedValue(
      factId,
      rawValues[factId],
    );
    const alternate = normalizeTemplateCopilotCommittedValue(
      factId,
      alternateValues[factId],
    );
    const empty = createTemplateCopilotV2Ledger(scope, enabled);

    const committed = apply(
      empty,
      factId,
      "human_commit",
      rawValues[factId],
      `domain:commit:${index}`,
      "2026-07-27T10:00:00.000Z",
    );
    assert.equal(
      JSON.stringify(committed.facts[factId].canonicalValue),
      JSON.stringify(expected),
      `${factId} human_commit`,
    );

    const beforeReplace = apply(
      empty,
      factId,
      "human_commit",
      alternateValues[factId],
      `domain:replace-base:${index}`,
      "2026-07-27T10:01:00.000Z",
    );
    const replaced = apply(
      beforeReplace,
      factId,
      "human_replace",
      rawValues[factId],
      `domain:replace:${index}`,
      "2026-07-27T10:02:00.000Z",
    );
    assert.equal(
      JSON.stringify(replaced.facts[factId].canonicalValue),
      JSON.stringify(expected),
      `${factId} human_replace`,
    );
    assert.equal(
      JSON.stringify(replaced.facts[factId].staleHistory.at(-1).canonicalValue),
      JSON.stringify(alternate),
      `${factId} normalized replacement history`,
    );

    const candidate = apply(
      empty,
      factId,
      "record_candidate",
      alternateValues[factId],
      `domain:candidate-a:${index}`,
      "2026-07-27T10:03:00.000Z",
    );
    const conflicting = apply(
      candidate,
      factId,
      "record_candidate",
      rawValues[factId],
      `domain:candidate-b:${index}`,
      "2026-07-27T10:04:00.000Z",
    );
    assert.equal(conflicting.facts[factId].status, "conflicting", factId);
    const resolved = apply(
      conflicting,
      factId,
      "resolve_conflict",
      rawValues[factId],
      `domain:resolve:${index}`,
      "2026-07-27T10:05:00.000Z",
    );
    assert.equal(
      JSON.stringify(resolved.facts[factId].canonicalValue),
      JSON.stringify(expected),
      `${factId} resolve_conflict`,
    );
    const conflictHistory = resolved.facts[factId].staleHistory.at(-1);
    assert.equal(conflictHistory.status, "conflicting", factId);
    assert.deepEqual(
      conflictHistory.conflictValues,
      [alternate, expected],
      `${factId} normalized conflict history`,
    );

    assert.throws(
      () => apply(empty, factId, "human_commit", invalidValues[factId], `invalid:commit:${index}`, "2026-07-27T10:06:00.000Z"),
      TemplateCopilotFactTransitionError,
      `${factId} invalid human_commit`,
    );
    assert.throws(
      () => apply(beforeReplace, factId, "human_replace", invalidValues[factId], `invalid:replace:${index}`, "2026-07-27T10:07:00.000Z"),
      TemplateCopilotFactTransitionError,
      `${factId} invalid human_replace`,
    );
    assert.throws(
      () => apply(conflicting, factId, "resolve_conflict", invalidValues[factId], `invalid:resolve:${index}`, "2026-07-27T10:08:00.000Z"),
      TemplateCopilotFactTransitionError,
      `${factId} invalid resolve_conflict`,
    );
  }
});

test("all 16 invalid values fail before persistence, hashing, or RPC", async () => {
  assert.deepEqual(Object.keys(invalidValues), [...templateCopilotFactIds]);
  for (const factId of templateCopilotFactIds) {
    assert.throws(
      () => createPendingTemplateCopilotV2MapCommand({
        sessionId,
        expectedRevision: 7,
        idempotencyKey: `map:invalid:${factId}`,
        factId,
        factStatus: "unresolved",
        intent: { action: "save", canonicalValue: invalidValues[factId] },
      }),
      undefined,
      factId,
    );
    let rpcCalled = false;
    await assert.rejects(
      () => applyTemplateCopilotV2Mutation({
        session: {},
        service: {
          rpc: async () => {
            rpcCalled = true;
            return { data: {}, error: null };
          },
        },
        actor,
        sessionId,
        expectedRevision: 7,
        idempotencyKey: `map:invalid:${factId}`,
        factId,
        transition: {
          operation: "human_commit",
          payload: {
            canonicalValue: invalidValues[factId],
            provenance: [{
              kind: "human_editor",
              sourceId: `map:invalid:${factId}`,
              sourceMessageIds: [],
            }],
          },
        },
        flag: enabled,
      }),
      undefined,
      factId,
    );
    assert.equal(rpcCalled, false, factId);
  }
});

test("PostgreSQL accepts only ECMAScript-trimmed values and stores the normalized RPC value directly", async () => {
  const sql = await readFile(
    new URL("../../supabase/migrations/20260728000000_template_copilot_v2_fact_delta.sql", import.meta.url),
    "utf8",
  );
  for (const codePoint of [
    9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196,
    8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288,
    65279,
  ]) {
    assert.match(sql, new RegExp(`chr\\(${codePoint}\\)`), `U+${codePoint.toString(16)}`);
  }
  assert.match(
    sql,
    /p_value #>> '\{\}'\) = private\.template_copilot_v2_ecmascript_trim\(p_value #>> '\{\}'\)/i,
  );
  assert.match(
    sql,
    /not private\.template_copilot_v2_fact_value_valid\(p_fact_id,p_canonical_value\)/i,
  );
  assert.match(
    sql,
    /jsonb_build_object\('status','committed','canonicalValue',p_canonical_value/i,
  );
});
