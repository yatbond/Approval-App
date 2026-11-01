import {
  templateCopilotFactIds,
  templateCopilotV2LedgerSchema,
  type TemplateCopilotFactId,
  type TemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";
import {
  getTemplateCopilotV2InterviewState,
  type TemplateCopilotV2InterviewState,
} from "./template-copilot-question-library.ts";
import {
  getTemplateCopilotReadiness,
  type TemplateCopilotReadiness,
} from "./template-copilot-readiness.ts";
import {
  formatTemplateCopilotV2StructuredIssue,
  templateCopilotV2AttachmentRequirementsSchema,
  templateCopilotV2ConditionRulesSchema,
  templateCopilotV2NotificationRulesSchema,
  validateTemplateCopilotV2CommittedStrictStructures,
} from "./template-copilot-v2-structured-facts.ts";
import { validateTemplateCopilotV2DraftCompilation } from "./template-copilot-v2-draft-compiler.ts";

export type TemplateCopilotV2PlaybackLocale = "en" | "zh-Hant" | "zh-Hans";

export type TemplateCopilotV2PlaybackIssue = Readonly<{
  factId?: TemplateCopilotFactId;
  code: string;
  label: string;
  detail: string;
}>;

export type TemplateCopilotV2PlaybackSection = Readonly<{
  id:
    | "start"
    | "request"
    | "stages"
    | "routing"
    | "correction"
    | "timing"
    | "handoffs"
    | "notifications"
    | "governance";
  title: string;
  items: readonly Readonly<{
    factId: TemplateCopilotFactId;
    text: string;
    evidence: readonly Readonly<{
      kind: "message" | "document" | "legacy_section" | "human_editor";
      sourceId: string;
      sourceMessageIds: readonly string[];
      excerpt?: string;
    }>[];
  }>[];
}>;

export type TemplateCopilotV2Playback = Readonly<{
  sourceRevision: number | null;
  interview: Readonly<{
    state: TemplateCopilotV2InterviewState["state"];
    answeredDecisionCount: number;
    nextQuestionId?: string;
    openFactCount: number;
  }>;
  readiness: TemplateCopilotReadiness;
  sections: readonly TemplateCopilotV2PlaybackSection[];
  assumptions: readonly TemplateCopilotV2PlaybackIssue[];
  notApplicable: readonly TemplateCopilotV2PlaybackIssue[];
  conflicts: readonly TemplateCopilotV2PlaybackIssue[];
  unresolved: readonly TemplateCopilotV2PlaybackIssue[];
  compilerErrors: readonly TemplateCopilotV2PlaybackIssue[];
  warnings: readonly TemplateCopilotV2PlaybackIssue[];
}>;

type FactPresentation = Readonly<{
  label: string;
  lines: readonly string[];
}>;

type PlaybackCompilerValidationIssue = Readonly<{
  factId: TemplateCopilotFactId;
  path: string;
  code: string;
  message: string;
  detail: string;
}>;

const sectionFacts: ReadonlyArray<
  readonly [
    TemplateCopilotV2PlaybackSection["id"],
    readonly TemplateCopilotFactId[],
  ]
> = [
  [
    "start",
    [
      "workflow.name",
      "workflow.purpose",
      "workflow.scope",
      "request.initiator_policy",
    ],
  ],
  ["request", ["request.fields", "attachments.requirements"]],
  ["stages", ["workflow.stages"]],
  ["routing", ["workflow.conditions"]],
  [
    "correction",
    ["workflow.rejection_policy", "collaboration.policy"],
  ],
  ["timing", ["timing.rules"]],
  [
    "handoffs",
    [
      "visibility.policy",
      "request.fields",
      "attachments.requirements",
      "workflow.stages",
    ],
  ],
  ["notifications", ["notifications.rules"]],
  [
    "governance",
    [
      "governance.owner",
      "governance.policies",
      "governance.retention",
    ],
  ],
];

export function buildTemplateCopilotV2Playback({
  ledger: ledgerInput,
  inapplicableFactIds = [],
  factPresentation,
  sourceRevision,
  publishedSourceRevision,
}: {
  ledger: TemplateCopilotV2Ledger;
  inapplicableFactIds?: readonly TemplateCopilotFactId[];
  factPresentation: Readonly<
    Partial<Record<TemplateCopilotFactId, FactPresentation>>
  >;
  sourceRevision?: number;
  publishedSourceRevision?: number;
}): TemplateCopilotV2Playback {
  const ledger = templateCopilotV2LedgerSchema.parse(ledgerInput);
  const locale = ledger.locale;
  const computedInapplicable = new Set(inapplicableFactIds);
  const interview = getTemplateCopilotV2InterviewState(ledger);
  const compilerIssues = compilerIssuesFor(ledger, inapplicableFactIds);
  const readiness = getTemplateCopilotReadiness(ledger, {
    compilerValid: compilerIssues.length === 0,
    publishedRevisionMatches:
      sourceRevision !== undefined &&
      publishedSourceRevision !== undefined &&
      sourceRevision === publishedSourceRevision,
    inapplicableFactIds,
  });
  const openFacts = templateCopilotFactIds.filter(
    (factId) =>
      !computedInapplicable.has(factId) &&
      ["candidate", "unresolved", "unknown", "conflicting"].includes(
        ledger.facts[factId].status,
      ),
  );
  const sections = sectionFacts
    .map(([id, factIds]) => {
      const items = factIds.flatMap((factId) => {
        const fact = ledger.facts[factId];
        const presentation = factPresentation[factId];
        if (
          fact.status !== "committed" ||
          !presentation ||
          presentation.lines.length === 0
        ) {
          return [];
        }
        return presentation.lines.map((line) =>
          Object.freeze({
            factId,
            text: line,
            evidence: Object.freeze(
              [...fact.provenance]
                .sort((left, right) =>
                  `${left.kind}:${left.sourceId}`.localeCompare(
                    `${right.kind}:${right.sourceId}`,
                  ),
                )
                .filter(
                  (item, index, all) =>
                    index === 0 ||
                    `${item.kind}:${item.sourceId}` !==
                      `${all[index - 1].kind}:${all[index - 1].sourceId}`,
                )
                .map((item) =>
                  Object.freeze({
                    kind: item.kind,
                    sourceId: item.sourceId,
                    sourceMessageIds: Object.freeze([
                      ...item.sourceMessageIds,
                    ]),
                    ...(item.excerpt ? { excerpt: item.excerpt } : {}),
                  }),
                ),
            ),
          }),
        );
      });
      return Object.freeze({
        id,
        title: sectionTitle(id, locale),
        items: Object.freeze(items),
      });
    })
    .filter((section) => section.items.length > 0);
  const notApplicable = templateCopilotFactIds.flatMap((factId) => {
    const fact = ledger.facts[factId];
    if (
      fact.status !== "not_applicable" &&
      !computedInapplicable.has(factId)
    ) {
      return [];
    }
    return [
      issue(
        factId,
        fact.status === "not_applicable"
          ? "not_applicable"
          : "not_applicable_by_answer",
        labelFor(factId, factPresentation),
        fact.notApplicableReason || copy(locale).notApplicableByAnswer,
      ),
    ];
  });
  const conflicts = templateCopilotFactIds.flatMap((factId) => {
    const fact = ledger.facts[factId];
    if (fact.status !== "conflicting") return [];
    return [
      issue(
        factId,
        "conflicting",
        labelFor(factId, factPresentation),
        copy(locale).conflict,
      ),
    ];
  });
  const unresolved = templateCopilotFactIds.flatMap((factId) => {
    const fact = ledger.facts[factId];
    if (computedInapplicable.has(factId)) return [];
    if (
      fact.status !== "candidate" &&
      fact.status !== "unresolved" &&
      fact.status !== "unknown"
    ) {
      return [];
    }
    return [
      issue(
        factId,
        fact.status,
        labelFor(factId, factPresentation),
        unresolvedDetail(fact.status, locale),
      ),
    ];
  });

  return Object.freeze({
    sourceRevision: sourceRevision ?? null,
    interview: Object.freeze({
      state: interview.state,
      answeredDecisionCount: Object.keys(ledger.atomicDecisions).length,
      ...(interview.nextQuestion
        ? { nextQuestionId: interview.nextQuestion.questionId }
        : {}),
      openFactCount: openFacts.length,
    }),
    readiness,
    sections: Object.freeze(sections),
    // The governed ledger never silently turns model text or compiler defaults
    // into assumptions. A future explicit assumption fact may populate this
    // list; an empty list is a meaningful, auditable result.
    assumptions: Object.freeze([]),
    notApplicable: Object.freeze(notApplicable),
    conflicts: Object.freeze(conflicts),
    unresolved: Object.freeze(unresolved),
    compilerErrors: Object.freeze(
      compilerIssues.map((item) =>
        issue(
          item.factId,
          item.code,
          labelFor(item.factId, factPresentation),
          item.detail,
        ),
      ),
    ),
    warnings: Object.freeze(playbackWarnings(ledger, factPresentation)),
  });
}

function compilerIssuesFor(
  ledger: TemplateCopilotV2Ledger,
  inapplicableFactIds: readonly TemplateCopilotFactId[],
): readonly PlaybackCompilerValidationIssue[] {
  const inapplicable = new Set(inapplicableFactIds);
  const issues: PlaybackCompilerValidationIssue[] =
    validateTemplateCopilotV2CommittedStrictStructures(ledger)
      .filter((item) => !inapplicable.has(item.factId))
      .map((item) => ({
        ...item,
        detail: formatTemplateCopilotV2StructuredIssue(item, ledger.locale),
      }));
  const strictFacts = [
    [
      "attachments.requirements",
      templateCopilotV2AttachmentRequirementsSchema,
    ],
    ["workflow.conditions", templateCopilotV2ConditionRulesSchema],
    ["notifications.rules", templateCopilotV2NotificationRulesSchema],
  ] as const;
  for (const [factId, schema] of strictFacts) {
    const fact = ledger.facts[factId];
    if (
      !inapplicable.has(factId) &&
      fact.status === "committed" &&
      !schema.safeParse(fact.canonicalValue).success &&
      !issues.some((item) => item.factId === factId)
    ) {
      issues.push({
        factId,
        path: "root",
        code: "invalid_shape",
        message:
          "This saved setting uses a legacy shape and needs explicit structured review before publication.",
        detail:
          "This saved setting uses a legacy shape and needs explicit structured review before publication.",
      });
    }
  }
  for (const item of validateTemplateCopilotV2DraftCompilation(ledger, {
    inapplicableFactIds,
  })) {
    if (
      issues.some(
        (existing) =>
          existing.factId === item.factId && existing.code === item.code,
      )
    ) {
      continue;
    }
    issues.push({
      ...item,
      path: "root",
      detail: item.message,
    });
  }
  return Object.freeze(issues);
}

function playbackWarnings(
  ledger: TemplateCopilotV2Ledger,
  factPresentation: Readonly<
    Partial<Record<TemplateCopilotFactId, FactPresentation>>
  >,
) {
  const warnings: TemplateCopilotV2PlaybackIssue[] = [];
  const stages = ledger.facts["workflow.stages"];
  if (stages.status !== "committed" || !Array.isArray(stages.canonicalValue)) {
    return warnings;
  }
  const stageRows = stages.canonicalValue.filter(isPlaybackStage);
  const laterAssignment = stageRows.filter(
    (item) => item.participant.mode === "unassigned_at_template",
  );
  if (laterAssignment.length > 0) {
    warnings.push(
      issue(
        "workflow.stages",
        "participant_assigned_later",
        labelFor("workflow.stages", factPresentation),
        copy(ledger.locale).laterAssignment.replace(
          "{stages}",
          laterAssignment.map((item) => item.label).join(", "),
        ),
      ),
    );
  }
  const bySequence = new Map<
    number,
    Array<{ label: string; blocking: boolean }>
  >();
  for (const stage of stageRows) {
    bySequence.set(stage.sequence, [
      ...(bySequence.get(stage.sequence) || []),
      {
        label: stage.label,
        blocking: stage.kind !== "for_information",
      },
    ]);
  }
  for (const rows of bySequence.values()) {
    if (rows.length < 2) continue;
    warnings.push(
      issue(
        "workflow.stages",
        "simultaneous_stages",
        labelFor("workflow.stages", factPresentation),
        copy(ledger.locale).simultaneous.replace(
          "{stages}",
          rows.map((item) => item.label).join(", "),
        ).replace(
          "{blocking}",
          rows
            .filter((item) => item.blocking)
            .map((item) => item.label)
            .join(", ") || copy(ledger.locale).noneBlocking,
        ),
      ),
    );
  }
  return warnings;
}

function isPlaybackStage(value: unknown): value is {
  label: string;
  sequence: number;
  kind: string;
  participant: { mode: string };
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.label !== "string" ||
    typeof candidate.sequence !== "number" ||
    typeof candidate.kind !== "string" ||
    !candidate.participant ||
    typeof candidate.participant !== "object" ||
    Array.isArray(candidate.participant)
  ) {
    return false;
  }
  return (
    typeof (candidate.participant as Record<string, unknown>).mode === "string"
  );
}

function issue(
  factId: TemplateCopilotFactId | undefined,
  code: string,
  label: string,
  detail: string,
): TemplateCopilotV2PlaybackIssue {
  return Object.freeze({
    ...(factId ? { factId } : {}),
    code,
    label,
    detail,
  });
}

function labelFor(
  factId: TemplateCopilotFactId,
  factPresentation: Readonly<
    Partial<Record<TemplateCopilotFactId, FactPresentation>>
  >,
) {
  return factPresentation[factId]?.label || factId;
}

function unresolvedDetail(
  status: "candidate" | "unresolved" | "unknown",
  locale: TemplateCopilotV2PlaybackLocale,
) {
  const value = copy(locale);
  if (status === "candidate") return value.candidate;
  if (status === "unknown") return value.unknown;
  return value.unresolved;
}

function sectionTitle(
  id: TemplateCopilotV2PlaybackSection["id"],
  locale: TemplateCopilotV2PlaybackLocale,
) {
  const index = locale === "en" ? 0 : locale === "zh-Hant" ? 1 : 2;
  const titles: Record<
    TemplateCopilotV2PlaybackSection["id"],
    readonly [string, string, string]
  > = {
    start: [
      "1. Who starts and what this workflow covers",
      "1. 誰發起及流程涵蓋範圍",
      "1. 谁发起及流程涵盖范围",
    ],
    request: [
      "2. Information and documents submitted",
      "2. 提交的資料及文件",
      "2. 提交的信息及文件",
    ],
    stages: [
      "3. Who acts and in what order",
      "3. 誰處理及處理次序",
      "3. 谁处理及处理顺序",
    ],
    routing: [
      "4. If this happens, what happens next",
      "4. 如果出現此情況，下一步是甚麼",
      "4. 如果出现此情况，下一步是什么",
    ],
    correction: [
      "5. Rejection and correction",
      "5. 拒絕及更正",
      "5. 拒绝及更正",
    ],
    timing: ["6. Due times and late work", "6. 時限及逾期工作", "6. 时限及逾期工作"],
    handoffs: [
      "7. Information and document handoffs",
      "7. 資料及文件交接",
      "7. 信息及文件交接",
    ],
    notifications: ["8. Notifications", "8. 通知", "8. 通知"],
    governance: [
      "9. Ownership, policy, and records",
      "9. 負責單位、政策及記錄",
      "9. 负责单位、政策及记录",
    ],
  };
  return titles[id][index];
}

function copy(locale: TemplateCopilotV2PlaybackLocale) {
  if (locale === "zh-Hant") {
    return {
      candidate: "這是建議值，仍需由人員確認。",
      unknown: "此項目前未知，並非已接受的假設。",
      unresolved: "仍需回答此項。",
      conflict: "有多個互相衝突的值，必須由人員選擇。",
      notApplicable: "不適用",
      notApplicableByAnswer: "根據較早的答案，此項目不適用。",
      laterAssignment: "以下步驟的處理人會在稍後指定：{stages}。",
      simultaneous:
        "以下步驟會同時進行：{stages}。所有會阻止流程繼續的審批或審核都必須完成：{blocking}。僅供知會的步驟不會阻止流程。",
      noneBlocking: "沒有",
    };
  }
  if (locale === "zh-Hans") {
    return {
      candidate: "这是建议值，仍需人工确认。",
      unknown: "此项目前未知，并非已接受的假设。",
      unresolved: "仍需回答此项。",
      conflict: "有多个互相冲突的值，必须由人工选择。",
      notApplicable: "不适用",
      notApplicableByAnswer: "根据较早的答案，此项目不适用。",
      laterAssignment: "以下步骤的处理人会在稍后指定：{stages}。",
      simultaneous:
        "以下步骤会同时进行：{stages}。所有会阻止流程继续的审批或审核都必须完成：{blocking}。仅供知会的步骤不会阻止流程。",
      noneBlocking: "没有",
    };
  }
  return {
    candidate: "This is a suggestion and still needs human confirmation.",
    unknown: "This is currently unknown; it is not an accepted assumption.",
    unresolved: "This still needs an answer.",
    conflict: "Conflicting values require a human choice.",
    notApplicable: "Not applicable",
    notApplicableByAnswer:
      "An earlier answer makes this item not applicable.",
    laterAssignment: "The participant will be assigned later for: {stages}.",
    simultaneous:
      "These steps run at the same time: {stages}. Every blocking approval or review must finish before the workflow continues: {blocking}. FYI steps do not block.",
    noneBlocking: "none",
  };
}
