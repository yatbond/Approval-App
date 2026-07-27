import type { TemplateCopilotFactEntry, TemplateCopilotFactId } from "./template-copilot-facts.ts";
import type { TemplateCopilotV2ProjectionLocale } from "./template-copilot-v2-authoritative-projection.ts";

export type TemplateCopilotV2MapAction = "save" | "unknown" | "not_applicable";
export type TemplateCopilotV2MapEditorContract = Readonly<{
  canSave: boolean;
  canMarkUnknown: boolean;
  canMarkNotApplicable: boolean;
  initialFocus: "first-editor-control";
  restoreFocus: "edit-trigger";
}>;

/** A browser-only normalization step. It removes blank optional controls while
 * preserving the user's explicit string-versus-number choice and every
 * schema-required empty array/default. The same strict schema remains
 * authoritative on the server. */
export function canonicalizeTemplateCopilotV2MapEditorValue(factId: TemplateCopilotFactId, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => {
    if (!isRecord(item)) return item;
    const next = withoutBlankStrings(item);
    if (factId === "workflow.stages" && isRecord(next.participant)) {
      const participant = withoutBlankStrings(next.participant);
      if (["requester", "unassigned_at_template"].includes(String(participant.mode))) delete participant.value;
      next.participant = participant;
    }
    return next;
  });
  if (!isRecord(value)) return value;
  const next = withoutBlankStrings(value);
  if (factId === "timing.rules" && isRecord(next.escalation) && !nonempty(next.escalation.description) && (!Array.isArray(next.escalation.rules) || next.escalation.rules.length === 0)) delete next.escalation;
  if (factId === "workflow.rejection_policy" && next.action !== "route_to_stage") delete next.route;
  return next;
}

/** The contract is intentionally data driven: every typed editor must yield a
 * value that its matching fact schema accepts before the network request. */
export function validateTemplateCopilotV2MapEditorValue(factId: TemplateCopilotFactId, value: unknown, locale: TemplateCopilotV2ProjectionLocale): readonly string[] {
  const policy = (item: unknown) => isRecord(item) && nonempty(item.description) && (item.rules === undefined || allStrings(item.rules));
  let valid = true;
  if (["workflow.name", "workflow.purpose", "governance.owner"].includes(factId)) valid = nonempty(value);
  else if (["workflow.scope", "collaboration.policy", "visibility.policy"].includes(factId)) valid = policy(value);
  else if (factId === "request.initiator_policy") valid = isRecord(value) && ["any_employee", "directory_role", "requester_selected"].includes(String(value.mode)) && nonempty(value.description);
  else if (factId === "request.fields") valid = Array.isArray(value) && value.length > 0 && value.every((item) => isRecord(item) && nonempty(item.label) && ["text", "long_text", "number", "date", "currency", "email", "select", "radio", "checkbox", "table"].includes(String(item.type)) && typeof item.required === "boolean" && (item.options === undefined || allStrings(item.options)));
  else if (factId === "attachments.requirements") valid = Array.isArray(value) && value.every((item) => isRecord(item) && nonempty(item.label) && typeof item.required === "boolean" && (item.formats === undefined || Array.isArray(item.formats)));
  else if (factId === "workflow.stages") valid = Array.isArray(value) && value.length > 0 && value.every((item) => isRecord(item) && nonempty(item.label) && ["approval", "review", "for_information", "submission"].includes(String(item.kind)) && Number.isInteger(item.sequence) && Number(item.sequence) >= 1 && isRecord(item.participant) && validParticipant(item.participant));
  else if (factId === "workflow.conditions") valid = Array.isArray(value) && value.every((item) => isRecord(item) && nonempty(item.field) && ["=", "!=", ">", ">=", "<", "<=", "contains"].includes(String(item.operator)) && (nonempty(item.value) || typeof item.value === "number") && nonempty(item.matchingRoute) && nonempty(item.otherwiseRoute));
  else if (factId === "workflow.rejection_policy") valid = isRecord(value) && ["return_for_correction", "close", "route_to_stage"].includes(String(value.action)) && (value.action !== "route_to_stage" || nonempty(value.route));
  else if (factId === "timing.rules") valid = isRecord(value) && (value.defaultDueHours === undefined || (Number.isInteger(value.defaultDueHours) && Number(value.defaultDueHours) >= 1 && Number(value.defaultDueHours) <= 8760)) && (value.escalation === undefined || policy(value.escalation));
  else if (factId === "notifications.rules") valid = Array.isArray(value) && value.every((item) => isRecord(item) && nonempty(item.event) && Array.isArray(item.recipients) && item.recipients.length > 0 && allStrings(item.recipients) && ["in_app", "email"].includes(String(item.channel)));
  else if (factId === "governance.policies") valid = Array.isArray(value) && allStrings(value);
  else if (factId === "governance.retention") valid = isRecord(value) && nonempty(value.period) && (value.rationale === undefined || nonempty(value.rationale));
  return valid ? [] : [locale === "zh-Hant" ? "請完整填寫這項設定的必要欄位。" : locale === "zh-Hans" ? "请完整填写这项设置的必填字段。" : "Enter all required values in this setting."];
}

export function getTemplateCopilotV2MapEditorContract({ factId, state, hasNotApplicableReason, hasOpenExtractionSidecar = false }: { factId: TemplateCopilotFactId; state: TemplateCopilotFactEntry["status"]; hasNotApplicableReason: boolean; hasOpenExtractionSidecar?: boolean }): TemplateCopilotV2MapEditorContract {
  const conditional = new Set<TemplateCopilotFactId>(["attachments.requirements", "workflow.conditions", "notifications.rules", "governance.owner", "governance.policies", "governance.retention"]);
  const conflict = state === "conflicting";
  return Object.freeze({
    canSave: !hasOpenExtractionSidecar,
    canMarkUnknown: !conflict && !hasOpenExtractionSidecar,
    canMarkNotApplicable: conditional.has(factId) && !conflict && !hasOpenExtractionSidecar && hasNotApplicableReason,
    initialFocus: "first-editor-control",
    restoreFocus: "edit-trigger",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function allStrings(value: unknown): value is string[] { return Array.isArray(value) && value.every(nonempty); }
function withoutBlankStrings(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== "")); }
function validParticipant(value: Record<string, unknown>) {
  const mode = String(value.mode);
  if (mode === "fixed_email") return nonempty(value.value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.value);
  if (mode === "directory_position" || mode === "request_field") return nonempty(value.value);
  return (mode === "requester" || mode === "unassigned_at_template") && value.value === undefined;
}
