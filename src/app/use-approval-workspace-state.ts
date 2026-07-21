"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approvalTasks } from "@/lib/mock-data";
import {
  ApprovalApiError,
  loadCanonicalApprovalRequest,
  loadCanonicalApprovalTasks,
} from "@/lib/approval-client";
import { seededBusinessDirectory } from "@/lib/business-directory";
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
import {
  getWorkspaceAutosaveDelay,
  initialWorkspaceAutosaveMonitor,
} from "@/lib/workspace-autosave";
import type {
  AdminAuditEvent,
  ApprovalTask,
  BusinessUnit,
  FormLibraryDefinition,
  UserRoleAssignment,
  WorkflowTemplate,
} from "@/lib/types";

const workspaceStorageKey = "approval-workflow-workspace-v1";
const requestCacheVersion = 2;

function requestCacheKey(email: string) {
  return `approval-workflow-request-cache-v2:${email.trim().toLowerCase()}`;
}

function readSavedWorkspaceState(
  activeUserEmail: string,
  allowLegacyReadFallback: boolean,
) {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(workspaceStorageKey);
  const parsed = saved ? parseWorkspaceState(saved) : null;
  if (!parsed) return null;
  if (!allowLegacyReadFallback) {
    window.localStorage.removeItem(requestCacheKey(activeUserEmail));
    return { ...parsed, approvalTasks: [] };
  }
  try {
    const cached = JSON.parse(
      window.localStorage.getItem(requestCacheKey(activeUserEmail)) || "null",
    ) as { schemaVersion?: number; tasks?: ApprovalTask[] } | null;
    return cached?.schemaVersion === requestCacheVersion && Array.isArray(cached.tasks)
      ? { ...parsed, approvalTasks: cached.tasks }
      : parsed;
  } catch {
    return parsed;
  }
}

export function useApprovalWorkspaceState({
  activeUser,
  allowLegacyReadFallback,
  requestId,
  workflowTemplates,
}: {
  activeUser: UserDirectoryEntry;
  allowLegacyReadFallback: boolean;
  requestId: string;
  workflowTemplates: WorkflowTemplate[];
}) {
  const defaultWorkspaceState = useMemo(
    () =>
      createDefaultWorkspaceSnapshot({
        activeUser,
        approvalTasks: allowLegacyReadFallback ? approvalTasks : [],
        businessDirectory: seededBusinessDirectory,
        workflowTemplates,
      }),
    [activeUser, allowLegacyReadFallback, workflowTemplates],
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
      seedApprovalTasks: allowLegacyReadFallback ? approvalTasks : [],
    }),
  );
  const [workspaceSyncMode, setWorkspaceSyncMode] = useState<"loading" | "supabase" | "local">(
    "loading",
  );
  const [remoteWorkspaceReady, setRemoteWorkspaceReady] = useState(false);
  const [canonicalTasksReady, setCanonicalTasksReady] = useState(false);
  const [canonicalTaskError, setCanonicalTaskError] = useState("");
  const canonicalTasksReadyRef = useRef(false);
  const lastRemoteSnapshotRef = useRef<string | null>(null);
  const localWorkspaceDirtyRef = useRef(false);
  const autosaveTargetRef = useRef<{
    snapshot: WorkspaceStateSnapshot;
    serialized: string;
  } | null>(null);
  const autosaveFailureCountRef = useRef(0);
  const remoteSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [autosaveRetryVersion, setAutosaveRetryVersion] = useState(0);
  const [workspaceAutosaveMonitor, setWorkspaceAutosaveMonitor] = useState(
    initialWorkspaceAutosaveMonitor,
  );

  const adoptCompactedRemoteSnapshot = useCallback(
    (snapshot: WorkspaceStateSnapshot, expectedSerialized: string) => {
      const compactedSnapshot = sanitizeWorkspaceStateSnapshot(snapshot);
      const compactedSerialized = serializeWorkspaceState(compactedSnapshot);
      if (
        compactedSerialized === expectedSerialized ||
        autosaveTargetRef.current?.serialized !== expectedSerialized
      ) {
        return compactedSerialized;
      }

      window.localStorage.setItem(workspaceStorageKey, compactedSerialized);
      setBusinessDirectory(compactedSnapshot.businessDirectory);
      setTemplates(compactedSnapshot.workflowTemplates);
      setFormLibrary(compactedSnapshot.formLibrary || []);
      setRoleAssignments(compactedSnapshot.userRoleAssignments || []);
      setAdminAuditEvents(compactedSnapshot.adminAuditEvents || []);
      setSelectedTemplateId(compactedSnapshot.selectedTemplateId);
      return compactedSerialized;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const loadTimerId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const saved = readSavedWorkspaceState(
        activeUser.email,
        allowLegacyReadFallback,
      );
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
            seedApprovalTasks: allowLegacyReadFallback ? approvalTasks : [],
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
  }, [activeUser.email, allowLegacyReadFallback, requestId]);

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

  const refreshCanonicalTasks = useCallback(async () => {
    try {
      const canonicalTasks = await loadCanonicalApprovalTasks("tracking");
      setTasks((current) =>
        canonicalTasks.map((task) => {
          const existing = current.find(
            (item) =>
              item.id === task.id && item.stateVersion === task.stateVersion,
          );
          return existing?.auditTrail.length
            ? {
                ...task,
                auditTrail: existing.auditTrail,
                attachments: existing.attachments || [],
              }
            : task;
        }),
      );
      canonicalTasksReadyRef.current = true;
      setCanonicalTasksReady(true);
      setCanonicalTaskError("");
      setWorkspaceSyncMode("supabase");
      setSelectedTaskId((current) => {
        if (requestId && canonicalTasks.some((task) => task.id === requestId)) {
          return requestId;
        }
        return canonicalTasks.some((task) => task.id === current)
          ? current
          : canonicalTasks[0]?.id || "";
      });
      return canonicalTasks;
    } catch (error) {
      setCanonicalTaskError(
        error instanceof ApprovalApiError
          ? error.message
          : "Unable to refresh approval requests.",
      );
      return null;
    }
  }, [requestId]);

  useEffect(() => {
    if (!localWorkspaceReady) return;
    const refresh = () => void refreshCanonicalTasks();
    const initialRefreshId = window.setTimeout(refresh, 0);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [localWorkspaceReady, refreshCanonicalTasks]);

  useEffect(() => {
    if (!canonicalTasksReady || !selectedTaskId) return;
    let cancelled = false;
    void loadCanonicalApprovalRequest(selectedTaskId)
      .then((detail) => {
        if (cancelled) return;
        setTasks((current) =>
          current.map((task) => (task.id === detail.id ? detail : task)),
        );
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof ApprovalApiError && error.status !== 404) {
          setCanonicalTaskError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canonicalTasksReady, selectedTaskId]);

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
    if (!localWorkspaceReady) return;
    if (!allowLegacyReadFallback) {
      window.localStorage.removeItem(requestCacheKey(activeUser.email));
      return;
    }
    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(
        requestCacheKey(activeUser.email),
        JSON.stringify({ schemaVersion: requestCacheVersion, tasks }),
      );
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [activeUser.email, allowLegacyReadFallback, localWorkspaceReady, tasks]);

  useEffect(() => {
    if (!localWorkspaceReady) {
      return;
    }

    const snapshot = {
      approvalTasks: [],
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

      let attemptStartedAt = 0;
      const queuedSave = remoteSaveQueueRef.current.then(() => {
        if (autosaveTargetRef.current?.serialized !== target.serialized) {
          return null;
        }
        attemptStartedAt = Date.now();
        setWorkspaceAutosaveMonitor((current) => ({
          ...current,
          status: autosaveFailureCountRef.current ? "retrying" : "saving",
          lastAttemptAt: new Date(attemptStartedAt).toISOString(),
          payloadBytes: new TextEncoder().encode(target.serialized).byteLength,
          retryCount: autosaveFailureCountRef.current,
          error: undefined,
        }));
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
        lastRemoteSnapshotRef.current = result.snapshot
          ? adoptCompactedRemoteSnapshot(result.snapshot, target.serialized)
          : target.serialized;
        if (autosaveTargetRef.current?.serialized === target.serialized) {
          autosaveTargetRef.current = null;
        }
        autosaveFailureCountRef.current = 0;
      } else if (autosaveTargetRef.current?.serialized === target.serialized) {
        autosaveFailureCountRef.current += 1;
      }
      setWorkspaceAutosaveMonitor((current) => ({
        ...current,
        status: result.mode === "supabase" ? "saved" : "failed",
        ...(result.mode === "supabase"
          ? { lastSuccessAt: new Date().toISOString() }
          : {}),
        payloadBytes:
          result.monitoring?.payloadBytes || current.payloadBytes,
        persistedBytes:
          result.monitoring?.persistedBytes || current.persistedBytes,
        durationMs:
          result.monitoring?.durationMs || Math.max(0, Date.now() - attemptStartedAt),
        retryCount:
          result.mode === "supabase" ? 0 : autosaveFailureCountRef.current,
        failureCount:
          current.failureCount + (result.mode === "local" ? 1 : 0),
        unchangedCount:
          current.unchangedCount + (result.unchanged ? 1 : 0),
        assetsUploaded: result.monitoring?.assetsUploaded || 0,
        removedBase64Bytes: result.monitoring?.removedBase64Bytes || 0,
        error: result.mode === "local" ? result.reason : undefined,
      }));
      setAutosaveRetryVersion((version) => version + 1);
    }, getWorkspaceAutosaveDelay(autosaveFailureCountRef.current));
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeUser.email, adminAuditEvents, adoptCompactedRemoteSnapshot, autosaveRetryVersion, businessDirectory, effectiveRoleAssignments, formLibrary, localWorkspaceReady, remoteWorkspaceReady, selectedTemplateId, tasks, templates]);

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
    const configurationSnapshot = { ...snapshot, approvalTasks: [] };
    const serializedSnapshot = serializeWorkspaceState(configurationSnapshot);
    window.localStorage.setItem(workspaceStorageKey, serializedSnapshot);
    if (allowLegacyReadFallback) {
      window.localStorage.setItem(
        requestCacheKey(activeUser.email),
        JSON.stringify({
          schemaVersion: requestCacheVersion,
          tasks: snapshot.approvalTasks,
        }),
      );
    } else {
      window.localStorage.removeItem(requestCacheKey(activeUser.email));
    }
    autosaveTargetRef.current = {
      snapshot: configurationSnapshot,
      serialized: serializedSnapshot,
    };
    autosaveFailureCountRef.current = 0;
    let attemptStartedAt = 0;
    const queuedSave = remoteSaveQueueRef.current.then(() => {
      attemptStartedAt = Date.now();
      setWorkspaceAutosaveMonitor((current) => ({
        ...current,
        status: "saving",
        lastAttemptAt: new Date(attemptStartedAt).toISOString(),
        payloadBytes: new TextEncoder().encode(serializedSnapshot).byteLength,
        retryCount: 0,
        error: undefined,
      }));
      return saveRemoteWorkspaceState(configurationSnapshot);
    });
    remoteSaveQueueRef.current = queuedSave.then(
      () => undefined,
      () => undefined,
    );
    const result = await queuedSave;
    setWorkspaceSyncMode(result.mode);
    if (result.mode === "supabase") {
      lastRemoteSnapshotRef.current = result.snapshot
        ? adoptCompactedRemoteSnapshot(result.snapshot, serializedSnapshot)
        : serializedSnapshot;
      if (autosaveTargetRef.current?.serialized === serializedSnapshot) {
        autosaveTargetRef.current = null;
      }
    } else if (autosaveTargetRef.current?.serialized === serializedSnapshot) {
      autosaveFailureCountRef.current += 1;
      setAutosaveRetryVersion((version) => version + 1);
    }
    setWorkspaceAutosaveMonitor((current) => ({
      ...current,
      status: result.mode === "supabase" ? "saved" : "failed",
      ...(result.mode === "supabase"
        ? { lastSuccessAt: new Date().toISOString() }
        : {}),
      payloadBytes: result.monitoring?.payloadBytes || current.payloadBytes,
      persistedBytes:
        result.monitoring?.persistedBytes || current.persistedBytes,
      durationMs:
        result.monitoring?.durationMs || Math.max(0, Date.now() - attemptStartedAt),
      retryCount:
        result.mode === "supabase" ? 0 : autosaveFailureCountRef.current,
      failureCount:
        current.failureCount + (result.mode === "local" ? 1 : 0),
      unchangedCount:
        current.unchangedCount + (result.unchanged ? 1 : 0),
      assetsUploaded: result.monitoring?.assetsUploaded || 0,
      removedBase64Bytes: result.monitoring?.removedBase64Bytes || 0,
      error: result.mode === "local" ? result.reason : undefined,
    }));
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
    canonicalTaskError,
    canonicalTasksReady,
    persistWorkspaceSnapshot,
    refreshCanonicalTasks,
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
    workspaceAutosaveMonitor,
    workspaceSyncMode,
  };
}
