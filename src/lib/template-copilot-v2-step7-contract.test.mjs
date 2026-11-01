import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";
import {
  getTemplateCopilotV2StructuredEditorFlags,
  isTemplateCopilotV2StructuredEditorEnabled,
} from "./template-copilot-v2-feature.ts";
import {
  templateCopilotV2AttachmentRequirementsSchema,
  templateCopilotV2ConditionRulesSchema,
  templateCopilotV2NotificationRulesSchema,
} from "./template-copilot-v2-structured-facts.ts";

function jsonNodeCount(value) {
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) return 1 + value.reduce((total, item) => total + jsonNodeCount(item), 0);
  return 1 + Object.values(value).reduce((total, item) => total + jsonNodeCount(item), 0);
}

test("Step 7 flags default off and enable each editor independently", () => {
  assert.deepEqual(getTemplateCopilotV2StructuredEditorFlags({}), {
    attachments: false,
    conditions: false,
    notifications: false,
  });
  const attachments = { TEMPLATE_COPILOT_V2_ATTACHMENT_EDITOR: "true" };
  assert.equal(isTemplateCopilotV2StructuredEditorEnabled("attachments.requirements", attachments), true);
  assert.equal(isTemplateCopilotV2StructuredEditorEnabled("workflow.conditions", attachments), false);
  assert.equal(isTemplateCopilotV2StructuredEditorEnabled("notifications.rules", attachments), false);
  assert.deepEqual(getTemplateCopilotV2StructuredEditorFlags({
    TEMPLATE_COPILOT_V2_CONDITION_EDITOR: "true",
    TEMPLATE_COPILOT_V2_NOTIFICATION_EDITOR: "true",
  }), { attachments: false, conditions: true, notifications: true });
});

test("authenticated fact route enforces parent and per-editor server gates", async () => {
  const [route, conflictRoute] = await Promise.all([
    readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/facts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/extraction-conflicts/route.ts", import.meta.url), "utf8"),
  ]);
  const parent = route.indexOf("if (!isTemplateCopilotV2Step5EditingEnabled())");
  const child = route.indexOf("&& !isTemplateCopilotV2StructuredEditorEnabled");
  const mutation = route.indexOf("const result = await applyTemplateCopilotV2Mutation");
  assert.ok(parent >= 0 && child > parent && mutation > child);
  assert.match(route, /TemplateCopilotV2StructuredFactsError/);
  assert.match(route, /code: "structured_editor_unavailable"/);
  assert.match(route, /code: "invalid_structure"/);
  assert.match(route, /readBoundedJson\(request, 2_000_000\)/);
  assert.match(conflictRoute, /readBoundedJson\(request, 2_000_000\)/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_TEMPLATE_COPILOT/u);
});

test("session responses expose server-derived read-only capabilities", async () => {
  const [serverData, sessionRoute, client] = await Promise.all([
    readFile(new URL("./template-copilot-v2-server-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(serverData, /structuredEditorFlags: getTemplateCopilotV2StructuredEditorFlags\(\)/);
  assert.match(sessionRoute, /structuredEditorFlags: getTemplateCopilotV2StructuredEditorFlags\(\)/);
  assert.match(client, /structuredEditorFlags=\{state\.structuredEditorFlags\}/);
  assert.ok((client.match(/structuredEditorFlagsFrom\(/gu) || []).length >= 10);
  assert.match(client, /structuredRollback/);
});

test("structured UI uses native keyboard controls and associates field errors", async () => {
  const editor = await readFile(new URL("../app/template-copilot-v2-structured-editors.tsx", import.meta.url), "utf8");
  assert.match(editor, /<fieldset/);
  assert.match(editor, /<legend/);
  assert.match(editor, /<label htmlFor=\{id\}>/);
  assert.match(editor, /"aria-invalid"/);
  assert.match(editor, /"aria-describedby"/);
  assert.match(editor, /type="button"/);
  assert.match(editor, /min-h-10/);
  assert.match(editor, /dark:bg-neutral-800 dark:text-white/);
  assert.doesNotMatch(editor, /onMouse(?:Enter|Over)/);
});

test("Step 7 migration keeps legacy values and adds bounded strict validators without grants", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/20260728140000_template_copilot_v2_structured_editors.sql", import.meta.url), "utf8");
  await Promise.all([parse(sql), parsePlPgSQL(sql)]);
  assert.match(sql, /rename to template_copilot_v2_step5_fact_value_valid/);
  assert.match(sql, /template_copilot_v2_step7_attachment_value_valid/);
  assert.match(sql, /template_copilot_v2_step7_condition_value_valid/);
  assert.match(sql, /template_copilot_v2_step7_notification_value_valid/);
  assert.match(sql, /template_copilot_v2_step5_fact_value_valid\(p_fact_id,p_value\)/);
  assert.match(sql, /integer_between\(item->'maximumFileSizeMb',1,25\)/);
  assert.match(sql, /revoke all on function private\.template_copilot_v2_step7_attachment_value_valid/);
  assert.match(sql, /count\(\*\) <= 2000/);
  assert.match(sql, /octet_length\(p_value::text\) <= 2000000/);
  assert.doesNotMatch(sql, /count\(\*\)\s*<=\s*200\b/u);
  assert.match(sql, /not between 1 and 50/);
  assert.match(sql, /not between 1 and 100/);
  assert.doesNotMatch(sql, /jsonb_array_elements_text/u);
  assert.ok(sql.indexOf("jsonb_typeof(p_value) is distinct from 'array'") < sql.indexOf("jsonb_array_length(p_value) not between 1 and 50"));
  assert.ok(sql.indexOf("jsonb_typeof(item) is distinct from 'object'") < sql.indexOf("template_copilot_v2_exact_object_keys("));
  assert.ok(sql.indexOf("jsonb_typeof(formats) is distinct from 'array'") < sql.indexOf("jsonb_array_length(formats) > 4"));
  assert.ok(sql.indexOf("integer_between(item->'maximumQuantity',1,20)") < sql.indexOf("(item->>'maximumQuantity')::integer"));
  assert.ok(sql.indexOf("jsonb_typeof(recipients) is distinct from 'array'") < sql.indexOf("jsonb_array_length(recipients) not between 1 and 5"));
  assert.ok(sql.indexOf("jsonb_typeof(timing) is distinct from 'object'") < sql.indexOf("template_copilot_v2_exact_object_keys(timing"));
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]+authenticated/iu);
  assert.doesNotMatch(sql, /grant\s+.+\s+to\s+anon/iu);
});

test("database envelope covers every schema-valid Step 7 maximum", () => {
  const attachments = Array.from({ length: 50 }, (_, index) => ({
    id: `attachment-${index + 1}`,
    label: `Document ${index + 1}`,
    kind: "attachment",
    required: true,
    formats: ["text", "pdf", "image", "excel_csv"],
    minimumQuantity: 1,
    maximumQuantity: 20,
    maximumFileSizeMb: 25,
    stage: "request_submission",
    contributorPolicy: "allow_invited_contributors",
    confirmationPolicy: "requester_confirms",
  }));
  const conditions = Array.from({ length: 50 }, (_, index) => ({
    id: `condition-${index + 1}`,
    sequence: index + 1,
    field: `Field ${index + 1}`,
    operator: ">=",
    value: index + 1,
    unit: "items",
    matchingRoute: "complete",
    otherwiseRoute: "return_for_correction",
  }));
  const notifications = Array.from({ length: 100 }, (_, index) => ({
    id: `notification-${index + 1}`,
    event: "request_submitted",
    recipients: [
      "requester",
      "current_stage_participants",
      "previous_stage_participants",
      "all_participants",
      "workflow_owner",
    ],
    timing: { mode: "immediate" },
    channel: "in_app_and_email",
    visibility: "all_participants",
    stage: "stage:Review",
  }));
  const maxima = [
    templateCopilotV2AttachmentRequirementsSchema.parse(attachments),
    templateCopilotV2ConditionRulesSchema.parse(conditions),
    templateCopilotV2NotificationRulesSchema.parse(notifications),
  ];
  for (const value of maxima) {
    const nodes = jsonNodeCount(value);
    assert.ok(nodes > 200, `fixture proves the inherited 200-node limit was insufficient (${nodes})`);
    assert.ok(nodes <= 2000, `schema-valid maximum fits the Step 7 database envelope (${nodes})`);
    assert.ok(Buffer.byteLength(JSON.stringify(value), "utf8") <= 2_000_000);
  }
});

test("configuration and operations documentation describe independent rollback", async () => {
  const [environment, documentation] = await Promise.all([
    readFile(new URL("../../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../../docs/template-authoring/phase-2-template-copilot.md", import.meta.url), "utf8"),
  ]);
  for (const name of [
    "TEMPLATE_COPILOT_V2_ATTACHMENT_EDITOR",
    "TEMPLATE_COPILOT_V2_CONDITION_EDITOR",
    "TEMPLATE_COPILOT_V2_NOTIFICATION_EDITOR",
  ]) {
    assert.match(environment, new RegExp(`${name}=false`));
    assert.match(documentation, new RegExp(name));
  }
  assert.match(documentation, /Rollback is flag-first/);
  assert.match(documentation, /never parsed back into a workflow/);
});
