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
  formatTemplateCopilotSummary,
  getNextTemplateCopilotSection,
  isExplicitConfirmation,
  isTemplateCopilotReady,
  templateCopilotQuestions,
  templateCopilotTurnSchema,
} from "@/lib/template-copilot-ledger";
import {
  TemplateCopilotConfigurationError,
  TemplateCopilotModelError,
  extractTemplateCopilotTurn,
} from "@/lib/template-copilot-ai";
import {
  advanceTemplateCopilotSession,
  loadTemplateCopilotSession,
} from "@/lib/template-copilot-server-data";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  const { sessionId } = await context.params;
  const body = await readBoundedJson(request, 32_000);
  const parsed = body.ok ? templateCopilotTurnSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The Copilot message is invalid." } },
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
    if (current.status !== "interviewing" && current.status !== "ready") {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "invalid_transition", message: "This Copilot session is closed for editing." } },
        409,
      );
    }

    const currentSection = getNextTemplateCopilotSection(current.ledger);
    let nextLedger = current.ledger;
    let assistantMessage = "";
    let model = current.model || "";
    let structuredDetail: Record<string, unknown> = {};
    let nextStatus: "interviewing" | "ready" = "interviewing";

    if (
      currentSection === "confirmation" &&
      isTemplateCopilotReady(current.ledger) &&
      isExplicitConfirmation(parsed.data.message)
    ) {
      nextLedger = applyTemplateCopilotAnswer({
        ledger: current.ledger,
        sectionId: "confirmation",
        messageId: parsed.data.clientMessageId,
        status: "answered",
        summary: "Employee explicitly confirmed the requirements summary.",
      });
      assistantMessage =
        "Requirements confirmed. I can now generate an editable draft. The draft will still require coded validation and human publication review.";
      nextStatus = "ready";
      structuredDetail = { targetSection: "confirmation", confirmed: true };
    } else {
      const extracted = await extractTemplateCopilotTurn({
        ledger: current.ledger,
        currentSection,
        message: parsed.data.message,
      });
      const targetSection =
        currentSection === "confirmation"
          ? extracted.result.targetSection
          : currentSection;
      nextLedger = applyTemplateCopilotAnswer({
        ledger: current.ledger,
        sectionId: targetSection,
        messageId: parsed.data.clientMessageId,
        status: extracted.result.answerStatus,
        summary: extracted.result.conciseSummary,
      });
      model = extracted.model;
      const nextSection = getNextTemplateCopilotSection(nextLedger);
      assistantMessage = [
        extracted.result.acknowledgement,
        nextSection === "confirmation"
          ? `Here is the requirements summary:\n${formatTemplateCopilotSummary(nextLedger)}`
          : "",
        templateCopilotQuestions[nextSection],
      ]
        .filter(Boolean)
        .join("\n\n");
      structuredDetail = {
        targetSection,
        answerStatus: extracted.result.answerStatus,
      };
    }

    const result = await advanceTemplateCopilotSession({
      service,
      actor,
      sessionId,
      expectedRevision: parsed.data.expectedRevision,
      clientMessageId: parsed.data.clientMessageId,
      userMessage: parsed.data.message,
      assistantMessage,
      ledger: nextLedger,
      status: nextStatus,
      model,
      structuredDetail,
    });
    safeApprovalLog("template_copilot_turn", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
    });
  } catch (error) {
    const configuration = error instanceof TemplateCopilotConfigurationError;
    const modelFailure = error instanceof TemplateCopilotModelError;
    safeApprovalLog("template_copilot_turn_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
      ...(modelFailure
        ? {
            modelReason: error.reasonCode,
            modelIssuePaths: error.issuePaths.join("|"),
          }
        : {}),
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: configuration ? "copilot_not_configured" : "dependency_unavailable",
          message:
            configuration || modelFailure
              ? error.message
              : "The Copilot could not process that answer.",
        },
      },
      configuration ? 503 : 502,
    );
  }
}
