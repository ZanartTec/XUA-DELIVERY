import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RoleAppShell } from "@/src/components/shared/role-app-shell";
import { normalizeUserRole } from "@/src/lib/role-utils";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const rawRole = requestHeaders.get("x-user-role");

  if (!rawRole) {
    redirect("/login");
  }

  const role = normalizeUserRole(rawRole, "driver");

  if (role !== "driver") {
    redirect("/");
  }

  return (
    <RoleAppShell
      role={role}
      userName={requestHeaders.get("x-user-name")}
      contentClassName="pb-24 md:px-4 md:pb-28"
    >
      {children}
    </RoleAppShell>
  );
}
