import assert from "node:assert/strict";
import test from "node:test";
import {
  templateCopilotQualificationScenarios,
} from "../../scripts/template-copilot-qualification-scenarios.mjs";
import {
  templateCopilotV3SemanticManifestVersion,
  templateCopilotV3SemanticScenarioManifest,
} from "../../scripts/template-copilot-v3-semantic-scenario-manifests.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const c = (
  field,
  operator,
  operatorHint,
  value,
  matchingRoute,
  matchingHint,
  otherwiseRoute = null,
  otherwiseHint = null,
  mode = "structured",
  currency = null,
) => ({
  contract: [
    field,
    operator,
    operatorHint,
    value,
    matchingRoute,
    matchingHint,
    otherwiseRoute,
    otherwiseHint,
    mode,
  ],
  currency,
});

/*
 * Independently authored gold inventory. Source text, participant order,
 * condition roles, routes, execution mode, and currency are fixed here rather
 * than generated from the manifest under test.
 */
const gold = deepFreeze({
  "EN-01": {
    source: "Use total amount below HKD 50,000 versus at least HKD 50,000 as complete branches. If either high-value approver rejects, return to the requester for correction. If both approve, complete.",
    stages: ["department manager", "Procurement", "Finance", "General Manager"],
    conditions: [
      c("total amount", "at least", ">=", "50,000", "high-value approver", "unsupported_outcome", "complete", "complete", "unsupported_semantics_not_executable", "HKD"),
    ],
  },
  "EN-02": {
    source: "If invoice total equals both PO total and goods-received total, skip mismatch review and go to Finance Manager. Otherwise require cost centre owner review. Rejection returns to Accounts Payable.",
    stages: ["cost centre owner", "Finance Manager"],
    conditions: [
      c("invoice total", "equals", "=", "both PO total and goods-received total", "Finance Manager", "stage_reference", "cost centre owner", "stage_reference", "compound_predicate_not_executable"),
    ],
  },
  "EN-03": {
    source: "Both parallel reviews are mandatory. Any rejection returns for correction. The Board FYI applies only above HKD 2,000,000; otherwise complete after CFO.",
    stages: ["Department Head", "Finance Controller", "Technical Director", "CFO"],
    conditions: [
      c("Board FYI", "above", "unsupported_predicate", "2,000,000", "Board FYI", "unsupported_outcome", "complete", "complete", "unsupported_semantics_not_executable", "HKD"),
    ],
  },
  "EN-04": {
    source: "If total exceeds HKD 10,000 or a receipt is missing, add Department Head approval before Finance. Otherwise go from line manager to Finance. Rejection returns for correction.",
    stages: ["line manager", "Department Head", "Finance"],
    conditions: [
      c("total", "exceeds", ">", "10,000", "Department Head", "stage_reference", "Finance", "stage_reference", "unsupported_semantics_not_executable", "HKD"),
    ],
  },
  "EN-05": {
    source: "Finance is required only above HKD 500,000. Data Protection is required only when personal-data choice is Yes. Both conditions can be true at the same time. Any rejection returns to the contract owner.",
    stages: ["Business owner", "Legal", "Finance", "Data Protection", "authorised signatory"],
    conditions: [
      c("Finance", "above", "unsupported_predicate", "500,000", "Finance", "stage_reference", null, null, "unsupported_semantics_not_executable", "HKD"),
      c("personal-data choice", "personal", "=", "Yes", "Data Protection", "stage_reference"),
    ],
  },
  "EN-06": {
    source: "Normal visits complete after both Safety and Security approve. High-risk visits require Site Manager after both. Any rejection returns to the coordinator. Missing induction blocks submission.",
    stages: ["Host", "Safety Officer", "Security Officer", "Site Manager"],
    conditions: [
      c("visits", "High-risk", "=", "High-risk", "Site Manager", "stage_reference", "complete after both Safety and Security approve", "unsupported_outcome", "unsupported_semantics_not_executable"),
      c("induction", "Missing", "=", "Missing", "blocks submission", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "EN-07": {
    source: "Low-risk non-personal Hong Kong transfers require Information Security only. Personal or sensitive data also requires Data Protection. A country other than Hong Kong also requires Legal. All required branches must approve; rejection returns for correction.",
    stages: ["Line manager", "Information Security", "Data Protection", "Legal", "Data Owner"],
    conditions: [
      c("Personal or sensitive data", "Personal or sensitive data", "unsupported_predicate", "Personal or sensitive data", "Data Protection", "stage_reference", null, null, "unsupported_semantics_not_executable"),
      c("country", "other than", "!=", "Hong Kong", "Legal", "stage_reference"),
    ],
  },
  "EN-08": {
    source: "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval. Retrospective status does not skip approval. Any rejection creates a correction loop.",
    stages: ["Duty manager", "Procurement", "Finance", "General Manager", "CEO"],
    conditions: [
      c("amount", "at most", "<=", "100,000", "General Manager", "stage_reference", null, null, "unsupported_semantics_not_executable", "HKD"),
      c("amount", "Above", ">", "100,000", "CEO approval", "stage_reference", null, null, "unsupported_semantics_not_executable", "HKD"),
      c("status", "Retrospective", "=", "Retrospective", "does not skip approval", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "TC-01": {
    source: "若註冊地或銀行所在地不在香港，增加法務審查；若申報有利益衝突，增加高級管理層審批。兩個條件可同時成立。任何拒絕都退回補正。",
    stages: ["採購經理", "財務供應商資料組", "合規主任", "法務", "高級管理層", "採購總監"],
    conditions: [
      c("註冊地或銀行所在地", "註冊地或銀行所在地", "unsupported_predicate", "註冊地或銀行所在地", "法務審查", "stage_reference", null, null, "unsupported_semantics_not_executable"),
      c("利益衝突", "申報有利益衝突", "=", "有利益衝突", "高級管理層審批", "stage_reference"),
    ],
  },
  "TC-02": {
    source: "病假日數三日或以上才要求醫生證明。無薪假走額外部門主管路徑。其他假別在 HR 核對後完成。拒絕退回員工修改。",
    stages: ["直屬主管", "HR", "部門主管"],
    conditions: [
      c("病假日數", "三日或以上", ">=", "三日", "醫生證明", "unsupported_outcome", "HR 核對後完成", "unsupported_outcome", "unsupported_semantics_not_executable"),
      c("無薪假", "無薪假", "=", "無薪假", "部門主管路徑", "stage_reference", "HR 核對後完成", "unsupported_outcome", "unsupported_semantics_not_executable"),
    ],
  },
  "TC-03": {
    source: "No-Go 直接結束並記錄原因。估算合約額超過港幣一億元時增加董事會主席批准。聯營投標必須增加法務審查。任何修改要求返回投標負責人。",
    stages: ["投標總監", "工程", "商務", "財務", "法務", "行政總裁", "董事會主席"],
    conditions: [
      c("No-Go", "No-Go", "=", "No-Go", "直接結束並記錄原因", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
      c("估算合約額", "超過", ">", "一億元", "董事會主席批准", "stage_reference", null, null, "unsupported_semantics_not_executable", "港幣"),
      c("投標", "聯營投標", "unsupported_predicate", "聯營", "法務審查", "stage_reference", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "TC-04": {
    source: "高風險工序必須增加公司安全主管批准。非高風險則項目經理後完成。任何拒絕退回編製人修正，舊版本保留於歷史。",
    stages: ["工程經理", "合約安全主任", "質量主任", "項目經理", "公司安全主管"],
    conditions: [
      c("工序", "高風險", "=", "高風險", "公司安全主管批准", "stage_reference", "項目經理後完成", "unsupported_outcome", "unsupported_semantics_not_executable"),
    ],
  },
  "TC-05": {
    source: "若申報金額與核實金額差異超過百分之五，必須先退回分判商確認差異。若核實金額超過港幣五百萬元，增加財務總監批准。拒絕退回修正。",
    stages: ["地盤工程師", "項目工料測量師", "項目經理", "財務", "財務總監", "商務總監"],
    conditions: [
      c("申報金額與核實金額差異", "超過", "unsupported_predicate", "百分之五", "退回分判商確認差異", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
      c("核實金額", "超過", ">", "五百萬元", "財務總監批准", "stage_reference", null, null, "unsupported_semantics_not_executable", "港幣"),
    ],
  },
  "TC-06": {
    source: "高風險或期限超過九十日者增加行政總裁批准。期限屆滿前七日通知負責人。拒絕退回修正；批准不可自動變成永久例外。",
    stages: ["政策負責人", "風險管理", "合規", "行政總監", "行政總裁"],
    conditions: [
      c("高風險或期限超過九十日", "高風險或期限超過九十日", "unsupported_predicate", "高風險或期限超過九十日", "行政總裁批准", "stage_reference", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "TC-07": {
    source: "費用超過港幣一萬元增加部門主管批准。法定培訓未能提供證書時不可完成。拒絕退回修改，逾期未補證書要提醒。",
    stages: ["直屬主管", "培訓經理", "部門主管", "員工", "主管確認", "HR"],
    conditions: [
      c("費用", "超過", ">", "一萬元", "部門主管批准", "stage_reference", null, null, "unsupported_semantics_not_executable", "港幣"),
      c("法定培訓", "未能提供證書", "unsupported_predicate", "證書", "不可完成", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "TC-08": {
    source: "普通辦公室到訪在主管批准後完成。受限制區域必須再經資訊保安。拒絕退回申請人；到訪日期過後自動失效。",
    stages: ["接待人主管", "資訊保安"],
    conditions: [
      c("區域", "受限制區域", "=", "受限制", "資訊保安", "stage_reference", "主管批准後完成", "unsupported_outcome", "unsupported_semantics_not_executable"),
    ],
  },
  "SC-01": {
    source: "安全影响为是时安全评审必须阻塞流程。成本增加超过港币一百万元走额外审批。紧急选项不能跳过审批。任何拒绝退回修改。",
    stages: ["设计经理", "工程", "商务", "安全", "项目经理", "商业总监"],
    conditions: [
      c("安全影响", "为是", "=", "是", "安全评审", "stage_reference"),
      c("成本增加", "超过", ">", "一百万元", "额外审批", "unsupported_outcome", null, null, "unsupported_semantics_not_executable", "港币"),
    ],
  },
  "SC-02": {
    source: "非生产只需主管、系统负责人和安全。生产数据库增加数据负责人。紧急访问可缩短时限但不可跳过审批，并在二十四小时后复核。拒绝退回修改。",
    stages: ["直属主管", "系统负责人", "信息安全", "数据负责人"],
    conditions: [
      c("数据库", "生产数据库", "unsupported_predicate", "生产", "数据负责人", "stage_reference", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "SC-03": {
    source: "性能声明必须经过法务和产品审批。客户名称为是时增加客户经理。若目标地区不是香港，增加当地合规审查。拒绝退回修改。",
    stages: ["品牌经理", "法务", "产品负责人", "客户经理", "当地合规"],
    conditions: [
      c("客户名称", "为是", "=", "是", "客户经理", "stage_reference"),
      c("目标地区", "不是", "!=", "香港", "当地合规审查", "stage_reference"),
    ],
  },
  "SC-04": {
    source: "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。拒绝退回修改。",
    stages: ["销售总监", "信用控制", "财务经理", "财务总监", "行政总裁"],
    conditions: [
      c("申请额度", "不超过", "<=", "一百万元", "财务经理批准后完成", "unsupported_outcome", null, null, "unsupported_semantics_not_executable", "港币"),
      c("申请额度", "超过", ">", "一百万元", "财务总监批准", "stage_reference", null, null, "unsupported_semantics_not_executable", "港币"),
      c("申请额度", "超过", ">", "五百万元", "行政总裁批准", "stage_reference", null, null, "unsupported_semantics_not_executable", "港币"),
    ],
  },
  "SC-05": {
    source: "账面净值超过港币二十万元增加财务总监批准。含数据设备必须在处置前完成安全审批和清除证明。拒绝退回修改。",
    stages: ["部门主管", "资产管理", "财务", "信息安全", "财务总监"],
    conditions: [
      c("账面净值", "超过", ">", "二十万元", "财务总监批准", "stage_reference", null, null, "unsupported_semantics_not_executable", "港币"),
      c("设备", "含数据设备", "=", "含数据", "安全审批和清除证明", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "SC-06": {
    source: "严重程度为高或需要监管报告时增加高级管理层批准。任何措施未验证不得结案。验证失败退回措施负责人修改，不应新建无关申请。",
    stages: ["部门主管", "安全", "质量", "措施负责人", "独立验证人", "高级管理层", "流程负责人"],
    conditions: [
      c("严重程度为高或需要监管报告", "严重程度为高或需要监管报告", "unsupported_predicate", "严重程度为高或需要监管报告", "高级管理层批准", "stage_reference", null, null, "unsupported_semantics_not_executable"),
      c("措施", "未验证", "unsupported_predicate", "未验证", "不得结案", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "SC-07": {
    source: "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。国际或高风险增加 HR 和安全。拒绝退回修改。",
    stages: ["直属主管", "财务", "HR", "安全"],
    conditions: [
      c("总额", "不超过", "<=", "二万元", "财务后完成", "unsupported_outcome", null, null, "unsupported_semantics_not_executable", "港币"),
      c("总额", "超过", ">", "二万元", "部门主管", "stage_reference", null, null, "unsupported_semantics_not_executable", "港币"),
      c("国际或高风险", "国际或高风险", "unsupported_predicate", "国际或高风险", "HR 和安全", "unsupported_outcome", null, null, "unsupported_semantics_not_executable"),
    ],
  },
  "SC-08": {
    source: "有关联人士时增加独立高管审批。超过港币五十万元增加行政总裁。境外受赠机构增加法务审查。所有适用分支必须批准；拒绝退回修改。",
    stages: ["企业事务", "合规", "财务", "行政总监", "行政总裁", "独立高管", "法务"],
    conditions: [
      c("关联人士", "有关联人士", "=", "有", "独立高管审批", "stage_reference"),
      c("超过港币五十万元", "超过", "unsupported_predicate", "五十万元", "行政总裁", "stage_reference", null, null, "unsupported_semantics_not_executable", "港币"),
      c("受赠机构", "境外", "unsupported_predicate", "境外", "法务审查", "stage_reference", null, null, "unsupported_semantics_not_executable"),
    ],
  },
});

function manifestConditionContract(entry) {
  return [
    entry.field,
    entry.operator.term,
    entry.operator.hint,
    entry.value,
    entry.matchingRoute.term,
    entry.matchingRoute.hint,
    entry.otherwiseRoute?.term ?? null,
    entry.otherwiseRoute?.hint ?? null,
    entry.predicateContext.executionMode,
  ];
}

test("all 24 manifests match an independent source condition and stage-order inventory", () => {
  assert.equal(
    templateCopilotV3SemanticManifestVersion,
    "template-copilot-v3-semantic-manifests.11",
  );
  const scenarioIds = templateCopilotQualificationScenarios.map(({ id }) => id);
  assert.deepEqual(Object.keys(gold), scenarioIds);

  for (const scenario of templateCopilotQualificationScenarios) {
    const expected = gold[scenario.id];
    const manifest = templateCopilotV3SemanticScenarioManifest(scenario.id);
    assert.ok(manifest, scenario.id);
    assert.equal(scenario.conditions, expected.source, `${scenario.id}:source`);
    assert.deepEqual(
      manifest.stages.map(({ participant }) => participant),
      expected.stages,
      `${scenario.id}:stage order`,
    );
    assert.deepEqual(
      manifest.conditions.map(manifestConditionContract),
      expected.conditions.map(({ contract }) => contract),
      `${scenario.id}:condition contracts`,
    );

    for (const { contract } of expected.conditions) {
      const [field, operator, , value, matching, , otherwise] = contract;
      for (const term of [field, operator, value, matching, otherwise]) {
        if (term !== null) {
          assert.ok(
            scenario.conditions.includes(term),
            `${scenario.id}: source omits ${term}`,
          );
        }
      }
    }
    const stageSource = `${scenario.stages} ${scenario.conditions}`;
    for (const participant of expected.stages) {
      assert.ok(
        stageSource.includes(participant),
        `${scenario.id}: source omits stage ${participant}`,
      );
    }
  }
});

test("all 17 currency-bearing condition values retain a separate exact source role", () => {
  const omissions = [];
  let expectedCurrencyCount = 0;
  for (const [id, expected] of Object.entries(gold)) {
    const manifest = templateCopilotV3SemanticScenarioManifest(id);
    for (const [index, condition] of expected.conditions.entries()) {
      const actual = manifest.conditions[index];
      if (condition.currency === null) {
        assert.equal(actual.currency, null, `${id}[${index}]:unexpected currency`);
        continue;
      }
      expectedCurrencyCount += 1;
      assert.ok(
        expected.source.includes(condition.currency),
        `${id}:currency source`,
      );
      const actualCurrency = actual.currency?.term ?? actual.currency ?? null;
      if (actualCurrency !== condition.currency) {
        omissions.push(`${id}[${index}]:${condition.currency}`);
      }
      assert.deepEqual(actual.currency, {
        role: "currency",
        term: condition.currency,
        hint: null,
      });
    }
  }
  assert.equal(expectedCurrencyCount, 17);
  assert.deepEqual(
    omissions,
    [],
    "The condition schema currently has no separate currency fact; bare numeric values lose source currency semantics.",
  );
});
