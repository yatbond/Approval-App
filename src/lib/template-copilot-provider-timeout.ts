const defaultProviderTimeoutMs = 12_000;
const minimumProviderTimeoutMs = 1_000;
// Keep this below the answer Route Handler's 30-second `after()` duration.
const maximumProviderTimeoutMs = 20_000;

export class TemplateCopilotProviderTimeoutConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "TemplateCopilotProviderTimeoutConfigurationError"; }
}

export function templateCopilotProviderTimeoutMs(env: Readonly<{ TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS?: string }> = process.env as Readonly<{ TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS?: string }>) {
  const raw = env.TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS?.trim();
  if (!raw) return defaultProviderTimeoutMs;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimumProviderTimeoutMs || value > maximumProviderTimeoutMs) {
    throw new TemplateCopilotProviderTimeoutConfigurationError(`TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS must be an integer from ${minimumProviderTimeoutMs} to ${maximumProviderTimeoutMs}.`);
  }
  return value;
}
