import { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";
import type { TemplateCopilotV2AuthoringMode } from "./template-copilot-v2-mode-contract.ts";

const commandKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maximumRequirementDocumentBytes = 5 * 1024 * 1024;

export type TemplateCopilotV2PendingModeCommand = Readonly<{
  schemaVersion: 1;
  sessionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  operation:
    | Readonly<{
        kind: "switch_mode";
        mode: TemplateCopilotV2AuthoringMode;
        sourceVersionId?: string;
      }>
    | Readonly<{
        kind: "describe";
        mode: "describe_everything" | "similar_template";
        message: string;
      }>
    | Readonly<{
        kind: "document";
        fileName: string;
        size: number;
        sha256: string;
  }>;
}>;

export type TemplateCopilotDocumentIdentity = Readonly<{
  fileName: string;
  size: number;
  sha256: string;
}>;

export function parseTemplateCopilotV2PendingModeCommand(
  value: unknown,
): TemplateCopilotV2PendingModeCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<TemplateCopilotV2PendingModeCommand>;
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.sessionId !== "string"
    || !sessionIdPattern.test(candidate.sessionId)
    || !Number.isInteger(candidate.expectedRevision)
    || Number(candidate.expectedRevision) < 1
    || typeof candidate.idempotencyKey !== "string"
    || !commandKeyPattern.test(candidate.idempotencyKey)
    || !candidate.operation
    || typeof candidate.operation !== "object"
  ) return null;

  const operation = candidate.operation as TemplateCopilotV2PendingModeCommand["operation"];
  if (operation.kind === "switch_mode") {
    if (!["guided", "describe_everything", "similar_template"].includes(operation.mode)) return null;
    if (operation.mode === "similar_template") {
      if (typeof operation.sourceVersionId !== "string" || !sessionIdPattern.test(operation.sourceVersionId)) return null;
    } else if ("sourceVersionId" in operation && operation.sourceVersionId !== undefined) {
      return null;
    }
  } else if (operation.kind === "describe") {
    if (!["describe_everything", "similar_template"].includes(operation.mode)) return null;
    if (
      typeof operation.message !== "string"
      || operation.message.trim().length === 0
      || templateCopilotUnicodeCodePointCount(operation.message) > 80_000
    ) return null;
  } else if (operation.kind === "document") {
    if (
      typeof operation.fileName !== "string"
      || operation.fileName.trim().length === 0
      || templateCopilotUnicodeCodePointCount(operation.fileName) > 255
      || !Number.isInteger(operation.size)
      || operation.size < 1
      || operation.size > maximumRequirementDocumentBytes
      || typeof operation.sha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(operation.sha256)
    ) return null;
  } else {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1,
    sessionId: candidate.sessionId,
    expectedRevision: Number(candidate.expectedRevision),
    idempotencyKey: candidate.idempotencyKey,
    operation: Object.freeze({ ...operation }),
  }) as TemplateCopilotV2PendingModeCommand;
}

export function createTemplateCopilotV2PendingModeCommand(
  value: Omit<TemplateCopilotV2PendingModeCommand, "schemaVersion">,
): TemplateCopilotV2PendingModeCommand {
  const parsed = parseTemplateCopilotV2PendingModeCommand({
    ...value,
    schemaVersion: 1,
  });
  if (!parsed) throw new Error("The Copilot mode command is invalid.");
  return parsed;
}

export function nextTemplateCopilotV2PendingModeCommand({
  pending,
  requested,
}: {
  pending: TemplateCopilotV2PendingModeCommand | null;
  requested: Omit<TemplateCopilotV2PendingModeCommand, "schemaVersion">;
}) {
  const created = createTemplateCopilotV2PendingModeCommand(requested);
  if (!pending) return created;
  if (stableModeCommandIntent(pending) === stableModeCommandIntent(created)) return pending;
  if (pending.operation.kind === "document") {
    throw new Error("Reselect the exact same requirements file to check or retry the saved upload.");
  }
  throw new Error("Retry or reload the previous Copilot mode action before starting another one.");
}

/**
 * Creates the bounded identity stored for an interrupted browser upload.
 * File bytes are deliberately never persisted. A later retry receives a new
 * File object and may reuse the command key only when name, byte length, and
 * SHA-256 all match the saved identity.
 */
export async function templateCopilotDocumentIdentity(
  file: Readonly<{
    name: string;
    size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>,
): Promise<TemplateCopilotDocumentIdentity> {
  if (
    typeof file.name !== "string"
    || file.name.trim().length === 0
    || templateCopilotUnicodeCodePointCount(file.name) > 255
    || !Number.isInteger(file.size)
    || file.size < 1
    || file.size > maximumRequirementDocumentBytes
  ) {
    throw new Error("Choose a named requirements file no larger than 5 MB.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot safely verify an interrupted file upload.");
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) {
    throw new Error("The selected file changed while it was being checked. Select it again.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return Object.freeze({ fileName: file.name, size: file.size, sha256 });
}

export function templateCopilotV2PendingModeCommandRequest(
  command: TemplateCopilotV2PendingModeCommand,
) {
  const common = {
    expectedRevision: command.expectedRevision,
    idempotencyKey: command.idempotencyKey,
  };
  if (command.operation.kind === "switch_mode") {
    return {
      path: "modes" as const,
      body: {
        ...common,
        mode: command.operation.mode,
        ...(command.operation.sourceVersionId
          ? { sourceVersionId: command.operation.sourceVersionId }
          : {}),
      },
    };
  }
  if (command.operation.kind === "describe") {
    return {
      path: "describe" as const,
      body: {
        ...common,
        message: command.operation.message,
        mode: command.operation.mode,
      },
    };
  }
  return {
    path: "documents" as const,
    body: common,
  };
}

/** Only ambiguous failures keep a browser-restored command locked for exact
 * retry. Definite client/authorization/validation outcomes cannot succeed with
 * the same saved intent; stale state must first reload the server authority. */
export function templateCopilotV2PendingModeCommandFailureDisposition(
  status: number | null,
  code: string | null,
) {
  if (code === "stale_revision") return "reload" as const;
  if (code === "describe_pending") return "retain" as const;
  if (status !== null && status >= 400 && status < 500) return "clear" as const;
  return "retain" as const;
}

function stableModeCommandIntent(command: TemplateCopilotV2PendingModeCommand) {
  return JSON.stringify({
    sessionId: command.sessionId,
    expectedRevision: command.expectedRevision,
    operation: command.operation,
  });
}
