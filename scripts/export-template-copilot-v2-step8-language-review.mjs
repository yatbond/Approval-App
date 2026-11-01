import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import conceptModule from "../src/lib/template-copilot-concepts.ts";
import questionModule from "../src/lib/template-copilot-question-library.ts";

const {
  getTemplateCopilotConceptLibrary,
  templateCopilotConceptLocales,
} = conceptModule;
const { getTemplateCopilotQuestionLibrary } = questionModule;

const outputUrl = new URL("../docs/template-authoring/step-8-language-review.csv", import.meta.url);
const conceptLibrary = getTemplateCopilotConceptLibrary("concepts.v1.0");
const questionLibrary = getTemplateCopilotQuestionLibrary("v2.2");
const rows = [];

for (const entry of conceptLibrary.entries) {
  for (const locale of templateCopilotConceptLocales) {
    const content = entry.content[locale];
    rows.push({
      record_type: "concept",
      item_id: entry.conceptId,
      item_version: entry.version,
      locale,
      candidate_fingerprint: conceptLibrary.contentReviewFingerprint,
      technical_or_decision_name: entry.internalTechnicalName,
      semantic_contract: entry.semanticContract.join(" | "),
      primary_text: content?.plainLabel || "",
      explanation_or_tip: content?.explanation || "",
      example: content?.example || "",
      workflow_effect_or_options: content?.workflowEffect || "",
      candidate_status: entry.review[locale].status,
      reviewer_name: "",
      reviewer_decision: "",
      reviewed_at_rfc3339: "",
      evidence_reference: "",
      reviewer_comments: "",
    });
  }
}

for (const question of questionLibrary.questions) {
  for (const locale of templateCopilotConceptLocales) {
    rows.push({
      record_type: "question",
      item_id: question.questionId,
      item_version: questionLibrary.version,
      locale,
      candidate_fingerprint: questionLibrary.contentReview.contentFingerprint,
      technical_or_decision_name: question.primaryDecision.decisionId,
      semantic_contract: `${question.targetFactId} | ${question.answer.type} | ${question.answer.schemaRef}`,
      primary_text: question.prompt[locale],
      explanation_or_tip: question.help.body[locale],
      example: question.example?.[locale] || "",
      workflow_effect_or_options: (question.answer.options || [])
        .map((option) => `${option.optionId}: ${option.label[locale]}`)
        .join(" | "),
      candidate_status: questionLibrary.contentReview.locales[locale].status,
      reviewer_name: "",
      reviewer_decision: "",
      reviewed_at_rfc3339: "",
      evidence_reference: "",
      reviewer_comments: "",
    });
    for (const [mode, prompt] of Object.entries(question.personResolverPromptVariants?.variants || {})) {
      rows.push({
        record_type: "question_prompt_variant",
        item_id: `${question.questionId}#${mode}`,
        item_version: questionLibrary.version,
        locale,
        candidate_fingerprint: questionLibrary.contentReview.contentFingerprint,
        technical_or_decision_name: `${question.personResolverPromptVariants.selectorDecisionId} | ${mode}`,
        semantic_contract: `${question.targetFactId} | resolver-specific visible prompt`,
        primary_text: prompt[locale],
        explanation_or_tip: "",
        example: "",
        workflow_effect_or_options: "",
        candidate_status: questionLibrary.contentReview.locales[locale].status,
        reviewer_name: "",
        reviewer_decision: "",
        reviewed_at_rfc3339: "",
        evidence_reference: "",
        reviewer_comments: "",
      });
    }
  }
}

const headers = Object.keys(rows[0]);
const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
].join("\r\n");

await mkdir(new URL("../docs/template-authoring/", import.meta.url), { recursive: true });
await writeFile(outputUrl, `\uFEFF${csv}\r\n`, "utf8");
console.log(`step8_language_review_rows=${rows.length}`);
console.log(`step8_language_review_output=${fileURLToPath(outputUrl)}`);
console.log(`step8_concept_fingerprint=${conceptLibrary.contentReviewFingerprint}`);
console.log(`step8_question_fingerprint=${questionLibrary.contentReview.contentFingerprint}`);

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
