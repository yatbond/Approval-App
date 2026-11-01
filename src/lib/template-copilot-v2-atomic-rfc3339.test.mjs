import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  templateCopilotV2AnsweredAtPattern,
  templateCopilotV2AnsweredAtSchema,
} from "./template-copilot-facts.ts";

const timestampMatrix = [
  { value: "2026-07-27T00:00:00Z", accepted: true, case: "Z midnight" },
  { value: "2026-07-27T23:59:59Z", accepted: true, case: "latest second" },
  { value: "2026-07-27T12:00:00.1Z", accepted: true, case: "one fractional digit" },
  { value: "2026-07-27T12:00:00.12Z", accepted: true, case: "two fractional digits" },
  { value: "2026-07-27T12:00:00.123Z", accepted: true, case: "three fractional digits" },
  { value: "2026-07-27T12:00:00.1234Z", accepted: true, case: "four fractional digits" },
  { value: "2026-07-27T12:00:00.12345Z", accepted: true, case: "five fractional digits" },
  { value: "2026-07-27T12:00:00.123456Z", accepted: true, case: "microseconds" },
  { value: "2026-07-27T12:00:00+08:00", accepted: true, case: "positive offset" },
  { value: "2026-07-27T12:00:00-05:30", accepted: true, case: "negative offset" },
  { value: "2026-07-27T12:00:00+23:59", accepted: true, case: "maximum positive offset" },
  { value: "2026-07-27T12:00:00-23:59", accepted: true, case: "maximum negative offset" },
  { value: "2024-02-29T12:00:00Z", accepted: true, case: "leap day" },
  { value: "2000-02-29T12:00:00Z", accepted: true, case: "400-year leap day" },
  { value: "0001-01-01T00:00:00Z", accepted: true, case: "minimum persisted year" },
  { value: "9999-12-31T23:59:59Z", accepted: true, case: "maximum persisted year" },
  { value: "0000-01-01T00:00:00Z", accepted: false, case: "PostgreSQL-incompatible year zero" },
  { value: "2026-07-27T24:00:00Z", accepted: false, case: "hour 24 normalization" },
  { value: "2026-07-27T23:60:00Z", accepted: false, case: "minute 60" },
  { value: "2026-07-27T23:59:60Z", accepted: false, case: "second 60" },
  { value: "2026-02-29T12:00:00Z", accepted: false, case: "non-leap February 29" },
  { value: "1900-02-29T12:00:00Z", accepted: false, case: "century non-leap day" },
  { value: "2026-04-31T12:00:00Z", accepted: false, case: "invalid month length" },
  { value: "2026-13-01T12:00:00Z", accepted: false, case: "month 13" },
  { value: "2026-01-00T12:00:00Z", accepted: false, case: "day zero" },
  { value: "2026-07-27T12:00:00+24:00", accepted: false, case: "offset hour 24" },
  { value: "2026-07-27T12:00:00-24:00", accepted: false, case: "negative offset hour 24" },
  { value: "2026-07-27T12:00:00+23:60", accepted: false, case: "offset minute 60" },
  { value: "2026-07-27T12:00:00", accepted: false, case: "missing timezone" },
  { value: "2026-07-27T12:00Z", accepted: false, case: "missing seconds" },
  { value: "2026-07-27T12:00:00.Z", accepted: false, case: "empty fraction" },
  { value: "2026-07-27T12:00:00.1234567Z", accepted: false, case: "overprecision" },
  { value: "2026-07-27t12:00:00z", accepted: false, case: "lowercase separators" },
  { value: "2026-07-27 12:00:00Z", accepted: false, case: "space separator" },
];

function migrationTimestampPattern(migration) {
  const match = migration.match(/decision_answered_at_text !~\s*'([^']+)'/);
  assert.ok(match, "migration must expose one lexical timestamp gate");
  return new RegExp(match[1]);
}

function assertSequentialTimestampGate(migration, label) {
  const typeGate = migration.indexOf("jsonb_typeof(decision->'answeredAt') is distinct from 'string'");
  const extraction = migration.indexOf("decision_answered_at_text := decision->>'answeredAt'");
  const lexicalGate = migration.indexOf("decision_answered_at_text !~");
  const conversionGate = migration.indexOf("if right(decision_answered_at_text, 1) = 'Z' then");
  const nativeCast = migration.indexOf("answered_at := decision_answered_at_text::timestamptz");
  assert.ok(typeGate >= 0, `${label} must type-gate answeredAt`);
  assert.ok(typeGate < extraction, `${label} must type-gate before text extraction`);
  assert.ok(extraction < lexicalGate, `${label} must extract before its bounded regex`);
  assert.ok(lexicalGate < conversionGate, `${label} must run the strict regex before conversion`);
  assert.ok(conversionGate < nativeCast, `${label} must retain a native guarded Z cast`);
  assert.match(
    migration.slice(conversionGate, conversionGate + 3_200),
    /if right\(decision_answered_at_text, 1\) = 'Z' then\s+answered_at := decision_answered_at_text::timestamptz;\s+else\s+[\s\S]+?left\(\s*decision_answered_at_text,\s*length\(decision_answered_at_text\) - 6\s*\)::timestamp at time zone 'UTC'\s*\)\s*-\s*make_interval\([\s\S]+?hours =>[\s\S]+?when substring\([\s\S]+?from length\(decision_answered_at_text\) - 5\s+for 1[\s\S]+?= '\+' then 1\s+else -1[\s\S]+?from length\(decision_answered_at_text\) - 4\s+for 2[\s\S]+?mins =>[\s\S]+?when substring\([\s\S]+?from length\(decision_answered_at_text\) - 5\s+for 1[\s\S]+?= '\+' then 1\s+else -1[\s\S]+?right\(decision_answered_at_text, 2\)::integer[\s\S]+?exception when others then[\s\S]+?return jsonb_build_object\('outcome', 'invalid_transition'\);\s+end;/,
    `${label} must convert any native calendar/cast failure into invalid_transition`,
  );
  assert.equal(
    migration.match(/decision_answered_at_text::timestamptz/g)?.length,
    1,
    `${label} must only cast the full timestamp in the guarded Z branch`,
  );
}

test("canonical TypeScript/Zod answeredAt contract covers strict RFC3339 edge cases", () => {
  for (const entry of timestampMatrix) {
    assert.equal(
      templateCopilotV2AnsweredAtSchema.safeParse(entry.value).success,
      entry.accepted,
      entry.case,
    );
  }
});

test("both locked SQL RPCs exactly match the canonical timestamp contract before guarded conversion", async () => {
  const migrations = [
    {
      label: "atomic",
      sql: await readFile(new URL("../../supabase/migrations/20260727190000_template_copilot_v2_atomic_decisions.sql", import.meta.url), "utf8"),
    },
    {
      label: "special",
      sql: await readFile(new URL("../../supabase/migrations/20260727210000_template_copilot_v2_special_decisions.sql", import.meta.url), "utf8"),
    },
  ];

  for (const migration of migrations) {
    const sqlPattern = migrationTimestampPattern(migration.sql);
    assert.equal(
      sqlPattern.source,
      templateCopilotV2AnsweredAtPattern.source,
      `${migration.label}: SQL lexical contract must exactly equal the canonical TypeScript pattern`,
    );
    for (const entry of timestampMatrix) {
      assert.equal(
        sqlPattern.test(entry.value),
        entry.accepted,
        `${migration.label}: ${entry.case}`,
      );
    }
    assertSequentialTimestampGate(migration.sql, migration.label);
  }
});
