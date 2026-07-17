import { createClient } from "@supabase/supabase-js";
import {
  isAuthorizedFormIntake,
  parseExternalFormIntake,
} from "@/lib/external-form-intake";
import { processExternalFormIntake } from "@/lib/external-form-processing";
import { extractExternalFormAttachmentAnswers } from "@/lib/external-form-attachment-extraction";
import { saveNormalizedWorkspaceState } from "@/lib/normalized-workspace-store";
import { parseWorkspaceState, serializeWorkspaceState } from "@/lib/workspace-persistence";
import { createWorkspaceSnapshotHash } from "@/lib/workspace-snapshot-hash";

export async function GET() {
  const configured = Boolean(
    process.env.FORM_INTAKE_WEBHOOK_SECRET &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return Response.json({
    provider: "microsoft_forms",
    configured,
    endpoint: "/api/form-intake",
  });
}

export async function POST(request: Request) {
  const secret = process.env.FORM_INTAKE_WEBHOOK_SECRET;
  if (!secret || secret.length < 24) {
    return Response.json(
      { accepted: false, reason: "Form intake is not configured." },
      { status: 503 },
    );
  }
  if (!isAuthorizedFormIntake(request.headers.get("authorization"), secret)) {
    return Response.json({ accepted: false, reason: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ accepted: false, reason: "Invalid JSON." }, { status: 400 });
  }
  const parsed = parseExternalFormIntake(body);
  if (!parsed.success) {
    return Response.json(
      {
        accepted: false,
        reason: "Invalid form response payload.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { accepted: false, reason: "Form intake storage is not configured." },
      { status: 503 },
    );
  }
  const intake = parsed.data;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const markSubmissionFailed = async (
    submissionId: string,
    status: "failed" | "schema_changed",
    message: string,
  ) => {
    await supabase
      .from("external_form_submissions")
      .update({ status, error_message: message, processed_at: new Date().toISOString() })
      .eq("id", submissionId);
  };
  const { data, error } = await supabase
    .from("external_form_submissions")
    .insert({
      provider: intake.provider,
      workspace_owner_email: intake.workspaceOwnerEmail,
      form_key: intake.formKey,
      form_version: intake.formVersion,
      external_form_id: intake.externalFormId,
      external_response_id: intake.externalResponseId,
      response_mode: intake.responseMode,
      schema_fingerprint: intake.schemaFingerprint,
      approval_request_no: intake.approvalRequestNo || null,
      form_modified_at: intake.formModifiedAt || null,
      correlation_token: intake.correlationToken || null,
      respondent_name: intake.respondentName || null,
      respondent_email: intake.respondentEmail || null,
      answers: intake.answers,
      attachments: intake.attachments,
    })
    .select("id,status")
    .single();

  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("external_form_submissions")
      .select("id,status,error_message,result")
      .eq("provider", intake.provider)
      .eq("external_form_id", intake.externalFormId)
      .eq("external_response_id", intake.externalResponseId)
      .maybeSingle();
    return Response.json({ accepted: true, duplicate: true, submission: existing || null });
  }
  if (error) {
    return Response.json(
      { accepted: false, reason: "Unable to store form response." },
      { status: 503 },
    );
  }
  const { data: workspaceRow, error: workspaceError } = await supabase
    .from("workspace_snapshots")
    .select("owner_user_id,owner_email,snapshot")
    .eq("owner_email", intake.workspaceOwnerEmail)
    .maybeSingle();
  const snapshot = workspaceRow?.snapshot
    ? parseWorkspaceState(JSON.stringify(workspaceRow.snapshot))
    : null;
  if (workspaceError || !workspaceRow || !snapshot) {
    await markSubmissionFailed(
      data.id,
      "failed",
      workspaceError?.message || "The target workspace could not be loaded.",
    );
    return Response.json(
      { accepted: false, submissionId: data.id, reason: "The target workspace could not be loaded." },
      { status: 422 },
    );
  }

  const definition = snapshot.formLibrary.find(
    (item) =>
      item.formKey === intake.formKey &&
      item.version === intake.formVersion &&
      item.source === "microsoft_forms",
  );
  const canExtractAttachments = Boolean(
    definition &&
      definition.status === "ready" &&
      definition.externalFormId === intake.externalFormId &&
      definition.schemaFingerprint === intake.schemaFingerprint &&
      definition.responseMode === intake.responseMode,
  );
  const extractionResult = definition && canExtractAttachments
    ? await extractExternalFormAttachmentAnswers({ definition, intake })
    : { success: true as const, answers: {} };
  if (!extractionResult.success) {
    await markSubmissionFailed(data.id, "failed", extractionResult.message);
    return Response.json(
      {
        accepted: false,
        submissionId: data.id,
        status: "failed",
        reason: extractionResult.message,
      },
      { status: 422 },
    );
  }

  const result = processExternalFormIntake({
    snapshot,
    intake,
    attachmentExtractionAnswers: extractionResult.answers,
  });
  if (!result.success) {
    await markSubmissionFailed(data.id, result.status, result.message);
    return Response.json(
      {
        accepted: false,
        submissionId: data.id,
        status: result.status,
        reason: result.message,
      },
      { status: 422 },
    );
  }

  try {
    await saveNormalizedWorkspaceState(supabase, result.snapshot, {
      id: workspaceRow.owner_user_id,
      email: workspaceRow.owner_email,
    });
    const { error: snapshotError } = await supabase
      .from("workspace_snapshots")
      .update({
        snapshot: JSON.parse(serializeWorkspaceState(result.snapshot)),
        snapshot_hash: createWorkspaceSnapshotHash(result.snapshot),
        updated_at: new Date().toISOString(),
      })
      .eq("owner_email", workspaceRow.owner_email);
    if (snapshotError) throw snapshotError;
  } catch (processingError) {
    const message =
      processingError instanceof Error
        ? processingError.message
        : "The form response could not update the approval workspace.";
    await markSubmissionFailed(data.id, "failed", message);
    return Response.json(
      { accepted: false, submissionId: data.id, status: "failed", reason: message },
      { status: 503 },
    );
  }

  const processedAt = new Date().toISOString();
  await supabase
    .from("external_form_submissions")
    .update({
      status: "processed",
      approval_request_no: result.requestNo,
      result: { requestNo: result.requestNo, message: result.message },
      error_message: null,
      processed_at: processedAt,
    })
    .eq("id", data.id);
  return Response.json({
    accepted: true,
    submissionId: data.id,
    status: "processed",
    requestNo: result.requestNo,
    message: result.message,
  });
}
