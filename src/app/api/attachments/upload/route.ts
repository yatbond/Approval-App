import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const attachmentBucket = "approval-documents";

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json(
      { error: "Sign in before uploading documents." },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No document file was provided." },
      { status: 400 },
    );
  }

  const documentId = String(formData.get("documentId") || "ad-hoc");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  const storagePath = `${user.id}/${documentId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(attachmentBucket)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({
    bucket: attachmentBucket,
    storagePath,
  });
}
