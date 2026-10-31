// 50 difficult workflows for the simulated-user run. Each is generated from a
// specification that is also the answer key: the text is what an author would
// type into the nine Describe sections, the spec is what they meant.
//
// Domain vocabulary is [english, traditional, simplified, type?].

const L = { en: 0, "zh-Hant": 1, "zh-Hans": 2 };

const domains = [
  {
    key: "purchase", name: ["Purchase Requisition", "採購申請", "采购申请"], purpose: ["control employee purchases from request to approval", "管控員工由申請到批核的採購", "管控员工由申请到批核的采购"],
    fields: [["supplier", "供應商", "供应商", "text"], ["cost centre", "成本中心", "成本中心", "text"], ["total amount", "總金額", "总金额", "currency"], ["needed-by date", "需要日期", "需要日期", "date"], ["item description", "物品說明", "物品说明", "long_text"], ["quantity", "數量", "数量", "number"], ["delivery location", "送貨地點", "送货地点", "text"], ["project code", "項目編號", "项目编号", "text"], ["contact email", "聯絡電郵", "联络电邮", "email"], ["justification", "理由", "理由", "long_text"], ["budget line", "預算項目", "预算项目", "text"], ["currency", "貨幣", "货币", "text"], ["payment terms", "付款條款", "付款条款", "text"], ["urgency", "緊急程度", "紧急程度", "text"]],
    docs: [["supplier quotation", "供應商報價單", "供应商报价单"], ["purchase specification", "採購規格書", "采购规格书"], ["comparison sheet", "比較表", "比较表"], ["budget approval memo", "預算批准備忘", "预算批准备忘"]],
    approvers: [["department manager", "部門經理", "部门经理"], ["procurement officer", "採購主任", "采购主任"], ["finance manager", "財務經理", "财务经理"], ["legal counsel", "法律顧問", "法律顾问"], ["general manager", "總經理", "总经理"], ["CEO", "行政總裁", "行政总裁"]],
    forms: [["justification form", "理由說明表", "理由说明表"]], fyi: [["warehouse team", "倉務組", "仓务组"]], owner: ["procurement head", "採購主管", "采购主管"],
  },
  {
    key: "expense", name: ["Expense Claim", "費用報銷", "费用报销"], purpose: ["reimburse business expenses", "報銷業務開支", "报销业务开支"],
    fields: [["claim period", "報銷期間", "报销期间", "text"], ["expense category", "費用類別", "费用类别", "text"], ["claim amount", "申報金額", "申报金额", "currency"], ["receipt date", "收據日期", "收据日期", "date"], ["merchant", "商戶", "商户", "text"], ["business purpose", "業務目的", "业务目的", "long_text"], ["client name", "客戶名稱", "客户名称", "text"], ["payment method", "付款方式", "付款方式", "text"], ["employee id", "員工編號", "员工编号", "text"], ["bank account note", "銀行帳戶備註", "银行账户备注", "text"]],
    docs: [["receipt", "收據", "收据"], ["credit card statement", "信用卡月結單", "信用卡月结单"], ["approval email", "批核電郵", "批核电邮"]],
    approvers: [["line manager", "直屬經理", "直属经理"], ["finance reviewer", "財務審核員", "财务审核员"], ["finance director", "財務總監", "财务总监"], ["payroll officer", "薪資主任", "薪资主任"]],
    forms: [["mileage log", "里程記錄表", "里程记录表"]], fyi: [["payroll team", "薪資組", "薪资组"]], owner: ["finance controller", "財務總監", "财务总监"],
  },
  {
    key: "travel", name: ["Business Travel Request", "公幹出差申請", "公干出差申请"], purpose: ["approve trips before booking", "預訂前批核出差", "预订前批核出差"],
    fields: [["destination city", "目的地城市", "目的地城市", "text"], ["departure date", "出發日期", "出发日期", "date"], ["return date", "返回日期", "返回日期", "date"], ["estimated airfare", "預計機票", "预计机票", "currency"], ["hotel nights", "酒店晚數", "酒店晚数", "number"], ["traveller name", "出差人員", "出差人员", "text"], ["purpose of trip", "出差目的", "出差目的", "long_text"], ["client project", "客戶項目", "客户项目", "text"], ["visa required", "是否需要簽證", "是否需要签证", "radio"]],
    docs: [["itinerary", "行程表", "行程表"], ["visa copy", "簽證副本", "签证副本"], ["conference invitation", "會議邀請函", "会议邀请函"]],
    approvers: [["department head", "部門主管", "部门主管"], ["travel coordinator", "差旅統籌員", "差旅统筹员"], ["finance manager", "財務經理", "财务经理"], ["regional director", "區域總監", "区域总监"]],
    forms: [["risk assessment form", "風險評估表", "风险评估表"]], fyi: [["HR team", "人事部", "人事部"]], owner: ["travel policy owner", "差旅政策負責人", "差旅政策负责人"],
  },
  {
    key: "leave", name: ["Leave Application", "請假申請", "请假申请"], purpose: ["manage staff leave approvals", "管理員工請假批核", "管理员工请假批核"],
    fields: [["leave type", "假別", "假别", "text"], ["start date", "開始日期", "开始日期", "date"], ["end date", "結束日期", "结束日期", "date"], ["number of days", "日數", "日数", "number"], ["reason", "原因", "原因", "long_text"], ["backup person", "代理人", "代理人", "text"], ["contact during leave", "假期聯絡方式", "假期联络方式", "text"], ["handover notes", "交接備註", "交接备注", "long_text"]],
    docs: [["medical certificate", "醫生證明", "医生证明"], ["supporting letter", "證明信", "证明信"]],
    approvers: [["line manager", "直屬經理", "直属经理"], ["HR officer", "人事主任", "人事主任"], ["department head", "部門主管", "部门主管"], ["HR director", "人事總監", "人事总监"]],
    forms: [["handover form", "交接表", "交接表"]], fyi: [["payroll team", "薪資組", "薪资组"]], owner: ["HR head", "人事主管", "人事主管"],
  },
  {
    key: "itaccess", name: ["IT Access Request", "資訊系統權限申請", "信息系统权限申请"], purpose: ["grant system access safely", "安全地授予系統權限", "安全地授予系统权限"],
    fields: [["system name", "系統名稱", "系统名称", "text"], ["access level", "權限級別", "权限级别", "text"], ["start date", "生效日期", "生效日期", "date"], ["end date", "屆滿日期", "届满日期", "date"], ["business justification", "業務理由", "业务理由", "long_text"], ["manager email", "經理電郵", "经理电邮", "email"], ["is privileged access", "是否特權帳戶", "是否特权账户", "radio"], ["data classification", "資料分類", "数据分类", "text"]],
    docs: [["access request screenshot", "權限申請截圖", "权限申请截图"], ["security training certificate", "資訊安全培訓證書", "信息安全培训证书"]],
    approvers: [["line manager", "直屬經理", "直属经理"], ["system owner", "系統負責人", "系统负责人"], ["security officer", "資訊保安主任", "信息保安主任"], ["CISO", "資訊保安總監", "信息保安总监"]],
    forms: [["access agreement", "權限使用協議", "权限使用协议"]], fyi: [["audit team", "審計組", "审计组"]], owner: ["IT governance lead", "資訊科技管治主管", "信息科技管治主管"],
  },
  {
    key: "contract", name: ["Contract Review", "合約審閱", "合约审阅"], purpose: ["review contracts before signature", "簽署前審閱合約", "签署前审阅合约"],
    fields: [["counterparty", "合約對方", "合约对方", "text"], ["contract value", "合約金額", "合约金额", "currency"], ["contract term", "合約年期", "合约年期", "text"], ["governing law", "管轄法律", "管辖法律", "text"], ["start date", "開始日期", "开始日期", "date"], ["auto-renewal", "是否自動續期", "是否自动续期", "radio"], ["business owner", "業務負責人", "业务负责人", "text"], ["summary of terms", "條款摘要", "条款摘要", "long_text"]],
    docs: [["draft contract", "合約草稿", "合约草稿"], ["counterparty profile", "對方資料", "对方资料"], ["redline", "修訂對照稿", "修订对照稿"]],
    approvers: [["business owner", "業務負責人", "业务负责人"], ["legal counsel", "法律顧問", "法律顾问"], ["finance manager", "財務經理", "财务经理"], ["chief financial officer", "財務總裁", "财务总裁"], ["CEO", "行政總裁", "行政总裁"]],
    forms: [["risk checklist", "風險檢查表", "风险检查表"]], fyi: [["company secretary", "公司秘書", "公司秘书"]], owner: ["legal head", "法務主管", "法务主管"],
  },
  {
    key: "vendor", name: ["Vendor Onboarding", "供應商登記", "供应商登记"], purpose: ["vet new suppliers", "審核新供應商", "审核新供应商"],
    fields: [["company name", "公司名稱", "公司名称", "text"], ["registration number", "註冊編號", "注册编号", "text"], ["bank account", "銀行帳戶", "银行账户", "text"], ["annual spend estimate", "預計年度支出", "预计年度支出", "currency"], ["service category", "服務類別", "服务类别", "text"], ["contact email", "聯絡電郵", "联络电邮", "email"], ["conflict of interest declared", "是否申報利益衝突", "是否申报利益冲突", "radio"], ["country of incorporation", "註冊地", "注册地", "text"]],
    docs: [["business registration certificate", "商業登記證", "商业登记证"], ["bank confirmation letter", "銀行證明信", "银行证明信"], ["tax form", "稅務表格", "税务表格"]],
    approvers: [["procurement officer", "採購主任", "采购主任"], ["compliance officer", "合規主任", "合规主任"], ["finance reviewer", "財務審核員", "财务审核员"], ["procurement director", "採購總監", "采购总监"]],
    forms: [["conflict of interest declaration", "利益衝突聲明表", "利益冲突声明表"]], fyi: [["accounts payable team", "應付賬款組", "应付账款组"]], owner: ["procurement head", "採購主管", "采购主管"],
  },
  {
    key: "capex", name: ["Capital Project Approval", "資本項目批核", "资本项目批核"], purpose: ["approve capital spending", "批核資本支出", "批核资本支出"],
    fields: [["project name", "項目名稱", "项目名称", "text"], ["capital amount", "資本金額", "资本金额", "currency"], ["payback period", "回本期", "回本期", "number"], ["start date", "開始日期", "开始日期", "date"], ["project sponsor", "項目發起人", "项目发起人", "text"], ["expected benefits", "預期效益", "预期效益", "long_text"], ["risk summary", "風險摘要", "风险摘要", "long_text"], ["asset category", "資產類別", "资产类别", "text"]],
    docs: [["business case", "商業個案", "商业个案"], ["financial model", "財務模型", "财务模型"], ["vendor quotation", "供應商報價", "供应商报价"]],
    approvers: [["project sponsor", "項目發起人", "项目发起人"], ["finance manager", "財務經理", "财务经理"], ["investment committee", "投資委員會", "投资委员会"], ["CFO", "財務總監", "财务总监"], ["CEO", "行政總裁", "行政总裁"]],
    forms: [["post-investment review plan", "投資後檢討計劃", "投资后检讨计划"]], fyi: [["board secretary", "董事會秘書", "董事会秘书"]], owner: ["strategy head", "策略主管", "策略主管"],
  },
  {
    key: "marketing", name: ["Marketing Material Approval", "市場宣傳材料審批", "市场宣传材料审批"], purpose: ["approve public marketing content", "批核對外宣傳內容", "批核对外宣传内容"],
    fields: [["campaign name", "活動名稱", "活动名称", "text"], ["channel", "渠道", "渠道", "text"], ["target audience", "目標受眾", "目标受众", "text"], ["publication date", "發布日期", "发布日期", "date"], ["budget", "預算", "预算", "currency"], ["includes customer name", "是否包含客戶名稱", "是否包含客户名称", "radio"], ["material owner", "材料負責人", "材料负责人", "text"], ["product", "產品", "产品", "text"]],
    docs: [["copy and design file", "文案及設計稿", "文案及设计稿"], ["customer consent letter", "客戶同意書", "客户同意书"], ["claims evidence", "聲明證據", "声明证据"]],
    approvers: [["brand manager", "品牌經理", "品牌经理"], ["legal reviewer", "法務審查員", "法务审查员"], ["product owner", "產品負責人", "产品负责人"], ["marketing director", "市場總監", "市场总监"]],
    forms: [["claims substantiation form", "聲明依據表", "声明依据表"]], fyi: [["publishing team", "發布團隊", "发布团队"]], owner: ["marketing head", "市場主管", "市场主管"],
  },
  {
    key: "hiring", name: ["Recruitment Approval", "招聘批核", "招聘批核"], purpose: ["approve new hires", "批核新增人手", "批核新增人手"],
    fields: [["job title", "職位名稱", "职位名称", "text"], ["department", "部門", "部门", "text"], ["headcount", "人數", "人数", "number"], ["salary range", "薪酬範圍", "薪酬范围", "currency"], ["target start date", "預計入職日期", "预计入职日期", "date"], ["reason for hire", "招聘原因", "招聘原因", "long_text"], ["is replacement", "是否替補", "是否替补", "radio"], ["hiring manager", "招聘經理", "招聘经理", "text"]],
    docs: [["job description", "職位描述", "职位描述"], ["organisation chart", "組織圖", "组织图"]],
    approvers: [["hiring manager", "招聘經理", "招聘经理"], ["HR business partner", "人事業務夥伴", "人事业务伙伴"], ["finance manager", "財務經理", "财务经理"], ["department head", "部門主管", "部门主管"], ["CEO", "行政總裁", "行政总裁"]],
    forms: [["headcount justification", "人手需求說明表", "人手需求说明表"]], fyi: [["talent acquisition team", "招聘組", "招聘组"]], owner: ["HR head", "人事主管", "人事主管"],
  },
  {
    key: "safety", name: ["Hot Work Permit", "動火工作許可", "动火工作许可"], purpose: ["authorise hazardous work on site", "批准現場危險工序", "批准现场危险工序"],
    fields: [["work location", "工作地點", "工作地点", "text"], ["work description", "工作說明", "工作说明", "long_text"], ["start time", "開始時間", "开始时间", "date"], ["duration", "工期", "工期", "number"], ["contractor", "承辦商", "承办商", "text"], ["responsible engineer", "負責工程師", "负责工程师", "text"], ["confined space involved", "是否涉及密閉空間", "是否涉及密闭空间", "radio"]],
    docs: [["method statement", "施工方案", "施工方案"], ["risk assessment", "風險評估", "风险评估"], ["site plan", "圖則", "图则"]],
    approvers: [["site engineer", "地盤工程師", "地盘工程师"], ["safety officer", "安全主任", "安全主任"], ["project manager", "項目經理", "项目经理"], ["company safety manager", "公司安全主管", "公司安全主管"]],
    forms: [["permit checklist", "許可檢查表", "许可检查表"]], fyi: [["site security", "地盤保安", "地盘保安"]], owner: ["safety head", "安全主管", "安全主管"],
  },
  {
    key: "disposal", name: ["Asset Disposal", "資產處置", "资产处置"], purpose: ["approve disposal of company assets", "批核處置公司資產", "批核处置公司资产"],
    fields: [["asset tag", "資產編號", "资产编号", "text"], ["asset description", "資產說明", "资产说明", "long_text"], ["net book value", "賬面淨值", "账面净值", "currency"], ["disposal method", "處置方式", "处置方式", "text"], ["buyer", "買家", "买家", "text"], ["contains data", "是否含數據設備", "是否含数据设备", "radio"], ["disposal date", "處置日期", "处置日期", "date"]],
    docs: [["asset register extract", "資產登記冊摘錄", "资产登记册摘录"], ["valuation report", "估值報告", "估值报告"]],
    approvers: [["asset custodian", "資產保管人", "资产保管人"], ["finance manager", "財務經理", "财务经理"], ["IT security", "資訊保安", "信息保安"], ["finance director", "財務總監", "财务总监"]],
    forms: [["data wiping certificate", "數據清除證明", "数据清除证明"]], fyi: [["facilities team", "設施組", "设施组"]], owner: ["asset manager", "資產經理", "资产经理"],
  },
  {
    key: "refund", name: ["Customer Refund", "客戶退款", "客户退款"], purpose: ["authorise refunds above counter limits", "批准超出櫃檯限額的退款", "批准超出柜台限额的退款"],
    fields: [["order number", "訂單編號", "订单编号", "text"], ["customer name", "客戶名稱", "客户名称", "text"], ["refund amount", "退款金額", "退款金额", "currency"], ["refund reason", "退款原因", "退款原因", "long_text"], ["payment method", "付款方式", "付款方式", "text"], ["purchase date", "購買日期", "购买日期", "date"], ["is goodwill", "是否商譽退款", "是否商誉退款", "radio"]],
    docs: [["proof of purchase", "購買證明", "购买证明"], ["customer email", "客戶電郵紀錄", "客户电邮记录"]],
    approvers: [["store manager", "店長", "店长"], ["customer service lead", "客戶服務主管", "客户服务主管"], ["finance reviewer", "財務審核員", "财务审核员"], ["regional manager", "區域經理", "区域经理"]],
    forms: [["refund declaration", "退款聲明", "退款声明"]], fyi: [["accounting team", "會計組", "会计组"]], owner: ["customer service head", "客戶服務主管", "客户服务主管"],
  },
  {
    key: "training", name: ["Training Request", "培訓申請", "培训申请"], purpose: ["approve training spend", "批核培訓開支", "批核培训开支"],
    fields: [["course name", "課程名稱", "课程名称", "text"], ["provider", "培訓機構", "培训机构", "text"], ["course fee", "費用", "费用", "currency"], ["start date", "開課日期", "开课日期", "date"], ["course hours", "課程時數", "课程时数", "number"], ["learning objectives", "學習目標", "学习目标", "long_text"], ["is mandatory", "是否法定要求", "是否法定要求", "radio"]],
    docs: [["course brochure", "課程資料", "课程资料"], ["quotation", "報價", "报价"], ["completion certificate", "證書", "证书"]],
    approvers: [["line manager", "直屬主管", "直属主管"], ["training manager", "培訓經理", "培训经理"], ["department head", "部門主管", "部门主管"], ["HR director", "人事總監", "人事总监"]],
    forms: [["learning outcomes form", "學習成果表", "学习成果表"]], fyi: [["HR team", "人事部", "人事部"]], owner: ["HR head", "人事主管", "人事主管"],
  },
];

// ------------------------------------------------------------ randomness
function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const pick = (random, list, count) => {
  const pool = [...list];
  const out = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
};
const t = (entry, lang) => entry[L[lang]];

// ------------------------------------------------------------ difficulty plan
// Each workflow carries 3-5 hard features; the plan cycles so all appear often.
const featureCycle = [
  ["parallel", "tiers", "condDoc"],
  ["longList", "optionalFields", "forms"],
  ["tiers", "fyi", "closeReject"],
  ["parallel", "condDoc", "distractor"],
  ["forms", "optionalFields", "days"],
  ["tiers", "parallel", "fyi", "distractor"],
  ["longList", "condDoc", "closeReject"],
  ["optionalFields", "tiers", "forms", "days"],
];

const thresholdWords = {
  en: (n) => n.toLocaleString("en-US"),
  "zh-Hant": (n) => (n >= 10000 ? `${n / 10000}萬` : String(n)),
  "zh-Hans": (n) => (n >= 10000 ? `${n / 10000}万` : String(n)),
};

function buildSpec(index) {
  const id = `W${String(index + 1).padStart(2, "0")}`;
  const random = rng(7919 * (index + 3));
  const lang = ["en", "zh-Hant", "zh-Hans"][index % 3];
  const domain = domains[index % domains.length];
  const features = new Set(featureCycle[index % featureCycle.length]);
  const fieldCount = features.has("longList") ? Math.min(domain.fields.length, 12 + (index % 3)) : 5 + (index % 4);
  const fieldEntries = pick(random, domain.fields, fieldCount);
  // The amount-like field leads, so threshold rules have a field to test.
  const amountField = domain.fields.find((entry) => entry[3] === "currency");
  if (amountField && !fieldEntries.includes(amountField)) fieldEntries[0] = amountField;
  const optionalCount = features.has("optionalFields") ? 2 : 0;
  const fields = fieldEntries.map((entry, position) => ({
    label: t(entry, lang),
    type: entry[3],
    required: position < fieldEntries.length - optionalCount,
    isAmount: entry === amountField,
  }));
  const docEntries = pick(random, domain.docs, 2);
  const attachments = docEntries.map((entry, position) => ({
    label: t(entry, lang), required: true, formats: [position === 0 ? "pdf" : "image"], maxMb: 10 + 5 * position,
  }));
  const condDocEntry = features.has("condDoc") ? domain.docs.find((entry) => !docEntries.includes(entry)) : null;
  const forms = features.has("forms") ? [t(domain.forms[0], lang)] : [];
  const approverEntries = pick(random, domain.approvers, features.has("tiers") ? 5 : 4);
  const stages = [];
  let phase = 0;
  approverEntries.forEach((entry, position) => {
    const parallel = features.has("parallel") && (position === 1 || position === 2);
    if (!(parallel && position === 2)) phase += 1;
    stages.push({ label: t(entry, lang), kind: position === 0 ? "approval" : position % 2 ? "review" : "approval", phase, parallel });
  });
  // One sentence names one verb for a simultaneous phase, so its members share a kind.
  for (const phaseNumber of new Set(stages.map((stage) => stage.phase))) {
    const members = stages.filter((stage) => stage.phase === phaseNumber);
    if (members.length > 1) {
      const kind = members.some((member) => member.kind === "review") ? "review" : "approval";
      members.forEach((member) => { member.kind = kind; });
    }
  }
  const fyi = features.has("fyi") ? [t(domain.fyi[0], lang)] : [];
  const conditions = [];
  if (features.has("tiers") && amountField) {
    const first = [20000, 50000, 100000, 200000][index % 4];
    const lastStage = stages[stages.length - 1];
    const prevStage = stages[stages.length - 2];
    conditions.push({ field: t(amountField, lang), op: ">", value: first, currency: "HKD", route: lastStage.label });
    if (prevStage && prevStage.phase !== lastStage.phase && !prevStage.parallel) {
      conditions.push({ field: t(amountField, lang), op: ">", value: first * 5, currency: "HKD", route: prevStage.label });
    }
  }
  const dueHours = features.has("days") ? 72 : [24, 48, 36][index % 3];
  const retentionDays = [2555, 1825, 3650][index % 3];
  const spec = {
    id, lang, domain: domain.key, features: [...features], domainEntry: domain,
    name: t(domain.name, lang), purpose: t(domain.purpose, lang), fields, attachments,
    condDoc: condDocEntry ? t(condDocEntry, lang) : null, forms, stages, fyi, conditions,
    dueHours, retentionDays, closeReject: features.has("closeReject"), distractor: features.has("distractor"),
    owner: t(domain.owner, lang), seed: index,
  };
  return { ...spec, sections: renderSections(spec), threshold: conditions[0]?.value ?? null };
}

// ------------------------------------------------------------ rendering
function listWords(items, lang, joinWord) {
  if (lang === "en") {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")}, ${joinWord ?? "and"} ${items.at(-1)}`;
  }
  return items.join("、");
}

function renderSections(spec) {
  const { lang } = spec;
  const en = lang === "en";
  const requiredFields = spec.fields.filter((field) => field.required).map((field) => field.label);
  const optionalFields = spec.fields.filter((field) => !field.required).map((field) => field.label);
  const days = spec.dueHours % 24 === 0 ? spec.dueHours / 24 : null;
  const sections = {};
  sections.identity_scope = en
    ? `Create a ${spec.name} workflow to ${spec.purpose}.${spec.distractor ? " Petty cash and anything under internal transfers are outside scope." : ""}`
    : `建立「${spec.name}」流程，${lang === "zh-Hant" ? "用於" : "用于"}${spec.purpose}。${spec.distractor ? (lang === "zh-Hant" ? "零用現金及內部轉帳不在範圍內。" : "零用现金及内部转账不在范围内。") : ""}`;
  const initiators = en
    ? `Any employee may start it. Require ${listWords(requiredFields, lang)}.${optionalFields.length ? ` ${listWords(optionalFields, lang)} ${optionalFields.length > 1 ? "are" : "is"} optional.` : ""}`
    : lang === "zh-Hant"
      ? `任何員工均可發起。必填${listWords(requiredFields, lang)}。${optionalFields.length ? `${listWords(optionalFields, lang)}為選填。` : ""}`
      : `任何员工均可发起。必填${listWords(requiredFields, lang)}。${optionalFields.length ? `${listWords(optionalFields, lang)}为选填。` : ""}`;
  sections.initiators_fields = initiators;
  const docParts = spec.attachments.map((doc, position) => {
    const fmt = doc.formats[0] === "pdf" ? "PDF" : (en ? "image" : lang === "zh-Hant" ? "圖片" : "图片");
    return en ? `${doc.label} ${fmt}` : `${doc.label} ${fmt}`;
  });
  const docLimit = spec.attachments[0].maxMb;
  let attachmentsText = en
    ? `Require one ${listWords(docParts, lang)}, each up to ${docLimit} MB.`
    : lang === "zh-Hant" ? `必須上載${listWords(docParts, lang)}，每份檔案最多${docLimit} MB。` : `必须上传${listWords(docParts, lang)}，每份文件最多${docLimit} MB。`;
  if (spec.condDoc && spec.conditions[0]) {
    const thresholdText = en ? `HKD ${thresholdWords.en(spec.conditions[0].value)}` : lang === "zh-Hant" ? `港幣${thresholdWords["zh-Hant"](spec.conditions[0].value)}元` : `港币${thresholdWords["zh-Hans"](spec.conditions[0].value)}元`;
    attachmentsText += en
      ? ` If the ${spec.conditions[0].field} is above ${thresholdText}, also upload a ${spec.condDoc} PDF.`
      : lang === "zh-Hant" ? `若${spec.conditions[0].field}超過${thresholdText}，另要上載${spec.condDoc} PDF。` : `若${spec.conditions[0].field}超过${thresholdText}，另要上传${spec.condDoc} PDF。`;
  } else if (spec.condDoc) {
    attachmentsText += en ? ` If the request involves a contractor, also upload a ${spec.condDoc} PDF.` : lang === "zh-Hant" ? `若涉及承辦商，另要上載${spec.condDoc} PDF。` : `若涉及承办商，另要上传${spec.condDoc} PDF。`;
  }
  if (spec.forms.length) attachmentsText += en ? ` Fill in a native ${spec.forms[0]}.` : lang === "zh-Hant" ? `填寫原生${spec.forms[0]}。` : `填写原生${spec.forms[0]}。`;
  sections.attachments = attachmentsText;
  const s = spec.stages;
  const phases = [...new Set(s.map((x) => x.phase))];
  const phaseTexts = phases.map((phase, position) => {
    const members = s.filter((x) => x.phase === phase);
    const verbFor = (x) => (en ? (x.kind === "review" ? "reviews" : "approves") : x.kind === "review" ? (lang === "zh-Hant" ? "審查" : "审查") : (lang === "zh-Hant" ? "審批" : "审批"));
    if (members.length > 1) {
      return en ? `${listWords(members.map((m) => m.label), lang)} ${members.some((m) => m.kind === "review") ? "review" : "approve"} in parallel`
        : `${listWords(members.map((m) => m.label), lang)}並行${members.some((m) => m.kind === "review") ? (lang === "zh-Hant" ? "審查" : "审查") : (lang === "zh-Hant" ? "審批" : "审批")}`.replace("並行", lang === "zh-Hant" ? "並行" : "并行");
    }
    return en ? `${members[0].label} ${verbFor(members[0])}` : `${members[0].label}${verbFor(members[0])}`;
  });
  let stagesText = en ? `${phaseTexts[0]}${phaseTexts.length > 1 ? `, then ${phaseTexts.slice(1).join(", then ")}` : ""}.`
    : lang === "zh-Hant" ? `${phaseTexts.join("，再由")}。` : `${phaseTexts.join("，再由")}。`;
  if (spec.fyi.length) stagesText += en ? ` ${spec.fyi[0]} receives a non-blocking FYI after completion.` : lang === "zh-Hant" ? `${spec.fyi[0]}收到非阻塞的 FYI。` : `${spec.fyi[0]}收到非阻塞的 FYI。`;
  sections.stages_participants = stagesText;
  const conditionTexts = spec.conditions.map((condition) => {
    const thresholdText = en ? `HKD ${thresholdWords.en(condition.value)}` : lang === "zh-Hant" ? `港幣${thresholdWords["zh-Hant"](condition.value)}元` : `港币${thresholdWords["zh-Hans"](condition.value)}元`;
    return en ? `If ${condition.field} is above ${thresholdText}, add ${condition.route} approval.`
      : lang === "zh-Hant" ? `${condition.field}超過${thresholdText}時增加${condition.route}批准。` : `${condition.field}超过${thresholdText}时增加${condition.route}批准。`;
  });
  const rejection = spec.closeReject
    ? (en ? "A rejected request is closed." : lang === "zh-Hant" ? "被拒絕的申請即告終止。" : "被拒绝的申请即告终止。")
    : (en ? "Rejection returns the request for correction." : lang === "zh-Hant" ? "拒絕即退回申請人補正。" : "拒绝即退回申请人补正。");
  sections.conditions_exceptions = `${conditionTexts.join(" ")} ${rejection}`.trim();
  sections.collaboration_corrections = en
    ? "The requester may invite named colleagues to upload individual documents. The requester confirms the final package."
    : lang === "zh-Hant" ? "申請人可以邀請指定同事補交個別文件，最終資料由申請人確認。" : "申请人可以邀请指定同事补交个别文件，最终资料由申请人确认。";
  sections.timing_escalation = en
    ? `Approvals are due in ${days ? `${days} ${days === 1 ? "day" : "days"}` : `${spec.dueHours} hours`} and escalate to the department head after another ${spec.dueHours} hours.`
    : lang === "zh-Hant" ? `審批限時${spec.dueHours}小時，逾期後再給${spec.dueHours}小時並升級到部門主管。` : `审批限时${spec.dueHours}小时，逾期后再给${spec.dueHours}小时并升级到部门主管。`;
  sections.visibility_notifications = en
    ? "The requester, current approvers and the process owner can see status and history. Notify only directly involved people about assignment, due soon, overdue, rejection, correction and completion."
    : lang === "zh-Hant" ? "申請人、當前審批人及流程負責人可以查看狀態與歷史。僅通知直接相關人員，事件包括分配、即將到期、逾期、拒絕、補正和完成。" : "申请人、当前审批人及流程负责人可以查看状态与历史。仅通知直接相关人员，事件包括分配、即将到期、逾期、拒绝、补正和完成。";
  sections.governance = en
    ? `The ${spec.owner} reviews the template annually. Retain records for ${spec.retentionDays} days and require a change reason. Do not add an electronic signature.`
    : lang === "zh-Hant" ? `${spec.owner}每年複核一次模板。記錄保留${spec.retentionDays}天，每次修改必須說明原因。不要加入電子簽署。` : `${spec.owner}每年复核一次模板。记录保留${spec.retentionDays}天，每次修改必须说明原因。不要加入电子签署。`;
  return sections;
}

export const simulationWorkflows = Object.freeze(Array.from({ length: 50 }, (_, index) => buildSpec(index)));
