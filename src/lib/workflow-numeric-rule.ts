import type { WorkflowNumericRule } from "./types.ts";

export function doesWorkflowNumericRuleMatch(
  rule: WorkflowNumericRule,
  extractedFields: Record<string, string>,
) {
  const rawFieldValue = extractedFields[rule.field] || "";
  const fieldValue = normalizeComparableValue(rawFieldValue);
  const ruleValue = normalizeComparableValue(rule.value);

  if (rule.operator === "contains") {
    return rawFieldValue.toLowerCase().includes(rule.value.toLowerCase());
  }

  if (typeof fieldValue === "number" && typeof ruleValue === "number") {
    if (rule.operator === "=") return fieldValue === ruleValue;
    if (rule.operator === "!=") return fieldValue !== ruleValue;
    if (rule.operator === ">") return fieldValue > ruleValue;
    if (rule.operator === ">=") return fieldValue >= ruleValue;
    if (rule.operator === "<") return fieldValue < ruleValue;
    if (rule.operator === "<=") return fieldValue <= ruleValue;
  }

  if (rule.operator === "=") return rawFieldValue === rule.value;
  if (rule.operator === "!=") return rawFieldValue !== rule.value;
  return false;
}

function normalizeComparableValue(value: string) {
  const number = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && value.trim() ? number : value;
}
