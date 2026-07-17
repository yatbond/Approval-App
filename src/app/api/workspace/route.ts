import { NextResponse, type NextRequest } from "next/server";
import {
  deactivateWorkspaceAdminRecord,
  loadNormalizedWorkspaceState,
  saveNormalizedWorkspaceState,
  type WorkspaceAdminDeactivation,
} from "@/lib/normalized-workspace-store";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  getSupabaseRouteUser,
  type SupabaseRouteUser,
} from "@/lib/supabase/route-user";
import { parseWorkspaceState, serializeWorkspaceState } from "@/lib/workspace-persistence";
import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";
import { mergeExternalFormWorkspaceState } from "@/lib/external-form-workspace-merge";
import { createWorkspaceSnapshotHash } from "@/lib/workspace-snapshot-hash";
import { buildWorkspaceSampleAssetPlan } from "@/lib/workspace-sample-assets";
import { recordWorkflowOperationEvent } from "@/lib/workflow-operation-monitor";

const workspaceAssetBucket = "approval-documents";

type WorkspaceSaveMonitoring = {
  payloadBytes: number;
  persistedBytes: number;
  durationMs: number;
  unchanged: boolean;
  assetsUploaded: number;
  removedBase64Bytes: number;
};

type WorkspacePayload = {
  mode: "supabase";
  source: "normalized" | "snapshot";
  snapshot: WorkspaceStateSnapshot | null;
  snapshotBackup?: "saved" | "failed";
  unchanged?: boolean;
  reason?: string;
  monitoring?: WorkspaceSaveMonitoring;
};

type WorkspaceSavePayload =
  | WorkspacePayload
  | { mode: "local"; reason: string; unchanged?: false };

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return NextResponse.json({ mode: "local", snapshot: null });
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
          formLibrary: fallbackSnapshot?.formLibrary || [],
        },
      };
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
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return NextResponse.json({ mode: "local", reason: "Not signed in" });
  }

  const bodyText = await request.text();
  const payloadBytes = Buffer.byteLength(bodyText);
  let body: { snapshot?: unknown };
  try {
    body = JSON.parse(bodyText) as { snapshot?: unknown };
  } catch {
    return NextResponse.json(
      { mode: "local", reason: "Invalid workspace request" },
      { status: 400 },
    );
  }
  const serializedSnapshot = JSON.stringify(body.snapshot);
  const parsedIncomingSnapshot = serializedSnapshot
    ? parseWorkspaceState(serializedSnapshot)
    : null;
  if (!parsedIncomingSnapshot) {
    return NextResponse.json(
      { mode: "local", reason: "Invalid workspace snapshot" },
      { status: 400 },
    );
  }

  const assetPlan = buildWorkspaceSampleAssetPlan(parsedIncomingSnapshot, user.id);
  const incomingSnapshot = assetPlan.snapshot;
  let persistedBytes = Buffer.byteLength(serializeWorkspaceState(incomingSnapshot));
  let assetsUploaded = 0;
  const finishSave = async (payload: WorkspaceSavePayload, status = 200) => {
    const monitoring: WorkspaceSaveMonitoring = {
      payloadBytes,
      persistedBytes,
      durationMs: Date.now() - startedAt,
      unchanged: Boolean(payload.unchanged),
      assetsUploaded,
      removedBase64Bytes: assetPlan.removedBase64Bytes,
    };
    const logEntry = {
      event: "workspace_autosave",
      outcome: status >= 400 ? "failed" : "saved",
      status,
      requestId: request.headers.get("x-vercel-id") || "local",
      ...monitoring,
    };
    if (status >= 400) {
      console.error(JSON.stringify(logEntry));
    } else {
      console.info(JSON.stringify(logEntry));
    }
    await recordWorkflowOperationEvent(supabase, {
      ownerUserId: user.id,
      ownerEmail: user.email,
      operationType: "autosave",
      outcome:
        status >= 400 ? "failed" : payload.unchanged ? "skipped" : "succeeded",
      durationMs: monitoring.durationMs,
      message:
        status >= 400
          ? payload.reason || "Workspace autosave failed."
          : payload.unchanged
            ? "No workspace changes to save."
            : "Workspace saved.",
      details: {
        status,
        payloadBytes: monitoring.payloadBytes,
        persistedBytes: monitoring.persistedBytes,
        assetsUploaded: monitoring.assetsUploaded,
        removedBase64Bytes: monitoring.removedBase64Bytes,
        source: "source" in payload ? payload.source : "local",
        snapshotBackup:
          "snapshotBackup" in payload ? payload.snapshotBackup || null : null,
      },
    });
    return NextResponse.json({ ...payload, monitoring }, { status });
  };

  const incomingSnapshotHash = createWorkspaceSnapshotHash(incomingSnapshot);
  const { data: snapshotMetadata, error: snapshotMetadataError } = await supabase
    .from("workspace_snapshots")
    .select("snapshot_hash")
    .eq("owner_email", user.email)
    .maybeSingle();

  if (snapshotMetadataError) {
    return finishSave(
      { mode: "local", reason: snapshotMetadataError.message },
      503,
    );
  }

  if (snapshotMetadata?.snapshot_hash === incomingSnapshotHash) {
    const payload: WorkspacePayload = {
      mode: "supabase",
      source: "normalized",
      snapshotBackup: "saved",
      unchanged: true,
      snapshot: incomingSnapshot,
    };
    return finishSave(payload);
  }

  if (assetPlan.assets.length) {
    const uploadResults = await Promise.all(
      assetPlan.assets.map((asset) =>
        supabase.storage
          .from(workspaceAssetBucket)
          .upload(asset.storagePath, asset.bytes, {
            contentType: asset.contentType,
            upsert: true,
          }),
      ),
    );
    const failedUpload = uploadResults.find((result) => result.error);
    if (failedUpload?.error) {
      return finishSave(
        { mode: "local", reason: failedUpload.error.message },
        503,
      );
    }
    assetsUploaded = assetPlan.assets.length;
  }

  let persistedSnapshot: WorkspaceStateSnapshot | null = null;
  try {
    persistedSnapshot = await loadNormalizedWorkspaceState(
      supabase,
      incomingSnapshot.selectedTemplateId,
    );
  } catch {
    // The normal save path below still reports database failures.
  }
  const snapshot = mergeExternalFormWorkspaceState(incomingSnapshot, persistedSnapshot);
  const snapshotHash = createWorkspaceSnapshotHash(snapshot);
  persistedBytes = Buffer.byteLength(serializeWorkspaceState(snapshot));

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
    return finishSave(payload, snapshotSave.error ? 503 : 200);
  }

  if (snapshotSave.error) {
    const payload: WorkspacePayload = {
      mode: "supabase",
      source: "normalized",
      snapshotBackup: "failed",
      reason: snapshotSave.error.message,
      snapshot,
    };
    return finishSave(payload);
  }

  const hashSave = await saveWorkspaceSnapshotHash(supabase, user, snapshotHash);
  if (hashSave.error) {
    const payload: WorkspacePayload = {
      mode: "supabase",
      source: "normalized",
      snapshotBackup: "saved",
      reason: hashSave.error.message,
      snapshot,
    };
    return finishSave(payload);
  }

  const payload: WorkspacePayload = {
    mode: "supabase",
    source: "normalized",
    snapshotBackup: "saved",
    snapshot,
  };
  return finishSave(payload);
}

export async function PATCH(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return NextResponse.json(
      { mode: "local", reason: "Not signed in" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as {
    action?: string;
    record?: unknown;
  };
  if (body.action !== "deactivate_admin_record") {
    return NextResponse.json(
      { mode: "local", reason: "Unsupported workspace action" },
      { status: 400 },
    );
  }

  const record = parseAdminDeactivation(body.record);
  if (!record) {
    return NextResponse.json(
      { mode: "local", reason: "Invalid admin deactivation record" },
      { status: 400 },
    );
  }

  try {
    await deactivateWorkspaceAdminRecord(supabase, record);
    return NextResponse.json({ mode: "supabase" });
  } catch (error) {
    return NextResponse.json(
      {
        mode: "local",
        reason:
          error instanceof Error ? error.message : "Admin deactivation failed",
      },
      { status: 503 },
    );
  }
}

async function saveWorkspaceSnapshot(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  user: SupabaseRouteUser,
  snapshot: WorkspaceStateSnapshot,
) {
  return supabase.from("workspace_snapshots").upsert(
    {
      owner_user_id: user.id,
      owner_email: user.email,
      snapshot: JSON.parse(serializeWorkspaceState(snapshot)),
      snapshot_hash: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_email" },
  );
}

function saveWorkspaceSnapshotHash(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  user: SupabaseRouteUser,
  snapshotHash: string,
) {
  return supabase
    .from("workspace_snapshots")
    .update({ snapshot_hash: snapshotHash })
    .eq("owner_email", user.email);
}

function parseAdminDeactivation(value: unknown): WorkspaceAdminDeactivation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.type === "business" && typeof record.businessId === "string") {
    return { type: "business", businessId: record.businessId };
  }

  if (
    record.type === "department" &&
    typeof record.businessId === "string" &&
    typeof record.departmentName === "string"
  ) {
    return {
      type: "department",
      businessId: record.businessId,
      departmentName: record.departmentName,
    };
  }

  if (
    record.type === "template" &&
    typeof record.templateKey === "string" &&
    typeof record.versionNumber === "number"
  ) {
    return {
      type: "template",
      templateKey: record.templateKey,
      versionNumber: record.versionNumber,
    };
  }

  return null;
}
