import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import {
  applyTemplateCopilotAnswer,
  createTemplateCopilotLedger,
  getTemplateCopilotQuestion,
  getNextTemplateCopilotSection,
  templateCopilotStartSchema,
} from "@/lib/template-copilot-ledger";
import {
  detectTemplateCopilotLocale,
  type TemplateCopilotLocale,
} from "@/lib/template-copilot-plan";
import {
  extractTemplateCopilotTurn,
  TemplateCopilotModelError,
} from "@/lib/template-copilot-ai";
import {
  advanceTemplateCopilotSession,
  createTemplateCopilotSession,
  listTemplateCopilotSessionPage,
  resolveTemplateCopilotScope,
} from "@/lib/template-copilot-server-data";
import { templateCopilotSessionListQuerySchema } from "@/lib/template-copilot-history";
import { TemplateCopilotInvalidSessionCursorError } from "@/lib/template-copilot-session-pagination";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV2ModeEnabled } from "@/lib/template-copilot-v2-feature";
import { createTemplateCopilotV2Session } from "@/lib/template-copilot-v2-server-data";
import { isTemplateCopilotQuestionLibraryStartAllowed } from "@/lib/template-copilot-v2-step8-review";

/** Read-only, authenticated capability probe.  The browser uses this before a
 * start mutation so a legacy v1 start never enters the v2 replay/storage state
 * machine. */
export async function HEAD(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return withTemplateCopilotStartSchemaVersion(approvalError(resolved));
  const { cookieSource, correlationId } = resolved.context;
  return withTemplateCopilotStartSchemaVersion(approvalJson(
    cookieSource,
    correlationId,
    {},
    200,
  ));
}

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } =
    resolved.context;
  const parsed = templateCopilotSessionListQuerySchema.safeParse({
    view: request.nextUrl.searchParams.get("view") || undefined,
    limit: request.nextUrl.searchParams.get("limit") || undefined,
    cursor: request.nextUrl.searchParams.get("cursor") || undefined,
  });
  if (!parsed.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_request",
          message: "The Copilot history query is invalid.",
        },
      },
      400,
    );
  }
  if (parsed.data.view === "review" && !actor.isAdmin) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "forbidden",
          message: "Administrator access is required to review Copilot sessions.",
        },
      },
      403,
    );
  }

  try {
    const result = await listTemplateCopilotSessionPage({
      session,
      service,
      actor,
      view: parsed.data.view,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });
    safeApprovalLog("template_copilot_session_list_read", correlationId, {
      view: parsed.data.view,
      resultCount: result.sessions.length,
    });
    return approvalJson(cookieSource, correlationId, {
      view: parsed.data.view,
      sessions: result.sessions,
      page: result.page,
    });
  } catch (error) {
    safeApprovalLog("template_copilot_session_list_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: error instanceof TemplateCopilotInvalidSessionCursorError ? "invalid_request" : "dependency_unavailable",
          message: error instanceof TemplateCopilotInvalidSessionCursorError ? "The Copilot history cursor is invalid." : "Copilot history is temporarily unavailable.",
        },
      },
      error instanceof TemplateCopilotInvalidSessionCursorError ? 400 : 503,
    );
  }
}

export async function POST(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return withTemplateCopilotStartSchemaVersion(approvalError(resolved));
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const expectedSchemaVersion = request.headers.get("X-Template-Copilot-Expected-Schema-Version");
  const currentSchemaVersion = isTemplateCopilotV2Enabled() ? "2" : "1";
  if (expectedSchemaVersion && expectedSchemaVersion !== currentSchemaVersion) {
    return withTemplateCopilotStartSchemaVersion(approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "schema_version_changed",
          message: "The Copilot rollout changed. Please start again.",
        },
      },
      409,
    ));
  }
  const body = await readBoundedJson(request, 32_000);
  const parsed = body.ok ? templateCopilotStartSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return withTemplateCopilotStartSchemaVersion(approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The Copilot session request is invalid." } },
      400,
    ));
  }

  try {
    const scope = await resolveTemplateCopilotScope({
      service,
      businessUnitId: parsed.data.businessUnitId,
      departmentName: parsed.data.departmentName,
    });
    if (!scope) {
      return withTemplateCopilotStartSchemaVersion(approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "invalid_scope", message: "The selected business or department is unavailable." } },
        422,
      ));
    }
    const locale =
      parsed.data.locale ||
      detectTemplateCopilotLocale(parsed.data.initialRequirement || "");
    if (isTemplateCopilotV2Enabled()) {
      if (!isTemplateCopilotV2ModeEnabled("guided")) {
        return withTemplateCopilotStartSchemaVersion(approvalJson(
          cookieSource,
          correlationId,
          { error: { code: "mode_unavailable", message: "New Guided Copilot interviews are temporarily unavailable." } },
          404,
        ));
      }
      if (parsed.data.initialRequirement) {
        return withTemplateCopilotStartSchemaVersion(approvalJson(
          cookieSource,
          correlationId,
          { error: { code: "v2_initial_requirement_not_available", message: "Describe-everything intake is not enabled in this Copilot v2 foundation release." } },
          422,
        ));
      }
      if (
        parsed.data.questionLibraryVersion
        && !isTemplateCopilotQuestionLibraryStartAllowed(parsed.data.questionLibraryVersion, locale)
      ) {
        return withTemplateCopilotStartSchemaVersion(approvalJson(
          cookieSource,
          correlationId,
          {
            error: {
              code: "question_library_locale_not_approved",
              message: "The reviewed Copilot language update is not enabled for the selected language in this environment. Start a new interview with the enabled version.",
            },
          },
          422,
        ));
      }
      const result = await createTemplateCopilotV2Session({
        service,
        actor,
        clientMessageId: parsed.data.clientMessageId,
        scope: { ...scope, locale },
        // Missing is intentionally v2.0 for old response-lost browser
        // commands; current browsers persist and send the rollout-selected pin.
        questionLibraryVersion: parsed.data.questionLibraryVersion || "v2.0",
      });
      return withTemplateCopilotStartSchemaVersion(templateAuthoringRpcResponse({
        cookieSource,
        correlationId,
        result,
        appliedStatus: 201,
      }));
    }
    const ledger = createTemplateCopilotLedger({ ...scope, locale });
    const assistantMessage = initialAssistantMessage({
      locale,
      businessName: scope.businessName,
      departmentName: scope.departmentName,
    });
    const created = await createTemplateCopilotSession({
      service,
      actor,
      clientMessageId: parsed.data.clientMessageId,
      ledger,
      assistantMessage,
    });
    let result = created;
    let responseAssistantMessage = assistantMessage;
    if (
      created.outcome === "applied" &&
      created.sessionId &&
      parsed.data.initialRequirement
    ) {
      const extracted = await extractTemplateCopilotTurn({
        ledger,
        currentSection: "identity_scope",
        message: parsed.data.initialRequirement,
      });
      const nextLedger = applyTemplateCopilotAnswer({
        ledger,
        sectionId: "identity_scope",
        messageId: initialRequirementMessageId(parsed.data.clientMessageId),
        status: extracted.result.answerStatus,
        summary: extracted.result.conciseSummary,
      });
      const nextSection = getNextTemplateCopilotSection(nextLedger);
      responseAssistantMessage = [
        extracted.result.acknowledgement,
        getTemplateCopilotQuestion(nextSection, nextLedger.locale),
      ].join("\n\n");
      result = await advanceTemplateCopilotSession({
        service,
        actor,
        sessionId: String(created.sessionId),
        expectedRevision: Number(created.revision || 1),
        clientMessageId: initialRequirementMessageId(
          parsed.data.clientMessageId,
        ),
        userMessage: parsed.data.initialRequirement,
        assistantMessage: responseAssistantMessage,
        ledger: nextLedger,
        status: "interviewing",
        model: extracted.model,
        structuredDetail: {
          targetSection: "identity_scope",
          answerStatus: extracted.result.answerStatus,
          suppliedAtStart: true,
        },
      });
    }
    safeApprovalLog("template_copilot_session_created", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return withTemplateCopilotStartSchemaVersion(templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result: { ...result, assistantMessage: responseAssistantMessage },
      appliedStatus: 201,
    }));
  } catch (error) {
    safeApprovalLog("template_copilot_session_create_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
      ...(error instanceof TemplateCopilotModelError
        ? {
            modelReason: error.reasonCode,
            modelIssuePaths: error.issuePaths.join("|"),
          }
        : {}),
    });
    return withTemplateCopilotStartSchemaVersion(approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "dependency_unavailable", message: "The Copilot session could not be started." } },
      503,
    ));
  }
}

/** The server feature flag is authoritative.  Returning it even for an error
 * lets the embedded client preserve the old v1 error wording without a client
 * supplied version switch or a second potentially mutating start request. */
function withTemplateCopilotStartSchemaVersion(response: Response) {
  response.headers.set("X-Template-Copilot-Schema-Version", isTemplateCopilotV2Enabled() ? "2" : "1");
  return response;
}

function initialAssistantMessage({
  locale,
  businessName,
  departmentName,
}: {
  locale: TemplateCopilotLocale;
  businessName: string;
  departmentName: string;
}) {
  const introduction =
    locale === "zh-Hant"
      ? `我會協助你為 ${businessName} / ${departmentName} 設計審批流程範本。`
      : locale === "zh-Hans"
        ? `我会协助你为 ${businessName} / ${departmentName} 设计审批流程模板。`
        : `I’ll help you design an approval template for ${businessName} / ${departmentName}.`;
  const boundary =
    locale === "zh-Hant"
      ? "我會顯示需求清單、標示未知事項，並只建立供人員審核的可編輯草稿。"
      : locale === "zh-Hans"
        ? "我会显示需求清单、标记未知事项，并只创建供人员审核的可编辑草稿。"
        : "I will keep a visible requirements checklist, flag unknowns, and create only an editable draft for human review.";
  return [
    introduction,
    boundary,
    getTemplateCopilotQuestion("identity_scope", locale),
  ].join("\n\n");
}

function initialRequirementMessageId(clientMessageId: string) {
  const suffix = ":initial";
  if (clientMessageId.length + suffix.length <= 128) {
    return `${clientMessageId}${suffix}`;
  }
  return `initial:${createHash("sha256")
    .update(clientMessageId)
    .digest("hex")
    .slice(0, 32)}`;
}
