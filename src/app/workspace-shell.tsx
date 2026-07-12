import {
  ArrowRightLeft,
  Bell,
  ClipboardList,
  History,
  LogOut,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
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
  unreadCount,
  onRequestSignOut,
  onToggleSidebar,
}: {
  activeTab: WorkspaceTab;
  children: ReactNode;
  draftItemCount: number;
  sessionUser: string;
  sidebarCollapsed: boolean;
  syncLabel: string;
  unreadCount: number;
  onRequestSignOut: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#231f20]">
      <div
        className={`min-h-screen lg:grid ${
          sidebarCollapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[244px_1fr]"
        }`}
      >
        <aside className="max-w-full overflow-hidden border-b border-[#e6e6e6] bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-visible lg:border-b-0 lg:border-r">
          <div
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
              className={`h-auto w-[156px] sm:w-[168px] ${sidebarCollapsed ? "lg:hidden" : ""}`}
            />
            <span
              aria-label="Chun Wo"
              className={`hidden h-1 w-8 bg-[#f7941d] ${sidebarCollapsed ? "lg:block" : ""}`}
            />
            <button
              type="button"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggleSidebar}
              className={`ml-auto hidden size-10 items-center justify-center rounded-md border border-[#e6e6e6] bg-white text-[#4b4647] transition hover:border-[#f7941d] hover:bg-[#fff8ef] lg:flex ${
                sidebarCollapsed ? "" : "ml-auto"
              }`}
            >
              <ArrowRightLeft size={15} />
            </button>
          </div>

          <nav className="grid max-w-full grid-cols-5 gap-1 p-2 lg:block lg:space-y-1 lg:p-3">
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
              <div title="Unread notifications" className="flex min-h-10 items-center gap-2 rounded-md border border-[#e6e6e6] bg-white px-3 text-sm">
                <Bell size={16} className="text-[#7b791c]" />
                <span>{unreadCount} unread</span>
              </div>
              <div className="hidden min-h-10 items-center rounded-md border border-[#e6e6e6] bg-white px-3 text-sm text-[#4b4647] md:flex">
                {sessionUser}
              </div>
              <div className="hidden min-h-10 items-center rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-xs text-[#666162] xl:flex">
                {syncLabel}
              </div>
              <button
                type="button"
                onClick={onRequestSignOut}
                title="Sign out"
                className="flex size-10 items-center justify-center rounded-md border border-[#e6e6e6] bg-white text-[#4b4647] transition hover:border-[#f7941d] hover:bg-[#fff8ef]"
              >
                <LogOut size={16} />
              </button>
              <Link
                href={getNewRequestHref()}
                title="Create a new approval request"
                className="flex min-h-10 items-center gap-2 rounded-md border border-[#e6810c] bg-[#f7941d] px-4 text-sm font-medium text-[#231f20] transition hover:bg-[#e6810c]"
              >
                <Plus size={16} />
                New
              </Link>
            </div>
          </header>

          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
