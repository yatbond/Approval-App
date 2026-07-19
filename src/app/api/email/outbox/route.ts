import { type NextRequest } from "next/server";
import { approvalError, approvalJson, createApprovalServerContext } from "@/lib/approval-server";

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, service, cookieSource, correlationId } = resolved.context;
  if (!actor.isAdmin && !actor.effectiveRoles?.includes("superuser")) {
    return approvalJson(cookieSource, correlationId, { error: "Forbidden" }, 403);
  }
  const { data, error } = await service
    .from("approval_email_outbox")
    .select("id,created_at,recipient_email,template_key,status,attempt_count,max_attempts,next_attempt_at,provider_message_id,last_error_message,payload,approval_requests(request_no)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return approvalJson(cookieSource, correlationId, { error: "Unable to load outbox" }, 503);
  return approvalJson(cookieSource, correlationId, { entries: data || [] });
}

export async function POST(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, service, cookieSource, correlationId } = resolved.context;
  if (!actor.isAdmin && !actor.effectiveRoles?.includes("superuser")) {
    return approvalJson(cookieSource, correlationId, { error: "Forbidden" }, 403);
  }
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return approvalJson(cookieSource, correlationId, { error: "Valid outbox id is required" }, 400);
  }
  const { data, error } = await service.rpc("retry_approval_email_outbox", {
    p_outbox_id: body.id,
    p_actor_id: actor.id,
  });
  if (error) return approvalJson(cookieSource, correlationId, { error: "Unable to retry outbox row" }, 503);
  if (!data) return approvalJson(cookieSource, correlationId, { error: "Outbox row is not retryable" }, 409);
  return approvalJson(cookieSource, correlationId, { ok: true });
}
