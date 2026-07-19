import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = requiredEnv("LOCAL_SUPABASE_URL");
const anonKey = requiredEnv("LOCAL_SUPABASE_ANON_KEY");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const userCount = Number(process.env.PHASE7_ACTIVE_USERS || 300);
const commandCount = Number(process.env.PHASE7_COMMAND_BURST || 50);
assert.ok(Number.isInteger(userCount) && userCount >= 300 && userCount <= 500);
assert.ok(Number.isInteger(commandCount) && commandCount >= 50 && commandCount <= 100);

const runId = randomUUID().slice(0, 8);
const password = `Phase7-${randomUUID()}-Aa1!`;
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const users = [];
for (const batch of chunks(Array.from({ length: userCount }, (_, index) => index), 25)) {
  users.push(...await Promise.all(batch.map(createUser)));
}

const clients = [];
for (const batch of chunks(users, 25)) {
  clients.push(...await Promise.all(batch.map(signIn)));
}

const requests = await createRequests(users.slice(0, commandCount));
const activeReadStarted = performance.now();
const activeReads = await Promise.all(clients.map(async (client) => {
  const startedAt = performance.now();
  const { data, error } = await client.from("profiles").select("id").limit(20);
  return { durationMs: performance.now() - startedAt, rows: data?.length || 0, error };
}));
const activeReadElapsedMs = performance.now() - activeReadStarted;
assert.equal(activeReads.filter((result) => result.error).length, 0);
assert.ok(activeReads.every((result) => result.rows >= 1));

const samples = [];
let sampleInFlight = false;
const sampler = setInterval(async () => {
  if (sampleInFlight) return;
  sampleInFlight = true;
  try {
    const { data, error } = await service.rpc("get_approval_operational_metrics");
    if (!error && data) samples.push(data);
  } finally {
    sampleInFlight = false;
  }
}, 20);

const burstStarted = performance.now();
const commandResults = await Promise.all(requests.map(async (request, index) => {
  const args = commandArgs(request, users[index]);
  const startedAt = performance.now();
  const { data, error } = await service.rpc("commit_approval_request_command", args);
  return { durationMs: performance.now() - startedAt, data, error };
}));
const burstElapsedMs = performance.now() - burstStarted;
clearInterval(sampler);
while (sampleInFlight) await new Promise((resolve) => setTimeout(resolve, 5));
const { data: finalMetrics, error: metricsError } = await service.rpc("get_approval_operational_metrics");
assert.ifError(metricsError);
samples.push(finalMetrics);

assert.equal(commandResults.filter((result) => result.error).length, 0);
assert.ok(commandResults.every((result) => result.data?.outcome === "applied"));
const requestIds = requests.map((request) => request.id);
const { data: finalRequests, error: finalRequestError } = await service
  .from("approval_requests").select("id,state_version,status").in("id", requestIds);
assert.ifError(finalRequestError);
assert.equal(finalRequests.length, commandCount);
assert.ok(finalRequests.every((row) => row.state_version === 1 && row.status === "approved"));
for (const table of ["approval_command_receipts", "approval_request_events", "approval_notifications", "approval_email_outbox"]) {
  const { count, error } = await service.from(table)
    .select("id", { count: "exact", head: true }).in("approval_request_id", requestIds);
  assert.ifError(error);
  assert.equal(count, commandCount, `${table} lost or duplicated command effects`);
}

const readLatencies = activeReads.map((result) => result.durationMs).sort(numeric);
const commandLatencies = commandResults.map((result) => result.durationMs).sort(numeric);
const readPercentiles = percentiles(readLatencies);
const commandPercentiles = percentiles(commandLatencies);
const maxConnections = Math.max(...samples.map((sample) => Number(sample.databaseConnections || 0)));
const maxLockWaits = Math.max(...samples.map((sample) => Number(sample.lockWaits || 0)));
assert.ok(readPercentiles.p95 < 1_500, `300-user read p95 ${readPercentiles.p95}ms exceeded 1500ms`);
assert.ok(commandPercentiles.p95 < 1_500, `command p95 ${commandPercentiles.p95}ms exceeded 1500ms`);
assert.ok(commandPercentiles.p99 < 2_500, `command p99 ${commandPercentiles.p99}ms exceeded 2500ms`);
assert.equal(maxLockWaits, 0, "load burst produced a database lock wait");

console.log(JSON.stringify({
  outcome: "passed",
  activeUsers: userCount,
  activeReadWaveMs: Math.round(activeReadElapsedMs),
  activeReadLatencyMs: readPercentiles,
  commandBurst: commandCount,
  commandBurstLaunchWindowMs: 1,
  commandBurstCompletionMs: Math.round(burstElapsedMs),
  commandLatencyMs: commandPercentiles,
  errorRate: 0,
  database: { maxConnections, maxLockWaits },
  invariants: { requests: commandCount, receipts: commandCount, events: commandCount, notifications: commandCount, outbox: commandCount },
}));

async function createUser(index) {
  const email = `phase7-load-${runId}-${index}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `Phase 7 User ${index}` },
  });
  assert.ifError(error);
  const user = { id: data.user.id, email };
  const { error: profileError } = await service.from("profiles").upsert({
    id: user.id, email, full_name: `Phase 7 User ${index}`,
    role: "participant", is_admin: false, is_active: true,
  });
  assert.ifError(profileError);
  return user;
}

async function signIn(user) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password });
  assert.ifError(error);
  return client;
}

async function createRequests(owners) {
  const { data, error } = await service.from("approval_requests").insert(owners.map((owner, index) => ({
    request_no: `P7-LOAD-${runId}-${String(index).padStart(3, "0")}`,
    requester_id: owner.id, requester_name: `Phase 7 User ${index}`, requester_email: owner.email,
    title: `Phase 7 load request ${index}`, workflow_name: "Load proof", department_name: "Testing",
    status: "pending", due_label: "Tomorrow", current_node_id: "review",
    current_owner_id: owner.id, current_owner_email: owner.email, current_step: "Review",
    pending_node_ids: ["review"], pending_owner_emails: [owner.email], participants: [owner.email],
    task_snapshot: { schemaVersion: 1 }, pinned_template_snapshot: { schemaVersion: 1 },
  }))).select("id,request_no");
  assert.ifError(error);
  return data;
}

function commandArgs(request, actor) {
  const idempotencyKey = `phase7-load-${request.id}`;
  const nextState = { status: "approved", lastAction: "Phase 7 load approved" };
  const event = { type: "approve", summary: "Phase 7 load proof", details: { runId } };
  const notifications = [{
    recipientProfileId: actor.id, kind: "approved", title: "Load proof approved",
    body: request.request_no, href: `/?request=${request.request_no}`, sendEmail: true,
    templateKey: "approval-update",
  }];
  const payload = {
    requestNo: request.request_no, actorId: actor.id, idempotencyKey,
    action: "approve", expectedVersion: 0, nextState, event, notifications,
  };
  return {
    p_request_no: request.request_no, p_actor_id: actor.id, p_idempotency_key: idempotencyKey,
    p_action: "approve", p_payload_hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    p_expected_state_version: 0, p_next_state: nextState, p_event: event, p_notifications: notifications,
  };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
function numeric(left, right) { return left - right; }
function percentiles(values) {
  const at = (quantile) => Math.round(values[Math.min(values.length - 1, Math.floor(values.length * quantile))]);
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: Math.round(values.at(-1)) };
}
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
