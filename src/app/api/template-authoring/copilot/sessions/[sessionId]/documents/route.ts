import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedFormData } from "@/lib/bounded-request";
import {
  getTemplateCopilotQuestion,
  getNextTemplateCopilotSection,
  templateCopilotLedgerSchema,
} from "@/lib/template-copilot-ledger";
import {
  sanitizeRequirementDocument,
  templateCopilotDocumentLimits,
} from "@/lib/template-copilot-safety";
import {
  advanceTemplateCopilotSession,
  loadTemplateCopilotSession,
} from "@/lib/template-copilot-server-data";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV2ModeEnabled } from "@/lib/template-copilot-v2-feature";
import { bindTemplateCopilotV2DocumentIdentity, runTemplateCopilotV2DescribeCommand } from "@/lib/template-copilot-v2-describe-command";
import { templateCopilotV2DescribeResponseDisposition } from "@/lib/template-copilot-v2-describe-response";
import { extractTemplateCopilotV2Candidates, TemplateCopilotModelError } from "@/lib/template-copilot-ai";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  const { sessionId } = await context.params;
  const body = await readBoundedFormData(
    request,
    templateCopilotDocumentLimits.maximumBytes + 64_000,
  );
  if (!body.ok) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The requirement document request is invalid or too large." } },
      body.reason === "too_large" ? 413 : 400,
    );
  }
  const file = body.value.get("file");
  const clientMessageId = String(body.value.get("clientMessageId") || "");
  const expectedRevision = Number(body.value.get("expectedRevision"));
  if (
    !(file instanceof File) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(clientMessageId) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  ) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "File, revision, and message id are required." } },
      400,
    );
  }

  const safe = await sanitizeRequirementDocument(file);
  if (!safe.ok) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "unsafe_requirement_document", message: safe.message } },
      safe.status,
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
    if (current.ledger.schemaVersion === 2 && !isTemplateCopilotV2Enabled()) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "v2_unavailable", message: "The Copilot v2 document endpoint is unavailable." } },
        404,
      );
    }
    if (current.ledger.schemaVersion === 2 && isTemplateCopilotV2Enabled()) {
      if (!isTemplateCopilotV2ModeEnabled("describe_everything")) {
        return approvalJson(
          cookieSource,
          correlationId,
          { error: { code: "mode_unavailable", message: "Describe-everything document intake is temporarily unavailable." } },
          404,
        );
      }
      // `safe.extract.text` is the exact bounded source supplied to the
      // model and inserted by the durable command preparer before evidence
      // offsets are created. The finalizer records only the safe metadata in
      // audit detail and preserves candidates as review-only.
      const document = bindTemplateCopilotV2DocumentIdentity({
        sessionId,
        idempotencyKey: clientMessageId,
        document: safe.extract,
      });
      const result = await runTemplateCopilotV2DescribeCommand({
        session, service, actor, sessionId, expectedRevision, idempotencyKey: clientMessageId,
        mode: "describe_everything",
        sectionHint: "document",
        sourceText: document.text, document,
        extractCandidates: extractTemplateCopilotV2Candidates,
        fallbackReason: (error) => error instanceof TemplateCopilotModelError
          ? error.reasonCode
          : "provider_error",
      });
      if (result.outcome === "guided_fallback") {
        safeApprovalLog("template_copilot_v2_document_fallback", correlationId, {
          reason: typeof result.detail === "object" && result.detail && "fallbackReason" in result.detail
            ? String(result.detail.fallbackReason).slice(0, 64)
            : "provider_error",
        });
      }
      const terminal = templateCopilotV2DescribeResponseDisposition(result);
      if (terminal) return approvalJson(cookieSource, correlationId, terminal.body, terminal.status);
      return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
    }
    if (current.ledger.schemaVersion !== 1 || isTemplateCopilotV2Enabled()) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "v1_session_read_only", message: "This legacy Copilot session is read-only in v2. Preview and approve its explicit upgrade instead." } },
        409,
      );
    }
    if (
      current.ledger.requirementDocumentExtracts.length >=
      templateCopilotDocumentLimits.maximumFiles
    ) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "too_many_documents", message: "A Copilot session accepts at most five requirement documents." } },
        422,
      );
    }
    const ledger = templateCopilotLedgerSchema.parse({
      ...current.ledger,
      requirementDocumentExtracts: [
        ...current.ledger.requirementDocumentExtracts,
        safe.extract,
      ],
    });
    const nextSection = getNextTemplateCopilotSection(ledger);
    const assistantMessage = [
      localizedDocumentAccepted(ledger.locale, safe.extract.fileName),
      getTemplateCopilotQuestion(nextSection, ledger.locale),
    ].join("\n\n");
    const result = await advanceTemplateCopilotSession({
      service,
      actor,
      sessionId,
      expectedRevision,
      clientMessageId,
      userMessage: `Uploaded requirement document: ${safe.extract.fileName}`,
      assistantMessage,
      ledger,
      status: "interviewing",
      model: current.model || "",
      structuredDetail: {
        documentId: safe.extract.id,
        sha256: safe.extract.sha256,
      },
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
    });
  } catch {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "dependency_unavailable", message: "The requirement document could not be attached." } },
      503,
    );
  }
}

function localizedDocumentAccepted(
  locale: "en" | "zh-Hant" | "zh-Hans",
  fileName: string,
) {
  if (locale === "zh-Hant") {
    return `${fileName} 已作為有界限且不受信任的需求資料接受。檔案內容不能發出指令或更改權限。`;
  }
  if (locale === "zh-Hans") {
    return `${fileName} 已作为有界限且不受信任的需求资料接受。文件内容不能发出指令或更改权限。`;
  }
  return `${fileName} was accepted as bounded, untrusted requirements data. It cannot issue commands or change permissions.`;
}
