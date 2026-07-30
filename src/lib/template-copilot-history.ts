import { z } from "zod";
import type { TemplateCopilotLocale } from "./template-copilot-plan.ts";

export const templateCopilotSessionListQuerySchema = z
  .object({
    view: z.enum(["mine", "review"]).default("mine"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export type TemplateCopilotTranscriptMessage = {
  id: string;
  clientMessageId: string;
  role: "user" | "assistant";
  content: string;
  structuredDetail: Record<string, unknown>;
  createdAt: string;
};

export type TemplateCopilotSessionSummary = {
  id: string;
  familyId: string | null;
  draftId: string | null;
  status: "interviewing" | "ready" | "draft_created" | "closed";
  revision: number;
  model: string;
  locale: TemplateCopilotLocale;
  businessName: string;
  departmentName: string;
  createdAt: string;
  updatedAt: string;
  owner?: {
    fullName: string;
    email: string;
  };
};

export type TemplateCopilotTranscript = TemplateCopilotSessionSummary & {
  messages: TemplateCopilotTranscriptMessage[];
  messagePage: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

/** Merge pages in the immutable keyset order.  A duplicate session can occur
 * only when a caller retries a page, but keeping this deterministic protects
 * the UI from showing it twice. */
export function mergeTemplateCopilotSessionSummaries(
  current: TemplateCopilotSessionSummary[],
  incoming: TemplateCopilotSessionSummary[],
) {
  const byId = new Map(current.map((session) => [session.id, session]));
  for (const session of incoming) byId.set(session.id, session);
  return [...byId.values()].sort(
    (left, right) =>
      compareTemplateCopilotTimestamps(right.createdAt, left.createdAt) ||
      right.id.localeCompare(left.id),
  );
}

/** Pure query plan so the client-visible list contract can be tested without
 * exposing database access to the browser.  The cursor itself is decrypted and
 * authenticated in the server-only list path before this is called. */
export function templateCopilotSessionKeysetPlan({
  view,
  actorId,
  cursor,
}: {
  view: "mine" | "review";
  actorId: string;
  cursor: { createdAt: string; id: string } | null;
}) {
  return {
    ownerId: view === "mine" ? actorId : null,
    order: ["created_at", "id"] as const,
    after: cursor
      ? `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      : null,
  };
}

type StoredTemplateCopilotMessage = {
  id: string;
  client_message_id: string;
  role: string;
  content: string;
  structured_detail?: Record<string, unknown>;
  created_at: string;
};

function messageTurnKey(message: StoredTemplateCopilotMessage) {
  // Atomic v2 user/assistant records deliberately share one stable command ID.
  // This retains user-before-assistant ordering even when a database timestamp
  // has no distinguishable sub-millisecond component.
  return message.client_message_id;
}

export function orderTemplateCopilotMessages<
  Message extends StoredTemplateCopilotMessage,
>(messages: Message[]) {
  return [...messages].sort((left, right) => {
    const timeOrder = compareTemplateCopilotTimestamps(left.created_at, right.created_at);
    if (timeOrder !== 0) return timeOrder;
    if (messageTurnKey(left) === messageTurnKey(right) && left.role !== right.role) {
      return left.role === "user" ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });
}

/** RFC3339 ordering that retains PostgreSQL's microseconds; Date.parse drops
 * them and can randomly re-order turns written inside the same millisecond. */
export function compareTemplateCopilotTimestamps(left: string, right: string) {
  const micros = (value: string) => {
    const match = /^(.*?)(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) return Number.NaN;
    const milliseconds = Date.parse(`${match[1]}${match[3]}`);
    return milliseconds * 1000 + Number((match[2] || "").padEnd(6, "0"));
  };
  const difference = micros(left) - micros(right);
  return Number.isNaN(difference) ? left.localeCompare(right) : difference;
}

export function transcriptMessageFromStored(
  message: StoredTemplateCopilotMessage,
): TemplateCopilotTranscriptMessage {
  return {
    id: message.id,
    clientMessageId: message.client_message_id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    structuredDetail: message.structured_detail && typeof message.structured_detail === "object" && !Array.isArray(message.structured_detail) ? message.structured_detail : {},
    createdAt: message.created_at,
  };
}
