import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const url = requiredEnv("LOCAL_SUPABASE_URL");
const serviceRoleKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const container =
  process.env.LOCAL_POSTGRES_CONTAINER ||
  "supabase_db_Approval_Workflow_Phase1_DB_Test";
const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: request, error: requestError } = await service
  .from("approval_requests")
  .select("id,request_no,current_owner_id,state_version,status")
  .like("request_no", "PHASE4-RACE-%")
  .order("submitted_at", { ascending: false })
  .limit(1)
  .single();
assert.ifError(requestError);
assert.ok(request.current_owner_id);

const lockProcess = spawn(
  "docker",
  ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  { stdio: ["pipe", "pipe", "pipe"] },
);
let lockOutput = "";
lockProcess.stdout.on("data", (chunk) => {
  lockOutput += String(chunk);
});
lockProcess.stderr.on("data", (chunk) => {
  lockOutput += String(chunk);
});
lockProcess.stdin.end(`
begin;
select id from public.approval_requests where id = '${request.id}' for update;
select pg_sleep(6);
rollback;
`);

await delay(750);
assert.equal(lockProcess.exitCode, null, `lock holder exited early: ${lockOutput}`);
const payload = {
  requestNo: request.request_no,
  action: "request_correction",
  expectedVersion: request.state_version,
  nonce: randomUUID(),
};
const startedAt = performance.now();
const { error: commandError } = await service.rpc(
  "commit_approval_request_command",
  {
    p_request_no: request.request_no,
    p_actor_id: request.current_owner_id,
    p_idempotency_key: `lock-timeout-${randomUUID()}`,
    p_action: "request_correction",
    p_payload_hash: createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
    p_expected_state_version: request.state_version,
    p_next_state: { status: "returned" },
    p_event: {
      type: "request_correction",
      summary: "Lock timeout proof",
      details: { phase: 4 },
    },
    p_notifications: [],
  },
);
const durationMs = Math.round(performance.now() - startedAt);
assert.ok(commandError, "the contended command must time out");
assert.equal(commandError.code, "55P03");
assert.ok(durationMs >= 2_500 && durationMs < 5_000, `bounded lock wait was ${durationMs}ms`);

const lockExitCode = await new Promise((resolve) => {
  lockProcess.once("close", resolve);
});
assert.equal(lockExitCode, 0, lockOutput);
const { data: after, error: afterError } = await service
  .from("approval_requests")
  .select("state_version,status")
  .eq("id", request.id)
  .single();
assert.ifError(afterError);
assert.deepEqual(after, {
  state_version: request.state_version,
  status: request.status,
});
console.log(JSON.stringify({ outcome: "passed", durationMs, errorCode: commandError.code }));

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
