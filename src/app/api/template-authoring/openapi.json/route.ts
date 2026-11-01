import { templateAuthoringOpenApi } from "@/lib/template-authoring-openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(templateAuthoringOpenApi, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
