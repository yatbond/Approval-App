export type EmailDeliveryResult = {
  mode?: string;
  attempted?: number;
  sent?: number;
  skipped?: number;
  failures?: Array<{ message?: string }>;
  error?: string;
};

export function formatEmailDeliveryMessage(result: EmailDeliveryResult) {
  if (result.error) {
    return `Email failed: ${result.error}`;
  }

  const attempted = result.attempted || 0;
  const sent = result.sent || 0;
  const skipped = result.skipped || 0;
  const failureCount = result.failures?.length || 0;
  const mode = result.mode || "unknown";
  const suffix = failureCount
    ? ` ${failureCount} failed: ${result.failures?.[0]?.message || "Unknown error"}`
    : "";

  return `Email ${mode}: ${sent} sent, ${skipped} skipped, ${attempted} attempted.${suffix}`;
}

export function getEmailDeliveryErrorMessage(
  error: unknown,
  fallback: string,
) {
  return error instanceof Error ? error.message : fallback;
}
