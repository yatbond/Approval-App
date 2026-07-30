const commonAnswers = {
  en: {
    collaboration:
      "The requester may invite named contributors for individual documents. Shared submissions are allowed, but the assigned requester must confirm the final package. Rejection returns the request for correction and resubmission.",
    timing:
      "Normal approvals are due in 24 hours and escalated to the relevant department head after another 24 hours. Use calendar hours for this test; do not invent an escalation email.",
    visibility:
      "The requester, active approvers, contributors, and process owner may see status and history. Notify only directly involved people for assignment, due soon, overdue, rejection, correction, and completion.",
    governance:
      "The department process owner reviews the template annually and a template manager must approve publication. Retain records for 2555 days, require a change reason, and do not add an electronic signature unless explicitly stated. The template must support English.",
  },
  "zh-Hant": {
    collaboration:
      "申請人可邀請指定同事補交個別文件。可以共同提交，但最後整套資料必須由指定申請人確認。若被拒絕，應退回申請人修正後重新提交。",
    timing:
      "一般審批限時二十四小時，逾期後再給二十四小時並升級至相關部門主管。這次測試使用曆日時間；不要自行創作升級電郵地址。",
    visibility:
      "申請人、目前審批人、協作者及流程負責人可查看狀態和歷史。只通知直接相關人士，事件包括獲指派、即將到期、逾期、拒絕、補正及完成。",
    governance:
      "部門流程負責人每年檢討一次範本，發布前須由範本管理員審核。紀錄保留二千五百五十五日，每次修改必須寫明原因；除非明確要求，否則不要加入電子簽署。範本須支援繁體中文及英文。",
  },
  "zh-Hans": {
    collaboration:
      "申请人可以邀请指定同事补交个别文件。允许共同提交，但最终整套资料必须由指定申请人确认。若被拒绝，应退回申请人修改后重新提交。",
    timing:
      "一般审批限时二十四小时，逾期后再给二十四小时并升级到相关部门负责人。本次测试使用自然日时间；不要自行编造升级邮箱。",
    visibility:
      "申请人、当前审批人、协作者和流程负责人可以查看状态与历史。仅通知直接相关人员，事件包括分配、即将到期、逾期、拒绝、补正和完成。",
    governance:
      "部门流程负责人每年复核一次模板，发布前必须由模板管理员审核。记录保留二千五百五十五天，每次修改必须说明原因；除非明确要求，否则不要加入电子签名。模板必须支持简体中文和英文。",
  },
};

function scenario(input) {
  return {
    departmentName: "Procurement Operations",
    collaboration:
      input.collaboration || commonAnswers[input.language].collaboration,
    timing: input.timing || commonAnswers[input.language].timing,
    visibility: input.visibility || commonAnswers[input.language].visibility,
    governance: input.governance || commonAnswers[input.language].governance,
    expectations: {
      minimumDocuments: 0,
      minimumRequestFields: 1,
      minimumApprovalNodes: 1,
      minimumConditionNodes: 0,
      requireFyi: false,
      requireRejectRoute: true,
      requireParallelFanout: false,
      requireManualForm: false,
      requireSharedFulfillment: true,
      requireSelectedFieldHandoff: false,
      requireRestrictedDocumentHandoff: false,
      expectedFyiTerms: [],
      expectedLanguage: input.language,
      requiredTerms: [],
      ...input.expectations,
    },
    ...input,
  };
}

export const templateCopilotQualificationScenarios = [
  scenario({
    id: "EN-01",
    language: "en",
    archetype: "purchase_threshold_dual_path",
    identity:
      "Create a Purchase Requisition Approval workflow. It should control employee purchases from request through approval; petty cash and emergency purchases are outside scope.",
    initiators:
      "Any employee may start it. Require purpose, supplier, cost centre, currency, total amount, needed-by date, and a Goods or Services choice.",
    attachments:
      "Require one supplier quotation PDF up to 20 MB. If the total is at least HKD 50,000 require two more quotation PDFs. Add a native justification form with reason and alternatives considered.",
    stages:
      "Requester submits, department manager approves, then Procurement reviews. For totals below HKD 50,000 finish after Procurement. At or above HKD 50,000 send Finance approval and General Manager approval in parallel; both must approve. Finance sees all amounts and quotations, while the General Manager sees only purpose, total and the final quotation. Notify the requester at completion.",
    conditions:
      "Use total amount below HKD 50,000 versus at least HKD 50,000 as complete branches. If either high-value approver rejects, return to the requester for correction. If both approve, complete.",
    expectations: {
      minimumDocuments: 2,
      minimumRequestFields: 7,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 1,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["requester"],
      requiredTerms: ["50000", "quotation", "finance"],
    },
  }),
  scenario({
    id: "EN-02",
    language: "en",
    archetype: "invoice_three_way_match",
    departmentName: "Finance Operations",
    identity:
      "Create an Invoice Three-Way Match workflow for supplier invoices against a purchase order and goods receipt. Credit notes are outside scope.",
    initiators:
      "Accounts Payable staff start it. Require supplier, invoice number, invoice date, PO number, currency, invoice total, PO total, goods-received total, and tax amount.",
    attachments:
      "Require one invoice PDF, one purchase order PDF, and one goods receipt PDF; each up to 25 MB. Allow an optional Excel line-item schedule. Extract totals and line items.",
    stages:
      "Accounts Payable submits, the system compares invoice, PO and receipt totals, the cost centre owner reviews mismatches, then Finance Manager approves. Treasury receives a non-blocking FYI with only supplier, invoice number, currency, approved total and invoice PDF.",
    conditions:
      "If invoice total equals both PO total and goods-received total, skip mismatch review and go to Finance Manager. Otherwise require cost centre owner review. Rejection returns to Accounts Payable.",
    collaboration:
      "Accounts Payable may ask the buyer and receiving officer to contribute their documents. Each contributes only their assigned document, and Accounts Payable confirms the complete package before routing.",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 9,
      minimumApprovalNodes: 2,
      minimumConditionNodes: 1,
      requireFyi: true,
      requireSelectedFieldHandoff: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["Treasury"],
      requiredTerms: ["invoice", "purchase order", "goods receipt"],
    },
  }),
  scenario({
    id: "EN-03",
    language: "en",
    archetype: "capex_parallel_committee",
    departmentName: "Finance Operations",
    identity:
      "Create a Capital Expenditure Request workflow for planned equipment and project assets. Operating expenses are outside scope.",
    initiators:
      "Department managers may initiate. Require asset description, business case, amount, currency, budget code, expected life, payback months, and risk rating.",
    attachments:
      "Require a business-case PDF and quotation PDF. Require a native benefits table containing benefit, owner, annual value and target date. An optional image may show the proposed asset.",
    stages:
      "Requester submits and Department Head endorses. Finance Controller and Technical Director then review in parallel. If both approve, CFO approves. Above HKD 2,000,000, Board Secretary receives an FYI after CFO approval. Finance sees all financial fields; Technical sees specification, risks and quotation but not payback assumptions.",
    conditions:
      "Both parallel reviews are mandatory. Any rejection returns for correction. The Board FYI applies only above HKD 2,000,000; otherwise complete after CFO.",
    expectations: {
      minimumDocuments: 3,
      minimumRequestFields: 8,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      expectedFyiTerms: ["Board Secretary"],
      requiredTerms: ["2000000", "technical", "cfo"],
    },
  }),
  scenario({
    id: "EN-04",
    language: "en",
    archetype: "employee_expense_exception",
    departmentName: "Finance Operations",
    identity:
      "Create an Employee Expense Reimbursement workflow for business expenses already paid by an employee. Travel advances are outside scope.",
    initiators:
      "Any employee starts it. Require expense date, category, merchant, purpose, currency, amount, cost centre, client-billable checkbox, and missing-receipt checkbox.",
    attachments:
      "Require one to twenty receipt images or PDFs, maximum 10 MB each. If the missing-receipt box is selected, require a native declaration form with reason, date, amount and employee acknowledgement.",
    stages:
      "Requester submits, line manager approves, Finance audits, and Payroll receives a non-blocking FYI after approval. Finance sees all receipts and fields. The line manager sees purpose, category, amount and receipt thumbnails but not bank details.",
    conditions:
      "If total exceeds HKD 10,000 or a receipt is missing, add Department Head approval before Finance. Otherwise go from line manager to Finance. Rejection returns for correction.",
    expectations: {
      minimumDocuments: 2,
      minimumRequestFields: 9,
      minimumApprovalNodes: 3,
      minimumConditionNodes: 1,
      requireFyi: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      expectedFyiTerms: ["Payroll"],
      requiredTerms: ["10000", "receipt", "payroll"],
    },
  }),
  scenario({
    id: "EN-05",
    language: "en",
    archetype: "contract_risk_routes",
    departmentName: "Procurement Operations",
    identity:
      "Create a Contract Review and Approval workflow for supplier and customer contracts before signature. Employment contracts are outside scope.",
    initiators:
      "Contract owners initiate. Require counterparty, contract type, start and end dates, value, currency, auto-renewal choice, personal-data choice, governing law and business owner.",
    attachments:
      "Require one editable contract file as text or PDF and an optional redline PDF. Add a native deviation form with clause, standard position, proposed deviation and rationale.",
    stages:
      "Business owner endorses, Legal reviews, and Finance reviews in parallel when value exceeds HKD 500,000. Data Protection reviews when personal data is involved. After required reviews, an authorised signatory approves. Legal sees all documents; Data Protection sees only privacy fields and relevant clauses; Finance sees commercial fields but not unrelated clauses.",
    conditions:
      "Finance is required only above HKD 500,000. Data Protection is required only when personal-data choice is Yes. Both conditions can be true at the same time. Any rejection returns to the contract owner.",
    expectations: {
      minimumDocuments: 2,
      minimumRequestFields: 10,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 2,
      requireParallelFanout: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      requireRestrictedDocumentHandoff: true,
      requiredTerms: ["500000", "personal data", "legal"],
    },
  }),
  scenario({
    id: "EN-06",
    language: "en",
    archetype: "site_access_dual_clearance",
    departmentName: "Construction Projects",
    identity:
      "Create a Site Access Request workflow for employees, subcontractors and visitors entering an active construction site. Emergency responders are outside scope.",
    initiators:
      "Site coordinators initiate. Require person name, employer, identity type and last four characters, visit date, arrival and departure time, work area, host, work activity, vehicle registration and high-risk-work choice.",
    attachments:
      "Require a safety induction certificate PDF and identity image. If high-risk work is Yes, require a method statement PDF and permit-to-work native form.",
    stages:
      "Host confirms, Safety Officer and Security Officer approve in parallel, then Site Manager approves high-risk visits. Gatehouse receives a non-blocking FYI containing identity summary, visit time, vehicle and final clearance; it must not see the method statement.",
    conditions:
      "Normal visits complete after both Safety and Security approve. High-risk visits require Site Manager after both. Any rejection returns to the coordinator. Missing induction blocks submission.",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 11,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 1,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["Gatehouse"],
      requiredTerms: ["high-risk", "security", "gatehouse"],
    },
  }),
  scenario({
    id: "EN-07",
    language: "en",
    archetype: "restricted_data_export",
    departmentName: "IT and Security",
    identity:
      "Create a Data Export Approval workflow for taking corporate data outside managed systems. Routine internal reports are outside scope.",
    initiators:
      "Data owners may initiate. Require dataset, purpose, recipient organisation, recipient country, transfer method, personal-data choice, sensitive-data choice, record count, retention days and deletion date.",
    attachments:
      "Require a data inventory CSV and a native recipient-risk assessment form. If personal or sensitive data is involved, require a data-protection impact assessment PDF.",
    stages:
      "Line manager endorses. Information Security and Data Protection review in parallel. Legal also reviews transfers outside Hong Kong. The Data Owner gives final approval. The external recipient gets no system access or documents.",
    conditions:
      "Low-risk non-personal Hong Kong transfers require Information Security only. Personal or sensitive data also requires Data Protection. A country other than Hong Kong also requires Legal. All required branches must approve; rejection returns for correction.",
    governance:
      "The Data Governance owner reviews quarterly and a template manager approves publication. Retain approval evidence for 2555 days. This is restricted data; require a change reason and do not add electronic signature. Support English.",
    expectations: {
      minimumDocuments: 3,
      minimumRequestFields: 10,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 2,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      requiredTerms: ["Hong Kong", "personal", "legal"],
    },
  }),
  scenario({
    id: "EN-08",
    language: "en",
    archetype: "emergency_procurement_retroactive",
    identity:
      "Create an Emergency Procurement workflow for urgent safety, service-continuity or legal needs that cannot wait for normal purchasing. Convenience is outside scope.",
    initiators:
      "Department Heads and duty managers may initiate. Require emergency category, incident description, supplier, amount, currency, why competition is impossible, service impact, purchase time and retrospective flag.",
    attachments:
      "Require one supplier quotation or invoice PDF and a native emergency justification form. Allow an optional incident photo. A retrospective request must also include proof of instruction.",
    stages:
      "Duty manager endorses, Procurement and Finance approve in parallel, then General Manager approves. For a retrospective request, Internal Audit receives a non-blocking FYI after completion with justification and decision history.",
    conditions:
      "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval. Retrospective status does not skip approval. Any rejection creates a correction loop.",
    expectations: {
      minimumDocuments: 3,
      minimumRequestFields: 9,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 1,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      expectedFyiTerms: ["Internal Audit"],
      requiredTerms: ["100000", "retrospective", "audit"],
    },
  }),

  scenario({
    id: "TC-01",
    language: "zh-Hant",
    archetype: "vendor_onboarding",
    identity:
      "建立「供應商開戶審批」流程，用於新供應商通過採購、財務及合規審查後才可交易；一次性零用採購不在範圍內。",
    initiators:
      "採購同事可以發起。必填公司中英文名稱、註冊地、公司編號、地址、聯絡人、電郵、電話、付款貨幣、付款條款、銀行所在地及供應類別。",
    attachments:
      "必須上載商業登記證 PDF、銀行證明 PDF、稅務表格 PDF，以及一份原生「利益衝突聲明表」，內含是否有關連人士、關係及申報人確認。每份檔案最多二十五 MB。",
    stages:
      "採購經理先審批；財務供應商資料組與合規主任其後並行審查；兩者都批准後由採購總監最終批准。財務只看銀行及付款資料，合規只看公司資料、利益衝突及相關證明。",
    conditions:
      "若註冊地或銀行所在地不在香港，增加法務審查；若申報有利益衝突，增加高級管理層審批。兩個條件可同時成立。任何拒絕都退回補正。",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 11,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 2,
      requireParallelFanout: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      requireRestrictedDocumentHandoff: true,
      requiredTerms: ["香港", "利益衝突", "合規"],
    },
  }),
  scenario({
    id: "TC-02",
    language: "zh-Hant",
    archetype: "leave_coverage",
    departmentName: "People Operations",
    identity:
      "建立「員工休假申請」流程，處理年假、病假、產假及無薪假；即日外勤不在範圍內。",
    initiators:
      "任何員工可發起。必填假別、開始及結束日期、日數、原因、工作交接人電郵，以及半日選項。",
    attachments:
      "一般年假毋須附件。連續病假三日或以上必須上載醫生證明 PDF 或圖片。產假要上載預產期證明。無薪假要填原生原因及財務影響表。",
    stages:
      "直屬主管審批，HR 核對假期結餘；無薪假再由部門主管審批。交接人收到不阻塞流程的 FYI，只能看到日期、假別及交接備註，不可看到醫療證明。",
    conditions:
      "病假日數三日或以上才要求醫生證明。無薪假走額外部門主管路徑。其他假別在 HR 核對後完成。拒絕退回員工修改。",
    expectations: {
      minimumDocuments: 3,
      minimumRequestFields: 7,
      minimumApprovalNodes: 3,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["交接人"],
      requiredTerms: ["三日", "無薪假", "醫生證明"],
    },
  }),
  scenario({
    id: "TC-03",
    language: "zh-Hant",
    archetype: "tender_go_no_go",
    identity:
      "建立「投標決策及呈交審批」流程，從是否參與投標到最終遞交；已簽合約的變更不在範圍內。",
    initiators:
      "商務或投標部可發起。必填客戶、項目、投標截止時間、估算合約額、保證金、毛利率、策略重要性、聯營選項及負責人。",
    attachments:
      "必須上載招標文件 PDF、估算 Excel、風險登記表 Excel，以及原生 Go/No-Go 評分表。最後呈交前再必須上載技術建議書及商務建議書 PDF。",
    stages:
      "投標總監先作 Go/No-Go；若 Go，工程、商務、財務及法務並行審查各自部分；所有必要審查通過後，由行政總裁批准最終呈交。每組只看自己的欄位及文件。",
    conditions:
      "No-Go 直接結束並記錄原因。估算合約額超過港幣一億元時增加董事會主席批准。聯營投標必須增加法務審查。任何修改要求返回投標負責人。",
    expectations: {
      minimumDocuments: 6,
      minimumRequestFields: 9,
      minimumApprovalNodes: 6,
      minimumConditionNodes: 2,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      requiredTerms: ["一億元", "Go", "聯營", "原因"],
    },
  }),
  scenario({
    id: "TC-04",
    language: "zh-Hant",
    archetype: "method_statement",
    departmentName: "Construction Projects",
    identity:
      "建立「施工方案審批」流程，用於工程開始前審查方法、風險及資源；日常工具箱講解不在範圍內。",
    initiators:
      "地盤工程師或分判商協調員可發起。必填工程項目、位置、工序、開始日期、工期、負責工程師、高風險工序選項及相關許可證類型。",
    attachments:
      "必須上載施工方案 PDF、風險評估 PDF、圖則 PDF 及原生檢查表。若屬高風險工序，另要上載起重計劃或密閉空間計劃 PDF。",
    stages:
      "工程經理、合約安全主任及質量主任並行審查；三者批准後由項目經理批准。現場管工收到 FYI，只可看已批准版本、開始日期及安全控制。",
    conditions:
      "高風險工序必須增加公司安全主管批准。非高風險則項目經理後完成。任何拒絕退回編製人修正，舊版本保留於歷史。",
    expectations: {
      minimumDocuments: 5,
      minimumRequestFields: 8,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 1,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["現場管工"],
      requiredTerms: ["高風險", "安全", "質量"],
    },
  }),
  scenario({
    id: "TC-05",
    language: "zh-Hant",
    archetype: "subcontractor_payment",
    departmentName: "Construction Projects",
    identity:
      "建立「分判商糧款審批」流程，處理每月已完成工程的估值及付款證明；預付款不在範圍內。",
    initiators:
      "工料測量師發起。必填分判商、合約編號、估值期、申報金額、核實金額、保留金、前期累計、變更工程金額及成本代碼。",
    attachments:
      "必須上載分判商申報 PDF、現場量度 Excel、進度照片，以及原生扣款明細表。可選擇上載變更指示 PDF。",
    stages:
      "地盤工程師確認完成量，項目工料測量師審核金額，項目經理及財務並行審批，最後由商務總監批准。財務只看付款及稅務資料；工程師不看銀行資料。",
    conditions:
      "若申報金額與核實金額差異超過百分之五，必須先退回分判商確認差異。若核實金額超過港幣五百萬元，增加財務總監批准。拒絕退回修正。",
    expectations: {
      minimumDocuments: 5,
      minimumRequestFields: 9,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 2,
      requireParallelFanout: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      requiredTerms: ["百分之五", "五百萬元", "核實金額"],
    },
  }),
  scenario({
    id: "TC-06",
    language: "zh-Hant",
    archetype: "policy_exception",
    departmentName: "Finance Operations",
    identity:
      "建立「政策豁免申請」流程，用於有時限及補償控制的例外批准；永久修改政策不在範圍內。",
    initiators:
      "部門主管可發起。必填政策名稱及條款、豁免原因、開始及結束日期、風險等級、受影響人數、補償控制及負責人。",
    attachments:
      "必須上載風險評估 PDF，並填原生補償控制表，包括控制、負責人、頻率及證據。可選上載法律意見 PDF。",
    stages:
      "政策負責人審查，風險管理及合規並行審查，然後由相關行政總監批准。申請人只能看到結果及自己的資料；風險評估只給審批參與者。",
    conditions:
      "高風險或期限超過九十日者增加行政總裁批准。期限屆滿前七日通知負責人。拒絕退回修正；批准不可自動變成永久例外。",
    expectations: {
      minimumDocuments: 2,
      minimumRequestFields: 8,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 1,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      requiredTerms: ["九十日", "高風險", "補償控制"],
    },
  }),
  scenario({
    id: "TC-07",
    language: "zh-Hant",
    archetype: "training_certification",
    departmentName: "People Operations",
    identity:
      "建立「培訓及資格認證」流程，用於公司資助課程及法定資格續期；免費內部分享不在範圍內。",
    initiators:
      "員工或主管可發起。必填員工、課程名稱、供應機構、開始日期、費用、貨幣、培訓類別、是否法定要求及預期成果。",
    attachments:
      "申請時必須上載課程資料 PDF；費用超過港幣一萬元時要上載報價 PDF。完成後必須由員工補交證書 PDF 及原生學習成果表。",
    stages:
      "直屬主管及培訓經理並行審批，費用高時再由部門主管批准。課程完成後，員工提交證書，主管確認，HR 更新資格紀錄並收到 FYI。",
    conditions:
      "費用超過港幣一萬元增加部門主管批准。法定培訓未能提供證書時不可完成。拒絕退回修改，逾期未補證書要提醒。",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 9,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      expectedFyiTerms: ["HR"],
      requiredTerms: ["一萬元", "證書", "法定"],
    },
  }),
  scenario({
    id: "TC-08",
    language: "zh-Hant",
    archetype: "visitor_privacy",
    departmentName: "IT and Security",
    identity:
      "建立「訪客登記及批准」流程，用於外來人士進入公司辦公室及受限制區域；公開活動參加者不在範圍內。",
    initiators:
      "公司員工可為訪客發起。必填訪客姓名、機構、電郵、電話、到訪日期、時間、目的、接待人、辦公地點、受限制區域選項及器材攜入清單。",
    attachments:
      "一般辦公室訪客毋須附件。進入受限制區域時必須上載保密協議 PDF，並填原生器材及資料存取聲明表。不要收集完整身份證號碼。",
    stages:
      "接待人主管批准；受限制區域另由資訊保安批准。接待處收到 FYI，只看訪客姓名、機構、日期、時間、接待人及批准狀態，不可看保密協議內容。",
    conditions:
      "普通辦公室到訪在主管批准後完成。受限制區域必須再經資訊保安。拒絕退回申請人；到訪日期過後自動失效。",
    governance:
      "保安流程負責人每年檢討，發布前由範本管理員審核。一般訪客資料只保留三百六十五日，受限制區域紀錄保留七百三十日；這是機密資料，不要加入電子簽署。範本須支援繁體中文及英文。",
    expectations: {
      minimumDocuments: 2,
      minimumRequestFields: 11,
      minimumApprovalNodes: 2,
      minimumConditionNodes: 1,
      requireFyi: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["接待處"],
      requiredTerms: ["受限制區域", "資訊保安", "三百六十五日"],
    },
  }),

  scenario({
    id: "SC-01",
    language: "zh-Hans",
    archetype: "design_change",
    departmentName: "Construction Projects",
    identity:
      "建立“设计变更审批”流程，用于施工图或技术要求变更后评估成本、工期和安全影响；现场小修不在范围内。",
    initiators:
      "设计经理、项目工程师或客户代表可以发起。必填项目、图纸编号、变更说明、变更原因、成本影响、工期影响天数、安全影响、客户指令编号和紧急选项。",
    attachments:
      "必须上传修订图纸 PDF、变更说明 PDF，并填写原生成本与工期影响表。涉及计算时另须上传计算书 PDF。",
    stages:
      "设计经理先审查；工程、商务和安全并行评审各自影响；之后项目经理批准。成本增加超过港币一百万元时再由商业总监批准。每个评审人只看相关字段和文件。",
    conditions:
      "安全影响为是时安全评审必须阻塞流程。成本增加超过港币一百万元走额外审批。紧急选项不能跳过审批。任何拒绝退回修改。",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 9,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 2,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      requiredTerms: ["一百万元", "安全", "工期"],
    },
  }),
  scenario({
    id: "SC-02",
    language: "zh-Hans",
    archetype: "privileged_it_access",
    departmentName: "IT and Security",
    identity:
      "建立“特权系统访问审批”流程，用于生产系统管理员、数据库管理员和高权限云账号；普通办公账号不在范围内。",
    initiators:
      "员工主管或系统负责人可以发起。必填用户、系统、权限角色、业务理由、开始日期、结束日期、是否生产环境、是否可导出数据、紧急访问选项和工单号。",
    attachments:
      "必须填写原生最小权限检查表。生产或数据导出权限必须上传风险评估 PDF。紧急访问必须上传事故或故障工单文本或 PDF。",
    stages:
      "直属主管批准，系统负责人和信息安全并行审批；生产数据库权限再由数据负责人批准。IT 运维收到 FYI，只看用户、系统、角色、有效期和批准结果。",
    conditions:
      "非生产只需主管、系统负责人和安全。生产数据库增加数据负责人。紧急访问可缩短时限但不可跳过审批，并在二十四小时后复核。拒绝退回修改。",
    governance:
      "信息安全负责人每季度复核模板，发布前由模板管理员审核。保留记录二千五百五十五天，权限必须有结束日期并要求修改原因。这是受限数据，不使用电子签名。支持简体中文和英文。",
    expectations: {
      minimumDocuments: 3,
      minimumRequestFields: 10,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireSelectedFieldHandoff: true,
      expectedFyiTerms: ["IT 运维"],
      requiredTerms: ["二十四小时", "生产", "数据负责人"],
    },
  }),
  scenario({
    id: "SC-03",
    language: "zh-Hans",
    archetype: "marketing_claims",
    identity:
      "建立“市场宣传材料审批”流程，用于对外广告、社交媒体、新闻稿和客户案例；内部团队通知不在范围内。",
    initiators:
      "市场人员可以发起。必填活动名称、渠道、目标受众、发布日期、国家或地区、产品、预算、是否包含客户名称、是否含性能声明和材料负责人。",
    attachments:
      "必须上传文案和设计稿 PDF 或图片。包含客户名称时必须上传客户同意书 PDF。填写原生声明依据表，列出每项性能声明及证据。",
    stages:
      "品牌经理审查，法务和产品负责人并行审批；涉及客户名称时客户经理也审批。发布团队收到非阻塞 FYI，只看最终已批准材料、渠道和发布日期。",
    conditions:
      "性能声明必须经过法务和产品审批。客户名称为是时增加客户经理。若目标地区不是香港，增加当地合规审查。拒绝退回修改。",
    expectations: {
      minimumDocuments: 3,
      minimumRequestFields: 10,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["发布团队"],
      requiredTerms: ["客户名称", "性能声明", "香港"],
    },
  }),
  scenario({
    id: "SC-04",
    language: "zh-Hans",
    archetype: "customer_credit_limit",
    departmentName: "Finance Operations",
    identity:
      "建立“客户信用额度审批”流程，用于新设或调整赊销额度；现金客户不在范围内。",
    initiators:
      "销售经理可以发起。必填客户、现有额度、申请额度、币种、付款期限、预计月销售额、逾期余额、风险等级、担保方式和理由。",
    attachments:
      "必须上传信用报告 PDF、最近财务报表 PDF，并填写原生应收账款分析表。额度超过港币五百万元时另须上传担保文件 PDF。",
    stages:
      "销售总监认可，信用控制和财务经理并行审核，然后财务总监批准。销售只能看到额度、期限和结果，不得看到完整信用报告中的敏感内容。",
    conditions:
      "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。拒绝退回修改。",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 10,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 2,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      requiredTerms: ["一百万元", "五百万元", "信用"],
    },
  }),
  scenario({
    id: "SC-05",
    language: "zh-Hans",
    archetype: "asset_disposal",
    departmentName: "Finance Operations",
    identity:
      "建立“固定资产处置审批”流程，用于报废、出售或捐赠公司资产；日常耗材不在范围内。",
    initiators:
      "资产保管人或部门管理员可以发起。必填资产编号、类别、地点、账面净值、估计残值、处置方式、原因、是否存有数据、买方或受赠方及目标日期。",
    attachments:
      "必须上传资产照片和资产登记截图。出售时上传报价 PDF；捐赠时填写原生受赠机构审查表；存有数据时上传数据清除证明 PDF。",
    stages:
      "部门主管认可，资产管理和财务并行审核。存有数据时信息安全审批。出售或捐赠完成后，资产登记团队收到 FYI，只看资产、方式、日期和批准结果。",
    conditions:
      "账面净值超过港币二十万元增加财务总监批准。含数据设备必须在处置前完成安全审批和清除证明。拒绝退回修改。",
    expectations: {
      minimumDocuments: 5,
      minimumRequestFields: 10,
      minimumApprovalNodes: 4,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["资产登记团队"],
      requiredTerms: ["二十万元", "数据清除", "捐赠"],
    },
  }),
  scenario({
    id: "SC-06",
    language: "zh-Hans",
    archetype: "incident_corrective_action",
    departmentName: "Construction Projects",
    identity:
      "建立“事故纠正与预防措施审批”流程，用于安全、质量或环境事故后的调查与结案；即时急救处置不在范围内。",
    initiators:
      "事故负责人或安全质量人员可以发起。必填事故编号、类别、发生时间、地点、严重程度、描述、即时措施、根本原因负责人、目标结案日和是否需监管报告。",
    attachments:
      "必须上传事故报告 PDF、现场照片，并填写原生根本原因和措施表，包含措施、负责人、期限及验证证据。监管事故须上传报告副本 PDF。",
    stages:
      "部门主管确认事实，安全和质量并行审查根本原因，各措施负责人提交完成证据，独立验证人确认有效，最后流程负责人结案。相关管理层收到 FYI。",
    conditions:
      "严重程度为高或需要监管报告时增加高级管理层批准。任何措施未验证不得结案。验证失败退回措施负责人修改，不应新建无关申请。",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 10,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      expectedFyiTerms: ["相关管理层"],
      requiredTerms: ["监管", "验证", "根本原因"],
    },
  }),
  scenario({
    id: "SC-07",
    language: "zh-Hans",
    archetype: "business_travel",
    departmentName: "People Operations",
    identity:
      "建立“商务出差审批”流程，用于员工境内外差旅预算和安全审查；本地日常交通报销不在范围内。",
    initiators:
      "任何员工可以发起。必填目的、城市和国家、出发及返回日期、交通方式、酒店晚数、预计机票、酒店、餐费和其他费用、总额、客户项目及高风险地区选项。",
    attachments:
      "必须上传行程或邀请函 PDF，并填写原生费用预算表。高风险地区必须上传旅行风险评估 PDF。申请签证时可选上传护照资料页，但仅给 HR 查看。",
    stages:
      "直属主管批准，财务审核预算。国际或高风险行程再由 HR 和安全并行审批。旅行服务团队收到 FYI，只看已批准行程、预算和预订需要，不看护照附件。",
    conditions:
      "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。国际或高风险增加 HR 和安全。拒绝退回修改。",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 13,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 2,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      requireRestrictedDocumentHandoff: true,
      expectedFyiTerms: ["旅行服务团队"],
      requiredTerms: ["二万元", "高风险", "护照"],
    },
  }),
  scenario({
    id: "SC-08",
    language: "zh-Hans",
    archetype: "charitable_donation",
    departmentName: "Finance Operations",
    identity:
      "建立“慈善捐赠及赞助审批”流程，用于公司现金或实物捐赠；正常商业采购不在范围内。",
    initiators:
      "部门负责人或企业事务人员可以发起。必填受赠机构、注册地、捐赠类型、金额或实物价值、币种、目的、受益人、是否有关联人士、宣传权益和付款日期。",
    attachments:
      "必须上传受赠机构注册证明 PDF、方案 PDF，并填写原生尽职调查和利益冲突表。实物捐赠另须上传物品清单 Excel。",
    stages:
      "企业事务认可，合规和财务并行审查，再由行政总监批准。金额超过港币五十万元时增加行政总裁批准。付款团队收到 FYI，只看受赠机构、金额、日期和批准结果。",
    conditions:
      "有关联人士时增加独立高管审批。超过港币五十万元增加行政总裁。境外受赠机构增加法务审查。所有适用分支必须批准；拒绝退回修改。",
    governance:
      "企业事务流程负责人每年复核，发布前由流程负责人和模板管理员共同审核。保留记录二千五百五十五天，要求修改原因。这是机密数据，不加入电子签名。支持简体中文和英文。",
    expectations: {
      minimumDocuments: 4,
      minimumRequestFields: 10,
      minimumApprovalNodes: 5,
      minimumConditionNodes: 3,
      requireFyi: true,
      requireParallelFanout: true,
      requireManualForm: true,
      expectedFyiTerms: ["付款团队"],
      requiredTerms: ["五十万元", "关联人士", "境外"],
    },
  }),
];

export function answersForScenario(item) {
  return {
    identity_scope: item.identity,
    initiators_fields: item.initiators,
    attachments: item.attachments,
    stages_participants: item.stages,
    conditions_exceptions: item.conditions,
    collaboration_corrections: item.collaboration,
    timing_escalation: item.timing,
    visibility_notifications: item.visibility,
    governance: item.governance,
  };
}
