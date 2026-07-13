import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const attachmentBucket = "approval-documents";

async function getOwnedAttachment(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in before accessing documents.", status: 401 } as const;
  }

  const storagePath = request.nextUrl.searchParams.get("path")?.trim() || "";
  if (!storagePath || !storagePath.startsWith(`${user.id}/`)) {
    return { error: "The stored document path is invalid.", status: 403 } as const;
  }

  return { supabase, storagePath } as const;
}

export async function GET(request: NextRequest) {
  const attachment = await getOwnedAttachment(request);
  if ("error" in attachment) {
    return NextResponse.json(
      { error: attachment.error },
      { status: attachment.status },
    );
  }

  const { data, error } = await attachment.supabase.storage
    .from(attachmentBucket)
    .download(attachment.storagePath);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Stored document was not found." },
      { status: 404 },
    );
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": data.type || "application/octet-stream",
    },
  });
}

export async function DELETE(request: NextRequest) {
  const attachment = await getOwnedAttachment(request);
  if ("error" in attachment) {
    return NextResponse.json(
      { error: attachment.error },
      { status: attachment.status },
    );
  }

  const { error } = await attachment.supabase.storage
    .from(attachmentBucket)
    .remove([attachment.storagePath]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
