import { headers } from "next/headers";
import { RoleAppShell } from "@/src/components/shared/role-app-shell";
import { normalizeUserRole } from "@/src/lib/role-utils";

export default async function ConsumerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const role = normalizeUserRole(requestHeaders.get("x-user-role"), "consumer");

  return (
    <RoleAppShell role={role} userName={requestHeaders.get("x-user-name")}>
      {children}
    </RoleAppShell>
  );
}
