"use client";

import { CalendarClock, Check, Plus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  addBusiness,
  addDepartment,
  deleteBusiness,
  deleteDepartment,
  updateBusiness,
  updateDepartment,
} from "@/lib/business-directory";
import { getAdminBusinessSelectionState } from "@/lib/admin-view-state";
import { notifications } from "@/lib/mock-data";
import type {
  BusinessUnit,
  UserRoleAssignment,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import type { TaskNotification } from "@/lib/workflow-system";

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
  setBusinessDirectory,
  legacyDepartments,
  userDirectory,
  taskNotifications,
  roleAssignments,
  setRoleAssignments,
}: {
  businessDirectory: BusinessUnit[];
  setBusinessDirectory: (updater: (items: BusinessUnit[]) => BusinessUnit[]) => void;
  legacyDepartments: string[];
  userDirectory: UserDirectoryEntry[];
  taskNotifications: TaskNotification[];
  roleAssignments: UserRoleAssignment[];
  setRoleAssignments: (
    updater: (items: UserRoleAssignment[]) => UserRoleAssignment[],
  ) => void;
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

  function removeBusiness() {
    if (!selectedBusiness) {
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

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr_360px]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Businesses</h2>
          <p className="text-sm text-neutral-400">
            Superuser master list for workflow template ownership.
          </p>
        </div>
        <div className="space-y-2 p-4">
          {businessDirectory.map((business) => (
            <button
              key={business.id}
              type="button"
              onClick={() => selectBusiness(business)}
              className={`block w-full rounded-md border p-3 text-left text-sm transition ${
                selectedBusiness?.id === business.id
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-white/10 bg-[#121518] hover:border-white/20"
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
              placeholder="New business"
              className="h-10 min-w-0 rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
            <button
              type="button"
              onClick={createBusiness}
              className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Departments</h2>
          <p className="break-words text-sm text-neutral-400">
            {selectedBusiness
              ? `Editing departments for ${selectedBusiness.name}.`
              : "Select a business to edit departments."}
          </p>
        </div>
        {selectedBusiness && (
          <div className="space-y-4 p-4">
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <input
                value={businessNameDraft}
                onChange={(event) => setBusinessNameDraft(event.target.value)}
                className="h-10 min-w-0 rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={saveBusinessName}
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
              >
                <Check size={16} />
                Save
              </button>
              <button
                type="button"
                onClick={removeBusiness}
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
              >
                <X size={16} />
                Delete
              </button>
            </div>

            <div className="space-y-2">
              {selectedBusiness.departments.map((department, index) => (
                <div
                  key={`${selectedBusiness.id}-${department}-${index}`}
                  className="grid gap-2 rounded-md border border-white/10 bg-[#121518] p-3 md:grid-cols-[1fr_auto]"
                >
                  <input
                    defaultValue={department}
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
                    className="h-10 min-w-0 rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setBusinessDirectory((items) =>
                        deleteDepartment(items, selectedBusiness.id, index),
                      )
                    }
                    className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20"
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
                placeholder="New department"
                className="h-10 min-w-0 rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={createDepartment}
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={16} />
                Add department
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">User directory</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Lightweight roles inferred from requests and workflow templates.
          </p>
          <div className="mt-3 space-y-2">
            {userDirectory.slice(0, 10).map((user) => (
              <div
                key={user.email}
                className="rounded-md border border-white/10 bg-[#121518] p-2 text-sm"
              >
                <p className="break-words text-neutral-200">{user.name}</p>
                <p className="mt-1 break-words text-xs text-neutral-500">
                  {user.email} - {user.role}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">Role management</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Assign business, department, and workflow role for routing.
          </p>
          <div className="mt-3 space-y-3">
            {roleAssignments.slice(0, 8).map((assignment, index) => {
              const assignedBusiness =
                businessDirectory.find(
                  (business) => business.id === assignment.businessId,
                ) || firstBusiness;
              return (
                <div
                  key={assignment.email}
                  className="space-y-2 rounded-md border border-white/10 bg-[#121518] p-3"
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
                    className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
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
                    className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
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
                    onChange={(event) =>
                      setRoleAssignments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, department: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
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
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">Legacy departments</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {legacyDepartments.length} existing department label(s) are still available to older mock data.
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">In-app notifications</h2>
          <div className="mt-3 space-y-2">
            {taskNotifications.slice(0, 12).map((item) => (
              <Link
                key={item.id}
                href={`/?tab=tracking&request=${encodeURIComponent(item.requestId)}`}
                className="block rounded-md border border-white/10 bg-[#121518] p-3 transition hover:border-sky-400/40"
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
            {notifications.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-white/10 bg-[#121518] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.unread && <span className="size-2 rounded-full bg-amber-300" />}
                </div>
                <p className="mt-1 text-xs text-neutral-400">{item.body}</p>
                <p className="mt-2 text-xs text-neutral-500">{item.time}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">Delegation</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Delegate to</span>
              <input
                defaultValue="Alex Ho"
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Period</span>
              <input
                defaultValue="2026-06-19 to 2026-06-26"
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
            </label>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 text-sm text-sky-100 transition hover:bg-sky-400/20"
            >
              <CalendarClock size={16} />
              Save delegation
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

