import type {
  TemplateDefinitionV1,
  TemplateRequirementsDossierV1,
} from "./template-authoring-contracts.ts";
import { workflowTemplateFromDefinition } from "./template-authoring-definition.ts";
import {
  createWorkflowGraphFromTemplate,
  findInitialWorkflowRoute,
  validateWorkflowTemplate,
} from "./workflow-graph.ts";

export type TemplateAuthoringValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
  nodeId?: string;
  edgeId?: string;
};

export type TemplateAuthoringValidationSummary = {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  issues: TemplateAuthoringValidationIssue[];
};

export function validateTemplateAuthoringDefinition({
  dossier,
  definition,
}: {
  dossier: TemplateRequirementsDossierV1;
  definition: TemplateDefinitionV1;
}): TemplateAuthoringValidationSummary {
  const issues: TemplateAuthoringValidationIssue[] = [];

  if (definition.sourceDossierId !== dossier.dossierId) {
    issues.push({
      code: "source_dossier_mismatch",
      severity: "error",
      path: "definition.sourceDossierId",
      message: "The executable definition does not reference this dossier.",
    });
  }

  const unansweredBlockingQuestions = dossier.openQuestions.filter(
    (question) => question.importance === "blocking" && !question.answer?.trim(),
  );
  unansweredBlockingQuestions.forEach((question) => {
    issues.push({
      code: "blocking_question_unanswered",
      severity: "error",
      path: `dossier.openQuestions.${question.id}`,
      message: question.question,
    });
  });

  const unresolvedQuestionIds = new Set(
    definition.generation.unresolvedQuestionIds,
  );
  dossier.openQuestions.forEach((question) => {
    const isAnswered = Boolean(question.answer?.trim());
    if (!isAnswered && !unresolvedQuestionIds.has(question.id)) {
      issues.push({
        code: "untracked_open_question",
        severity: "warning",
        path: `dossier.openQuestions.${question.id}`,
        message: `Open question ${question.id} is not tracked by the definition.`,
      });
    }
  });
  unresolvedQuestionIds.forEach((questionId) => {
    if (!dossier.openQuestions.some((question) => question.id === questionId)) {
      issues.push({
        code: "unknown_unresolved_question",
        severity: "error",
        path: "definition.generation.unresolvedQuestionIds",
        message: `Unknown unresolved question: ${questionId}.`,
      });
    }
  });

  const assumedWithoutConfirmation = dossier.assumptions.filter(
    (assumption) => assumption.status === "proposed",
  );
  assumedWithoutConfirmation.forEach((assumption) => {
    issues.push({
      code: "unconfirmed_assumption",
      severity: "warning",
      path: `dossier.assumptions.${assumption.id}`,
      message: assumption.statement,
    });
  });

  const template = workflowTemplateFromDefinition(definition);
  validateWorkflowTemplate(template).forEach((issue) => {
    issues.push({
      code: "workflow_validation",
      severity: issue.severity,
      message: issue.message,
      nodeId: issue.nodeId,
      edgeId: issue.edgeId,
    });
  });

  const graph = createWorkflowGraphFromTemplate(template);
  const hasMissingFixedEmail = graph.nodes.some(
    (node) =>
      (node.assigneeEmailFixed === true && !node.assigneeEmail?.trim()) ||
      (node.escalationEmailFixed === true && !node.escalationEmail?.trim()),
  );
  if (hasMissingFixedEmail) {
    issues.push({
      code: "fixed_participant_missing",
      severity: "error",
      message: "A fixed participant or escalation owner is missing an email.",
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    issues,
  };
}

export function simulateTemplateAuthoringDefinition({
  dossier,
  definition,
  extractedFields = {},
  nodeDecisions = {},
}: {
  dossier: TemplateRequirementsDossierV1;
  definition: TemplateDefinitionV1;
  extractedFields?: Record<string, string>;
  nodeDecisions?: Record<string, "approved" | "rejected">;
}) {
  const template = workflowTemplateFromDefinition(definition);
  const graph = createWorkflowGraphFromTemplate(template);
  const route = findInitialWorkflowRoute(graph, {
    extractedFields,
    nodeDecisions,
    allowAmbiguousCondition: true,
    allowUnassignedActionNodes: true,
  });

  return {
    validation: validateTemplateAuthoringDefinition({ dossier, definition }),
    route: {
      currentNodeIds: route.currentNodes.map((node) => node.id),
      notifiedNodeIds: route.notifiedNodes.map((node) => node.id),
      traversedNodeIds: route.routeNodes.map((node) => node.id),
      terminalNodeId: route.terminalNode?.id || null,
      activeBranchId: route.activeBranchId || null,
    },
  };
}

export function diffTemplateDefinitions(
  before: TemplateDefinitionV1,
  after: TemplateDefinitionV1,
) {
  const changes: Array<{
    path: string;
    kind: "added" | "removed" | "changed";
    before?: unknown;
    after?: unknown;
  }> = [];
  collectDiff(before, after, "$", changes);
  return {
    changed: changes.length > 0,
    changeCount: changes.length,
    changes: changes.slice(0, 500),
    truncated: changes.length > 500,
  };
}

function collectDiff(
  before: unknown,
  after: unknown,
  path: string,
  changes: Array<{
    path: string;
    kind: "added" | "removed" | "changed";
    before?: unknown;
    after?: unknown;
  }>,
) {
  if (Object.is(before, after)) {
    return;
  }
  if (changes.length > 500) {
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      collectDiff(before[index], after[index], `${path}[${index}]`, changes);
    }
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      collectDiff(before[key], after[key], `${path}.${key}`, changes);
    }
    return;
  }
  changes.push({
    path,
    kind:
      before === undefined
        ? "added"
        : after === undefined
          ? "removed"
          : "changed",
    before,
    after,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
