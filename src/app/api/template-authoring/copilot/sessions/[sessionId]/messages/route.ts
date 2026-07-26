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
  getTemplateCopilotQuestion,
  getNextTemplateCopilotSection,
  isExplicitConfirmation,
  isTemplateCopilotReady,
  setTemplateCopilotLocale,
  templateCopilotTurnSchema,
} from "@/lib/template-copilot-ledger";
import { detectTemplateCopilotLocale } from "@/lib/template-copilot-plan";
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
import { isTemplateCopilotV2Enabled } from "@/lib/template-copilot-v2-feature";

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
    if (current.ledger.schemaVersion !== 1) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "v2_session_read_only", message: "This v2 Copilot session must use its dedicated v2 interview path." } },
        409,
      );
    }
    if (isTemplateCopilotV2Enabled()) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "v1_session_read_only", message: "This legacy Copilot session is read-only in v2. Preview and approve its explicit upgrade instead." } },
        409,
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

    const localizedLedger = setTemplateCopilotLocale(
      current.ledger,
      detectTemplateCopilotLocale(
        parsed.data.message,
        current.ledger.locale,
      ),
    );
    const currentSection = getNextTemplateCopilotSection(localizedLedger);
    let nextLedger = localizedLedger;
    let assistantMessage = "";
    let model = current.model || "";
    let structuredDetail: Record<string, unknown> = {};
    let nextStatus: "interviewing" | "ready" = "interviewing";

    if (
      currentSection === "confirmation" &&
      isTemplateCopilotReady(localizedLedger) &&
      isExplicitConfirmation(parsed.data.message)
    ) {
      nextLedger = applyTemplateCopilotAnswer({
        ledger: localizedLedger,
        sectionId: "confirmation",
        messageId: parsed.data.clientMessageId,
        status: "answered",
        summary: explicitConfirmationSummary(localizedLedger.locale),
      });
      assistantMessage = confirmedMessage(localizedLedger.locale);
      nextStatus = "ready";
      structuredDetail = { targetSection: "confirmation", confirmed: true };
    } else {
      const extracted = await extractTemplateCopilotTurn({
        ledger: localizedLedger,
        currentSection,
        message: parsed.data.message,
      });
      const targetSection =
        currentSection === "confirmation"
          ? extracted.result.targetSection
          : currentSection;
      nextLedger = applyTemplateCopilotAnswer({
        ledger: localizedLedger,
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
          ? `${requirementsSummaryHeading(nextLedger.locale)}\n${formatTemplateCopilotSummary(nextLedger)}`
          : "",
        getTemplateCopilotQuestion(nextSection, nextLedger.locale),
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

function confirmedMessage(locale: "en" | "zh-Hant" | "zh-Hans") {
  if (locale === "zh-Hant") {
    return "需求已確認。現在可以建立可編輯草稿；草稿仍須通過程式驗證及人工發布審核。";
  }
  if (locale === "zh-Hans") {
    return "需求已确认。现在可以创建可编辑草稿；草稿仍须通过程序验证和人工发布审核。";
  }
  return "Requirements confirmed. I can now generate an editable draft. The draft will still require coded validation and human publication review.";
}

function explicitConfirmationSummary(locale: "en" | "zh-Hant" | "zh-Hans") {
  return locale === "zh-Hant"
    ? "員工已明確確認需求摘要。"
    : locale === "zh-Hans"
      ? "员工已明确确认需求摘要。"
      : "Employee explicitly confirmed the requirements summary.";
}

function requirementsSummaryHeading(locale: "en" | "zh-Hant" | "zh-Hans") {
  return locale === "zh-Hant"
    ? "以下是需求摘要："
    : locale === "zh-Hans"
      ? "以下是需求摘要："
      : "Here is the requirements summary:";
}
