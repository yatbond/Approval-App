import { NextResponse, type NextRequest } from "next/server";
import {
  loadNormalizedWorkspaceState,
  saveNormalizedWorkspaceState,
} from "@/lib/normalized-workspace-store";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { parseWorkspaceState, serializeWorkspaceState } from "@/lib/workspace-persistence";
import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";

type WorkspaceRouteUser = {
  id: string;
  email: string;
};

type WorkspacePayload = {
  mode: "supabase";
  source: "normalized" | "snapshot";
  snapshot: WorkspaceStateSnapshot | null;
  snapshotBackup?: "saved" | "failed";
  reason?: string;
};

const workspacePayloadCache = new Map<
  string,
  { expiresAt: number; payload: WorkspacePayload }
>();
const workspacePayloadCacheTtlMs = 10_000;

async function getWorkspaceRouteUser(supabase: ReturnType<typeof createSupabaseRouteClient>) {
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

function readWorkspacePayloadCache(email: string) {
  const cached = workspacePayloadCache.get(email);
  if (!cached || Date.now() >= cached.expiresAt) {
    return null;
  }
  return cached.payload;
}

function writeWorkspacePayloadCache(email: string, payload: WorkspacePayload) {
  workspacePayloadCache.set(email, {
    payload,
    expiresAt: Date.now() + workspacePayloadCacheTtlMs,
  });
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getWorkspaceRouteUser(supabase);

  if (!user) {
    return NextResponse.json({ mode: "local", snapshot: null });
  }

  const cachedPayload = readWorkspacePayloadCache(user.email);
  if (cachedPayload) {
    return NextResponse.json(cachedPayload);
  }

  const { data, error } = await supabase
    .from("workspace_snapshots")
    .select("snapshot")
    .eq("owner_email", user.email)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { mode: "local", snapshot: null, reason: error.message },
      { status: 503 },
    );
  }

  const fallbackSnapshot = data?.snapshot
    ? parseWorkspaceState(JSON.stringify(data.snapshot))
    : null;

  try {
    const normalizedSnapshot = await loadNormalizedWorkspaceState(
      supabase,
      fallbackSnapshot?.selectedTemplateId || "",
    );

    if (normalizedSnapshot) {
      const payload: WorkspacePayload = {
        mode: "supabase",
        source: "normalized",
        snapshot: {
          ...normalizedSnapshot,
          userRoleAssignments: fallbackSnapshot?.userRoleAssignments || [],
        },
      };
      writeWorkspacePayloadCache(user.email, payload);
      return NextResponse.json(payload);
    }
  } catch (normalizedError) {
    if (!fallbackSnapshot) {
      return NextResponse.json(
        {
          mode: "local",
          snapshot: null,
          reason:
            normalizedError instanceof Error
              ? normalizedError.message
              : "Normalized load failed",
        },
        { status: 503 },
      );
    }
  }

  const payload: WorkspacePayload = {
    mode: "supabase",
    source: "snapshot",
    snapshot: fallbackSnapshot,
  };
  writeWorkspacePayloadCache(user.email, payload);
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getWorkspaceRouteUser(supabase);

  if (!user) {
    return NextResponse.json({ mode: "local", reason: "Not signed in" });
  }

  const body = (await request.json()) as { snapshot?: unknown };
  const serializedSnapshot = JSON.stringify(body.snapshot);
  const snapshot = serializedSnapshot ? parseWorkspaceState(serializedSnapshot) : null;
  if (!snapshot) {
    return NextResponse.json(
      { mode: "local", reason: "Invalid workspace snapshot" },
      { status: 400 },
    );
  }

  const snapshotSave = await saveWorkspaceSnapshot(supabase, user, snapshot);

  try {
    await saveNormalizedWorkspaceState(supabase, snapshot, {
      id: user.id,
      email: user.email,
    });
  } catch (normalizedError) {
    const payload: WorkspacePayload = {
      mode: "supabase",
      source: "snapshot",
      snapshotBackup: snapshotSave.error ? "failed" : "saved",
      reason:
        normalizedError instanceof Error
          ? normalizedError.message
          : "Normalized save failed",
      snapshot,
    };
    writeWorkspacePayloadCache(user.email, payload);
    return NextResponse.json(payload, {
      status: snapshotSave.error ? 503 : 200,
    });
  }

  if (snapshotSave.error) {
    const payload: WorkspacePayload = {
      mode: "supabase",
      source: "normalized",
      snapshotBackup: "failed",
      reason: snapshotSave.error.message,
      snapshot,
    };
    writeWorkspacePayloadCache(user.email, payload);
    return NextResponse.json(payload);
  }

  const payload: WorkspacePayload = {
    mode: "supabase",
    source: "normalized",
    snapshotBackup: "saved",
    snapshot,
  };
  writeWorkspacePayloadCache(user.email, payload);
  return NextResponse.json(payload);
}

async function saveWorkspaceSnapshot(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  user: WorkspaceRouteUser,
  snapshot: WorkspaceStateSnapshot,
) {
  return supabase.from("workspace_snapshots").upsert(
    {
      owner_user_id: user.id,
      owner_email: user.email,
      snapshot: JSON.parse(serializeWorkspaceState(snapshot)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_email" },
  );
}
