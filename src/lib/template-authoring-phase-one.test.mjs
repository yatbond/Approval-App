import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260725144317_template_authoring_foundation.sql",
  import.meta.url,
);

test("authoring migration defines normalized families, drafts, reviews, receipts, and events", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of [
    "template_authoring_families",
    "template_authoring_memberships",
    "template_authoring_drafts",
    "template_authoring_publish_requests",
    "template_authoring_command_receipts",
    "template_authoring_events",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("authoring migration exposes no browser mutation grant", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /revoke all privileges on table[\s\S]+from public, anon, authenticated;/,
  );
  assert.doesNotMatch(
    sql,
    /grant (insert|update|delete|all)[\s\S]{0,300}to authenticated;/i,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.(create|replace|request|review|publish)_template_authoring[\s\S]{0,400}to authenticated;/i,
  );
});

test("every authoring mutation is definer, empty-search-path, versioned, and idempotent", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const fn of [
    "create_template_authoring_family",
    "create_template_authoring_draft",
    "replace_template_authoring_draft",
    "request_template_authoring_publish",
    "review_template_authoring_publish",
    "publish_template_authoring_draft",
  ]) {
    const start = sql.indexOf(`create or replace function public.${fn}`);
    assert.ok(start >= 0, `missing ${fn}`);
    const end = sql.indexOf("\n$$;", start);
    const body = sql.slice(start, end);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /idempotency_key/);
    assert.match(body, /payload_hash/);
  }
  assert.match(sql, /for update;/);
  assert.match(sql, /stale_revision/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test("publication requires review and creates an immutable inactive runtime version", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const start = sql.indexOf(
    "create or replace function public.publish_template_authoring_draft",
  );
  const body = sql.slice(start);

  assert.match(body, /v_request\.status <> 'approved'/);
  assert.match(body, /v_draft\.status <> 'approved'/);
  assert.match(body, /validation_summary/);
  assert.match(body, /unresolvedQuestionIds/);
  assert.match(body, /insert into public\.workflow_template_versions/);
  assert.match(body, /'false'::jsonb/);
  assert.match(body, /is_active_version[\s\S]+false/);
  assert.match(body, /'version_published'/);
});

test("template authoring routes authenticate, bound bodies, and expose OpenAPI", async () => {
  const routePaths = [
    "../app/api/template-authoring/context/route.ts",
    "../app/api/template-authoring/families/route.ts",
    "../app/api/template-authoring/families/[familyId]/drafts/route.ts",
    "../app/api/template-authoring/drafts/[draftId]/route.ts",
    "../app/api/template-authoring/validate/route.ts",
    "../app/api/template-authoring/simulate/route.ts",
    "../app/api/template-authoring/diff/route.ts",
    "../app/api/template-authoring/drafts/[draftId]/publish-requests/route.ts",
    "../app/api/template-authoring/publish-requests/[requestId]/review/route.ts",
    "../app/api/template-authoring/publish-requests/[requestId]/publish/route.ts",
  ];
  for (const routePath of routePaths) {
    const source = await readFile(new URL(routePath, import.meta.url), "utf8");
    assert.match(source, /createApprovalServerContext\(request\)/);
  }

  for (const routePath of routePaths.filter(
    (routePath) => !routePath.includes("/context/"),
  )) {
    const source = await readFile(new URL(routePath, import.meta.url), "utf8");
    if (source.includes("export async function POST") || source.includes("export async function PUT")) {
      assert.match(source, /readBoundedJson\(request,/);
    }
  }

  const openapi = await readFile(
    new URL("./template-authoring-openapi.ts", import.meta.url),
    "utf8",
  );
  assert.match(openapi, /openapi: "3\.1\.0"/);
  assert.match(openapi, /expectedRevision/);
  assert.match(openapi, /idempotencyKey/);
  assert.match(openapi, /publishTemplateVersion/);
});
