"use client";

import {
  Bell,
  CheckCheck,
  ClipboardList,
  Cloud,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ReceiptText,
  Rows3,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TaskNotification } from "@/lib/workflow-system";
import {
  formatWorkspaceAutosaveBytes,
  type WorkspaceAutosaveMonitor,
} from "@/lib/workspace-autosave";
import { ThemeToggle } from "./theme-toggle";
import {
  getNewRequestHref,
  workspaceNavigationTabIds,
  type WorkspaceTab,
} from "@/lib/workspace-tabs-state";
import { BuildVersionIndicator } from "./build-version-indicator";

const tabDetails: Record<WorkspaceTab, { label: string; icon: React.ElementType }> = {
  queue: { label: "Inbox", icon: ClipboardList },
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
  autosaveMonitor,
  children,
  draftItemCount,
  sessionUser,
  sidebarCollapsed,
  syncLabel,
  notifications,
  onRequestSignOut,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onToggleSidebar,
}: {
  activeTab: WorkspaceTab;
  autosaveMonitor: WorkspaceAutosaveMonitor;
  children: ReactNode;
  draftItemCount: number;
  sessionUser: string;
  sidebarCollapsed: boolean;
  syncLabel: string;
  notifications: TaskNotification[];
  onRequestSignOut: () => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onToggleSidebar: () => void;
}) {
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const notificationTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationDialogRef = useRef<HTMLDivElement>(null);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  const syncTriggerRef = useRef<HTMLButtonElement>(null);
  const syncDialogRef = useRef<HTMLDivElement>(null);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const unreadCount = notifications.filter((notification) => notification.unread).length;

  useEffect(() => {
    if (!notificationMenuOpen) {
      return;
    }

    function closeNotificationMenu(event: PointerEvent) {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationMenuOpen(false);
      }
    }

    function closeNotificationMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationMenuOpen(false);
        window.requestAnimationFrame(() => notificationTriggerRef.current?.focus());
      }
    }

    document.addEventListener("pointerdown", closeNotificationMenu);
    document.addEventListener("keydown", closeNotificationMenuWithKeyboard);
    notificationDialogRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeNotificationMenu);
      document.removeEventListener("keydown", closeNotificationMenuWithKeyboard);
    };
  }, [notificationMenuOpen]);

  useEffect(() => {
    if (!syncMenuOpen) {
      return;
    }

    function closeSyncMenu(event: PointerEvent) {
      if (!syncMenuRef.current?.contains(event.target as Node)) {
        setSyncMenuOpen(false);
      }
    }


    function closeSyncMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSyncMenuOpen(false);
        window.requestAnimationFrame(() => syncTriggerRef.current?.focus());
      }
    }

    document.addEventListener("pointerdown", closeSyncMenu);
    document.addEventListener("keydown", closeSyncMenuWithKeyboard);
    syncDialogRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeSyncMenu);
      document.removeEventListener("keydown", closeSyncMenuWithKeyboard);
    };
  }, [syncMenuOpen]);

  function markNotificationRead(notificationId: string) {
    onMarkNotificationRead(notificationId);
    setNotificationMenuOpen(false);
  }

  function markAllNotificationsRead() {
    onMarkAllNotificationsRead();
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#231f20]">
      <div
        className={`min-h-screen lg:grid ${
          sidebarCollapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[244px_1fr]"
        }`}
      >
        <aside className="max-w-full overflow-hidden border-b border-[#e6e6e6] bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
          <div data-brand-lockup className="border-b border-[#e6e6e6]">
            <div className="flex min-h-20 items-center px-4 lg:hidden">
              <Image
                src="/chunwo-logo.svg"
                alt="Chun Wo"
                width={168}
                height={45}
                priority
                className="h-auto w-[156px] dark:hidden sm:w-[168px]"
              />
              <Image
                src="/chunwo-logo-dark.svg"
                alt="Chun Wo"
                width={168}
                height={45}
                priority
                className="hidden h-auto w-[156px] dark:block sm:w-[168px]"
              />
            </div>

            {sidebarCollapsed ? (
              <div className="hidden min-h-28 flex-col items-center justify-center gap-2 py-3 lg:flex">
                <Image
                  src="/chunwo-mark.svg"
                  alt="Chun Wo"
                  width={42}
                  height={30}
                  priority
                  className="h-8 w-auto"
                />
                <button
                  type="button"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                  onClick={onToggleSidebar}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] bg-white text-[#4b4647] transition hover:border-[#f7941d] hover:bg-[#fff8ef]"
                >
                  <PanelLeftOpen className="size-[18px]" />
                </button>
              </div>
            ) : (
              <div className="hidden min-h-20 items-center gap-2 px-4 lg:flex">
                <Image
                  src="/chunwo-logo.svg"
                  alt="Chun Wo"
                  width={168}
                  height={45}
                  priority
                  className="h-auto w-[150px] dark:hidden"
                />
                <Image
                  src="/chunwo-logo-dark.svg"
                  alt="Chun Wo"
                  width={168}
                  height={45}
                  priority
                  className="hidden h-auto w-[150px] dark:block"
                />
                <button
                  type="button"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                  onClick={onToggleSidebar}
                  className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] bg-white text-[#4b4647] transition hover:border-[#f7941d] hover:bg-[#fff8ef]"
                >
                  <PanelLeftClose className="size-[18px]" />
                </button>
              </div>
            )}
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
                  aria-label={sidebarCollapsed ? tab.label : undefined}
                  className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-1 text-[11px] transition lg:min-h-12 lg:w-full lg:flex-row lg:gap-2 lg:text-sm ${
                    sidebarCollapsed ? "lg:px-0" : "lg:justify-start lg:px-3"
                  } ${
                    active
                      ? "border-[#f7941d] bg-[#fff4e6] font-medium text-[#231f20]"
                      : "border-transparent text-[#666162] hover:border-[#e6e6e6] hover:bg-[#f7f7f5] hover:text-[#231f20]"
                  }`}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="max-w-full truncate lg:hidden">{tab.label}</span>
                  {!sidebarCollapsed && (
                    <span className="hidden max-w-full truncate lg:inline">{tab.label}</span>
                  )}
                  {showDraftBadge && (
                    <span
                      className={`absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full border border-[#f7941d]/40 bg-[#fff4e6] px-1.5 text-[10px] font-semibold text-[#713d00] lg:static lg:text-xs ${
                        sidebarCollapsed ? "lg:absolute lg:right-0 lg:top-0" : "lg:ml-auto"
                      }`}
                    >
                      {draftItemCount > 99 ? "99+" : draftItemCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <BuildVersionIndicator collapsed={sidebarCollapsed} />
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-16 items-center justify-end border-b border-t-[3px] border-b-[#e6e6e6] border-t-[#f7941d] bg-white px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div ref={notificationMenuRef} className="relative">
                <button
                  ref={notificationTriggerRef}
                  type="button"
                  title="Open notifications"
                  aria-label={`Open notifications, ${unreadCount} unread`}
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
                    ref={notificationDialogRef}
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
                        aria-label="Close notifications"
                        onClick={() => setNotificationMenuOpen(false)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] bg-white"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {notifications.length ? (
                      <div className="max-h-[24rem] overflow-y-auto">
                        {notifications.map((notification) => {
                          const unread = notification.unread;
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
              <div ref={syncMenuRef} className="relative">
                <button
                  ref={syncTriggerRef}
                  type="button"
                  title="View autosave status"
                  aria-label="View autosave status"
                  aria-expanded={syncMenuOpen}
                  aria-haspopup="dialog"
                  onClick={() => setSyncMenuOpen((open) => !open)}
                  className="flex size-10 items-center justify-center gap-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] text-xs text-[#666162] transition hover:border-[#f7941d] hover:bg-[#fff8ef] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 xl:h-10 xl:w-auto xl:px-3"
                >
                  <Cloud size={16} />
                  <span className="hidden xl:inline">{syncLabel}</span>
                </button>
                {syncMenuOpen && (
                  <div
                    ref={syncDialogRef}
                    role="dialog"
                    aria-label="Autosave status"
                    tabIndex={-1}
                    className="fixed inset-x-3 top-3 z-50 w-auto rounded-md border border-[#e6e6e6] bg-white p-4 text-[#231f20] shadow-xl dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-72"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">Autosave status</p>
                      <span className="text-xs text-[#666162] dark:text-neutral-400">
                        {syncLabel}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                      <dt className="text-[#666162] dark:text-neutral-400">Last saved</dt>
                      <dd className="text-right">
                        {autosaveMonitor.lastSuccessAt
                          ? new Date(autosaveMonitor.lastSuccessAt).toLocaleString()
                          : "Not yet"}
                      </dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Upload</dt>
                      <dd className="text-right">
                        {formatWorkspaceAutosaveBytes(autosaveMonitor.payloadBytes)}
                      </dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Stored snapshot</dt>
                      <dd className="text-right">
                        {formatWorkspaceAutosaveBytes(autosaveMonitor.persistedBytes)}
                      </dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Duration</dt>
                      <dd className="text-right">{autosaveMonitor.durationMs} ms</dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Retries</dt>
                      <dd className="text-right">{autosaveMonitor.retryCount}</dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Failures</dt>
                      <dd className="text-right">{autosaveMonitor.failureCount}</dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Unchanged skips</dt>
                      <dd className="text-right">{autosaveMonitor.unchangedCount}</dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Images moved</dt>
                      <dd className="text-right">{autosaveMonitor.assetsUploaded}</dd>
                      <dt className="text-[#666162] dark:text-neutral-400">Snapshot reduced</dt>
                      <dd className="text-right">
                        {formatWorkspaceAutosaveBytes(
                          autosaveMonitor.removedBase64Bytes,
                        )}
                      </dd>
                    </dl>
                    {autosaveMonitor.error && (
                      <p className="mt-3 break-words border-t border-[#e6e6e6] pt-3 text-xs text-rose-700 dark:border-neutral-800 dark:text-rose-300">
                        {autosaveMonitor.error}
                      </p>
                    )}
                  </div>
                )}
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
                aria-label="Sign out"
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
