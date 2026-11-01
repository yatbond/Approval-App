import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export type TemplateCopilotSessionCursor = {
  createdAt: string;
  id: string;
};

export class TemplateCopilotInvalidSessionCursorError extends Error {
  constructor() {
    super("invalid_template_copilot_session_cursor");
    this.name = "TemplateCopilotInvalidSessionCursorError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The token deliberately does not expose a timestamp or UUID.  It is encrypted
 * and authenticated with a server-only key, then bounded before decryption.
 * A deployment can set TEMPLATE_COPILOT_CURSOR_SECRET; the service-role secret
 * is a safe server-only fallback because the Copilot routes already require it.
 */
export function encodeTemplateCopilotSessionCursor(
  cursor: TemplateCopilotSessionCursor,
  secret = cursorSecret(),
) {
  if (!isValidCursor(cursor)) throw new TemplateCopilotInvalidSessionCursorError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ v: 1, ...cursor }), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decodeTemplateCopilotSessionCursor(
  value: string | undefined,
  secret = cursorSecret(),
): TemplateCopilotSessionCursor | null {
  if (!value) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length < 29 || decoded.length > 384) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), decoded.subarray(0, 12));
    decipher.setAuthTag(decoded.subarray(12, 28));
    const parsed = JSON.parse(
      Buffer.concat([decipher.update(decoded.subarray(28)), decipher.final()]).toString("utf8"),
    ) as { v?: unknown; createdAt?: unknown; id?: unknown };
    const cursor = { createdAt: parsed.createdAt, id: parsed.id };
    return parsed.v === 1 && isValidCursor(cursor)
      ? cursor as TemplateCopilotSessionCursor
      : null;
  } catch {
    return null;
  }
}

function cursorSecret() {
  const secret = process.env.TEMPLATE_COPILOT_CURSOR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("Template Copilot cursor signing secret is not configured.");
  }
  return secret;
}

function keyFor(secret: string) {
  return createHash("sha256").update(`template-copilot-session-cursor:${secret}`).digest();
}

function isValidCursor(value: { createdAt: unknown; id: unknown }): value is TemplateCopilotSessionCursor {
  return typeof value.createdAt === "string" &&
    RFC3339_PATTERN.test(value.createdAt) &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.id === "string" && UUID_PATTERN.test(value.id);
}
