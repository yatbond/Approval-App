import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import {
  templateCopilotStoredLedgerSchema,
  type TemplateCopilotStoredLedger,
} from "./template-copilot-facts.ts";
import {
  orderTemplateCopilotMessages,
  templateCopilotSessionKeysetPlan,
  transcriptMessageFromStored,
  type TemplateCopilotSessionSummary,
  type TemplateCopilotTranscript,
} from "./template-copilot-history.ts";
import {
  decodeTemplateCopilotSessionCursor,
  encodeTemplateCopilotSessionCursor,
  TemplateCopilotInvalidSessionCursorError,
} from "./template-copilot-session-pagination.ts";

export async function resolveTemplateCopilotScope({
  service,
  businessUnitId,
  departmentName,
}: {
  service: SupabaseClient;
  businessUnitId: string;
  departmentName: string;
}) {
  const [{ data: business, error: businessError }, departmentResult] =
    await Promise.all([
      service
        .from("business_units")
        .select("id,name,is_active")
        .eq("id", businessUnitId)
        .eq("is_active", true)
        .maybeSingle(),
      service
        .from("business_departments")
        .select("id,business_unit_id,name,is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("name", departmentName)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
  if (businessError) throw businessError;
  if (departmentResult.error) throw departmentResult.error;
  if (!business || !departmentResult.data) return null;
  return {
    businessUnitId: business.id,
    businessName: business.name,
    departmentId: departmentResult.data.id,
    departmentName: departmentResult.data.name,
  };
}

export async function createTemplateCopilotSession({
  service,
  actor,
  clientMessageId,
  ledger,
  assistantMessage,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  clientMessageId: string;
  ledger: TemplateCopilotStoredLedger;
  assistantMessage: string;
}) {
  const { data, error } = await service.rpc(
    "create_template_copilot_session",
    {
      p_actor_id: actor.id,
      p_client_message_id: clientMessageId,
      p_ledger: ledger,
      p_assistant_message: assistantMessage,
    },
  );
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function loadTemplateCopilotSession({
  session,
  sessionId,
  messageCursor,
  messageLimit = 200,
  messageDirection = "forward",
}: {
  session: SupabaseClient;
  sessionId: string;
  messageCursor?: { createdAt: string; id: string } | null;
  messageLimit?: number;
  messageDirection?: "forward" | "tail";
}) {
  const boundedMessageLimit = Math.min(Math.max(Math.trunc(messageLimit), 1), 200);
  let messagesQuery = session
    .from("template_copilot_messages")
    .select("id,client_message_id,role,content,structured_detail,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: messageDirection === "forward" })
    .order("id", { ascending: messageDirection === "forward" })
    .limit(boundedMessageLimit + 1);
  if (messageCursor && messageDirection === "forward") {
    messagesQuery = messagesQuery.or(`created_at.gt.${messageCursor.createdAt},and(created_at.eq.${messageCursor.createdAt},id.gt.${messageCursor.id})`);
  }
  const [{ data: copilotSession, error }, { data: messageRows, error: messagesError }] =
    await Promise.all([
      session
        .from("template_copilot_sessions")
        .select(
          "id,owner_id,family_id,draft_id,status,revision,ledger,model,created_at,updated_at",
        )
        .eq("id", sessionId)
        .maybeSingle(),
      messagesQuery,
    ]);
  if (error) throw error;
  if (messagesError) throw messagesError;
  if (!copilotSession) return null;
  const hasMore = (messageRows || []).length > boundedMessageLimit;
  const pageRows = (messageRows || []).slice(0, boundedMessageLimit);
  const orderedPageRows = orderTemplateCopilotMessages(pageRows);
  const finalRow = pageRows.at(-1);
  return {
    ...copilotSession,
    // Read both ledgers without running v2 logic. A stored v1 session remains
    // a v1 session until an explicit, previewed upgrade is approved server-side.
    ledger: templateCopilotStoredLedgerSchema.parse(copilotSession.ledger),
    messages: orderedPageRows,
    messagePage: {
      limit: boundedMessageLimit,
      hasMore: messageDirection === "forward" && hasMore,
      nextCursor: messageDirection === "forward" && hasMore && finalRow ? encodeTemplateCopilotMessageCursor({ createdAt: finalRow.created_at, id: finalRow.id }) : null,
    },
  };
}

export function decodeTemplateCopilotMessageCursor(value: string | null) {
  if (!value || value.length > 200) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(parsed.createdAt) || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeTemplateCopilotMessageCursor(cursor: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function listTemplateCopilotSessions({
  session,
  service,
  actor,
  view,
  limit,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  view: "mine" | "review";
  limit: number;
}): Promise<TemplateCopilotSessionSummary[]> {
  const page = await listTemplateCopilotSessionPage({ session, service, actor, view, limit });
  return page.sessions;
}

export async function listTemplateCopilotSessionPage({
  session,
  service,
  actor,
  view,
  limit,
  cursor,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  view: "mine" | "review";
  limit: number;
  cursor?: string;
}): Promise<{ sessions: TemplateCopilotSessionSummary[]; page: { limit: number; hasMore: boolean; nextCursor: string | null } }> {
  const decodedCursor = decodeTemplateCopilotSessionCursor(cursor);
  if (cursor && !decodedCursor) throw new TemplateCopilotInvalidSessionCursorError();
  const pagePlan = templateCopilotSessionKeysetPlan({
    view,
    actorId: actor.id,
    cursor: decodedCursor,
  });
  let builder = session
    .from("template_copilot_sessions")
    .select(
      "id,owner_id,family_id,draft_id,status,revision,ledger,model,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (pagePlan.ownerId) {
    builder = builder.eq("owner_id", pagePlan.ownerId);
  }
  if (pagePlan.after) builder = builder.or(pagePlan.after);
  const { data, error } = await builder;
  if (error) throw error;
  const rows = data || [];
  const pageRows = rows.slice(0, limit);

  const ownerIds =
    view === "review"
      ? Array.from(new Set(pageRows.map((row) => row.owner_id)))
      : [];
  const { data: profiles, error: profilesError } = ownerIds.length
    ? await service
        .from("profiles")
        .select("id,email,full_name")
        .in("id", ownerIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profilesById = new Map(
    (profiles || []).map((profile) => [profile.id, profile]),
  );

  const sessions = pageRows.map((row) => {
    const ledger = templateCopilotStoredLedgerSchema.parse(row.ledger);
    const profile = profilesById.get(row.owner_id);
    return {
      id: row.id,
      familyId: row.family_id,
      draftId: row.draft_id,
      status: row.status as TemplateCopilotSessionSummary["status"],
      revision: Number(row.revision),
      model: row.model,
      locale: ledger.locale,
      businessName: ledger.businessName,
      departmentName: ledger.departmentName,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(profile
        ? {
            owner: {
              fullName: profile.full_name,
              email: profile.email,
            },
          }
        : {}),
    };
  });
  const tail = pageRows.at(-1);
  return { sessions, page: { limit, hasMore: rows.length > limit, nextCursor: rows.length > limit && tail ? encodeTemplateCopilotSessionCursor({ createdAt: tail.created_at, id: tail.id }) : null } };
}

export function templateCopilotTranscriptFromStored(
  stored: Awaited<ReturnType<typeof loadTemplateCopilotSession>>,
): TemplateCopilotTranscript | null {
  if (!stored) return null;
  return {
    id: stored.id,
    familyId: stored.family_id,
    draftId: stored.draft_id,
    status: stored.status as TemplateCopilotTranscript["status"],
    revision: Number(stored.revision),
    model: stored.model,
    locale: stored.ledger.locale,
    businessName: stored.ledger.businessName,
    departmentName: stored.ledger.departmentName,
    createdAt: stored.created_at,
    updatedAt: stored.updated_at,
    messages: stored.messages.map(transcriptMessageFromStored),
    messagePage: stored.messagePage,
  };
}

export async function advanceTemplateCopilotSession({
  service,
  actor,
  sessionId,
  expectedRevision,
  clientMessageId,
  userMessage,
  assistantMessage,
  ledger,
  status,
  model,
  structuredDetail = {},
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  sessionId: string;
  expectedRevision: number;
  clientMessageId: string;
  userMessage: string;
  assistantMessage: string;
  ledger: TemplateCopilotStoredLedger;
  status: "interviewing" | "ready";
  model: string;
  structuredDetail?: Record<string, unknown>;
}) {
  const { data, error } = await service.rpc(
    "advance_template_copilot_session",
    {
      p_actor_id: actor.id,
      p_session_id: sessionId,
      p_expected_revision: expectedRevision,
      p_client_message_id: clientMessageId,
      p_user_message: userMessage,
      p_assistant_message: assistantMessage,
      p_ledger: ledger,
      p_status: status,
      p_model: model,
      p_structured_detail: structuredDetail,
    },
  );
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function linkTemplateCopilotDraft({
  service,
  actor,
  sessionId,
  expectedRevision,
  familyId,
  draftId,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  sessionId: string;
  expectedRevision: number;
  familyId: string;
  draftId: string;
}) {
  const { data, error } = await service.rpc("link_template_copilot_draft", {
    p_actor_id: actor.id,
    p_session_id: sessionId,
    p_expected_revision: expectedRevision,
    p_family_id: familyId,
    p_draft_id: draftId,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}
