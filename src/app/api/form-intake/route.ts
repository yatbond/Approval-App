import { createClient } from "@supabase/supabase-js";
import {
  isAuthorizedFormIntake,
  parseExternalFormIntake,
} from "@/lib/external-form-intake";

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
  const { data, error } = await supabase
    .from("external_form_submissions")
    .insert({
      provider: intake.provider,
      form_key: intake.formKey,
      external_form_id: intake.externalFormId,
      external_response_id: intake.externalResponseId,
      response_mode: intake.responseMode,
      correlation_token: intake.correlationToken || null,
      respondent_name: intake.respondentName || null,
      respondent_email: intake.respondentEmail || null,
      answers: intake.answers,
      attachments: intake.attachments,
    })
    .select("id,status")
    .single();

  if (error?.code === "23505") {
    return Response.json({ accepted: true, duplicate: true });
  }
  if (error) {
    return Response.json(
      { accepted: false, reason: "Unable to store form response." },
      { status: 503 },
    );
  }
  return Response.json(
    { accepted: true, submissionId: data.id, status: data.status },
    { status: 202 },
  );
}
