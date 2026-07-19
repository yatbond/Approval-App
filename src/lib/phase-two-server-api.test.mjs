import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20260720000500_authoritative_request_submission.sql",
);

test("request submission is service-only, idempotent, and atomic", () => {
  assert.match(migration, /create table if not exists public\.approval_submission_receipts/i);
  assert.match(migration, /unique \(actor_id, idempotency_key\)/i);
  assert.match(migration, /approval_submission_receipts_actor_created_idx/i);
  assert.match(migration, /'outcome', 'rate_limited'/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /insert into public\.approval_requests/i);
  assert.match(migration, /insert into public\.approval_submission_receipts/i);
  assert.match(migration, /insert into public\.approval_request_participants/i);
  assert.match(migration, /insert into public\.approval_request_assignments/i);
  assert.match(migration, /insert into public\.approval_request_attachments/i);
  assert.match(migration, /insert into public\.approval_request_events/i);
  assert.match(migration, /insert into public\.approval_notifications/i);
  assert.match(migration, /insert into public\.approval_email_outbox/i);
  assert.match(
    migration,
    /revoke all on function public\.submit_approval_request[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.submit_approval_request[\s\S]*to service_role/i,
  );
});

test("server action path derives actor and persistence fields", () => {
  const context = read("./approval-server.ts");
  const data = read("./approval-server-data.ts");
  assert.match(context, /getSupabaseRouteUser\(session\)/);
  assert.match(context, /\.from\("profiles"\)/);
  assert.match(data, /p_actor_id: actor\.id/);
  assert.match(data, /canonicalPayloadHash\(\{ requestNo, command \}\)/);
  assert.match(data, /computeApprovalTransition/);
  assert.match(data, /currentOwnerId/);
  assert.match(data, /details:[\s\S]*correlationId/);
  assert.doesNotMatch(data, /command\.actor/i);
  assert.doesNotMatch(data, /command\.timestamp/i);
});

test("personalized DTO queries are bounded and do not expose attachment paths", () => {
  const data = read("./approval-server-data.ts");
  assert.match(data, /\.limit\(fetchLimit\)/);
  assert.match(data, /updated_at\.lt\./);
  assert.match(data, /Math\.min\([\s\S]*200\)/);
  const attachmentDto = data.slice(
    data.indexOf("attachments: attachments.map"),
    data.indexOf("availableActions:", data.indexOf("attachments: attachments.map")),
  );
  assert.doesNotMatch(attachmentDto, /storage_path|public_url/);
});
