import type { NextRequest } from "next/server";
import { approvalError, approvalJson, createApprovalServerContext } from "@/lib/approval-server";

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, service, cookieSource, correlationId } = resolved.context;
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 50);
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  const { data, error } = await service
    .from("approval_notifications")
    .select("id,kind,title,body,href,read_at,created_at,approval_requests(request_no)")
    .eq("recipient_id", actor.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    return approvalJson(cookieSource, correlationId, { error: "Unable to load notifications" }, 503);
  }
  return approvalJson(cookieSource, correlationId, {
    notifications: (data || []).map((row) => {
      const request = Array.isArray(row.approval_requests)
        ? row.approval_requests[0]
        : row.approval_requests;
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        time: row.created_at,
        unread: !row.read_at,
        requestId: request?.request_no || "",
        recipientEmail: actor.email,
        kind: row.kind,
        targetTab: row.kind === "action_required" || row.kind === "escalation" ? "queue" : "tracking",
      };
    }),
  });
}

export async function PATCH(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { actor, service, cookieSource, correlationId } = resolved.context;
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
    : [];
  if (body.all !== true && ids.length === 0) {
    return approvalJson(cookieSource, correlationId, { error: "Notification ids are required" }, 400);
  }
  let update = service
    .from("approval_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", actor.id)
    .is("read_at", null);
  if (body.all !== true) update = update.in("id", ids);
  const { error } = await update;
  if (error) {
    return approvalJson(cookieSource, correlationId, { error: "Unable to update notifications" }, 503);
  }
  return approvalJson(cookieSource, correlationId, { ok: true });
}
