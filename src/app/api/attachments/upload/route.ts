import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseJsonResponse } from "@/lib/supabase/route-response";
import { readBoundedFormData } from "@/lib/bounded-request";

const attachmentBucket = "approval-documents";
const maximumAttachmentBytes = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return createSupabaseJsonResponse(response,
      { error: "Sign in before uploading documents." },
      { status: 401 },
    );
  }

  const body = await readBoundedFormData(request, maximumAttachmentBytes + 1024 * 1024);
  if (!body.ok) {
    return createSupabaseJsonResponse(response,
      { error: body.reason === "too_large" ? "Upload exceeds the request limit." : "Invalid upload form." },
      { status: body.reason === "too_large" ? 413 : 400 },
    );
  }
  const formData = body.value;
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return createSupabaseJsonResponse(response,
      { error: "No document file was provided." },
      { status: 400 },
    );
  }
  if (file.size > maximumAttachmentBytes) {
    return createSupabaseJsonResponse(response,
      { error: "Document exceeds the 25 MB upload limit." },
      { status: 413 },
    );
  }

  const documentId = String(formData.get("documentId") || "ad-hoc")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 120) || "ad-hoc";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  const storagePath = `${user.id}/${documentId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(attachmentBucket)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (error) {
    return createSupabaseJsonResponse(response, { error: error.message }, { status: 503 });
  }

  return createSupabaseJsonResponse(response, {
    bucket: attachmentBucket,
    storagePath,
  });
}
