/** A bounded public error surface for the Copilot browser client. Server
 * diagnostics and arbitrary response text are deliberately not exposed. */
export class TemplateCopilotApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super("The Template Copilot request could not be completed.");
    this.name = "TemplateCopilotApiError";
    this.status = status;
    this.code = code;
  }
}

export function templateCopilotApiErrorFromResponse(status: number, payload: unknown) {
  const candidate = payload && typeof payload === "object"
    ? (payload as { error?: { code?: unknown }; code?: unknown }).error?.code ?? (payload as { code?: unknown }).code
    : undefined;
  const code = typeof candidate === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(candidate) ? candidate : null;
  return new TemplateCopilotApiError(status, code);
}

export function templateCopilotApiErrorStatus(error: unknown) {
  return error instanceof TemplateCopilotApiError ? error.status : null;
}

export function templateCopilotApiErrorCode(error: unknown) {
  return error instanceof TemplateCopilotApiError ? error.code : null;
}
