import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";
import { templateCopilotV3LexicalAliases } from "./template-copilot-v3-evidence.ts";

const sql = await readFile(
  new URL(
    "../../supabase/migrations/20260730151355_template_copilot_v3_evidence_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const compactSql = sql.replace(/\s+/g, "");

function functionBody(schema, name) {
  const start = sql.indexOf(`create function ${schema}.${name}(`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("\n$$;", open);
  assert.ok(start >= 0 && open >= 0 && close > open, `${schema}.${name} body`);
  return sql.slice(open + 5, close);
}

function tableBody(name) {
  const start = sql.indexOf(`create table private.${name} (`);
  const close = sql.indexOf("\n);", start);
  assert.ok(start >= 0 && close > start, `private.${name} table`);
  return sql.slice(start, close);
}

const rpc = functionBody("public", "apply_template_copilot_v3_evidence_fragments");
const audit = functionBody("private", "audit_template_copilot_v3_evidence_attempt");
const reject = functionBody("private", "template_copilot_v3_reject_append");
const normalizeTrimCollapse = functionBody(
  "private",
  "template_copilot_v3_normalize_trim_collapse_text",
);
const normalizeLexical = functionBody(
  "private",
  "template_copilot_v3_normalize_lexical_text",
);
const dynamicStage = functionBody(
  "private",
  "template_copilot_v3_dynamic_stage_reference_is_canonical",
);
const enumLeafAllowed = functionBody(
  "private",
  "template_copilot_v3_enum_leaf_is_allowed",
);
const enumAliasMatches = functionBody(
  "private",
  "template_copilot_v3_enum_alias_matches",
);
const ordinalAliasMatches = functionBody(
  "private",
  "template_copilot_v3_ordinal_alias_matches",
);
const derivesLeaf = functionBody(
  "private",
  "template_copilot_v3_direct_evidence_derives_leaf",
);
const nodeCount = functionBody(
  "private",
  "template_copilot_v3_json_node_count",
);
const numberIsCanonical = functionBody(
  "private",
  "template_copilot_v3_number_is_canonical",
);
const boundedJson = functionBody(
  "private",
  "template_copilot_v3_json_value_is_bounded",
);

test("the final foundation parses as 43 PostgreSQL statements and 23 PL/pgSQL functions", async () => {
  const [ast, plpgsql] = await Promise.all([parse(sql), parsePlPgSQL(sql)]);
  assert.equal(ast.stmts.length, 43);
  assert.equal(plpgsql.plpgsql_funcs.length, 23);
});

test("there is one final nine-argument RPC and no obsolete eight-argument contract", () => {
  assert.equal(
    (
      sql.match(
        /create function public\.apply_template_copilot_v3_evidence_fragments\(/g,
      ) ?? []
    ).length,
    1,
  );
  assert.match(
    compactSql,
    /createfunctionpublic\.apply_template_copilot_v3_evidence_fragments\(p_actor_iduuid,p_session_iduuid,p_expected_revisionbigint,p_idempotency_keytext,p_command_hashtext,p_source_spansjsonb,p_known_span_idsjsonb,p_fragmentsjsonb,p_evidence_hashtext\)returnsjsonb/,
  );
  const oldSignature =
    "public.apply_template_copilot_v3_evidence_fragments(uuid,uuid,bigint,text,text,jsonb,jsonb,text)";
  assert.equal(compactSql.includes(oldSignature), false);
  assert.doesNotMatch(
    compactSql,
    /dropfunction(?:ifexists)?public\.apply_template_copilot_v3_evidence_fragments/,
  );
  assert.match(
    compactSql,
    /revokeallonfunctionpublic\.apply_template_copilot_v3_evidence_fragments\(uuid,uuid,bigint,text,text,jsonb,jsonb,jsonb,text\)frompublic,anon,authenticated;/,
  );
  assert.match(
    compactSql,
    /grantexecuteonfunctionpublic\.apply_template_copilot_v3_evidence_fragments\(uuid,uuid,bigint,text,text,jsonb,jsonb,jsonb,text\)toservice_role;/,
  );
});

test("historical audit operations remain accepted beside evidence_fragment_append", () => {
  const start = sql.indexOf(
    "add constraint template_copilot_v2_audit_events_operation_check",
  );
  const end = sql.indexOf("));", start);
  assert.ok(start >= 0 && end > start);
  const constraint = sql.slice(start, end);
  for (const operation of [
    "create_session",
    "record_candidate",
    "human_commit",
    "human_replace",
    "mark_unknown",
    "mark_not_applicable",
    "resolve_conflict",
    "legacy_upgrade",
    "atomic_answer",
    "special_decision",
    "candidate_extraction",
    "candidate_confirmation",
    "resolve_extraction_conflict",
    "mode_switch",
    "evidence_fragment_append",
  ]) {
    assert.ok(constraint.includes(`'${operation}'`), operation);
  }
});

test("evidence sidecars are private forced-RLS append-only tables", () => {
  for (const table of [
    "template_copilot_v3_source_spans",
    "template_copilot_v3_fragments",
  ]) {
    assert.match(sql, new RegExp(`alter table private\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table private\\.${table} force row level security`));
    assert.match(
      sql,
      new RegExp(
        `before update or delete on private\\.${table}[\\s\\S]*template_copilot_v3_reject_evidence_mutation\\(\\)`,
      ),
    );
  }
  assert.match(
    sql,
    /revoke all on table[\s\S]*private\.template_copilot_v3_source_spans,[\s\S]*private\.template_copilot_v3_fragments[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|insert|update|delete|all)[\s\S]*template_copilot_v3_(?:source_spans|fragments)[\s\S]*to\s+(?:public|anon|authenticated|service_role)/i,
  );
  assert.match(
    tableBody("template_copilot_v3_fragments"),
    /fact_id text not null check \(fact_id in \([\s\S]*'request\.fields'[\s\S]*'attachments\.requirements'[\s\S]*'workflow\.stages'[\s\S]*'workflow\.conditions'[\s\S]*'notifications\.rules'/,
  );
  assert.match(tableBody("template_copilot_v3_fragments"), /fragment_kind = 'array_item'/);
  assert.match(tableBody("template_copilot_v3_fragments"), /state = 'open'/);
});

test("session ownership and row locking precede all caller-controlled processing", () => {
  const lock = rpc.indexOf("perform pg_advisory_xact_lock");
  const session = rpc.indexOf("from public.template_copilot_sessions");
  const ownerGuard = rpc.indexOf("if not found then");
  const payload = rpc.indexOf("jsonb_typeof(p_source_spans)");
  const receipt = rpc.indexOf("from public.template_copilot_v2_operation_receipts");
  const transcript = rpc.indexOf("from public.template_copilot_messages");
  const auditCall = rpc.indexOf(
    "perform private.audit_template_copilot_v3_evidence_attempt",
  );
  assert.ok(
    lock >= 0 &&
      lock < session &&
      session < ownerGuard &&
      ownerGuard < payload &&
      ownerGuard < receipt &&
      ownerGuard < transcript &&
      ownerGuard < auditCall,
  );
  assert.match(
    rpc,
    /where id=p_session_id and owner_id=p_actor_id for update/,
  );
  assert.match(rpc, /return jsonb_build_object\('outcome','not_found'\)/);
});

test("type and count gates bound traversal before stable UTF-8 and replay", () => {
  const sourceType = rpc.indexOf(
    "jsonb_typeof(p_source_spans) is distinct from 'array'",
  );
  const knownType = rpc.indexOf(
    "jsonb_typeof(p_known_span_ids) is distinct from 'array'",
  );
  const fragmentType = rpc.indexOf(
    "jsonb_typeof(p_fragments) is distinct from 'array'",
  );
  const byteLimit = rpc.indexOf(
    "private.template_copilot_v3_stable_json(p_source_spans)",
  );
  const counts = rpc.indexOf("span_count:=jsonb_array_length(p_source_spans)");
  const countLimits = rpc.indexOf(
    "span_count>500 or known_count>2000 or fragment_count not between 1 and 200",
  );
  const sourceTraversal = rpc.indexOf(
    "template_copilot_v3_json_node_count(x.value,0,2,16)",
  );
  const knownTraversal = rpc.indexOf(
    "template_copilot_v3_json_node_count(x.value,0,0,1)",
  );
  const fragmentTraversal = rpc.indexOf(
    "template_copilot_v3_json_node_count(x.value,0,17,10000)",
  );
  const rawSafety = rpc.indexOf("pg_column_size(p_source_spans)::bigint");
  const receipt = rpc.indexOf(
    "from public.template_copilot_v2_operation_receipts",
  );
  assert.ok(
    sourceType >= 0 &&
      knownType >= 0 &&
      fragmentType >= 0 &&
      sourceType < counts &&
      knownType < counts &&
      fragmentType < counts &&
      counts < countLimits &&
      countLimits < sourceTraversal &&
      countLimits < knownTraversal &&
      countLimits < fragmentTraversal &&
      sourceTraversal < rawSafety &&
      knownTraversal < rawSafety &&
      fragmentTraversal < rawSafety &&
      rawSafety < byteLimit &&
      byteLimit < receipt,
  );
  assert.match(
    rpc,
    /octet_length\(convert_to\(private\.template_copilot_v3_stable_json\(p_source_spans\),'UTF8'\)\)[\s\S]*template_copilot_v3_stable_json\(p_known_span_ids\)[\s\S]*template_copilot_v3_stable_json\(p_fragments\)[\s\S]*>3145728/,
  );
  assert.match(
    rpc,
    /pg_column_size\(p_source_spans\)::bigint[\s\S]*pg_column_size\(p_known_span_ids\)::bigint[\s\S]*pg_column_size\(p_fragments\)::bigint>16777216/,
  );
  assert.doesNotMatch(
    rpc.slice(counts, receipt),
    /template_copilot_v3_json_value_is_bounded\(x\.value,0\)/,
  );
  assert.match(
    rpc,
    /span_count>500 or known_count>2000 or fragment_count not between 1 and 200/,
  );

  const spanLoop = rpc.indexOf(
    "for span in select value from jsonb_array_elements(p_source_spans) loop",
  );
  const spanObject = rpc.indexOf(
    "if jsonb_typeof(span) is distinct from 'object' then",
    spanLoop,
  );
  const spanKeys = rpc.indexOf("not(span?&array", spanLoop);
  assert.ok(spanLoop < spanObject && spanObject < spanKeys);
  const coordinateTypes = rpc.indexOf(
    "jsonb_typeof(span->'startCodePoint') is distinct from 'number'",
  );
  const coordinateLexical = rpc.indexOf(
    "span->>'startCodePoint' !~ '^[0-9]{1,5}$'",
  );
  const coordinateCast = rpc.indexOf(
    "start_code_point:=(span->>'startCodePoint')::integer",
  );
  assert.ok(
    coordinateTypes < coordinateLexical && coordinateLexical < coordinateCast,
  );

  const fragmentLoop = rpc.indexOf(
    "for fragment in select value from jsonb_array_elements(p_fragments) loop",
  );
  const fragmentObject = rpc.indexOf(
    "if jsonb_typeof(fragment) is distinct from 'object' then",
    fragmentLoop,
  );
  const fragmentArrays = rpc.indexOf(
    "jsonb_typeof(fragment->'bindings') is distinct from 'array'",
    fragmentObject,
  );
  const fragmentLengths = rpc.indexOf(
    "jsonb_array_length(fragment->'bindings')",
    fragmentArrays,
  );
  assert.ok(
    fragmentLoop < fragmentObject &&
      fragmentObject < fragmentArrays &&
      fragmentArrays < fragmentLengths,
  );
});

test("source spans preserve exact Unicode coordinates and canonical identities", () => {
  const sourceTable = tableBody("template_copilot_v3_source_spans");
  assert.match(sourceTable, /start_code_point between 0 and 79999/);
  assert.match(sourceTable, /end_code_point between 1 and 80000/);
  assert.match(sourceTable, /char_length\(exact_text\) between 1 and 8000/);
  assert.match(
    sourceTable,
    /char_length\(exact_text\) = end_code_point - start_code_point/,
  );
  assert.match(
    sql,
    /template_copilot_v3_source_spans_unicode_text_check[\s\S]*template_copilot_v3_text_has_non_whitespace\(exact_text\)/,
  );
  assert.doesNotMatch(sql, /\[\[:space:\]\]/);
  assert.match(
    rpc,
    /message\.session_id=p_session_id and message\.owner_id=p_actor_id and message\.client_message_id=span->>'messageId' and message\.role='user'/,
  );
  assert.match(
    rpc,
    /substring\(source_text from start_code_point\+1 for end_code_point-start_code_point\) is distinct from span->>'exactText'/,
  );
  for (const component of ["messageId", "exactText"]) {
    const extraction = `(span->>'${component}')`;
    assert.ok(
      rpc.includes(`octet_length(convert_to(${extraction},'UTF8'))::text`),
      component,
    );
    assert.ok(rpc.includes(`||':'||${extraction}`), component);
  }
  for (const component of ["start_code_point::text", "end_code_point::text"]) {
    assert.ok(
      rpc.includes(`octet_length(convert_to(${component},'UTF8'))::text`),
      component,
    );
  }
  assert.doesNotMatch(rpc, /\|\|span->>/);
  assert.match(
    rpc,
    /canonical_span_id:=encode\(sha256\(convert_to\(canonical_span_material,'UTF8'\)\),'hex'\)/,
  );
});

test("known spans are owned, disjoint, referenced, and all supplied spans are consumed", () => {
  assert.match(
    rpc,
    /jsonb_array_elements_text\(p_known_span_ids\) k\(value\)[\s\S]*x\.session_id=p_session_id and x\.owner_id=p_actor_id and x\.span_id=k\.value/,
  );
  assert.match(
    rpc,
    /jsonb_array_elements\(p_source_spans\)x\(value\) join jsonb_array_elements_text\(p_known_span_ids\)k\(value\) on k\.value=x\.value->>'spanId'/,
  );
  assert.match(
    rpc,
    /not exists\(select 1 from jsonb_array_elements\(p_source_spans\)x\(value\) where x\.value->>'spanId'=span_reference\)[\s\S]*not exists\(select 1 from jsonb_array_elements_text\(p_known_span_ids\)k\(value\) where k\.value=span_reference\)/,
  );
  assert.match(
    rpc,
    /union all select value from jsonb_array_elements_text\(p_known_span_ids\)\) supplied where not exists/,
  );
  assert.match(rpc, /p_evidence_hash,'unused_span'/);
});

test("crossing overlaps are rejected while containment remains legitimate", () => {
  assert.match(
    rpc,
    /Containment is legitimate quotation reuse; only a < b < A < B crossing is rejected/,
  );
  assert.match(
    rpc,
    /startCodePoint'\)::int<\(b\.value->>'startCodePoint'\)::int and \(b\.value->>'startCodePoint'\)::int<\(a\.value->>'endCodePoint'\)::int and \(a\.value->>'endCodePoint'\)::int<\(b\.value->>'endCodePoint'\)::int/,
  );
  assert.match(
    rpc,
    /join private\.template_copilot_v3_source_spans b on b\.session_id=p_session_id and b\.message_id=a\.value->>'messageId'/,
  );
  assert.match(rpc, /p_evidence_hash,'overlap'/);
});

test("fragment leaves, paths, missing markers, and fact matrices are closed", () => {
  for (const helper of [
    "template_copilot_v3_primitive_leaves",
    "template_copilot_v3_required_fragment_paths",
    "template_copilot_v3_missing_path_is_allowed",
    "template_copilot_v3_binding_rule_is_compatible",
    "template_copilot_v3_fragment_leaf_is_canonical",
    "template_copilot_v3_pointer_contains",
  ]) {
    assert.match(sql, new RegExp(`create function private\\.${helper}\\(`));
  }
  assert.match(
    sql,
    /jsonb_array_length\(p_value\) = 0[\s\S]*p_value = '\{\}'::jsonb/,
  );
  for (const fact of [
    "request.fields",
    "attachments.requirements",
    "workflow.stages",
    "workflow.conditions",
    "notifications.rules",
  ]) {
    assert.ok(
      functionBody("private", "template_copilot_v3_required_fragment_paths").includes(
        `'${fact}'`,
      ),
      fact,
    );
  }
  assert.match(
    rpc,
    /jsonb_array_length\(fragment->'missingPaths'\) not between 1 and 200/,
  );
  assert.match(rpc, /char_length\(binding->>'path'\)>256/);
  assert.match(
    rpc,
    /group by b\.value->>'path' having count\(\*\)<>1/,
  );
  assert.match(
    rpc,
    /select path from private\.template_copilot_v3_primitive_leaves[\s\S]*except select value->>'path'/,
  );
  assert.match(
    rpc,
    /required_path in \('\/participant\/value','\/timing\/offsetHours','\/stage'\) and m\.value=required_path/,
  );
  assert.doesNotMatch(rpc, /like\s+[^\n]*\|\|'\/%'/);
});

test("required fragment metadata rejects JSON null before canonicalization", () => {
  for (const field of [
    "compilerVersion",
    "fragmentId",
    "factId",
    "fragmentKind",
    "state",
    "confidence",
    "ambiguity",
  ]) {
    assert.ok(
      rpc.includes(
        `jsonb_typeof(fragment->'${field}') is distinct from 'string'`,
      ),
      `${field} string guard`,
    );
  }
  assert.ok(
    rpc.includes("fragment->'evidenceVersion' is distinct from '3'::jsonb"),
  );
  assert.ok(
    rpc.includes(
      "fragment->>'compilerVersion' is distinct from 'template-copilot-v3.0'",
    ),
  );
  assert.ok(
    rpc.includes("fragment->>'fragmentKind' is distinct from 'array_item'"),
  );
  assert.ok(rpc.includes("fragment->>'state' is distinct from 'open'"));
  assert.doesNotMatch(
    rpc,
    /fragment->>'(?:compilerVersion|fragmentKind|state)'<>/,
  );
  assert.ok(
    rpc.indexOf("jsonb_typeof(fragment->'compilerVersion')") <
      rpc.indexOf("canonical_fragment:=jsonb_build_object"),
  );
});

test("attachment, routing, participant, condition, and notification guards are enforced", () => {
  assert.match(
    rpc,
    /jsonb_array_elements_text\(fragment->'value'->'formats'\)[\s\S]*group by f\.value having count\(\*\)<>1/,
  );
  assert.match(
    rpc,
    /kind'='attachment'[\s\S]*jsonb_array_length\(fragment->'value'->'formats'\)=0/,
  );
  assert.match(
    rpc,
    /kind'='form'[\s\S]*maximumFileSizeMb[\s\S]*\["\/maximumFileSizeMb"\]/,
  );
  assert.match(
    rpc,
    /stage'='request_submission'[\s\S]*confirmationPolicy'='stage_owner_confirms'/,
  );
  assert.match(
    rpc,
    /participant'->>'mode' in \('requester','unassigned_at_template'\)[^\n]*\(fragment->'value'->'participant'\?'value' or fragment->'missingPaths' @> '\["\/participant\/value"\]'::jsonb\)/,
  );
  assert.match(rpc, /participant'->>'mode'='fixed_email'/);
  assert.match(
    sql,
    /char_length\(t\)<=90 and t ~ '\^condition:\[a-z\]\[a-z0-9_-\]\+\$'/,
  );
  assert.match(
    rpc,
    /matchingRoute','otherwiseRoute'[\s\S]*matchingRoute'=fragment->'value'->>'otherwiseRoute'/,
  );
  assert.match(
    rpc,
    /operator' in \('>','>=','<','<='\)[\s\S]*jsonb_typeof\(fragment->'value'->'value'\)<>'number'/,
  );
  assert.match(
    rpc,
    /event'='due_soon'[\s\S]*mode'<>'before_due'[\s\S]*event'='overdue'[\s\S]*mode'<>'after_due'/,
  );
});

test("fragment edges use ECMAScript whitespace while source non-whitespace is Unicode-aware", () => {
  const canonicalEdges = functionBody(
    "private",
    "template_copilot_v3_fragment_text_has_canonical_edges",
  );
  const sourceText = functionBody(
    "private",
    "template_copilot_v3_text_has_non_whitespace",
  );
  assert.match(canonicalEdges, /\\FEFF/);
  assert.doesNotMatch(canonicalEdges, /\\0085/);
  assert.match(sourceText, /\\0085/);
  assert.doesNotMatch(sourceText, /\\FEFF/);
  assert.doesNotMatch(
    functionBody("private", "template_copilot_v3_fragment_leaf_is_canonical"),
    /\bbtrim\s*\(/,
  );
});

test("bounded JSON proves depth and nodes before exact fragment-value bytes", () => {
  assert.match(
    compactSql,
    /createfunctionprivate\.template_copilot_v3_json_node_count\(p_valuejsonb,p_depthinteger,p_max_depthinteger,p_remaininginteger\)returnsinteger/,
  );
  assert.match(
    nodeCount,
    /p_max_depth < 0[\s\S]*p_max_depth > 32[\s\S]*p_depth > p_max_depth/,
  );
  assert.ok(
    (
      nodeCount.match(
        /template_copilot_v3_json_node_count\([\s\S]*?p_max_depth,[\s\S]*?p_remaining - node_count/g,
      ) ?? []
    ).length >= 2,
  );

  const depthGuard = boundedJson.indexOf("or p_depth > 16 then");
  const nodeLimit = boundedJson.indexOf(
    "private.template_copilot_v3_json_node_count(",
  );
  const stableLimit = boundedJson.indexOf(
    "private.template_copilot_v3_stable_json(p_value)",
  );
  const typeRecursion = boundedJson.indexOf("value_type := jsonb_typeof(p_value)");
  assert.ok(
    depthGuard >= 0 &&
      depthGuard < nodeLimit &&
      nodeLimit < stableLimit &&
      stableLimit < typeRecursion,
  );
  assert.match(
    boundedJson,
    /template_copilot_v3_json_node_count\([\s\S]*p_value,[\s\S]*0,[\s\S]*16,[\s\S]*2000[\s\S]*> 2000/,
  );
  assert.match(
    boundedJson,
    /octet_length\(convert_to\([\s\S]*template_copilot_v3_stable_json\(p_value\)[\s\S]*'UTF8'[\s\S]*\)\) > 262144/,
  );
  assert.doesNotMatch(boundedJson, /pg_column_size/);
  assert.match(
    compactSql,
    /revokeallonfunction[\s\S]*private\.template_copilot_v3_json_node_count\(jsonb,integer,integer,integer\),private\.template_copilot_v3_number_is_canonical\(jsonb\)[\s\S]*frompublic,anon,authenticated,service_role;/,
  );
});

test("canonical numbers use the exact shared 15-significant-digit domain", () => {
  assert.match(numberIsCanonical, /jsonb_typeof\(p_value\) <> 'number'/);
  assert.ok(
    numberIsCanonical.includes(
      "canonical !~ '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]*[1-9])?$'",
    ),
  );
  assert.match(
    numberIsCanonical,
    /magnitude <> 0[\s\S]*magnitude < 0\.000001[\s\S]*magnitude >= 1000000000000000000000/,
  );
  assert.match(
    numberIsCanonical,
    /regexp_replace\(canonical, '\^-'[\s\S]*replace\(significant_digits, '\.', ''\)[\s\S]*regexp_replace\(significant_digits, '\^0\+'[\s\S]*regexp_replace\(significant_digits, '0\+\$'/,
  );
  assert.match(numberIsCanonical, /char_length\(significant_digits\) <= 15/);
  assert.doesNotMatch(numberIsCanonical, /double precision|::float|::real/);
  assert.match(
    boundedJson,
    /value_type = 'number'[\s\S]*template_copilot_v3_number_is_canonical\(p_value\)/,
  );
  assert.match(
    derivesLeaf,
    /p_rule='numeric_lexical'[\s\S]*template_copilot_v3_number_is_canonical\(p_leaf_value\)/,
  );

  const significantDigits = (value) =>
    value
      .replace(/^-/, "")
      .replace(".", "")
      .replace(/^0+/, "")
      .replace(/0+$/, "");
  for (const value of [
    "0",
    "0.000001",
    "-0.000001",
    "100000000000000000000",
    "999999999999999000000",
  ]) {
    assert.ok(significantDigits(value).length <= 15, value);
  }
  for (const value of [
    "9007199254740993",
    "78123677071134.76",
    "0.10000000000000001",
    "999999999999999900000",
  ]) {
    assert.ok(significantDigits(value).length > 15, value);
  }
});

test("the direct-evidence evaluator freezes normalization and every lexical rule", () => {
  assert.match(normalizeTrimCollapse, /normalize\(p_value,NFKC\)/);
  assert.match(normalizeTrimCollapse, /\\FEFF/);
  assert.doesNotMatch(normalizeTrimCollapse, /\\0085/);
  assert.match(
    normalizeLexical,
    /template_copilot_v3_normalize_trim_collapse_text\(p_value\)/,
  );
  assert.match(
    normalizeLexical,
    /translate\([\s\S]*'ABCDEFGHIJKLMNOPQRSTUVWXYZ',[\s\S]*'abcdefghijklmnopqrstuvwxyz'/,
  );
  assert.match(
    derivesLeaf,
    /p_rule='exact'[\s\S]*p_source_text=leaf_text/,
  );
  assert.match(
    derivesLeaf,
    /p_rule='nfkc_trim_collapse'[\s\S]*template_copilot_v3_normalize_trim_collapse_text\(p_source_text\)=leaf_text/,
  );
  assert.match(derivesLeaf, /"approval":\["approve","審批","审批","核准","批准"\]/);
  assert.match(
    derivesLeaf,
    /"form":\["in-app form","in app form","complete a form in the app"/,
  );
  assert.match(
    derivesLeaf,
    /"in_app_and_email":\["in the app and by email","in the app and email"/,
  );
  assert.match(
    derivesLeaf,
    /left\(leaf_text,6\)='stage:' or left\(leaf_text,10\)='condition:'/,
  );
  assert.match(derivesLeaf, /aliases->'boolean'/);
  assert.match(
    derivesLeaf,
    /p_fact_id='workflow\.stages' and p_path='\/sequence' then 100[\s\S]*p_fact_id='workflow\.conditions' and p_path='\/sequence' then 50/,
  );
  assert.match(derivesLeaf, /template_copilot_v3_ordinal_alias_matches\(leaf_text::integer,wording\)/);
  assert.match(derivesLeaf, /\(\?:,\[0-9\]\{3\}\)\+/);
  assert.match(derivesLeaf, /canonical_decimal:=replace\(wording,',',''\)/);
  assert.match(derivesLeaf, /regexp_replace\(split_part\(canonical_decimal,'\.',2\),'0\+\$',''\)/);
  assert.match(derivesLeaf, /if canonical_decimal='0' then negative:=false/);
  assert.match(derivesLeaf, /return canonical_decimal=leaf_text/);
  assert.doesNotMatch(derivesLeaf, /double precision/);
  assert.match(derivesLeaf, /aliases->'emptyCollection'/);
  assert.match(derivesLeaf, /p_leaf_value not in \('\[\]'::jsonb,'\{\}'::jsonb\)/);
  assert.match(
    compactSql,
    /revokeallonfunctionprivate\.template_copilot_v3_dynamic_stage_reference_is_canonical\(text\),private\.template_copilot_v3_enum_leaf_is_allowed\(text,text,text\),private\.template_copilot_v3_enum_alias_matches\(text,text,text,text,jsonb\),private\.template_copilot_v3_ordinal_alias_matches\(integer,text\),private\.template_copilot_v3_normalize_trim_collapse_text\(text\),private\.template_copilot_v3_normalize_lexical_text\(text\),private\.template_copilot_v3_direct_evidence_derives_leaf\(text,text,text,jsonb,text\)/,
  );
});

test("every bound span must independently derive the exact leaf it supports", () => {
  const spanLoop = rpc.indexOf(
    "for span_reference in select value from jsonb_array_elements_text(binding->'spanIds') loop",
  );
  const loopEnd = rpc.indexOf("end loop;", spanLoop);
  const incomingText = rpc.indexOf(
    "(select x.value->>'exactText' from jsonb_array_elements(p_source_spans)",
    spanLoop,
  );
  const storedText = rpc.indexOf(
    "(select stored.exact_text from private.template_copilot_v3_source_spans",
    spanLoop,
  );
  const evaluator = rpc.indexOf(
    "private.template_copilot_v3_direct_evidence_derives_leaf(",
    spanLoop,
  );
  assert.ok(
    spanLoop >= 0 &&
      incomingText > spanLoop &&
      storedText > incomingText &&
      evaluator > storedText &&
      evaluator < loopEnd,
  );
  assert.match(
    rpc.slice(spanLoop, loopEnd),
    /fragment->>'factId',binding->>'path',binding->>'rule',leaf\.leaf_value,binding_source_text/,
  );
  assert.match(
    rpc.slice(spanLoop, loopEnd),
    /p_evidence_hash,'binding'/,
  );
});

test("evidence hashes are domain-separated and deterministically C-sorted", () => {
  assert.match(
    rpc,
    /'v3frag\|new:'[\s\S]*'\|known:'[\s\S]*'\|fragments:'/,
  );
  assert.match(
    rpc,
    /string_agg\(x\.value->>'spanId',',' order by x\.value->>'spanId' collate "C"\)/,
  );
  assert.match(
    rpc,
    /string_agg\(k\.value,',' order by k\.value collate "C"\)/,
  );
  assert.match(
    rpc,
    /string_agg\(f\.value->>'fragmentId',',' order by f\.value->>'fragmentId' collate "C"\)/,
  );
  assert.match(
    rpc,
    /computed_evidence_hash:=encode\(sha256\(convert_to\(/,
  );
  assert.match(rpc, /p_evidence_hash,'evidence_hash'/);
});

test("owned terminal rejections preserve bounded audit reasons and replay receipt evidence", () => {
  for (const reason of [
    "shape",
    "state",
    "source_span",
    "overlap",
    "fragment",
    "binding",
    "unused_span",
    "evidence_hash",
  ]) {
    assert.ok(rpc.includes(`p_evidence_hash,'${reason}'`), reason);
    assert.ok(audit.includes(`'${reason}'`), `audit ${reason}`);
  }
  assert.doesNotMatch(
    rpc,
    /return jsonb_build_object\('outcome','(?:invalid_command|invalid_transition|stale_revision)'/,
  );
  assert.equal(
    (reject.match(/audit_template_copilot_v3_evidence_attempt/g) ?? []).length,
    1,
  );
  assert.match(
    rpc,
    /'replayed_exact'[\s\S]*receipt\.response->>'newSourceSpanCount'[\s\S]*receipt\.response->>'knownSourceSpanCount'[\s\S]*receipt\.response->>'fragmentDeltaCount'[\s\S]*receipt\.response->>'evidenceHash'/,
  );
});

test("successful application appends sidecars and advances only the session revision", () => {
  assert.match(rpc, /insert into private\.template_copilot_v3_source_spans\(/);
  assert.match(
    rpc,
    /insert into private\.template_copilot_v3_fragments\(session_id,owner_id,fragment_id,evidence_version,compiler_version,[\s\S]*values\(p_session_id,p_actor_id,fragment->>'fragmentId',3,'template-copilot-v3\.0'/,
  );
  assert.doesNotMatch(rpc, /update private\.template_copilot_v3_/);
  assert.doesNotMatch(rpc, /delete from private\.template_copilot_v3_/);
  assert.doesNotMatch(rpc, /set\s+(?:ledger|facts|status|model)\s*=/i);
  assert.match(
    rpc,
    /update public\.template_copilot_sessions set revision=revision\+1,updated_at=clock_timestamp\(\) where id=p_session_id and owner_id=p_actor_id and revision=before_revision/,
  );
  assert.match(rpc, /message='template_copilot_v3_revision_lost'/);
});

test("receipts stay lean and audit details retain integrity metadata without evidence payloads", () => {
  assert.doesNotMatch(
    audit,
    /p_source_spans|p_fragments|exact_text|bindings|missing_paths|'value'/,
  );
  assert.match(audit, /'evidenceVersion', 3/);
  assert.match(audit, /'compilerVersion', 'template-copilot-v3\.0'/);
  assert.match(audit, /'spanCount'/);
  assert.match(audit, /'fragmentCount'/);
  assert.match(audit, /'evidenceHash'/);
  assert.match(audit, /'reason', safe_reason/);

  const responseStart = rpc.indexOf("response:=jsonb_build_object(");
  const receiptInsert = rpc.indexOf(
    "insert into public.template_copilot_v2_operation_receipts",
  );
  assert.ok(responseStart >= 0 && receiptInsert > responseStart);
  const response = rpc.slice(responseStart, receiptInsert);
  assert.doesNotMatch(response, /exactText|bindings|missingPaths|'value'/);
  assert.match(response, /'newSourceSpanCount'/);
  assert.match(response, /'knownSourceSpanCount'/);
  assert.match(response, /'fragmentDeltaCount'/);
  assert.match(response, /'evidenceHash'/);
});
test("confidence and ambiguity metadata are durable hash inputs with closed note semantics", () => {
  assert.match(
    rpc,
    /canonical_fragment:=jsonb_build_object\([\s\S]*'confidence',fragment->'confidence'[\s\S]*'ambiguity',fragment->'ambiguity'[\s\S]*'ambiguityNote',coalesce\(fragment->'ambiguityNote','null'::jsonb\)/,
  );
  assert.match(
    rpc,
    /fragment->>'ambiguity'='none' and fragment\?'ambiguityNote'/,
  );
  assert.match(
    rpc,
    /fragment->>'ambiguity' in \('possible','ambiguous'\) and not\(fragment\?'ambiguityNote'\)/,
  );
  assert.match(
    rpc,
    /template_copilot_v3_text_has_non_whitespace\(fragment->>'ambiguityNote'\)[\s\S]*template_copilot_v3_fragment_text_has_canonical_edges\(fragment->>'ambiguityNote'\)/,
  );
  assert.match(
    tableBody("template_copilot_v3_fragments"),
    /ambiguity_note text[\s\S]*constraint template_copilot_v3_fragments_ambiguity_note_length_check[\s\S]*char_length\(ambiguity_note\) <= 500/,
  );
  assert.equal(
    (
      compactSql.match(
        /constrainttemplate_copilot_v3_fragments_ambiguity_note_check/g,
      ) ?? []
    ).length,
    1,
    "the semantic constraint name must not collide with the inline length check",
  );
  assert.match(
    sql,
    /template_copilot_v3_fragments_ambiguity_note_check[\s\S]*ambiguity='none' and ambiguity_note is null[\s\S]*ambiguity in \('possible','ambiguous'\)[\s\S]*ambiguity_note is not null[\s\S]*template_copilot_v3_text_has_non_whitespace\(ambiguity_note\)[\s\S]*template_copilot_v3_fragment_text_has_canonical_edges\(ambiguity_note\)/,
  );
  assert.match(
    rpc,
    /'\|fragments:'[\s\S]*string_agg\(f\.value->>'fragmentId',',' order by f\.value->>'fragmentId' collate "C"\)/,
  );
});

test("dynamic stage references are case-preserving canonical NFKC tokens everywhere", () => {
  assert.match(dynamicStage, /left\(p_value,6\)<>'stage:'/);
  assert.match(dynamicStage, /char_length\(suffix\) between 1 and 200/);
  assert.match(
    dynamicStage,
    /template_copilot_v3_text_has_non_whitespace\(suffix\)/,
  );
  assert.match(
    dynamicStage,
    /template_copilot_v3_fragment_text_has_canonical_edges\(suffix\)/,
  );
  assert.match(
    dynamicStage,
    /template_copilot_v3_normalize_trim_collapse_text\(suffix\)=suffix/,
  );
  assert.ok(
    (
      functionBody(
        "private",
        "template_copilot_v3_fragment_leaf_is_canonical",
      ).match(/template_copilot_v3_dynamic_stage_reference_is_canonical\(t\)/g) ??
      []
    ).length >= 3,
  );
  assert.match(
    enumLeafAllowed,
    /template_copilot_v3_dynamic_stage_reference_is_canonical\(p_leaf_value\)/,
  );
  assert.match(
    derivesLeaf,
    /template_copilot_v3_enum_leaf_is_allowed\(p_fact_id,p_path,leaf_text\)[\s\S]*canonical:=template_copilot_v3_normalize_lexical_text|template_copilot_v3_enum_leaf_is_allowed\(p_fact_id,p_path,leaf_text\)[\s\S]*canonical:=private\.template_copilot_v3_normalize_lexical_text/,
  );
});

test("scope-keyed aliases isolate shared canonical tokens by exact fact and path", () => {
  const aliasMatch = derivesLeaf.match(
    /aliases jsonb := \$aliases\$(\{.*\})\$aliases\$::jsonb;/s,
  );
  assert.ok(aliasMatch);
  const aliases = JSON.parse(aliasMatch[1]);
  assert.deepEqual(
    aliases,
    templateCopilotV3LexicalAliases,
    "the pending PostgreSQL contract must exactly match the TypeScript alias source",
  );
  assert.equal(Object.hasOwn(aliases, "enum"), false);
  const typeEmail =
    aliases.enumByScope["request.fields:/type"].email;
  const channelEmail =
    aliases.enumByScope["notifications.rules:/channel"].email;
  assert.ok(typeEmail.includes("email field"));
  assert.equal(typeEmail.includes("by email"), false);
  assert.ok(channelEmail.includes("by email"));
  assert.equal(channelEmail.includes("email field"), false);

  assert.match(
    enumAliasMatches,
    /scope_key:=p_fact_id\|\|':'\|\|case[\s\S]*attachments\.requirements'[\s\S]*'\/formats\/\*'[\s\S]*notifications\.rules'[\s\S]*'\/recipients\/\*'[\s\S]*else p_path/,
  );
  assert.match(
    enumAliasMatches,
    /template_copilot_v3_enum_leaf_is_allowed\(p_fact_id,p_path,p_leaf_value\)[\s\S]*p_aliases->'enumByScope'->scope_key->p_leaf_value/,
  );
  assert.doesNotMatch(enumAliasMatches, /p_aliases->'enum'->/);

  const authorization = derivesLeaf.indexOf(
    "template_copilot_v3_enum_leaf_is_allowed(p_fact_id,p_path,leaf_text)",
  );
  const canonical = derivesLeaf.indexOf(
    "canonical:=private.template_copilot_v3_normalize_lexical_text(leaf_text)",
  );
  const scopedAliases = derivesLeaf.indexOf(
    "template_copilot_v3_enum_alias_matches(p_fact_id,p_path,leaf_text,wording,aliases)",
  );
  assert.ok(
    authorization >= 0 &&
      authorization < canonical &&
      canonical < scopedAliases,
  );

  const requestTypeStart = enumLeafAllowed.indexOf(
    "p_fact_id='request.fields' and p_path='/type'",
  );
  const attachmentStart = enumLeafAllowed.indexOf(
    "p_fact_id='attachments.requirements'",
  );
  const requestTypeBlock = enumLeafAllowed.slice(requestTypeStart, attachmentStart);
  assert.doesNotMatch(requestTypeBlock, /approval|fixed_email/);
  const channelStart = enumLeafAllowed.indexOf("if p_path='/channel'");
  const visibilityStart = enumLeafAllowed.indexOf("if p_path='/visibility'");
  const channelBlock = enumLeafAllowed.slice(channelStart, visibilityStart);
  assert.doesNotMatch(channelBlock, /fixed_email|approval/);
});

test("immediate notification offsets cannot be present or declared missing", () => {
  assert.match(
    rpc,
    /timing'->>'mode'='immediate' and \(fragment->'value'->'timing'\?'offsetHours' or fragment->'missingPaths' @> '\["\/timing\/offsetHours"\]'::jsonb\)/,
  );
});

test("ordinal aliases cover each supported sequence range and reject malformed suffix forms", () => {
  assert.match(ordinalAliasMatches, /p_sequence not between 1 and 100/);
  assert.match(
    ordinalAliasMatches,
    /mod\(p_sequence,100\) between 11 and 13 then 'th'/,
  );
  assert.match(
    ordinalAliasMatches,
    /mod\(p_sequence,10\)=1 then 'st'[\s\S]*=2 then 'nd'[\s\S]*=3 then 'rd'/,
  );
  for (const word of [
    "first",
    "twelfth",
    "twentieth",
    "thirtieth",
    "fortieth",
    "fiftieth",
    "sixtieth",
    "seventieth",
    "eightieth",
    "ninetieth",
    "one hundredth",
  ]) {
    assert.ok(ordinalAliasMatches.includes(`'${word}'`), word);
  }
  assert.match(
    ordinalAliasMatches,
    /tens_cardinal\|\|'-'\|\|unit_ordinal[\s\S]*tens_cardinal\|\|' '\|\|unit_ordinal/,
  );
  assert.match(
    ordinalAliasMatches,
    /chinese_digits text\[\]:=array\['一','二','三','四','五','六','七','八','九'\]/,
  );
  assert.match(ordinalAliasMatches, /chinese_numeral:='一百'/);
  assert.match(
    ordinalAliasMatches,
    /'第'\|\|chinese_numeral[\s\S]*'第'\|\|chinese_numeral\|\|'個'[\s\S]*'第'\|\|chinese_numeral\|\|'个'[\s\S]*'第'\|\|p_sequence::text\|\|'個'[\s\S]*'第'\|\|p_sequence::text\|\|'个'/,
  );
  assert.match(
    derivesLeaf,
    /p_fact_id='workflow\.stages' and p_path='\/sequence' then 100[\s\S]*p_fact_id='workflow\.conditions' and p_path='\/sequence' then 50/,
  );
  assert.match(
    derivesLeaf,
    /leaf_text::integer between 1 and ordinal_limit[\s\S]*template_copilot_v3_ordinal_alias_matches\(leaf_text::integer,wording\)/,
  );
  assert.doesNotMatch(derivesLeaf, /aliases->'ordinal'->leaf_text/);
});
