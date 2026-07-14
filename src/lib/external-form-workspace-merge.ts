import type { ApprovalTask } from "./types.ts";
import type { WorkspaceStateSnapshot } from "./workspace-persistence.ts";

export function mergeExternalFormWorkspaceState(
  incoming: WorkspaceStateSnapshot,
  persisted: WorkspaceStateSnapshot | null,
): WorkspaceStateSnapshot {
  if (!persisted) return incoming;
  const incomingById = new Map(incoming.approvalTasks.map((task) => [task.id, task]));
  const protectedTasks = persisted.approvalTasks.filter(
    (task) => (task.externalFormResponses || []).length > 0,
  );
  if (!protectedTasks.length) return incoming;

  for (const persistedTask of protectedTasks) {
    const incomingTask = incomingById.get(persistedTask.id);
    incomingById.set(
      persistedTask.id,
      incomingTask ? mergeTask(incomingTask, persistedTask) : persistedTask,
    );
  }
  const originalIds = new Set(incoming.approvalTasks.map((task) => task.id));
  return {
    ...incoming,
    approvalTasks: [
      ...Array.from(incomingById.values()).filter((task) => !originalIds.has(task.id)),
      ...incoming.approvalTasks.map((task) => incomingById.get(task.id) || task),
    ],
  };
}

function mergeTask(incoming: ApprovalTask, persisted: ApprovalTask): ApprovalTask {
  const incomingResponseIds = new Set(
    (incoming.externalFormResponses || []).map(responseKey),
  );
  const protectedResponses = (persisted.externalFormResponses || []).filter(
    (response) => !incomingResponseIds.has(responseKey(response)),
  );
  if (!protectedResponses.length) return incoming;

  const protectedAttachmentIds = new Set(
    protectedResponses.flatMap((response) => response.attachmentIds),
  );
  const incomingAttachmentIds = new Set((incoming.attachments || []).map((item) => item.id));
  const protectedAttachments = (persisted.attachments || []).filter(
    (attachment) =>
      protectedAttachmentIds.has(attachment.id) && !incomingAttachmentIds.has(attachment.id),
  );
  const protectedFieldLabels = new Set(
    protectedResponses.flatMap((response) => Object.keys(response.answers)),
  );
  const protectedFields = Object.fromEntries(
    Object.entries(persisted.extractedFields).filter(([label]) => protectedFieldLabels.has(label)),
  );
  const persistedEventIds = new Set(incoming.auditTrail.map((event) => event.id));
  const protectedEvents = persisted.auditTrail.filter(
    (event) =>
      !persistedEventIds.has(event.id) &&
      protectedResponses.some((response) => event.detail.includes(response.externalResponseId)),
  );

  return {
    ...incoming,
    extractedFields: { ...incoming.extractedFields, ...protectedFields },
    attachments: [...(incoming.attachments || []), ...protectedAttachments],
    externalFormResponses: [
      ...(incoming.externalFormResponses || []),
      ...protectedResponses,
    ],
    auditTrail: [...incoming.auditTrail, ...protectedEvents],
    lastAction: protectedEvents.length ? persisted.lastAction : incoming.lastAction,
  };
}

function responseKey(response: NonNullable<ApprovalTask["externalFormResponses"]>[number]) {
  return `${response.provider}:${response.externalResponseId}`;
}
