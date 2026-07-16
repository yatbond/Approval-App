"use client";

import {
  ArrowRightLeft,
  Bell,
  CheckCheck,
  ClipboardList,
  History,
  LogOut,
  Plus,
  ReceiptText,
  Rows3,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TaskNotification } from "@/lib/workflow-system";
import { ThemeToggle } from "./theme-toggle";
import {
  getNewRequestHref,
  workspaceNavigationTabIds,
  type WorkspaceTab,
} from "@/lib/workspace-tabs-state";

const tabDetails: Record<WorkspaceTab, { label: string; icon: React.ElementType }> = {
  queue: { label: "Queue", icon: ClipboardList },
  tracking: { label: "Tracking", icon: History },
  upload: { label: "Upload", icon: Plus },
  drafts: { label: "Drafts", icon: ReceiptText },
  workflow: { label: "Workflow", icon: Settings },
  forms: { label: "Forms", icon: Rows3 },
  admin: { label: "Admin", icon: ShieldCheck },
};

const tabs = workspaceNavigationTabIds.map((id) => ({
  id,
  ...tabDetails[id],
}));

export function WorkspaceShell({
  activeTab,
  children,
  draftItemCount,
  sessionUser,
  sidebarCollapsed,
  syncLabel,
  notifications,
  onRequestSignOut,
  onToggleSidebar,
}: {
  activeTab: WorkspaceTab;
  children: ReactNode;
  draftItemCount: number;
  sessionUser: string;
  sidebarCollapsed: boolean;
  syncLabel: string;
  notifications: TaskNotification[];
  onRequestSignOut: () => void;
  onToggleSidebar: () => void;
}) {
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const notificationStorageKey = useMemo(
    () => `approval-notifications-read:${sessionUser.trim().toLowerCase()}`,
    [sessionUser],
  );
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const readNotificationIdSet = useMemo(
    () => new Set(readNotificationIds),
    [readNotificationIds],
  );
  const unreadCount = notifications.filter(
    (notification) => notification.unread && !readNotificationIdSet.has(notification.id),
  ).length;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const savedIds = JSON.parse(window.localStorage.getItem(notificationStorageKey) || "[]");
        setReadNotificationIds(Array.isArray(savedIds) ? savedIds.filter((id) => typeof id === "string") : []);
      } catch {
        setReadNotificationIds([]);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [notificationStorageKey]);

  useEffect(() => {
    if (!notificationMenuOpen) {
      return;
    }

    function closeNotificationMenu(event: PointerEvent) {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeNotificationMenu);
    return () => document.removeEventListener("pointerdown", closeNotificationMenu);
  }, [notificationMenuOpen]);

  function saveReadNotificationIds(nextIds: string[]) {
    const uniqueIds = Array.from(new Set(nextIds));
    setReadNotificationIds(uniqueIds);
    window.localStorage.setItem(notificationStorageKey, JSON.stringify(uniqueIds));
  }

  function markNotificationRead(notificationId: string) {
    saveReadNotificationIds([...readNotificationIds, notificationId]);
    setNotificationMenuOpen(false);
  }

  function markAllNotificationsRead() {
    saveReadNotificationIds([
      ...readNotificationIds,
      ...notifications.filter((notification) => notification.unread).map((notification) => notification.id),
    ]);
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#231f20]">
      <div
        className={`min-h-screen lg:grid ${
          sidebarCollapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[244px_1fr]"
        }`}
      >
        <aside className="max-w-full overflow-hidden border-b border-[#e6e6e6] bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-visible lg:border-b-0 lg:border-r">
          <div
            data-brand-lockup
            className={`flex min-h-20 items-center gap-3 border-b border-[#e6e6e6] px-4 ${
              sidebarCollapsed ? "lg:justify-center" : "lg:justify-start lg:px-5"
            }`}
          >
            <Image
              src="/chunwo-logo.svg"
              alt="Chun Wo"
              width={168}
              height={45}
              priority
              className={`h-auto w-[156px] dark:hidden sm:w-[168px] ${sidebarCollapsed ? "lg:hidden" : ""}`}
            />
            <Image
              src="/chunwo-logo-dark.svg"
              alt="Chun Wo"
              width={168}
              height={45}
              priority
              className={`hidden h-auto w-[156px] dark:block sm:w-[168px] ${sidebarCollapsed ? "lg:hidden" : ""}`}
            />
            <span
              aria-label="Chun Wo"
              className={`hidden h-1 w-8 bg-[#f7941d] ${sidebarCollapsed ? "lg:block" : ""}`}
            />
            <button
              type="button"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggleSidebar}
              className={`ml-auto hidden size-10 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] bg-white text-[#4b4647] transition hover:border-[#f7941d] hover:bg-[#fff8ef] lg:flex ${
                sidebarCollapsed ? "" : "ml-auto"
              }`}
            >
              <ArrowRightLeft size={15} />
            </button>
          </div>

          <nav className="grid max-w-full grid-cols-3 gap-1 p-2 sm:grid-cols-6 lg:block lg:space-y-1 lg:p-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              const showDraftBadge = tab.id === "drafts" && draftItemCount > 0;
              return (
                <Link
                  key={tab.id}
                  href={`/?tab=${tab.id}`}
                  title={tab.label}
                  className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-1 text-[11px] transition lg:min-h-12 lg:w-full lg:flex-row lg:gap-2 lg:px-3 lg:text-sm ${
                    sidebarCollapsed ? "lg:justify-center lg:px-2" : "lg:justify-start"
                  } ${
                    active
                      ? "border-[#f7941d] bg-[#fff4e6] font-medium text-[#231f20]"
                      : "border-transparent text-[#666162] hover:border-[#e6e6e6] hover:bg-[#f7f7f5] hover:text-[#231f20]"
                  }`}
                >
                  <Icon size={18} />
                  <span className={`max-w-full truncate lg:inline ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                    {tab.label}
                  </span>
                  {showDraftBadge && (
                    <span
                      className={`absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full border border-[#f7941d]/40 bg-[#fff4e6] px-1.5 text-[10px] font-semibold text-[#713d00] lg:static lg:text-xs ${
                        sidebarCollapsed ? "lg:absolute lg:ml-7 lg:mt-[-18px]" : "lg:ml-auto"
                      }`}
                    >
                      {draftItemCount > 99 ? "99+" : draftItemCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-16 items-center justify-end border-b border-t-[3px] border-b-[#e6e6e6] border-t-[#f7941d] bg-white px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div ref={notificationMenuRef} className="relative">
                <button
                  type="button"
                  title="Open notifications"
                  aria-expanded={notificationMenuOpen}
                  aria-haspopup="dialog"
                  onClick={() => setNotificationMenuOpen((open) => !open)}
                  className="flex min-h-10 items-center gap-2 rounded-md border border-[#e6e6e6] bg-white px-3 text-sm transition hover:border-[#f7941d] hover:bg-[#fff8ef]"
                >
                  <Bell size={16} className="text-[#7b791c]" />
                  <span>{unreadCount} unread</span>
                </button>
                {notificationMenuOpen && (
                  <div
                    role="dialog"
                    aria-label="Notifications"
                    className="fixed inset-x-3 top-3 z-50 w-auto overflow-hidden rounded-md border border-[#e6e6e6] bg-white text-[#231f20] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(22rem,calc(100vw-1.5rem))]"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-[#e6e6e6] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">Notifications</p>
                        <p className="text-xs text-[#666162]">Requests requiring your attention or tracking.</p>
                      </div>
                      <button
                        type="button"
                        title="Close notifications"
                        onClick={() => setNotificationMenuOpen(false)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] bg-white"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {notifications.length ? (
                      <div className="max-h-[24rem] overflow-y-auto">
                        {notifications.map((notification) => {
                          const unread = notification.unread && !readNotificationIdSet.has(notification.id);
                          const destinationTab = notification.kind === "action_required" || notification.kind === "escalation"
                            ? "queue"
                            : "tracking";
                          return (
                            <Link
                              key={notification.id}
                              href={`/?tab=${destinationTab}&request=${encodeURIComponent(notification.requestId)}`}
                              onClick={() => markNotificationRead(notification.id)}
                              className="block border-b border-[#e6e6e6] px-4 py-3 transition last:border-b-0 hover:bg-[#fff8ef]"
                            >
                              <span className="flex items-start gap-3">
                                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-[#f7941d]" : "bg-[#d9d9d9]"}`} />
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold">{notification.title}</span>
                                  <span className="mt-1 block break-words text-xs text-[#666162]">{notification.body}</span>
                                  <span className="mt-1 block text-[11px] text-[#8a8a8a]">{notification.time}</span>
                                </span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-4 py-6 text-center text-sm text-[#666162]">No notifications.</p>
                    )}
                    {unreadCount > 0 && (
                      <div className="border-t border-[#e6e6e6] p-2">
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-[#713d00] transition hover:bg-[#fff8ef]"
                        >
                          <CheckCheck size={16} />
                          Mark all read
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden min-h-10 items-center rounded-md border border-[#e6e6e6] bg-white px-3 text-sm text-[#4b4647] md:flex">
                {sessionUser}
              </div>
              <div className="hidden min-h-10 items-center rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-xs text-[#666162] xl:flex">
                {syncLabel}
              </div>
              <ThemeToggle />
              <Link
                href={getNewRequestHref()}
                title="Create a new approval request"
                className="flex min-h-10 items-center gap-2 rounded-md border border-[#e6810c] bg-[#f7941d] px-4 text-sm font-medium text-[#231f20] transition hover:bg-[#e6810c]"
              >
                <Plus size={16} />
                New
              </Link>
              <button
                type="button"
                onClick={onRequestSignOut}
                title="Sign out"
                className="flex size-10 items-center justify-center rounded-md border border-[#e6e6e6] bg-white text-[#4b4647] transition hover:border-[#f7941d] hover:bg-[#fff8ef]"
              >
                <LogOut size={16} />
              </button>
            </div>
          </header>

          <div className="min-w-0 p-3 sm:p-4 md:p-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
