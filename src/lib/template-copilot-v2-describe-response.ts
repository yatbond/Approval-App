/** Route-local terminal mapping for durable broad-mode commands. These outcomes
 * are not infrastructure failures: Guided fallback is a persisted successful
 * state, while pending means another holder owns the same exact command. */
export function templateCopilotV2DescribeResponseDisposition(result: Record<string, unknown>) {
  switch (result.outcome) {
    case "guided_fallback":
      return { status: 200, body: result } as const;
    case "pending":
      return {
        status: 409,
        body: {
          error: {
            code: "describe_pending",
            message: "This exact Describe command is still being processed. Retry the same saved command shortly.",
          },
          ...pickDescribeRetryState(result),
        },
      } as const;
    case "invalid_command":
      return {
        status: 400,
        body: { error: { code: "invalid_command", message: "The Describe command is invalid." } },
      } as const;
    case "document_limit":
      return {
        status: 422,
        body: {
          error: {
            code: "too_many_documents",
            message: "A Copilot session accepts at most five requirement documents.",
          },
        },
      } as const;
    default:
      return null;
  }
}

function pickDescribeRetryState(result: Record<string, unknown>) {
  const state: Record<string, unknown> = {};
  for (const key of ["revision", "currentRevision", "status", "ledger", "sourceMessageId"]) {
    if (result[key] !== undefined) state[key] = result[key];
  }
  return state;
}
