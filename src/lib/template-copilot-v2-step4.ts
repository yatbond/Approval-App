import type { TemplateCopilotV2Ledger } from "./template-copilot-facts.ts";

export type TemplateCopilotV2Step4Interaction = Readonly<{
  enabled: true;
  requiresExplicitContinue: boolean;
  suggestions: readonly Readonly<{ id: string; text: string }> [];
  alternateExamples: readonly string[];
  labels: Readonly<{
    whyAsking: string;
    showAnotherExample: string;
    exampleOnly: string;
    somethingElse: string;
    continue: string;
  }>;
}>;

type Locale = "en" | "zh-Hant" | "zh-Hans";

function labelsFor(locale: Locale) {
  return locale === "zh-Hant"
    ? { whyAsking: "為何要問這個？", showAnotherExample: "顯示另一個例子", exampleOnly: "僅作例子，並非建議", somethingElse: "其他內容", continue: "繼續" }
    : locale === "zh-Hans"
      ? { whyAsking: "为什么要问这个？", showAnotherExample: "显示另一个示例", exampleOnly: "仅作示例，并非建议", somethingElse: "其他内容", continue: "继续" }
      : { whyAsking: "Why are you asking?", showAnotherExample: "Show another example", exampleOnly: "Example only — not a recommendation", somethingElse: "Something else", continue: "Continue" };
}

/**
 * Step 4 is intentionally pinned to a new question-library version.  It is a
 * pure display contract: neither suggestions nor examples are answers, so
 * they cannot reach the mutation or extraction paths unless a person edits
 * and explicitly submits the ordinary answer control.
 */
export function getTemplateCopilotV2Step4Interaction({
  libraryVersion,
  questionId,
  answerType,
  locale,
}: {
  libraryVersion: string;
  questionId: string;
  answerType: string;
  locale: Locale;
}): TemplateCopilotV2Step4Interaction | null {
  if (libraryVersion !== "v2.1") return null;
  const variants: Record<string, readonly [string, string, string]> = {
    "v2.workflow.name.name": ["Supplier payment request", "供應商付款申請", "供应商付款申请"],
    "v2.workflow.purpose.purpose": ["Approve supplier payments before Finance pays them.", "在財務付款前審批供應商付款。", "在财务付款前审批供应商付款。"],
    "v2.request.fields.first_required_field": ["Supplier name", "供應商名稱", "供应商名称"],
  };
  const alternatives: Record<string, readonly [string, string, string]> = {
    "v2.workflow.name.name": ["Travel expense claim", "差旅費報銷申請", "差旅费报销申请"],
    "v2.workflow.purpose.purpose": ["Check that travel expenses follow the company policy before they are reimbursed.", "在報銷前核對差旅費是否符合公司政策。", "在报销前核对差旅费是否符合公司政策。"],
    "v2.request.fields.first_required_field": ["Cost centre", "成本中心", "成本中心"],
  };
  const localeIndex = locale === "en" ? 0 : locale === "zh-Hant" ? 1 : 2;
  const suggestion = variants[questionId]?.[localeIndex];
  const alternate = alternatives[questionId]?.[localeIndex];
  return Object.freeze({
    enabled: true,
    // Choices may change dependencies and applicability. Selection is local;
    // only Continue creates the already revision-safe answer command.
    requiresExplicitContinue: answerType === "choice",
    suggestions: Object.freeze(suggestion ? [{ id: `${questionId}:suggestion:1`, text: suggestion }] : []),
    alternateExamples: Object.freeze(alternate ? [alternate] : []),
    labels: Object.freeze(labelsFor(locale)),
  });
}

/** Only an authoritative, returned ledger can produce a saved acknowledgement.
 * The client never creates this message when it chooses a suggestion or starts
 * a request, preventing a false saved/success claim after a rejected write. */
export function getTemplateCopilotV2CommittedAcknowledgement({
  ledger,
  decisionId,
}: {
  ledger: TemplateCopilotV2Ledger;
  decisionId: string;
}) {
  const decision = ledger.atomicDecisions[decisionId];
  if (!decision || (decision.kind !== "text" && decision.kind !== "choice")) return null;
  const prefix = ledger.locale === "zh-Hant"
    ? "已儲存："
    : ledger.locale === "zh-Hans"
      ? "已保存："
      : "Saved: ";
  // `display` is the canonical bounded display projection stored in the
  // committed ledger. Do not use the request body or an optimistic draft.
  return `${prefix}${decision.display}`;
}
