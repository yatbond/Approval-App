import { NextResponse, type NextRequest } from "next/server";
import {
  buildSavedUploadRequestDraft,
  parseUploadRequestDraftList,
  type SavedUploadRequestDraft,
} from "@/lib/upload-request-draft-state";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type UploadDraftRouteUser = {
  id: string;
  email: string;
};

type UploadDraftRow = {
  id: string;
  owner_user_id: string;
  owner_email: string;
  title: string;
  draft_kind?: SavedUploadRequestDraft["draftKind"];
  draft_payload: unknown;
  updated_at: string;
};

async function getUploadDraftRouteUser(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
) {
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;

  if (!claimsError && claims?.sub && claims.email) {
    return {
      id: claims.sub,
      email: claims.email,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ? { id: user.id, email: user.email } : null;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getUploadDraftRouteUser(supabase);

  if (!user) {
    return NextResponse.json(
      { error: "Sign in before loading drafts." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("upload_request_drafts")
    .select("id,owner_user_id,owner_email,title,draft_kind,draft_payload,updated_at")
    .order("updated_at", { ascending: false })
    .returns<UploadDraftRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({
    drafts: (data || []).map((row) => rowToSavedDraft(row, user)).filter(Boolean),
  });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getUploadDraftRouteUser(supabase);

  if (!user) {
    return NextResponse.json(
      { error: "Sign in before saving drafts." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as { draft?: unknown };
  const parsedDraft = parseUploadRequestDraftList(JSON.stringify([body.draft]))[0];
  if (!parsedDraft) {
    return NextResponse.json({ error: "Invalid upload draft." }, { status: 400 });
  }

  const savedDraft = buildSavedUploadRequestDraft({
    draft: parsedDraft.draft,
    id: parsedDraft.id,
    title: parsedDraft.title,
    createdByEmail: user.email,
    createdByUserId: user.id,
    savedAt: new Date().toISOString(),
  });
  const { data, error } = await supabase
    .from("upload_request_drafts")
    .upsert(
      {
        id: savedDraft.id,
        owner_user_id: user.id,
        owner_email: user.email,
        title: savedDraft.title,
        draft_kind: savedDraft.draftKind,
        selected_template_id: savedDraft.draft.selectedTemplateId,
        draft_payload: savedDraft.draft,
        updated_at: savedDraft.savedAt,
      },
      { onConflict: "id" },
    )
    .select("id,owner_user_id,owner_email,title,draft_kind,draft_payload,updated_at")
    .single<UploadDraftRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({
    draft: rowToSavedDraft(data, user),
  });
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getUploadDraftRouteUser(supabase);

  if (!user) {
    return NextResponse.json(
      { error: "Sign in before deleting drafts." },
      { status: 401 },
    );
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing upload draft id." }, { status: 400 });
  }

  const { error } = await supabase
    .from("upload_request_drafts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

function rowToSavedDraft(
  row: UploadDraftRow,
  user: UploadDraftRouteUser,
): SavedUploadRequestDraft | null {
  const parsedDraft = parseUploadRequestDraftList(
    JSON.stringify([
      {
        id: row.id,
        title: row.title,
        createdByEmail: row.owner_email,
        createdByUserId: row.owner_user_id,
        draftKind: row.draft_kind || "named",
        savedAt: row.updated_at,
        draft: row.draft_payload,
      },
    ]),
  )[0];

  if (!parsedDraft || parsedDraft.createdByUserId !== user.id) {
    return null;
  }

  return parsedDraft;
}
