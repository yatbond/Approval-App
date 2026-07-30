import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (relative) =>
  readFile(new URL(relative, import.meta.url), "utf8");

test("Step 9 renders ledger-derived playback and four distinct readiness states", async () => {
  const [module, panel, copilot, projection] = await Promise.all([
    read("./template-copilot-v2-playback.ts"),
    read("../app/template-copilot-v2-playback-panel.tsx"),
    read("../app/template-copilot.tsx"),
    read("./template-copilot-v2-authoritative-projection.ts"),
  ]);
  for (const section of [
    '"start"',
    '"request"',
    '"stages"',
    '"routing"',
    '"correction"',
    '"timing"',
    '"handoffs"',
    '"notifications"',
    '"governance"',
  ]) {
    assert.match(module, new RegExp(section));
  }
  assert.match(module, /getTemplateCopilotReadiness\(ledger/);
  assert.match(module, /getTemplateCopilotV2InterviewState\(ledger\)/);
  assert.match(module, /compilerValid: compilerIssues\.length === 0/);
  assert.match(module, /publishedSourceRevision/);
  assert.match(panel, /Interview progress/);
  assert.match(panel, /Draft-ready/);
  assert.match(panel, /Publication-ready/);
  assert.match(panel, /Activation-ready/);
  assert.match(panel, /Assumptions/);
  assert.match(panel, /Not-applicable decisions/);
  assert.match(panel, /Conflicts/);
  assert.match(panel, /Unresolved items/);
  assert.match(panel, /Compiler errors/);
  assert.match(panel, /Warnings/);
  assert.match(panel, /explicit authorized human action against the exact current revision/);
  assert.match(copilot, /<TemplateCopilotV2PlaybackPanel/);
  assert.match(projection, /playback: TemplateCopilotV2Playback/);
});

test("playback never treats suggestions, unknowns, defaults, or model prose as assumptions or executable rules", async () => {
  const [module, panel] = await Promise.all([
    read("./template-copilot-v2-playback.ts"),
    read("../app/template-copilot-v2-playback-panel.tsx"),
  ]);
  assert.match(module, /fact\.status !== "committed"/);
  assert.match(module, /assumptions: Object\.freeze\(\[\]\)/);
  assert.match(module, /unknown; it is not an accepted assumption/);
  assert.match(panel, /Suggestions, unknowns, and model prose cannot become executable rules/);
  assert.doesNotMatch(module, /\b(?:fetch|OpenAI|chat\.completions|responses\.create)\s*\(/);
});

test("exact-version activation adapter sends only server-derived actor and a bounded revision command", async () => {
  const adapter = await read("./template-authoring-server-data.ts");
  assert.match(adapter, /"activate_template_authoring_version"/);
  assert.match(adapter, /p_actor_id: actor\.id/);
  assert.match(adapter, /p_published_version_id: publishedVersionId/);
  assert.match(adapter, /p_expected_version_number: expectedVersionNumber/);
  assert.match(
    adapter,
    /p_payload_hash: canonicalPayloadHash\(\{[\s\S]*publishedVersionId,[\s\S]*expectedVersionNumber,[\s\S]*idempotencyKey/,
  );
  for (const forbidden of [
    "p_actor_email",
    "p_is_admin",
    "p_role",
    "p_active",
    "p_template_snapshot",
  ]) {
    assert.doesNotMatch(adapter, new RegExp(forbidden));
  }
});

test("activation is service-only, authorized, stale-safe, idempotent, and auditable", async () => {
  const sql = await read(
    "../../supabase/migrations/20260730010000_template_authoring_activation.sql",
  );
  const start = sql.indexOf(
    "create or replace function public.activate_template_authoring_version",
  );
  assert.ok(start >= 0);
  const body = sql.slice(start);
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(
    body,
    /':activate_version:'[\s\S]+pg_catalog\.btrim\(p_idempotency_key\)/,
  );
  assert.match(body, /p_actor_id is null/);
  assert.match(body, /p_published_version_id is null/);
  assert.match(body, /operation = 'activate_version'/);
  assert.match(body, /idempotency_conflict/);
  assert.doesNotMatch(body, /has_template_authoring_family_role/);
  assert.match(body, /from public\.template_authoring_memberships m/);
  assert.match(body, /join public\.profiles p/);
  assert.match(body, /and p\.is_active/);
  assert.match(body, /and m\.role = 'publisher'/);
  assert.match(body, /'outcome', 'forbidden'/);
  assert.match(body, /v_family\.status <> 'active'/);
  assert.match(body, /d\.status = 'published'/);
  assert.match(body, /r\.status = 'published'/);
  assert.match(body, /r\.requested_revision = d\.revision/);
  assert.match(body, /from public\.template_copilot_sessions s/);
  assert.match(body, /s\.generated_source_revision/);
  assert.match(body, /s\.generated_artifact = jsonb_build_object/);
  assert.match(body, /in \('manual', 'external_agent'\)/);
  assert.match(body, /d\.definition #>> '\{generation,mode\}' = 'copilot'/);
  assert.match(body, /v_version\.template_snapshot/);
  assert.match(body, /v_expected_template/);
  assert.match(
    body,
    /v_version\.graph is distinct from v_expected_template -> 'graph'/,
  );
  assert.match(body, /v_version\.document_requirements/);
  assert.match(
    body,
    /v_version\.supported_languages is distinct from v_expected_languages/,
  );
  assert.match(sql, /generated_artifact jsonb/);
  assert.match(
    sql,
    /create or replace function public\.link_template_copilot_draft[\s\S]+generated_artifact = jsonb_build_object/,
  );
  assert.match(body, /v_version\.version_number <> p_expected_version_number/);
  assert.match(body, /'outcome', 'stale_revision'/);
  assert.match(body, /set is_active_version = false/);
  assert.match(body, /set is_active_version = true/);
  assert.match(body, /'version_activated'/);
  assert.match(sql, /private\.mark_template_authoring_version/);
  assert.match(sql, /private\.guard_template_authoring_version_write/);
  assert.match(sql, /app\.template_authoring_version_write/);
  assert.match(body, /set_config\([\s\S]*'activate'/);
  assert.match(sql, /'\{authoringFamilyId\}'/);
  assert.ok(
    body.indexOf("where f.family_key = v_family_key") <
      body.indexOf("and v.template_key = v_family.family_key"),
    "the family row is locked before the selected version row",
  );
  assert.match(
    body,
    /revoke all on function public\.activate_template_authoring_version[\s\S]+from public, anon, authenticated;/,
  );
  assert.match(
    body,
    /grant execute on function public\.activate_template_authoring_version[\s\S]+to service_role;/,
  );
});

test("the authenticated activation route and browser action require the exact published version", async () => {
  const [route, client, controller, openapi, feature, context, publisherRoute] = await Promise.all([
    read("../app/api/template-authoring/versions/[versionId]/activate/route.ts"),
    read("./template-authoring-client.ts"),
    read("../app/use-workspace-admin-records.ts"),
    read("./template-authoring-openapi.ts"),
    read("./template-authoring-lifecycle-feature.ts"),
    read("../app/api/template-authoring/context/route.ts"),
    read("../app/api/template-authoring/families/[familyId]/publishers/route.ts"),
  ]);
  assert.match(route, /createApprovalServerContext\(request\)/);
  assert.match(route, /readBoundedJson\(request, 16_000\)/);
  assert.match(route, /activateTemplateVersionCommandSchema/);
  assert.doesNotMatch(route, /actorId|isAdmin|role:/);
  assert.match(client, /expectedVersionNumber/);
  assert.match(client, /const activationAttempts = new Map/);
  assert.match(client, /if \(prior\?\.inFlight\) return prior\.inFlight/);
  assert.match(client, /idempotencyKey: attempt\.idempotencyKey/);
  assert.match(controller, /await activateTemplateAuthoringVersionClient/);
  assert.match(controller, /template\?\.authoringFamilyId/);
  assert.match(controller, /template\.databaseVersionId/);
  assert.match(controller, /publishedVersionId: template\.databaseVersionId/);
  assert.match(controller, /if \(isAuthoritativeAuthoringActivation\)/);
  assert.match(
    controller,
    /Do not send the browser's stale whole-workspace snapshot/,
  );
  assert.match(openapi, /activateTemplateVersion/);
  assert.match(openapi, /ActivateTemplateVersionCommand/);
  assert.match(
    feature,
    /TEMPLATE_AUTHORING_ACTIVATION_ENABLED === "true"/,
  );
  assert.match(route, /isTemplateAuthoringActivationEnabled\(\)/);
  assert.match(context, /\.from\("template_authoring_memberships"\)/);
  assert.match(context, /\.eq\("profile_id", actor\.id\)/);
  assert.match(context, /\.eq\("role", "publisher"\)/);
  assert.match(context, /template_authoring_families!inner\(status\)/);
  assert.match(
    context,
    /\.eq\("template_authoring_families\.status", "active"\)/,
  );
  assert.match(context, /activationFamilyIds/);
  assert.match(context, /canManagePublishers: actor\.isAdmin/);
  const library = await read("../app/workflow-template-library.tsx");
  assert.match(library, /fetch\("\/api\/template-authoring\/context"/);
  assert.match(library, /payload\?\.actor\?\.activationFamilyIds/);
  assert.match(library, /authoringActivationFamilyIds\.includes/);
  assert.match(
    library,
    /item\.template\.authoringFamilyId[\s\S]*\? !activationFeatureAvailable \|\|[\s\S]*!authoringActivationFamilyIds\.includes[\s\S]*: !item\.canActivate/,
  );
  assert.match(
    library,
    /activationFeatureAvailable &&[\s\S]*publisherEmail === activeUserEmail/,
  );
  assert.match(library, /publisherBusyFamilyIds\.includes/);
  assert.match(
    library,
    /current\.filter\(\(item\) => item !== familyId\)/,
  );
  assert.match(library, /Activation publisher/);
  assert.match(
    library,
    /section !== "archive" &&[\s\S]*canManageAuthoringPublishers/,
  );
  assert.match(library, /Grant access/);
  assert.match(library, /Revoke/);
  assert.match(
    library,
    /\/api\/template-authoring\/families\/\$\{encodeURIComponent\(familyId\)\}\/publishers/,
  );
  assert.match(publisherRoute, /createApprovalServerContext\(request\)/);
  assert.match(publisherRoute, /setTemplatePublisherCommandSchema/);
  assert.match(publisherRoute, /setTemplateAuthoringPublisher/);
  assert.match(openapi, /setTemplatePublisher/);
});

test("publisher provisioning is explicit, IT-governed, idempotent, and auditable", async () => {
  const [sql, serverData] = await Promise.all([
    read(
      "../../supabase/migrations/20260730010000_template_authoring_activation.sql",
    ),
    read("./template-authoring-server-data.ts"),
  ]);
  assert.match(
    sql,
    /create or replace function public\.set_template_authoring_publisher/,
  );
  assert.match(sql, /private\.is_active_approval_admin\(p_actor_id\)/);
  assert.match(sql, /operation = 'set_publisher'/);
  assert.match(sql, /'publisher_granted'/);
  assert.match(sql, /'publisher_revoked'/);
  assert.match(sql, /on conflict \(family_id, profile_id, role\) do nothing/);
  assert.match(sql, /m\.role = 'publisher'/);
  assert.match(
    sql,
    /revoke all on function public\.set_template_authoring_publisher[\s\S]+from public, anon, authenticated;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.set_template_authoring_publisher[\s\S]+to service_role;/,
  );
  assert.match(serverData, /"set_template_authoring_publisher"/);
  assert.match(serverData, /p_payload_hash: canonicalPayloadHash/);
});

test("immutable activation comparisons fail closed for null or drifted values", async () => {
  const sql = await read(
    "../../supabase/migrations/20260730010000_template_authoring_activation.sql",
  );
  for (const comparison of [
    /v_version\.template_snapshot[\s\S]+is distinct from/,
    /v_version\.graph is distinct from/,
    /v_version\.document_requirements[\s\S]+is distinct from/,
    /v_version\.supported_languages is distinct from/,
    /v_version\.name is distinct from/,
    /v_version\.business_unit_id is distinct from/,
    /v_version\.department_id is distinct from/,
  ]) {
    assert.match(sql, comparison);
  }
});

test("published-source readiness is bound to a server-owned exact Copilot artifact and fails closed after edits", async () => {
  const [
    contracts,
    compiler,
    createDraft,
    sessionRoute,
    serverData,
    http,
    replaceRoute,
    createFamilyRoute,
    createDraftRoute,
    lineage,
  ] =
    await Promise.all([
      read("./template-authoring-contracts.ts"),
      read("./template-copilot-compiler.ts"),
      read(
        "../app/api/template-authoring/copilot/sessions/[sessionId]/create-draft/route.ts",
      ),
      read(
        "../app/api/template-authoring/copilot/sessions/[sessionId]/route.ts",
      ),
      read("./template-copilot-v2-server-data.ts"),
      read("./template-authoring-http.ts"),
      read("../app/api/template-authoring/drafts/[draftId]/route.ts"),
      read("../app/api/template-authoring/families/route.ts"),
      read("../app/api/template-authoring/families/[familyId]/drafts/route.ts"),
      read("./template-authoring-lineage.ts"),
    ]);
  assert.match(contracts, /sourceSessionId/);
  assert.match(contracts, /sourceSessionRevision/);
  assert.match(compiler, /sourceSessionRevision: input\.sourceSessionRevision/);
  assert.match(createDraft, /sourceSessionId: sessionId/);
  assert.match(createDraft, /sourceSessionRevision: current\.revision/);
  assert.match(createDraft, /inapplicableFactIds:/);
  assert.match(createDraft, /const expectedBlockedScaffold/);
  assert.match(
    createDraft,
    /item\.code === "blocking_question_unanswered"/,
  );
  assert.match(sessionRoute, /loadTemplateCopilotV2PublishedSourceRevision/);
  assert.match(sessionRoute, /publishedSourceRevision/);
  assert.match(
    serverData,
    /getTemplateCopilotV2PublishedSourceRevision\(\{/,
  );
  assert.match(serverData, /generated_source_revision/);
  assert.match(serverData, /generated_artifact/);
  assert.match(serverData, /sameTemplateCopilotV2CanonicalValue/);
  assert.match(sessionRoute, /isTemplateAuthoringActivationEnabled\(\)/);
  assert.match(http, /"currentVersionNumber"/);
  for (const generalRoute of [
    replaceRoute,
    createFamilyRoute,
    createDraftRoute,
  ]) {
    assert.match(generalRoute, /removeUntrustedCopilotLineage\(parsed\.data\)/);
  }
  assert.match(lineage, /delete generation\.sourceSessionId/);
  assert.match(lineage, /delete generation\.sourceSessionRevision/);
  assert.match(lineage, /generation\.mode === "copilot" \? "manual"/);
});

test("publication lifecycle blocks edit-after-review, stale revisions, double submission, and unauthorized actors", async () => {
  const [foundation, requestRoute, reviewRoute, publishRoute] =
    await Promise.all([
      read(
        "../../supabase/migrations/20260725144317_template_authoring_foundation.sql",
      ),
      read(
        "../app/api/template-authoring/drafts/[draftId]/publish-requests/route.ts",
      ),
      read(
        "../app/api/template-authoring/publish-requests/[requestId]/review/route.ts",
      ),
      read(
        "../app/api/template-authoring/publish-requests/[requestId]/publish/route.ts",
      ),
    ]);
  assert.match(
    foundation,
    /v_draft\.status not in \('draft', 'changes_requested'\)/,
  );
  assert.match(
    foundation,
    /create unique index template_authoring_one_pending_request_per_draft_idx[\s\S]+where status = 'pending'/,
  );
  assert.match(foundation, /v_draft\.revision <> p_expected_revision/);
  assert.match(foundation, /'outcome', 'stale_revision'/);
  assert.match(foundation, /'outcome', 'forbidden'/);
  assert.match(foundation, /v_request\.status <> 'approved'/);
  assert.match(foundation, /v_draft\.revision <> v_request\.requested_revision/);
  for (const route of [requestRoute, reviewRoute, publishRoute]) {
    assert.match(route, /createApprovalServerContext\(request\)/);
    assert.match(route, /readBoundedJson\(request,/);
  }
});

test("v1 remains read-only in v2 and requires explicit upgrade preview approval", async () => {
  const [createDraftRoute, upgradeRoute, facts] = await Promise.all([
    read(
      "../app/api/template-authoring/copilot/sessions/[sessionId]/create-draft/route.ts",
    ),
    read(
      "../app/api/template-authoring/copilot/sessions/[sessionId]/upgrade/route.ts",
    ),
    read("./template-copilot-facts.ts"),
  ]);
  assert.match(
    createDraftRoute,
    /compileTemplateCopilotV2AuthoringArtifacts/,
  );
  assert.doesNotMatch(createDraftRoute, /v2_session_read_only/);
  assert.match(createDraftRoute, /v1_session_read_only/);
  assert.match(upgradeRoute, /previewHash/);
  assert.match(upgradeRoute, /expectedRevision/);
  assert.match(facts, /approveLegacyTemplateCopilotUpgrade/);
  assert.match(facts, /previewHash/);
  assert.match(facts, /status: "candidate"/);
});
