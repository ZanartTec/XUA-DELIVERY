import type { JwtPayload } from "../types";

export type UserRole = JwtPayload["role"];

const USER_ROLES = new Set<UserRole>([
  "consumer",
  "distributor_admin",
  "driver",
  "ops",
  "support",
]);

export function isUserRole(role: string | null | undefined): role is UserRole {
  return role != null && USER_ROLES.has(role as UserRole);
}

export function normalizeUserRole(
  role: string | null | undefined,
  fallbackRole: UserRole
): UserRole {
  return isUserRole(role) ? role : fallbackRole;
}
