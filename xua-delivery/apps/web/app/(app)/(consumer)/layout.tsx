import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/src/components/layout/app-shell";
import { normalizeUserRole } from "@/src/lib/role-utils";
import { readSidebarOpen } from "@/src/lib/sidebar-state";

export default async function ConsumerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const rawRole = requestHeaders.get("x-user-role");

  // Defesa em profundidade: middleware é o controle primário.
  // Se o header estiver ausente, o request não passou pelo middleware — redirecionar.
  if (!rawRole) {
    redirect("/login");
  }

  const role = normalizeUserRole(rawRole, "consumer");

  // Se a role não pertence a este grupo, redirecionar para a área correta.
  if (role !== "consumer") {
    redirect("/");
  }

  const defaultSidebarOpen = await readSidebarOpen();

  return (
    <AppShell role={role} defaultSidebarOpen={defaultSidebarOpen} userName={requestHeaders.get("x-user-name")}>
      {children}
    </AppShell>
  );
}
