/**
 * Server-side rollout gate for Copilot v2. This deliberately does not use a
 * NEXT_PUBLIC variable: clients must not be able to opt themselves into a
 * write-capable server path.
 */
export type TemplateCopilotV2Flag = Readonly<{ enabled: boolean }>;
type TemplateCopilotV2Environment = Readonly<{ TEMPLATE_COPILOT_V2?: string }>;

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
