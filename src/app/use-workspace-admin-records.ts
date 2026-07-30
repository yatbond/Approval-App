"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  getAdminRecordDeleteConfirmation,
  getWorkflowTemplateArchiveConfirmation,
  type ConfirmationRequest,
} from "@/lib/confirmation-policy";
import {
  archiveFormLibraryDefinition,
  activateFormLibraryDefinition,
  saveFormLibraryDraft,
  type FormLibraryDraft,
  type FormLibrarySaveMode,
} from "@/lib/form-library-state";
import type {
  AdminAuditEvent,
  ApprovalTask,
  BusinessUnit,
  FormLibraryDefinition,
  UserRoleAssignment,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import {
  getAdminRecordDeleteFailureState,
  getAdminRecordDeleteSyncState,
  getUpdatedBusinessDirectoryRecordState,
  getUpdatedRoleAssignmentRecordState,
} from "@/lib/workspace-admin-record-state";
import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";
import type { WorkspaceSyncMode } from "@/lib/workspace-shell-state";
import { deactivateRemoteWorkspaceAdminRecord } from "@/lib/workspace-sync";
import {
  getActivatedTemplateVersionRecordState,
  getCreatedTemplateRecordState,
  getDeletedTemplateRecordState,
  getUpdatedTemplateVersionCommentRecordState,
  getUpdatedTemplateRecordState,
} from "@/lib/workspace-template-record-state";
import {
  activateTemplateAuthoringVersionClient,
  queueTemplateAuthoringDraftSync,
} from "@/lib/template-authoring-client";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useWorkspaceAdminRecords({
  activeUser,
  adminAuditEvents,
  businessDirectory,
  buildWorkspaceSnapshot,
  effectiveRoleAssignments,
  formLibrary,
  persistWorkspaceSnapshot,
  requestConfirmation,
  selectedTemplateId,
  setAdminAuditEvents,
  setBusinessDirectory,
  setFormLibrary,
  setRoleAssignments,
  setSelectedTemplateId,
  setTemplates,
  tasks,
  templates,
  workspaceSyncMode,
}: {
  activeUser: UserDirectoryEntry;
  adminAuditEvents: AdminAuditEvent[];
  businessDirectory: BusinessUnit[];
  buildWorkspaceSnapshot: (
    patch?: Partial<WorkspaceStateSnapshot>,
  ) => WorkspaceStateSnapshot;
  effectiveRoleAssignments: UserRoleAssignment[];
  formLibrary: FormLibraryDefinition[];
  persistWorkspaceSnapshot: (snapshot: WorkspaceStateSnapshot) => Promise<unknown>;
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
  selectedTemplateId: string;
  setAdminAuditEvents: StateSetter<AdminAuditEvent[]>;
  setBusinessDirectory: StateSetter<BusinessUnit[]>;
  setFormLibrary: StateSetter<FormLibraryDefinition[]>;
  setRoleAssignments: StateSetter<UserRoleAssignment[]>;
  setSelectedTemplateId: StateSetter<string>;
  setTemplates: StateSetter<WorkflowTemplate[]>;
  tasks: ApprovalTask[];
  templates: WorkflowTemplate[];
  workspaceSyncMode: WorkspaceSyncMode;
}) {
  const [adminRecordError, setAdminRecordError] = useState("");

  function createTemplateRecord(template: WorkflowTemplate) {
    const action =
      template.isDraft === false
        ? "template_published"
        : template.sourceTemplateId
          ? "template_duplicated"
          : "template_created";
    const nextState = getCreatedTemplateRecordState({
      templates,
      template,
      actor: activeUser,
      action,
    });
    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setAdminAuditEvents(nextAuditEvents);
    setSelectedTemplateId(nextState.selectedTemplateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
        selectedTemplateId: nextState.selectedTemplateId,
      }),
    );
  }

  function saveFormLibraryRecord(
    draft: FormLibraryDraft,
    existingDefinition: FormLibraryDefinition | null,
    saveMode: FormLibrarySaveMode = "publish",
  ) {
    const nextState = saveFormLibraryDraft({
      library: formLibrary,
      draft,
      actorEmail: activeUser.email,
      existingDefinition,
      saveMode,
      workflowTemplates: templates,
    });
    setFormLibrary(nextState.library);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ formLibrary: nextState.library }),
    );
    return nextState.definition;
  }

  function activateFormLibraryRecord(definitionId: string) {
    const nextLibrary = activateFormLibraryDefinition(formLibrary, definitionId);
    if (nextLibrary === formLibrary) {
      return;
    }
    setFormLibrary(nextLibrary);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ formLibrary: nextLibrary }),
    );
  }

  function archiveFormLibraryRecord(definitionId: string) {
    const nextLibrary = archiveFormLibraryDefinition(formLibrary, definitionId);
    setFormLibrary(nextLibrary);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ formLibrary: nextLibrary }),
    );
  }

  function updateTemplateRecord(template: WorkflowTemplate) {
    const currentTemplate = templates.find((item) => item.id === template.id);
    const action =
      currentTemplate?.isDraft !== false && template.isDraft === false
        ? "template_published"
        : "template_updated";
    const nextState = getUpdatedTemplateRecordState({
      templates,
      template,
      actor: activeUser,
      action,
    });
    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setAdminAuditEvents(nextAuditEvents);
    queueTemplateAuthoringDraftSync({
      template,
      actorEmail: activeUser.email,
      changeReason: "Updated in the visual template builder.",
      callbacks: {
        onRevision: (revision) => {
          setTemplates((current) =>
            current.map((item) =>
              item.id === template.id
                ? { ...item, authoringRevision: revision }
                : item,
            ),
          );
          setAdminRecordError("");
        },
        onError: setAdminRecordError,
      },
    });
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
      }),
    );
  }

  async function activateTemplateVersionRecord(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    const isAuthoritativeAuthoringActivation = Boolean(
      template?.authoringFamilyId &&
        template.databaseVersionId &&
        template.isDraft === false &&
        template.version,
    );
    if (
      isAuthoritativeAuthoringActivation &&
      template?.authoringFamilyId &&
      template.databaseVersionId &&
      template.isDraft === false &&
      template.version
    ) {
      setAdminRecordError("");
      try {
        const activated = await activateTemplateAuthoringVersionClient({
          publishedVersionId: template.databaseVersionId,
          expectedVersionNumber: template.version,
        });
        if (
          activated.familyId !== template.authoringFamilyId ||
          activated.publishedVersionId !== template.databaseVersionId ||
          activated.versionNumber !== template.version
        ) {
          throw new Error(
            "The server activation response did not match the selected template version.",
          );
        }
      } catch (error) {
        setAdminRecordError(
          error instanceof Error
            ? error.message
            : "The exact published template version could not be activated.",
        );
        return;
      }
    }
    const nextState = getActivatedTemplateVersionRecordState({
      templates,
      selectedTemplateId,
      templateId,
      actor: activeUser,
    });
    if (!nextState.didUpdate) {
      return;
    }

    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setSelectedTemplateId(nextState.selectedTemplateId);
    if (isAuthoritativeAuthoringActivation) {
      // The server command already wrote the canonical audit event and active
      // marker. Do not send the browser's stale whole-workspace snapshot back
      // over that exact-version result.
      return;
    }
    setAdminAuditEvents(nextAuditEvents);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
        selectedTemplateId: nextState.selectedTemplateId,
      }),
    );
  }

  function updateTemplateVersionCommentRecord(
    templateId: string,
    comment: string,
  ) {
    const nextState = getUpdatedTemplateVersionCommentRecordState({
      templates,
      templateId,
      comment,
      actor: activeUser,
    });
    if (!nextState.didUpdate) {
      return;
    }

    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setAdminAuditEvents(nextAuditEvents);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
      }),
    );
  }

  async function deactivateAdminRecord(
    record: Parameters<typeof deactivateRemoteWorkspaceAdminRecord>[0],
  ) {
    const syncState = getAdminRecordDeleteSyncState({ workspaceSyncMode });
    if (!syncState.canContinue) {
      setAdminRecordError(syncState.error);
      return false;
    }

    if (!syncState.shouldDeactivateRemote) {
      setAdminRecordError("");
      return true;
    }

    const result = await deactivateRemoteWorkspaceAdminRecord(record);
    if (result.mode !== "supabase") {
      const failureState = getAdminRecordDeleteFailureState({
        record,
        reason: result.reason || "",
      });
      setAdminRecordError(failureState.error);
      return failureState.canContinue;
    }

    setAdminRecordError("");
    return true;
  }

  function latestTaskVersionForTemplate(templateId: string) {
    return tasks.reduce((version, task) => {
      if (task.workflowTemplateId !== templateId) {
        return version;
      }
      return Math.max(version, task.workflowTemplateVersion || 1);
    }, 1);
  }

  async function deleteTemplateRecord(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    const didDeactivate = template
      ? await deactivateAdminRecord({
          type: "template",
          templateKey: template.id,
          versionNumber:
            template.version || latestTaskVersionForTemplate(template.id),
        })
      : true;
    if (!didDeactivate) {
      return;
    }

    const nextState = getDeletedTemplateRecordState({
      templates,
      selectedTemplateId,
      templateId,
      actor: activeUser,
    });
    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setAdminAuditEvents(nextAuditEvents);
    setSelectedTemplateId(nextState.selectedTemplateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
        selectedTemplateId: nextState.selectedTemplateId,
      }),
    );
  }

  async function confirmDeleteTemplateRecord(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    const confirmed = await requestConfirmation(
      getWorkflowTemplateArchiveConfirmation({
        templateName: template?.name || "this workflow template",
      }),
    );
    if (confirmed) {
      await deleteTemplateRecord(templateId);
    }
  }

  async function confirmDeactivateBusinessRecord(business: BusinessUnit) {
    const confirmed = await requestConfirmation(
      getAdminRecordDeleteConfirmation({
        recordType: "business",
        recordName: business.name,
      }),
    );
    if (!confirmed) {
      return false;
    }
    return deactivateAdminRecord({ type: "business", businessId: business.id });
  }

  async function confirmDeactivateDepartmentRecord(
    business: BusinessUnit,
    departmentName: string,
  ) {
    const confirmed = await requestConfirmation(
      getAdminRecordDeleteConfirmation({
        recordType: "department",
        recordName: departmentName,
      }),
    );
    if (!confirmed) {
      return false;
    }
    return deactivateAdminRecord({
      type: "department",
      businessId: business.id,
      departmentName,
    });
  }

  function updateRoleAssignmentRecords(
    updater: (items: UserRoleAssignment[]) => UserRoleAssignment[],
  ) {
    const nextState = getUpdatedRoleAssignmentRecordState({
      roleAssignments: effectiveRoleAssignments,
      updater,
    });
    setRoleAssignments(nextState.roleAssignments);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        userRoleAssignments: nextState.roleAssignments,
      }),
    );
  }

  function updateBusinessDirectoryRecords(
    updater: (items: BusinessUnit[]) => BusinessUnit[],
  ) {
    const nextState = getUpdatedBusinessDirectoryRecordState({
      businessDirectory,
      updater,
    });
    setBusinessDirectory(nextState.businessDirectory);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        businessDirectory: nextState.businessDirectory,
      }),
    );
  }

  return {
    activateFormLibraryRecord,
    activateTemplateVersionRecord,
    adminRecordError,
    archiveFormLibraryRecord,
    confirmDeactivateBusinessRecord,
    confirmDeactivateDepartmentRecord,
    confirmDeleteTemplateRecord,
    createTemplateRecord,
    saveFormLibraryRecord,
    updateBusinessDirectoryRecords,
    updateRoleAssignmentRecords,
    updateTemplateRecord,
    updateTemplateVersionCommentRecord,
  };
}
