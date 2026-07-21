import type { TaskNotification } from "@/lib/workflow-system";

export async function loadApprovalNotifications(limit = 50) {
  const response = await fetch(`/api/notifications?limit=${limit}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load notifications.");
  const payload = (await response.json()) as { notifications?: TaskNotification[] };
  return Array.isArray(payload.notifications) ? payload.notifications : [];
}

export async function markApprovalNotificationsRead(ids?: string[]) {
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { ids } : { all: true }),
  });
  if (!response.ok) throw new Error("Unable to update notification read state.");
}
