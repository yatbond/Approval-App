import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getEmailDeliveryConfig,
  sendDurableOutboxEmail,
  type DurableEmailOutboxRow,
} from "@/lib/email-delivery";

type OperationEnv = Record<string, string | undefined>;

export async function runDurableApprovalOperations({
  runKey,
  now = new Date(),
  env = process.env,
  fetchImpl = fetch,
  service = createServiceClient(env),
}: {
  runKey: string;
  now?: Date;
  env?: OperationEnv;
  fetchImpl?: typeof fetch;
  service?: SupabaseClient;
}) {
  const nowIso = now.toISOString();
  const { data: scheduler, error: schedulerError } = await service.rpc(
    "run_approval_escalation_scheduler",
    { p_run_key: runKey, p_now: nowIso, p_limit: 100 },
  );
  if (schedulerError) {
    throw new Error(`Escalation scheduler failed: ${schedulerError.code || "unknown"}`);
  }

  const config = getEmailDeliveryConfig(env);
  if (!config.live) {
    return {
      scheduler,
      email: { outcome: "disabled", claimed: 0, sent: 0, retry: 0, failed: 0 },
    };
  }

  const workerId = `approval-email:${randomUUID()}`;
  const { data: claimed, error: claimError } = await service.rpc(
    "claim_approval_email_outbox",
    { p_worker_id: workerId, p_now: nowIso, p_limit: 25, p_lease_seconds: 90 },
  );
  if (claimError) {
    throw new Error(`Email outbox claim failed: ${claimError.code || "unknown"}`);
  }

  const totals = { outcome: "completed", claimed: 0, sent: 0, retry: 0, failed: 0 };
  for (const row of (claimed || []) as DurableEmailOutboxRow[]) {
    totals.claimed += 1;
    try {
      const providerMessageId = await sendDurableOutboxEmail({
        row,
        env,
        fetchImpl,
      });
      const { data: completed, error: completeError } = await service.rpc(
        "complete_approval_email_outbox",
        {
          p_outbox_id: row.id,
          p_lease_token: row.lease_token,
          p_provider_message_id: providerMessageId,
          p_now: nowIso,
        },
      );
      if (completeError || !completed) {
        throw new Error("Email outbox lease was lost after provider acceptance.");
      }
      totals.sent += 1;
    } catch (error) {
      const deliveryError = normalizeDeliveryError(error);
      const { data: failureStatus, error: failureError } = await service.rpc(
        "fail_approval_email_outbox",
        {
          p_outbox_id: row.id,
          p_lease_token: row.lease_token,
          p_retryable: deliveryError.retryable,
          p_error_code: deliveryError.code,
          p_error_message: deliveryError.message,
          p_now: nowIso,
        },
      );
      if (failureError) {
        throw new Error(`Email failure persistence failed: ${failureError.code || "unknown"}`);
      }
      if (failureStatus === "retry") totals.retry += 1;
      else totals.failed += 1;
    }
  }
  return { scheduler, email: totals };
}

function createServiceClient(env: OperationEnv) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Server approval database credentials are not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeDeliveryError(error: unknown) {
  if (
    error instanceof Error &&
    "retryable" in error &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  ) {
    return {
      retryable: (error as { retryable: boolean }).retryable,
      code: "provider_status" in error
        ? String((error as { provider_status?: unknown }).provider_status || "provider_error")
        : "provider_error",
      message: error.message,
    };
  }
  return {
    retryable: true,
    code: "provider_transport_error",
    message: error instanceof Error ? error.message : "Unknown email provider error.",
  };
}
