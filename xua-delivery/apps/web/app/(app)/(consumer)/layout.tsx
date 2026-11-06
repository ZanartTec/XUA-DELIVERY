import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RoleAppShell } from "@/src/components/shared/role-app-shell";
import { normalizeUserRole } from "@/src/lib/role-utils";

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

  return (
    <RoleAppShell role={role} userName={requestHeaders.get("x-user-name")}>
      {children}
    </RoleAppShell>
  );
}
