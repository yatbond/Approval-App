import { z } from "zod";

export const templateCopilotConceptLocales = ["en", "zh-Hant", "zh-Hans"] as const;
export type TemplateCopilotConceptLocale = (typeof templateCopilotConceptLocales)[number];

const conceptLocaleSchema = z.enum(templateCopilotConceptLocales);
const conceptIdSchema = z.string().regex(/^copilot\.[a-z][a-z0-9_.-]{2,95}$/);
const conceptVersionSchema = z.string().regex(/^\d+\.\d+$/);
const conceptLibraryVersionSchema = z.string().regex(/^concepts\.v\d+\.\d+$/);
const boundedTextSchema = z.string().trim().min(1).max(1_500);
const reviewedAtSchema = z.string().datetime({ offset: true });

const localizedConceptContentSchema = z.object({
  plainLabel: z.string().trim().min(1).max(120),
  explanation: boundedTextSchema,
  example: boundedTextSchema,
  workflowEffect: boundedTextSchema,
}).strict();

const conceptReviewSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  reviewerType: z.enum(["human", "system"]),
  reviewer: z.string().trim().min(3).max(160),
  reviewedAt: reviewedAtSchema.optional(),
  evidenceRef: z.string().trim().min(3).max(240).optional(),
}).strict();

export const templateCopilotConceptEntrySchema = z.object({
  conceptId: conceptIdSchema,
  version: conceptVersionSchema,
  internalTechnicalName: z.string().regex(/^[a-z][a-z0-9_.-]{2,95}$/),
  semanticContract: z.array(z.string().regex(/^[a-z][a-z0-9_.-]{2,95}$/)).min(1).max(12),
  content: z.object({
    en: localizedConceptContentSchema.optional(),
    "zh-Hant": localizedConceptContentSchema.optional(),
    "zh-Hans": localizedConceptContentSchema.optional(),
  }).strict(),
  review: z.object({
    en: conceptReviewSchema,
    "zh-Hant": conceptReviewSchema,
    "zh-Hans": conceptReviewSchema,
  }).strict(),
}).strict();

export const templateCopilotConceptLibrarySchema = z.object({
  version: conceptLibraryVersionSchema,
  contentReviewFingerprint: z.string().regex(/^fnv1a64:[0-9a-f]{16}$/),
  enabledLocales: z.array(conceptLocaleSchema).max(3),
  entries: z.array(templateCopilotConceptEntrySchema).min(1).max(100),
  fallback: z.object({
    mode: z.literal("approved_content_only"),
    order: z.object({
      en: z.array(conceptLocaleSchema).max(2),
      "zh-Hant": z.array(conceptLocaleSchema).max(2),
      "zh-Hans": z.array(conceptLocaleSchema).max(2),
    }).strict(),
    unavailable: z.literal("show_explicit_unavailable"),
    telemetryEvent: z.literal("template_copilot_help_fallback"),
  }).strict(),
}).strict();

export type TemplateCopilotConceptEntry = z.infer<typeof templateCopilotConceptEntrySchema>;
export type TemplateCopilotConceptLibrary = z.infer<typeof templateCopilotConceptLibrarySchema>;
export type TemplateCopilotResolvedConcept = Readonly<{
  conceptId: string;
  conceptVersion: string;
  libraryVersion: string;
  requestedLocale: TemplateCopilotConceptLocale;
  displayedLocale: TemplateCopilotConceptLocale;
  content: z.infer<typeof localizedConceptContentSchema>;
  controls: Readonly<{
    whatDoesThisMean: string;
    explanation: string;
    example: string;
    workflowEffect: string;
    close: string;
  }>;
  fallback?: Readonly<{
    event: "template_copilot_help_fallback";
    reason: "locale_disabled" | "missing_locale" | "unreviewed_locale" | "concept_unavailable";
    requestedLocale: TemplateCopilotConceptLocale;
    displayedLocale?: TemplateCopilotConceptLocale;
    libraryVersion: string;
    conceptId: string;
    visibleNotice: string;
  }>;
}>;

export class TemplateCopilotConceptLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateCopilotConceptLibraryError";
  }
}

function pendingReview() {
  return {
    status: "pending" as const,
    reviewerType: "human" as const,
    reviewer: "Unassigned reviewer",
  };
}

function content(
  en: readonly [string, string, string, string],
  zhHant: readonly [string, string, string, string],
  zhHans: readonly [string, string, string, string],
) {
  const build = ([plainLabel, explanation, example, workflowEffect]: readonly [string, string, string, string]) => ({
    plainLabel,
    explanation,
    example,
    workflowEffect,
  });
  return { en: build(en), "zh-Hant": build(zhHant), "zh-Hans": build(zhHans) };
}

function concept(
  conceptId: string,
  internalTechnicalName: string,
  semanticContract: readonly string[],
  localized: ReturnType<typeof content>,
) {
  return {
    conceptId,
    version: "1.0",
    internalTechnicalName,
    semanticContract: [...semanticContract],
    content: localized,
    review: {
      en: pendingReview(),
      "zh-Hant": pendingReview(),
      "zh-Hans": pendingReview(),
    },
  };
}

const conceptEntries = [
  concept("copilot.workflow.name", "workflow_display_name", ["names.workflow", "does_not_route"], content(
    ["Workflow name", "The short name employees use to find and recognise this approval process.", "Supplier payment request", "It changes how the workflow is listed and searched; it does not change who approves."],
    ["流程名稱", "這是同事用來尋找及辨認審批流程的簡短名稱。", "供應商付款申請", "名稱只影響流程在清單和搜尋中的顯示，不會改變審批人。"],
    ["流程名称", "这是员工用来查找和识别审批流程的简短名称。", "供应商付款申请", "名称只影响流程在列表和搜索中的显示，不会改变审批人。"],
  )),
  concept("copilot.workflow.purpose", "workflow_business_purpose", ["describes.business_outcome", "does_not_route"], content(
    ["Business purpose", "The practical business job this workflow is meant to complete.", "Approve supplier payments before Finance pays them.", "It helps employees and reviewers understand when the workflow should be used."],
    ["業務目的", "這是流程要完成的實際業務工作。", "在財務付款前審批供應商付款。", "它協助同事及審批人判斷何時應使用此流程。"],
    ["业务目的", "这是流程要完成的实际业务工作。", "在财务付款前审批供应商付款。", "它帮助员工和审批人判断何时应使用此流程。"],
  )),
  concept("copilot.workflow.scope", "workflow_request_scope", ["includes.request_types", "excludes.request_types"], content(
    ["Requests covered", "This defines which kinds of request belong in this workflow and which similar requests do not.", "Use it for supplier invoices, but not for employee expense claims.", "It helps requesters choose the correct workflow and keeps unrelated requests out."],
    ["適用申請", "這項資料界定哪些申請應使用此流程，以及哪些相近申請不應使用。", "供應商發票使用此流程；員工報銷則使用其他流程。", "它協助申請人選擇正確流程，避免不相關申請進入。"],
    ["适用申请", "这项信息界定哪些申请应使用此流程，以及哪些相近申请不应使用。", "供应商发票使用此流程；员工报销则使用其他流程。", "它帮助申请人选择正确流程，避免无关申请进入。"],
  )),
  concept("copilot.request.initiator_policy", "request_initiator_policy", ["controls.who_can_start", "may_use.directory_roles"], content(
    ["Who may start a request", "This decides whether every employee or only people in named job roles may submit a new request.", "Only Procurement Managers and Finance Officers may start it.", "It controls access to the request form; it does not decide who approves later."],
    ["誰可發起申請", "這項設定決定所有員工都可提交，還是只有指定職位的同事可提交新申請。", "只有採購經理及財務主任可以發起申請。", "它控制誰可使用申請表格，不會決定之後由誰審批。"],
    ["谁可发起申请", "这项设置决定所有员工都可提交，还是只有指定职位的员工可提交新申请。", "只有采购经理和财务专员可以发起申请。", "它控制谁可使用申请表单，不会决定之后由谁审批。"],
  )),
  concept("copilot.request.fields", "request_form_fields", ["collects.request_data", "supports.conditions"], content(
    ["Information on the request form", "These are the details a requester must enter so reviewers can understand and decide the request.", "Supplier name, amount, cost centre, and payment date", "The fields appear on the request form and may also be used by routing rules."],
    ["申請表格資料", "這些是申請人必須填寫的資料，讓審批人了解申請並作出決定。", "供應商名稱、金額、成本中心及付款日期", "這些欄位會顯示在申請表格，亦可供流程規則使用。"],
    ["申请表单信息", "这些是申请人必须填写的信息，让审批人了解申请并作出决定。", "供应商名称、金额、成本中心和付款日期", "这些字段会显示在申请表单，也可供流程规则使用。"],
  )),
  concept("copilot.attachments.requirements", "attachment_requirements", ["collects.files", "collects.forms", "may_bind.stage"], content(
    ["Files and in-app forms", "This lists the documents, uploads, or in-app forms a requester or contributor must provide.", "Require a supplier quotation in PDF format and an in-app declaration form before the Finance review.", "It controls which files or forms are requested, whether they are mandatory, how many are needed, and when they must be provided."],
    ["檔案及應用程式內表格", "這項設定列出申請人或協作者必須提供的文件、上載檔案或應用程式內表格。", "在財務審閱前，必須提供一份 PDF 供應商報價單及填寫應用程式內聲明表格。", "它控制需要哪些檔案或表格、是否必交、所需數量，以及須在哪個步驟前提供。"],
    ["文件及应用内表单", "这项设置列出申请人或协作者必须提供的文档、上传文件或应用内表单。", "在财务审核前，必须提供一份 PDF 供应商报价单并填写应用内声明表单。", "它控制需要哪些文件或表单、是否必交、所需数量，以及须在哪个步骤前提供。"],
  )),
  concept("copilot.workflow.stages", "ordered_workflow_stages", ["orders.actions", "may_run.parallel", "resolves.participants"], content(
    ["Steps and people", "These are the actions and responsible people in the process. Steps usually happen in order, while independent steps may happen at the same time.", "The manager and Finance review at the same time; the Director approves after both finish.", "The sequence, any same-time groups, and each person-setting decide who receives the request and when."],
    ["步驟及處理人", "這些是流程中的工作及負責人。步驟通常按次序進行，互不依賴的步驟亦可同時進行。", "經理及財務部同時審閱；兩者完成後再由董事批准。", "步驟次序、同時進行的組別及處理人設定，會決定誰在何時收到申請。"],
    ["步骤及处理人", "这些是流程中的工作及负责人。步骤通常按顺序进行，互不依赖的步骤也可同时进行。", "经理及财务部门同时审核；两者完成后再由总监批准。", "步骤顺序、同时进行的分组及处理人设置，会决定谁在何时收到申请。"],
  )),
  concept("copilot.workflow.conditions", "conditional_workflow_routes", ["compares.request_field", "selects.route"], content(
    ["Rules for different requests", "A rule checks one item on the request and sends matching requests along a specified path.", "If Amount is at least HK$10,000, send the request to Finance; otherwise continue to the manager.", "It changes the path only when the stated check matches; every rule also needs a clear other path."],
    ["不同申請的處理規則", "規則會檢查申請內的一項資料，並把符合條件的申請送到指定處理路徑。", "若金額不少於 HK$10,000，先交財務部；否則繼續交經理。", "只有符合指定檢查時才會改變路徑；每項規則亦須清楚列出其他申請的處理方式。"],
    ["不同申请的处理规则", "规则会检查申请中的一项信息，并把符合条件的申请送到指定处理路径。", "若金额不少于 HK$10,000，先交财务部门；否则继续交经理。", "只有符合指定检查时才会改变路径；每项规则也须清楚列出其他申请的处理方式。"],
  )),
  concept("copilot.workflow.rejection_policy", "rejection_outcome_policy", ["controls.rejection_outcome", "may_allow.correction"], content(
    ["What happens after rejection", "This decides whether a rejected request ends or returns so the requester can correct and resubmit it.", "Return the request to the requester with comments, then send the corrected request back to the same reviewer.", "It controls the next state and route after someone rejects the request."],
    ["申請被拒後如何處理", "這項設定決定被拒申請會結束，還是退回讓申請人更正後再提交。", "連同意見退回申請人；更正後再交回同一位審批人。", "它控制申請被拒後的狀態及下一個處理路徑。"],
    ["申请被拒后如何处理", "这项设置决定被拒申请会结束，还是退回让申请人更正后再提交。", "连同意见退回申请人；更正后再交回同一位审批人。", "它控制申请被拒后的状态及下一个处理路径。"],
  )),
  concept("copilot.collaboration.policy", "request_collaboration_policy", ["controls.contributors", "controls.correction_check"], content(
    ["Help from other colleagues", "This controls whether another colleague may provide files and whether corrected files need a separate check.", "Procurement may upload the quotation, and the Procurement Manager checks any replacement.", "It decides who may contribute documents and whether the request must pause for confirmation."],
    ["其他同事協助", "這項設定控制其他同事可否提供檔案，以及更正檔案是否需要另行檢查。", "採購部可上載報價單；如有替換檔案，則由採購經理核對。", "它決定誰可協助提供文件，以及申請是否須暫停等候確認。"],
    ["其他员工协助", "这项设置控制其他员工能否提供文件，以及更正文件是否需要另行检查。", "采购部门可上传报价单；如有替换文件，则由采购经理核对。", "它决定谁可协助提供文档，以及申请是否须暂停等待确认。"],
  )),
  concept("copilot.timing.rules", "due_reminder_overdue_rules", ["sets.due_time", "sets.reminder", "sets.overdue_action"], content(
    ["Reply times and overdue actions", "This states how long each person has, when to remind them, and what to do if no reply arrives.", "Allow two working days, remind after one day, then notify the person’s manager when overdue.", "It controls due dates, reminders, and the action taken after the time limit passes."],
    ["回覆期限及逾期處理", "這項設定說明每位處理人有多少時間、何時提醒，以及未有回覆時如何處理。", "限期為兩個工作天；一天後提醒；逾期後通知其經理。", "它控制截止時間、提醒及超過期限後採取的行動。"],
    ["回复期限及逾期处理", "这项设置说明每位处理人有多少时间、何时提醒，以及没有回复时如何处理。", "期限为两个工作日；一天后提醒；逾期后通知其经理。", "它控制截止时间、提醒及超过期限后采取的行动。"],
  )),
  concept("copilot.visibility.policy", "request_visibility_policy", ["controls.who_can_view", "does_not_assign.action"], content(
    ["Who may view the request", "This lists the people or groups allowed to see the request, its documents, and its progress.", "The requester, current reviewer, Finance team, and workflow owner may view it.", "It controls visibility only; viewing permission does not give someone approval authority."],
    ["誰可查看申請", "這項設定列出可查看申請、文件及進度的人士或小組。", "申請人、目前審批人、財務團隊及流程負責部門可以查看。", "它只控制查看權限；可以查看並不代表有權審批。"],
    ["谁可查看申请", "这项设置列出可查看申请、文档和进度的人员或小组。", "申请人、当前审批人、财务团队和流程负责部门可以查看。", "它只控制查看权限；可以查看并不代表有权审批。"],
  )),
  concept("copilot.notifications.rules", "workflow_notification_rules", ["selects.event", "selects.recipient", "selects.channel"], content(
    ["Messages sent by the workflow", "Each notification says what event sends a message, who receives it, and where it is delivered.", "When a request is returned for changes, email the requester and show an in-app message.", "It controls communication only; a notification does not approve, reject, or reroute a request."],
    ["流程發出的通知", "每項通知會說明哪個事件觸發訊息、誰會收到，以及經哪個渠道發送。", "申請被退回更正時，以電郵及應用程式內訊息通知申請人。", "它只控制溝通；通知本身不會批准、拒絕或改變申請路徑。"],
    ["流程发出的通知", "每项通知会说明哪个事件触发消息、谁会收到，以及通过哪个渠道发送。", "申请被退回更正时，以电子邮件及应用内消息通知申请人。", "它只控制沟通；通知本身不会批准、拒绝或改变申请路径。"],
  )),
  concept("copilot.governance.owner", "workflow_business_owner", ["identifies.business_owner", "owns.change_decisions"], content(
    ["Department responsible for the workflow", "This is the business department accountable for keeping the workflow correct and deciding when it should change.", "Procurement owns the supplier onboarding workflow.", "It identifies the accountable business owner; it does not automatically assign every approval to that department."],
    ["流程負責部門", "這是負責確保流程正確，並決定何時需要修改的業務部門。", "供應商登記流程由採購部負責。", "它列出須承擔責任的業務部門，但不會自動把每項審批交給該部門。"],
    ["流程负责部门", "这是负责确保流程正确，并决定何时需要修改的业务部门。", "供应商登记流程由采购部门负责。", "它列出须承担责任的业务部门，但不会自动把每项审批交给该部门。"],
  )),
  concept("copilot.governance.policies", "workflow_governance_policies", ["identifies.change_reviewer", "identifies.applicable_policies"], content(
    ["Review responsibility and company rules", "This records who checks workflow changes and which company policies the workflow must follow.", "Finance Control reviews changes; the Purchasing Policy and HK$50,000 spending rule apply.", "It provides governance evidence and review requirements without replacing the approval stages."],
    ["更改審閱責任及公司規則", "這項資料記錄由誰檢查流程更改，以及流程必須遵從哪些公司政策。", "由財務監控組審閱更改，並須遵從採購政策及 HK$50,000 開支規則。", "它提供管治及審閱依據，但不會取代流程內的審批步驟。"],
    ["更改审核责任及公司规则", "这项信息记录由谁检查流程更改，以及流程必须遵守哪些公司政策。", "由财务监控组审核更改，并须遵守采购政策及 HK$50,000 支出规则。", "它提供治理及审核依据，但不会取代流程内的审批步骤。"],
  )),
  concept("copilot.governance.retention", "workflow_record_retention", ["sets.retention_period", "covers.records_and_files"], content(
    ["How long records are kept", "This states how long completed requests, decisions, and attached files must remain available.", "Keep the request, approval history, and attachments for seven years.", "It controls the retention requirement used by records management and audit processes."],
    ["記錄保留期", "這項設定說明已完成申請、審批決定及附件須保留多久。", "申請、審批記錄及附件保留七年。", "它控制記錄管理及審計程序所使用的保留要求。"],
    ["记录保留期", "这项设置说明已完成申请、审批决定和附件须保留多久。", "申请、审批记录和附件保留七年。", "它控制记录管理及审计程序所使用的保留要求。"],
  )),
] as const;

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const objectValue = value as Record<PropertyKey, unknown>;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  for (const key of Reflect.ownKeys(objectValue)) deepFreeze(objectValue[key], seen);
  return Object.freeze(value);
}

export function templateCopilotReviewedContentFingerprint(value: unknown) {
  const source = JSON.stringify(value);
  let first = 0x811c9dc5 >>> 0;
  let second = 0x9e3779b9 >>> 0;
  for (let index = 0; index < source.length; index += 1) {
    const codeUnit = source.charCodeAt(index);
    first = Math.imul((first ^ codeUnit) >>> 0, 0x01000193) >>> 0;
    second = Math.imul((second ^ codeUnit) >>> 0, 0x85ebca6b) >>> 0;
  }
  return `fnv1a64:${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function templateCopilotConceptContentFingerprint(entries: readonly TemplateCopilotConceptEntry[]) {
  return templateCopilotReviewedContentFingerprint(entries.map(({
    conceptId,
    version,
    internalTechnicalName,
    semanticContract,
    content: localizedContent,
  }) => ({
    conceptId,
    version,
    internalTechnicalName,
    semanticContract,
    content: localizedContent,
  })));
}

function reviewIsApproved(review: z.infer<typeof conceptReviewSchema>) {
  return review.status === "approved"
    && review.reviewerType === "human"
    && Boolean(review.reviewedAt)
    && Boolean(review.evidenceRef)
    && !/\b(?:ai|model|system|automated|pending|unassigned)\b/iu.test(review.reviewer);
}

export function validateTemplateCopilotConceptLibrary(
  input: unknown,
  options: { production?: boolean } = {},
): TemplateCopilotConceptLibrary {
  const parsed = templateCopilotConceptLibrarySchema.safeParse(input);
  if (!parsed.success) throw new TemplateCopilotConceptLibraryError("The Copilot concept library has an invalid shape.");
  const library = parsed.data;
  if (new Set(library.enabledLocales).size !== library.enabledLocales.length) {
    throw new TemplateCopilotConceptLibraryError("The Copilot concept library has duplicate enabled locales.");
  }
  if (library.contentReviewFingerprint !== templateCopilotConceptContentFingerprint(library.entries)) {
    throw new TemplateCopilotConceptLibraryError("The Copilot concept content no longer matches its human-review fingerprint.");
  }
  const seen = new Set<string>();
  for (const entry of library.entries) {
    if (seen.has(entry.conceptId)) throw new TemplateCopilotConceptLibraryError(`Duplicate concept ID: ${entry.conceptId}.`);
    seen.add(entry.conceptId);
    for (const locale of templateCopilotConceptLocales) {
      const localized = entry.content[locale];
      const review = entry.review[locale];
      if (review.status === "approved" && (!localized || !reviewIsApproved(review))) {
        throw new TemplateCopilotConceptLibraryError(`Concept ${entry.conceptId} has invalid approved review evidence for ${locale}.`);
      }
      if (options.production && library.enabledLocales.includes(locale) && (!localized || !reviewIsApproved(review))) {
        throw new TemplateCopilotConceptLibraryError(`Concept ${entry.conceptId} is not production-approved for ${locale}.`);
      }
    }
  }
  for (const locale of templateCopilotConceptLocales) {
    const order = library.fallback.order[locale];
    if (new Set(order).size !== order.length || order.includes(locale)) {
      throw new TemplateCopilotConceptLibraryError(`Concept fallback order for ${locale} is invalid.`);
    }
  }
  return library;
}

const v1ConceptLibrary = deepFreeze(validateTemplateCopilotConceptLibrary({
  version: "concepts.v1.0",
  contentReviewFingerprint: "fnv1a64:18974b8087ddb5a4",
  enabledLocales: [],
  entries: conceptEntries,
  fallback: {
    mode: "approved_content_only",
    order: {
      en: [],
      "zh-Hant": ["en"],
      "zh-Hans": ["en"],
    },
    unavailable: "show_explicit_unavailable",
    telemetryEvent: "template_copilot_help_fallback",
  },
}));

const conceptLibraries: Readonly<Record<string, TemplateCopilotConceptLibrary>> = Object.freeze({
  [v1ConceptLibrary.version]: v1ConceptLibrary,
});

export function getTemplateCopilotConceptLibrary(version: string) {
  const library = conceptLibraries[version];
  if (!library) throw new TemplateCopilotConceptLibraryError(`No pinned Copilot concept library exists for version ${version}.`);
  return library;
}

const controlCopy = {
  en: {
    whatDoesThisMean: "What does this mean?",
    explanation: "In plain language",
    example: "Example",
    workflowEffect: "What this changes",
    close: "Hide explanation",
    fallback: "This help is not yet approved in your selected language, so the approved English version is shown.",
    unavailable: "Reviewed help for this item is temporarily unavailable. You can still answer the plain-language question or choose Not sure.",
  },
  "zh-Hant": {
    whatDoesThisMean: "這是甚麼意思？",
    explanation: "簡單說明",
    example: "例子",
    workflowEffect: "這項設定會改變甚麼",
    close: "收起說明",
    fallback: "這項說明尚未獲准以你所選的語言顯示，因此現正顯示已獲准的英文版本。",
    unavailable: "這項資料的已審閱說明暫時未能提供。你仍可回答上方的簡單問題，或選擇「未能確定」。",
  },
  "zh-Hans": {
    whatDoesThisMean: "这是什么意思？",
    explanation: "简单说明",
    example: "示例",
    workflowEffect: "这项设置会改变什么",
    close: "收起说明",
    fallback: "这项说明尚未获准以你所选的语言显示，因此现在显示已获准的英文版本。",
    unavailable: "这项信息的已审核说明暂时无法提供。你仍可回答上方的简单问题，或选择“暂不确定”。",
  },
} as const;

export function resolveTemplateCopilotConcept({
  libraryVersion,
  conceptId,
  locale,
  libraryInput,
}: {
  libraryVersion: string;
  conceptId: string;
  locale: TemplateCopilotConceptLocale;
  libraryInput?: TemplateCopilotConceptLibrary;
}): TemplateCopilotResolvedConcept {
  const library = libraryInput
    ? validateTemplateCopilotConceptLibrary(libraryInput)
    : getTemplateCopilotConceptLibrary(libraryVersion);
  if (library.version !== libraryVersion) {
    throw new TemplateCopilotConceptLibraryError("The supplied concept library does not match the pinned version.");
  }
  const entry = library.entries.find((candidate) => candidate.conceptId === conceptId);
  const candidates = [locale, ...library.fallback.order[locale]] as TemplateCopilotConceptLocale[];
  for (const displayedLocale of candidates) {
    if (!library.enabledLocales.includes(displayedLocale)) continue;
    const localized = entry?.content[displayedLocale];
    const review = entry?.review[displayedLocale];
    if (!localized || !review || !reviewIsApproved(review)) continue;
    const fallbackReason = displayedLocale === locale
      ? undefined
      : !library.enabledLocales.includes(locale)
        ? "locale_disabled" as const
      : entry?.content[locale]
        ? "unreviewed_locale" as const
        : "missing_locale" as const;
    return deepFreeze({
      conceptId,
      conceptVersion: entry.version,
      libraryVersion,
      requestedLocale: locale,
      displayedLocale,
      content: localized,
      controls: controlCopy[locale],
      ...(fallbackReason ? {
        fallback: {
          event: library.fallback.telemetryEvent,
          reason: fallbackReason,
          requestedLocale: locale,
          displayedLocale,
          libraryVersion,
          conceptId,
          visibleNotice: controlCopy[locale].fallback,
        },
      } : {}),
    });
  }
  return deepFreeze({
    conceptId,
    conceptVersion: entry?.version || "0.0",
    libraryVersion,
    requestedLocale: locale,
    displayedLocale: locale,
    content: {
      plainLabel: controlCopy[locale].whatDoesThisMean,
      explanation: controlCopy[locale].unavailable,
      example: controlCopy[locale].unavailable,
      workflowEffect: controlCopy[locale].unavailable,
    },
    controls: controlCopy[locale],
    fallback: {
      event: library.fallback.telemetryEvent,
      reason: "concept_unavailable",
      requestedLocale: locale,
      libraryVersion,
      conceptId,
      visibleNotice: controlCopy[locale].unavailable,
    },
  });
}

export function getTemplateCopilotConceptReviewSummary(version = "concepts.v1.0") {
  const library = getTemplateCopilotConceptLibrary(version);
  const locales = Object.fromEntries(templateCopilotConceptLocales.map((locale) => {
    const approved = library.entries.filter((entry) => entry.content[locale] && reviewIsApproved(entry.review[locale])).length;
    return [locale, Object.freeze({
      approved,
      total: library.entries.length,
      productionApproved: library.enabledLocales.includes(locale) && approved === library.entries.length,
      reviewer: library.entries[0]?.review[locale].reviewer || "",
      reviewedAt: library.entries[0]?.review[locale].reviewedAt || "",
      evidenceRef: library.entries[0]?.review[locale].evidenceRef || "",
    })];
  }));
  return deepFreeze({
    version: library.version,
    contentReviewFingerprint: library.contentReviewFingerprint,
    conceptCount: library.entries.length,
    enabledLocales: [...library.enabledLocales],
    productionReady: templateCopilotConceptLocales.every((locale) => locales[locale].productionApproved),
    fallback: library.fallback,
    locales,
    entries: library.entries.map((entry) => ({
      conceptId: entry.conceptId,
      version: entry.version,
      internalTechnicalName: entry.internalTechnicalName,
      semanticContract: entry.semanticContract,
      labels: Object.fromEntries(templateCopilotConceptLocales.map((locale) => [locale, entry.content[locale]?.plainLabel || ""])),
    })),
  });
}

export function isTemplateCopilotConceptLocaleProductionReady(
  locale: TemplateCopilotConceptLocale,
  version = "concepts.v1.0",
) {
  const library = getTemplateCopilotConceptLibrary(version);
  return library.enabledLocales.includes(locale)
    && library.entries.every((entry) => Boolean(entry.content[locale]) && reviewIsApproved(entry.review[locale]));
}

export function templateCopilotConceptLibraryVersionForQuestionLibrary(questionLibraryVersion: string) {
  return questionLibraryVersion === "v2.2" ? "concepts.v1.0" : null;
}

export function getTemplateCopilotHelpFallbackTelemetry(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const interview = "interview" in value && value.interview && typeof value.interview === "object"
    ? value.interview as Record<string, unknown>
    : value as Record<string, unknown>;
  const nextQuestion = interview.nextQuestion;
  if (!nextQuestion || typeof nextQuestion !== "object") return null;
  const helpDetail = (nextQuestion as Record<string, unknown>).helpDetail;
  if (!helpDetail || typeof helpDetail !== "object") return null;
  const fallback = (helpDetail as Record<string, unknown>).fallback;
  if (!fallback || typeof fallback !== "object") return null;
  const record = fallback as Record<string, unknown>;
  if (record.event !== "template_copilot_help_fallback") return null;
  return Object.freeze({
    reason: typeof record.reason === "string" ? record.reason.slice(0, 64) : "unknown",
    conceptId: typeof record.conceptId === "string" ? record.conceptId.slice(0, 100) : "unknown",
    libraryVersion: typeof record.libraryVersion === "string" ? record.libraryVersion.slice(0, 64) : "unknown",
    requestedLocale: typeof record.requestedLocale === "string" ? record.requestedLocale.slice(0, 16) : "unknown",
    displayedLocale: typeof record.displayedLocale === "string" ? record.displayedLocale.slice(0, 16) : null,
  });
}
