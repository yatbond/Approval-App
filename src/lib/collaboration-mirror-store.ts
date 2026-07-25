import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalTask } from "./types.ts";
import type { TaskNotification } from "./workflow-system.ts";

type SupabaseError = {
  message: string;
};

type SupabaseMutationResult = {
  error: SupabaseError | null;
};

type SupabaseLike = Pick<SupabaseClient, "from">;

export async function saveCollaborationMirrorState(
  supabase: SupabaseLike,
  task: ApprovalTask,
  notifications: TaskNotification[],
): Promise<void> {
  await upsertRows(
    supabase,
    "workflow_collaboration_requests",
    (task.collaborationRequests || []).map((request) => ({
      id: request.id,
      approval_request_no: task.id,
      contributor_email: request.contributorEmail,
      contributor_name: request.contributorName,
      requested_by_email: request.requestedByEmail,
      status: request.status,
      due_at: request.dueAt || null,
      blocks_approval: request.blocksApproval !== false,
      payload: request,
      created_at: timestampOrNull(request.createdAt),
      updated_at: new Date().toISOString(),
    })),
  );
  await upsertRows(
    supabase,
    "workflow_shared_fulfillments",
    (task.sharedFulfillments || []).map((fulfillment) => ({
      id: fulfillment.id,
      approval_request_no: task.id,
      requirement_node_id: fulfillment.requirementNodeId,
      document_id: fulfillment.documentId,
      document_type: fulfillment.documentType,
      assigned_submitter_email: fulfillment.assignedSubmitterEmail,
      uploader_email: fulfillment.uploaderEmail,
      attachment_id: fulfillment.attachmentId,
      status: fulfillment.status,
      required: fulfillment.required,
      payload: fulfillment,
      created_at: timestampOrNull(fulfillment.submittedAt),
      updated_at: new Date().toISOString(),
    })),
  );
  await upsertRows(
    supabase,
    "workflow_correction_requests",
    (task.correctionRequests || []).map((request) => ({
      id: request.id,
      approval_request_no: task.id,
      shared_fulfillment_id: request.sharedFulfillmentId,
      requested_by_email: request.requestedByEmail,
      assigned_submitter_email: request.assignedSubmitterEmail,
      uploader_email: request.uploaderEmail,
      status: request.status,
      blocks_approval: request.blocksApproval,
      rejection_note: request.rejectionNote,
      payload: request,
      created_at: timestampOrNull(request.createdAt),
      updated_at: new Date().toISOString(),
    })),
  );
  await upsertRows(
    supabase,
    "workflow_notification_events",
    notifications.map((notification) => ({
      id: notification.id,
      approval_request_no: task.id,
      recipient_email: notification.recipientEmail,
      title: notification.title,
      body: notification.body,
      kind: notification.kind,
      payload: notification,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  );
}

async function upsertRows(
  supabase: SupabaseLike,
  table: string,
  rows: Record<string, unknown>[],
) {
  if (!rows.length) {
    return;
  }

  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: "id" }) as SupabaseMutationResult;
  if (error) {
    throw new Error(`${table} mirror failed: ${error.message}`);
  }
}

function timestampOrNull(value: string | undefined) {
  return value || null;
}
