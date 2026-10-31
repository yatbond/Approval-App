import { z } from "zod";

export type TemplateCopilotStructuredDecodeFailure = Readonly<{
  reasonCode: "invalid_json" | "schema_validation";
  issuePaths: readonly string[];
}>;

/**
 * Responses SDK parsing failures are content failures, not transport outages.
 * Keeping this classifier separate lets the caller retry a smaller schema
 * without ever retrying API, timeout, authentication, or configuration errors.
 */
export function classifyTemplateCopilotStructuredDecodeFailure(
  error: unknown,
): TemplateCopilotStructuredDecodeFailure | null {
  if (error instanceof z.ZodError) {
    return Object.freeze({
      reasonCode: "schema_validation",
      issuePaths: Object.freeze(
        error.issues
          .slice(0, 20)
          .map((issue) => issue.path.length ? issue.path.join(".") : "$"),
      ),
    });
  }
  if (error instanceof SyntaxError) {
    return Object.freeze({
      reasonCode: "invalid_json",
      issuePaths: Object.freeze([]),
    });
  }
  return null;
}
