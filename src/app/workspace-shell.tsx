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
  Upload,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceTab } from "@/lib/workspace-tabs-state";

const tabs: { id: WorkspaceTab; label: string; icon: React.ElementType }[] = [
  { id: "queue", label: "Queue", icon: ClipboardList },
  { id: "tracking", label: "Tracking", icon: History },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "drafts", label: "Drafts", icon: ReceiptText },
  { id: "workflow", label: "Workflow", icon: Settings },
  { id: "admin", label: "Admin", icon: ShieldCheck },
];

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
    <main className="min-h-screen bg-[#101214] text-neutral-100">
      <div
        className={`min-h-screen lg:grid ${
          sidebarCollapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[244px_1fr]"
        }`}
      >
        <aside className="max-w-full overflow-hidden border-b border-white/10 bg-[#171a1d] lg:overflow-visible lg:border-b-0 lg:border-r">
          <div
            className={`flex min-h-16 items-center justify-center gap-2 border-b border-white/10 px-3 ${
              sidebarCollapsed ? "lg:justify-center" : "lg:justify-start lg:px-5"
            }`}
          >
            <div className="flex size-10 items-center justify-center rounded-md bg-emerald-500 text-[#101214]">
              <ShieldCheck size={22} />
            </div>
            <div className={`hidden lg:block ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <p className="text-sm font-semibold">Approval App</p>
              <p className="text-xs text-neutral-400">MVP workspace</p>
            </div>
            <button
              type="button"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggleSidebar}
              className={`hidden size-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.07] lg:flex ${
                sidebarCollapsed ? "" : "ml-auto"
              }`}
            >
              <ArrowRightLeft size={15} />
            </button>
          </div>

          <nav className="grid max-w-full grid-cols-3 gap-2 p-2 sm:grid-cols-6 lg:block lg:space-y-1 lg:p-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              const showDraftBadge = tab.id === "drafts" && draftItemCount > 0;
              return (
                <Link
                  key={tab.id}
                  href={`/?tab=${tab.id}`}
                  title={tab.label}
                  className={`relative flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm transition lg:w-full ${
                    sidebarCollapsed ? "lg:justify-center lg:px-2" : "lg:justify-start"
                  } ${
                    active
                      ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-100"
                      : "border-transparent text-neutral-400 hover:border-white/10 hover:bg-white/5 hover:text-neutral-100"
                  }`}
                >
                  <Icon size={18} />
                  <span className={`hidden lg:inline ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                    {tab.label}
                  </span>
                  {showDraftBadge && (
                    <span
                      className={`inline-flex min-w-5 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/15 px-1.5 text-xs font-semibold text-amber-100 ${
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
          <header className="flex min-h-16 flex-col justify-center gap-3 border-b border-white/10 bg-[#15181b] px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-normal md:text-2xl">
                General approval workflow
              </h1>
              <p className="text-sm text-neutral-400">
                Dynamic departments, AI/OCR parsing, approvals, delegation, deadlines, and escalation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm">
                <Bell size={16} className="text-amber-200" />
                <span>{unreadCount} unread</span>
              </div>
              <div className="hidden min-h-11 items-center rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-neutral-300 md:flex">
                {sessionUser}
              </div>
              <div className="hidden min-h-11 items-center rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-neutral-400 xl:flex">
                {syncLabel}
              </div>
              <button
                type="button"
                onClick={onRequestSignOut}
                title="Sign out"
                className="flex size-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                <LogOut size={16} />
              </button>
              <Link
                href="/?tab=upload"
                className="flex min-h-11 items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={16} />
                New request
              </Link>
            </div>
          </header>

          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
