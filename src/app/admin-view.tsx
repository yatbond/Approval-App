"use client";

import { Check, Mail, Plus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { OperationalHealthPanel } from "./operational-health-panel";
import { RolloutStatusPanel } from "./rollout-status-panel";
import { BuildVersionIndicator } from "./build-version-indicator";
import { InfoTip } from "./ui-hint";
import { AdminCopilotReviewPanel } from "./admin-copilot-review-panel";
import { AdminCopilotConceptReviewPanel } from "./admin-copilot-concept-review-panel";
import { AdminCopilotTelemetryPanel } from "./admin-copilot-telemetry-panel";
import {
  addBusiness,
  addDepartment,
  deleteBusiness,
  deleteDepartment,
  updateBusiness,
  updateDepartment,
} from "@/lib/business-directory";
import { getAdminBusinessSelectionState } from "@/lib/admin-view-state";
import type {
  AdminAuditEvent,
  BusinessUnit,
  UserRoleAssignment,
} from "@/lib/types";
import type { EmailOutboxEntry } from "@/lib/email-outbox-state";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import type { TaskNotification } from "@/lib/workflow-system";
import type {
  AuthoritativeDirectoryUser,
  useAuthoritativeAdminDirectory,
} from "./use-authoritative-admin-directory";

type AuthoritativeDirectoryController = ReturnType<
  typeof useAuthoritativeAdminDirectory
>;

const userRoleOptions: UserDirectoryEntry["role"][] = [
  "superuser",
  "originator",
  "approver",
  "reviewer",
  "fyi",
  "current actor",
  "previous actor",
  "participant",
];
export function AdminView({
  businessDirectory,
  adminRecordError,
  setBusinessDirectory,
  onDeactivateBusinessRecord,
  onDeactivateDepartmentRecord,
  legacyDepartments,
  userDirectory,
  authoritativeDirectory,
  taskNotifications,
  roleAssignments,
  setRoleAssignments,
  adminAuditEvents,
  activeUserEmail,
  emailDeliveryMessage,
  emailOutboxEntries,
  onSendTestEmail,
  onRetryOutboxEntry,
}: {
  businessDirectory: BusinessUnit[];
  adminRecordError?: string;
  setBusinessDirectory: (updater: (items: BusinessUnit[]) => BusinessUnit[]) => void;
  onDeactivateBusinessRecord?: (business: BusinessUnit) => Promise<boolean>;
  onDeactivateDepartmentRecord?: (
    business: BusinessUnit,
    departmentName: string,
  ) => Promise<boolean>;
  legacyDepartments: string[];
  userDirectory: UserDirectoryEntry[];
  authoritativeDirectory?: AuthoritativeDirectoryController;
  taskNotifications: TaskNotification[];
  roleAssignments: UserRoleAssignment[];
  setRoleAssignments: (
    updater: (items: UserRoleAssignment[]) => UserRoleAssignment[],
  ) => void;
  adminAuditEvents: AdminAuditEvent[];
  activeUserEmail: string;
  emailDeliveryMessage: string;
  emailOutboxEntries: EmailOutboxEntry[];
  onSendTestEmail: (to: string) => Promise<void>;
  onRetryOutboxEntry: (id: string) => Promise<void>;
}) {
  const initialSelection = getAdminBusinessSelectionState({
    businessDirectory,
    selectedBusinessId: businessDirectory[0]?.id || "",
  });
  const firstBusiness = businessDirectory[0];
  const [selectedBusinessId, setSelectedBusinessId] = useState(
    initialSelection.selectedBusinessId,
  );
  const { selectedBusiness } = getAdminBusinessSelectionState({
    businessDirectory,
    selectedBusinessId,
  });
  const [newBusinessName, setNewBusinessName] = useState("");
  const [businessNameDraft, setBusinessNameDraft] = useState(
    initialSelection.businessNameDraft,
  );
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [testEmail, setTestEmail] = useState(activeUserEmail);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const displayedDirectory: AuthoritativeDirectoryUser[] = authoritativeDirectory
    ? authoritativeDirectory.users
    : userDirectory.map((user) => ({
        id: user.email,
        email: user.email,
        fullName: user.name,
        role: user.role,
        effectiveRoles: [user.role],
        departmentId: null,
      }));

  function selectBusiness(business: BusinessUnit) {
    setSelectedBusinessId(business.id);
    setBusinessNameDraft(business.name);
    setNewDepartmentName("");
  }

  function createBusiness() {
    const next = addBusiness(businessDirectory, newBusinessName);
    const created = next.at(-1);
    setBusinessDirectory(() => next);
    setNewBusinessName("");
    if (created) {
      selectBusiness(created);
    }
  }

  function saveBusinessName() {
    if (!selectedBusiness) {
      return;
    }

    setBusinessDirectory((items) =>
      updateBusiness(items, selectedBusiness.id, businessNameDraft),
    );
  }

  async function removeBusiness() {
    if (!selectedBusiness) {
      return;
    }

    const didDeactivate =
      (await onDeactivateBusinessRecord?.(selectedBusiness)) ?? true;
    if (!didDeactivate) {
      return;
    }

    const next = deleteBusiness(businessDirectory, selectedBusiness.id);
    setBusinessDirectory(() => next);
    const replacement = next[0];
    setSelectedBusinessId(replacement?.id || "");
    setBusinessNameDraft(replacement?.name || "");
  }

  function createDepartment() {
    if (!selectedBusiness) {
      return;
    }

    setBusinessDirectory((items) =>
      addDepartment(items, selectedBusiness.id, newDepartmentName),
    );
    setNewDepartmentName("");
  }

  async function removeDepartment(departmentName: string, index: number) {
    if (!selectedBusiness) {
      return;
    }

    const didDeactivate =
      (await onDeactivateDepartmentRecord?.(selectedBusiness, departmentName)) ??
      true;
    if (!didDeactivate) {
      return;
    }

    setBusinessDirectory((items) =>
      deleteDepartment(items, selectedBusiness.id, index),
    );
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(280px,340px)]">
      <section className="rounded-md border border-[#e6e6e6] bg-white">
        <div className="border-b border-[#e6e6e6] p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Businesses</h2>
            <InfoTip label="Superuser master list for workflow template ownership." />
          </div>
        </div>
        <div className="max-h-[56vh] space-y-2 overflow-y-auto p-4 pr-3 xl:max-h-none xl:overflow-visible xl:pr-4">
          {adminRecordError && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
              {adminRecordError}
            </p>
          )}
          {businessDirectory.map((business) => (
            <button
              key={business.id}
              type="button"
              onClick={() => selectBusiness(business)}
              className={`block min-h-11 w-full rounded-md border p-3 text-left text-sm transition ${
                selectedBusiness?.id === business.id
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-[#e6e6e6] bg-white hover:border-[#d2d2d2]"
              }`}
            >
              <span className="block break-words font-medium">{business.name}</span>
              <span className="mt-1 block text-xs text-neutral-500">
                {business.departments.length} department(s)
              </span>
            </button>
          ))}
          <div className="grid gap-2 pt-2 sm:grid-cols-[1fr_auto]">
            <input
              value={newBusinessName}
              onChange={(event) => setNewBusinessName(event.target.value)}
              placeholder="New"
              className="min-h-11 min-w-0 rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
            <button
              type="button"
              onClick={createBusiness}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-[#e6e6e6] bg-white">
        <div className="border-b border-[#e6e6e6] p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Departments</h2>
            <InfoTip
              label={
                selectedBusiness
                  ? `Editing departments for ${selectedBusiness.name}.`
                  : "Select a business to edit departments."
              }
            />
          </div>
        </div>
        {selectedBusiness && (
          <div className="space-y-4 p-4">
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <input
                value={businessNameDraft}
                onChange={(event) => setBusinessNameDraft(event.target.value)}
                aria-label="Business name"
                className="min-h-11 min-w-0 rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={saveBusinessName}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
              >
                <Check size={16} />
                Save
              </button>
              <button
                type="button"
                onClick={() => void removeBusiness()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
              >
                <X size={16} />
                Delete
              </button>
            </div>

            <div className="space-y-2">
              {selectedBusiness.departments.map((department, index) => (
                <div
                  key={`${selectedBusiness.id}-${department}-${index}`}
                  className="grid gap-2 rounded-md border border-[#e6e6e6] bg-white p-3 md:grid-cols-[1fr_auto]"
                >
                  <input
                    defaultValue={department}
                    aria-label={`Department name ${index + 1}`}
                    onBlur={(event) =>
                      setBusinessDirectory((items) =>
                        updateDepartment(
                          items,
                          selectedBusiness.id,
                          index,
                          event.target.value,
                        ),
                      )
                    }
                    className="min-h-11 min-w-0 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none focus:border-emerald-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => void removeDepartment(department, index)}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
                  >
                    <X size={16} />
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                placeholder="New"
                className="min-h-11 min-w-0 rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={createDepartment}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={16} />
                Add department
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <BuildVersionIndicator variant="panel" />
        <RolloutStatusPanel />
        <OperationalHealthPanel />
        <AdminCopilotConceptReviewPanel />
        <AdminCopilotReviewPanel />
        <AdminCopilotTelemetryPanel />
        <div className="rounded-md border border-[#e6e6e6] bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Directory and effective roles</h2>
            <InfoTip label="Active profiles loaded from the authoritative directory in bounded pages." />
          </div>
          {authoritativeDirectory ? (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-neutral-500" htmlFor="admin-directory-search">
                Search by name or email
              </label>
              <input
                id="admin-directory-search"
                type="search"
                value={authoritativeDirectory.query}
                onChange={(event) => authoritativeDirectory.setQuery(event.target.value)}
                placeholder="Search active users"
                className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
              />
              {authoritativeDirectory.error ? (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100">
                  <p>{authoritativeDirectory.error}</p>
                  <button
                    type="button"
                    onClick={() => void authoritativeDirectory.retry()}
                    className="mt-2 min-h-11 rounded-md border border-rose-300/40 px-3"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div
            className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1 xl:max-h-96"
            role="region"
            aria-label="Active user directory"
            tabIndex={0}
          >
            {displayedDirectory.map((user) => (
              <div
                key={user.id}
                className="rounded-md border border-[#e6e6e6] bg-white p-2 text-sm"
              >
                <p className="break-words text-neutral-200">{user.fullName}</p>
                <p className="mt-1 break-words text-xs text-neutral-500">
                  {user.email} - {user.effectiveRoles.join(", ")}
                </p>
              </div>
            ))}
            {!displayedDirectory.length && !authoritativeDirectory?.isLoading ? (
              <p className="rounded-md border border-[#e6e6e6] p-3 text-xs text-neutral-500">
                No active users match this search.
              </p>
            ) : null}
            {authoritativeDirectory?.isLoading ? (
              <p aria-live="polite" className="p-2 text-xs text-neutral-500">
                Loading directory...
              </p>
            ) : null}
          </div>
          {authoritativeDirectory?.nextCursor ? (
            <button
              type="button"
              disabled={authoritativeDirectory.isLoading}
              onClick={() => void authoritativeDirectory.loadNextPage()}
              className="mt-3 min-h-11 w-full rounded-md border border-sky-400/40 bg-sky-400/10 px-3 text-sm text-sky-100 disabled:opacity-50"
            >
              Load next 50 users
            </button>
          ) : null}
        </div>
        <div className="rounded-md border border-[#e6e6e6] bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Roles</h2>
            <InfoTip label="Assign business, department, and workflow role for routing." />
          </div>
          <div
            className="mt-3 max-h-[56vh] space-y-3 overflow-y-auto pr-1 xl:max-h-[560px]"
            role="region"
            aria-label="Role assignments"
            tabIndex={0}
          >
            {roleAssignments.map((assignment, index) => {
              const assignedBusiness =
                businessDirectory.find(
                  (business) => business.id === assignment.businessId,
                ) || firstBusiness;
              return (
                <div
                  key={assignment.email}
                  className="space-y-2 rounded-md border border-[#e6e6e6] bg-white p-3"
                >
                  <p className="break-words text-sm font-medium text-neutral-200">
                    {assignment.name}
                  </p>
                  <p className="break-words text-xs text-neutral-500">
                    {assignment.email}
                  </p>
                  <select
                    value={assignment.role}
                    title="Role used for workflow routing and administration."
                    aria-label={`Role for ${assignment.name}`}
                    onChange={(event) =>
                      setRoleAssignments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                role: event.target.value as UserDirectoryEntry["role"],
                              }
                            : item,
                        ),
                      )
                    }
                    className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none focus:border-emerald-400/60"
                  >
                    {userRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignment.businessId}
                    title="Business this user is assigned to."
                    aria-label={`Business for ${assignment.name}`}
                    onChange={(event) => {
                      const nextBusiness = businessDirectory.find(
                        (business) => business.id === event.target.value,
                      );
                      setRoleAssignments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                businessId: event.target.value,
                                department: nextBusiness?.departments[0] || "",
                              }
                            : item,
                        ),
                      );
                    }}
                    className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none focus:border-emerald-400/60"
                  >
                    {businessDirectory.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignment.department}
                    title="Department this user is assigned to."
                    aria-label={`Department for ${assignment.name}`}
                    onChange={(event) =>
                      setRoleAssignments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, department: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 text-sm outline-none focus:border-emerald-400/60"
                  >
                    {(assignedBusiness?.departments || []).map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-md border border-[#e6e6e6] bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Legacy</h2>
            <InfoTip label="Existing department labels still available to older mock data." />
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            {legacyDepartments.length} label(s)
          </p>
        </div>
        <div className="rounded-md border border-[#e6e6e6] bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Email</h2>
            <InfoTip label="Send a test email before routing workflow tasks to real inboxes." />
          </div>
          <p className="mt-2 rounded-md border border-yellow-400/20 bg-yellow-400/10 p-2 text-xs text-yellow-100">
            Verify Resend domain before live sends.
          </p>
          <div className="mt-3 grid min-w-0 gap-2">
            <input
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              aria-label="Test email recipient"
              placeholder="recipient@example.com"
              className="min-h-11 rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
            />
            <button
              type="button"
              disabled={isSendingTestEmail || !testEmail.trim()}
              onClick={async () => {
                setIsSendingTestEmail(true);
                try {
                  await onSendTestEmail(testEmail);
                } finally {
                  setIsSendingTestEmail(false);
                }
              }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Mail size={16} />
              {isSendingTestEmail ? "Sending" : "Send test"}
            </button>
          </div>
          {emailDeliveryMessage ? (
            <p className="mt-3 break-words rounded-md border border-[#e6e6e6] bg-white p-3 text-xs text-neutral-300">
              {emailDeliveryMessage}
            </p>
          ) : null}
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-300">Outbox</h3>
              <span className="text-xs text-neutral-500">
                {emailOutboxEntries.length} recent attempt(s)
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {emailOutboxEntries.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-[#e6e6e6] bg-white p-3 text-xs"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-neutral-200">
                        {entry.title} - {entry.recipientEmail}
                      </p>
                      <p className="mt-1 break-words text-neutral-500">
                        {entry.requestId} - {entry.kind} - {entry.mode}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded border px-2 py-1 ${
                        entry.status === "sent"
                          ? "border-sky-400/30 bg-sky-400/10 text-sky-100"
                          : entry.status === "failed"
                            ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                            : "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-neutral-400">{entry.message}</p>
                  <p className="mt-1 text-neutral-600">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                  {(entry.status === "failed" || entry.status === "retry") && (
                    <button
                      type="button"
                      onClick={() => void onRetryOutboxEntry(entry.id)}
                      className="mt-2 min-h-9 rounded border border-sky-400/30 px-3 text-sky-100"
                    >
                      Retry delivery
                    </button>
                  )}
                </div>
              ))}
              {!emailOutboxEntries.length && (
                <p className="rounded-md border border-[#e6e6e6] bg-white p-3 text-xs text-neutral-500">
                  No emails yet.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-[#e6e6e6] bg-white p-4">
          <h2 className="font-semibold">Alerts</h2>
          <div className="mt-3 space-y-2">
            {taskNotifications.slice(0, 12).map((item) => (
              <Link
                key={item.id}
                href={`/?tab=tracking&request=${encodeURIComponent(item.requestId)}`}
                className="block rounded-md border border-[#e6e6e6] bg-white p-3 transition hover:border-sky-400/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.unread && <span className="size-2 rounded-full bg-amber-300" />}
                </div>
                <p className="mt-1 text-xs text-neutral-400">{item.body}</p>
                <p className="mt-2 break-words text-xs text-neutral-500">
                  {item.kind} - {item.recipientEmail}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[#e6e6e6] bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Audit</h2>
            <InfoTip label="Recent template create, publish, duplicate, and archive actions." />
          </div>
          <div className="mt-3 space-y-2">
            {adminAuditEvents.slice(0, 8).map((event) => (
              <div
                key={event.id}
                className="rounded-md border border-[#e6e6e6] bg-white p-3"
              >
                <p className="break-words text-sm font-medium text-neutral-200">
                  {event.detail}
                </p>
                <p className="mt-1 break-words text-xs text-neutral-500">
                  {event.actorEmail} - {new Date(event.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
            {!adminAuditEvents.length && (
              <p className="rounded-md border border-[#e6e6e6] bg-white p-3 text-sm text-neutral-500">
                No audit yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
