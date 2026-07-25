import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { z } from "zod";
import { generateTemplateAuthoringArtifacts } from "@/lib/template-copilot-ai";
import {
  linkTemplateCopilotDraft,
  loadTemplateCopilotSession,
} from "@/lib/template-copilot-server-data";
import {
  createTemplateAuthoringFamily,
  findInactiveFixedTemplateEmails,
  loadTemplateAuthoringDraft,
} from "@/lib/template-authoring-server-data";
import { validateTemplateAuthoringDefinition } from "@/lib/template-authoring-validation";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";

const commandSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  const { sessionId } = await context.params;
  const body = await readBoundedJson(request, 16_000);
  const parsed = body.ok ? commandSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The draft command is invalid." } },
      400,
    );
  }

  try {
    const current = await loadTemplateCopilotSession({ session, sessionId });
    if (!current) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "not_found", message: "The Copilot session was not found." } },
        404,
      );
    }
    if (
      current.status === "draft_created" &&
      current.family_id &&
      current.draft_id
    ) {
      const existingDraft = await loadTemplateAuthoringDraft(
        session,
        current.draft_id,
      );
      if (existingDraft) {
        return approvalJson(cookieSource, correlationId, {
          outcome: "replayed",
          sessionId,
          revision: current.revision,
          status: current.status,
          familyId: current.family_id,
          draftId: current.draft_id,
          dossier: existingDraft.dossier,
          definition: existingDraft.definition,
        });
      }
    }
    if (current.status !== "ready") {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "not_ready", message: "Confirm the complete requirements before creating a draft." } },
        409,
      );
    }
    if (current.revision !== parsed.data.expectedRevision) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "stale_revision", message: "Reload the latest Copilot session before creating a draft." }, currentRevision: current.revision },
        409,
      );
    }

    const artifacts = await generateTemplateAuthoringArtifacts({
      ledger: current.ledger,
      messages: current.messages.map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
      actorEmail: actor.email,
    });
    const validation = validateTemplateAuthoringDefinition(artifacts);
    const inactiveEmails = await findInactiveFixedTemplateEmails({
      service,
      definition: artifacts.definition,
    });
    if (!validation.valid || inactiveEmails.length) {
      return approvalJson(
        cookieSource,
        correlationId,
        {
          error: {
            code: "validation_failed",
            message: inactiveEmails.length
              ? "The generated draft references inactive directory identities."
              : "The generated draft did not pass coded workflow validation.",
          },
          validation,
          inactiveEmails,
        },
        422,
      );
    }

    const familyKey = `copilot-${slug(artifacts.definition.template.name)}-${randomUUID().slice(0, 8)}`;
    const familyResult = await createTemplateAuthoringFamily({
      service,
      actor,
      command: {
        familyKey,
        name: artifacts.definition.template.name,
        businessUnitId: current.ledger.businessUnitId,
        departmentId: current.ledger.departmentId,
        dossier: artifacts.dossier,
        definition: artifacts.definition,
        changeReason: "Initial editable draft generated from a confirmed Copilot requirements interview.",
        idempotencyKey: parsed.data.idempotencyKey,
      },
    });
    if (!["applied", "replayed"].includes(String(familyResult.outcome))) {
      return templateAuthoringRpcResponse({
        cookieSource,
        correlationId,
        result: familyResult,
      });
    }
    const familyId = String(familyResult.familyId || "");
    const draftId = String(familyResult.draftId || "");
    const linked = await linkTemplateCopilotDraft({
      service,
      actor,
      sessionId,
      expectedRevision: current.revision,
      familyId,
      draftId,
    });
    safeApprovalLog("template_copilot_draft_created", correlationId, {
      outcome: String(linked.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result: {
        ...linked,
        familyId,
        draftId,
        validation,
        dossier: artifacts.dossier,
        definition: artifacts.definition,
      },
      appliedStatus: 201,
    });
  } catch (error) {
    safeApprovalLog("template_copilot_draft_create_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "The Copilot draft could not be created.",
        },
      },
      503,
    );
  }
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "workflow"
  );
}
