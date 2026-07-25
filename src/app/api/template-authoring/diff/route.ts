import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { templateDiffCommandSchema } from "@/lib/template-authoring-api-contracts";
import { diffTemplateDefinitions } from "@/lib/template-authoring-validation";

export async function POST(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { cookieSource, correlationId } = resolved.context;
  const body = await readBoundedJson(request, 4_000_000);
  const parsed = body.ok ? templateDiffCommandSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_request",
          message: "The diff payload is invalid.",
        },
      },
      400,
    );
  }
  return approvalJson(cookieSource, correlationId, {
    diff: diffTemplateDefinitions(parsed.data.before, parsed.data.after),
  });
}
