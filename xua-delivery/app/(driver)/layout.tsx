import { headers } from "next/headers";
import { RoleAppShell } from "@/src/components/shared/role-app-shell";
import { normalizeUserRole } from "@/src/lib/role-utils";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const role = normalizeUserRole(requestHeaders.get("x-user-role"), "driver");

  return (
    <RoleAppShell
      role={role}
      userName={requestHeaders.get("x-user-name")}
      contentClassName="p-4 pb-24 md:p-6 md:pb-28"
    >
      {children}
    </RoleAppShell>
  );
}
