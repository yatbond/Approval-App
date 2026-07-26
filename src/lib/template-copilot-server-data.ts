import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import {
  templateCopilotLedgerSchema,
  type TemplateCopilotLedger,
} from "./template-copilot-ledger.ts";
import {
  orderTemplateCopilotMessages,
  transcriptMessageFromStored,
  type TemplateCopilotSessionSummary,
  type TemplateCopilotTranscript,
} from "./template-copilot-history.ts";

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
  ledger: TemplateCopilotLedger;
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
}: {
  session: SupabaseClient;
  sessionId: string;
}) {
  const [{ data: copilotSession, error }, { data: messages, error: messagesError }] =
    await Promise.all([
      session
        .from("template_copilot_sessions")
        .select(
          "id,owner_id,family_id,draft_id,status,revision,ledger,model,created_at,updated_at",
        )
        .eq("id", sessionId)
        .maybeSingle(),
      session
        .from("template_copilot_messages")
        .select("id,client_message_id,role,content,structured_detail,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
  if (error) throw error;
  if (messagesError) throw messagesError;
  if (!copilotSession) return null;
  return {
    ...copilotSession,
    ledger: templateCopilotLedgerSchema.parse(copilotSession.ledger),
    messages: orderTemplateCopilotMessages(messages || []),
  };
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
  let builder = session
    .from("template_copilot_sessions")
    .select(
      "id,owner_id,family_id,draft_id,status,revision,ledger,model,created_at,updated_at",
    )
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (view === "mine") {
    builder = builder.eq("owner_id", actor.id);
  }
  const { data, error } = await builder;
  if (error) throw error;
  const rows = data || [];

  const ownerIds =
    view === "review"
      ? Array.from(new Set(rows.map((row) => row.owner_id)))
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

  return rows.map((row) => {
    const ledger = templateCopilotLedgerSchema.parse(row.ledger);
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
  ledger: TemplateCopilotLedger;
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
