import type { ApprovalActor, ApprovalTask } from "./types.ts";

export function saveTaskFormValuesState({
  tasks,
  taskId,
  values,
  actor,
  savedAt = new Date().toISOString(),
}: {
  tasks: ApprovalTask[];
  taskId: string;
  values: Record<string, string>;
  actor: ApprovalActor;
  savedAt?: string;
}) {
  let didUpdate = false;
  const nextValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.trim()]),
  );
  const nextTasks = tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }
    const hasChange = Object.entries(nextValues).some(
      ([key, value]) => (task.extractedFields[key] || "") !== value,
    );
    if (!hasChange) {
      return task;
    }
    didUpdate = true;
    return {
      ...task,
      extractedFields: { ...task.extractedFields, ...nextValues },
      participants: Array.from(new Set([...task.participants, actor.email])),
      lastAction: `Form updated by ${actor.name}`,
      auditTrail: [
        ...task.auditTrail,
        {
          id: `${task.id}-event-${task.auditTrail.length + 1}`,
          action: "amended" as const,
          actor: actor.name,
          actorEmail: actor.email,
          timestamp: savedAt,
          detail: "Updated the form for the current workflow box.",
        },
      ],
    };
  });
  return { didUpdate, tasks: didUpdate ? nextTasks : tasks };
}
