import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  copySupabaseResponseCookies,
  createSupabaseJsonResponse,
} from "@/lib/supabase/route-response";

const attachmentBucket = "approval-documents";

async function getOwnedAttachment(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { response, error: "Sign in before accessing documents.", status: 401 } as const;
  }

  const storagePath = request.nextUrl.searchParams.get("path")?.trim() || "";
  if (!storagePath || !storagePath.startsWith(`${user.id}/`)) {
    return { response, error: "The stored document path is invalid.", status: 403 } as const;
  }

  return { response, supabase, storagePath } as const;
}

export async function GET(request: NextRequest) {
  const attachment = await getOwnedAttachment(request);
  if ("error" in attachment) {
    return createSupabaseJsonResponse(
      attachment.response,
      { error: attachment.error },
      { status: attachment.status },
    );
  }

  const { data, error } = await attachment.supabase.storage
    .from(attachmentBucket)
    .download(attachment.storagePath);
  if (error || !data) {
    return createSupabaseJsonResponse(
      attachment.response,
      { error: error?.message || "Stored document was not found." },
      { status: 404 },
    );
  }

  return copySupabaseResponseCookies(
    attachment.response,
    new NextResponse(await data.arrayBuffer(), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": data.type || "application/octet-stream",
      },
    }),
  );
}

export async function DELETE(request: NextRequest) {
  const attachment = await getOwnedAttachment(request);
  if ("error" in attachment) {
    return createSupabaseJsonResponse(
      attachment.response,
      { error: attachment.error },
      { status: attachment.status },
    );
  }

  const { error } = await attachment.supabase.storage
    .from(attachmentBucket)
    .remove([attachment.storagePath]);
  if (error) {
    return createSupabaseJsonResponse(
      attachment.response,
      { error: error.message },
      { status: 503 },
    );
  }

  return createSupabaseJsonResponse(attachment.response, { ok: true });
}
