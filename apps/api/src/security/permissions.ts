import { ROLE_PERMISSIONS, type OrganizationRole, type Permission } from "../models/membership.model.js";

export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  const permissions: readonly string[] = ROLE_PERMISSIONS[role];
  return permissions.includes("*") || permissions.includes(permission);
}
