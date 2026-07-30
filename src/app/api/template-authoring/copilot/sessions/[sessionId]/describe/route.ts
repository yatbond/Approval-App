import { after, type NextRequest } from "next/server";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV2ModeEnabled } from "@/lib/template-copilot-v2-feature";
import { runTemplateCopilotV2DescribeCommand } from "@/lib/template-copilot-v2-describe-command";
import { templateCopilotV2DescribeResponseDisposition } from "@/lib/template-copilot-v2-describe-response";
import {
  extractTemplateCopilotV2Candidates,
  getTemplateCopilotAiRoutingMetadata,
  TemplateCopilotModelError,
  type TemplateCopilotAiRoutingMetadata,
} from "@/lib/template-copilot-ai";
import { recordTemplateCopilotV2TelemetryBestEffort } from "@/lib/template-copilot-v2-telemetry-server";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { z } from "zod";
import { templateCopilotUnicodeCodePointCount } from "@/lib/template-copilot-unicode";
import {
  summarizeTemplateCopilotV2ExtractionDiagnostics,
  templateCopilotV2ExtractionDiagnosticTelemetryCounts,
  type TemplateCopilotV2ExtractionDiagnostics,
} from "@/lib/template-copilot-v2-extraction-diagnostics";

// The mode command schema is refined, and Zod deliberately disallows omit on
// refined objects. Keep the describe command explicit and equally bounded.
const schema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  mode: z.enum(["describe_everything", "similar_template"]),
  message: z.string().trim().min(1).superRefine((value, context) => {
    if (templateCopilotUnicodeCodePointCount(value) > 80_000) context.addIssue({ code: "custom", message: "Description exceeds 80000 Unicode characters." });
  }),
}).strict();

/** The durable lifecycle writes the source message and reconciles its receipt
 * before any provider invocation. A retry therefore returns its stored
 * success/fallback terminal result, never a second model branch. */
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "v2_unavailable", message: "The Copilot v2 Describe endpoint is unavailable." } }, 404);
  // 80,000 Unicode code points can require four UTF-8 bytes each, while JSON
  // escaping can require more. Keep a hard byte bound that still admits every
  // valid schema-sized narrative plus its small command envelope.
  const body = await readBoundedJson(request, 512 * 1024);
  const parsed = body.ok ? schema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The requirements description is invalid." } }, 400);
  const { sessionId } = await context.params;
  if (!isTemplateCopilotV2ModeEnabled(parsed.data.mode)) return approvalJson(cookieSource, correlationId, { error: { code: "mode_unavailable", message: "This Copilot mode is temporarily unavailable." } }, 404);
  try {
    const providerStartedAt = Date.now();
    let providerInvoked = false;
    let providerOutcome: "success" | "outage" | "timeout" | "malformed_output" | "privacy_route_rejected" = "success";
    let providerRouting: TemplateCopilotAiRoutingMetadata | null = null;
    let extractionDiagnostics: TemplateCopilotV2ExtractionDiagnostics | null =
      null;
    try {
      providerRouting = getTemplateCopilotAiRoutingMetadata();
    } catch {
      // The durable Describe command will persist the same configuration
      // failure as Guided fallback. Do not invent provider metadata here.
    }
    const result = await runTemplateCopilotV2DescribeCommand({
      session, service, actor, sessionId,
      expectedRevision: parsed.data.expectedRevision,
      idempotencyKey: parsed.data.idempotencyKey,
      mode: parsed.data.mode,
      sourceText: parsed.data.message,
      extractCandidates: async (input) => {
        providerInvoked = true;
        try {
          const extracted = await extractTemplateCopilotV2Candidates(input);
          extractionDiagnostics =
            summarizeTemplateCopilotV2ExtractionDiagnostics({
              acceptedCandidateCount: extracted.candidates.length,
              rejected: extracted.rejected,
              terminalCode: "candidates_applied",
            });
          return extracted;
        } catch (error) {
          providerOutcome = classifyProviderOutcome(error);
          throw error;
        }
      },
      fallbackReason: (error) => {
        providerOutcome = classifyProviderOutcome(error);
        return error instanceof TemplateCopilotModelError
          ? error.reasonCode
          : "provider_error";
      },
    });
    const telemetryRevision = positiveInteger(result.revision);
    const telemetryLocale = resultLocale(result);
    if (providerInvoked && telemetryRevision && telemetryLocale) {
      after(() =>
        recordTemplateCopilotV2TelemetryBestEffort({
          service,
          event: {
            actorId: actor.id,
            sessionId,
            deduplicationKey: parsed.data.idempotencyKey,
            locale: telemetryLocale,
            mode: parsed.data.mode,
            eventType: "provider_call_completed",
            revision: telemetryRevision,
            outcomeCode: `provider_${providerOutcome}`,
            ...(providerRouting
              ? {
                  provider: {
                    providerCode: providerRouting.providerCode,
                    modelCode: safeModelCode(providerRouting.model),
                    privacyMode: providerRouting.privacyMode,
                    outcome: providerOutcome,
                    latencyMs: Math.min(Date.now() - providerStartedAt, 300_000),
                  },
                }
              : {}),
            counts: {
              guided_fallbacks: result.outcome === "guided_fallback" ? 1 : 0,
              ...templateCopilotV2ExtractionDiagnosticTelemetryCounts(
                extractionDiagnostics,
              ),
            },
          },
        }),
      );
    }
    if (result.outcome === "guided_fallback") {
      safeApprovalLog("template_copilot_v2_describe_fallback", correlationId, {
        reason: typeof result.detail === "object" && result.detail && "fallbackReason" in result.detail
          ? String(result.detail.fallbackReason).slice(0, 64)
          : "provider_error",
      });
    }
    const terminal = templateCopilotV2DescribeResponseDisposition(result);
    if (terminal) return approvalJson(cookieSource, correlationId, terminal.body, terminal.status);
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    const failure = classifyTemplateCopilotV2OperationError(error, "The requirements description could not be processed.");
    return approvalJson(cookieSource, correlationId, { error: failure.error }, failure.status);
  }
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function resultLocale(result: Record<string, unknown>) {
  const ledger =
    result.ledger &&
    typeof result.ledger === "object" &&
    !Array.isArray(result.ledger)
      ? (result.ledger as Record<string, unknown>)
      : {};
  return ledger.locale === "en" ||
    ledger.locale === "zh-Hant" ||
    ledger.locale === "zh-Hans"
    ? ledger.locale
    : null;
}

function classifyProviderOutcome(error: unknown) {
  const reason =
    error instanceof TemplateCopilotModelError
      ? error.reasonCode
      : error instanceof Error
        ? error.name
        : "provider_error";
  if (/privacy|zdr/i.test(reason)) return "privacy_route_rejected" as const;
  if (/timeout/i.test(reason)) return "timeout" as const;
  if (/malformed|schema|json|output/i.test(reason)) {
    return "malformed_output" as const;
  }
  return "outage" as const;
}

function safeModelCode(model: string) {
  return model.toLowerCase().replaceAll("/", ":").replace(/[^a-z0-9_.:-]/g, "_");
}
