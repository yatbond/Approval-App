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
