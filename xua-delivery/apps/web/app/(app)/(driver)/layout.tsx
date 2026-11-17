import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/src/components/layout/app-shell";
import { normalizeUserRole } from "@/src/lib/role-utils";
import { readSidebarOpen } from "@/src/lib/sidebar-state";

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

  const defaultSidebarOpen = await readSidebarOpen();

  return (
    <AppShell
      role={role}
      defaultSidebarOpen={defaultSidebarOpen}
      userName={requestHeaders.get("x-user-name")}
      contentClassName="pb-24 md:px-4 md:pb-28"
    >
      {children}
    </AppShell>
  );
}
