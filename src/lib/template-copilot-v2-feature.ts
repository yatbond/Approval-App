/**
 * Server-side rollout gate for Copilot v2. This deliberately does not use a
 * NEXT_PUBLIC variable: clients must not be able to opt themselves into a
 * write-capable server path.
 */
export type TemplateCopilotV2Flag = Readonly<{ enabled: boolean }>;
type TemplateCopilotV2Environment = Readonly<{ TEMPLATE_COPILOT_V2?: string }>;
type TemplateCopilotV2Step4Environment = Readonly<{ TEMPLATE_COPILOT_V2_STEP4?: string }>;
type TemplateCopilotV2Step5Environment = Readonly<{ TEMPLATE_COPILOT_V2_STEP5_EDITING?: string }>;
type TemplateCopilotV2ExtractionEnvironment = Readonly<{
  TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW?: string;
  TEMPLATE_COPILOT_V2_CANDIDATE_CREATION?: string;
}>;
type TemplateCopilotV2ModeEnvironment = Readonly<{
  TEMPLATE_COPILOT_V2_GUIDED?: string;
  TEMPLATE_COPILOT_V2_DESCRIBE_EVERYTHING?: string;
  TEMPLATE_COPILOT_V2_SIMILAR_TEMPLATE?: string;
}>;
type TemplateCopilotV2StructuredEditorEnvironment = Readonly<{
  TEMPLATE_COPILOT_V2_ATTACHMENT_EDITOR?: string;
  TEMPLATE_COPILOT_V2_CONDITION_EDITOR?: string;
  TEMPLATE_COPILOT_V2_NOTIFICATION_EDITOR?: string;
}>;

export function getTemplateCopilotV2Flag(
  env?: TemplateCopilotV2Environment,
): TemplateCopilotV2Flag {
  const runtimeEnvironment = process.env as unknown as TemplateCopilotV2Environment;
  return Object.freeze({ enabled: (env || runtimeEnvironment).TEMPLATE_COPILOT_V2 === "true" });
}

export function isTemplateCopilotV2Enabled(
  env?: TemplateCopilotV2Environment,
) {
  return getTemplateCopilotV2Flag(env).enabled;
}

/** Step 4 is independently kill-switchable. It is server-derived capability
 * metadata, never a browser-controlled flag, so an existing v2.1 ledger can
 * remain readable while the enhanced controls are withdrawn. */
export function isTemplateCopilotV2Step4Enabled(
  env?: TemplateCopilotV2Step4Environment,
) {
  const runtimeEnvironment = process.env as unknown as TemplateCopilotV2Step4Environment;
  return (env || runtimeEnvironment).TEMPLATE_COPILOT_V2_STEP4 === "true";
}

/** Step 5 starts read-only. Editing is independently disabled until its
 * revision/reconciliation rollout is qualified; the authoritative map stays
 * visible when this switch is off. */
export function isTemplateCopilotV2Step5EditingEnabled(env?: TemplateCopilotV2Step5Environment) {
  const runtimeEnvironment = process.env as unknown as TemplateCopilotV2Step5Environment;
  return (env || runtimeEnvironment).TEMPLATE_COPILOT_V2_STEP5_EDITING === "true";
}

export function requireTemplateCopilotV2(
  flag: TemplateCopilotV2Flag = getTemplateCopilotV2Flag(),
) {
  if (!flag.enabled) {
    throw new TemplateCopilotV2DisabledError();
  }
}

export class TemplateCopilotV2DisabledError extends Error {
  constructor() {
    super("Template Copilot v2 is disabled.");
    this.name = "TemplateCopilotV2DisabledError";
  }
}

/** Extraction is deliberately independent from the v2 interview flag. A bad
 * provider rollout can be stopped without interrupting the manual interview. */
export function isTemplateCopilotV2ExtractionShadowEnabled(
  env?: TemplateCopilotV2ExtractionEnvironment,
) {
  const runtimeEnvironment = process.env as unknown as TemplateCopilotV2ExtractionEnvironment;
  return (env || runtimeEnvironment).TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW === "true";
}

/** This remains off until provider qualification has been reviewed. It is not
 * a public flag and is not sufficient on its own: shadow extraction is also
 * required so turning it on cannot accidentally create production candidates. */
export function isTemplateCopilotV2CandidateCreationEnabled(
  env?: TemplateCopilotV2ExtractionEnvironment,
) {
  const runtimeEnvironment = process.env as unknown as TemplateCopilotV2ExtractionEnvironment;
  const selected = env || runtimeEnvironment;
  return selected.TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW === "true"
    && selected.TEMPLATE_COPILOT_V2_CANDIDATE_CREATION === "true";
}

/** Step 6 mode switches are intentionally independent. Turning one off stops
 * new actions in that mode but never makes an already-created session or its
 * immutable source snapshot unreadable. Guided remains the conservative
 * fallback when a describe/import mode is withdrawn or unavailable. */
export function getTemplateCopilotV2ModeFlags(env?: TemplateCopilotV2ModeEnvironment) {
  const selected = env || process.env as TemplateCopilotV2ModeEnvironment;
  return Object.freeze({
    guided: selected.TEMPLATE_COPILOT_V2_GUIDED === "true",
    describeEverything: selected.TEMPLATE_COPILOT_V2_DESCRIBE_EVERYTHING === "true",
    similarTemplate: selected.TEMPLATE_COPILOT_V2_SIMILAR_TEMPLATE === "true",
  });
}

export function isTemplateCopilotV2ModeEnabled(mode: "guided" | "describe_everything" | "similar_template", env?: TemplateCopilotV2ModeEnvironment) {
  const flags = getTemplateCopilotV2ModeFlags(env);
  return mode === "guided" ? flags.guided : mode === "describe_everything" ? flags.describeEverything : flags.similarTemplate;
}

/** Step 7 editors roll out independently. A disabled editor never discards
 * its canonical value: the authoritative map keeps rendering it read-only. */
export function getTemplateCopilotV2StructuredEditorFlags(
  env?: TemplateCopilotV2StructuredEditorEnvironment,
) {
  const selected = env || process.env as TemplateCopilotV2StructuredEditorEnvironment;
  return Object.freeze({
    attachments: selected.TEMPLATE_COPILOT_V2_ATTACHMENT_EDITOR === "true",
    conditions: selected.TEMPLATE_COPILOT_V2_CONDITION_EDITOR === "true",
    notifications: selected.TEMPLATE_COPILOT_V2_NOTIFICATION_EDITOR === "true",
  });
}

export function isTemplateCopilotV2StructuredEditorEnabled(
  factId: "attachments.requirements" | "workflow.conditions" | "notifications.rules",
  env?: TemplateCopilotV2StructuredEditorEnvironment,
) {
  const flags = getTemplateCopilotV2StructuredEditorFlags(env);
  return factId === "attachments.requirements"
    ? flags.attachments
    : factId === "workflow.conditions"
      ? flags.conditions
      : flags.notifications;
}
