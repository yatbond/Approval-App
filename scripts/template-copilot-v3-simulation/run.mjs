// Simulated users create workflows through the running app: a signed-in author
// types the nine sections, the v3 reader proposes, a careful person (here the
// specification) corrects what is wrong, confirms every fact, creates the draft,
// and the stored draft is checked against what the author meant.
//
//   node scripts/template-copilot-v3-simulation/run.mjs [--start 0] [--count 50] [--label name]
//
// Needs the local Supabase + app from .env.local (never a live database).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectSimulatedUser } from "./api.mjs";
import { simulationWorkflows } from "./workflows.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const start = Number(arg("start", "0"));
const count = Number(arg("count", String(simulationWorkflows.length)));
const label = arg("label", new Date().toISOString().replace(/[:.]/g, "-"));
const appUrl = arg("app", "http://localhost:3100");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const outDir = join("output", "template-copilot-v3-simulation", label);
mkdirSync(outDir, { recursive: true });

const A = "/api/template-authoring/copilot/sessions";
const factOrder = [
  "workflow.name", "workflow.purpose", "workflow.scope", "request.initiator_policy", "request.fields",
  "attachments.requirements", "workflow.stages", "workflow.conditions", "workflow.rejection_policy",
  "collaboration.policy", "timing.rules", "visibility.policy", "notifications.rules",
  "governance.owner", "governance.policies", "governance.retention",
];

const norm = (text) => String(text ?? "").normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
const same = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))));
};

// ------------------------------------------------------- what the author meant
function intendedFacts(spec) {
  const en = spec.lang === "en";
  const sections = spec.sections;
  const radioOptions = en ? ["Yes", "No"] : ["是", "否"];
  const fields = spec.fields.map((field) => ({
    label: field.label, type: field.type, required: field.required,
    options: field.type === "radio" || field.type === "select" ? radioOptions : [],
  }));
  const attachments = [
    ...spec.attachments.map((doc, index) => ({
      id: `doc-${index + 1}`, label: doc.label, kind: "attachment", required: true, formats: doc.formats,
      minimumQuantity: 1, maximumQuantity: 1, maximumFileSizeMb: doc.maxMb, stage: "request_submission",
      contributorPolicy: "allow_invited_contributors", confirmationPolicy: "requester_confirms",
    })),
    ...(spec.condDoc ? [{
      id: "doc-conditional", label: spec.condDoc, kind: "attachment", required: false, formats: ["pdf"],
      minimumQuantity: 0, maximumQuantity: 1, maximumFileSizeMb: 10, stage: "request_submission",
      contributorPolicy: "requester_only", confirmationPolicy: "none",
    }] : []),
  ];
  const phases = [...new Set(spec.stages.map((stage) => stage.phase))].sort((a, b) => a - b);
  const stages = spec.stages.map((stage) => ({
    label: stage.label, kind: stage.kind, participant: { mode: "directory_position", value: stage.label }, sequence: stage.phase,
  }));
  spec.fyi.forEach((label) => stages.push({ label, kind: "for_information", participant: { mode: "directory_position", value: label }, sequence: phases.length + 1 }));
  const firstOfPhase = (phase) => spec.stages.find((stage) => stage.phase === phase).label;
  const conditions = spec.conditions.map((condition, index) => {
    const phase = spec.stages.find((stage) => stage.label === condition.route).phase;
    const next = phases[phases.indexOf(phase) + 1];
    return {
      id: `rule-${index + 1}`, sequence: index + 1, field: condition.field, operator: condition.op, value: condition.value,
      currency: condition.currency, matchingRoute: `stage:${firstOfPhase(phase)}`,
      otherwiseRoute: next === undefined ? "complete" : `stage:${firstOfPhase(next)}`,
    };
  });
  const firstActionable = spec.stages[0].label;
  const rule = (id, event, recipient, extra = {}) => ({
    id, event, recipients: [recipient], timing: { mode: "immediate" }, channel: "default", visibility: "recipients_only", ...extra,
  });
  const notifications = [
    rule("notify-assigned", "stage_assigned", "current_stage_participants", { stage: `stage:${firstActionable}` }),
    rule("notify-due-soon", "due_soon", "current_stage_participants", { timing: { mode: "before_due", offsetHours: 4 }, stage: `stage:${firstActionable}` }),
    rule("notify-overdue", "overdue", "current_stage_participants", { timing: { mode: "after_due", offsetHours: 1 }, stage: `stage:${firstActionable}` }),
    rule("notify-rejected", "request_rejected", "all_participants"),
    rule("notify-correction", "correction_requested", "requester"),
    rule("notify-completed", "request_completed", "requester"),
  ];
  return {
    "workflow.name": spec.name,
    "workflow.purpose": sections.identity_scope.slice(0, 600),
    "workflow.scope": { description: sections.identity_scope, rules: [] },
    "request.initiator_policy": { mode: "any_employee", description: sections.initiators_fields.slice(0, 300) },
    "request.fields": fields,
    "attachments.requirements": attachments,
    "workflow.stages": stages,
    "workflow.conditions": conditions.length > 0 ? conditions : null,
    "workflow.rejection_policy": { action: spec.closeReject ? "close" : "return_for_correction" },
    "collaboration.policy": { description: sections.collaboration_corrections, rules: [] },
    "timing.rules": { defaultDueHours: spec.dueHours, escalation: { description: sections.timing_escalation, rules: [] } },
    "visibility.policy": { description: sections.visibility_notifications, rules: [] },
    "notifications.rules": notifications,
    "governance.owner": spec.owner,
    "governance.policies": [sections.governance],
    "governance.retention": { period: `${spec.retentionDays} days` },
  };
}

// ----------------------------------------- how close was the reader's proposal
function scoreProposal(spec, proposal, intended) {
  const fact = (id) => proposal.facts[id];
  const corrections = [];
  const tally = (family, expected, matched) => ({ family, expected, matched });
  const rows = [];

  const fields = fact("request.fields").value ?? [];
  let matched = 0;
  const usedFields = new Set();
  for (const want of intended["request.fields"]) {
    const index = fields.findIndex((have, position) => !usedFields.has(position) && same(have.label, want.label));
    if (index < 0) { corrections.push(`field missing: ${want.label}`); continue; }
    usedFields.add(index);
    matched += 1;
    if (fields[index].required !== want.required) corrections.push(`field required wrong: ${want.label}`);
    if (fields[index].type !== want.type) corrections.push(`field type wrong: ${want.label} ${fields[index].type}->${want.type}`);
  }
  fields.forEach((have, position) => { if (!usedFields.has(position)) corrections.push(`field extra: ${have.label}`); });
  rows.push(tally("fields", intended["request.fields"].length, matched));

  const attachments = fact("attachments.requirements").value ?? [];
  matched = 0;
  for (const want of intended["attachments.requirements"]) {
    const have = attachments.find((item) => same(item.label, want.label));
    if (!have) { corrections.push(`document missing: ${want.label}`); continue; }
    matched += 1;
    if (have.required !== want.required) corrections.push(`document required wrong: ${want.label}`);
    if (JSON.stringify(have.formats) !== JSON.stringify(want.formats)) corrections.push(`document format wrong: ${want.label}`);
  }
  rows.push(tally("documents", intended["attachments.requirements"].length, matched));

  const stages = fact("workflow.stages").value ?? [];
  matched = 0;
  for (const want of intended["workflow.stages"]) {
    const have = stages.find((item) => same(item.label, want.label));
    if (!have) { corrections.push(`stage missing: ${want.label}`); continue; }
    matched += 1;
    if (have.kind !== want.kind) corrections.push(`stage kind wrong: ${want.label}`);
  }
  // Order and simultaneity: stages the author put in one phase must share one sequence.
  const phaseOf = (list, label) => list.find((item) => same(item.label, label))?.sequence;
  const wantStages = intended["workflow.stages"];
  for (let a = 0; a < wantStages.length; a += 1) {
    for (let b = a + 1; b < wantStages.length; b += 1) {
      const wantSame = wantStages[a].sequence === wantStages[b].sequence;
      const haveA = phaseOf(stages, wantStages[a].label);
      const haveB = phaseOf(stages, wantStages[b].label);
      if (haveA === undefined || haveB === undefined) continue;
      if (wantSame !== (haveA === haveB) || (!wantSame && wantStages[a].sequence < wantStages[b].sequence !== haveA < haveB)) {
        corrections.push(`stage order wrong: ${wantStages[a].label} / ${wantStages[b].label}`);
      }
    }
  }
  rows.push(tally("stages", wantStages.length, matched));

  const conditions = fact("workflow.conditions").value ?? [];
  matched = 0;
  for (const want of intended["workflow.conditions"] ?? []) {
    const have = conditions.find((item) => same(item.field, want.field) && item.operator === want.operator
      && Number(item.value) === Number(want.value) && same(item.matchingRoute, want.matchingRoute));
    if (have) matched += 1; else corrections.push(`condition missing or wrong: ${want.field} ${want.operator} ${want.value}`);
  }
  rows.push(tally("conditions", (intended["workflow.conditions"] ?? []).length, matched));

  const notifications = fact("notifications.rules").value ?? [];
  const events = new Set(notifications.map((item) => item.event));
  const wantEvents = new Set(intended["notifications.rules"].map((item) => item.event));
  matched = [...wantEvents].filter((event) => events.has(event)).length;
  for (const event of wantEvents) if (!events.has(event)) corrections.push(`notification missing: ${event}`);
  rows.push(tally("notifications", wantEvents.size, matched));

  const scalar = [
    ["name", same(fact("workflow.name").value, spec.name)],
    ["dueHours", fact("timing.rules").value?.defaultDueHours === spec.dueHours],
    ["retention", String(fact("governance.retention").value?.period ?? "").includes(String(spec.retentionDays))],
    ["rejection", fact("workflow.rejection_policy").value?.action === (spec.closeReject ? "close" : "return_for_correction")],
  ];
  for (const [name, ok] of scalar) if (!ok) corrections.push(`${name} wrong`);
  rows.push(tally("scalars", scalar.length, scalar.filter(([, ok]) => ok).length));
  return { rows, corrections };
}

// --------------------------------------------------------------- one workflow
async function runWorkflow(user, spec) {
  const result = { id: spec.id, lang: spec.lang, domain: spec.domain, features: spec.features, steps: {}, failure: null };
  const intended = intendedFacts(spec);
  const t0 = Date.now();
  try {
    const started = await user.call("POST", A, {
      businessUnitId: user.businessUnitId, departmentName: user.departmentName, locale: spec.lang, clientMessageId: user.newKey("start"),
    });
    if (started.status !== 201) throw new Error(`start ${started.status}`);
    const sessionId = started.json.sessionId;
    let revision = started.json.revision ?? 1;

    const sections = Object.entries(spec.sections).filter(([, text]) => text).map(([slot, text]) => ({ slot, text }));
    const described = await user.call("POST", `${A}/${sessionId}/describe-v3`, { locale: spec.lang, sections });
    result.steps.describe = { status: described.status, ms: described.ms, batches: described.json?.batches?.map((b) => `${b.batchId}:${b.status}/${b.attempts}/acc${b.acceptedItemCount}/rej${b.rejectedItemCount}`) };
    if (described.status !== 200) throw new Error(`describe ${described.status} ${JSON.stringify(described.json?.error ?? described.text).slice(0, 200)}`);
    const proposal = described.json.proposal;
    const scored = scoreProposal(spec, proposal, intended);
    result.proposal = { rows: scored.rows, correctionCount: scored.corrections.length, corrections: scored.corrections, held: proposal.held.length, missingBatches: proposal.missingBatches };

    // The person confirms every fact with the corrected values.
    const commitErrors = [];
    for (const factId of factOrder) {
      const value = intended[factId];
      const transition = value === null
        ? { operation: "mark_not_applicable", reason: "The description has no conditional routing." }
        : { operation: "human_commit", payload: { canonicalValue: value, provenance: [{ kind: "human_editor", sourceId: "v3-review", sourceMessageIds: [] }] } };
      const committed = await user.call("POST", `${A}/${sessionId}/facts`, { expectedRevision: revision, idempotencyKey: user.newKey("fact"), factId, transition });
      if (committed.status !== 200) { commitErrors.push(`${factId} ${committed.status} ${JSON.stringify(committed.json?.error ?? committed.json?.issues ?? "").slice(0, 160)}`); continue; }
      revision = committed.json.revision ?? revision;
    }
    result.steps.commit = { errors: commitErrors };
    if (commitErrors.length) throw new Error(`commit: ${commitErrors[0]}`);

    const draft = await user.call("POST", `${A}/${sessionId}/create-draft`, { expectedRevision: revision, idempotencyKey: user.newKey("draft") });
    result.steps.draft = { status: draft.status, ms: draft.ms };
    if (draft.status !== 201) throw new Error(`create-draft ${draft.status} ${JSON.stringify(draft.json?.compilerIssues ?? draft.json?.error ?? draft.text).slice(0, 300)}`);
    const template = draft.json.definition.template;
    const nodeLabels = (template.graph?.nodes ?? []).map((node) => String(node.data?.label ?? node.label ?? ""));
    const checks = {
      fields: template.fields.length === spec.fields.length,
      documents: template.documents.length === intended["attachments.requirements"].length,
      stages: spec.stages.every((stage) => nodeLabels.some((nodeLabel) => same(nodeLabel, stage.label))),
      parallel: !spec.stages.some((stage) => stage.parallel) || nodeLabels.some((nodeLabel) => /parallel|并行|並行|同時|同时|simultaneous/i.test(nodeLabel)),
      validationErrors: draft.json.validation?.errorCount ?? null,
    };
    result.steps.verify = checks;
    result.draftOk = checks.fields && checks.documents && checks.stages && checks.parallel;
    if (!result.draftOk) throw new Error(`draft differs from the author's intent: ${JSON.stringify(checks)}`);
  } catch (error) {
    result.failure = error instanceof Error ? error.message : String(error);
  }
  result.ms = Date.now() - t0;
  return result;
}

const user = await connectSimulatedUser({
  appUrl, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, label: "sim",
});
const only = arg("only", "");
const selected = only ? simulationWorkflows.filter((spec) => only.split(",").includes(spec.id)) : simulationWorkflows.slice(start, start + count);
const results = [];
for (const spec of selected) {
  const row = await runWorkflow(user, spec);
  results.push(row);
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 1));
  const p = row.proposal;
  const acc = p ? p.rows.map((r) => `${r.family[0]}${r.matched}/${r.expected}`).join(" ") : "-";
  console.log(`${row.id} ${spec.lang.padEnd(7)} ${row.failure ? "FAIL" : "ok  "} corrections=${p?.correctionCount ?? "-"} held=${p?.held ?? "-"} [${acc}] ${Math.round(row.ms / 1000)}s${row.failure ? ` :: ${row.failure.slice(0, 160)}` : ""}`);
}
const done = results.filter((row) => !row.failure).length;
console.log(`completed=${done}/${results.length} report=${join(outDir, "results.json")}`);
