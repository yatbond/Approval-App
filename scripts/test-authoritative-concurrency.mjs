import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = requiredEnv("LOCAL_SUPABASE_URL");
const serviceRoleKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const iterations = Number(process.env.APPROVAL_RACE_ITERATIONS || 1_000);
assert.ok(Number.isInteger(iterations) && iterations >= 1_000 && iterations <= 5_000);

const runId = randomUUID().slice(0, 8);
const password = `Phase4-${randomUUID()}-Aa1!`;
const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const actors = [];
for (let index = 0; index < 11; index += 1) {
  actors.push(await createActor(index));
}
const templateVersionId = await createTemplate(actors[0]);

const raceSpecs = Array.from({ length: iterations }, (_, index) => ({
  requestNo: `PHASE4-RACE-${runId}-${String(index).padStart(4, "0")}`,
  actor: actors[index % 10],
  mode: index % 5,
}));
const replaySpecs = Array.from({ length: 100 }, (_, index) => ({
  requestNo: `PHASE4-REPLAY-${runId}-${String(index).padStart(3, "0")}`,
  actor: actors[index % 10],
}));
const rateSpecs = Array.from({ length: 121 }, (_, index) => ({
  requestNo: `PHASE4-RATE-${runId}-${String(index).padStart(3, "0")}`,
  actor: actors[10],
}));
const rows = await createRequests([...raceSpecs, ...replaySpecs, ...rateSpecs]);

const latencies = [];
for (const batch of chunks(raceSpecs, 25)) {
  const batchResults = await Promise.all(
    batch.map(async (spec) => {
      const pair = raceCommands(spec);
      const [left, right] = await Promise.all(pair.map(timedRpc));
      return { spec, results: [left, right] };
    }),
  );
  for (const { spec, results } of batchResults) {
    latencies.push(...results.map((result) => result.durationMs));
    assert.deepEqual(
      results.map((result) => result.data.outcome).sort(),
      ["applied", "stale"],
      `${spec.requestNo} ${modeName(spec.mode)}`,
    );
  }
}

for (const [index, batch] of chunks(replaySpecs, 20).entries()) {
  await Promise.all(
    batch.map(async (spec, batchIndex) => {
      const args = commandArgs(spec, "approve", `replay-${spec.requestNo}`, {
        status: "approved",
        lastAction: "Idempotent replay proof",
      });
      let outcomes;
      if (index === 0 && batchIndex < 5) {
        const ignoredAppliedResponse = await timedRpc(args);
        const reconnectReplay = await timedRpc(args);
        latencies.push(ignoredAppliedResponse.durationMs, reconnectReplay.durationMs);
        outcomes = [ignoredAppliedResponse.data.outcome, reconnectReplay.data.outcome];
      } else {
        const results = await Promise.all([timedRpc(args), timedRpc(args)]);
        latencies.push(...results.map((result) => result.durationMs));
        outcomes = results.map((result) => result.data.outcome);
      }
      assert.deepEqual(outcomes.sort(), ["applied", "replayed"], spec.requestNo);
    }),
  );
}

const conflictSpec = replaySpecs[0];
const conflict = await rpc({
  ...commandArgs(conflictSpec, "approve", `replay-${conflictSpec.requestNo}`, {
    status: "approved",
    lastAction: "Idempotent replay proof",
  }),
  p_payload_hash: hash({ deliberately: "different" }),
});
assert.equal(conflict.outcome, "idempotency_conflict");

const stale = await rpc(
  commandArgs(raceSpecs[0], "approve", `stale-${raceSpecs[0].requestNo}`, {
    status: "approved",
  }),
);
assert.equal(stale.outcome, "stale");

await seedRateLimitReceipts(rateSpecs.slice(0, 120));
const rateLimited = await rpc(
  commandArgs(rateSpecs[120], "approve", `rate-limited-${runId}`, {
    status: "approved",
  }),
);
assert.equal(rateLimited.outcome, "rate_limited");

await assertInvariants([...raceSpecs, ...replaySpecs], rows);
const rateRow = rows.get(rateSpecs[120].requestNo);
assert.ok(rateRow);
const { data: untouchedRateRequest, error: rateReadError } = await service
  .from("approval_requests")
  .select("state_version,status")
  .eq("id", rateRow.id)
  .single();
assert.ifError(rateReadError);
assert.deepEqual(untouchedRateRequest, { state_version: 0, status: "pending" });

latencies.sort((left, right) => left - right);
const p50 = percentile(latencies, 0.5);
const p95 = percentile(latencies, 0.95);
const p99 = percentile(latencies, 0.99);
assert.ok(Math.max(...latencies) < 5_000, "row-lock waits must remain bounded");
console.log(
  JSON.stringify({
    outcome: "passed",
    raceIterations: iterations,
    replayScenarios: replaySpecs.length,
    raceModes: [
      "approve/approve",
      "approve/reject",
      "approve/reassign",
      "request_correction/approve",
      "cancel/approve",
    ],
    commandLatencyMs: { p50, p95, p99, max: Math.max(...latencies) },
  }),
);

function raceCommands(spec) {
  const suffix = spec.requestNo;
  if (spec.mode === 0) {
    return [
      commandArgs(spec, "approve", `approve-a-${suffix}`, { status: "approved" }),
      commandArgs(spec, "approve", `approve-b-${suffix}`, { status: "approved" }),
    ];
  }
  if (spec.mode === 1) {
    return [
      commandArgs(spec, "approve", `approve-${suffix}`, { status: "approved" }),
      commandArgs(spec, "reject", `reject-${suffix}`, { status: "returned" }),
    ];
  }
  if (spec.mode === 2) {
    return [
      commandArgs(spec, "approve", `approve-${suffix}`, { status: "approved" }),
      commandArgs(
        spec,
        "reassign",
        `reassign-${suffix}`,
        { lastAction: "Reassignment proposed" },
        actors[(actors.indexOf(spec.actor) + 1) % 10].id,
      ),
    ];
  }
  if (spec.mode === 3) {
    return [
      commandArgs(spec, "request_correction", `correct-${suffix}`, {
        status: "returned",
      }),
      commandArgs(spec, "approve", `approve-${suffix}`, { status: "approved" }),
    ];
  }
  return [
    commandArgs(spec, "cancel", `cancel-${suffix}`, { status: "cancelled" }),
    commandArgs(spec, "approve", `approve-${suffix}`, { status: "approved" }),
  ];
}

function commandArgs(spec, action, idempotencyKey, nextState, targetProfileId) {
  const event = {
    type: action,
    summary: `${action} concurrency proof`,
    details: { phase: 4, runId },
    ...(targetProfileId ? { targetProfileId } : {}),
  };
  const notifications = [
    {
      recipientProfileId: spec.actor.id,
      kind: action,
      title: `Phase 4 ${action}`,
      body: `Concurrency result for ${spec.requestNo}`,
      href: `/?tab=tracking&request=${spec.requestNo}`,
      sendEmail: true,
      templateKey: "approval-update",
    },
  ];
  const payload = {
    requestNo: spec.requestNo,
    actorId: spec.actor.id,
    idempotencyKey,
    action,
    expectedVersion: 0,
    nextState,
    event,
    notifications,
  };
  return {
    p_request_no: spec.requestNo,
    p_actor_id: spec.actor.id,
    p_idempotency_key: idempotencyKey,
    p_action: action,
    p_payload_hash: hash(payload),
    p_expected_state_version: 0,
    p_next_state: nextState,
    p_event: event,
    p_notifications: notifications,
  };
}

async function createActor(index) {
  const email = `phase4-actor-${index}-${runId}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Phase 4 Actor ${index}` },
  });
  assert.ifError(error);
  assert.ok(data.user?.id);
  const actor = {
    id: data.user.id,
    email,
    name: `Phase 4 Actor ${index}`,
  };
  const { error: profileError } = await service.from("profiles").upsert({
    id: actor.id,
    email: actor.email,
    full_name: actor.name,
    role: "admin",
    is_admin: true,
    is_active: true,
  });
  assert.ifError(profileError);
  return actor;
}

async function createTemplate(actor) {
  const { data: business, error: businessError } = await service
    .from("business_units")
    .insert({ name: `Phase 4 Business ${runId}`, is_active: true })
    .select("id")
    .single();
  assert.ifError(businessError);
  const { data: department, error: departmentError } = await service
    .from("business_departments")
    .insert({
      business_unit_id: business.id,
      name: `Phase 4 Department ${runId}`,
      is_active: true,
    })
    .select("id")
    .single();
  assert.ifError(departmentError);
  const { data: template, error: templateError } = await service
    .from("workflow_template_versions")
    .insert({
      template_key: `phase4-template-${runId}`,
      version_number: 1,
      name: `Phase 4 concurrency template ${runId}`,
      business_unit_id: business.id,
      department_id: department.id,
      graph: { nodes: [], edges: [] },
      document_requirements: [],
      supported_languages: ["en"],
      template_snapshot: { schemaVersion: 1, id: `phase4-template-${runId}` },
      created_by: actor.id,
      is_active: true,
      is_active_version: true,
    })
    .select("id")
    .single();
  assert.ifError(templateError);
  return template.id;
}

async function createRequests(specs) {
  const result = new Map();
  for (const batch of chunks(specs, 100)) {
    const { data, error } = await service
      .from("approval_requests")
      .insert(
        batch.map((spec) => ({
          request_no: spec.requestNo,
          workflow_template_version_id: templateVersionId,
          requester_id: spec.actor.id,
          requester_name: spec.actor.name,
          requester_email: spec.actor.email,
          title: `Phase 4 concurrency request ${spec.requestNo}`,
          workflow_name: `Phase 4 concurrency template ${runId}`,
          department_name: `Phase 4 Department ${runId}`,
          status: "pending",
          due_label: "Tomorrow",
          current_node_id: "approval-1",
          current_owner_id: spec.actor.id,
          current_owner_email: spec.actor.email,
          current_step: "Approval",
          pending_node_ids: ["approval-1"],
          pending_owner_emails: [spec.actor.email],
          participants: [spec.actor.email],
          task_snapshot: { schemaVersion: 1, id: spec.requestNo, status: "pending" },
          pinned_template_snapshot: { schemaVersion: 1, id: `phase4-template-${runId}` },
        })),
      )
      .select("id,request_no");
    assert.ifError(error);
    for (const row of data) result.set(row.request_no, row);
  }
  assert.equal(result.size, specs.length);
  return result;
}

async function seedRateLimitReceipts(specs) {
  for (const [index, spec] of specs.entries()) {
    const outcome = await rpc(
      commandArgs(spec, "approve", `rate-seed-${runId}-${String(index).padStart(3, "0")}`, {
        status: "approved",
      }),
    );
    assert.equal(outcome.outcome, "applied", `rate-limit seed ${index + 1}`);
  }
}

async function assertInvariants(specs, requestRows) {
  const ids = specs.map((spec) => requestRows.get(spec.requestNo).id);
  let requestCount = 0;
  for (const idBatch of chunks(ids, 100)) {
    const { data, error } = await service
      .from("approval_requests")
      .select("id,state_version,status")
      .in("id", idBatch);
    assert.ifError(error);
    assert.ok(data.every((row) => row.state_version === 1));
    assert.ok(
      data.every((row) =>
        ["approved", "returned", "pending", "cancelled"].includes(row.status),
      ),
    );
    requestCount += data.length;
  }
  assert.equal(requestCount, specs.length);
  for (const table of [
    "approval_command_receipts",
    "approval_request_events",
    "approval_notifications",
    "approval_email_outbox",
  ]) {
    let total = 0;
    for (const idBatch of chunks(ids, 100)) {
      const { count, error } = await service
        .from(table)
        .select("id", { count: "exact", head: true })
        .in("approval_request_id", idBatch);
      assert.ifError(error);
      total += count || 0;
    }
    assert.equal(total, specs.length, `${table} must contain exactly one winner row`);
  }
}

async function timedRpc(args) {
  const startedAt = performance.now();
  const data = await rpc(args);
  return { data, durationMs: Math.round(performance.now() - startedAt) };
}

async function rpc(args) {
  const { data, error } = await service.rpc("commit_approval_request_command", args);
  assert.ifError(error);
  return data;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function percentile(sortedValues, quantile) {
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * quantile))];
}

function modeName(mode) {
  return [
    "approve/approve",
    "approve/reject",
    "approve/reassign",
    "request_correction/approve",
    "cancel/approve",
  ][mode];
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
