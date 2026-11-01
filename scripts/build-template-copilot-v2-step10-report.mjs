import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTemplateCopilotV2Step10Qualification } from "./template-copilot-v2-step10-runner.mjs";
import { buildTemplateCopilotV2Step10CoreMatrix } from "../src/lib/template-copilot-v2-step10-qualification.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = path.join(root, "output", "reports");
const result = runTemplateCopilotV2Step10Qualification();
if (result.status !== "passed") {
  throw new Error(`Step 10 qualification failed: ${result.failures.join(", ")}`);
}
const replay = runTemplateCopilotV2Step10Qualification();
if (JSON.stringify(result) !== JSON.stringify(replay)) {
  throw new Error("Step 10 qualification replay did not reproduce the same result.");
}

const headers = [
  "caseId",
  "workflowId",
  "locale",
  "repetition",
  "mode",
  "answerProfile",
  "ambiguityFixture",
  "providerOutcome",
  "privacyMode",
  "fixtureVersion",
  "questionLibraryVersion",
  "promptVersion",
  "schemaVersion",
  "committedRevision",
  "selectedQuestionCount",
  "conflictOutcome",
  "draftReadiness",
  "publicationReadiness",
  "activationReadiness",
  "draftCompilerBlockers",
  "publicationCompilerBlockers",
  "definitionValid",
  "validationErrors",
  "validationWarnings",
  "highRouteCurrentNodeIds",
  "highRouteTraversedNodeIds",
  "highRouteTerminalNodeId",
  "lowRouteCurrentNodeIds",
  "lowRouteTraversedNodeIds",
  "lowRouteTerminalNodeId",
  "providerRecoveredFromPinnedFixture",
  "providerAdapterInvoked",
  "guidedFallbackUsed",
  "ambiguityUnsafeConfirmationRejected",
  "questionContractCount",
  "questionAccessibilityContractValid",
  "representedFeatures",
  "behaviorHash",
];

const quote = (value) => {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

const cases = buildTemplateCopilotV2Step10CoreMatrix();
const caseById = new Map(cases.map((item) => [item.caseId, item]));
const rows = result.traces.map((trace) => {
  const [, , locale, repetitionToken] =
    trace.caseId.match(/^(.*):(en|zh-Hant|zh-Hans):(r[1-3])$/) || [];
  const qualificationCase = caseById.get(trace.caseId);
  if (!qualificationCase) {
    throw new Error(`Missing matrix case ${trace.caseId}.`);
  }
  return {
    caseId: trace.caseId,
    workflowId: trace.workflowId,
    locale,
    repetition: repetitionToken?.slice(1),
    mode: trace.telemetry.mode,
    answerProfile: trace.answerProfile,
    ambiguityFixture: qualificationCase.ambiguityFixture,
    providerOutcome: trace.provider.outcome,
    privacyMode: trace.telemetry.provider.privacyMode,
    fixtureVersion: trace.fixturePins.fixtureVersion,
    questionLibraryVersion: trace.fixturePins.questionLibraryVersion,
    promptVersion: trace.fixturePins.promptVersion,
    schemaVersion: trace.fixturePins.schemaVersion,
    committedRevision: trace.revisions.committed,
    selectedQuestionCount: trace.selectedQuestionIds.length,
    conflictOutcome: trace.conflictOutcome,
    draftReadiness: trace.readiness.final.draft,
    publicationReadiness: trace.readiness.final.publication,
    activationReadiness: trace.readiness.final.activation,
    draftCompilerBlockers: trace.compiler.draftBlockerCount,
    publicationCompilerBlockers: trace.compiler.publicationBlockerCount,
    definitionValid: trace.validation.valid,
    validationErrors: trace.validation.errorCount,
    validationWarnings: trace.validation.warningCount,
    highRouteCurrentNodeIds: trace.routes.highAmount.currentNodeIds.join("|"),
    highRouteTraversedNodeIds: trace.routes.highAmount.traversedNodeIds.join("|"),
    highRouteTerminalNodeId: trace.routes.highAmount.terminalNodeId,
    lowRouteCurrentNodeIds: trace.routes.lowAmount.currentNodeIds.join("|"),
    lowRouteTraversedNodeIds: trace.routes.lowAmount.traversedNodeIds.join("|"),
    lowRouteTerminalNodeId: trace.routes.lowAmount.terminalNodeId,
    providerRecoveredFromPinnedFixture:
      trace.provider.recoveredThroughGuidedFallback,
    providerAdapterInvoked: trace.provider.adapterInvoked,
    guidedFallbackUsed: trace.modeEvidence.guidedFallbackUsed,
    ambiguityUnsafeConfirmationRejected:
      trace.ambiguity.unsafeConfirmationRejected,
    questionContractCount: trace.accessibilityContracts.length,
    questionAccessibilityContractValid:
      trace.accessibilityContracts.every(
        (contract) =>
          contract.promptPresent &&
          contract.helpControlPresent &&
          contract.interactionLabelsPresent &&
          contract.modeSwitchLabelPresent,
      ),
    representedFeatures: trace.representedFeatures.join("|"),
    behaviorHash: trace.behaviorHash,
  };
});
const csvRows = rows.map((row) =>
  headers.map((header) => quote(row[header])).join(","),
);

const csv = `${headers.map(quote).join(",")}\n${csvRows.join("\n")}\n`;
const summary = {
  generatedAt: new Date().toISOString(),
  result: result.summary,
  status: result.status,
  fixturePins: result.traces[0].fixturePins,
  coverage: {
    modes: [...new Set(result.traces.map((item) => item.telemetry.mode))],
    answerProfiles: [...new Set(result.traces.map((item) => item.answerProfile))],
    ambiguities: [
      ...new Set(
        cases.map((item) => item.ambiguityFixture),
      ),
    ],
    providerOutcomes: [
      ...new Set(result.traces.map((item) => item.provider.outcome)),
    ],
    locales: [...new Set(result.traces.map((item) => item.telemetry.locale))],
  },
  automatedGate: {
    compiler: "passed",
    validation: "passed",
    routeSimulation: "passed",
    deterministicReplay: "passed",
    telemetryPrivacy: "passed",
    providerBoundaryFixtures: "passed",
    questionAccessibilityContracts: "passed",
    unsupportedFeatureFailClosed: "passed",
  },
  pendingAuthorizedEvidence: {
    authenticatedPreview: "pending",
    liveProviderModelSuitability: "pending",
    liveZdrRouteVerification: "pending",
    databaseRlsAndCrossUserBrowserGate: "pending",
    darkAndLightBrowserContrast: "pending",
  },
  humanPilot: {
    status: "pending_separate_authorization",
    requiredPeople: 9,
    requiredObservations: 18,
    note: "No human pilot result is claimed by this automated report.",
  },
  boundaries: {
    pushed: false,
    deployed: false,
    migrationsApplied: false,
  },
};

await fs.mkdir(reportDirectory, { recursive: true });
const csvPath = path.join(
  reportDirectory,
  "template-copilot-v2-step10-qualification.csv",
);
const summaryPath = path.join(
  reportDirectory,
  "template-copilot-v2-step10-qualification-summary.json",
);
await fs.writeFile(csvPath, csv, "utf8");
await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
const csvSha256 = createHash("sha256").update(csv).digest("hex");
process.stdout.write(
  `${JSON.stringify({ csvPath, summaryPath, csvSha256, rows: csvRows.length }, null, 2)}\n`,
);
