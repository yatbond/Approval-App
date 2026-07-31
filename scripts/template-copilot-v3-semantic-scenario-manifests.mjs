import { createHash } from "node:crypto";
import {
  answersForScenario,
  templateCopilotQualificationScenarios,
} from "./template-copilot-qualification-scenarios.mjs";

export const templateCopilotV3SemanticManifestVersion =
  "template-copilot-v3-semantic-manifests.4";
export const templateCopilotV3SemanticManifestCorpusFingerprint =
  "sha256:accda596f469157d28c12f5d5d6b88843285ec764bb91d4c0f47b18da057878c";

const allFactIds = Object.freeze([
  "workflow.name",
  "workflow.purpose",
  "workflow.scope",
  "request.initiator_policy",
  "workflow.rejection_policy",
  "collaboration.policy",
  "timing.rules",
  "visibility.policy",
  "governance.owner",
  "governance.policies",
  "governance.retention",
  "request.fields",
  "attachments.requirements",
  "workflow.stages",
  "workflow.conditions",
  "notifications.rules",
]);

const t = (value) =>
  Object.freeze(
    value
      .split("|")
      .map((term) => term.trim())
      .filter(Boolean),
  );
const groups = (...values) => Object.freeze(values.map(t));
const roleTerm = (role, term, hint = null) =>
  Object.freeze({ role, term, hint });
const attachment = (
  label,
  {
    kind = "attachment",
    required = true,
    formats = [],
    quantities = [],
    maximumFileSizeTerms = [],
    stageTerms = [],
  } = {},
) =>
  Object.freeze({
    label,
    kind,
    required,
    formats: Object.freeze(
      formats.map(([term, hint]) => roleTerm("format", term, hint)),
    ),
    quantities: Object.freeze(
      quantities.map(([role, term]) => roleTerm(role, term)),
    ),
    maximumFileSizeTerms: Object.freeze(
      maximumFileSizeTerms.map((term) =>
        roleTerm("maximum_file_size_mb", term),
      ),
    ),
    stageTerms: Object.freeze(
      stageTerms.map(([term, hint = "stage_reference"]) =>
        roleTerm("stage", term, hint),
      ),
    ),
  });

const scalarFactContractSpecs = Object.freeze([
  Object.freeze({
    factId: "workflow.name",
    slot: "identity_scope",
    role: "description",
    hint: null,
  }),
  Object.freeze({
    factId: "workflow.purpose",
    slot: "identity_scope",
    role: "description",
    hint: null,
  }),
  Object.freeze({
    factId: "workflow.scope",
    slot: "identity_scope",
    role: "rule",
    hint: null,
  }),
  Object.freeze({
    factId: "request.initiator_policy",
    slot: "initiators_fields",
    role: "description",
    hint: null,
  }),
  Object.freeze({
    factId: "workflow.rejection_policy",
    slot: "conditions_exceptions",
    role: "mode",
    hint: "return_for_correction",
  }),
  Object.freeze({
    factId: "collaboration.policy",
    slot: "collaboration_corrections",
    role: "rule",
    hint: null,
  }),
  Object.freeze({
    factId: "timing.rules",
    slot: "timing_escalation",
    role: "rule",
    hint: null,
  }),
  Object.freeze({
    factId: "governance.owner",
    slot: "governance",
    role: "description",
    hint: null,
  }),
  Object.freeze({
    factId: "governance.policies",
    slot: "governance",
    role: "rule",
    hint: null,
  }),
  Object.freeze({
    factId: "governance.retention",
    slot: "governance",
    role: "period",
    hint: null,
  }),
]);

function normalizeManifestText(value) {
  return String(value).normalize("NFKC").trim().toLocaleLowerCase();
}

function splitSourceClauses(source) {
  return Object.freeze(
    String(source)
      .split(/(?<=[.!?。！？；;])|\n/gu)
      .map((clause) => clause.trim())
      .filter(Boolean),
  );
}

function attachmentSupplementalEvidenceTerms(contract) {
  return Object.freeze([
    ...contract.quantities.map((entry) => entry.term),
    ...contract.maximumFileSizeTerms.map((entry) => entry.term),
    ...contract.stageTerms.map((entry) => entry.term),
  ]);
}

function clauseHasConditionalMeaning(clause) {
  return /\b(?:if|when|where|retrospective|high[- ]risk|personal|sensitive|production|emergency|missing|above|over|more than)\b|若|如|當|当|時|时|高風險|高风险|生產|生产|緊急|紧急|缺少|缺失|超過|超过|以上|才|另要|再|申請簽證|申请签证/iu.test(
    clause,
  );
}

function attachmentContractWithEvidence(contract, source) {
  const normalizedLabel = normalizeManifestText(contract.label);
  const supplementalTerms = attachmentSupplementalEvidenceTerms(contract);
  const clauses = splitSourceClauses(source);
  const evidenceClauses = Object.freeze(
    clauses.filter((clause) => {
      const normalizedClause = normalizeManifestText(clause);
      if (normalizedClause.includes(normalizedLabel)) return true;
      return supplementalTerms.some((term) =>
        normalizedClause.includes(normalizeManifestText(term)),
      );
    }),
  );
  if (evidenceClauses.length === 0) {
    throw new Error(
      "Attachment " + contract.label + " has no exact source clause.",
    );
  }
  const conditionalClauseCount = evidenceClauses.filter(
    clauseHasConditionalMeaning,
  ).length;
  const requirementMode = !contract.required
    ? "optional"
    : conditionalClauseCount === 0
      ? "required"
      : conditionalClauseCount === evidenceClauses.length
        ? "conditional"
        : "required_with_conditional_extension";
  return Object.freeze({
    ...contract,
    requirementMode,
    evidenceClauses,
  });
}

function scalarFactContractsFor(sourceSlots, visibilitySlot) {
  return Object.freeze(
    [
      ...scalarFactContractSpecs,
      Object.freeze({
        factId: "visibility.policy",
        slot: visibilitySlot,
        role: "rule",
        hint: null,
      }),
    ].map((contract) =>
      Object.freeze({
        ...contract,
        exactSource: sourceSlots[contract.slot],
      }),
    ),
  );
}

const condition = (
  field,
  operatorTerm,
  operatorHint,
  value,
  matchingTerm,
  matchingHint = "stage_reference",
  otherwiseTerm = null,
  otherwiseHint = null,
) =>
  Object.freeze({
    field,
    operator: roleTerm("operator", operatorTerm, operatorHint),
    value,
    matchingRoute: roleTerm("matching_route", matchingTerm, matchingHint),
    otherwiseRoute:
      otherwiseTerm === null
        ? null
        : roleTerm(
            "otherwise_route",
            otherwiseTerm,
            otherwiseHint ?? "stage_reference",
          ),
  });

const stageKindsByScenario = Object.freeze({
  "EN-01": t("approval|review|approval|approval"),
  "EN-02": t("review|approval"),
  "EN-03": t("approval|review|review|approval"),
  "EN-04": t("approval|review|approval"),
  "EN-05": t("approval|review|review|review|approval"),
  "EN-06": t("approval|approval|approval|approval"),
  "EN-07": t("approval|review|review|review|approval"),
  "EN-08": t("approval|approval|approval|approval|approval"),
  "TC-01": t("approval|review|review|approval|review|approval"),
  "TC-02": t("approval|review|approval"),
  "TC-03": t("approval|review|review|review|review|approval|approval"),
  "TC-04": t("review|review|review|approval|approval"),
  "TC-05": t("approval|review|approval|approval|approval|approval"),
  "TC-06": t("review|review|review|approval|approval"),
  "TC-07": t("approval|approval|approval|approval"),
  "TC-08": t("approval|approval"),
  "SC-01": t("review|review|review|review|approval|approval"),
  "SC-02": t("approval|approval|approval|approval"),
  "SC-03": t("review|approval|approval|approval|review"),
  "SC-04": t("approval|review|review|approval|approval"),
  "SC-05": t("approval|review|review|approval|approval"),
  "SC-06": t("approval|review|review|submission|approval|approval|approval"),
  "SC-07": t("approval|review|approval|approval"),
  "SC-08": t("approval|review|review|approval|approval|approval|review"),
});

const handoffContracts = Object.freeze({
  "EN-01": {
    selectedFieldTerms: t("only purpose"),
    restrictedDocumentTerms: t("final quotation"),
  },
  "EN-02": {
    selectedFieldTerms: t("only supplier"),
    restrictedDocumentTerms: t("invoice PDF"),
  },
  "EN-03": {
    selectedFieldTerms: t("not payback assumptions"),
    restrictedDocumentTerms: t(""),
  },
  "EN-04": {
    selectedFieldTerms: t("not bank details"),
    restrictedDocumentTerms: t(""),
  },
  "EN-05": {
    selectedFieldTerms: t("only privacy fields"),
    restrictedDocumentTerms: t("not unrelated clauses"),
  },
  "EN-06": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("must not see the method statement"),
  },
  "EN-07": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("no system access or documents"),
  },
  "EN-08": { selectedFieldTerms: t(""), restrictedDocumentTerms: t("") },
  "TC-01": {
    selectedFieldTerms: t("財務只看銀行及付款資料"),
    restrictedDocumentTerms: t("相關證明"),
  },
  "TC-02": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("不可看到醫療證明"),
  },
  "TC-03": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("每組只看自己的欄位及文件"),
  },
  "TC-04": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("只可看已批准版本"),
  },
  "TC-05": {
    selectedFieldTerms: t("工程師不看銀行資料"),
    restrictedDocumentTerms: t(""),
  },
  "TC-06": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("風險評估只給審批參與者"),
  },
  "TC-07": { selectedFieldTerms: t(""), restrictedDocumentTerms: t("") },
  "TC-08": {
    selectedFieldTerms: t("只看訪客姓名"),
    restrictedDocumentTerms: t("不可看保密協議內容"),
  },
  "SC-01": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("只看相关字段和文件"),
  },
  "SC-02": {
    selectedFieldTerms: t("只看用户、系统、角色、有效期和批准结果"),
    restrictedDocumentTerms: t(""),
  },
  "SC-03": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("只看最终已批准材料"),
  },
  "SC-04": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("不得看到完整信用报告"),
  },
  "SC-05": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("只看资产、方式、日期和批准结果"),
  },
  "SC-06": { selectedFieldTerms: t(""), restrictedDocumentTerms: t("") },
  "SC-07": {
    selectedFieldTerms: t(""),
    restrictedDocumentTerms: t("不看护照附件"),
  },
  "SC-08": { selectedFieldTerms: t(""), restrictedDocumentTerms: t("") },
});

const notificationContractsByLanguage = Object.freeze({
  en: Object.freeze(
    [
      ["assignment", "stage_assigned"],
      ["due soon", "due_soon"],
      ["overdue", "overdue"],
      ["rejection", "request_rejected"],
      ["correction", "correction_requested"],
      ["completion", "request_completed"],
    ].map(([term, hint]) =>
      Object.freeze({
        slot: "visibility_notifications",
        event: roleTerm("event", term, hint),
        recipient: roleTerm(
          "recipient",
          "directly involved people",
          "source_named_group",
        ),
        visibility: roleTerm("visibility", "only", "recipients_only"),
      }),
    ),
  ),
  "zh-Hant": Object.freeze(
    [
      ["獲指派", "stage_assigned"],
      ["即將到期", "due_soon"],
      ["逾期", "overdue"],
      ["拒絕", "request_rejected"],
      ["補正", "correction_requested"],
      ["完成", "request_completed"],
    ].map(([term, hint]) =>
      Object.freeze({
        slot: "visibility_notifications",
        event: roleTerm("event", term, hint),
        recipient: roleTerm("recipient", "直接相關人士", "source_named_group"),
        visibility: roleTerm("visibility", "只", "recipients_only"),
      }),
    ),
  ),
  "zh-Hans": Object.freeze(
    [
      ["分配", "stage_assigned"],
      ["即将到期", "due_soon"],
      ["逾期", "overdue"],
      ["拒绝", "request_rejected"],
      ["补正", "correction_requested"],
      ["完成", "request_completed"],
    ].map(([term, hint]) =>
      Object.freeze({
        slot: "visibility_notifications",
        event: roleTerm("event", term, hint),
        recipient: roleTerm("recipient", "直接相关人员", "source_named_group"),
        visibility: roleTerm("visibility", "仅", "recipients_only"),
      }),
    ),
  ),
});

const workflowNotificationContracts = Object.freeze({
  "EN-01": Object.freeze([
    Object.freeze({
      slot: "stages_participants",
      event: roleTerm("event", "completion", "request_completed"),
      recipient: roleTerm("recipient", "requester", "requester"),
      visibility: null,
    }),
  ]),
});
const conditionContracts = Object.freeze({
  "EN-01": Object.freeze([
    condition(
      "total amount",
      "at least",
      ">=",
      "50,000",
      "high-value approver",
      "stage_reference",
      "complete",
      "complete",
    ),
  ]),
  "EN-02": Object.freeze([
    condition(
      "invoice total",
      "equals",
      "=",
      "both PO total and goods-received total",
      "Finance Manager",
      "stage_reference",
      "cost centre owner",
      "stage_reference",
    ),
  ]),
  "EN-03": Object.freeze([
    condition(
      "Board FYI",
      "above",
      ">",
      "2,000,000",
      "Board FYI",
      "stage_reference",
      "complete",
      "complete",
    ),
  ]),
  "EN-04": Object.freeze([
    condition(
      "total",
      "exceeds",
      ">",
      "10,000",
      "Department Head",
      "stage_reference",
      "Finance",
      "stage_reference",
    ),
    condition(
      "receipt is missing",
      "missing",
      "=",
      "receipt",
      "Department Head",
      "stage_reference",
      "Finance",
      "stage_reference",
    ),
  ]),
  "EN-05": Object.freeze([
    condition("Finance", "above", ">", "500,000", "Finance", "stage_reference"),
    condition(
      "personal-data choice",
      "personal",
      "=",
      "Yes",
      "Data Protection",
      "stage_reference",
    ),
  ]),
  "EN-06": Object.freeze([
    condition(
      "High-risk visits",
      "High-risk",
      "=",
      "High-risk visits",
      "Site Manager",
      "stage_reference",
      "complete",
      "complete",
    ),
    condition(
      "Missing induction",
      "Missing",
      "=",
      "induction",
      "blocks submission",
      "stage_reference",
    ),
  ]),
  "EN-07": Object.freeze([
    condition(
      "Personal",
      "Personal",
      "=",
      "Personal",
      "Data Protection",
      "stage_reference",
    ),
    condition(
      "sensitive data",
      "sensitive",
      "=",
      "sensitive data",
      "Data Protection",
      "stage_reference",
    ),
    condition(
      "country",
      "other than",
      "!=",
      "Hong Kong",
      "Legal",
      "stage_reference",
    ),
  ]),
  "EN-08": Object.freeze([
    condition(
      "amount",
      "Above",
      ">",
      "100,000",
      "CEO approval",
      "stage_reference",
      "General Manager",
      "stage_reference",
    ),
    condition(
      "Retrospective status",
      "Retrospective",
      "=",
      "Retrospective status",
      "does not skip approval",
      "stage_reference",
    ),
  ]),
  "TC-01": Object.freeze([
    condition("註冊地", "不在", "!=", "香港", "法務審查", "stage_reference"),
    condition(
      "銀行所在地",
      "不在",
      "!=",
      "香港",
      "法務審查",
      "stage_reference",
    ),
    condition(
      "利益衝突",
      "申報有利益衝突",
      "=",
      "利益衝突",
      "高級管理層審批",
      "stage_reference",
    ),
  ]),
  "TC-02": Object.freeze([
    condition(
      "病假日數",
      "三日或以上",
      ">=",
      "三日",
      "醫生證明",
      "stage_reference",
      "HR 核對後完成",
      "stage_reference",
    ),
    condition(
      "無薪假",
      "無薪假",
      "=",
      "無薪假",
      "部門主管路徑",
      "stage_reference",
      "HR 核對後完成",
      "stage_reference",
    ),
  ]),
  "TC-03": Object.freeze([
    condition(
      "估算合約額",
      "超過",
      ">",
      "一億元",
      "董事會主席批准",
      "stage_reference",
    ),
    condition(
      "聯營投標",
      "聯營投標",
      "=",
      "聯營投標",
      "法務審查",
      "stage_reference",
    ),
  ]),
  "TC-04": Object.freeze([
    condition(
      "高風險工序",
      "高風險",
      "=",
      "高風險工序",
      "公司安全主管批准",
      "stage_reference",
      "項目經理後完成",
      "stage_reference",
    ),
  ]),
  "TC-05": Object.freeze([
    condition(
      "申報金額與核實金額差異",
      "超過",
      ">",
      "百分之五",
      "退回分判商確認差異",
      "stage_reference",
    ),
    condition(
      "核實金額",
      "超過",
      ">",
      "五百萬元",
      "財務總監批准",
      "stage_reference",
    ),
  ]),
  "TC-06": Object.freeze([
    condition(
      "高風險",
      "高風險",
      "=",
      "高風險",
      "行政總裁批准",
      "stage_reference",
    ),
    condition("期限", "超過", ">", "九十日", "行政總裁批准", "stage_reference"),
  ]),
  "TC-07": Object.freeze([
    condition("費用", "超過", ">", "一萬元", "部門主管批准", "stage_reference"),
    condition(
      "法定培訓",
      "未能提供證書",
      "=",
      "證書",
      "不可完成",
      "stage_reference",
    ),
  ]),
  "TC-08": Object.freeze([
    condition(
      "受限制區域",
      "受限制區域",
      "=",
      "受限制區域",
      "資訊保安",
      "stage_reference",
      "主管批准後完成",
      "stage_reference",
    ),
  ]),
  "SC-01": Object.freeze([
    condition(
      "安全影响",
      "为是",
      "=",
      "安全影响",
      "安全评审",
      "stage_reference",
    ),
    condition(
      "成本增加",
      "超过",
      ">",
      "一百万元",
      "额外审批",
      "stage_reference",
    ),
  ]),
  "SC-02": Object.freeze([
    condition(
      "生产数据库",
      "生产数据库",
      "=",
      "生产数据库",
      "数据负责人",
      "stage_reference",
    ),
  ]),
  "SC-03": Object.freeze([
    condition(
      "客户名称",
      "为是",
      "=",
      "客户名称",
      "客户经理",
      "stage_reference",
    ),
    condition(
      "目标地区",
      "不是",
      "!=",
      "香港",
      "当地合规审查",
      "stage_reference",
    ),
  ]),
  "SC-04": Object.freeze([
    condition(
      "申请额度",
      "超过",
      ">",
      "一百万元",
      "财务总监批准",
      "stage_reference",
      "财务经理批准后完成",
      "stage_reference",
    ),
    condition(
      "申请额度",
      "超过",
      ">",
      "五百万元",
      "行政总裁批准",
      "stage_reference",
      "财务总监批准",
      "stage_reference",
    ),
  ]),
  "SC-05": Object.freeze([
    condition(
      "账面净值",
      "超过",
      ">",
      "二十万元",
      "财务总监批准",
      "stage_reference",
    ),
    condition(
      "含数据设备",
      "含数据设备",
      "=",
      "含数据设备",
      "安全审批和清除证明",
      "stage_reference",
    ),
  ]),
  "SC-06": Object.freeze([
    condition(
      "严重程度",
      "为高",
      "=",
      "严重程度为高",
      "高级管理层批准",
      "stage_reference",
    ),
    condition(
      "监管报告",
      "需要监管报告",
      "=",
      "监管报告",
      "高级管理层批准",
      "stage_reference",
    ),
    condition("措施", "未验证", "=", "未验证", "不得结案", "stage_reference"),
  ]),
  "SC-07": Object.freeze([
    condition(
      "总额",
      "超过",
      ">",
      "二万元",
      "部门主管",
      "stage_reference",
      "财务后完成",
      "stage_reference",
    ),
    condition("国际", "国际", "=", "国际", "HR 和安全", "stage_reference"),
    condition(
      "高风险",
      "高风险",
      "=",
      "高风险",
      "HR 和安全",
      "stage_reference",
    ),
  ]),
  "SC-08": Object.freeze([
    condition(
      "关联人士",
      "有关联人士",
      "=",
      "关联人士",
      "独立高管审批",
      "stage_reference",
    ),
    condition(
      "五十万元",
      "超过",
      ">",
      "五十万元",
      "行政总裁",
      "stage_reference",
    ),
    condition(
      "境外受赠机构",
      "境外",
      "=",
      "境外受赠机构",
      "法务审查",
      "stage_reference",
    ),
  ]),
});

const conditionPolicyTerms = Object.freeze({
  "EN-03": t("Both parallel reviews are mandatory"),
  "EN-08": t("does not skip approval"),
  "TC-03": t("No-Go 直接結束並記錄原因"),
  "TC-08": t("到訪日期過後自動失效"),
  "SC-01": t("紧急选项不能跳过审批"),
  "SC-02": t("紧急访问可缩短时限但不可跳过审批|二十四小时后复核"),
  "SC-03": t("性能声明必须经过法务和产品审批"),
});
const collaborationContractsByLanguage = Object.freeze({
  en: Object.freeze({
    documentScopeTerms: t("individual documents|Shared submissions"),
    contributorTerms: t("named contributors"),
    confirmationTerms: t("assigned requester|confirm the final package"),
  }),
  "zh-Hant": Object.freeze({
    documentScopeTerms: t("個別文件|共同提交"),
    contributorTerms: t("指定同事"),
    confirmationTerms: t("指定申請人|確認|整套資料"),
  }),
  "zh-Hans": Object.freeze({
    documentScopeTerms: t("个别文件|共同提交"),
    contributorTerms: t("指定同事"),
    confirmationTerms: t("指定申请人|确认|整套资料"),
  }),
});

function collaborationContractFor(item) {
  if (item.id !== "EN-02")
    return collaborationContractsByLanguage[item.language];
  return Object.freeze({
    documentScopeTerms: t("assigned document|complete package"),
    contributorTerms: t("buyer|receiving officer"),
    confirmationTerms: t("Accounts Payable confirms"),
  });
}

function stageContractsFor(id, manifest) {
  const kinds = stageKindsByScenario[id];
  if (!kinds || kinds.length !== manifest.stages.length) {
    throw new Error(`The stage kind contract is incomplete for ${id}.`);
  }
  const parallelParticipants = new Set(manifest.parallelGroups.flat());
  return Object.freeze(
    manifest.stages.map((participant, index) =>
      Object.freeze({
        participant,
        kind: kinds[index],
        order: index,
        topology: parallelParticipants.has(participant)
          ? "parallel"
          : "ordered",
      }),
    ),
  );
}

function fieldContractsFor(manifest) {
  return Object.freeze(
    manifest.fields.map((label) => Object.freeze({ label, required: true })),
  );
}

function fyiContractsFor(id, manifest) {
  if (id === "EN-01") return Object.freeze([]);
  return Object.freeze(
    manifest.fyiRecipients.map((participant) =>
      Object.freeze({ participant, kind: "for_information" }),
    ),
  );
}

const routeOnlyApprovalNodeContracts = Object.freeze({
  "SC-07": Object.freeze([
    Object.freeze({
      conditionField: "总额",
      routeRole: "matching_route",
      routeTerm: "部门主管",
    }),
  ]),
});

const attachmentContracts = Object.freeze({
  "EN-01": Object.freeze([
    attachment("supplier quotation", {
      formats: [["supplier quotation PDF", "pdf"]],
      quantities: [
        ["minimum_quantity", "one"],
        ["maximum_quantity", "two more quotation PDFs"],
      ],
      maximumFileSizeTerms: ["20 MB"],
    }),
    attachment("justification form", { kind: "form" }),
  ]),
  "EN-02": Object.freeze([
    attachment("invoice PDF", {
      formats: [["invoice PDF", "pdf"]],
      quantities: [["minimum_quantity", "one invoice PDF"]],
      maximumFileSizeTerms: ["each up to 25 MB"],
    }),
    attachment("purchase order PDF", {
      formats: [["purchase order PDF", "pdf"]],
      quantities: [["minimum_quantity", "one purchase order PDF"]],
      maximumFileSizeTerms: ["each up to 25 MB"],
    }),
    attachment("goods receipt PDF", {
      formats: [["goods receipt PDF", "pdf"]],
      quantities: [["minimum_quantity", "one goods receipt PDF"]],
      maximumFileSizeTerms: ["each up to 25 MB"],
    }),
    attachment("line-item schedule", {
      required: false,
      formats: [["Excel line-item schedule", "excel_csv"]],
    }),
  ]),
  "EN-03": Object.freeze([
    attachment("business-case PDF", {
      formats: [["business-case PDF", "pdf"]],
    }),
    attachment("quotation PDF", { formats: [["quotation PDF", "pdf"]] }),
    attachment("benefits table", { kind: "form" }),
    attachment("optional image", {
      required: false,
      formats: [["optional image", "image"]],
    }),
  ]),
  "EN-04": Object.freeze([
    attachment("receipt images", {
      formats: [
        ["receipt images", "image"],
        ["PDFs", "pdf"],
      ],
      quantities: [
        ["minimum_quantity", "one"],
        ["maximum_quantity", "twenty"],
      ],
      maximumFileSizeTerms: ["10 MB"],
    }),
    attachment("declaration form", { kind: "form" }),
  ]),
  "EN-05": Object.freeze([
    attachment("contract file", {
      formats: [
        ["text", "text"],
        ["PDF", "pdf"],
      ],
      quantities: [["minimum_quantity", "one"]],
    }),
    attachment("redline PDF", {
      required: false,
      formats: [["redline PDF", "pdf"]],
    }),
    attachment("deviation form", { kind: "form" }),
  ]),
  "EN-06": Object.freeze([
    attachment("safety induction certificate", {
      formats: [["safety induction certificate PDF", "pdf"]],
    }),
    attachment("identity image", { formats: [["identity image", "image"]] }),
    attachment("method statement", {
      formats: [["method statement PDF", "pdf"]],
    }),
    attachment("permit-to-work", { kind: "form" }),
  ]),
  "EN-07": Object.freeze([
    attachment("data inventory", {
      formats: [["data inventory CSV", "excel_csv"]],
    }),
    attachment("recipient-risk assessment form", { kind: "form" }),
    attachment("data-protection impact assessment", {
      formats: [["data-protection impact assessment PDF", "pdf"]],
    }),
  ]),
  "EN-08": Object.freeze([
    attachment("supplier quotation or invoice", {
      formats: [["supplier quotation or invoice PDF", "pdf"]],
      quantities: [["minimum_quantity", "one"]],
    }),
    attachment("emergency justification form", { kind: "form" }),
    attachment("incident photo", {
      required: false,
      formats: [["incident photo", "image"]],
    }),
    attachment("proof of instruction"),
  ]),
  "TC-01": Object.freeze([
    attachment("商業登記證", {
      formats: [["商業登記證 PDF", "pdf"]],
      maximumFileSizeTerms: ["每份檔案最多二十五 MB"],
    }),
    attachment("銀行證明", {
      formats: [["銀行證明 PDF", "pdf"]],
      maximumFileSizeTerms: ["每份檔案最多二十五 MB"],
    }),
    attachment("稅務表格", {
      formats: [["稅務表格 PDF", "pdf"]],
      maximumFileSizeTerms: ["每份檔案最多二十五 MB"],
    }),
    attachment("利益衝突聲明表", {
      kind: "form",
      quantities: [["minimum_quantity", "一份"]],
      maximumFileSizeTerms: ["每份檔案最多二十五 MB"],
    }),
  ]),
  "TC-02": Object.freeze([
    attachment("醫生證明", {
      formats: [
        ["醫生證明 PDF", "pdf"],
        ["圖片", "image"],
      ],
    }),
    attachment("預產期證明"),
    attachment("財務影響表", { kind: "form" }),
  ]),
  "TC-03": Object.freeze([
    attachment("招標文件", { formats: [["招標文件 PDF", "pdf"]] }),
    attachment("估算 Excel", { formats: [["估算 Excel", "excel_csv"]] }),
    attachment("風險登記表", { formats: [["風險登記表 Excel", "excel_csv"]] }),
    attachment("Go/No-Go 評分表", { kind: "form" }),
    attachment("技術建議書", {
      formats: [["技術建議書及商務建議書 PDF", "pdf"]],
      stageTerms: [["最後呈交前"]],
    }),
    attachment("商務建議書", {
      formats: [["技術建議書及商務建議書 PDF", "pdf"]],
      stageTerms: [["最後呈交前"]],
    }),
  ]),
  "TC-04": Object.freeze([
    attachment("施工方案", { formats: [["施工方案 PDF", "pdf"]] }),
    attachment("風險評估", { formats: [["風險評估 PDF", "pdf"]] }),
    attachment("圖則", { formats: [["圖則 PDF", "pdf"]] }),
    attachment("檢查表", { kind: "form" }),
    attachment("起重計劃或密閉空間計劃", {
      formats: [["起重計劃或密閉空間計劃 PDF", "pdf"]],
    }),
  ]),
  "TC-05": Object.freeze([
    attachment("分判商申報", { formats: [["分判商申報 PDF", "pdf"]] }),
    attachment("現場量度", { formats: [["現場量度 Excel", "excel_csv"]] }),
    attachment("進度照片", { formats: [["進度照片", "image"]] }),
    attachment("扣款明細表", { kind: "form" }),
    attachment("變更指示", {
      required: false,
      formats: [["變更指示 PDF", "pdf"]],
    }),
  ]),
  "TC-06": Object.freeze([
    attachment("風險評估", { formats: [["風險評估 PDF", "pdf"]] }),
    attachment("補償控制表", { kind: "form" }),
    attachment("法律意見", {
      required: false,
      formats: [["法律意見 PDF", "pdf"]],
    }),
  ]),
  "TC-07": Object.freeze([
    attachment("課程資料", {
      formats: [["課程資料 PDF", "pdf"]],
      stageTerms: [["申請時", "request_submission"]],
    }),
    attachment("報價", {
      formats: [["報價 PDF", "pdf"]],
      stageTerms: [["申請時", "request_submission"]],
    }),
    attachment("證書", {
      formats: [["證書 PDF", "pdf"]],
      stageTerms: [["完成後"]],
    }),
    attachment("學習成果表", { kind: "form", stageTerms: [["完成後"]] }),
  ]),
  "TC-08": Object.freeze([
    attachment("保密協議", { formats: [["保密協議 PDF", "pdf"]] }),
    attachment("器材及資料存取聲明表", { kind: "form" }),
  ]),
  "SC-01": Object.freeze([
    attachment("修订图纸", { formats: [["修订图纸 PDF", "pdf"]] }),
    attachment("变更说明 PDF", { formats: [["变更说明 PDF", "pdf"]] }),
    attachment("成本与工期影响表", { kind: "form" }),
    attachment("计算书", { formats: [["计算书 PDF", "pdf"]] }),
  ]),
  "SC-02": Object.freeze([
    attachment("最小权限检查表", { kind: "form" }),
    attachment("风险评估", { formats: [["风险评估 PDF", "pdf"]] }),
    attachment("事故或故障工单", {
      formats: [
        ["文本", "text"],
        ["PDF", "pdf"],
      ],
    }),
  ]),
  "SC-03": Object.freeze([
    attachment("文案", {
      formats: [
        ["文案和设计稿 PDF", "pdf"],
        ["图片", "image"],
      ],
    }),
    attachment("设计稿", {
      formats: [
        ["文案和设计稿 PDF", "pdf"],
        ["图片", "image"],
      ],
    }),
    attachment("客户同意书", { formats: [["客户同意书 PDF", "pdf"]] }),
    attachment("声明依据表", { kind: "form" }),
  ]),
  "SC-04": Object.freeze([
    attachment("信用报告", { formats: [["信用报告 PDF", "pdf"]] }),
    attachment("财务报表", { formats: [["财务报表 PDF", "pdf"]] }),
    attachment("应收账款分析表", { kind: "form" }),
    attachment("担保文件", { formats: [["担保文件 PDF", "pdf"]] }),
  ]),
  "SC-05": Object.freeze([
    attachment("资产照片", { formats: [["资产照片", "image"]] }),
    attachment("资产登记截图", { formats: [["资产登记截图", "image"]] }),
    attachment("报价", { formats: [["报价 PDF", "pdf"]] }),
    attachment("受赠机构审查表", { kind: "form" }),
    attachment("数据清除证明", { formats: [["数据清除证明 PDF", "pdf"]] }),
  ]),
  "SC-06": Object.freeze([
    attachment("事故报告", { formats: [["事故报告 PDF", "pdf"]] }),
    attachment("现场照片", { formats: [["现场照片", "image"]] }),
    attachment("根本原因和措施表", { kind: "form" }),
    attachment("报告副本", { formats: [["报告副本 PDF", "pdf"]] }),
  ]),
  "SC-07": Object.freeze([
    attachment("行程或邀请函", { formats: [["行程或邀请函 PDF", "pdf"]] }),
    attachment("费用预算表", { kind: "form" }),
    attachment("旅行风险评估", { formats: [["旅行风险评估 PDF", "pdf"]] }),
    attachment("护照资料页", { required: false }),
  ]),
  "SC-08": Object.freeze([
    attachment("受赠机构注册证明", {
      formats: [["受赠机构注册证明 PDF", "pdf"]],
    }),
    attachment("方案", { formats: [["方案 PDF", "pdf"]] }),
    attachment("尽职调查和利益冲突表", { kind: "form" }),
    attachment("物品清单", { formats: [["物品清单 Excel", "excel_csv"]] }),
  ]),
});
/*
 * These are reviewed semantic entities, not compiler defaults. Terms are exact
 * source phrases (or an unpunctuated substring of one phrase) and counts are
 * exact named requirements, including optional and conditional entities.
 */
const reviewed = {
  "EN-01": {
    fields: t(
      "purpose|supplier|cost centre|currency|total amount|needed-by date|Goods or Services",
    ),
    attachments: t("supplier quotation|justification form"),
    stages: t("department manager|Procurement|Finance|General Manager"),
    conditions: t("total amount"),
    parallelGroups: groups("Finance|General Manager"),
    fyiRecipients: t("requester"),
    visibilityTerms: t("only purpose|final quotation"),
    rejectionTerms: t("requester|correction"),
  },
  "EN-02": {
    fields: t(
      "supplier|invoice number|invoice date|PO number|currency|invoice total|PO total|goods-received total|tax amount",
    ),
    attachments: t(
      "invoice PDF|purchase order PDF|goods receipt PDF|line-item schedule",
    ),
    stages: t("cost centre owner|Finance Manager"),
    conditions: t("invoice total"),
    parallelGroups: groups(),
    fyiRecipients: t("Treasury"),
    visibilityTerms: t("only supplier|invoice PDF"),
    rejectionTerms: t("Accounts Payable"),
    collaborationTerms: t("buyer|receiving officer|confirms"),
  },
  "EN-03": {
    fields: t(
      "asset description|business case|amount|currency|budget code|expected life|payback months|risk rating",
    ),
    attachments: t(
      "business-case PDF|quotation PDF|benefits table|optional image",
    ),
    stages: t("Department Head|Finance Controller|Technical Director|CFO"),
    conditions: t("parallel reviews|2,000,000"),
    parallelGroups: groups("Finance Controller|Technical Director"),
    fyiRecipients: t("Board Secretary"),
    visibilityTerms: t("not payback assumptions"),
    rejectionTerms: t("correction"),
  },
  "EN-04": {
    fields: t(
      "expense date|category|merchant|purpose|currency|amount|cost centre|client-billable|missing-receipt",
    ),
    attachments: t("receipt images|declaration form"),
    stages: t("line manager|Finance|Department Head"),
    conditions: t("10,000"),
    parallelGroups: groups(),
    fyiRecipients: t("Payroll"),
    visibilityTerms: t("not bank details"),
    rejectionTerms: t("correction"),
  },
  "EN-05": {
    fields: t(
      "counterparty|contract type|start|end dates|value|currency|auto-renewal|personal-data|governing law|business owner",
    ),
    attachments: t("contract file|redline PDF|deviation form"),
    stages: t(
      "Business owner|Legal|Finance|Data Protection|authorised signatory",
    ),
    conditions: t("500,000|personal-data"),
    parallelGroups: groups("Legal|Finance"),
    fyiRecipients: t(""),
    visibilityTerms: t("only privacy fields|not unrelated clauses"),
    rejectionTerms: t("contract owner"),
  },
  "EN-06": {
    fields: t(
      "person name|employer|identity type|last four characters|visit date|arrival|departure time|work area|host|work activity|vehicle registration|high-risk-work",
    ),
    attachments: t(
      "safety induction certificate|identity image|method statement|permit-to-work",
    ),
    stages: t("Host|Safety Officer|Security Officer|Site Manager"),
    conditions: t("High-risk visits|Missing induction"),
    parallelGroups: groups("Safety Officer|Security Officer"),
    fyiRecipients: t("Gatehouse"),
    visibilityTerms: t("must not see the method statement"),
    rejectionTerms: t("coordinator"),
  },
  "EN-07": {
    fields: t(
      "dataset|purpose|recipient organisation|recipient country|transfer method|personal-data|sensitive-data|record count|retention days|deletion date",
    ),
    attachments: t(
      "data inventory|recipient-risk assessment form|data-protection impact assessment",
    ),
    stages: t(
      "Line manager|Information Security|Data Protection|Legal|Data Owner",
    ),
    conditions: t("personal or sensitive data|country other than Hong Kong"),
    parallelGroups: groups("Information Security|Data Protection"),
    fyiRecipients: t(""),
    visibilityTerms: t("no system access or documents"),
    rejectionTerms: t("correction"),
  },
  "EN-08": {
    fields: t(
      "emergency category|incident description|supplier|amount|currency|why competition is impossible|service impact|purchase time|retrospective flag",
    ),
    attachments: t(
      "supplier quotation or invoice|emergency justification form|incident photo|proof of instruction",
    ),
    stages: t("Duty manager|Procurement|Finance|General Manager|CEO"),
    conditions: t("100,000|Retrospective status"),
    parallelGroups: groups("Procurement|Finance"),
    fyiRecipients: t("Internal Audit"),
    visibilityTerms: t(""),
    rejectionTerms: t("correction loop"),
  },
  "TC-01": {
    fields: t(
      "公司中英文名稱|註冊地|公司編號|地址|聯絡人|電郵|電話|付款貨幣|付款條款|銀行所在地|供應類別",
    ),
    attachments: t("商業登記證|銀行證明|稅務表格|利益衝突聲明表"),
    stages: t("採購經理|財務供應商資料組|合規主任|採購總監|法務|高級管理層"),
    conditions: t("註冊地或銀行所在地|利益衝突"),
    parallelGroups: groups("財務供應商資料組|合規主任"),
    fyiRecipients: t(""),
    visibilityTerms: t("財務只看銀行及付款資料|合規只看公司資料"),
    rejectionTerms: t("補正"),
  },
  "TC-02": {
    fields: t("假別|開始|結束日期|日數|原因|工作交接人電郵|半日選項"),
    attachments: t("醫生證明|預產期證明|財務影響表"),
    stages: t("直屬主管|HR|部門主管"),
    conditions: t("三日|無薪假"),
    parallelGroups: groups(),
    fyiRecipients: t("交接人"),
    visibilityTerms: t("不可看到醫療證明"),
    rejectionTerms: t("員工|修改"),
  },
  "TC-03": {
    fields: t(
      "客戶|項目|投標截止時間|估算合約額|保證金|毛利率|策略重要性|聯營選項|負責人",
    ),
    attachments: t(
      "招標文件|估算 Excel|風險登記表|Go/No-Go 評分表|技術建議書|商務建議書",
    ),
    stages: t("投標總監|工程|商務|財務|法務|行政總裁|董事會主席"),
    conditions: t("No-Go|一億元|聯營投標"),
    parallelGroups: groups("工程|商務|財務|法務"),
    fyiRecipients: t(""),
    visibilityTerms: t("每組只看自己的欄位及文件"),
    rejectionTerms: t("投標負責人"),
  },
  "TC-04": {
    fields: t(
      "工程項目|位置|工序|開始日期|工期|負責工程師|高風險工序|許可證類型",
    ),
    attachments: t("施工方案|風險評估|圖則|檢查表|起重計劃或密閉空間計劃"),
    stages: t("工程經理|合約安全主任|質量主任|項目經理|公司安全主管"),
    conditions: t("高風險工序"),
    parallelGroups: groups("工程經理|合約安全主任|質量主任"),
    fyiRecipients: t("現場管工"),
    visibilityTerms: t("只可看已批准版本"),
    rejectionTerms: t("編製人|修正"),
  },
  "TC-05": {
    fields: t(
      "分判商|合約編號|估值期|申報金額|核實金額|保留金|前期累計|變更工程金額|成本代碼",
    ),
    attachments: t("分判商申報|現場量度|進度照片|扣款明細表|變更指示"),
    stages: t("地盤工程師|項目工料測量師|項目經理|財務|商務總監|財務總監"),
    conditions: t("百分之五|五百萬元"),
    parallelGroups: groups("項目經理|財務"),
    fyiRecipients: t(""),
    visibilityTerms: t("工程師不看銀行資料"),
    rejectionTerms: t("修正"),
  },
  "TC-06": {
    fields: t(
      "政策名稱及條款|豁免原因|開始|結束日期|風險等級|受影響人數|補償控制|負責人",
    ),
    attachments: t("風險評估|補償控制表|法律意見"),
    stages: t("政策負責人|風險管理|合規|行政總監|行政總裁"),
    conditions: t("高風險或期限超過九十日"),
    parallelGroups: groups("風險管理|合規"),
    fyiRecipients: t(""),
    visibilityTerms: t("風險評估只給審批參與者"),
    rejectionTerms: t("修正"),
  },
  "TC-07": {
    fields: t(
      "員工|課程名稱|供應機構|開始日期|費用|貨幣|培訓類別|法定要求|預期成果",
    ),
    attachments: t("課程資料|報價|證書|學習成果表"),
    stages: t("直屬主管|培訓經理|部門主管|主管確認"),
    conditions: t("一萬元|法定培訓"),
    parallelGroups: groups("直屬主管|培訓經理"),
    fyiRecipients: t("HR"),
    visibilityTerms: t(""),
    rejectionTerms: t("修改"),
  },
  "TC-08": {
    fields: t(
      "訪客姓名|機構|電郵|電話|到訪日期|時間|目的|接待人|辦公地點|受限制區域|器材攜入清單",
    ),
    attachments: t("保密協議|器材及資料存取聲明表"),
    stages: t("接待人主管|資訊保安"),
    conditions: t("受限制區域|到訪日期"),
    parallelGroups: groups(),
    fyiRecipients: t("接待處"),
    visibilityTerms: t("不可看保密協議內容"),
    rejectionTerms: t("申請人"),
  },
  "SC-01": {
    fields: t(
      "项目|图纸编号|变更说明|变更原因|成本影响|工期影响天数|安全影响|客户指令编号|紧急选项",
    ),
    attachments: t("修订图纸|变更说明 PDF|成本与工期影响表|计算书"),
    stages: t("设计经理|工程|商务|安全|项目经理|商业总监"),
    conditions: t("安全影响|一百万元|紧急选项"),
    parallelGroups: groups("工程|商务|安全"),
    fyiRecipients: t(""),
    visibilityTerms: t("只看相关字段和文件"),
    rejectionTerms: t("修改"),
  },
  "SC-02": {
    fields: t(
      "用户|系统|权限角色|业务理由|开始日期|结束日期|生产环境|导出数据|紧急访问|工单号",
    ),
    attachments: t("最小权限检查表|风险评估|事故或故障工单"),
    stages: t("直属主管|系统负责人|信息安全|数据负责人"),
    conditions: t("生产数据库|紧急访问"),
    parallelGroups: groups("系统负责人|信息安全"),
    fyiRecipients: t("IT 运维"),
    visibilityTerms: t("只看用户、系统、角色、有效期和批准结果"),
    rejectionTerms: t("修改"),
  },
  "SC-03": {
    fields: t(
      "活动名称|渠道|目标受众|发布日期|国家或地区|产品|预算|客户名称|性能声明|材料负责人",
    ),
    attachments: t("文案|设计稿|客户同意书|声明依据表"),
    stages: t("品牌经理|法务|产品负责人|客户经理|当地合规"),
    conditions: t("性能声明|客户名称|目标地区"),
    parallelGroups: groups("法务|产品负责人"),
    fyiRecipients: t("发布团队"),
    visibilityTerms: t("只看最终已批准材料"),
    rejectionTerms: t("修改"),
  },
  "SC-04": {
    fields: t(
      "客户|现有额度|申请额度|币种|付款期限|预计月销售额|逾期余额|风险等级|担保方式|理由",
    ),
    attachments: t("信用报告|财务报表|应收账款分析表|担保文件"),
    stages: t("销售总监|信用控制|财务经理|财务总监|行政总裁"),
    conditions: t("一百万元|五百万元"),
    parallelGroups: groups("信用控制|财务经理"),
    fyiRecipients: t(""),
    visibilityTerms: t("不得看到完整信用报告"),
    rejectionTerms: t("修改"),
  },
  "SC-05": {
    fields: t(
      "资产编号|类别|地点|账面净值|估计残值|处置方式|原因|存有数据|买方或受赠方|目标日期",
    ),
    attachments: t("资产照片|资产登记截图|报价|受赠机构审查表|数据清除证明"),
    stages: t("部门主管|资产管理|财务|信息安全|财务总监"),
    conditions: t("二十万元|含数据设备"),
    parallelGroups: groups("资产管理|财务"),
    fyiRecipients: t("资产登记团队"),
    visibilityTerms: t("只看资产、方式、日期和批准结果"),
    rejectionTerms: t("修改"),
  },
  "SC-06": {
    fields: t(
      "事故编号|类别|发生时间|地点|严重程度|描述|即时措施|根本原因负责人|目标结案日|监管报告",
    ),
    attachments: t("事故报告|现场照片|根本原因和措施表|报告副本"),
    stages: t("部门主管|安全|质量|措施负责人|独立验证人|流程负责人|高级管理层"),
    conditions: t("严重程度为高或需要监管报告|未验证"),
    parallelGroups: groups("安全|质量"),
    fyiRecipients: t("相关管理层"),
    visibilityTerms: t(""),
    rejectionTerms: t("措施负责人|修改"),
  },
  "SC-07": {
    fields: t(
      "目的|城市|国家|出发|返回日期|交通方式|酒店晚数|预计机票|酒店|餐费|其他费用|总额|客户项目|高风险地区",
    ),
    attachments: t("行程或邀请函|费用预算表|旅行风险评估|护照资料页"),
    stages: t("直属主管|财务|HR|安全"),
    conditions: t("二万元|国际或高风险"),
    parallelGroups: groups("HR|安全"),
    fyiRecipients: t("旅行服务团队"),
    visibilityTerms: t("不看护照附件"),
    rejectionTerms: t("修改"),
  },
  "SC-08": {
    fields: t(
      "受赠机构|注册地|捐赠类型|金额或实物价值|币种|目的|受益人|关联人士|宣传权益|付款日期",
    ),
    attachments: t("受赠机构注册证明|方案|尽职调查和利益冲突表|物品清单"),
    stages: t("企业事务|合规|财务|行政总监|行政总裁|独立高管|法务"),
    conditions: t("关联人士|五十万元|境外受赠机构"),
    parallelGroups: groups("合规|财务"),
    fyiRecipients: t("付款团队"),
    visibilityTerms: t("只看受赠机构、金额、日期和批准结果"),
    rejectionTerms: t("修改"),
  },
};

const corpusFingerprint = `sha256:${createHash("sha256")
  .update(JSON.stringify(templateCopilotQualificationScenarios))
  .digest("hex")}`;
if (corpusFingerprint !== templateCopilotV3SemanticManifestCorpusFingerprint) {
  throw new Error(
    "The Template Copilot v3 semantic manifest corpus fingerprint drifted.",
  );
}

const scenarioById = new Map(
  templateCopilotQualificationScenarios.map((item) => [item.id, item]),
);
if (
  scenarioById.size !== 24 ||
  Object.keys(reviewed).length !== scenarioById.size ||
  Object.keys(reviewed).some((id) => !scenarioById.has(id))
) {
  throw new Error("The Template Copilot v3 semantic manifests are incomplete.");
}

export const templateCopilotV3SemanticScenarioManifests = Object.freeze(
  Object.fromEntries(
    Object.entries(reviewed).map(([id, manifest]) => {
      const item = scenarioById.get(id);
      const sourceSlots = Object.freeze({ ...answersForScenario(item) });
      const fields = fieldContractsFor(manifest);
      const baseAttachments = attachmentContracts[id];
      const attachments = baseAttachments
        ? Object.freeze(
            baseAttachments.map((contract) =>
              attachmentContractWithEvidence(contract, sourceSlots.attachments),
            ),
          )
        : null;
      const stages = stageContractsFor(id, manifest);
      const conditions = conditionContracts[id];
      const fyiRecipients = fyiContractsFor(id, manifest);
      const handoff = handoffContracts[id];
      const visibilitySlot = [
        ...manifest.visibilityTerms,
        ...handoff.selectedFieldTerms,
        ...handoff.restrictedDocumentTerms,
      ].length
        ? "stages_participants"
        : "visibility_notifications";
      const scalarFacts = scalarFactContractsFor(sourceSlots, visibilitySlot);
      const collaboration = collaborationContractFor(item);
      const workflowNotifications =
        workflowNotificationContracts[id] ?? Object.freeze([]);
      const notificationRules = Object.freeze([
        ...notificationContractsByLanguage[item.language],
        ...workflowNotifications,
      ]);
      const routeOnlyApprovalNodes =
        routeOnlyApprovalNodeContracts[id] ?? Object.freeze([]);
      const routeOnlyApprovalNodesAreValid = routeOnlyApprovalNodes.every(
        (routeNode) => {
          if (
            stages.some((stage) => stage.participant === routeNode.routeTerm)
          ) {
            return false;
          }
          const boundCondition = conditions.find(
            (entry) => entry.field === routeNode.conditionField,
          );
          if (!boundCondition) return false;
          const route =
            routeNode.routeRole === "matching_route"
              ? boundCondition.matchingRoute
              : routeNode.routeRole === "otherwise_route"
                ? boundCondition.otherwiseRoute
                : null;
          return (
            route?.term === routeNode.routeTerm &&
            route.hint === "stage_reference"
          );
        },
      );
      const notificationSlotsAreValid = notificationRules.every(
        (rule) =>
          ["visibility_notifications", "stages_participants"].includes(
            rule.slot,
          ) &&
          (rule.slot === "visibility_notifications"
            ? rule.visibility !== null
            : rule.visibility === null),
      );
      if (
        !attachments ||
        !conditions ||
        !handoff ||
        !collaboration ||
        !notificationRules ||
        scalarFacts.length !== 11 ||
        scalarFacts.some(
          (contract) =>
            !contract.exactSource ||
            contract.exactSource !== sourceSlots[contract.slot],
        ) ||
        attachments?.some(
          (contract) =>
            ![
              "required",
              "optional",
              "conditional",
              "required_with_conditional_extension",
            ].includes(contract.requirementMode) ||
            contract.evidenceClauses.length === 0,
        ) ||
        !routeOnlyApprovalNodesAreValid ||
        !notificationSlotsAreValid ||
        attachments.map((entry) => entry.label).join("\n") !==
          manifest.attachments.join("\n") ||
        attachments.some((entry) => entry.kind === "form") !==
          item.expectations.requireManualForm ||
        (fyiRecipients.length > 0 || workflowNotifications.length > 0) !==
          item.expectations.requireFyi ||
        handoff.selectedFieldTerms.length > 0 !==
          item.expectations.requireSelectedFieldHandoff ||
        handoff.restrictedDocumentTerms.length > 0 !==
          item.expectations.requireRestrictedDocumentHandoff
      ) {
        throw new Error(
          `The structured semantic contract is incomplete for ${id}.`,
        );
      }
      return [
        id,
        Object.freeze({
          version: templateCopilotV3SemanticManifestVersion,
          id,
          language: item.language,
          archetype: item.archetype,
          sourceSlots,
          requiredFactIds: allFactIds,
          scalarFacts,
          fields,
          attachments,
          stages,
          conditions,
          parallelGroups: manifest.parallelGroups,
          fyiRecipients,
          notificationRules,
          routeOnlyApprovalNodes,
          handoff: Object.freeze(handoff),
          visibilityTerms: manifest.visibilityTerms,
          rejectionTerms: manifest.rejectionTerms,
          collaboration: Object.freeze(collaboration),
          conditionPolicyTerms: conditionPolicyTerms[id] ?? t(""),
          criticalTerms: Object.freeze([...item.expectations.requiredTerms]),
          flags: Object.freeze({
            requireFyi: item.expectations.requireFyi,
            requireFyiRecipient: fyiRecipients.length > 0,
            requireWorkflowNotification: workflowNotifications.length > 0,
            requireRejectRoute: item.expectations.requireRejectRoute,
            requireParallelFanout: item.expectations.requireParallelFanout,
            requireManualForm: item.expectations.requireManualForm,
            requireSharedFulfillment:
              item.expectations.requireSharedFulfillment,
            requireSelectedFieldHandoff:
              item.expectations.requireSelectedFieldHandoff,
            requireRestrictedDocumentHandoff:
              item.expectations.requireRestrictedDocumentHandoff,
          }),
        }),
      ];
    }),
  ),
);

export function templateCopilotV3SemanticScenarioManifest(id) {
  return templateCopilotV3SemanticScenarioManifests[id] ?? null;
}
