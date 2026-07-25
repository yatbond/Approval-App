import {
  templateAuthoringContractVersion,
  templateDefinitionV1Schema,
  templateRequirementsDossierV1Schema,
  type TemplateDefinitionV1,
  type TemplateRequirementsDossierV1,
} from "./template-authoring-contracts.ts";
import {
  templateCopilotLocaleNames,
  templateCopilotPlanV1Schema,
  type TemplateCopilotLocale,
  type TemplateCopilotPlanV1,
} from "./template-copilot-plan.ts";
import type {
  WorkflowBranchType,
  WorkflowField,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "./types.ts";

type CompileTemplateCopilotPlanInput = {
  plan: TemplateCopilotPlanV1;
  businessUnitId: string;
  businessName: string;
  departmentId: string;
  departmentName: string;
  actorEmail: string;
  generatedAt: string;
  dossierId: string;
  templateId: string;
  sourceSummaries?: Array<{
    sectionId: string;
    summary: string;
    sourceMessageIds: string[];
  }>;
};

type CompiledArtifacts = {
  dossier: TemplateRequirementsDossierV1;
  definition: TemplateDefinitionV1;
};

const localized = {
  en: {
    start: "Start",
    submit: "Submit request",
    correction: "Return for correction",
    end: "Complete",
    join: "All parallel reviews complete",
    matched: "Condition applies",
    fallback: "Otherwise",
    approved: "Approved",
    rejected: "Rejected",
    continue: "Continue",
    notify: "Notify",
    completionNotice: "Completion notification",
    requestSummary: "Request summary",
    requestSummaryInstructions: "Describe the request and desired outcome.",
    formDetails: "Details",
    formDetailsInstructions: "Provide the required details.",
    requester: "Requester",
  },
  "zh-Hant": {
    start: "開始",
    submit: "提交申請",
    correction: "退回補正",
    end: "完成",
    join: "所有並行審查已完成",
    matched: "符合條件",
    fallback: "其他情況",
    approved: "已批准",
    rejected: "已拒絕",
    continue: "繼續",
    notify: "通知",
    completionNotice: "完成通知",
    requestSummary: "申請摘要",
    requestSummaryInstructions: "請說明申請內容及預期結果。",
    formDetails: "詳細資料",
    formDetailsInstructions: "請提供所需資料。",
    requester: "申請人",
  },
  "zh-Hans": {
    start: "开始",
    submit: "提交申请",
    correction: "退回补正",
    end: "完成",
    join: "所有并行审核已完成",
    matched: "符合条件",
    fallback: "其他情况",
    approved: "已批准",
    rejected: "已拒绝",
    continue: "继续",
    notify: "通知",
    completionNotice: "完成通知",
    requestSummary: "申请摘要",
    requestSummaryInstructions: "请说明申请内容及预期结果。",
    formDetails: "详细资料",
    formDetailsInstructions: "请提供所需资料。",
    requester: "申请人",
  },
} as const;

export function compileTemplateCopilotPlan(
  input: CompileTemplateCopilotPlanInput,
): CompiledArtifacts {
  const plan = templateCopilotPlanV1Schema.parse(input.plan);
  const ids = createIdFactory();
  const labels = localized[plan.locale];
  const requestFields = normalizeFields(plan.requestFields, ids, labels);
  const requestFieldByLabel = indexFieldsByLabel(requestFields);
  const attachmentRequirements = plan.attachments.map((attachment) => {
    const id = ids("attachment", attachment.label);
    const fields = normalizeFields(attachment.fields, ids, labels, id);
    return {
      id,
      label: attachment.label,
      description: [
        attachment.description,
        attachment.requiredWhen
          ? `${attachment.requiredWhen.label}: ${attachment.requiredWhen.fieldLabel} ${attachment.requiredWhen.operator} ${attachment.requiredWhen.value}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      required: attachment.required,
      inputMode: attachment.inputMode,
      acceptedFormats: unique(attachment.acceptedFormats),
      minimumFiles: attachment.required
        ? Math.max(1, attachment.minimumFiles)
        : Math.max(0, attachment.minimumFiles),
      maximumFiles: Math.max(
        attachment.required ? 1 : 0,
        attachment.minimumFiles,
        attachment.maximumFiles,
      ),
      maximumFileSizeMb: attachment.maximumFileSizeMb,
      fields:
        attachment.inputMode === "manual_form" && fields.length === 0
          ? [
              {
                id: ids("field", labels.formDetails),
                label: labels.formDetails,
                type: "long_text" as const,
                required: true,
                instructions: labels.formDetailsInstructions,
                source: "manual" as const,
              },
            ]
          : fields,
      allowSharedFulfillment: attachment.allowSharedFulfillment,
      requireSharedFulfillmentConfirmation:
        attachment.requireSharedFulfillmentConfirmation,
    };
  });
  const attachmentByLabel = new Map(
    attachmentRequirements.map((attachment) => [
      normalizeLookup(attachment.label),
      attachment.id,
    ]),
  );
  const documents = attachmentRequirements.map((attachment) => {
    const firstFormat =
      attachment.inputMode === "manual_form"
        ? ("text" as const)
        : attachment.acceptedFormats[0];
    return {
      id: attachment.id,
      documentType: attachment.label,
      format: firstFormat,
      inputMode: attachment.inputMode,
      required: attachment.required,
      fields: attachment.fields.map((field) =>
        workflowFieldFromDossierField(field, attachment.id),
      ),
    };
  });
  const allWorkflowFields = requestFields.map((field) =>
    workflowFieldFromDossierField(field),
  );
  const allFieldByLabel = indexWorkflowFieldsByLabel([
    ...allWorkflowFields,
    ...documents.flatMap((document) => document.fields),
  ]);

  const graphNodes: WorkflowGraphNode[] = [
    {
      id: "start",
      kind: "start",
      label: labels.start,
      x: 40,
      y: 160,
      blocking: true,
    },
    {
      id: "submit-request",
      kind: "submit_request",
      label: labels.submit,
      x: 280,
      y: 160,
      assigneeName: labels.requester,
      documentIds: documents.map((document) => document.id),
      allowSharedFulfillment:
        plan.collaboration.adHocContributors ||
        attachmentRequirements.some(
          (requirement) => requirement.allowSharedFulfillment,
        ),
      requireSharedFulfillmentConfirmation:
        plan.collaboration.confirmationPolicy !== "none" ||
        attachmentRequirements.some(
          (requirement) =>
            requirement.requireSharedFulfillmentConfirmation,
        ),
      blocking: true,
    },
    {
      id: "return-correction",
      kind: "return_reject",
      label: labels.correction,
      x: 760,
      y: 520,
      blocking: true,
    },
    {
      id: "end",
      kind: "end",
      label: labels.end,
      x: 1_600,
      y: 160,
      blocking: false,
    },
  ];
  const graphEdges: WorkflowGraphEdge[] = [];
  const dossierStageByNodeId = new Map<
    string,
    TemplateRequirementsDossierV1["stages"][number]
  >();
  dossierStageByNodeId.set("submit-request", {
    id: "submit-request",
    kind: "submit_request",
    label: labels.submit,
    description: plan.purpose,
    attachmentRequirementIds: attachmentRequirements.map((item) => item.id),
    blocking: true,
    assignee: { mode: "requester" },
    allowSharedFulfillment:
      plan.collaboration.adHocContributors ||
      attachmentRequirements.some((item) => item.allowSharedFulfillment),
    requireSharedFulfillmentConfirmation:
      plan.collaboration.confirmationPolicy !== "none" ||
      attachmentRequirements.some(
        (item) => item.requireSharedFulfillmentConfirmation,
      ),
  });
  dossierStageByNodeId.set("return-correction", {
    id: "return-correction",
    kind: "return_reject",
    label: labels.correction,
    description: plan.collaboration.rejectionCreatesCorrectionLoop
      ? labels.correction
      : plan.purpose,
    attachmentRequirementIds: [],
    blocking: true,
  });

  const compiledPhases = plan.phases.map((phase, phaseIndex) => {
    const stageNodes = phase.stages.map((stage, stageIndex) => {
      const nodeId = ids("stage", `${phase.label}-${stage.label}`);
      const resolver = normalizeParticipant(
        stage.participant,
        requestFieldByLabel,
      );
      const documentIds = resolveLabels(
        stage.attachmentLabels,
        attachmentByLabel,
      );
      const visibleFieldNames = resolveLabels(
        stage.visibleFieldLabels,
        allFieldByLabel,
      );
      const visibleDocumentIds = resolveLabels(
        stage.visibleDocumentLabels,
        attachmentByLabel,
      );
      const escalation = stage.escalationParticipant
        ? normalizeParticipant(
            stage.escalationParticipant,
            requestFieldByLabel,
          )
        : null;
      const node: WorkflowGraphNode = {
        id: nodeId,
        kind: stage.kind,
        label: stage.label,
        x: 560 + phaseIndex * 340,
        y:
          80 +
          stageIndex * 150 -
          ((phase.stages.length - 1) * 150) / 2,
        ...graphParticipant(resolver, labels.requester),
        dueInHours: stage.dueInHours,
        ...(escalation
          ? graphEscalationParticipant(escalation, labels.requester)
          : {}),
        documentIds,
        blocking: stage.kind !== "for_information",
        acknowledgementRequired: stage.acknowledgementRequired,
        handoffView: {
          fieldVisibility: {
            mode: stage.fieldVisibility,
            ...(stage.fieldVisibility === "selected"
              ? {
                  fieldNames:
                    visibleFieldNames.length > 0
                      ? visibleFieldNames
                      : allWorkflowFields.slice(0, 3).map((field) => field.name),
                }
              : {}),
          },
          documentVisibility: {
            mode: stage.documentVisibility,
            ...(stage.documentVisibility === "selected"
              ? {
                  documentIds:
                    visibleDocumentIds.length > 0
                      ? visibleDocumentIds
                      : documents.slice(0, 1).map((document) => document.id),
                }
              : {}),
          },
          layout:
            stage.fieldVisibility === "selected" ||
            stage.documentVisibility === "selected"
              ? "compact"
              : "standard",
        },
      };
      graphNodes.push(node);
      const dossierStageBase = {
        id: nodeId,
        label: stage.label,
        description: phase.label,
        attachmentRequirementIds: documentIds,
        blocking: stage.kind !== "for_information",
        assignee: resolver,
      };
      dossierStageByNodeId.set(
        nodeId,
        stage.kind === "for_information"
          ? {
              ...dossierStageBase,
              kind: "for_information",
              blocking: false,
              acknowledgementRequired: stage.acknowledgementRequired,
            }
          : {
              ...dossierStageBase,
              kind: "approval",
              dueInHours: stage.dueInHours,
              ...(escalation ? { escalationAssignee: escalation } : {}),
              acknowledgementRequired: stage.acknowledgementRequired,
            },
      );
      return { plan: stage, node };
    });
    return { plan: phase, stageNodes };
  });

  const hasExplicitFyiStage = compiledPhases.some((phase) =>
    phase.stageNodes.some((stage) => stage.node.kind === "for_information"),
  );
  const synthesizedCompletionNoticeNodeIds: string[] = [];
  if (
    plan.notifications.events.includes("completed") &&
    !hasExplicitFyiStage
  ) {
    const noticeId = ids("stage", labels.completionNotice);
    graphNodes.push({
      id: noticeId,
      kind: "for_information",
      label: labels.completionNotice,
      x: 1_360,
      y: 360,
      assigneeName: labels.requester,
      documentIds: documents.map((document) => document.id),
      blocking: false,
      acknowledgementRequired: false,
      handoffView: {
        fieldVisibility: { mode: "all" },
        documentVisibility: { mode: "all" },
        layout: "standard",
      },
    });
    dossierStageByNodeId.set(noticeId, {
      id: noticeId,
      kind: "for_information",
      label: labels.completionNotice,
      description: labels.completionNotice,
      attachmentRequirementIds: attachmentRequirements.map(
        (requirement) => requirement.id,
      ),
      blocking: false,
      assignee: { mode: "requester" },
      acknowledgementRequired: false,
    });
    synthesizedCompletionNoticeNodeIds.push(noticeId);
  }

  let nextTargetIds = ["end"];
  let pendingFyiNodeIds = synthesizedCompletionNoticeNodeIds;
  for (let phaseIndex = compiledPhases.length - 1; phaseIndex >= 0; phaseIndex -= 1) {
    const phase = compiledPhases[phaseIndex];
    const fyiNodes = phase.stageNodes
      .filter((stage) => stage.node.kind === "for_information")
      .map((stage) => stage.node.id);
    const blockingNodes = phase.stageNodes.filter(
      (stage) => stage.node.kind !== "for_information",
    );
    pendingFyiNodeIds = [...fyiNodes, ...pendingFyiNodeIds];
    if (blockingNodes.length === 0) continue;

    let entryTargetIds: string[];
    let exitSourceIds: string[];
    if (phase.plan.execution === "parallel" && blockingNodes.length > 1) {
      const joinId = ids("condition", `${phase.plan.label}-join`);
      const joinNode: WorkflowGraphNode = {
        id: joinId,
        kind: "condition",
        label: labels.join,
        x: 780 + phaseIndex * 340,
        y: 160,
        blocking: true,
        conditionCases: [
          {
            id: ids("case", `${phase.plan.label}-all-approved`),
            name: labels.approved,
            isApprovalCount: true,
            approvalRule: {
              upstreamNodeIds: blockingNodes.map((stage) => stage.node.id),
              minimumApproved: blockingNodes.length,
              mode: "at_least",
            },
            join: "and",
            targetNodeIds: nextTargetIds,
          },
          {
            id: ids("case", `${phase.plan.label}-not-approved`),
            name: labels.fallback,
            isFallback: true,
            join: "and",
            targetNodeIds: ["return-correction"],
          },
        ],
      };
      graphNodes.push(joinNode);
      dossierStageByNodeId.set(joinId, {
        id: joinId,
        kind: "condition",
        label: labels.join,
        description: phase.plan.label,
        attachmentRequirementIds: [],
        blocking: true,
      });
      blockingNodes.forEach((stage) => {
        addEdge(graphEdges, ids, {
          sourceId: stage.node.id,
          targetId: joinId,
          label: labels.approved,
          branchType: "approved",
        });
        addRejectionEdge(graphEdges, ids, stage.node.id, labels);
      });
      connectTargets(graphEdges, ids, joinId, nextTargetIds, labels.continue);
      entryTargetIds = blockingNodes.map((stage) => stage.node.id);
      exitSourceIds = [joinId];
    } else {
      const ordered = blockingNodes;
      for (let index = 0; index < ordered.length - 1; index += 1) {
        addEdge(graphEdges, ids, {
          sourceId: ordered[index].node.id,
          targetId: ordered[index + 1].node.id,
          label: labels.approved,
          branchType: "approved",
        });
        addRejectionEdge(graphEdges, ids, ordered[index].node.id, labels);
      }
      const last = ordered.at(-1);
      if (!last) continue;
      connectTargets(
        graphEdges,
        ids,
        last.node.id,
        nextTargetIds,
        labels.approved,
        "approved",
      );
      addRejectionEdge(graphEdges, ids, last.node.id, labels);
      entryTargetIds = [ordered[0].node.id];
      exitSourceIds = [last.node.id];
    }

    for (const sourceId of exitSourceIds) {
      for (const fyiId of pendingFyiNodeIds) {
        addEdge(graphEdges, ids, {
          sourceId,
          targetId: fyiId,
          label: labels.notify,
          branchType: "for_information",
          blocking: false,
        });
      }
    }
    pendingFyiNodeIds = [];

    if (phase.plan.condition) {
      const conditionFieldName = ensureConditionField({
        condition: phase.plan.condition,
        requestFields,
        requestFieldByLabel,
        allWorkflowFields,
        allFieldByLabel,
        ids,
        labels,
      });
      const conditionId = ids("condition", phase.plan.label);
      const conditionNode: WorkflowGraphNode = {
        id: conditionId,
        kind: "condition",
        label: phase.plan.condition.label,
        x: 440 + phaseIndex * 340,
        y: 160,
        blocking: true,
        conditionCases: [
          {
            id: ids("case", `${phase.plan.label}-matched`),
            name: labels.matched,
            numericRule: {
              field: conditionFieldName,
              operator: phase.plan.condition.operator,
              value: phase.plan.condition.value,
            },
            join: phase.plan.condition.join,
            targetNodeIds: entryTargetIds,
          },
          {
            id: ids("case", `${phase.plan.label}-fallback`),
            name: labels.fallback,
            isFallback: true,
            join: "and",
            targetNodeIds: nextTargetIds,
          },
        ],
      };
      graphNodes.push(conditionNode);
      dossierStageByNodeId.set(conditionId, {
        id: conditionId,
        kind: "condition",
        label: phase.plan.condition.label,
        description: `${phase.plan.condition.fieldLabel} ${phase.plan.condition.operator} ${phase.plan.condition.value}`,
        attachmentRequirementIds: [],
        blocking: true,
      });
      for (const targetId of entryTargetIds) {
        addEdge(graphEdges, ids, {
          sourceId: conditionId,
          targetId,
          label: labels.matched,
          branchType: "condition",
          rule: {
            field: conditionFieldName,
            operator: phase.plan.condition.operator,
            value: phase.plan.condition.value,
            join: phase.plan.condition.join,
          },
        });
      }
      connectTargets(
        graphEdges,
        ids,
        conditionId,
        nextTargetIds,
        labels.fallback,
        "condition",
      );
      nextTargetIds = [conditionId];
    } else {
      nextTargetIds = entryTargetIds;
    }
  }

  addEdge(graphEdges, ids, {
    sourceId: "start",
    targetId: "submit-request",
    label: labels.start,
    branchType: "main",
  });
  connectTargets(
    graphEdges,
    ids,
    "submit-request",
    nextTargetIds,
    labels.continue,
  );
  for (const fyiId of pendingFyiNodeIds) {
    addEdge(graphEdges, ids, {
      sourceId: "submit-request",
      targetId: fyiId,
      label: labels.notify,
      branchType: "for_information",
      blocking: false,
    });
  }

  layoutGraph(graphNodes);
  const dossierRoutes = graphEdges
    .filter(
      (edge) =>
        dossierStageByNodeId.has(edge.sourceId) &&
        dossierStageByNodeId.has(edge.targetId),
    )
    .map((edge) => ({
      id: edge.id,
      sourceStageId: edge.sourceId,
      targetStageId: edge.targetId,
      label: edge.label,
      type: edge.branchType,
      ...(edge.branchType === "condition"
        ? {
            condition: edge.rule
              ? {
                  fieldId: edge.rule.field,
                  operator: edge.rule.operator,
                  value: edge.rule.value,
                  join: edge.rule.join || "and",
                  fallback: false,
                }
              : {
                  join: "and" as const,
                  fallback: true,
                },
          }
        : {}),
      blocking: edge.blocking !== false,
    }));
  if (dossierRoutes.length === 0) {
    dossierRoutes.push({
      id: ids("route", "submit-correction"),
      sourceStageId: "submit-request",
      targetStageId: "return-correction",
      label: labels.rejected,
      type: "rejected",
      blocking: true,
    });
  }

  const sourceAssumptions = (input.sourceSummaries || [])
    .filter((item) => item.summary.trim())
    .map((item) => ({
      id: ids("source", item.sectionId),
      statement: item.summary.slice(0, 4_000),
      status: "confirmed" as const,
    }));
  const dossier = templateRequirementsDossierV1Schema.parse({
    schemaVersion: templateAuthoringContractVersion,
    dossierId: input.dossierId,
    title: plan.title,
    purpose: plan.purpose,
    businessScope: {
      businessId: input.businessUnitId,
      businessName: input.businessName,
      departmentId: input.departmentId,
      departmentName: input.departmentName,
      ...(plan.governance.processOwnerEmail
        ? { processOwnerEmail: plan.governance.processOwnerEmail }
        : {}),
      dataClassification: plan.dataClassification,
    },
    initiation: {
      allowedInitiators: plan.allowedInitiators,
      initiatorRoles: plan.initiatorRoles,
      initiatorEmails: plan.initiatorEmails,
      requestFields,
    },
    attachmentRequirements,
    stages: [...dossierStageByNodeId.values()],
    routes: dossierRoutes,
    collaboration: plan.collaboration,
    notifications: {
      ...plan.notifications,
      events: unique(plan.notifications.events),
    },
    governance: {
      publishMode: plan.governance.publishMode,
      reviewerEmails: plan.governance.reviewerEmails,
      policyReferences: plan.governance.policyReferences,
      retentionDays: plan.governance.retentionDays,
      changeReasonRequired: plan.governance.changeReasonRequired,
    },
    assumptions: [
      ...plan.assumptions.map((assumption) => ({
        id: ids("assumption", assumption.statement),
        statement: assumption.statement,
        status: assumption.status,
      })),
      ...sourceAssumptions,
    ].slice(0, 100),
    openQuestions: plan.openQuestions.map((question) => ({
      id: ids("question", question.question),
      question: question.question,
      importance: question.importance,
      ...(question.answer ? { answer: question.answer } : {}),
    })),
  });

  const template: WorkflowTemplate = {
    id: input.templateId,
    name: plan.title,
    business: input.businessName,
    department: input.departmentName,
    version: 1,
    isDraft: true,
    documentTypes: documents.map((document) => document.documentType),
    documents,
    languages: unique([
      templateCopilotLocaleNames[plan.locale],
      ...(plan.locale === "en" ? [] : ["English"]),
    ]),
    fields: allWorkflowFields,
    steps: [],
    graph: { nodes: graphNodes, edges: graphEdges },
  };
  const unresolvedQuestionIds = dossier.openQuestions
    .filter((question) => !question.answer?.trim())
    .map((question) => question.id);
  const definition = templateDefinitionV1Schema.parse({
    schemaVersion: templateAuthoringContractVersion,
    sourceDossierId: dossier.dossierId,
    template,
    generation: {
      mode: "copilot",
      generatedAt: input.generatedAt,
      generatedByEmail: input.actorEmail,
      unresolvedQuestionIds,
    },
  });
  return { dossier, definition };
}

function normalizeFields(
  fields: TemplateCopilotPlanV1["requestFields"],
  ids: ReturnType<typeof createIdFactory>,
  labels: (typeof localized)[TemplateCopilotLocale],
  documentId?: string,
) {
  const sourceFields =
    fields.length > 0
      ? fields
      : [
          {
            label: documentId ? labels.formDetails : labels.requestSummary,
            type: "long_text" as const,
            required: true,
            instructions: documentId
              ? labels.formDetailsInstructions
              : labels.requestSummaryInstructions,
            placeholder: "",
            options: [],
            source: "manual" as const,
          },
        ];
  return sourceFields.map((field) => {
    const hasChoices = field.options.some((option) => option.trim());
    const type =
      ["select", "radio", "checkbox"].includes(field.type) && !hasChoices
        ? ("text" as const)
        : field.type;
    return {
      id: ids(documentId ? `document-field-${documentId}` : "field", field.label),
      label: field.label,
      type,
      required: field.required,
      instructions: field.instructions,
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(["select", "radio", "checkbox"].includes(type)
        ? { options: unique(field.options) }
        : {}),
      source: field.source,
    };
  });
}

function workflowFieldFromDossierField(
  field: TemplateRequirementsDossierV1["initiation"]["requestFields"][number],
  documentId?: string,
): WorkflowField {
  return {
    name: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    source: field.source,
    instructions: field.instructions,
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(documentId ? { documentId } : {}),
    inputSource:
      documentId && field.source !== "manual"
        ? "attachment_extraction"
        : "approval_app",
  };
}

function normalizeParticipant(
  participant: TemplateCopilotPlanV1["phases"][number]["stages"][number]["participant"],
  requestFieldByLabel: Map<string, string>,
) {
  if (participant.mode === "fixed_email" && participant.email) {
    return { mode: "fixed_email" as const, email: participant.email };
  }
  if (
    participant.mode === "directory_position" &&
    participant.directoryPosition
  ) {
    return {
      mode: "directory_position" as const,
      directoryPosition: participant.directoryPosition,
    };
  }
  if (participant.mode === "request_field") {
    const requestFieldId = requestFieldByLabel.get(
      normalizeLookup(participant.requestFieldLabel),
    );
    if (requestFieldId) {
      return { mode: "request_field" as const, requestFieldId };
    }
  }
  if (participant.mode === "requester") {
    return { mode: "requester" as const };
  }
  return { mode: "unassigned_at_template" as const };
}

function graphParticipant(
  resolver: ReturnType<typeof normalizeParticipant>,
  requesterLabel: string,
) {
  if (resolver.mode === "fixed_email") {
    return {
      assigneeName: resolver.email.split("@")[0],
      assigneeEmail: resolver.email,
      assigneeEmailFixed: true,
    };
  }
  if (resolver.mode === "directory_position") {
    return {
      assigneeName: resolver.directoryPosition,
      assigneeEmail: "",
      assigneeEmailFixed: false,
    };
  }
  if (resolver.mode === "request_field") {
    return {
      assigneeName: resolver.requestFieldId,
      assigneeEmail: "",
      assigneeEmailFixed: false,
    };
  }
  return {
    assigneeName:
      resolver.mode === "requester" ? requesterLabel : "",
    assigneeEmail: "",
    assigneeEmailFixed: false,
  };
}

function graphEscalationParticipant(
  resolver: ReturnType<typeof normalizeParticipant>,
  requesterLabel: string,
) {
  const participant = graphParticipant(resolver, requesterLabel);
  return {
    escalationName: participant.assigneeName,
    escalationEmail: participant.assigneeEmail,
    escalationEmailFixed: participant.assigneeEmailFixed,
  };
}

function ensureConditionField({
  condition,
  requestFields,
  requestFieldByLabel,
  allWorkflowFields,
  allFieldByLabel,
  ids,
  labels,
}: {
  condition: NonNullable<TemplateCopilotPlanV1["phases"][number]["condition"]>;
  requestFields: TemplateRequirementsDossierV1["initiation"]["requestFields"];
  requestFieldByLabel: Map<string, string>;
  allWorkflowFields: WorkflowField[];
  allFieldByLabel: Map<string, string>;
  ids: ReturnType<typeof createIdFactory>;
  labels: (typeof localized)[TemplateCopilotLocale];
}) {
  const normalized = normalizeLookup(condition.fieldLabel);
  const existing =
    requestFieldByLabel.get(normalized) || allFieldByLabel.get(normalized);
  if (existing) return existing;
  const id = ids("field", condition.fieldLabel);
  const type = ["contains", "=", "!="].includes(condition.operator)
    ? ("text" as const)
    : ("number" as const);
  const dossierField = {
    id,
    label: condition.fieldLabel || labels.requestSummary,
    type,
    required: true,
    instructions: condition.label,
    source: "manual" as const,
  };
  requestFields.push(dossierField);
  requestFieldByLabel.set(normalized, id);
  allWorkflowFields.push(workflowFieldFromDossierField(dossierField));
  allFieldByLabel.set(normalized, id);
  return id;
}

function addRejectionEdge(
  edges: WorkflowGraphEdge[],
  ids: ReturnType<typeof createIdFactory>,
  sourceId: string,
  labels: (typeof localized)[TemplateCopilotLocale],
) {
  addEdge(edges, ids, {
    sourceId,
    targetId: "return-correction",
    label: labels.rejected,
    branchType: "rejected",
  });
}

function connectTargets(
  edges: WorkflowGraphEdge[],
  ids: ReturnType<typeof createIdFactory>,
  sourceId: string,
  targetIds: string[],
  label: string,
  branchType: WorkflowBranchType = "main",
) {
  targetIds.forEach((targetId) =>
    addEdge(edges, ids, {
      sourceId,
      targetId,
      label,
      branchType,
    }),
  );
}

function addEdge(
  edges: WorkflowGraphEdge[],
  ids: ReturnType<typeof createIdFactory>,
  edge: Omit<WorkflowGraphEdge, "id">,
) {
  const signature = `${edge.sourceId}-${edge.targetId}-${edge.branchType}-${edge.label}`;
  if (
    edges.some(
      (existing) =>
        existing.sourceId === edge.sourceId &&
        existing.targetId === edge.targetId &&
        existing.branchType === edge.branchType &&
        existing.label === edge.label,
    )
  ) {
    return;
  }
  edges.push({ id: ids("edge", signature), ...edge });
}

function layoutGraph(nodes: WorkflowGraphNode[]) {
  const start = nodes.find((node) => node.id === "start");
  const submit = nodes.find((node) => node.id === "submit-request");
  const end = nodes.find((node) => node.id === "end");
  if (start) Object.assign(start, { x: 40, y: 180 });
  if (submit) Object.assign(submit, { x: 280, y: 180 });
  const workflowNodes = nodes.filter(
    (node) =>
      !["start", "submit-request", "return-correction", "end"].includes(
        node.id,
      ),
  );
  workflowNodes.forEach((node, index) => {
    node.x = 560 + Math.floor(index / 4) * 300;
    node.y = 40 + (index % 4) * 150;
  });
  const maxX = Math.max(560, ...workflowNodes.map((node) => node.x));
  if (end) Object.assign(end, { x: maxX + 360, y: 180 });
  const correction = nodes.find((node) => node.id === "return-correction");
  if (correction) Object.assign(correction, { x: maxX + 60, y: 720 });
}

function indexFieldsByLabel(
  fields: TemplateRequirementsDossierV1["initiation"]["requestFields"],
) {
  return new Map(
    fields.map((field) => [normalizeLookup(field.label), field.id]),
  );
}

function indexWorkflowFieldsByLabel(fields: WorkflowField[]) {
  return new Map(
    fields.map((field) => [normalizeLookup(field.label), field.name]),
  );
}

function resolveLabels(labels: string[], index: Map<string, string>) {
  return unique(
    labels
      .map((label) => index.get(normalizeLookup(label)))
      .filter((value): value is string => Boolean(value)),
  );
}

function normalizeLookup(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\-_/（）()，,。.：:；;]+/gu, "");
}

function createIdFactory() {
  const used = new Set<string>();
  return (prefix: string, value: string) => {
    const base = `${slug(prefix)}-${slug(value)}`.slice(0, 112);
    let candidate = base || `${slug(prefix)}-item`;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base.slice(0, 106)}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  };
}

function slug(value: string) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (ascii) return ascii;
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `u${(hash >>> 0).toString(36)}`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
