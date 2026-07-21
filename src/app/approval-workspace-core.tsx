"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ConfirmationModal } from "@/app/confirmation-modal";
import { loadCanonicalApprovalMe } from "@/lib/approval-client";
import { useApprovalWorkspaceState } from "@/app/use-approval-workspace-state";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getApprovalWorkspaceTaskState } from "@/lib/approval-workspace-task-state";
import {
  getSignOutConfirmation,
  type ConfirmationRequest,
} from "@/lib/confirmation-policy";
import type { WorkflowTemplate } from "@/lib/types";
import {
  getWorkspaceNavigationActiveTab,
  type WorkspaceTab,
} from "@/lib/workspace-tabs-state";
import {
  getWorkspaceShellState,
} from "@/lib/workspace-shell-state";
import { buildTaskNotifications } from "@/lib/workflow-system";
import type { TaskNotification } from "@/lib/workflow-system";
import {
  loadApprovalNotifications,
  markApprovalNotificationsRead,
} from "@/lib/approval-notifications-client";
import { getLocalUploadDraftCount } from "@/lib/upload-draft-badge-state";
import type { UserDirectoryEntry } from "@/lib/user-directory";

export type ApprovalWorkspaceProps = {
  allowLegacyReadFallback: boolean;
  initialTab: WorkspaceTab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
  startNewRequest?: boolean;
};

type WorkspaceState = ReturnType<typeof useApprovalWorkspaceState>;
type WorkspaceTaskState = ReturnType<typeof getApprovalWorkspaceTaskState>;

type ApprovalWorkspaceCoreValue = {
  activeTab: WorkspaceTab;
  activeUser: UserDirectoryEntry;
  departments: string[];
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
  setDraftItemCount: Dispatch<SetStateAction<number>>;
  shouldStartNewUploadRequest: boolean;
  taskNotifications: ReturnType<typeof buildTaskNotifications>;
  taskState: WorkspaceTaskState;
  workspace: WorkspaceState;
};

const ApprovalWorkspaceCoreContext =
  createContext<ApprovalWorkspaceCoreValue | null>(null);

export function useApprovalWorkspaceCore() {
  const value = useContext(ApprovalWorkspaceCoreContext);
  if (!value) {
    throw new Error(
      "useApprovalWorkspaceCore must be used inside ApprovalWorkspaceCoreProvider.",
    );
  }
  return value;
}

function readLocalDraftCount(activeUserEmail: string) {
  try {
    return getLocalUploadDraftCount({
      activeDraftId:
        window.localStorage.getItem(
          `approval-upload-active-draft-id-v1:${activeUserEmail}`,
        ) || "",
      currentDraftJson:
        window.localStorage.getItem(
          `approval-upload-request-draft-v1:${activeUserEmail}`,
        ) || "",
      savedDraftsJson:
        window.localStorage.getItem(
          `approval-upload-request-drafts-v1:${activeUserEmail}`,
        ) || "[]",
    });
  } catch {
    return 0;
  }
}

export function ApprovalWorkspaceCoreProvider({
  allowLegacyReadFallback,
  children,
  departments,
  initialTab,
  requestId = "",
  sessionUser,
  startNewRequest = false,
  workflowTemplates,
}: ApprovalWorkspaceProps & { children: ReactNode }) {
  const activeTab = initialTab;
  const shouldStartNewUploadRequest =
    activeTab === "upload" && startNewRequest;
  const navigationActiveTab = getWorkspaceNavigationActiveTab({
    activeTab,
    isNewRequest: shouldStartNewUploadRequest,
  });
  const fallbackActiveUser = useMemo<UserDirectoryEntry>(
    () => ({
      name: sessionUser.includes("@") ? sessionUser.split("@")[0] : sessionUser,
      email: sessionUser.includes("@") ? sessionUser : "derrick@example.com",
      role: "participant",
    }),
    [sessionUser],
  );
  const [activeUser, setActiveUser] = useState(fallbackActiveUser);
  useEffect(() => {
    let cancelled = false;
    void loadCanonicalApprovalMe()
      .then((profile) => {
        if (cancelled) return;
        const supportedRole = [
          "superuser",
          "originator",
          "approver",
          "reviewer",
          "fyi",
          "current actor",
          "previous actor",
          "participant",
        ].includes(profile.role)
          ? (profile.role as UserDirectoryEntry["role"])
          : "participant";
        setActiveUser({
          name: profile.fullName,
          email: profile.email,
          role: profile.isAdmin ? "superuser" : supportedRole,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const workspace = useApprovalWorkspaceState({
    activeUser,
    allowLegacyReadFallback,
    requestId,
    workflowTemplates,
  });
  const taskState = useMemo(
    () =>
      getApprovalWorkspaceTaskState({
        tasks: workspace.tasks,
        templates: workspace.templates,
        selectedTaskId: workspace.selectedTaskId,
        activeUserEmail: activeUser.email,
      }),
    [
      activeUser.email,
      workspace.selectedTaskId,
      workspace.tasks,
      workspace.templates,
    ],
  );
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null);
  const confirmationResolverRef = useRef<
    ((confirmed: boolean) => void) | null
  >(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [draftItemCount, setDraftItemCount] = useState(0);

  const requestConfirmation = useCallback((request: ConfirmationRequest) => {
    confirmationResolverRef.current?.(false);
    setConfirmationRequest(request);
    return new Promise<boolean>((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  }, []);

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    const resolver = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmationRequest(null);
    resolver?.(confirmed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setDraftItemCount(readLocalDraftCount(activeUser.email));
      }
    });
    fetch("/api/upload-drafts")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && Array.isArray(payload?.drafts)) {
          setDraftItemCount((current) =>
            Math.max(current, payload.drafts.length),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeUser.email]);

  const taskNotifications = useMemo(
    () => buildTaskNotifications(workspace.tasks),
    [workspace.tasks],
  );
  const [authoritativeNotifications, setAuthoritativeNotifications] = useState<TaskNotification[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadApprovalNotifications()
      .then((notifications) => {
        if (!cancelled) setAuthoritativeNotifications(notifications);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeUser.email, workspace.tasks]);
  const displayedNotifications = authoritativeNotifications;
  const shellState = useMemo(
    () =>
      getWorkspaceShellState({
        baseNotifications: [],
        draftItemCount,
        taskNotifications: displayedNotifications,
        workspaceAutosaveStatus: workspace.workspaceAutosaveMonitor.status,
        workspaceSyncMode: workspace.workspaceSyncMode,
      }),
    [
      draftItemCount,
      displayedNotifications,
      workspace.workspaceAutosaveMonitor.status,
      workspace.workspaceSyncMode,
    ],
  );

  async function confirmSignOut() {
    const confirmed = await requestConfirmation(getSignOutConfirmation());
    if (confirmed) {
      window.location.href = "/logout";
    }
  }

  const contextValue: ApprovalWorkspaceCoreValue = {
    activeTab,
    activeUser,
    departments,
    requestConfirmation,
    setDraftItemCount,
    shouldStartNewUploadRequest,
    taskNotifications,
    taskState,
    workspace,
  };

  return (
    <ApprovalWorkspaceCoreContext.Provider value={contextValue}>
      <WorkspaceShell
        activeTab={navigationActiveTab}
        sessionUser={sessionUser}
        sidebarCollapsed={sidebarCollapsed}
        syncLabel={shellState.syncLabel}
        autosaveMonitor={workspace.workspaceAutosaveMonitor}
        draftItemCount={shellState.draftItemCount}
        notifications={displayedNotifications}
        onMarkNotificationRead={(id) => {
          setAuthoritativeNotifications((items) => items.map((item) => item.id === id ? { ...item, unread: false } : item));
          void markApprovalNotificationsRead([id]);
        }}
        onMarkAllNotificationsRead={() => {
          setAuthoritativeNotifications((items) => items.map((item) => ({ ...item, unread: false })));
          void markApprovalNotificationsRead();
        }}
        onRequestSignOut={() => void confirmSignOut()}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      >
        {children}
      </WorkspaceShell>
      <ConfirmationModal
        request={confirmationRequest}
        onCancel={() => resolveConfirmation(false)}
        onConfirm={() => resolveConfirmation(true)}
      />
    </ApprovalWorkspaceCoreContext.Provider>
  );
}
