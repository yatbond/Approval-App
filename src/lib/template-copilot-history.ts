import { z } from "zod";
import type { TemplateCopilotLocale } from "./template-copilot-plan.ts";

export const templateCopilotSessionListQuerySchema = z
  .object({
    view: z.enum(["mine", "review"]).default("mine"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type TemplateCopilotTranscriptMessage = {
  id: string;
  clientMessageId: string;
  role: "user" | "assistant";
  content: string;
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
};

type StoredTemplateCopilotMessage = {
  id: string;
  client_message_id: string;
  role: string;
  content: string;
  created_at: string;
};

export function orderTemplateCopilotMessages<
  Message extends StoredTemplateCopilotMessage,
>(messages: Message[]) {
  return [...messages].sort((left, right) => {
    const timeOrder =
      Date.parse(left.created_at) - Date.parse(right.created_at);
    if (timeOrder !== 0) return timeOrder;
    if (
      left.client_message_id === right.client_message_id &&
      left.role !== right.role
    ) {
      return left.role === "user" ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });
}

export function transcriptMessageFromStored(
  message: StoredTemplateCopilotMessage,
): TemplateCopilotTranscriptMessage {
  return {
    id: message.id,
    clientMessageId: message.client_message_id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    createdAt: message.created_at,
  };
}
