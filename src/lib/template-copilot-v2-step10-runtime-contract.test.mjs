import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";

const [
  sql,
  server,
  adminRoute,
  adminPanel,
  adminView,
  cron,
  sessionRoute,
  answerRoute,
  describeRoute,
  previewScript,
  authorizedRunner,
  telemetryDatabaseTest,
  packageJson,
] = await Promise.all([
  source("../../supabase/migrations/20260730035305_template_copilot_v2_telemetry.sql"),
  source("./template-copilot-v2-telemetry-server.ts"),
  source("../app/api/admin/template-copilot-telemetry/route.ts"),
  source("../app/admin-copilot-telemetry-panel.tsx"),
  source("../app/admin-view.tsx"),
  source("../app/api/cron/approval-operations/route.ts"),
  source("../app/api/template-authoring/copilot/sessions/route.ts"),
  source("../app/api/template-authoring/copilot/sessions/[sessionId]/answers/route.ts"),
  source("../app/api/template-authoring/copilot/sessions/[sessionId]/describe/route.ts"),
  source("../../scripts/test-template-copilot-preview.mjs"),
  source("../../scripts/run-template-copilot-v2-step10-authorized-preview.mjs"),
  source("../../scripts/test-template-copilot-v2-telemetry-db.sql"),
  source("../../package.json").then(JSON.parse),
]);

test("telemetry is private, RPC-only, HMAC-pseudonymous, and expires after 30 days", () => {
  assert.match(sql, /create table private\.template_copilot_v2_telemetry_events/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(
    sql,
    /revoke all on table private\.template_copilot_v2_telemetry_events\s+from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|insert|update|delete|all)[^;]*template_copilot_v2_telemetry_events/i,
  );
  assert.match(sql, /clock_timestamp\(\) \+ interval '30 days'/i);
  assert.match(sql, /event\.expires_at > statement_timestamp\(\)/i);
  assert.match(sql, /expires_at <= coalesce\(p_before, statement_timestamp\(\)\)/i);
  assert.match(server, /createHmac\("sha256", secret\)/);
  assert.match(server, /TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET/);
  assert.doesNotMatch(server, /SUPABASE_SERVICE_ROLE_KEY[^]*HMAC_SECRET/);
  assert.match(server, /deterministicTelemetryEventId/);
  assert.match(sql, /template_copilot_v2_telemetry_idempotency_conflict/);
  assert.match(sql, /event\.provider is not distinct from p_provider/);
  assert.match(telemetryDatabaseTest, /identical telemetry replay/);
  assert.match(telemetryDatabaseTest, /conflicting telemetry replay/);
  assert.match(telemetryDatabaseTest, /expired telemetry remained logically readable/);
  assert.match(telemetryDatabaseTest, /telemetry purge deleted/);
  assert.match(telemetryDatabaseTest, /rollback;/);
});

test("the telemetry migration parses as PostgreSQL and PL/pgSQL", async () => {
  await Promise.all([parse(sql), parsePlPgSQL(sql)]);
});

test("database and HTTP access both require an active administrator", () => {
  const databaseCheck = sql.indexOf(
    "if not private.is_active_approval_admin(p_actor_id)",
  );
  const databaseRead = sql.indexOf(
    "from private.template_copilot_v2_telemetry_events event",
    databaseCheck,
  );
  assert.ok(databaseCheck >= 0 && databaseCheck < databaseRead);
  const routeHandler = adminRoute.indexOf("export async function GET");
  const routeCheck = adminRoute.indexOf("if (!actor.isAdmin)", routeHandler);
  const routeRead = adminRoute.indexOf(
    "listTemplateCopilotV2TelemetryForAdmin",
    routeCheck,
  );
  assert.ok(routeCheck >= 0 && routeCheck < routeRead);
  assert.match(sql, /grant execute on function public\.list_template_copilot_v2_telemetry_for_admin\([\s\S]+to service_role/i);
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.list_template_copilot_v2_telemetry_for_admin\([\s\S]+to (?:anon|authenticated)/i,
  );
});

test("the Admin surface exposes operational metadata without becoming a transcript", () => {
  assert.match(adminView, /<AdminCopilotTelemetryPanel \/>/);
  assert.match(adminPanel, /Raw answers, prompts, documents, names, and email addresses[\s\S]*never stored here/);
  assert.match(adminPanel, /automatic deletion after/);
  assert.doesNotMatch(adminPanel, /event\.sessionPseudonym|event\.actorPseudonym/);
  assert.match(adminRoute, /events: events\.map\(toAdminViewEvent\)/);
  assert.doesNotMatch(
    adminRoute.slice(adminRoute.indexOf("function toAdminViewEvent")),
    /sessionPseudonym|actorPseudonym/,
  );
  assert.match(adminRoute, /Cache-Control|approvalJson/);
});

test("real server routes emit replay-safe telemetry and scheduled retention purges it", () => {
  assert.match(sessionRoute, /recordTemplateCopilotV2TelemetryBestEffort/);
  assert.match(answerRoute, /recordTemplateCopilotV2TelemetryBestEffort/);
  assert.match(sessionRoute, /resultRecord\.outcome === "applied"/);
  assert.match(answerRoute, /result\.outcome === "applied"/);
  assert.match(describeRoute, /eventType: "provider_call_completed"/);
  assert.match(describeRoute, /getTemplateCopilotAiRoutingMetadata/);
  assert.match(describeRoute, /providerCode: providerRouting\.providerCode/);
  assert.match(describeRoute, /privacyMode: providerRouting\.privacyMode/);
  assert.doesNotMatch(describeRoute, /providerCode: "openrouter"/);
  assert.match(cron, /runTemplateCopilotV2TelemetryRetention\(\)/);
  assert.match(cron, /Promise\.all\(\[[\s\S]*templateCopilotTelemetryRetention/);
  assert.match(server, /template_copilot_v2_telemetry_retention_failed/);
  assert.match(server, /status: "failed" as const, deleted: 0/);
});

test("the authorized bundle cannot omit ZDR, RLS, concurrency, or accessibility gates", () => {
  assert.equal(
    packageJson.scripts["test:template-copilot-v2-step10:authorized-preview"],
    "node --import tsx scripts/run-template-copilot-v2-step10-authorized-preview.mjs",
  );
  for (const required of [
    "test-openrouter-copilot-model.mjs",
    "test-template-authoring-rls.sql",
    "test-template-copilot-db.sql",
    "test-template-copilot-v2-telemetry-db.sql",
    "test:db:concurrency",
    "test:e2e:template-copilot-preview",
    "test:e2e:template-copilot-cross-user",
    "test:e2e:template-copilot-v2-step8",
    "test:e2e:template-copilot-qualification",
  ]) {
    assert.match(authorizedRunner, new RegExp(escapeRegExp(required)));
  }
  assert.match(authorizedRunner, /process\.env\.npm_execpath/);
  assert.match(
    authorizedRunner,
    /run\(process\.execPath, \[npmEntrypoint, "run"/,
  );
  assert.doesNotMatch(authorizedRunner, /"npm\.cmd"/);
  assert.match(previewScript, /E2E_REQUIRE_COPILOT_ZDR/);
  assert.match(previewScript, /E2E_EXPECTED_COPILOT_PROVIDER/);
  assert.match(previewScript, /copilotCapabilities\.provider === expectedProvider/);
  assert.match(previewScript, /copilotCapabilities\.model === expectedModel/);
  assert.match(previewScript, /copilotCapabilities\.zdr === "required"/);
  assert.match(previewScript, /E2E_REQUIRE_COPILOT_TELEMETRY/);
  assert.match(previewScript, /copilotCapabilities\.schema === "2"/);
  assert.match(
    previewScript,
    /sessions\/\$\{startBody\.sessionId\}\/answers/,
  );
  assert.match(previewScript, /copilotCapabilities\.telemetry === "enabled"/);
  assert.match(
    previewScript,
    /list_template_copilot_v2_telemetry_for_admin/,
  );
  assert.match(previewScript, /event\.outcome_code === "session_applied"/);
  assert.match(previewScript, /preview_route_telemetry_admin_read=PASS/);
});

function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
