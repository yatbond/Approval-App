import {
  templateCopilotFactDefinitions,
  templateCopilotFactIds,
  templateCopilotV2LedgerSchema,
  type TemplateCopilotFactId,
  type TemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";
import { compileTemplateCopilotPlan } from "./template-copilot-compiler.ts";
import {
  templateCopilotV2AttachmentRequirementsSchema,
  templateCopilotV2ConditionRulesSchema,
  templateCopilotV2NotificationRulesSchema,
  validateTemplateCopilotV2CommittedStrictStructures,
} from "./template-copilot-v2-structured-facts.ts";
import {
  templateDefinitionV1Schema,
  templateRequirementsDossierV1Schema,
} from "./template-authoring-contracts.ts";
import {
  templateCopilotPlanV1Schema,
  type TemplateCopilotPlanV1,
} from "./template-copilot-plan.ts";

export type TemplateCopilotV2DraftCompilerIssue = Readonly<{
  factId: TemplateCopilotFactId;
  code: string;
  message: string;
  blockingLevel: "draft" | "publication";
}>;

export class TemplateCopilotV2DraftCompilerError extends Error {
  readonly issues: readonly TemplateCopilotV2DraftCompilerIssue[];

  constructor(issues: readonly TemplateCopilotV2DraftCompilerIssue[]) {
    super("The committed facts cannot be compiled into an executable draft.");
    this.name = "TemplateCopilotV2DraftCompilerError";
    this.issues = Object.freeze([...issues]);
  }
}

export function validateTemplateCopilotV2DraftCompilation(
  ledgerInput: TemplateCopilotV2Ledger,
  options: {
    inapplicableFactIds?: readonly TemplateCopilotFactId[];
  } = {},
) {
  const ledger = templateCopilotV2LedgerSchema.parse(ledgerInput);
  const issues: TemplateCopilotV2DraftCompilerIssue[] = [];
  const inapplicable = new Set(options.inapplicableFactIds || []);
  for (const factId of templateCopilotFactIds) {
    const fact = ledger.facts[factId];
    if (inapplicable.has(factId)) continue;
    if (
      fact.status !== "committed" &&
      fact.status !== "not_applicable"
    ) {
      issues.push({
        factId,
        code: "fact_not_committed",
        message: "This fact still needs an explicit human decision.",
        blockingLevel:
          templateCopilotFactDefinitions[factId].blockingLevel === "draft"
            ? "draft"
            : "publication",
      });
    }
  }
  for (const item of validateTemplateCopilotV2CommittedStrictStructures(ledger)) {
    if (inapplicable.has(item.factId)) continue;
    issues.push({
      factId: item.factId,
      code: item.code,
      message: item.message,
      blockingLevel: "publication",
    });
  }
  const attachments = inapplicable.has("attachments.requirements")
    ? []
    : strictValue(
        ledger,
        "attachments.requirements",
        templateCopilotV2AttachmentRequirementsSchema,
      );
  if (attachments) {
    for (const attachment of attachments) {
      if (attachment.kind === "form") {
        issues.push({
          factId: "attachments.requirements",
          code: "form_fields_required",
          message:
            `The in-app form "${attachment.label}" needs its field definitions before an executable draft can be created.`,
          blockingLevel: "draft",
        });
      }
    }
  }
  const rejection = committedRecord(ledger, "workflow.rejection_policy");
  if (rejection?.action === "route_to_stage") {
    issues.push({
      factId: "workflow.rejection_policy",
      code: "unsupported_rejection_route",
      message:
        "A custom rejection destination needs explicit visual-builder review before compilation.",
      blockingLevel: "draft",
    });
  }
  const stages = committedArray(ledger, "workflow.stages");
  const actionableStages = stages.filter(
    (item) => record(item)?.kind !== "submission",
  );
  const submissionStages = stages.filter(
    (item) => record(item)?.kind === "submission",
  );
  if (submissionStages.length > 0) {
    issues.push({
      factId: "workflow.stages",
      code: "named_submission_stage_requires_review",
      message:
        "Named submission stages need explicit attachment and handoff mapping in the visual builder.",
      blockingLevel: "draft",
    });
  }
  if (actionableStages.length === 0) {
    issues.push({
      factId: "workflow.stages",
      code: "missing_actionable_stage",
      message: "At least one approval, review, or FYI stage is required.",
      blockingLevel: "draft",
    });
  }
  const retention = committedRecord(ledger, "governance.retention");
  if (retention && !retentionDays(String(retention.period || ""))) {
    issues.push({
      factId: "governance.retention",
      code: "unsupported_retention_period",
      message:
        "Use an explicit retention period in days, months, or years before compilation.",
      blockingLevel: "draft",
    });
  }
  const conditions = inapplicable.has("workflow.conditions")
    ? []
    : strictValue(
        ledger,
        "workflow.conditions",
        templateCopilotV2ConditionRulesSchema,
      );
  if (conditions) {
    const byTarget = new Map<string, number>();
    for (const condition of conditions) {
      if (
        condition.matchingRoute.startsWith("condition:") ||
        condition.otherwiseRoute.startsWith("condition:") ||
        condition.otherwiseRoute === "return_for_correction"
      ) {
        issues.push({
          factId: "workflow.conditions",
          code: "nonlinear_condition_requires_review",
          message:
            `Rule "${condition.id}" uses a non-linear route that needs visual-builder review.`,
          blockingLevel: "publication",
        });
      }
      byTarget.set(
        condition.matchingRoute,
        (byTarget.get(condition.matchingRoute) || 0) + 1,
      );
    }
    if ([...byTarget.values()].some((count) => count > 1)) {
      issues.push({
        factId: "workflow.conditions",
        code: "multiple_rules_per_phase",
        message:
          "Multiple rules targeting one phase need explicit visual-builder review.",
        blockingLevel: "publication",
      });
    }
    const stagesBySequence = new Map<
      number,
      Array<Record<string, unknown>>
    >();
    for (const stage of actionableStages) {
      const row = record(stage);
      if (!row) continue;
      const sequence = Number(row.sequence);
      stagesBySequence.set(sequence, [
        ...(stagesBySequence.get(sequence) || []),
        row,
      ]);
    }
    const orderedGroups = [...stagesBySequence.entries()].sort(
      ([left], [right]) => left - right,
    );
    for (const condition of conditions) {
      const groupIndex = orderedGroups.findIndex(
        ([, group]) =>
          condition.matchingRoute === `stage:${String(group[0]?.label || "")}`,
      );
      if (groupIndex < 0) {
        issues.push({
          factId: "workflow.conditions",
          code: "condition_target_not_compilable",
          message:
            `Rule "${condition.id}" does not target the first stage of a deterministic phase.`,
          blockingLevel: "publication",
        });
        continue;
      }
      const group = orderedGroups[groupIndex][1];
      if (group.length > 1) {
        issues.push({
          factId: "workflow.conditions",
          code: "condition_targets_parallel_member",
          message:
            `Rule "${condition.id}" targets one member of a simultaneous group and needs explicit branch design.`,
          blockingLevel: "publication",
        });
      }
      const nextLabel = orderedGroups[groupIndex + 1]?.[1][0]?.label;
      const expectedOtherwise = nextLabel
        ? `stage:${String(nextLabel)}`
        : "complete";
      if (condition.otherwiseRoute !== expectedOtherwise) {
        issues.push({
          factId: "workflow.conditions",
          code: "condition_fallback_order_mismatch",
          message:
            `Rule "${condition.id}" must otherwise continue to ${expectedOtherwise} before it can be compiled deterministically.`,
          blockingLevel: "publication",
        });
      }
    }
  }
  const timing = committedRecord(ledger, "timing.rules");
  if (
    !inapplicable.has("timing.rules") &&
    typeof timing?.defaultDueHours !== "number"
  ) {
    issues.push({
      factId: "timing.rules",
      code: "due_time_requires_review",
      message:
        "Choose an exact due time before this draft can be published. The editable draft uses a visibly blocked 48-hour scaffold only.",
      blockingLevel: "publication",
    });
  }
  if (!inapplicable.has("timing.rules") && timing?.escalation) {
    issues.push({
      factId: "timing.rules",
      code: "escalation_requires_review",
      message:
        "The late-work action needs a structured person and timing mapping in the visual builder before publication.",
      blockingLevel: "publication",
    });
  }
  if (
    !inapplicable.has("visibility.policy") &&
    !supportedVisibilityPolicy(
      committedRecord(ledger, "visibility.policy"),
    )
  ) {
    issues.push({
      factId: "visibility.policy",
      code: "visibility_requires_review",
      message:
        "Confirm exact field and document visibility for each stage in the visual builder before publication.",
      blockingLevel: "publication",
    });
  }
  if (
    !inapplicable.has("notifications.rules") &&
    ledger.facts["notifications.rules"].status !== "not_applicable" &&
    (strictValue(
      ledger,
      "notifications.rules",
      templateCopilotV2NotificationRulesSchema,
    ) || []).length > 0
  ) {
    issues.push({
      factId: "notifications.rules",
      code: "notification_delivery_requires_review",
      message:
        "Confirm each notification's recipients, channel, timing, stage, and visibility in the visual builder before publication.",
      blockingLevel: "publication",
    });
  }
  if (
    attachments?.some(
      (item) => item.confirmationPolicy !== "none",
    )
  ) {
    issues.push({
      factId: "collaboration.policy",
      code: "confirmation_owner_requires_review",
      message:
        "Requester confirmation and stage-owner confirmation cannot be collapsed into one rule; confirm each shared submission in the visual builder.",
      blockingLevel: "publication",
    });
  }
  const initiator = committedRecord(ledger, "request.initiator_policy");
  if (
    !inapplicable.has("request.initiator_policy") &&
    initiator?.mode === "requester_selected"
  ) {
    issues.push({
      factId: "request.initiator_policy",
      code: "requester_selected_initiator_requires_review",
      message:
        "Requester-selected initiation needs an explicit safe initiator mapping in the visual builder before publication.",
      blockingLevel: "publication",
    });
  }
  if (
    !inapplicable.has("request.initiator_policy") &&
    initiator?.mode === "directory_role" &&
    !initiatorRoleMapping(initiator.description)
  ) {
    issues.push({
      factId: "request.initiator_policy",
      code: "initiator_roles_require_review",
      message:
        "Confirm directory roles using the exact form roles:Role A|Role B before publication; free prose cannot be split safely.",
      blockingLevel: "publication",
    });
  }
  try {
    templateCopilotPlanV1Schema.parse(
      planFromLedger(
        ledger,
        inapplicable,
        issues.filter((item) => item.blockingLevel === "publication"),
      ),
    );
  } catch (error) {
    if (error instanceof TemplateCopilotV2DraftCompilerError) {
      issues.push(...error.issues);
    } else {
      issues.push({
        factId: "workflow.stages",
        code: "plan_contract_invalid",
        message:
          "The committed facts do not satisfy the deterministic executable-plan contract.",
        blockingLevel: "draft",
      });
    }
  }
  return Object.freeze(dedupeIssues(issues));
}

export function compileTemplateCopilotV2AuthoringArtifacts({
  ledger: ledgerInput,
  actorEmail,
  generatedAt,
  dossierId,
  templateId,
  sourceSessionId,
  sourceSessionRevision,
  inapplicableFactIds = [],
}: {
  ledger: TemplateCopilotV2Ledger;
  actorEmail: string;
  generatedAt: string;
  dossierId: string;
  templateId: string;
  sourceSessionId: string;
  sourceSessionRevision: number;
  inapplicableFactIds?: readonly TemplateCopilotFactId[];
}) {
  const ledger = templateCopilotV2LedgerSchema.parse(ledgerInput);
  const inapplicable = new Set(inapplicableFactIds);
  const issues = validateTemplateCopilotV2DraftCompilation(ledger, {
    inapplicableFactIds,
  });
  const draftBlockers = issues.filter(
    (item) => item.blockingLevel === "draft",
  );
  if (draftBlockers.length) {
    throw new TemplateCopilotV2DraftCompilerError(draftBlockers);
  }
  const plan = templateCopilotPlanV1Schema.parse(
    planFromLedger(
      ledger,
      inapplicable,
      issues.filter((item) => item.blockingLevel === "publication"),
    ),
  );
  const compiled = compileTemplateCopilotPlan({
    plan,
    businessUnitId: ledger.businessUnitId,
    businessName: ledger.businessName,
    departmentId: ledger.departmentId,
    departmentName: ledger.departmentName,
    actorEmail,
    generatedAt,
    dossierId,
    templateId,
    sourceSessionId,
    sourceSessionRevision,
  });
  if (!issues.some((item) => item.blockingLevel === "publication")) {
    return compiled;
  }
  const dossier = templateRequirementsDossierV1Schema.parse({
    ...compiled.dossier,
    openQuestions: compiled.dossier.openQuestions.map((question) => ({
      ...question,
      importance: "blocking",
    })),
  });
  const definition = templateDefinitionV1Schema.parse({
    ...compiled.definition,
    generation: {
      ...compiled.definition.generation,
      unresolvedQuestionIds: dossier.openQuestions.map(
        (question) => question.id,
      ),
    },
  });
  return { dossier, definition };
}

function planFromLedger(
  ledger: TemplateCopilotV2Ledger,
  inapplicable: ReadonlySet<TemplateCopilotFactId>,
  publicationBlockers: readonly TemplateCopilotV2DraftCompilerIssue[],
): TemplateCopilotPlanV1 {
  const name = committedString(ledger, "workflow.name");
  const purpose = committedString(ledger, "workflow.purpose");
  const initiator = committedRecord(ledger, "request.initiator_policy")!;
  const fields = committedArray(ledger, "request.fields").map((value) => {
    const item = record(value)!;
    return {
      label: String(item.label),
      type: item.type,
      required: Boolean(item.required),
      instructions: "",
      placeholder: "",
      options: Array.isArray(item.options) ? item.options : [],
      source: "manual" as const,
    };
  });
  const attachments =
    ledger.facts["attachments.requirements"].status === "not_applicable" ||
    inapplicable.has("attachments.requirements") ||
    ledger.facts["attachments.requirements"].status !== "committed"
      ? []
      : templateCopilotV2AttachmentRequirementsSchema.parse(
          ledger.facts["attachments.requirements"].canonicalValue,
        );
  const conditions =
    ledger.facts["workflow.conditions"].status === "not_applicable" ||
    inapplicable.has("workflow.conditions") ||
    ledger.facts["workflow.conditions"].status !== "committed"
      ? []
      : templateCopilotV2ConditionRulesSchema.parse(
          ledger.facts["workflow.conditions"].canonicalValue,
        );
  const notifications =
    ledger.facts["notifications.rules"].status === "not_applicable" ||
    inapplicable.has("notifications.rules") ||
    ledger.facts["notifications.rules"].status !== "committed"
      ? []
      : templateCopilotV2NotificationRulesSchema.parse(
          ledger.facts["notifications.rules"].canonicalValue,
        );
  const stages = committedArray(ledger, "workflow.stages")
    .map(record)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => item.kind !== "submission");
  const timing = committedRecord(ledger, "timing.rules") || {};
  const defaultDueHours =
    typeof timing.defaultDueHours === "number"
      ? timing.defaultDueHours
      : 48;
  const blockerCodes = new Set(
    publicationBlockers.map((item) => item.code),
  );
  const visibilityMapping = supportedVisibilityPolicy(
    committedRecord(ledger, "visibility.policy"),
  );
  const phaseGroups = new Map<number, Array<Record<string, unknown>>>();
  for (const stage of stages) {
    const sequence = Number(stage.sequence);
    phaseGroups.set(sequence, [
      ...(phaseGroups.get(sequence) || []),
      stage,
    ]);
  }
  const orderedGroups = [...phaseGroups.entries()].sort(
    ([left], [right]) => left - right,
  );
  const conditionByTarget = new Map(
    blockerCodes.has("condition_target_not_compilable") ||
      blockerCodes.has("condition_targets_parallel_member") ||
      blockerCodes.has("condition_fallback_order_mismatch") ||
      blockerCodes.has("nonlinear_condition_requires_review") ||
      blockerCodes.has("multiple_rules_per_phase")
      ? []
      : conditions.map((condition) => [
          condition.matchingRoute,
          condition,
        ]),
  );
  const phases = orderedGroups.map(([sequence, group], index) => {
    const firstLabel = String(group[0].label);
    const condition = conditionByTarget.get(`stage:${firstLabel}`) || null;
    if (condition) {
      const nextLabel = orderedGroups[index + 1]?.[1][0]?.label;
      const expectedOtherwise = nextLabel
        ? `stage:${String(nextLabel)}`
        : "complete";
      if (condition.otherwiseRoute !== expectedOtherwise) {
        throw new TemplateCopilotV2DraftCompilerError([
          {
            factId: "workflow.conditions",
            code: "condition_fallback_order_mismatch",
            message:
              `Rule "${condition.id}" does not fall through to the next compiled phase.`,
            blockingLevel: "publication",
          },
        ]);
      }
    }
    return {
      label: `Phase ${sequence}`,
      execution: group.length > 1 ? "parallel" : "sequential",
      condition: condition
        ? {
            label: condition.id,
            fieldLabel: condition.field,
            operator: condition.operator,
            value: String(condition.value),
            join: "and" as const,
          }
        : null,
      stages: group.map((stage) => {
        const participant = record(stage.participant)!;
        const label = String(stage.label);
        return {
          label,
          kind: stage.kind,
          participant: planParticipant(participant),
          dueInHours: defaultDueHours,
          escalationParticipant: null,
          acknowledgementRequired: stage.kind === "for_information",
          attachmentLabels: attachments
            .filter((item) => item.stage === `stage:${label}`)
            .map((item) => item.label),
          fieldVisibility:
            visibilityMapping?.fieldVisibility || ("hidden" as const),
          visibleFieldLabels: [],
          documentVisibility:
            visibilityMapping?.documentVisibility || ("none" as const),
          visibleDocumentLabels: [],
        };
      }),
    };
  });
  const rejection = committedRecord(ledger, "workflow.rejection_policy")!;
  const collaboration =
    committedRecord(ledger, "collaboration.policy") || {
      description: "Pending explicit collaboration review.",
      rules: [],
    };
  const visibility = committedRecord(ledger, "visibility.policy") || {
    description: "Pending explicit visibility review.",
    rules: [],
  };
  const governanceOwner = committedString(ledger, "governance.owner");
  const policies = committedArray(ledger, "governance.policies").map(String);
  const retention = committedRecord(ledger, "governance.retention") || {
    period: "1 day",
  };
  const notificationEvents = notifications
    .map((item) => notificationEvent(item.event))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const shared = attachments.some(
    (item) => item.contributorPolicy === "allow_invited_contributors",
  );
  const confirmation = attachments.some(
    (item) => item.confirmationPolicy !== "none",
  );

  return {
    schemaVersion: 1,
    locale: ledger.locale,
    title: name,
    purpose,
    // These are application policy, not model output or silent user facts.
    dataClassification: "internal",
    allowedInitiators:
      initiator.mode === "any_employee"
        ? "any_employee"
        : "named_roles",
    initiatorRoles:
      initiator.mode === "any_employee"
        ? []
        : initiatorRoleMapping(initiator.description) || [],
    initiatorEmails: [],
    requestFields: fields as TemplateCopilotPlanV1["requestFields"],
    attachments: attachments.map((item) => ({
      label: item.label,
      description: "",
      required: item.required,
      inputMode: item.kind === "form" ? "manual_form" : "upload",
      acceptedFormats: item.kind === "form" ? ["text"] : item.formats,
      minimumFiles: item.minimumQuantity,
      maximumFiles: item.maximumQuantity,
      maximumFileSizeMb: item.maximumFileSizeMb || 25,
      fields: [],
      allowSharedFulfillment:
        item.contributorPolicy === "allow_invited_contributors",
      requireSharedFulfillmentConfirmation:
        !blockerCodes.has("confirmation_owner_requires_review") &&
        item.confirmationPolicy !== "none",
      requiredWhen: null,
    })),
    phases: phases as TemplateCopilotPlanV1["phases"],
    collaboration: {
      templateDefinedSubmitters: false,
      adHocContributors: shared,
      contributorDueDates: false,
      statusVisibility:
        visibilityMapping?.statusVisibility || "process_owners",
      confirmationPolicy:
        confirmation &&
        !blockerCodes.has("confirmation_owner_requires_review")
        ? "first_decision_wins"
        : "none",
      rejectionCreatesCorrectionLoop:
        rejection.action === "return_for_correction",
    },
    notifications: {
      strategy: notifications.length > 1
        ? "all_changes"
        : "important_changes_only",
      recipients: notifications.some(
        (item) =>
          item.recipients.includes("all_participants") ||
          item.visibility === "all_participants",
      )
        ? "all_participants"
        : "directly_involved",
      events: blockerCodes.has("notification_delivery_requires_review")
        ? []
        : [...new Set(notificationEvents)],
    },
    governance: {
      publishMode: "template_manager_review",
      processOwnerEmail: "",
      reviewerEmails: [],
      policyReferences: [
        ...policies,
        `Workflow owner: ${governanceOwner}`,
        `Scope: ${policyText(ledger, "workflow.scope")}`,
        `Collaboration: ${String(collaboration.description)}`,
        `Visibility: ${String(visibility.description)}`,
        ...(timing.escalation
          ? [`Late-work policy: ${String(record(timing.escalation)?.description || "")}`]
          : []),
      ],
      retentionDays: retentionDays(String(retention.period))!,
      changeReasonRequired: true,
    },
    assumptions: [],
    openQuestions: publicationBlockers.map((item) => ({
      question: `[${item.factId}/${item.code}] ${item.message}`,
      importance: "blocking" as const,
      answer: "",
    })),
  };
}

function strictValue<T>(
  ledger: TemplateCopilotV2Ledger,
  factId: TemplateCopilotFactId,
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
) {
  const fact = ledger.facts[factId];
  if (fact.status === "not_applicable") return [] as T;
  const result = schema.safeParse(fact.canonicalValue);
  return result.success ? result.data : undefined;
}

function committedString(
  ledger: TemplateCopilotV2Ledger,
  factId: TemplateCopilotFactId,
) {
  return String(ledger.facts[factId].canonicalValue || "");
}

function committedArray(
  ledger: TemplateCopilotV2Ledger,
  factId: TemplateCopilotFactId,
) {
  const value = ledger.facts[factId].canonicalValue;
  return Array.isArray(value) ? value : [];
}

function committedRecord(
  ledger: TemplateCopilotV2Ledger,
  factId: TemplateCopilotFactId,
) {
  return record(ledger.facts[factId].canonicalValue);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function planParticipant(value: Record<string, unknown>) {
  const mode = String(value.mode);
  const detail = typeof value.value === "string" ? value.value : "";
  return {
    mode:
      mode === "directory_position"
        ? "directory_position"
        : mode === "request_field"
          ? "request_field"
          : mode === "fixed_email"
            ? "fixed_email"
            : mode === "requester"
              ? "requester"
              : "unassigned_at_template",
    email: mode === "fixed_email" ? detail : "",
    directoryPosition: mode === "directory_position" ? detail : "",
    requestFieldLabel: mode === "request_field" ? detail : "",
  } as TemplateCopilotPlanV1["phases"][number]["stages"][number]["participant"];
}

function notificationEvent(
  event: string,
): TemplateCopilotPlanV1["notifications"]["events"][number] | null {
  if (event === "request_submitted" || event === "stage_assigned") return "assigned";
  if (event === "stage_completed") return "approved";
  if (event === "request_rejected") return "rejected";
  if (event === "correction_requested") return "correction_requested";
  if (event === "request_completed") return "completed";
  if (event === "due_soon") return "due_soon";
  if (event === "overdue") return "overdue";
  return null;
}

function retentionDays(value: string) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  const match = normalized.match(
    /^(\d{1,4})\s*(day|days|日|天|month|months|個月|个月|year|years|年)$/,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = ["month", "months", "個月", "个月"].includes(unit)
    ? 30
    : ["year", "years", "年"].includes(unit)
      ? 365
      : 1;
  const days = amount * multiplier;
  return days >= 1 && days <= 3_650 ? days : null;
}

function policyText(
  ledger: TemplateCopilotV2Ledger,
  factId: TemplateCopilotFactId,
) {
  const value = committedRecord(ledger, factId);
  return [
    String(value?.description || ""),
    ...(Array.isArray(value?.rules) ? value.rules.map(String) : []),
  ]
    .filter(Boolean)
    .join("; ");
}

function supportedVisibilityPolicy(
  value: Record<string, unknown> | null,
): {
  statusVisibility: "participants" | "department" | "process_owners";
  fieldVisibility: "all" | "hidden";
  documentVisibility: "all" | "required_for_node" | "none";
} | null {
  if (!value || !Array.isArray(value.rules)) return null;
  const rules = value.rules.map(String);
  const statuses = [
    "participants",
    "department",
    "process_owners",
  ].filter((item) => rules.includes(`status:${item}`));
  const fieldModes = ["all", "hidden"].filter((item) =>
    rules.includes(`fields:${item}`),
  );
  const documentModes = ["all", "required_for_node", "none"].filter((item) =>
    rules.includes(`documents:${item}`),
  );
  const recognizedTokens = new Set([
    ...statuses.map((item) => `status:${item}`),
    ...fieldModes.map((item) => `fields:${item}`),
    ...documentModes.map((item) => `documents:${item}`),
  ]);
  if (
    statuses.length !== 1 ||
    fieldModes.length !== 1 ||
    documentModes.length !== 1 ||
    rules.length !== 3 ||
    rules.filter((item) => recognizedTokens.has(item)).length !== 3
  ) {
    return null;
  }
  return {
    statusVisibility: statuses[0] as
      | "participants"
      | "department"
      | "process_owners",
    fieldVisibility: fieldModes[0] as "all" | "hidden",
    documentVisibility: documentModes[0] as
      | "all"
      | "required_for_node"
      | "none",
  };
}

function initiatorRoleMapping(value: unknown): string[] | null {
  if (typeof value !== "string" || !value.startsWith("roles:")) {
    return null;
  }
  const roles = value
    .slice("roles:".length)
    .split("|")
    .map((item) => item.trim());
  if (
    roles.length < 1 ||
    roles.length > 50 ||
    roles.some((item) => item.length < 1 || item.length > 200) ||
    new Set(roles).size !== roles.length
  ) {
    return null;
  }
  return roles;
}

function dedupeIssues(issues: TemplateCopilotV2DraftCompilerIssue[]) {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.factId}:${item.code}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
