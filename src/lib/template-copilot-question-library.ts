import { z } from "zod";
import {
  templateCopilotFactIds,
  templateCopilotV2LedgerSchema,
  type TemplateCopilotFactId,
  type TemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";
import {
  getTemplateCopilotConceptLibrary,
  resolveTemplateCopilotConcept,
  templateCopilotConceptLibraryVersionForQuestionLibrary,
  templateCopilotReviewedContentFingerprint,
  type TemplateCopilotResolvedConcept,
} from "./template-copilot-concepts.ts";
import { getTemplateCopilotV2Step4Interaction, type TemplateCopilotV2Step4Interaction } from "./template-copilot-v2-step4.ts";
import { templateCopilotV2Step8QuestionContentReview } from "./template-copilot-v2-step8-review.ts";

const questionIdSchema = z.string().regex(/^v2\.[a-z][a-z0-9_.-]{2,95}$/);
const libraryVersionSchema = z.string().regex(/^v2\.\d+$/);
const localeTextSchema = z.object({
  en: z.string().trim().min(1).max(1_000),
  "zh-Hant": z.string().trim().min(1).max(1_000),
  "zh-Hans": z.string().trim().min(1).max(1_000),
}).strict();
const questionLocaleReviewSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  reviewerType: z.literal("human"),
  reviewer: z.string().trim().min(2).max(160),
  reviewedAt: z.string().datetime({ offset: true }).optional(),
  evidenceRef: z.string().trim().min(3).max(240).optional(),
}).strict();
const questionContentReviewSchema = z.object({
  scope: z.literal("all_localized_question_content"),
  questionCount: z.number().int().min(1).max(400),
  contentFingerprint: z.string().regex(/^fnv1a64:[0-9a-f]{16}$/),
  locales: z.object({
    en: questionLocaleReviewSchema,
    "zh-Hant": questionLocaleReviewSchema,
    "zh-Hans": questionLocaleReviewSchema,
  }).strict(),
}).strict();

const applicabilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always") }).strict(),
  // A dependent question is never silently treated as N/A while the answer
  // that decides it is still unknown.  It is simply pending.
  z.object({ kind: z.literal("decision_equals"), decisionId: z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/), values: z.array(z.string().trim().min(1).max(200)).min(1).max(12) }).strict(),
  z.object({ kind: z.literal("decision_not_equals"), decisionId: z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/), values: z.array(z.string().trim().min(1).max(200)).min(1).max(12) }).strict(),
]);

// The follow-up wording is content, rather than controller logic.  That means
// a session always renders the wording from the question-library version that
// was pinned when the session began.
const personResolverPromptVariantsSchema = z.object({
  selectorDecisionId: z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/),
  variants: z.object({
    fixed_email: localeTextSchema,
    directory_role: localeTextSchema,
    request_field: localeTextSchema,
  }).strict(),
}).strict();

export const templateCopilotQuestionSchema = z.object({
  questionId: questionIdSchema,
  targetFactId: z.enum(templateCopilotFactIds),
  // A question has one and only one server-governed decision; it cannot ask a
  // model to select a field or apply several facts in one turn.
  primaryDecision: z.object({
    decisionId: z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/),
    factId: z.enum(templateCopilotFactIds),
  }).strict(),
  prerequisiteDecisionIds: z.array(z.string().regex(/^decision\.[a-z][a-z0-9_.-]{2,95}$/)).max(12).default([]),
  applicability: applicabilitySchema,
  answer: z.object({
    type: z.enum(["short_text", "long_text", "policy", "structured_configuration", "choice"]),
    schemaRef: z.string().regex(/^v2\.fact\.[a-z][a-z0-9_.-]+\.v1$/),
    validation: z.literal("server_fact_transition"),
    options: z.array(z.object({ optionId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/), label: localeTextSchema }).strict()).min(2).max(12).optional(),
  }).strict(),
  help: z.object({ conceptRef: z.string().regex(/^copilot\.[a-z][a-z0-9_.-]{2,95}$/), body: localeTextSchema }).strict(),
  uncertainty: z.object({ notSure: z.literal(true), notApplicable: z.enum(["never", "when_optional"]) }).strict(),
  priority: z.number().int().min(1).max(10_000),
  prompt: localeTextSchema,
  personResolverPromptVariants: personResolverPromptVariantsSchema.optional(),
  example: localeTextSchema.optional(),
}).strict();

export const templateCopilotQuestionLibrarySchema = z.object({
  version: libraryVersionSchema,
  conceptLibraryVersion: z.string().regex(/^concepts\.v\d+\.\d+$/).optional(),
  contentReview: questionContentReviewSchema.optional(),
  questions: z.array(templateCopilotQuestionSchema).min(templateCopilotFactIds.length).max(400),
}).strict();

export type TemplateCopilotQuestion = z.infer<typeof templateCopilotQuestionSchema>;
export type TemplateCopilotQuestionLibrary = z.infer<typeof templateCopilotQuestionLibrarySchema>;

export type TemplateCopilotAtomicAnswerInput = Readonly<{ kind: "text"; text: string } | { kind: "choice"; optionId: string }>;

export class TemplateCopilotQuestionLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateCopilotQuestionLibraryError";
  }
}

type QuestionSeed = Readonly<{
  factId: TemplateCopilotFactId;
  decision: string;
  priority: number;
  type: TemplateCopilotQuestion["answer"]["type"];
  prerequisiteDecisions?: readonly string[];
  applicability?: TemplateCopilotQuestion["applicability"];
  prompt: readonly [string, string, string];
  personResolverPromptVariants?: Readonly<{
    selectorDecisionId: string;
    variants: Readonly<{
      fixed_email: readonly [string, string, string];
      directory_role: readonly [string, string, string];
      request_field: readonly [string, string, string];
    }>;
  }>;
  example?: readonly [string, string, string];
  notApplicable?: boolean;
}>;

const yesNoOptions = [
  { optionId: "yes", label: { en: "Yes", "zh-Hant": "是", "zh-Hans": "是" } },
  { optionId: "no", label: { en: "No", "zh-Hant": "否", "zh-Hans": "否" } },
] as const;
function choiceOptionsFor(decision: string) {
  if (decision.includes("person_mode")) return [
    { optionId: "fixed_email", label: { en: "A fixed email address", "zh-Hant": "指定電郵地址", "zh-Hans": "指定电子邮件地址" } },
    { optionId: "directory_role", label: { en: "A directory role", "zh-Hant": "目錄職位", "zh-Hans": "目录职位" } },
    { optionId: "request_field", label: { en: "An email entered in the request", "zh-Hant": "申請內填寫的電郵", "zh-Hans": "申请内填写的电子邮件" } },
    { optionId: "assigned_later", label: { en: "Assigned later", "zh-Hant": "稍後指派", "zh-Hans": "稍后指派" } },
  ];
  if (/(?:^|_)comparison$/.test(decision)) return [
    { optionId: "equals", label: { en: "Equals", "zh-Hant": "等於", "zh-Hans": "等于" } },
    { optionId: "not_equals", label: { en: "Does not equal", "zh-Hant": "不等於", "zh-Hans": "不等于" } },
    { optionId: "greater_than", label: { en: "Greater than", "zh-Hant": "大於", "zh-Hans": "大于" } },
    { optionId: "at_least", label: { en: "At least", "zh-Hant": "不少於", "zh-Hans": "不少于" } },
    { optionId: "less_than", label: { en: "Less than", "zh-Hant": "小於", "zh-Hans": "小于" } },
    { optionId: "at_most", label: { en: "At most", "zh-Hant": "不多於", "zh-Hans": "不多于" } },
  ];
  if (/(?:^|_)channel$/.test(decision)) return [
    { optionId: "in_app", label: { en: "In the app", "zh-Hant": "應用程式內", "zh-Hans": "应用内" } },
    { optionId: "email", label: { en: "By email", "zh-Hant": "電郵", "zh-Hans": "电子邮件" } },
  ];
  if (decision === "after_rejection") return [
    { optionId: "return_for_correction", label: { en: "Send it back for correction", "zh-Hant": "退回更正", "zh-Hans": "退回更正" } },
    { optionId: "close", label: { en: "Close the request", "zh-Hant": "結束申請", "zh-Hans": "结束申请" } },
  ];
  if (decision === "who_can_start") return [
    { optionId: "any_employee", label: { en: "Any employee", "zh-Hant": "任何員工", "zh-Hans": "任何员工" } },
    { optionId: "selected_roles", label: { en: "Selected roles", "zh-Hant": "指定職位", "zh-Hans": "指定职位" } },
  ];
  return yesNoOptions;
}

function localizedText([en, hant, hans]: readonly [string, string, string]) {
  return { en, "zh-Hant": hant, "zh-Hans": hans };
}

function personResolverPromptVariants(selectorDecisionId: string) {
  return {
    selectorDecisionId,
    variants: {
      fixed_email: localizedText([
        "What fixed email address should receive this step?",
        "此步驟應交給哪個指定電郵地址？",
        "此步骤应交给哪个指定电子邮件地址？",
      ]),
      directory_role: localizedText([
        "Which job role in the staff directory should receive this step?",
        "此步驟應交給員工目錄中的哪個職位？",
        "此步骤应交给员工目录中的哪个职位？",
      ]),
      request_field: localizedText([
        "Which request field will contain this person's email address?",
        "哪個申請欄位會填寫此人的電郵地址？",
        "哪个申请字段会填写此人的电子邮件地址？",
      ]),
    },
  };
}

/** Helpful plain-language guidance is pinned beside each question.  It is not
 * generated by the model or assembled by the controller, so review can see
 * precisely what every employee will be shown. */
function helpForSeed(seed: QuestionSeed) {
  const simple = (en: string, hant: string, hans: string) => ({ conceptRef: `copilot.${seed.factId}`, body: localizedText([en, hant, hans]) });
  const decision = seed.decision;
  if (decision === "name") return simple("Use a short name people will recognise, such as ‘Supplier payment request’.", "請用同事一看便明白的簡短名稱，例如「供應商付款申請」。", "请用同事一看就明白的简短名称，例如“供应商付款申请”。");
  if (decision === "purpose") return simple("Describe the business job, not the software. For example: approve supplier payments before Finance pays them.", "請描述業務工作，而不是軟件功能。例如：財務付款前先審批供應商付款。", "请描述业务工作，而不是软件功能。例如：财务付款前先审批供应商付款。");
  if (decision === "included") return simple("Say which requests belong here. Name a familiar request type so people know when to use this workflow.", "請說明哪些申請屬於此流程。列出熟悉的申請種類，讓同事知道何時使用。", "请说明哪些申请属于此流程。列出熟悉的申请种类，让同事知道何时使用。");
  if (decision === "excluded") return simple("List similar requests that should use another process. This prevents people from choosing the wrong workflow.", "列出看似相近但應使用其他流程的申請，避免同事選錯流程。", "列出看似相近但应使用其他流程的申请，避免同事选错流程。");
  if (decision === "who_can_start") return simple("Choose whether every employee may submit this request, or only people in named job roles.", "請選擇所有員工都可提交，還是只有指定職位的同事可提交。", "请选择所有员工都可提交，还是只有指定职位的同事可提交。");
  if (decision === "initiator_roles") return simple("List the job roles that may start a request, for example ‘Procurement Manager’ or ‘Finance Officer’.", "列出可發起申請的職位，例如「採購經理」或「財務主任」。", "列出可发起申请的职位，例如“采购经理”或“财务专员”。");
  if (decision === "first_required_field") return simple("Choose one item every requester must fill in. Start with the detail that helps reviewers make a decision, such as amount or supplier name.", "選擇每位申請人都必須填寫的一項資料。先填有助審批人決定的資料，例如金額或供應商名稱。", "选择每位申请人都必须填写的一项资料。先填有助审批人决定的资料，例如金额或供应商名称。");
  if (decision.startsWith("field_")) return simple("Add one more request detail only when it is needed to review or process the request. Keep the wording clear for the requester.", "只有在審批或處理申請時需要，才加入另一項資料。請用申請人容易明白的名稱。", "只有在审批或处理申请时需要，才加入另一项资料。请用申请人容易明白的名称。");
  if (decision.startsWith("add_another_") && seed.factId === "request.fields") return simple("Choose Yes only if you need one more different item from the requester. Choose No when the request form has enough information.", "只有仍需要申請人提供另一項不同資料時才選「是」。表格資料足夠時請選「否」。", "只有仍需要申请人提供另一项不同资料时才选“是”。表格资料足够时请选择“否”。");
  if (decision === "needed" && seed.factId === "attachments.requirements") return simple("Choose Yes when a file is needed for every request. For example, a quotation, invoice, or signed form.", "若每份申請都需要檔案，請選「是」，例如報價單、發票或已簽署表格。", "若每份申请都需要文件，请选“是”，例如报价单、发票或已签署表格。");
  if (decision === "first_file") return simple("Name one file that every requester must attach. Be specific, for example ‘supplier quotation’ rather than ‘supporting document’.", "請列出每位申請人都必須附上的一份檔案。請具體，例如「供應商報價單」，不要只寫「證明文件」。", "请列出每位申请人都必须附上的一份文件。请具体，例如“供应商报价单”，不要只写“证明文件”。");
  if (decision.startsWith("file_")) return simple("Add another required file only if reviewers truly need it. Give the file a clear everyday name.", "只有審批人確實需要時才加入另一份必交檔案，並使用清楚易懂的檔案名稱。", "只有审批人确实需要时才加入另一份必交文件，并使用清楚易懂的文件名称。");
  if (decision.startsWith("add_another_") && seed.factId === "attachments.requirements") return simple("Choose Yes only if another different file is required from every requester. Choose No when the file list is complete.", "只有每位申請人仍必須交另一份不同檔案時才選「是」。檔案清單完整時請選「否」。", "只有每位申请人仍必须交另一份不同文件时才选“是”。文件清单完整时请选择“否”。");
  if (decision === "first_stage" || /^stage_\d+_name$/.test(decision)) return simple("Describe one action in order, such as ‘Manager checks the request’ or ‘Finance approves payment’. Do not combine several actions in one step.", "按次序描述一項工作，例如「經理檢查申請」或「財務批准付款」。不要把多項工作合併成一步。", "按顺序描述一项工作，例如“经理检查申请”或“财务批准付款”。不要把多项工作合并成一步。");
  if (decision.endsWith("person_mode")) return simple("Choose how this step finds its person: the same email every time, a job role in the staff directory, an email entered on the request, or a person chosen later.", "選擇此步驟如何找到處理人：每次使用同一電郵、員工目錄中的職位、申請內填寫的電郵，或稍後才指派人選。", "选择此步骤如何找到处理人：每次使用同一电子邮件、员工目录中的职位、申请内填写的电子邮件，或稍后才指派人选。");
  if (decision.endsWith("person_detail")) return simple("Give the one detail needed for the option you just chose. If a person will be chosen later, this question will not appear.", "請提供剛才所選方式所需的一項資料。若選擇稍後指派人選，便不會看到此問題。", "请提供刚才所选方式所需的一项资料。若选择稍后指派人选，便不会看到此问题。");
  if (decision.startsWith("stage_") && decision.includes("add_another")) return simple("Choose Yes only if the request needs another separate action after this one. Choose No when the sequence is complete.", "只有此步驟後仍需要另一項獨立工作才選「是」。次序完整時請選「否」。", "只有此步骤后仍需要另一项独立工作才选“是”。顺序完整时请选择“否”。");
  if (decision === "stage_2_needed" || decision.startsWith("add_another_")) {
    if (seed.factId === "workflow.stages") return simple("Choose Yes only if the request needs another separate action after this one. Choose No when the sequence is complete.", "只有此步驟後仍需要另一項獨立工作才選「是」。次序完整時請選「否」。", "只有此步骤后仍需要另一项独立工作才选“是”。顺序完整时请选择“否”。");
  }
  if (decision === "needed" && seed.factId === "workflow.conditions") return simple("Choose Yes only when some requests should follow a different path. For example, requests above HK$10,000 may also go to Finance.", "只有部分申請需要走不同處理方式時才選「是」。例如超過 HK$10,000 的申請也交財務部處理。", "只有部分申请需要走不同处理方式时才选“是”。例如超过 HK$10,000 的申请也交财务部处理。");
  if ((decision.endsWith("_field") || decision === "field") && seed.factId === "workflow.conditions") return simple("Name the request detail that decides which path to use, such as amount, country, or purchase type.", "請列出決定使用哪種處理方式的申請資料，例如金額、國家或採購類別。", "请列出决定使用哪种处理方式的申请资料，例如金额、国家或采购类别。");
  if (decision.endsWith("comparison") && seed.factId === "workflow.conditions") return simple("Choose the simple check to make. For example, ‘at least’ lets an amount of HK$10,000 or more use the different path.", "選擇簡單的檢查方法。例如選「不少於」，金額為 HK$10,000 或以上便使用不同處理方式。", "选择简单的检查方法。例如选“不少于”，金额为 HK$10,000 或以上便使用不同处理方式。");
  if ((decision.endsWith("_value") || decision === "value") && seed.factId === "workflow.conditions") return simple("Enter the value used by the check, such as ‘10000’ for an amount or ‘Hong Kong’ for a location.", "填寫檢查時使用的數值，例如金額填「10000」，地點填「香港」。", "填写检查时使用的数值，例如金额填“10000”，地点填“香港”。");
  if ((decision.endsWith("matching") || decision === "matching_action") && seed.factId === "workflow.conditions") return simple("Say what should happen when the request meets this check, for example ‘send it to Finance before the manager’.", "說明申請符合此檢查時應如何處理，例如「先交財務部，再交經理」。", "说明申请符合此检查时应如何处理，例如“先交财务部，再交经理”。");
  if ((decision.endsWith("otherwise") || decision === "other_action") && seed.factId === "workflow.conditions") return simple("Say what should happen when the request does not meet the check. This is the normal path for the other requests.", "說明申請不符合此檢查時應如何處理，這是其他申請的正常處理方式。", "说明申请不符合此检查时应如何处理，这是其他申请的正常处理方式。");
  if (decision.startsWith("add_another_") && seed.factId === "workflow.conditions") return simple("Choose Yes only if there is another different rule that sends requests along another path. Keep each rule simple.", "只有另有一項不同規則會令申請走另一種處理方式時才選「是」。每項規則請保持簡單。", "只有另有一项不同规则会令申请走另一种处理方式时才选“是”。每项规则请保持简单。");
  if (decision === "after_rejection") return simple("Choose whether the requester can fix the request and send it again, or whether the request should end after it is not approved.", "選擇申請人可否更正後再次提交，或在不獲批准後便結束申請。", "选择申请人可否更正后再次提交，或在不获批准后便结束申请。");
  if (decision === "another_person_upload") return simple("Choose Yes if a colleague may add a quotation or comparison file for the requester. This is useful when documents come from another team.", "若同事可代申請人補交報價單或比較檔案，請選「是」。文件由另一團隊提供時會很有用。", "若同事可代申请人补交报价单或比较文件，请选“是”。文件由另一团队提供时会很有用。");
  if (decision === "corrected_file_check") return simple("Choose Yes if someone should check a replacement file before the request continues. For example, check that a revised quotation is the correct one.", "若更正檔案在申請繼續前需要由人檢查，請選「是」。例如確認更新的報價單是否正確。", "若更正文件在申请继续前需要由人检查，请选“是”。例如确认更新的报价单是否正确。");
  if (decision === "correction_checker") return simple("Name the person or job role that checks replacement files, for example ‘Procurement Manager’.", "列出檢查更正檔案的人或職位，例如「採購經理」。", "列出检查更正文件的人或职位，例如“采购经理”。");
  if (decision === "due_time") return simple("State how much time each person gets to reply, such as ‘2 working days’ or ‘48 hours’.", "說明每位處理人有多少時間回覆，例如「2 個工作天」或「48 小時」。", "说明每位处理人有多少时间回复，例如“2 个工作日”或“48 小时”。");
  if (decision === "reminder_time") return simple("Say when to send a reminder if there is no reply, for example ‘after 24 hours’ or ‘one day before the due time’.", "說明未有回覆時何時發出提醒，例如「24 小時後」或「截止前一天」。", "说明未有回复时何时发出提醒，例如“24 小时后”或“截止前一天”。");
  if (decision === "overdue_action") return simple("Say what happens after the reply time has passed, for example remind the person again, ask their manager, or assign it to a backup person.", "說明回覆期限過後如何處理，例如再次提醒、通知其經理，或交給備用處理人。", "说明回复期限过后如何处理，例如再次提醒、通知其经理，或交给备用处理人。");
  if (decision === "who_can_view") return simple("List who may see the request and its progress. For example: requester, current reviewer, Finance, and the workflow owner.", "列出可查看申請及進度的人，例如申請人、目前處理人、財務部及流程負責部門。", "列出可查看申请及进度的人，例如申请人、目前处理人、财务部及流程负责部门。");
  if (decision === "needed" && seed.factId === "notifications.rules") return simple("Choose Yes if the system should tell people about important changes, such as a new task, approval, or a request returned for changes.", "若系統應在重要變更時通知相關人士，請選「是」，例如新工作、獲批或退回更正。", "若系统应在重要变更时通知相关人员，请选“是”，例如新工作、获批或退回更正。");
  if (decision.endsWith("_event") || decision === "event") return simple("Name one event that should send a message, for example ‘a new reviewer is assigned’ or ‘the request is approved’.", "列出一個應發出通知的事件，例如「指派了新的處理人」或「申請已獲批」。", "列出一个应发送通知的事件，例如“指派了新的处理人”或“申请已获批”。");
  if (decision.endsWith("_recipient") || decision === "recipient") return simple("Name who should receive this message. For example, the requester only, the current reviewer, or Finance.", "列出誰應收到這則通知，例如只通知申請人、目前處理人或財務部。", "列出谁应收到这则通知，例如只通知申请人、目前处理人或财务部。");
  if (decision.endsWith("_channel") || decision === "channel") return simple("Choose where this message should arrive: inside this app, by email, or both if your policy needs both.", "選擇通知應送到哪裡：此應用程式內、電郵，或按公司規定兩者都使用。", "选择通知应送到哪里：此应用内、电子邮件，或按公司规定两者都使用。");
  if (decision.startsWith("add_another_") && seed.factId === "notifications.rules") return simple("Choose Yes only if another event needs its own message. Choose No when people will receive all the messages they need.", "只有另一個事件需要獨立通知時才選「是」。相關人士已會收到所需通知時請選「否」。", "只有另一个事件需要独立通知时才选“是”。相关人员已会收到所需通知时请选择“否”。");
  if (decision === "owning_department") return simple("Name the business department that owns this workflow and decides when it needs to change, for example Finance or Procurement.", "列出負責此流程及決定何時修改的業務部門，例如財務部或採購部。", "列出负责此流程及决定何时修改的业务部门，例如财务部或采购部。");
  if (decision === "reviewer") return simple("Name the person, job role, or group that checks proposed changes before they are used.", "列出在流程更改使用前負責檢查的人、職位或小組。", "列出在流程更改使用前负责检查的人、职位或小组。");
  if (decision === "policy_name") return simple("Name any company rule this workflow must follow, such as a purchasing policy, spending limit, or data handling rule.", "列出此流程必須遵從的公司規則，例如採購政策、開支限額或資料處理規則。", "列出此流程必须遵从的公司规则，例如采购政策、开支限额或资料处理规则。");
  if (decision === "retention") return simple("State how long request records and attached files should be kept, for example ‘7 years’.", "說明申請記錄及附件應保留多久，例如「7 年」。", "说明申请记录及附件应保留多久，例如“7 年”。");
  return simple("Give a clear, practical answer for this one part of the workflow. You can choose Not sure and return to it later.", "請為流程的這一部分提供清楚實際的答案。你可選擇「未能確定」並稍後再回答。", "请为流程的这一部分提供清楚实际的答案。你可以选择“暂不确定”并稍后再回答。");
}

// Each entry is one small decision.  The full, reviewable fact is assembled
// only from its individual answers; an answer is never treated as a complete
// workflow fact just because it arrived first.
const defaultQuestionSeeds: readonly QuestionSeed[] = [
  { factId: "workflow.name", decision: "name", priority: 10, type: "short_text", prompt: ["What should we call this approval workflow?", "這個審批流程應叫甚麼名稱？", "这个审批流程应叫什么名称？"] },
  { factId: "workflow.purpose", decision: "purpose", priority: 20, type: "long_text", prompt: ["What job should this workflow help people complete?", "此流程要協助完成甚麼工作？", "此流程要协助完成什么工作？"] },
  { factId: "workflow.scope", decision: "included", priority: 30, type: "long_text", prompt: ["What requests belong in this workflow?", "哪些申請應使用此流程？", "哪些申请应使用此流程？"], example: ["Supplier invoice requests.", "供應商發票申請。", "供应商发票申请。"] },
  { factId: "workflow.scope", decision: "excluded", priority: 40, type: "long_text", notApplicable: true, prompt: ["What requests should not use this workflow?", "哪些申請不應使用此流程？", "哪些申请不应使用此流程？"], example: ["Staff expense claims.", "員工報銷申請。", "员工报销申请。"] },
  { factId: "request.initiator_policy", decision: "who_can_start", priority: 50, type: "choice", prompt: ["Who may start a request?", "誰可以發起申請？", "谁可以发起申请？"] },
  { factId: "request.initiator_policy", decision: "initiator_roles", priority: 55, type: "short_text", prerequisiteDecisions: ["decision.request.initiator_policy.who_can_start"], applicability: { kind: "decision_equals", decisionId: "decision.request.initiator_policy.who_can_start", values: ["selected_roles"] }, prompt: ["Which job roles may start a request?", "哪些職位可以發起申請？", "哪些职位可以发起申请？"], example: ["Procurement Manager and Finance Officer.", "採購經理及財務主任。", "采购经理和财务专员。"] },
  { factId: "request.fields", decision: "first_required_field", priority: 60, type: "short_text", prompt: ["What is one piece of information every request must include?", "每個申請必須提供的一項資料是甚麼？", "每个申请必须提供的一项资料是什么？"], example: ["Invoice amount.", "發票金額。", "发票金额。"] },
  { factId: "attachments.requirements", decision: "needed", priority: 70, type: "choice", prompt: ["Does every request need a file attached?", "每個申請是否都需要附加檔案？", "每个申请是否都需要附加文件？"] },
  { factId: "attachments.requirements", decision: "first_file", priority: 80, type: "short_text", prerequisiteDecisions: ["decision.attachments.requirements.needed"], applicability: { kind: "decision_equals", decisionId: "decision.attachments.requirements.needed", values: ["yes"] }, prompt: ["What is one file the requester must attach?", "申請人必須附上的其中一份檔案是甚麼？", "申请人必须附上的其中一份文件是什么？"], example: ["Supplier quotation.", "供應商報價單。", "供应商报价单。"] },
  { factId: "workflow.stages", decision: "first_stage", priority: 90, type: "short_text", prompt: ["What is the first step after a request is sent?", "申請送出後的第一步是甚麼？", "申请送出后的第一步是什么？"], example: ["A manager checks the request.", "經理檢查申請。", "经理检查申请。"] },
  { factId: "workflow.stages", decision: "first_stage_person_mode", priority: 100, type: "choice", prerequisiteDecisions: ["decision.workflow.stages.first_stage"], prompt: ["How should we choose the person for that first step?", "第一步的處理人應如何決定？", "第一步的处理人应如何决定？"] },
  { factId: "workflow.stages", decision: "first_stage_person_detail", priority: 110, type: "short_text", prerequisiteDecisions: ["decision.workflow.stages.first_stage_person_mode"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.stages.first_stage_person_mode", values: ["fixed_email", "directory_role", "request_field"] }, prompt: ["Please give the email address, job role, or request field for that person.", "請提供該人士的電郵地址、職位或申請欄位。", "请提供该人员的电子邮件地址、职位或申请字段。"] },
  // Repeating collections are bounded and use explicit stable instance IDs;
  // an answer can never create an unbounded, caller-named collection item.
  { factId: "workflow.stages", decision: "stage_2_needed", priority: 115, type: "choice", prerequisiteDecisions: ["decision.workflow.stages.first_stage_person_mode"], prompt: ["Do you need one more step after the first one?", "第一步之後是否還需要另一個步驟？", "第一步之后是否还需要另一个步骤？"] },
  { factId: "workflow.stages", decision: "stage_2_name", priority: 116, type: "short_text", prerequisiteDecisions: ["decision.workflow.stages.stage_2_needed"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.stages.stage_2_needed", values: ["yes"] }, prompt: ["What is that next step?", "下一個步驟是甚麼？", "下一个步骤是什么？"] },
  { factId: "workflow.stages", decision: "stage_2_person_mode", priority: 117, type: "choice", prerequisiteDecisions: ["decision.workflow.stages.stage_2_name"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.stages.stage_2_needed", values: ["yes"] }, prompt: ["How should we choose the person for that next step?", "下一步的處理人應如何決定？", "下一步的处理人应如何决定？"] },
  { factId: "workflow.stages", decision: "stage_2_person_detail", priority: 118, type: "short_text", prerequisiteDecisions: ["decision.workflow.stages.stage_2_person_mode"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.stages.stage_2_person_mode", values: ["fixed_email", "directory_role", "request_field"] }, prompt: ["Please give the email address, job role, or request field for that person.", "請提供該人士的電郵地址、職位或申請欄位。", "请提供该人员的电子邮件地址、职位或申请字段。"] },
  { factId: "workflow.stages", decision: "add_another_02", priority: 119, type: "choice", prerequisiteDecisions: ["decision.workflow.stages.stage_2_person_mode"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.stages.stage_2_needed", values: ["yes"] }, prompt: ["Do you need another step?", "是否還需要另一個步驟？", "是否还需要另一个步骤？"] },
  { factId: "workflow.conditions", decision: "needed", priority: 120, type: "choice", prompt: ["Should the route change for some requests?", "某些申請是否需要改用不同處理方式？", "某些申请是否需要改用不同处理方式？"], example: ["Requests over HK$10,000 need Finance approval.", "超過 HK$10,000 的申請須財務部審批。", "超过 HK$10,000 的申请须财务部审批。"] },
  { factId: "workflow.conditions", decision: "field", priority: 130, type: "short_text", prerequisiteDecisions: ["decision.workflow.conditions.needed"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.conditions.needed", values: ["yes"] }, prompt: ["Which request detail decides the different route?", "哪一項申請資料決定使用不同處理方式？", "哪一项申请资料决定使用不同处理方式？"] },
  { factId: "workflow.conditions", decision: "comparison", priority: 140, type: "choice", prerequisiteDecisions: ["decision.workflow.conditions.field"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.conditions.needed", values: ["yes"] }, prompt: ["How should we compare that detail?", "應如何比較這項資料？", "应如何比较这项资料？"] },
  { factId: "workflow.conditions", decision: "value", priority: 150, type: "short_text", prerequisiteDecisions: ["decision.workflow.conditions.comparison"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.conditions.needed", values: ["yes"] }, prompt: ["What value should trigger the different route?", "甚麼數值會觸發不同處理方式？", "什么数值会触发不同处理方式？"] },
  { factId: "workflow.conditions", decision: "matching_action", priority: 160, type: "short_text", prerequisiteDecisions: ["decision.workflow.conditions.value"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.conditions.needed", values: ["yes"] }, prompt: ["What should happen when the request matches that value?", "申請符合該數值時應如何處理？", "申请符合该数值时应如何处理？"] },
  { factId: "workflow.conditions", decision: "other_action", priority: 170, type: "short_text", prerequisiteDecisions: ["decision.workflow.conditions.matching_action"], applicability: { kind: "decision_equals", decisionId: "decision.workflow.conditions.needed", values: ["yes"] }, prompt: ["What should happen when the request does not match?", "申請不符合時應如何處理？", "申请不符合时应如何处理？"] },
  { factId: "workflow.rejection_policy", decision: "after_rejection", priority: 180, type: "choice", prompt: ["What should happen if someone does not approve the request?", "如有人不批准申請，應如何處理？", "如有人不批准申请，应如何处理？"] },
  { factId: "collaboration.policy", decision: "another_person_upload", priority: 190, type: "choice", prompt: ["Can another person upload a quotation or comparison file for this request?", "其他人可否為此申請上載報價單或比較檔案？", "其他人能否为此申请上传报价单或比较文件？"] },
  { factId: "collaboration.policy", decision: "corrected_file_check", priority: 200, type: "choice", prompt: ["Before a corrected file is used, must someone check it?", "使用更正檔案前，是否必須由人檢查？", "使用更正文件前，是否必须由人检查？"] },
  { factId: "collaboration.policy", decision: "correction_checker", priority: 210, type: "short_text", prerequisiteDecisions: ["decision.collaboration.policy.corrected_file_check"], applicability: { kind: "decision_equals", decisionId: "decision.collaboration.policy.corrected_file_check", values: ["yes"] }, prompt: ["Who should check the corrected file?", "誰應檢查更正檔案？", "谁应检查更正文件？"] },
  { factId: "timing.rules", decision: "due_time", priority: 220, type: "short_text", prompt: ["How long should each person have to reply?", "每位處理人應有多久時間回覆？", "每位处理人应有多长时间回复？"], example: ["48 hours.", "48 小時。", "48 小时。"] },
  { factId: "timing.rules", decision: "reminder_time", priority: 230, type: "short_text", prompt: ["If there is no reply, when should the system send a reminder?", "如沒有回覆，系統應何時發出提醒？", "如没有回复，系统应何时发送提醒？"] },
  { factId: "timing.rules", decision: "overdue_action", priority: 240, type: "short_text", prompt: ["If there is still no reply, what should the system do next?", "如仍沒有回覆，系統下一步應如何處理？", "如仍没有回复，系统下一步应如何处理？"] },
  { factId: "visibility.policy", decision: "who_can_view", priority: 250, type: "short_text", prompt: ["Who should be able to see the request and its progress?", "誰應可查看申請及其進度？", "谁应可查看申请及其进度？"] },
  { factId: "notifications.rules", decision: "needed", priority: 260, type: "choice", prompt: ["Should the system send any messages about this request?", "系統是否需要發送有關此申請的通知？", "系统是否需要发送有关此申请的通知？"] },
  { factId: "notifications.rules", decision: "event", priority: 270, type: "short_text", prerequisiteDecisions: ["decision.notifications.rules.needed"], applicability: { kind: "decision_equals", decisionId: "decision.notifications.rules.needed", values: ["yes"] }, prompt: ["What event should send a message?", "哪個事件應發出通知？", "哪个事件应发送通知？"], example: ["A request is approved.", "申請獲批。", "申请获批。"] },
  { factId: "notifications.rules", decision: "recipient", priority: 280, type: "short_text", prerequisiteDecisions: ["decision.notifications.rules.event"], applicability: { kind: "decision_equals", decisionId: "decision.notifications.rules.needed", values: ["yes"] }, prompt: ["Who should receive that message?", "誰應收到該通知？", "谁应收到该通知？"] },
  { factId: "notifications.rules", decision: "channel", priority: 290, type: "choice", prerequisiteDecisions: ["decision.notifications.rules.recipient"], applicability: { kind: "decision_equals", decisionId: "decision.notifications.rules.needed", values: ["yes"] }, prompt: ["How should that message be sent?", "該通知應如何發送？", "该通知应如何发送？"], example: ["In the app or by email.", "在應用程式內或以電郵發送。", "在应用内或通过电子邮件发送。"] },
  { factId: "governance.owner", decision: "owning_department", priority: 300, type: "short_text", prompt: ["Which department is responsible for this workflow?", "哪個部門負責此流程？", "哪个部门负责此流程？"] },
  { factId: "governance.policies", decision: "reviewer", priority: 310, type: "short_text", prompt: ["Who should review changes to this workflow?", "誰應審核此流程的更改？", "谁应审核此流程的更改？"] },
  { factId: "governance.policies", decision: "policy_name", priority: 320, type: "short_text", prompt: ["Is there a policy or rule this workflow must follow?", "此流程是否必須遵從某項政策或規則？", "此流程是否必须遵从某项政策或规则？"] },
  { factId: "governance.retention", decision: "retention", priority: 330, type: "short_text", prompt: ["How long should the request records be kept?", "申請記錄應保留多久？", "申请记录应保留多久？"] },
];

function boundedCollectionSeeds(): QuestionSeed[] {
  const seeds: QuestionSeed[] = [];
  let priority = 400;
  const add = (factId: TemplateCopilotFactId, decision: string, type: QuestionSeed["type"], prerequisiteDecisions: string[], applicability: TemplateCopilotQuestion["applicability"], prompt: QuestionSeed["prompt"]) => seeds.push({ factId, decision, priority: priority++, type, prerequisiteDecisions, applicability, prompt });
  // Stable, server-authored instance IDs.  A collection advances only after
  // its explicit continue choice, and the final allowed item has no continue.
  for (let index = 1; index < 20; index += 1) {
    const number = String(index).padStart(2, "0");
    const next = String(index + 1).padStart(2, "0");
    const current = index === 1 ? "decision.request.fields.first_required_field" : `decision.request.fields.field_${number}`;
    add("request.fields", `add_another_${number}`, "choice", [current], { kind: "always" }, ["Do you need another request detail?", "是否還需要另一項申請資料？", "是否还需要另一项申请资料？"]);
    add("request.fields", `field_${next}`, "short_text", [`decision.request.fields.add_another_${number}`], { kind: "decision_equals", decisionId: `decision.request.fields.add_another_${number}`, values: ["yes"] }, ["What is another request detail to collect?", "還要收集哪一項申請資料？", "还要收集哪一项申请资料？"]);
  }
  for (let index = 1; index <= 20; index += 1) {
    const number = String(index).padStart(2, "0"); const previous = index === 1 ? "decision.attachments.requirements.first_file" : `decision.attachments.requirements.file_${String(index - 1).padStart(2, "0")}`;
    if (index > 1) add("attachments.requirements", `file_${number}`, "short_text", [`decision.attachments.requirements.add_another_${String(index - 1).padStart(2, "0")}`], { kind: "decision_equals", decisionId: `decision.attachments.requirements.add_another_${String(index - 1).padStart(2, "0")}`, values: ["yes"] }, ["What is another required file?", "另一份必須附上的檔案是甚麼？", "另一份必须附上的文件是什么？"]);
    const current = index === 1 ? previous : `decision.attachments.requirements.file_${number}`;
    if (index < 20) add("attachments.requirements", `add_another_${number}`, "choice", [current], { kind: "decision_equals", decisionId: "decision.attachments.requirements.needed", values: ["yes"] }, ["Do you need another required file?", "是否還需要另一份必須附上的檔案？", "是否还需要另一份必须附上的文件？"]);
  }
  for (let index = 3; index <= 20; index += 1) {
    const number = String(index).padStart(2, "0");
    add("workflow.stages", `stage_${number}_name`, "short_text", [`decision.workflow.stages.add_another_${String(index - 1).padStart(2, "0")}`], { kind: "decision_equals", decisionId: `decision.workflow.stages.add_another_${String(index - 1).padStart(2, "0")}`, values: ["yes"] }, ["What is the next step?", "下一個步驟是甚麼？", "下一个步骤是什么？"]);
    add("workflow.stages", `stage_${number}_person_mode`, "choice", [`decision.workflow.stages.stage_${number}_name`], { kind: "always" }, ["How should we choose the person for that step?", "該步驟的處理人應如何決定？", "该步骤的处理人应如何决定？"]);
    add("workflow.stages", `stage_${number}_person_detail`, "short_text", [`decision.workflow.stages.stage_${number}_person_mode`], { kind: "decision_equals", decisionId: `decision.workflow.stages.stage_${number}_person_mode`, values: ["fixed_email", "directory_role", "request_field"] }, ["Please give the email address, job role, or request field for that person.", "請提供該人士的電郵地址、職位或申請欄位。", "请提供该人员的电子邮件地址、职位或申请字段。"]);
    if (index < 20) add("workflow.stages", `add_another_${number}`, "choice", [`decision.workflow.stages.stage_${number}_person_mode`], { kind: "always" }, ["Do you need another step?", "是否還需要另一個步驟？", "是否还需要另一个步骤？"]);
  }
  for (let index = 2; index <= 10; index += 1) {
    const number = String(index).padStart(2, "0"); const prior = index === 2 ? "decision.workflow.conditions.other_action" : `decision.workflow.conditions.condition_${String(index - 1).padStart(2, "0")}_otherwise`;
    if (index === 2) add("workflow.conditions", "add_another_01", "choice", [prior], { kind: "decision_equals", decisionId: "decision.workflow.conditions.needed", values: ["yes"] }, ["Do you need another different route?", "是否需要另一個不同處理方式？", "是否需要另一个不同处理方式？"]);
    add("workflow.conditions", `condition_${number}_field`, "short_text", [`decision.workflow.conditions.add_another_${String(index - 1).padStart(2, "0")}`], { kind: "decision_equals", decisionId: `decision.workflow.conditions.add_another_${String(index - 1).padStart(2, "0")}`, values: ["yes"] }, ["Which request detail decides this route?", "哪一項申請資料決定此處理方式？", "哪一项申请资料决定此处理方式？"]);
    add("workflow.conditions", `condition_${number}_comparison`, "choice", [`decision.workflow.conditions.condition_${number}_field`], { kind: "always" }, ["How should we compare that detail?", "應如何比較這項資料？", "应如何比较这项资料？"]);
    add("workflow.conditions", `condition_${number}_value`, "short_text", [`decision.workflow.conditions.condition_${number}_comparison`], { kind: "always" }, ["What value should trigger this route?", "甚麼數值會觸發此處理方式？", "什么数值会触发此处理方式？"]);
    add("workflow.conditions", `condition_${number}_matching`, "short_text", [`decision.workflow.conditions.condition_${number}_value`], { kind: "always" }, ["What should happen when it matches?", "符合時應如何處理？", "符合时应如何处理？"]);
    add("workflow.conditions", `condition_${number}_otherwise`, "short_text", [`decision.workflow.conditions.condition_${number}_matching`], { kind: "always" }, ["What should happen when it does not match?", "不符合時應如何處理？", "不符合时应如何处理？"]);
    if (index < 10) add("workflow.conditions", `add_another_${number}`, "choice", [`decision.workflow.conditions.condition_${number}_otherwise`], { kind: "always" }, ["Do you need another different route?", "是否需要另一個不同處理方式？", "是否需要另一个不同处理方式？"]);
  }
  for (let index = 2; index <= 20; index += 1) {
    const number = String(index).padStart(2, "0"); const prior = index === 2 ? "decision.notifications.rules.channel" : `decision.notifications.rules.notification_${String(index - 1).padStart(2, "0")}_channel`;
    if (index === 2) add("notifications.rules", "add_another_01", "choice", [prior], { kind: "decision_equals", decisionId: "decision.notifications.rules.needed", values: ["yes"] }, ["Do you need another message?", "是否需要另一則通知？", "是否需要另一则通知？"]);
    add("notifications.rules", `notification_${number}_event`, "short_text", [`decision.notifications.rules.add_another_${String(index - 1).padStart(2, "0")}`], { kind: "decision_equals", decisionId: `decision.notifications.rules.add_another_${String(index - 1).padStart(2, "0")}`, values: ["yes"] }, ["What event should send this message?", "哪個事件應發出此通知？", "哪个事件应发送此通知？"]);
    add("notifications.rules", `notification_${number}_recipient`, "short_text", [`decision.notifications.rules.notification_${number}_event`], { kind: "always" }, ["Who should receive this message?", "誰應收到此通知？", "谁应收到此通知？"]);
    add("notifications.rules", `notification_${number}_channel`, "choice", [`decision.notifications.rules.notification_${number}_recipient`], { kind: "always" }, ["How should this message be sent?", "此通知應如何發送？", "此通知应如何发送？"]);
    if (index < 20) add("notifications.rules", `add_another_${number}`, "choice", [`decision.notifications.rules.notification_${number}_channel`], { kind: "always" }, ["Do you need another message?", "是否需要另一則通知？", "是否需要另一则通知？"]);
  }
  return seeds;
}

const v2QuestionLibrary = freezeQuestionLibrary(validateTemplateCopilotQuestionLibrary({
  version: "v2.0",
  questions: [...defaultQuestionSeeds, ...boundedCollectionSeeds()].map((seed) => ({
    questionId: `v2.${seed.factId}.${seed.decision}`,
    targetFactId: seed.factId,
    primaryDecision: { decisionId: `decision.${seed.factId}.${seed.decision}`, factId: seed.factId },
    prerequisiteDecisionIds: [...(seed.prerequisiteDecisions || [])],
    applicability: seed.applicability || { kind: "always" },
    answer: { type: seed.type, schemaRef: `v2.fact.${seed.factId}.v1`, validation: "server_fact_transition" as const, ...(seed.type === "choice" ? { options: choiceOptionsFor(seed.decision) } : {}) },
    help: helpForSeed(seed),
    // N/A needs an explicit, question-specific policy and a dedicated command;
    // no current v2.0 question exposes it until that command is available.
    uncertainty: { notSure: true, notApplicable: seed.notApplicable ? "when_optional" : "never" },
    priority: seed.priority,
    prompt: { en: seed.prompt[0], "zh-Hant": seed.prompt[1], "zh-Hans": seed.prompt[2] },
    ...(seed.decision.endsWith("person_detail") ? { personResolverPromptVariants: personResolverPromptVariants((seed.prerequisiteDecisions || []).find((decisionId) => decisionId.endsWith("person_mode")) || "") } : {}),
    ...(seed.example ? { example: { en: seed.example[0], "zh-Hant": seed.example[1], "zh-Hans": seed.example[2] } } : {}),
  })),
}));

// Step 4 changes interaction affordances, not question semantics. Existing
// v2.0 sessions remain pinned to their original library and therefore retain
// their old controls during a rollback; Step 4 sessions explicitly pinned v2.1.
const v21QuestionLibrary = freezeQuestionLibrary(validateTemplateCopilotQuestionLibrary({
  version: "v2.1",
  questions: v2QuestionLibrary.questions,
}));

export function templateCopilotQuestionContentFingerprint(questions: readonly TemplateCopilotQuestion[]) {
  return templateCopilotReviewedContentFingerprint(questions.map((question) => ({
    questionId: question.questionId,
    targetFactId: question.targetFactId,
    prompt: question.prompt,
    personResolverPromptVariants: question.personResolverPromptVariants?.variants,
    example: question.example,
    help: question.help.body,
    options: question.answer.options?.map((option) => ({ optionId: option.optionId, label: option.label })),
  })));
}

function v22Localized(en: string, zhHant: string, zhHans: string) {
  return { en, "zh-Hant": zhHant, "zh-Hans": zhHans };
}

function v22Presentation(question: TemplateCopilotQuestion): TemplateCopilotQuestion {
  const next = structuredClone(question);
  const decisionId = next.primaryDecision.decisionId;

  for (const option of next.answer.options || []) {
    if (option.optionId === "directory_role") {
      option.label = v22Localized(
        "A job role from the staff directory",
        "員工目錄中的職位",
        "员工目录中的职位",
      );
    }
  }

  if (decisionId === "decision.workflow.stages.first_stage") {
    next.prompt = v22Localized(
      next.prompt.en,
      "申請提交後的第一步是甚麼？",
      "申请提交后的第一步是什么？",
    );
  } else if (decisionId === "decision.workflow.conditions.needed") {
    next.prompt = v22Localized(
      "Should some requests use different approval steps?",
      "某些申請是否需要使用不同的審批步驟？",
      "某些申请是否需要使用不同的审批步骤？",
    );
  } else if (decisionId === "decision.workflow.conditions.field") {
    next.prompt = v22Localized(
      "Which request detail decides which approval steps to use?",
      "哪一項申請資料決定應使用哪些審批步驟？",
      "哪一项申请信息决定应使用哪些审批步骤？",
    );
  } else if (decisionId === "decision.workflow.conditions.value") {
    next.prompt = v22Localized(
      "What value should make the request use those different approval steps?",
      "甚麼數值會令申請使用那些不同的審批步驟？",
      "什么数值会让申请使用那些不同的审批步骤？",
    );
  } else if (/^decision\.workflow\.conditions\.add_another_\d{2}$/.test(decisionId)) {
    next.prompt = v22Localized(
      "Do you need another rule for different approval steps?",
      "是否需要另一項規則來決定不同的審批步驟？",
      "是否需要另一项规则来决定不同的审批步骤？",
    );
  } else if (/^decision\.workflow\.conditions\.condition_\d{2}_field$/.test(decisionId)) {
    next.prompt = v22Localized(
      "Which request detail should this rule check?",
      "這項規則應檢查哪一項申請資料？",
      "这项规则应检查哪一项申请信息？",
    );
  } else if (/^decision\.workflow\.conditions\.condition_\d{2}_value$/.test(decisionId)) {
    next.prompt = v22Localized(
      "What value should make this rule apply?",
      "甚麼數值會令這項規則適用？",
      "什么数值会让这项规则适用？",
    );
  }

  if (next.targetFactId === "attachments.requirements") {
    if (decisionId === "decision.attachments.requirements.needed") {
      next.prompt = v22Localized(
        "Does every request need a file or an in-app form?",
        "每個申請是否都需要檔案或應用程式內表格？",
        "每个申请是否都需要文件或应用内表单？",
      );
    } else if (decisionId === "decision.attachments.requirements.first_file") {
      next.prompt = v22Localized(
        "What is one file or in-app form the requester must provide?",
        "申請人必須提供的其中一份檔案或應用程式內表格是甚麼？",
        "申请人必须提供的其中一份文件或应用内表单是什么？",
      );
    } else if (/\.file_\d{2}$/.test(decisionId)) {
      next.prompt = v22Localized(
        "What is another required file or in-app form?",
        "另一份必須提供的檔案或應用程式內表格是甚麼？",
        "另一份必须提供的文件或应用内表单是什么？",
      );
    } else if (/\.add_another_\d{2}$/.test(decisionId)) {
      next.prompt = v22Localized(
        "Do you need another required file or in-app form?",
        "是否還需要另一份必須提供的檔案或應用程式內表格？",
        "是否还需要另一份必须提供的文件或应用内表单？",
      );
    }
  }

  if (decisionId === "decision.timing.rules.overdue_action") {
    next.help.body = v22Localized(
      next.help.body.en,
      "說明回覆期限過後如何處理，例如再次提醒、通知其經理，或交給後備處理人。",
      "说明回复期限过后如何处理，例如再次提醒、通知其经理，或交给后备处理人。",
    );
  }
  return next;
}

const v22Questions = v2QuestionLibrary.questions.map(v22Presentation);

// Step 8 is a review candidate. It pins exact content and the concept/help
// version, but remains unavailable for new sessions until accountable human
// reviewers approve every locale and the separate rollout gate enables it.
const v22QuestionLibrary = freezeQuestionLibrary(validateTemplateCopilotQuestionLibrary({
  version: "v2.2",
  conceptLibraryVersion: "concepts.v1.0",
  contentReview: {
    ...templateCopilotV2Step8QuestionContentReview,
  },
  questions: v22Questions,
}));

const libraryByVersion: Readonly<Record<string, TemplateCopilotQuestionLibrary>> = Object.freeze({
  "v2.0": v2QuestionLibrary,
  "v2.1": v21QuestionLibrary,
  "v2.2": v22QuestionLibrary,
});

export function getTemplateCopilotQuestionLibrary(version: string): TemplateCopilotQuestionLibrary {
  const library = libraryByVersion[version];
  if (!library) throw new TemplateCopilotQuestionLibraryError(`No pinned Copilot question library exists for version ${version}.`);
  return library;
}

export function validateTemplateCopilotQuestionLibrary(input: unknown): TemplateCopilotQuestionLibrary {
  const parsed = templateCopilotQuestionLibrarySchema.safeParse(input);
  if (!parsed.success) throw new TemplateCopilotQuestionLibraryError("The Copilot question library has an invalid shape.");
  const questions = parsed.data.questions;
  const expectedConceptLibraryVersion = templateCopilotConceptLibraryVersionForQuestionLibrary(parsed.data.version);
  if (parsed.data.conceptLibraryVersion !== expectedConceptLibraryVersion && (parsed.data.conceptLibraryVersion || expectedConceptLibraryVersion)) {
    throw new TemplateCopilotQuestionLibraryError(`Question library ${parsed.data.version} does not pin its required concept library.`);
  }
  const knownConceptIds = expectedConceptLibraryVersion
    ? new Set(getTemplateCopilotConceptLibrary(expectedConceptLibraryVersion).entries.map((entry) => entry.conceptId))
    : null;
  if (expectedConceptLibraryVersion) {
    const review = parsed.data.contentReview;
    if (!review
      || review.questionCount !== questions.length
      || review.contentFingerprint !== templateCopilotQuestionContentFingerprint(questions)) {
      throw new TemplateCopilotQuestionLibraryError(`Question library ${parsed.data.version} is not bound to its exact localized content.`);
    }
    for (const [locale, localeReview] of Object.entries(review.locales)) {
      if (localeReview.status === "approved"
        && (!localeReview.reviewedAt
          || !localeReview.evidenceRef
          || /\b(?:ai|model|system|automated|pending|unassigned)\b/iu.test(localeReview.reviewer))) {
        throw new TemplateCopilotQuestionLibraryError(`Question library ${parsed.data.version} has invalid human-review evidence for ${locale}.`);
      }
    }
  } else if (parsed.data.contentReview) {
    throw new TemplateCopilotQuestionLibraryError(`Legacy question library ${parsed.data.version} cannot claim the Step 8 content review.`);
  }
  const seenQuestionIds = new Set<string>();
  const seenDecisionIds = new Set<string>();
  const seenPriorities = new Set<number>();
  const questionsByDecision = new Map<string, TemplateCopilotQuestion>();
  for (const question of questions) {
    if (seenQuestionIds.has(question.questionId)) throw new TemplateCopilotQuestionLibraryError(`Duplicate question ID: ${question.questionId}.`);
    if (seenDecisionIds.has(question.primaryDecision.decisionId)) throw new TemplateCopilotQuestionLibraryError(`Duplicate decision ID: ${question.primaryDecision.decisionId}.`);
    if (seenPriorities.has(question.priority)) throw new TemplateCopilotQuestionLibraryError(`Duplicate question priority: ${question.priority}.`);
    if (question.primaryDecision.factId !== question.targetFactId) throw new TemplateCopilotQuestionLibraryError(`Primary decision for ${question.questionId} must target its one declared fact.`);
    if (question.answer.schemaRef !== `v2.fact.${question.targetFactId}.v1`) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} has a schema reference that does not match its target fact.`);
    if (question.help.conceptRef !== `copilot.${question.targetFactId}` || (knownConceptIds && !knownConceptIds.has(question.help.conceptRef))) {
      throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} has an unknown help reference.`);
    }
    const options = question.answer.options;
    if (question.answer.type === "choice" && (!options || options.length === 0)) throw new TemplateCopilotQuestionLibraryError(`Choice question ${question.questionId} must declare options.`);
    if (question.answer.type !== "choice" && options) throw new TemplateCopilotQuestionLibraryError(`Non-choice question ${question.questionId} cannot declare options.`);
    if (options && new Set(options.map((option) => option.optionId)).size !== options.length) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} has duplicate option IDs.`);
    seenQuestionIds.add(question.questionId);
    seenDecisionIds.add(question.primaryDecision.decisionId);
    seenPriorities.add(question.priority);
    questionsByDecision.set(question.primaryDecision.decisionId, question);
  }
  for (const factId of templateCopilotFactIds) {
    const coverage = questions.filter((question) => question.targetFactId === factId);
    if (coverage.length === 0) throw new TemplateCopilotQuestionLibraryError(`Required fact ${factId} has no questions.`);
    if (!coverage.some((question) => question.applicability.kind === "always" && question.prerequisiteDecisionIds.length === 0)) throw new TemplateCopilotQuestionLibraryError(`Required fact ${factId} has no always-applicable root question.`);
  }
  for (const question of questions) {
    for (const prerequisite of question.prerequisiteDecisionIds) {
      if (!seenDecisionIds.has(prerequisite)) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} has an unknown prerequisite decision.`);
      if (prerequisite === question.primaryDecision.decisionId) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} cannot depend on itself.`);
    }
    if (question.applicability.kind !== "always") {
      if (!seenDecisionIds.has(question.applicability.decisionId)) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} has an unknown applicability decision.`);
      if (question.applicability.decisionId === question.primaryDecision.decisionId) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} cannot decide its own applicability.`);
      const source = questionsByDecision.get(question.applicability.decisionId);
      if (source?.answer.type !== "choice" || !source.answer.options) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} must use a choice decision for applicability.`);
      const validOptionIds = new Set(source.answer.options.map((option) => option.optionId));
      for (const value of question.applicability.values) {
        if (!validOptionIds.has(value)) throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} has an invalid applicability option: ${value}.`);
      }
    }
    const isPersonResolverDetail = question.primaryDecision.decisionId.endsWith("person_detail");
    if (isPersonResolverDetail && !question.personResolverPromptVariants) {
      throw new TemplateCopilotQuestionLibraryError(`Person resolver detail question ${question.questionId} must declare pinned prompt variants.`);
    }
    if (!isPersonResolverDetail && question.personResolverPromptVariants) {
      throw new TemplateCopilotQuestionLibraryError(`Only person resolver detail questions may declare prompt variants: ${question.questionId}.`);
    }
    if (question.personResolverPromptVariants) {
      const variants = question.personResolverPromptVariants;
      const selector = questionsByDecision.get(variants.selectorDecisionId);
      if (!selector || selector.answer.type !== "choice" || !selector.answer.options) {
        throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} must use a pinned earlier choice as its prompt-variant selector.`);
      }
      if (selector.priority >= question.priority || !question.prerequisiteDecisionIds.includes(variants.selectorDecisionId)) {
        throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} must list its earlier prompt-variant selector as a prerequisite.`);
      }
      const selectorOptionIds = new Set(selector.answer.options.map((option) => option.optionId));
      const requiredOptionIds = ["fixed_email", "directory_role", "request_field"];
      if (selectorOptionIds.size !== 4 || !requiredOptionIds.every((optionId) => selectorOptionIds.has(optionId)) || selectorOptionIds.has("assigned_later") === false) {
        throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} has prompt variants that do not match its resolver choices.`);
      }
      const resolverApplicability = question.applicability;
      if (resolverApplicability.kind !== "decision_equals" || resolverApplicability.decisionId !== variants.selectorDecisionId || resolverApplicability.values.length !== requiredOptionIds.length || !requiredOptionIds.every((optionId) => resolverApplicability.values.includes(optionId))) {
        throw new TemplateCopilotQuestionLibraryError(`Question ${question.questionId} must make prompt variants applicable only for fixed email, directory role, and request-field choices.`);
      }
    }
  }
  detectQuestionCycles(questions);
  return {
    version: parsed.data.version,
    ...(parsed.data.conceptLibraryVersion ? { conceptLibraryVersion: parsed.data.conceptLibraryVersion } : {}),
    ...(parsed.data.contentReview ? { contentReview: parsed.data.contentReview } : {}),
    questions: [...questions].sort(compareQuestions),
  };
}

export type TemplateCopilotV2InterviewGap = Readonly<{
  factId: TemplateCopilotFactId;
  code: "pending_fact" | "prerequisite_pending";
  dependsOn?: readonly TemplateCopilotFactId[];
}>;
export type TemplateCopilotV2InterviewState = Readonly<{
  libraryVersion: string;
  conceptLibraryVersion?: string;
  state: "question" | "blocked" | "complete";
  nextQuestion?: Readonly<{
    questionId: string;
    targetFactId: TemplateCopilotFactId;
    primaryDecisionId: string;
    answerType: TemplateCopilotQuestion["answer"]["type"];
    answerSchemaRef: string;
    validation: "server_fact_transition";
    helpConceptRef: string;
    helpLabel: string;
    helpBody: string;
    helpDetail?: Readonly<{
      conceptId: string;
      conceptVersion: string;
      libraryVersion: string;
      requestedLocale: "en" | "zh-Hant" | "zh-Hans";
      displayedLocale: "en" | "zh-Hant" | "zh-Hans";
      plainLabel: string;
      explanation: string;
      questionTip: string;
      example: string;
      workflowEffect: string;
      controls: TemplateCopilotResolvedConcept["controls"];
      fallback?: TemplateCopilotResolvedConcept["fallback"];
    }>;
    uncertainty: Readonly<{ notSure: true; notApplicable: "never" | "when_optional" }>;
    interaction?: TemplateCopilotV2Step4Interaction;
    exampleLabel?: string;
    example?: string;
    options?: readonly Readonly<{ optionId: string; label: string }>[];
    prompt: string;
  }>;
  rationale: Readonly<{ code: "highest_priority_applicable_pending_fact" | "all_applicable_facts_terminal" | "pending_facts_wait_for_prerequisites"; priority?: number; priorityPolicy: "unique_priority" }>;
  inapplicableFactIds: readonly TemplateCopilotFactId[];
  gaps: readonly TemplateCopilotV2InterviewGap[];
}>;

function pinnedPromptForQuestion(question: TemplateCopilotQuestion, ledger: TemplateCopilotV2Ledger) {
  const variants = question.personResolverPromptVariants;
  if (!variants) return question.prompt[ledger.locale];
  const selectorDecision = ledger.atomicDecisions[variants.selectorDecisionId];
  const selectedMode = selectorDecision?.kind === "choice" ? selectorDecision.optionId : undefined;
  if (selectedMode === "fixed_email" || selectedMode === "directory_role" || selectedMode === "request_field") {
    return variants.variants[selectedMode][ledger.locale];
  }
  // A validated variant question is only selectable after a valid matching
  // choice. This fallback keeps malformed caller-supplied ledgers harmless.
  return question.prompt[ledger.locale];
}

export type TemplateCopilotV2SpecialReviewItem = Readonly<{
  decisionId: string;
  questionId: string;
  prompt: string;
  kind: "unknown" | "not_applicable";
  reason?: string;
}>;

/** Server-authoritative labels for every special decision.  The question and
 * localized prompt come from the session's pinned library, never from the
 * decision's generic display value. */
export function getTemplateCopilotV2SpecialReview(ledgerInput: TemplateCopilotV2Ledger, libraryInput?: TemplateCopilotQuestionLibrary): readonly TemplateCopilotV2SpecialReviewItem[] {
  const ledger = templateCopilotV2LedgerSchema.parse(ledgerInput);
  const library = libraryInput ? validateTemplateCopilotQuestionLibrary(libraryInput) : getTemplateCopilotQuestionLibrary(ledger.questionLibraryVersion);
  if (library.version !== ledger.questionLibraryVersion) throw new TemplateCopilotQuestionLibraryError("The supplied question library does not match the ledger's pinned version.");
  return Object.freeze(library.questions.flatMap((question) => {
    const decision = ledger.atomicDecisions[question.primaryDecision.decisionId];
    if (!decision || (decision.kind !== "unknown" && decision.kind !== "not_applicable")) return [];
    return [Object.freeze({
      decisionId: question.primaryDecision.decisionId,
      questionId: question.questionId,
      prompt: pinnedPromptForQuestion(question, ledger),
      kind: decision.kind,
      ...(decision.kind === "not_applicable" && decision.reason ? { reason: decision.reason } : {}),
    })];
  }).sort((left, right) => left.decisionId.localeCompare(right.decisionId)));
}

/** Pure controller: it selects a question from a pinned library and ledger;
 * no model output can affect ordering, applicability, or target fact. */
export function getTemplateCopilotV2InterviewState(ledgerInput: TemplateCopilotV2Ledger, libraryInput?: TemplateCopilotQuestionLibrary): TemplateCopilotV2InterviewState {
  const ledger = templateCopilotV2LedgerSchema.parse(ledgerInput);
  const library = libraryInput ? validateTemplateCopilotQuestionLibrary(libraryInput) : getTemplateCopilotQuestionLibrary(ledger.questionLibraryVersion);
  if (library.version !== ledger.questionLibraryVersion) throw new TemplateCopilotQuestionLibraryError("The supplied question library does not match the ledger's pinned version.");
  const applicability = computeQuestionApplicability(library.questions, ledger);
  const deferred = library.questions.filter((question) => ledger.atomicDecisions[question.primaryDecision.decisionId]?.kind === "unknown");
  // A fact is excluded from readiness only when every question that could
  // collect it is proven inapplicable. Pending is deliberately not N/A.
  const inapplicableFactIds = templateCopilotFactIds.filter((factId) => {
    const questions = library.questions.filter((question) => question.targetFactId === factId);
    return questions.length > 0 && questions.every((question) => applicability.get(question.questionId) === "inapplicable");
  });
  // A cross-topic extraction candidate is only a review item. It cannot skip
  // a question. A human-confirmed fact (or an explicitly human-confirmed N/A
  // fact) can, because its confirmation is part of the authoritative ledger.
  const pending = library.questions.filter((question) => {
    const fact = ledger.facts[question.targetFactId];
    const explicitlyResolved = fact.status === "committed" || fact.status === "not_applicable";
    return applicability.get(question.questionId) !== "inapplicable"
      && !ledger.atomicDecisions[question.primaryDecision.decisionId]
      && !explicitlyResolved;
  });
  const selectable = pending.filter((question) => applicability.get(question.questionId) === "applicable" && question.prerequisiteDecisionIds.every((decisionId) => {
    const decision = ledger.atomicDecisions[decisionId];
    return Boolean(decision && decision.kind !== "unknown");
  }));
  const selected = [...selectable].sort(compareQuestions)[0];
  if (selected) {
    const interaction = getTemplateCopilotV2Step4Interaction({
      libraryVersion: library.version,
      questionId: selected.questionId,
      answerType: selected.answer.type,
      locale: ledger.locale,
    });
    const resolvedConcept = library.conceptLibraryVersion
      ? resolveTemplateCopilotConcept({
          libraryVersion: library.conceptLibraryVersion,
          conceptId: selected.help.conceptRef,
          locale: ledger.locale,
        })
      : null;
    return Object.freeze({
      libraryVersion: library.version,
      ...(library.conceptLibraryVersion ? { conceptLibraryVersion: library.conceptLibraryVersion } : {}),
      state: "question",
      nextQuestion: Object.freeze({
        questionId: selected.questionId,
        targetFactId: selected.targetFactId,
        primaryDecisionId: selected.primaryDecision.decisionId,
        answerType: selected.answer.type,
        answerSchemaRef: selected.answer.schemaRef,
        validation: selected.answer.validation,
        helpConceptRef: selected.help.conceptRef,
        helpLabel: ledger.locale === "zh-Hant" ? "說明" : ledger.locale === "zh-Hans" ? "说明" : "Help",
        helpBody: selected.help.body[ledger.locale],
        ...(resolvedConcept ? {
          helpDetail: Object.freeze({
            conceptId: resolvedConcept.conceptId,
            conceptVersion: resolvedConcept.conceptVersion,
            libraryVersion: resolvedConcept.libraryVersion,
            requestedLocale: resolvedConcept.requestedLocale,
            displayedLocale: resolvedConcept.displayedLocale,
            plainLabel: resolvedConcept.content.plainLabel,
            explanation: resolvedConcept.content.explanation,
            questionTip: selected.help.body[ledger.locale],
            example: resolvedConcept.content.example,
            workflowEffect: resolvedConcept.content.workflowEffect,
            controls: resolvedConcept.controls,
            ...(resolvedConcept.fallback ? { fallback: resolvedConcept.fallback } : {}),
          }),
        } : {}),
        uncertainty: selected.uncertainty,
        ...(interaction ? { interaction } : {}),
        ...(selected.example ? { exampleLabel: ledger.locale === "zh-Hant" ? "例子" : ledger.locale === "zh-Hans" ? "示例" : "Example", example: selected.example[ledger.locale] } : {}),
        ...(selected.answer.options ? { options: Object.freeze(selected.answer.options.map((option) => Object.freeze({ optionId: option.optionId, label: option.label[ledger.locale] }))) } : {}),
        prompt: pinnedPromptForQuestion(selected, ledger),
      }),
      rationale: Object.freeze({ code: "highest_priority_applicable_pending_fact", priority: selected.priority, priorityPolicy: "unique_priority" }),
      inapplicableFactIds: Object.freeze(inapplicableFactIds),
      gaps: Object.freeze([]),
    });
  }
  // Continue gathering independent facts after "Not sure". Its dependents
  // remain unopened, and only when no independent question is selectable do
  // we enter the explicit review/reopen state.
  if (deferred.length) {
    const first = deferred.sort(compareQuestions)[0];
    return Object.freeze({ libraryVersion: library.version, ...(library.conceptLibraryVersion ? { conceptLibraryVersion: library.conceptLibraryVersion } : {}), state: "blocked", rationale: Object.freeze({ code: "pending_facts_wait_for_prerequisites", priorityPolicy: "unique_priority" }), inapplicableFactIds: Object.freeze(inapplicableFactIds), gaps: Object.freeze([{ factId: first.targetFactId, code: "pending_fact" as const }]) });
  }
  if (pending.length === 0) {
    return Object.freeze({ libraryVersion: library.version, ...(library.conceptLibraryVersion ? { conceptLibraryVersion: library.conceptLibraryVersion } : {}), state: "complete", rationale: Object.freeze({ code: "all_applicable_facts_terminal", priorityPolicy: "unique_priority" }), inapplicableFactIds: Object.freeze(inapplicableFactIds), gaps: Object.freeze([]) });
  }
  const gaps = pending.sort(compareQuestions).map((question) => {
    const dependsOn = question.prerequisiteDecisionIds.filter((decisionId) => !ledger.atomicDecisions[decisionId] || ledger.atomicDecisions[decisionId]?.kind === "unknown").map((decisionId) => library.questions.find((candidate) => candidate.primaryDecision.decisionId === decisionId)?.targetFactId).filter(Boolean) as TemplateCopilotFactId[];
    return dependsOn.length ? { factId: question.targetFactId, code: "prerequisite_pending" as const, dependsOn: Object.freeze(dependsOn) } : { factId: question.targetFactId, code: "pending_fact" as const };
  });
  return Object.freeze({ libraryVersion: library.version, ...(library.conceptLibraryVersion ? { conceptLibraryVersion: library.conceptLibraryVersion } : {}), state: "blocked", rationale: Object.freeze({ code: "pending_facts_wait_for_prerequisites", priorityPolicy: "unique_priority" }), inapplicableFactIds: Object.freeze(inapplicableFactIds), gaps: Object.freeze(gaps) });
}

type Applicability = "applicable" | "pending" | "inapplicable";
function directApplicability(question: TemplateCopilotQuestion, ledger: TemplateCopilotV2Ledger): Applicability {
  if (question.applicability.kind === "always") return "applicable";
  const decidingDecision = ledger.atomicDecisions[question.applicability.decisionId];
  if (decidingDecision?.kind === "unknown") return "pending";
  const answer = decidingDecision?.answer;
  if (!answer) return "pending";
  const normalized = answer.trim().toLocaleLowerCase("en");
  const matches = question.applicability.values.some((value) => value.trim().toLocaleLowerCase("en") === normalized);
  return question.applicability.kind === "decision_equals" ? (matches ? "applicable" : "inapplicable") : (matches ? "inapplicable" : "applicable");
}

/** Evaluates the already-validated prerequisite DAG. A descendant cannot
 * remain pending after its prerequisite was itself proven inapplicable. */
function computeQuestionApplicability(questions: readonly TemplateCopilotQuestion[], ledger: TemplateCopilotV2Ledger) {
  const byDecision = new Map(questions.map((question) => [question.primaryDecision.decisionId, question]));
  const memo = new Map<string, Applicability>();
  const visiting = new Set<string>();
  const evaluate = (question: TemplateCopilotQuestion): Applicability => {
    const cached = memo.get(question.questionId); if (cached) return cached;
    if (visiting.has(question.questionId)) throw new TemplateCopilotQuestionLibraryError("Question applicability cycle detected.");
    visiting.add(question.questionId);
    let result = directApplicability(question, ledger);
    if (result !== "inapplicable") {
      for (const prerequisiteId of question.prerequisiteDecisionIds) {
        const decision = ledger.atomicDecisions[prerequisiteId];
        // "Not sure" is non-terminal: it must not unlock a dependent branch.
        if (decision?.kind === "unknown") { result = "pending"; break; }
        if (decision) continue;
        const prerequisite = byDecision.get(prerequisiteId);
        if (!prerequisite) throw new TemplateCopilotQuestionLibraryError(`Unknown prerequisite decision ${prerequisiteId}.`);
        const prerequisiteState = evaluate(prerequisite);
        if (prerequisiteState === "inapplicable") { result = "inapplicable"; break; }
        result = "pending";
      }
    }
    visiting.delete(question.questionId); memo.set(question.questionId, result); return result;
  };
  return new Map(questions.map((question) => [question.questionId, evaluate(question)]));
}
function compareQuestions(left: TemplateCopilotQuestion, right: TemplateCopilotQuestion) { return left.priority - right.priority || left.questionId.localeCompare(right.questionId); }

function detectQuestionCycles(questions: readonly TemplateCopilotQuestion[]) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byDecision = new Map(questions.map((question) => [question.primaryDecision.decisionId, question]));
  const visit = (decisionId: string) => {
    if (visited.has(decisionId)) return;
    if (visiting.has(decisionId)) throw new TemplateCopilotQuestionLibraryError(`Question library has a prerequisite cycle at ${decisionId}.`);
    visiting.add(decisionId);
    const question = byDecision.get(decisionId);
    for (const dependency of question?.prerequisiteDecisionIds || []) visit(dependency);
    if (question && question.applicability.kind !== "always") visit(question.applicability.decisionId);
    visiting.delete(decisionId);
    visited.add(decisionId);
  };
  for (const question of questions) visit(question.primaryDecision.decisionId);
}

/** A deterministic, non-authoritative review view.  It deliberately does not
 * mutate a broad fact or claim that incremental answers are human-confirmed.
 * Later review/compile steps consume this visible candidate only. */
export function assembleTemplateCopilotV2FactCandidates(ledgerInput: TemplateCopilotV2Ledger, libraryInput?: TemplateCopilotQuestionLibrary) {
  const ledger = templateCopilotV2LedgerSchema.parse(ledgerInput);
  const library = libraryInput ? validateTemplateCopilotQuestionLibrary(libraryInput) : getTemplateCopilotQuestionLibrary(ledger.questionLibraryVersion);
  if (library.version !== ledger.questionLibraryVersion) throw new TemplateCopilotQuestionLibraryError("The supplied question library does not match the ledger's pinned version.");
  const applicability = computeQuestionApplicability(library.questions, ledger);
  return Object.freeze(Object.fromEntries(templateCopilotFactIds.map((factId) => {
    const questions = library.questions.filter((question) => question.targetFactId === factId);
    const answers = questions.flatMap((question) => {
      const answer = ledger.atomicDecisions[question.primaryDecision.decisionId];
      return answer ? [{ decisionId: question.primaryDecision.decisionId, answer: answer.answer, provenance: answer.provenance, answeredAt: answer.answeredAt }] : [];
    });
    const allTerminal = questions.length > 0 && questions.every((question) => (ledger.atomicDecisions[question.primaryDecision.decisionId] && ledger.atomicDecisions[question.primaryDecision.decisionId].kind !== "unknown") || applicability.get(question.questionId) === "inapplicable");
    return [factId, Object.freeze({ factId, state: allTerminal ? "ready_for_review" : "incomplete", answers: Object.freeze(answers) })];
  })) as Record<TemplateCopilotFactId, unknown>);
}

/** Removes a corrected decision and every reverse dependent decision. Both
 * prerequisite and applicability edges are included, so a yes/no branch can
 * never retain answers collected for its former route. */
export function reopenTemplateCopilotV2Decision({ ledgerInput, decisionId, libraryInput }: { ledgerInput: TemplateCopilotV2Ledger; decisionId: string; libraryInput?: TemplateCopilotQuestionLibrary }) {
  const ledger = templateCopilotV2LedgerSchema.parse(ledgerInput);
  const library = libraryInput ? validateTemplateCopilotQuestionLibrary(libraryInput) : getTemplateCopilotQuestionLibrary(ledger.questionLibraryVersion);
  if (!ledger.atomicDecisions[decisionId]) throw new TemplateCopilotQuestionLibraryError("Only an existing decision can be reopened.");
  const closure = new Set<string>([decisionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const question of library.questions) {
      const dependsOn = question.prerequisiteDecisionIds.some((id) => closure.has(id)) || (question.applicability.kind !== "always" && closure.has(question.applicability.decisionId));
      if (dependsOn && !closure.has(question.primaryDecision.decisionId)) { closure.add(question.primaryDecision.decisionId); changed = true; }
    }
  }
  const removedDecisionIds = [...closure].filter((id) => Boolean(ledger.atomicDecisions[id])).sort();
  const atomicDecisions = Object.fromEntries(Object.entries(ledger.atomicDecisions).filter(([id]) => !closure.has(id)));
  return { ledger: templateCopilotV2LedgerSchema.parse({ ...ledger, atomicDecisions }), removedDecisionIds };
}

function deepFreezeQuestionLibraryValue<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const objectValue = value as Record<PropertyKey, unknown>;
  if (visited.has(objectValue)) return value;
  visited.add(objectValue);
  for (const key of Reflect.ownKeys(objectValue)) {
    deepFreezeQuestionLibraryValue(objectValue[key], visited);
  }
  Object.freeze(objectValue);
  return value;
}

function freezeQuestionLibrary(library: TemplateCopilotQuestionLibrary): TemplateCopilotQuestionLibrary {
  return deepFreezeQuestionLibraryValue(library);
}
