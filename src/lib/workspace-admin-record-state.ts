import type {
  BusinessUnit,
  UserRoleAssignment,
} from "./types.ts";

export function getUpdatedRoleAssignmentRecordState({
  roleAssignments,
  updater,
}: {
  roleAssignments: UserRoleAssignment[];
  updater: (items: UserRoleAssignment[]) => UserRoleAssignment[];
}) {
  return {
    roleAssignments: updater(roleAssignments),
  };
}

export function getUpdatedBusinessDirectoryRecordState({
  businessDirectory,
  updater,
}: {
  businessDirectory: BusinessUnit[];
  updater: (items: BusinessUnit[]) => BusinessUnit[];
}) {
  return {
    businessDirectory: updater(businessDirectory),
  };
}
