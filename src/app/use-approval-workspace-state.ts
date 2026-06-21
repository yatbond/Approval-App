"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { approvalTasks } from "@/lib/mock-data";
import { seededBusinessDirectory } from "@/lib/business-directory";
import { applyEscalationChecks } from "@/lib/approval-escalation";
import {
  createDefaultWorkspaceSnapshot,
  createWorkspaceSnapshotPatch,
  getInitialSelectedTaskId,
  shouldLoadRemoteWorkspace,
} from "@/lib/workspace-bootstrap";
import {
  parseWorkspaceState,
  serializeWorkspaceState,
  type WorkspaceStateSnapshot,
} from "@/lib/workspace-persistence";
import {
  buildDefaultRoleAssignments,
  buildUserDirectory,
  type UserDirectoryEntry,
} from "@/lib/user-directory";
import {
  loadRemoteWorkspaceState,
  saveRemoteWorkspaceState,
} from "@/lib/workspace-sync";
import type {
  AdminAuditEvent,
  ApprovalTask,
  BusinessUnit,
  UserRoleAssignment,
  WorkflowTemplate,
} from "@/lib/types";

const workspaceStorageKey = "approval-workflow-workspace-v1";
const remoteAutosaveDelayMs = 30_000;

function readSavedWorkspaceState() {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(workspaceStorageKey);
  return saved ? parseWorkspaceState(saved) : null;
}

export function useApprovalWorkspaceState({
  activeUser,
  requestId,
  workflowTemplates,
}: {
  activeUser: UserDirectoryEntry;
  requestId: string;
  workflowTemplates: WorkflowTemplate[];
}) {
  const defaultWorkspaceState = useMemo(
    () =>
      createDefaultWorkspaceSnapshot({
        activeUser,
        approvalTasks,
        businessDirectory: seededBusinessDirectory,
        workflowTemplates,
      }),
    [activeUser, workflowTemplates],
  );
  const [savedWorkspaceState, setSavedWorkspaceState] =
    useState<WorkspaceStateSnapshot | null>(null);
  const [localWorkspaceReady, setLocalWorkspaceReady] = useState(false);
  const [tasks, setTasks] = useState<ApprovalTask[]>(
    () => defaultWorkspaceState.approvalTasks,
  );
  const [businessDirectory, setBusinessDirectory] = useState<BusinessUnit[]>(
    () => defaultWorkspaceState.businessDirectory,
  );
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(
    () => defaultWorkspaceState.workflowTemplates,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    () => defaultWorkspaceState.selectedTemplateId,
  );
  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>(
    () => defaultWorkspaceState.userRoleAssignments,
  );
  const [adminAuditEvents, setAdminAuditEvents] = useState<AdminAuditEvent[]>(
    () => defaultWorkspaceState.adminAuditEvents,
  );
  const [selectedTaskId, setSelectedTaskId] = useState(() =>
    getInitialSelectedTaskId({
      requestId,
      savedApprovalTasks: [],
      seedApprovalTasks: approvalTasks,
    }),
  );
  const [workspaceSyncMode, setWorkspaceSyncMode] = useState<"loading" | "supabase" | "local">(
    "loading",
  );
  const [remoteWorkspaceReady, setRemoteWorkspaceReady] = useState(false);
  const lastRemoteSnapshotRef = useRef<string | null>(null);
  const localWorkspaceDirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const loadTimerId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const saved = readSavedWorkspaceState();
      if (saved) {
        const serializedSnapshot = serializeWorkspaceState(saved);
        lastRemoteSnapshotRef.current = serializedSnapshot;
        setSavedWorkspaceState(saved);
        setTasks(saved.approvalTasks);
        setBusinessDirectory(saved.businessDirectory);
        setTemplates(saved.workflowTemplates);
        setRoleAssignments(saved.userRoleAssignments || []);
        setAdminAuditEvents(saved.adminAuditEvents || []);
        setSelectedTemplateId(saved.selectedTemplateId);
        setSelectedTaskId(
          getInitialSelectedTaskId({
            requestId,
            savedApprovalTasks: saved.approvalTasks,
            seedApprovalTasks: approvalTasks,
          }),
        );
        setWorkspaceSyncMode("local");
        setRemoteWorkspaceReady(true);
      }
      setLocalWorkspaceReady(true);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimerId);
    };
  }, [requestId]);

  useEffect(() => {
    if (!shouldLoadRemoteWorkspace({ localWorkspaceReady, savedWorkspaceState })) {
      return;
    }

    let cancelled = false;
    let loadTimerId: number | undefined;
    let idleCallbackId: number | undefined;
    const windowWithIdle = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    async function loadWorkspace() {
      const result = await loadRemoteWorkspaceState();
      if (cancelled) {
        return;
      }

      if (result.mode === "supabase" && result.snapshot) {
        const remoteSnapshot = serializeWorkspaceState(result.snapshot);
        if (!localWorkspaceDirtyRef.current) {
          lastRemoteSnapshotRef.current = remoteSnapshot;
          setTasks(result.snapshot.approvalTasks);
          setBusinessDirectory(result.snapshot.businessDirectory);
          setTemplates(result.snapshot.workflowTemplates);
          setRoleAssignments(result.snapshot.userRoleAssignments || []);
          setAdminAuditEvents(result.snapshot.adminAuditEvents || []);
          setSelectedTemplateId(result.snapshot.selectedTemplateId);
        }
      }
      setWorkspaceSyncMode(result.mode);
      setRemoteWorkspaceReady(true);
    }

    const startLoad = () => {
      void loadWorkspace();
    };

    if (windowWithIdle.requestIdleCallback) {
      idleCallbackId = windowWithIdle.requestIdleCallback(startLoad, { timeout: 2500 });
    } else {
      loadTimerId = window.setTimeout(startLoad, 1200);
    }

    return () => {
      cancelled = true;
      if (idleCallbackId !== undefined) {
        windowWithIdle.cancelIdleCallback?.(idleCallbackId);
      }
      if (loadTimerId !== undefined) {
        window.clearTimeout(loadTimerId);
      }
    };
  }, [localWorkspaceReady, savedWorkspaceState]);

  useEffect(() => {
    const applyChecks = () => {
      setTasks((items) => applyEscalationChecks(items, templates));
    };
    applyChecks();
    const intervalId = window.setInterval(applyChecks, 60_000);
    return () => window.clearInterval(intervalId);
  }, [templates]);

  const userDirectory = useMemo(
    () => buildUserDirectory(tasks, templates, activeUser),
    [activeUser, tasks, templates],
  );
  const effectiveRoleAssignments = useMemo(() => {
    const knownEmails = new Set(roleAssignments.map((assignment) => assignment.email));
    const missingUsers = userDirectory.filter((user) => !knownEmails.has(user.email));
    return missingUsers.length
      ? [
          ...roleAssignments,
          ...buildDefaultRoleAssignments(missingUsers, businessDirectory),
        ]
      : roleAssignments;
  }, [businessDirectory, roleAssignments, userDirectory]);

  useEffect(() => {
    if (!localWorkspaceReady) {
      return;
    }

    const snapshot = {
      approvalTasks: tasks,
      businessDirectory,
      workflowTemplates: templates,
      userRoleAssignments: effectiveRoleAssignments,
      adminAuditEvents,
      selectedTemplateId,
    };
    const serializedSnapshot = serializeWorkspaceState(snapshot);
    window.localStorage.setItem(workspaceStorageKey, serializedSnapshot);

    if (!remoteWorkspaceReady) {
      return;
    }

    if (lastRemoteSnapshotRef.current === serializedSnapshot) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const result = await saveRemoteWorkspaceState(snapshot);
      setWorkspaceSyncMode(result.mode);
      if (result.mode === "supabase") {
        lastRemoteSnapshotRef.current = serializedSnapshot;
      }
    }, remoteAutosaveDelayMs);
    return () => window.clearTimeout(timeoutId);
  }, [adminAuditEvents, businessDirectory, effectiveRoleAssignments, localWorkspaceReady, remoteWorkspaceReady, selectedTemplateId, tasks, templates]);

  const currentWorkspaceSnapshot = useMemo(
    () => ({
      approvalTasks: tasks,
      businessDirectory,
      workflowTemplates: templates,
      userRoleAssignments: effectiveRoleAssignments,
      adminAuditEvents,
      selectedTemplateId,
    }),
    [adminAuditEvents, businessDirectory, effectiveRoleAssignments, selectedTemplateId, tasks, templates],
  );

  async function persistWorkspaceSnapshot(snapshot: WorkspaceStateSnapshot) {
    localWorkspaceDirtyRef.current = true;
    const serializedSnapshot = serializeWorkspaceState(snapshot);
    window.localStorage.setItem(workspaceStorageKey, serializedSnapshot);
    const result = await saveRemoteWorkspaceState(snapshot);
    setWorkspaceSyncMode(result.mode);
    if (result.mode === "supabase") {
      lastRemoteSnapshotRef.current = serializedSnapshot;
    }
  }

  function buildWorkspaceSnapshot(
    patch: Partial<{
      approvalTasks: ApprovalTask[];
      businessDirectory: BusinessUnit[];
      workflowTemplates: WorkflowTemplate[];
      userRoleAssignments: UserRoleAssignment[];
      selectedTemplateId: string;
      adminAuditEvents: AdminAuditEvent[];
    }> = {},
  ) {
    return createWorkspaceSnapshotPatch(currentWorkspaceSnapshot, patch);
  }

  return {
    adminAuditEvents,
    businessDirectory,
    buildWorkspaceSnapshot,
    effectiveRoleAssignments,
    persistWorkspaceSnapshot,
    roleAssignments,
    selectedTaskId,
    selectedTemplateId,
    setBusinessDirectory,
    setRoleAssignments,
    setAdminAuditEvents,
    setSelectedTaskId,
    setSelectedTemplateId,
    setTasks,
    setTemplates,
    tasks,
    templates,
    userDirectory,
    workspaceSyncMode,
  };
}
