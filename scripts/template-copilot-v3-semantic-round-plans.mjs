import { createHash } from "node:crypto";
import {
  templateCopilotQualificationScenarios,
} from "./template-copilot-qualification-scenarios.mjs";
import {
  templateCopilotV3SemanticScenarioManifest,
} from "./template-copilot-v3-semantic-scenario-manifests.mjs";
import {
  templateCopilotV3ProviderQuoteAllowedSlotsByBatchAndKind,
  templateCopilotV3ProviderQuoteBatchIds,
} from "../src/lib/template-copilot-v3-provider-quotes.ts";

export const templateCopilotV3SemanticRoundPlanVersion =
  "template-copilot-v3-semantic-round-plan.1";

export const templateCopilotV3SemanticInterviewSlots = Object.freeze([
  "initiators_fields",
  "attachments",
  "stages_participants",
  "conditions_exceptions",
  "collaboration_corrections",
  "timing_escalation",
  "visibility_notifications",
  "governance",
]);

export const templateCopilotV3SemanticFactSourceSlots = Object.freeze({
  "workflow.name": "identity_scope",
  "workflow.purpose": "identity_scope",
  "workflow.scope": "identity_scope",
  "request.initiator_policy": "initiators_fields",
  "request.fields": "initiators_fields",
  "attachments.requirements": "attachments",
  "workflow.stages": "stages_participants",
  "workflow.conditions": "conditions_exceptions",
  "workflow.rejection_policy": "conditions_exceptions",
  "collaboration.policy": "collaboration_corrections",
  "timing.rules": "timing_escalation",
  "visibility.policy": "visibility_notifications",
  "notifications.rules": "visibility_notifications",
  "governance.owner": "governance",
  "governance.policies": "governance",
  "governance.retention": "governance",
});

export const templateCopilotV3SemanticSlotBatchIds = Object.freeze({
  identity_scope: Object.freeze(["policy_context"]),
  initiators_fields: Object.freeze(["intake_documents"]),
  attachments: Object.freeze(["intake_documents"]),
  stages_participants: Object.freeze(["routing_stages_participants"]),
  conditions_exceptions: Object.freeze([
    "routing_conditions",
    "routing_rejection",
  ]),
  collaboration_corrections: Object.freeze(["policy_context"]),
  timing_escalation: Object.freeze(["policy_context"]),
  visibility_notifications: Object.freeze([
    "routing_stages_participants",
    "policy_context",
  ]),
  governance: Object.freeze(["policy_context"]),
});

const providerKindByFactId = Object.freeze({
  "workflow.name": "workflow_name",
  "workflow.purpose": "workflow_purpose",
  "workflow.scope": "workflow_scope",
  "request.initiator_policy": "initiator",
  "request.fields": "request_field",
  "attachments.requirements": "attachment",
  "workflow.stages": "stage",
  "workflow.conditions": "condition",
  "workflow.rejection_policy": "rejection",
  "collaboration.policy": "collaboration",
  "timing.rules": "timing",
  "visibility.policy": "visibility",
  "notifications.rules": "notification",
  "governance.owner": "governance_owner",
  "governance.policies": "governance_policy",
  "governance.retention": "retention",
});

const questionTextByLanguage = Object.freeze({
  en: Object.freeze({
    initiators_fields:
      "Who may start this workflow, and which request fields are required?",
    attachments:
      "Which documents, uploads, or native forms are required or optional?",
    stages_participants:
      "What approval stages and participants are required, and which are sequential or parallel?",
    conditions_exceptions:
      "Which conditions, exceptions, rejection routes, and completion routes apply?",
    collaboration_corrections:
      "Who may contribute, what may they contribute, and who confirms the final package?",
    timing_escalation:
      "What deadlines, reminders, and escalation rules apply?",
    visibility_notifications:
      "Who may see what, and which notification events and recipients apply?",
    governance:
      "Who owns, reviews, and publishes the template, and what retention and language policies apply?",
  }),
  "zh-Hant": Object.freeze({
    initiators_fields: "誰可以發起此工作流程，以及申請必須填寫哪些欄位？",
    attachments: "哪些文件、上載項目或原生表格是必須或選填？",
    stages_participants: "需要哪些審批階段及參與者，哪些按順序或並行進行？",
    conditions_exceptions: "適用哪些條件、例外、拒絕路徑及完成路徑？",
    collaboration_corrections: "誰可以協作、可提交甚麼，以及誰確認最後整套資料？",
    timing_escalation: "適用哪些期限、提醒及升級規則？",
    visibility_notifications: "誰可以查看哪些內容，以及適用哪些通知事件和收件人？",
    governance: "誰負責、檢討及發布範本，以及適用哪些保留和語言政策？",
  }),
  "zh-Hans": Object.freeze({
    initiators_fields: "谁可以发起此工作流程，以及申请必须填写哪些字段？",
    attachments: "哪些文件、上传项目或原生表单是必填或选填？",
    stages_participants: "需要哪些审批阶段和参与者，哪些按顺序或并行进行？",
    conditions_exceptions: "适用哪些条件、例外、拒绝路径和完成路径？",
    collaboration_corrections: "谁可以协作、可提交什么，以及谁确认最终整套资料？",
    timing_escalation: "适用哪些期限、提醒和升级规则？",
    visibility_notifications: "谁可以查看哪些内容，以及适用哪些通知事件和收件人？",
    governance: "谁负责、复核和发布模板，以及适用哪些保留和语言政策？",
  }),
});

const allSourceSlots = Object.freeze([
  "identity_scope",
  ...templateCopilotV3SemanticInterviewSlots,
]);

function planForScenario(item) {
  const ordinal = Number.parseInt(item.id.slice(-2), 10);
  const recoveryProbeSlot =
    templateCopilotV3SemanticInterviewSlots[ordinal - 1];
  const factSourceSlots =
    templateCopilotV3SemanticFactSourceSlotsForScenario(item.id);
  const factBatchIds =
    templateCopilotV3SemanticFactBatchIdsForScenario(item.id);
  const questions = Object.freeze(
    Object.entries(factSourceSlots)
      .filter(([, sourceSlot]) =>
        templateCopilotV3SemanticInterviewSlots.includes(sourceSlot)
      )
      .map(([factId, sourceSlot]) =>
        Object.freeze({
          questionId: `v3-round2:${item.id}:${factId}`,
          factId,
          sourceSlot,
          text: questionTextByLanguage[item.language][sourceSlot],
        })
      ),
  );
  return Object.freeze({
    version: templateCopilotV3SemanticRoundPlanVersion,
    scenarioId: item.id,
    language: item.language,
    recoveryProbeSlot,
    provisionalSourceSlots: allSourceSlots,
    finalSourceSlots: allSourceSlots,
    recoveryProbeBatchIds:
      templateCopilotV3SemanticSlotBatchIds[recoveryProbeSlot],
    factBatchIds,
    expectedQuestionIds: Object.freeze([]),
    eligibleAmbiguityQuestions: Object.freeze([]),
    questions,
  });
}

export function templateCopilotV3SemanticFactSourceSlotsForScenario(id) {
  const manifest = templateCopilotV3SemanticScenarioManifest(id);
  if (!manifest) return null;
  const mapped = { ...templateCopilotV3SemanticFactSourceSlots };
  for (const fact of manifest.scalarFacts) {
    if (
      typeof fact?.factId === "string" &&
      typeof fact?.slot === "string" &&
      Object.hasOwn(mapped, fact.factId)
    ) {
      mapped[fact.factId] = fact.slot;
    }
  }
  const notificationSlots = [
    ...new Set(
      manifest.notificationRules
        .map((rule) => rule?.slot)
        .filter((slot) => typeof slot === "string"),
    ),
  ];
  if (notificationSlots.includes("visibility_notifications")) {
    mapped["notifications.rules"] = "visibility_notifications";
  } else if (notificationSlots.length > 0) {
    mapped["notifications.rules"] = notificationSlots[0];
  }
  return Object.freeze(mapped);
}

export function templateCopilotV3SemanticFactBatchIdsForScenario(id) {
  const manifest = templateCopilotV3SemanticScenarioManifest(id);
  const factSourceSlots =
    templateCopilotV3SemanticFactSourceSlotsForScenario(id);
  if (!manifest || !factSourceSlots) return null;
  const slotsByFactId = Object.fromEntries(
    Object.entries(factSourceSlots).map(([factId, sourceSlot]) => [
      factId,
      [sourceSlot],
    ]),
  );
  slotsByFactId["workflow.stages"] = [
    "stages_participants",
    "conditions_exceptions",
  ];
  const notificationSlots = [
    ...new Set(
      manifest.notificationRules
        .map((rule) => rule?.slot)
        .filter((slot) => typeof slot === "string"),
    ),
  ];
  if (notificationSlots.length > 0) {
    slotsByFactId["notifications.rules"] = notificationSlots;
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(providerKindByFactId).map(([factId, providerKind]) => {
        const authoritativeSlots = new Set(slotsByFactId[factId] ?? []);
        const batchIds = templateCopilotV3ProviderQuoteBatchIds.filter(
          (batchId) =>
            (templateCopilotV3ProviderQuoteAllowedSlotsByBatchAndKind[
              batchId
            ]?.[providerKind] ?? []).some((slot) =>
              authoritativeSlots.has(slot)
            ),
        );
        if (batchIds.length === 0) {
          throw new Error(
            `No exact recovery batch owns ${id}:${factId}.`,
          );
        }
        return [factId, Object.freeze(batchIds)];
      }),
    ),
  );
}

export const templateCopilotV3SemanticRoundPlans = Object.freeze(
  Object.fromEntries(
    templateCopilotQualificationScenarios.map((item) => [
      item.id,
      planForScenario(item),
    ]),
  ),
);

export const templateCopilotV3SemanticRoundPlanFingerprint =
  `sha256:${createHash("sha256")
    .update(JSON.stringify(templateCopilotV3SemanticRoundPlans))
    .digest("hex")}`;

export function templateCopilotV3SemanticRoundPlan(id) {
  return templateCopilotV3SemanticRoundPlans[id] ?? null;
}

export function assertTemplateCopilotV3SemanticRoundPlans() {
  const plans = Object.values(templateCopilotV3SemanticRoundPlans);
  if (plans.length !== 24) {
    throw new Error("The iterative qualification requires exactly 24 plans.");
  }
  const scenarioIds = new Set(
    templateCopilotQualificationScenarios.map((item) => item.id),
  );
  const questionIds = new Set();
  for (const plan of plans) {
    if (
      !scenarioIds.has(plan.scenarioId) ||
      !["en", "zh-Hant", "zh-Hans"].includes(plan.language) ||
      !templateCopilotV3SemanticInterviewSlots.includes(
        plan.recoveryProbeSlot,
      ) ||
      plan.finalSourceSlots.length !== allSourceSlots.length ||
      plan.provisionalSourceSlots.length !== allSourceSlots.length ||
      !sameStringArray(plan.provisionalSourceSlots, allSourceSlots) ||
      !sameStringArray(plan.finalSourceSlots, allSourceSlots) ||
      plan.expectedQuestionIds.length !== 0 ||
      plan.eligibleAmbiguityQuestions.length !== 0 ||
      plan.questions.length !==
        Object.keys(templateCopilotV3SemanticFactSourceSlots).length - 3
    ) {
      throw new Error(`Invalid iterative round plan: ${plan.scenarioId}.`);
    }
    const scenarioFactSourceSlots =
      templateCopilotV3SemanticFactSourceSlotsForScenario(plan.scenarioId);
    const scenarioFactBatchIds =
      templateCopilotV3SemanticFactBatchIdsForScenario(plan.scenarioId);
    if (
      Object.keys(scenarioFactBatchIds).length !==
        Object.keys(templateCopilotV3SemanticFactSourceSlots).length ||
      JSON.stringify(plan.factBatchIds) !==
        JSON.stringify(scenarioFactBatchIds)
    ) {
      throw new Error(
        `Invalid fact recovery ownership: ${plan.scenarioId}.`,
      );
    }
    for (const question of plan.questions) {
      if (
        scenarioFactSourceSlots[question.factId] !==
          question.sourceSlot ||
        question.text.trim().length === 0 ||
        questionIds.has(question.questionId)
      ) {
        throw new Error(`Invalid iterative question: ${question.questionId}.`);
      }
      questionIds.add(question.questionId);
    }
  }
  for (const language of ["en", "zh-Hant", "zh-Hans"]) {
    const localized = plans.filter((plan) => plan.language === language);
    if (
      localized.length !== 8 ||
      templateCopilotV3SemanticInterviewSlots.some(
        (slot) =>
          localized.filter((plan) => plan.recoveryProbeSlot === slot).length !==
          1,
      )
    ) {
      throw new Error(`Invalid iterative locale rotation: ${language}.`);
    }
  }
  return true;
}

function sameStringArray(value, expected) {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

assertTemplateCopilotV3SemanticRoundPlans();
