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
  sanitizeWorkspaceStateSnapshot,
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
import { getWorkspaceAutosaveDelay } from "@/lib/workspace-autosave";
import type {
  AdminAuditEvent,
  ApprovalTask,
  BusinessUnit,
  FormLibraryDefinition,
  UserRoleAssignment,
  WorkflowTemplate,
} from "@/lib/types";

const workspaceStorageKey = "approval-workflow-workspace-v1";

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
  const [formLibrary, setFormLibrary] = useState<FormLibraryDefinition[]>(
    () => defaultWorkspaceState.formLibrary,
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
  const autosaveTargetRef = useRef<{
    snapshot: WorkspaceStateSnapshot;
    serialized: string;
  } | null>(null);
  const autosaveFailureCountRef = useRef(0);
  const remoteSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [autosaveRetryVersion, setAutosaveRetryVersion] = useState(0);

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
        setFormLibrary(saved.formLibrary || []);
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
        const repairedSnapshot = sanitizeWorkspaceStateSnapshot(result.snapshot);
        const remoteSnapshot = serializeWorkspaceState(repairedSnapshot);
        if (!localWorkspaceDirtyRef.current) {
          lastRemoteSnapshotRef.current = remoteSnapshot;
          setTasks(repairedSnapshot.approvalTasks);
          setBusinessDirectory(repairedSnapshot.businessDirectory);
          setTemplates(repairedSnapshot.workflowTemplates);
          setFormLibrary(repairedSnapshot.formLibrary || []);
          setRoleAssignments(repairedSnapshot.userRoleAssignments || []);
          setAdminAuditEvents(repairedSnapshot.adminAuditEvents || []);
          setSelectedTemplateId(repairedSnapshot.selectedTemplateId);
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
      formLibrary,
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
      if (autosaveTargetRef.current?.serialized === serializedSnapshot) {
        autosaveTargetRef.current = null;
      }
      autosaveFailureCountRef.current = 0;
      return;
    }

    if (autosaveTargetRef.current?.serialized !== serializedSnapshot) {
      autosaveTargetRef.current = { snapshot, serialized: serializedSnapshot };
      autosaveFailureCountRef.current = 0;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      const target = autosaveTargetRef.current;
      if (!target || target.serialized !== serializedSnapshot) {
        return;
      }

      const queuedSave = remoteSaveQueueRef.current.then(() => {
        if (autosaveTargetRef.current?.serialized !== target.serialized) {
          return null;
        }
        return saveRemoteWorkspaceState(target.snapshot);
      });
      remoteSaveQueueRef.current = queuedSave.then(
        () => undefined,
        () => undefined,
      );
      const result = await queuedSave;
      if (cancelled || !result) {
        return;
      }

      setWorkspaceSyncMode(result.mode);
      if (result.mode === "supabase") {
        lastRemoteSnapshotRef.current = target.serialized;
        if (autosaveTargetRef.current?.serialized === target.serialized) {
          autosaveTargetRef.current = null;
        }
        autosaveFailureCountRef.current = 0;
      } else if (autosaveTargetRef.current?.serialized === target.serialized) {
        autosaveFailureCountRef.current += 1;
      }
      setAutosaveRetryVersion((version) => version + 1);
    }, getWorkspaceAutosaveDelay(autosaveFailureCountRef.current));
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [adminAuditEvents, autosaveRetryVersion, businessDirectory, effectiveRoleAssignments, formLibrary, localWorkspaceReady, remoteWorkspaceReady, selectedTemplateId, tasks, templates]);

  const currentWorkspaceSnapshot = useMemo(
    () => ({
      approvalTasks: tasks,
      businessDirectory,
      workflowTemplates: templates,
      formLibrary,
      userRoleAssignments: effectiveRoleAssignments,
      adminAuditEvents,
      selectedTemplateId,
    }),
    [adminAuditEvents, businessDirectory, effectiveRoleAssignments, formLibrary, selectedTemplateId, tasks, templates],
  );

  async function persistWorkspaceSnapshot(snapshot: WorkspaceStateSnapshot) {
    localWorkspaceDirtyRef.current = true;
    const serializedSnapshot = serializeWorkspaceState(snapshot);
    window.localStorage.setItem(workspaceStorageKey, serializedSnapshot);
    autosaveTargetRef.current = { snapshot, serialized: serializedSnapshot };
    autosaveFailureCountRef.current = 0;
    const queuedSave = remoteSaveQueueRef.current.then(() =>
      saveRemoteWorkspaceState(snapshot),
    );
    remoteSaveQueueRef.current = queuedSave.then(
      () => undefined,
      () => undefined,
    );
    const result = await queuedSave;
    setWorkspaceSyncMode(result.mode);
    if (result.mode === "supabase") {
      lastRemoteSnapshotRef.current = serializedSnapshot;
      if (autosaveTargetRef.current?.serialized === serializedSnapshot) {
        autosaveTargetRef.current = null;
      }
    } else if (autosaveTargetRef.current?.serialized === serializedSnapshot) {
      autosaveFailureCountRef.current += 1;
      setAutosaveRetryVersion((version) => version + 1);
    }
    return result;
  }

  function buildWorkspaceSnapshot(
    patch: Partial<{
      approvalTasks: ApprovalTask[];
      businessDirectory: BusinessUnit[];
      workflowTemplates: WorkflowTemplate[];
      formLibrary: FormLibraryDefinition[];
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
    formLibrary,
    persistWorkspaceSnapshot,
    roleAssignments,
    selectedTaskId,
    selectedTemplateId,
    setBusinessDirectory,
    setRoleAssignments,
    setAdminAuditEvents,
    setFormLibrary,
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
