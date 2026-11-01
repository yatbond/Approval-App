import { z } from "zod";
import { templateCopilotLocaleSchema } from "./template-copilot-plan.ts";
import {
  templateCopilotV2ExtractionPromptVersion,
  templateCopilotV2ProviderCandidateSchemaVersion,
} from "./template-copilot-v2-candidates.ts";
import {
  assertTemplateCopilotV2TelemetryMinimized,
  templateCopilotV2TelemetryEventSchema,
  templateCopilotV2TelemetryProviderOutcomes,
} from "./template-copilot-v2-telemetry.ts";

export {
  assertTemplateCopilotV2TelemetryMinimized,
  templateCopilotV2TelemetryEventSchema,
};

export const templateCopilotV2Step10FixtureVersion =
  "template-copilot-v2-step10-fixtures-1.0.0";
export const templateCopilotV2Step10QuestionLibraryVersion = "v2.2";
export const templateCopilotV2Step10PromptVersion =
  templateCopilotV2ExtractionPromptVersion;
export const templateCopilotV2Step10SchemaVersion =
  templateCopilotV2ProviderCandidateSchemaVersion;

export const templateCopilotV2QualificationModes = [
  "guided",
  "describe_everything",
  "similar_template",
] as const;
export const templateCopilotV2AnswerProfiles = [
  "complete",
  "uncertain",
  "conflicting",
  "fragmented",
  "typo_heavy",
  "mixed_language",
  "correction_heavy",
] as const;
export const templateCopilotV2AmbiguityFixtures = [
  "none",
  "everyone",
  "one_week",
  "over_one_million",
] as const;
export const templateCopilotV2ProviderOutcomes =
  templateCopilotV2TelemetryProviderOutcomes;

const localizedTitleSchema = z
  .object({
    en: z.string().min(1).max(120),
    "zh-Hant": z.string().min(1).max(120),
    "zh-Hans": z.string().min(1).max(120),
  })
  .strict();

const workflowFixtureSchema = z
  .object({
    workflowId: z.string().regex(/^workflow_[a-z0-9_]+$/),
    titles: localizedTitleSchema,
    departmentCode: z.enum([
      "procurement",
      "finance",
      "people",
      "legal",
      "it_security",
      "operations",
      "governance",
      "projects",
    ]),
    featureCodes: z
      .array(
        z.enum([
          "conditional_route",
          "parallel_approval",
          "dual_path",
          "attachment",
          "native_form",
          "information_handoff",
          "document_handoff",
          "fyi",
          "correction_loop",
          "shared_submission",
        ]),
      )
      .min(2),
    threshold: z.number().int().positive(),
    currency: z.enum(["HKD", "USD"]),
  })
  .strict();

export type TemplateCopilotV2WorkflowFixture = z.infer<
  typeof workflowFixtureSchema
>;

const titles = (
  en: string,
  traditional: string,
  simplified: string,
) => ({ en, "zh-Hant": traditional, "zh-Hans": simplified });

export const templateCopilotV2Step10WorkflowFixtures = Object.freeze(
  [
    ["purchase_requisition", titles("Purchase requisition", "採購申請", "采购申请"), "procurement", ["parallel_approval", "attachment", "fyi", "information_handoff"]],
    ["invoice_match", titles("Invoice three-way match", "發票三方核對", "发票三方核对"), "finance", ["conditional_route", "attachment", "information_handoff", "fyi"]],
    ["capital_expenditure", titles("Capital expenditure", "資本開支", "资本支出"), "finance", ["parallel_approval", "attachment", "information_handoff", "fyi"]],
    ["expense_exception", titles("Expense exception", "費用例外", "费用例外"), "finance", ["conditional_route", "attachment", "information_handoff", "correction_loop"]],
    ["contract_review", titles("Contract review", "合約審閱", "合同审核"), "legal", ["parallel_approval", "attachment", "document_handoff", "information_handoff"]],
    ["site_access", titles("Site access", "工地進入", "工地进入"), "projects", ["parallel_approval", "attachment", "document_handoff", "fyi"]],
    ["data_export", titles("Restricted data export", "受限資料匯出", "受限数据导出"), "it_security", ["parallel_approval", "attachment", "document_handoff", "correction_loop"]],
    ["emergency_procurement", titles("Emergency procurement", "緊急採購", "紧急采购"), "procurement", ["dual_path", "attachment", "correction_loop", "fyi"]],
    ["vendor_onboarding", titles("Vendor onboarding", "供應商登記", "供应商登记"), "procurement", ["parallel_approval", "attachment", "document_handoff", "shared_submission"]],
    ["leave_coverage", titles("Leave and coverage", "休假及職務安排", "休假及工作安排"), "people", ["conditional_route", "dual_path", "information_handoff", "fyi"]],
    ["tender_gate", titles("Tender go or no-go", "投標決策", "投标决策"), "procurement", ["parallel_approval", "document_handoff", "attachment", "information_handoff"]],
    ["method_statement", titles("Method statement", "施工方案", "施工方案"), "projects", ["parallel_approval", "attachment", "document_handoff", "correction_loop"]],
    ["subcontractor_payment", titles("Subcontractor payment", "分判商付款", "分包商付款"), "finance", ["conditional_route", "attachment", "shared_submission", "document_handoff"]],
    ["policy_exception", titles("Policy exception", "政策例外", "政策例外"), "governance", ["conditional_route", "dual_path", "attachment", "correction_loop"]],
    ["training_certification", titles("Training certification", "培訓認證", "培训认证"), "people", ["conditional_route", "attachment", "fyi", "information_handoff"]],
    ["visitor_privacy", titles("Visitor privacy clearance", "訪客私隱審批", "访客隐私审批"), "it_security", ["parallel_approval", "attachment", "document_handoff", "information_handoff"]],
    ["design_change", titles("Design change", "設計變更", "设计变更"), "projects", ["parallel_approval", "information_handoff", "attachment", "correction_loop"]],
    ["privileged_access", titles("Privileged IT access", "特權資訊科技存取", "特权信息技术访问"), "it_security", ["parallel_approval", "attachment", "information_handoff", "fyi"]],
    ["marketing_claim", titles("Marketing claim", "市場推廣聲明", "市场推广声明"), "legal", ["parallel_approval", "attachment", "document_handoff", "correction_loop"]],
    ["credit_limit", titles("Customer credit limit", "客戶信貸限額", "客户信用额度"), "finance", ["conditional_route", "dual_path", "attachment", "information_handoff"]],
    ["asset_disposal", titles("Asset disposal", "資產處置", "资产处置"), "finance", ["parallel_approval", "information_handoff", "attachment", "fyi"]],
    ["incident_action", titles("Incident corrective action", "事故糾正措施", "事故纠正措施"), "operations", ["parallel_approval", "shared_submission", "attachment", "correction_loop"]],
    ["business_travel", titles("Business travel", "商務差旅", "商务差旅"), "people", ["conditional_route", "dual_path", "attachment", "information_handoff"]],
    ["charitable_donation", titles("Charitable donation", "慈善捐款", "慈善捐款"), "governance", ["parallel_approval", "information_handoff", "attachment", "fyi"]],
  ].map(([id, workflowTitles, departmentCode, featureCodes], index) =>
    workflowFixtureSchema.parse({
      workflowId: `workflow_${id}`,
      titles: workflowTitles,
      departmentCode,
      featureCodes,
      threshold: (index + 1) * 10_000,
      currency: index % 4 === 0 ? "USD" : "HKD",
    }),
  ),
);

export const templateCopilotV2Step10FailClosedFeatureFixtures = Object.freeze([
  "native_form_without_field_definitions",
  "conditional_parallel_route_not_representable",
] as const);

export const templateCopilotV2QualificationCaseSchema = z
  .object({
    caseId: z
      .string()
      .regex(/^workflow_[a-z0-9_]+:(en|zh-Hant|zh-Hans):r[1-3]$/),
    workflowId: workflowFixtureSchema.shape.workflowId,
    locale: templateCopilotLocaleSchema,
    repetition: z.number().int().min(1).max(3),
    mode: z.enum(templateCopilotV2QualificationModes),
    answerProfile: z.enum(templateCopilotV2AnswerProfiles),
    ambiguityFixture: z.enum(templateCopilotV2AmbiguityFixtures),
    providerOutcome: z.enum(templateCopilotV2ProviderOutcomes),
    privacyMode: z.literal("zdr"),
    fixtureVersion: z.literal(templateCopilotV2Step10FixtureVersion),
    questionLibraryVersion: z.literal(
      templateCopilotV2Step10QuestionLibraryVersion,
    ),
    promptVersion: z.literal(templateCopilotV2Step10PromptVersion),
    schemaVersion: z.literal(templateCopilotV2Step10SchemaVersion),
  })
  .strict();

export type TemplateCopilotV2QualificationCase = z.infer<
  typeof templateCopilotV2QualificationCaseSchema
>;

export function buildTemplateCopilotV2Step10CoreMatrix() {
  const locales = ["en", "zh-Hant", "zh-Hans"] as const;
  const matrix: TemplateCopilotV2QualificationCase[] = [];
  templateCopilotV2Step10WorkflowFixtures.forEach((workflow, workflowIndex) => {
    locales.forEach((locale, localeIndex) => {
      for (let repetition = 1; repetition <= 3; repetition += 1) {
        const index = workflowIndex * 9 + localeIndex * 3 + repetition - 1;
        matrix.push(
          templateCopilotV2QualificationCaseSchema.parse({
            caseId: `${workflow.workflowId}:${locale}:r${repetition}`,
            workflowId: workflow.workflowId,
            locale,
            repetition,
            mode:
              templateCopilotV2QualificationModes[
                index % templateCopilotV2QualificationModes.length
              ],
            answerProfile:
              templateCopilotV2AnswerProfiles[
                index % templateCopilotV2AnswerProfiles.length
              ],
            ambiguityFixture:
              templateCopilotV2AmbiguityFixtures[
                index % templateCopilotV2AmbiguityFixtures.length
              ],
            providerOutcome:
              templateCopilotV2ProviderOutcomes[
                index % templateCopilotV2ProviderOutcomes.length
              ],
            privacyMode: "zdr",
            fixtureVersion: templateCopilotV2Step10FixtureVersion,
            questionLibraryVersion:
              templateCopilotV2Step10QuestionLibraryVersion,
            promptVersion: templateCopilotV2Step10PromptVersion,
            schemaVersion: templateCopilotV2Step10SchemaVersion,
          }),
        );
      }
    });
  });
  return Object.freeze(matrix);
}

export const templateCopilotV2PilotReviewTags = [
  "unclear_wording",
  "jargon",
  "irrelevant_question",
  "repeated_question",
  "missed_fact",
  "wrong_extraction",
  "wrong_language",
  "misunderstood_default",
  "slow_response",
] as const;

export const templateCopilotV2PilotObservationSchema = z
  .object({
    participantPseudonym: z.string().regex(/^pilot-[0-9a-f]{12}$/),
    locale: templateCopilotLocaleSchema,
    experience: z.enum(["new_author", "experienced_author"]),
    task: z.enum(["standardized", "departmental"]),
    mode: z.enum(templateCopilotV2QualificationModes),
    completedUnaided: z.boolean(),
    dossierComplete: z.boolean(),
    inventedCriticalFactCount: z.number().int().min(0),
    unauthorizedMutationCount: z.number().int().min(0),
    crossUserExposureCount: z.number().int().min(0),
    silentCommittedFactLossCount: z.number().int().min(0),
    automaticPublicationOrActivationCount: z.number().int().min(0),
    traceabilityPercent: z.number().min(0).max(100),
    initialBriefFactRecallPercent: z.number().min(0).max(100),
    durationSeconds: z.number().int().positive(),
    visualBuilderBaselineSeconds: z.number().int().positive().optional(),
    criticalAccessibilityFailureCount: z.number().int().min(0),
    reviewTags: z.array(z.enum(templateCopilotV2PilotReviewTags)).max(20),
  })
  .strict();

export type TemplateCopilotV2PilotObservation = z.infer<
  typeof templateCopilotV2PilotObservationSchema
>;

export function evaluateTemplateCopilotV2Pilot(
  input: readonly TemplateCopilotV2PilotObservation[],
) {
  const observations = input.map((item) =>
    templateCopilotV2PilotObservationSchema.parse(item),
  );
  const participants = new Set(
    observations.map((item) => item.participantPseudonym),
  );
  const languageCounts = Object.fromEntries(
    ["en", "zh-Hant", "zh-Hans"].map((locale) => [
      locale,
      new Set(
        observations
          .filter((item) => item.locale === locale)
          .map((item) => item.participantPseudonym),
      ).size,
    ]),
  );
  const standardized = observations.filter(
    (item) => item.task === "standardized",
  );
  const newGuided = standardized.filter(
    (item) =>
      item.experience === "new_author" &&
      item.mode === "guided",
  );
  const experienced = standardized.filter(
    (item) => item.experience === "experienced_author",
  );
  const departmental = observations.filter(
    (item) => item.task === "departmental",
  );
  const initialBrief = departmental.filter(
    (item) =>
      item.mode === "describe_everything",
  );
  const median = (numbers: number[]) => {
    const ordered = [...numbers].sort((a, b) => a - b);
    if (!ordered.length) return Number.POSITIVE_INFINITY;
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
  };
  const failures = [
    participants.size === 9 || "pilot_requires_exactly_nine_people",
    observations.length === 18 || "pilot_requires_two_tasks_per_person",
    Object.values(languageCounts).every((count) => count === 3) ||
      "pilot_requires_three_people_per_language",
    [...participants].every((participant) => {
      const participantRows = observations.filter(
        (item) => item.participantPseudonym === participant,
      );
      return (
        new Set(participantRows.map((item) => item.locale)).size === 1 &&
        new Set(participantRows.map((item) => item.experience)).size === 1
      );
    }) || "pilot_participant_profile_must_be_consistent",
    ["en", "zh-Hant", "zh-Hans"].every((locale) => {
      const experience = new Set(
        observations
          .filter((item) => item.locale === locale)
          .map((item) => item.experience),
      );
      return (
        experience.has("new_author") &&
        experience.has("experienced_author")
      );
    }) || "pilot_requires_new_and_experienced_authors_per_language",
    [...participants].every((participant) => {
      const tasks = observations
        .filter((item) => item.participantPseudonym === participant)
        .map((item) => item.task);
      return tasks.includes("standardized") && tasks.includes("departmental");
    }) || "pilot_requires_both_tasks_per_person",
    standardized.every((item) => item.mode === "guided") ||
      "standardized_pilot_task_requires_guided_mode",
    ["en", "zh-Hant", "zh-Hans"].every((locale) => {
      const modes = new Set(
        departmental
          .filter((item) => item.locale === locale)
          .map((item) => item.mode),
      );
      return (
        modes.size === 3 &&
        modes.has("guided") &&
        modes.has("describe_everything") &&
        modes.has("similar_template")
      );
    }) || "pilot_requires_all_departmental_modes_per_language",
    ["en", "zh-Hant", "zh-Hans"].every((locale) =>
      initialBrief.some((item) => item.locale === locale),
    ) || "pilot_requires_describe_initial_brief_per_language",
    observations.every(
      (item) =>
        item.unauthorizedMutationCount === 0 &&
        item.crossUserExposureCount === 0 &&
        item.silentCommittedFactLossCount === 0 &&
        item.automaticPublicationOrActivationCount === 0 &&
        item.inventedCriticalFactCount === 0 &&
        item.criticalAccessibilityFailureCount === 0,
    ) || "critical_stop_criterion_triggered",
    observations.every(
      (item) => item.dossierComplete && item.traceabilityPercent === 100,
    ) || "dossier_or_traceability_target_failed",
    standardized.filter((item) => item.completedUnaided).length /
      Math.max(standardized.length, 1) >=
      0.9 || "unaided_completion_below_90_percent",
    median(newGuided.map((item) => item.durationSeconds)) <= 900 ||
      "new_author_median_exceeds_15_minutes",
    experienced.length > 0 &&
      experienced.every(
      (item) =>
        item.visualBuilderBaselineSeconds !== undefined &&
        item.durationSeconds <=
        Number(item.visualBuilderBaselineSeconds) * 0.7,
      ) || "experienced_author_speed_improvement_below_30_percent",
    initialBrief.length > 0 &&
      initialBrief.every(
      (item) => item.initialBriefFactRecallPercent >= 95,
      ) || "initial_brief_fact_recall_below_95_percent",
  ].filter((value): value is string => typeof value === "string");
  return Object.freeze({
    status: failures.length ? ("not_ready" as const) : ("passed" as const),
    participantCount: participants.size,
    observationCount: observations.length,
    languageCounts,
    failures: Object.freeze(failures),
  });
}

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (character === '"') {
      if (quoted && csvText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csvText[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("Pilot CSV contains an unterminated quote.");
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

/** Strict operational import for the privacy-minimized pilot worksheet.
 * Blank placeholders fail validation instead of being interpreted as zero. */
export function parseTemplateCopilotV2PilotCsv(csvText: string) {
  const rows = parseCsvRows(z.string().min(1).parse(csvText));
  const headers = rows[0] || [];
  const expected = Object.keys(templateCopilotV2PilotObservationSchema.shape);
  if (
    headers.length !== expected.length ||
    headers.some((header, index) => header !== expected[index])
  ) {
    throw new Error("Pilot CSV headers do not match the pinned observation schema.");
  }
  const booleans = new Set(["completedUnaided", "dossierComplete"]);
  const numbers = new Set([
    "inventedCriticalFactCount",
    "unauthorizedMutationCount",
    "crossUserExposureCount",
    "silentCommittedFactLossCount",
    "automaticPublicationOrActivationCount",
    "traceabilityPercent",
    "initialBriefFactRecallPercent",
    "durationSeconds",
    "visualBuilderBaselineSeconds",
    "criticalAccessibilityFailureCount",
  ]);
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`Pilot CSV row ${rowIndex + 2} has the wrong number of columns.`);
    }
    const record = Object.fromEntries(headers.map((header, index) => {
      const value = values[index].trim();
      if (header === "reviewTags") {
        return [header, value ? value.split("|").map((tag) => tag.trim()).filter(Boolean) : []];
      }
      if (booleans.has(header)) {
        if (!["true", "false"].includes(value)) {
          throw new Error(`Pilot CSV row ${rowIndex + 2} has an invalid ${header}.`);
        }
        return [header, value === "true"];
      }
      if (numbers.has(header)) {
        if (!value && header === "visualBuilderBaselineSeconds") return [header, undefined];
        if (!value || !Number.isFinite(Number(value))) {
          throw new Error(`Pilot CSV row ${rowIndex + 2} has an invalid ${header}.`);
        }
        return [header, Number(value)];
      }
      return [header, value];
    }));
    return templateCopilotV2PilotObservationSchema.parse(record);
  });
}
