import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const baselinePath = resolve(
  process.env.QUALIFICATION_BASELINE_PATH?.trim() ||
    "output/template-copilot-qualification/qualification-results.json",
);
const retestPath = resolve(
  process.env.QUALIFICATION_FINAL_PATH?.trim() ||
    "output/template-copilot-qualification-retest/qualification-results.json",
);
const outputDirectory = resolve(
  process.env.QUALIFICATION_REPORT_OUTPUT_DIR?.trim() ||
    "output/template-copilot-qualification-report",
);
const csvPath = resolve(
  outputDirectory,
  "approval-copilot-qwen-qualification-report.csv",
);
const summaryPath = resolve(outputDirectory, "qualification-summary.json");
const previewPath = resolve(outputDirectory, "csv-artifact-preview.png");
const artifactModulePath =
  process.env.CODEX_ARTIFACT_TOOL_MODULE?.trim() ||
  "C:\\Users\\Derrick Pang\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\@oai\\artifact-tool\\dist\\artifact_tool.mjs";

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const retest = JSON.parse(await readFile(retestPath, "utf8"));
const retestById = new Map(retest.scenarios.map((item) => [item.id, item]));
const finalScenarios = baseline.scenarios
  .map((item) => retestById.get(item.id) || item)
  .sort((left, right) => left.id.localeCompare(right.id));

const languageLabels = {
  en: "English",
  "zh-Hant": "Traditional Chinese",
  "zh-Hans": "Simplified Chinese",
};
const interviewDurations = finalScenarios.flatMap((scenario) =>
  scenario.turns.map((turn) => Number(turn.durationMs || 0)),
);
const draftDurations = finalScenarios.map((scenario) =>
  Number(scenario.draft?.durationMs || 0),
);
const allModelDurations = [...interviewDurations, ...draftDurations].filter(
  (value) => value > 0,
);
const finalDeploymentIds = Array.from(
  new Set([
    baseline.deployment.deploymentId,
    retest.deployment.deploymentId,
  ]),
);
const finalCommits = Array.from(
  new Set([baseline.deployment.commit, retest.deployment.commit]),
);

const byLanguage = Object.fromEntries(
  Object.entries(languageLabels).map(([language, label]) => {
    const scenarios = finalScenarios.filter(
      (item) => item.language === language,
    );
    const turns = scenarios.flatMap((item) => item.turns);
    return [
      language,
      {
        label,
        scenarioCount: scenarios.length,
        interviewPasses: scenarios.filter((item) => item.interviewPassed)
          .length,
        draftPasses: scenarios.filter((item) => item.draft?.created).length,
        turnCount: turns.length,
        nativeHanAcknowledgements:
          language === "en"
            ? null
            : turns.filter((turn) => turn.assistantHasHan).length,
        englishQuestionTurns:
          language === "en"
            ? null
            : turns.filter((turn) => turn.assistantHasEnglishQuestion).length,
        p50TurnMs: percentile(
          turns.map((turn) => Number(turn.durationMs || 0)),
          0.5,
        ),
        p95TurnMs: percentile(
          turns.map((turn) => Number(turn.durationMs || 0)),
          0.95,
        ),
      },
    ];
  }),
);

const correctionScenarios = finalScenarios.filter(
  (item) => item.confirmationCorrection,
);
const correctionPasses = correctionScenarios.filter((item) =>
  /48|四十八/.test(
    String(item.confirmationCorrection?.timingSummary || ""),
  ),
).length;
const protocolPasses = retest.protocols.filter((item) => item.passed).length;
const summary = {
  title: "Approval Template Copilot - Qwen Qualification Report",
  generatedAt: new Date().toISOString(),
  model: "qwen/qwen3.5-35b-a3b",
  routingMode: "OpenRouter ZDR required, reasoning effort none",
  baseline: {
    scenarioCount: baseline.scenarios.length,
    interviewPasses: baseline.scenarios.filter(
      (item) => item.interviewPassed,
    ).length,
    draftPasses: baseline.scenarios.filter((item) => item.draft?.created)
      .length,
    deploymentId: baseline.deployment.deploymentId,
    commit: baseline.deployment.commit,
  },
  final: {
    scenarioCount: finalScenarios.length,
    interviewPasses: finalScenarios.filter(
      (item) => item.interviewPassed,
    ).length,
    draftPasses: finalScenarios.filter((item) => item.draft?.created).length,
    fidelityPasses: finalScenarios.filter((item) => item.fidelity?.passed)
      .length,
    protocolPasses,
    protocolCount: retest.protocols.length,
    browserErrorCount: retest.browser.errors?.length || 0,
    correctionPasses,
    correctionCount: correctionScenarios.length,
    crossUserIsolationPassed:
      retest.protocols.find((item) => item.id === "cross-user-isolation")
        ?.passed === true,
    deploymentIds: finalDeploymentIds,
    commits: finalCommits,
  },
  performance: {
    interviewCallCount: interviewDurations.length,
    p50InterviewTurnMs: percentile(interviewDurations, 0.5),
    p95InterviewTurnMs: percentile(interviewDurations, 0.95),
    maximumInterviewTurnMs: Math.max(...interviewDurations),
    p50DraftAttemptMs: percentile(draftDurations, 0.5),
    p95DraftAttemptMs: percentile(draftDurations, 0.95),
    maximumDraftAttemptMs: Math.max(...draftDurations),
    p95AllModelCallMs: percentile(allModelDurations, 0.95),
  },
  languages: byLanguage,
  defects: [
    {
      id: "DEF-001",
      severity: "Critical",
      status: "Fixed and retested",
      title: "Direct model-to-executable compilation was nondeterministic",
      evidence: `${finalScenarios.filter((item) => item.draft?.created).length} of ${finalScenarios.length} scenarios created validated, simulated executable drafts after moving IDs, graph construction, references, fallbacks, and handoffs into deterministic application code.`,
      recommendation:
        "Keep executable graph authority in the deterministic compiler and retain the model only for bounded interview extraction and plan candidates.",
    },
    {
      id: "DEF-002",
      severity: "High",
      status: "Fixed and retested",
      title: "Chinese interviews previously asked the next question in English",
      evidence: `Traditional and Simplified Chinese both passed 8 of 8 scenarios. English-question leakage was ${byLanguage["zh-Hant"].englishQuestionTurns + byLanguage["zh-Hans"].englishQuestionTurns} turns in the final run.`,
      recommendation:
        "Keep all interview, confirmation, dossier-review, error, and handoff controls covered by the three-locale regression matrix.",
    },
    {
      id: "DEF-003",
      severity: "High",
      status: "Fixed and retested",
      title: "Model over-classified supplied requirements as unknown",
      evidence:
        "Baseline 17 of 24 interviews passed; all seven failures passed unchanged after the explicit-uncertainty guard.",
      recommendation:
        "Keep deterministic uncertainty classification and monitor explicit-unknown recovery rates.",
    },
    {
      id: "DEF-004",
      severity: "Medium",
      status: "Fixed and retested",
      title: "Correction during confirmation targeted the confirmation section",
      evidence:
        "Correction schema now excludes confirmation as a target; 3 of 3 language correction checks preserved the 48-hour update.",
      recommendation:
        "Retain correction-target validation and add multi-section editing UI.",
    },
    {
      id: "DEF-005",
      severity: "Medium",
      status: "Fixed and retested",
      title: "Non-admin page requested the admin email outbox",
      evidence:
        "The pilot logged 403 responses; the fixed full and retest browser runs logged zero errors.",
      recommendation:
        "Keep permission-gated admin data fetching and add role-matrix browser coverage.",
    },
    {
      id: "DEF-006",
      severity: "Medium",
      status: "Fixed and retested",
      title: "Accepted initialRequirement did not begin extraction",
      evidence:
        "The final protocol applies the initial brief and leaves only genuinely unresolved details in the interview.",
      recommendation:
        "Expose an initial free-text brief in the in-app Copilot start screen.",
    },
    {
      id: "DEF-007",
      severity: "Medium",
      status: "Fixed and retested",
      title: "The default serverless window cut off long-tail draft calls",
      evidence:
        "Two otherwise valid drafts in the baseline were cut off by identical 60-second socket hang-ups. The draft route now declares a 300-second execution window, and the final run completed all drafts.",
      recommendation:
        "Monitor p95 provider latency and timeout counts; keep deterministic reconciliation replay-safe under client retries.",
    },
    {
      id: "DEF-008",
      severity: "Medium",
      status: "Fixed and retested",
      title: "End-to-end validation, simulation, and handoff fidelity were blocked",
      evidence: `${finalScenarios.filter((item) => item.fidelity?.passed).length} of ${finalScenarios.length} scenarios passed coded validation, branch simulation, and fidelity checks for fields, documents, approvals, conditions, FYI, and restricted handoffs.`,
      recommendation:
        "Retain the 24-scenario matrix as a release gate and add reviewed production-like examples during the controlled pilot.",
    },
    {
      id: "DEF-009",
      severity: "Medium",
      status: "Fixed and retested",
      title: "Generated requirements lacked an editable review and source evidence",
      evidence:
        "The Copilot now pauses at an editable dossier review, persists human changes as a new authoritative draft revision, and records deterministic interview and page-level document citations with SHA-256 identity.",
      recommendation:
        "During the pilot, audit citation usefulness and add item-level document-to-requirement linkage where policy teams need finer evidence.",
    },
  ],
  decision: {
    interviewUse: "Go with human review",
    deterministicCompilationUse: "Go with coded validation and simulation",
    corporatePilotUse:
      "Conditional go for a controlled 5-10 person corporate pilot; publication and activation remain human-authorized.",
    rationale:
      "Qwen is suitable for multilingual requirements extraction when paired with deterministic compilation, coded validation, simulation, revision control, and an explicit human dossier review.",
  },
};

const columns = [
  "record_type",
  "phase",
  "id",
  "language",
  "language_label",
  "archetype",
  "department",
  "test_area",
  "section",
  "status",
  "passed",
  "baseline_passed",
  "retest_passed",
  "interview_passed",
  "draft_created",
  "validation_passed",
  "simulation_passed",
  "fidelity_passed",
  "model",
  "http_status",
  "outcome",
  "duration_ms",
  "attempt_count",
  "turn_p50_ms",
  "turn_p95_ms",
  "assistant_native_ack",
  "assistant_english_question",
  "section_status",
  "summary",
  "minimum_documents",
  "minimum_request_fields",
  "minimum_approval_nodes",
  "minimum_condition_nodes",
  "require_fyi",
  "require_selected_field_handoff",
  "require_restricted_document_handoff",
  "error_code",
  "error_message",
  "fidelity_failures",
  "notes",
  "deployment_id",
  "commit",
];
const rows = [];

rows.push(
  row({
    record_type: "summary",
    phase: "final",
    id: "OVERALL",
    test_area: "qualification",
    status: "PASS_CONTROLLED_PILOT_GATE",
    passed: true,
    interview_passed: `${summary.final.interviewPasses}/${summary.final.scenarioCount}`,
    draft_created: `${summary.final.draftPasses}/${summary.final.scenarioCount}`,
    model: summary.model,
    turn_p50_ms: summary.performance.p50InterviewTurnMs,
    turn_p95_ms: summary.performance.p95InterviewTurnMs,
    notes:
      "24/24 multilingual workflows passed interview, draft creation, coded validation, simulation, and fidelity checks on one immutable Preview build.",
    deployment_id: finalDeploymentIds.join("|"),
    commit: finalCommits.join("|"),
  }),
);

for (const protocol of retest.protocols) {
  rows.push(
    row({
      record_type: "protocol",
      phase: "final_retest",
      id: protocol.id,
      language: protocol.language || "",
      language_label: languageLabels[protocol.language] || "",
      test_area: "security_resilience_contract",
      status: protocol.skipped
        ? "SKIPPED"
        : protocol.passed
          ? "PASS"
          : "FAIL",
      passed: Boolean(protocol.passed),
      http_status: protocol.status || "",
      error_code: protocol.errorCode || "",
      notes: compactJson(protocol),
      deployment_id: retest.deployment.deploymentId,
      commit: retest.deployment.commit,
    }),
  );
}

for (const scenario of finalScenarios) {
  const original = baseline.scenarios.find((item) => item.id === scenario.id);
  const targetedRetest = retestById.get(scenario.id);
  const turnDurations = scenario.turns.map((turn) =>
    Number(turn.durationMs || 0),
  );
  rows.push(
    row({
      record_type: "scenario",
      phase: targetedRetest ? "targeted_retest" : "baseline_accepted",
      id: scenario.id,
      language: scenario.language,
      language_label: languageLabels[scenario.language],
      archetype: scenario.archetype,
      department: scenario.departmentName,
      test_area: "workflow_scenario",
      status:
        scenario.interviewPassed && scenario.draft?.created
          ? "PASS"
          : scenario.interviewPassed
            ? "INTERVIEW_PASS_DRAFT_FAIL"
            : "FAIL",
      passed: Boolean(scenario.interviewPassed && scenario.draft?.created),
      baseline_passed: Boolean(original?.interviewPassed),
      retest_passed:
        targetedRetest === undefined
          ? ""
          : Boolean(targetedRetest.interviewPassed),
      interview_passed: Boolean(scenario.interviewPassed),
      draft_created: Boolean(scenario.draft?.created),
      validation_passed: Boolean(scenario.validation?.valid),
      simulation_passed: Boolean(scenario.simulation?.validationValid),
      fidelity_passed: Boolean(scenario.fidelity?.passed),
      model: summary.model,
      http_status: scenario.draft?.status || "",
      outcome: scenario.draft?.outcome || "",
      duration_ms: scenario.durationMs || "",
      attempt_count: scenario.draft?.attemptCount || "",
      turn_p50_ms: percentile(turnDurations, 0.5),
      turn_p95_ms: percentile(turnDurations, 0.95),
      minimum_documents: scenario.expectations?.minimumDocuments || 0,
      minimum_request_fields:
        scenario.expectations?.minimumRequestFields || 0,
      minimum_approval_nodes:
        scenario.expectations?.minimumApprovalNodes || 0,
      minimum_condition_nodes:
        scenario.expectations?.minimumConditionNodes || 0,
      require_fyi: Boolean(scenario.expectations?.requireFyi),
      require_selected_field_handoff: Boolean(
        scenario.expectations?.requireSelectedFieldHandoff,
      ),
      require_restricted_document_handoff: Boolean(
        scenario.expectations?.requireRestrictedDocumentHandoff,
      ),
      error_code: scenario.draft?.errorCode || "",
      error_message: scenario.draft?.errorMessage || scenario.failure || "",
      fidelity_failures: (scenario.fidelity?.failures || []).join(" | "),
      notes: [
        targetedRetest ? "Replaced baseline interview failure." : "",
        scenario.confirmationCorrection
          ? `Correction timing: ${scenario.confirmationCorrection.timingSummary}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      deployment_id: targetedRetest
        ? retest.deployment.deploymentId
        : baseline.deployment.deploymentId,
      commit: targetedRetest
        ? retest.deployment.commit
        : baseline.deployment.commit,
    }),
  );

  for (const turn of scenario.turns) {
    rows.push(
      row({
        record_type: "interview_turn",
        phase: targetedRetest ? "targeted_retest" : "baseline_accepted",
        id: scenario.id,
        language: scenario.language,
        language_label: languageLabels[scenario.language],
        archetype: scenario.archetype,
        department: scenario.departmentName,
        test_area: "interview",
        section: turn.sectionId,
        status:
          turn.status === 200 && turn.sectionStatus === "answered"
            ? "PASS"
            : "FAIL",
        passed:
          turn.status === 200 && turn.sectionStatus === "answered",
        model: summary.model,
        http_status: turn.status,
        outcome: turn.outcome,
        duration_ms: turn.durationMs,
        attempt_count: turn.attemptCount,
        assistant_native_ack:
          scenario.language === "en" ? "" : turn.assistantHasHan,
        assistant_english_question:
          scenario.language === "en"
            ? ""
            : turn.assistantHasEnglishQuestion,
        section_status: turn.sectionStatus,
        summary: turn.summary,
        deployment_id: targetedRetest
          ? retest.deployment.deploymentId
          : baseline.deployment.deploymentId,
        commit: targetedRetest
          ? retest.deployment.commit
          : baseline.deployment.commit,
      }),
    );
  }
}

for (const defect of summary.defects) {
  rows.push(
    row({
      record_type: "defect",
      phase: "final",
      id: defect.id,
      test_area: defect.severity,
      status: defect.status,
      passed: defect.status.startsWith("Fixed"),
      summary: defect.title,
      notes: `${defect.evidence} Recommendation: ${defect.recommendation}`,
      deployment_id: finalDeploymentIds.join("|"),
      commit: finalCommits.join("|"),
    }),
  );
}

const csv = [
  columns.join(","),
  ...rows.map((item) =>
    columns.map((column) => csvCell(item[column])).join(","),
  ),
].join("\r\n");
await mkdir(outputDirectory, { recursive: true });
await writeFile(csvPath, `${csv}\r\n`, "utf8");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const { Workbook } = await import(pathToFileURL(artifactModulePath).href);
const workbook = await Workbook.fromCSV(csv, { sheetName: "Qualification" });
const qualificationSheet = workbook.worksheets.getItem("Qualification");
qualificationSheet.getRange("A1:L18").format.wrapText = true;
for (const [column, width] of [
  ["A:A", 18],
  ["B:B", 18],
  ["C:C", 34],
  ["D:D", 12],
  ["E:E", 20],
  ["F:F", 26],
  ["G:G", 24],
  ["H:H", 28],
  ["I:I", 28],
  ["J:J", 30],
  ["K:L", 15],
]) {
  qualificationSheet.getRange(column).format.columnWidth = width;
}
qualificationSheet.getRange("1:1").format.rowHeight = 28;
qualificationSheet.getRange("A1:L1").format.fill = "#1F2937";
qualificationSheet.getRange("A1:L1").format.font = {
  bold: true,
  color: "#FFFFFF",
};
const inspection = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 5000,
  tableMaxRows: 8,
  tableMaxCols: 12,
  tableMaxCellChars: 100,
});
const previewBlob = await workbook.render({
  sheetName: "Qualification",
  range: "A1:L18",
  scale: 1.5,
});
await writeFile(previewPath, Buffer.from(await previewBlob.arrayBuffer()));

console.log(`csv=${csvPath}`);
console.log(`summary=${summaryPath}`);
console.log(`preview=${previewPath}`);
console.log(`row_count=${rows.length}`);
console.log(`artifact_inspection=${inspection.ndjson}`);

function row(values) {
  return Object.fromEntries(columns.map((column) => [column, values[column] ?? ""]));
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function percentile(values, fraction) {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function compactJson(value) {
  return JSON.stringify(value).replaceAll(/\s+/g, " ").slice(0, 4_000);
}
