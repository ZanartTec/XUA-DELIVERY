import { cookies } from "next/headers";

/** Cookie gravado pelo `SidebarProvider` (shadcn) ao recolher/expandir a sidebar. */
const SIDEBAR_COOKIE = "sidebar_state";

/** Lê no servidor se a sidebar deve abrir expandida. Sem preferência salva, abre expandida. */
export async function readSidebarOpen(): Promise<boolean> {
  const store = await cookies();
  return store.get(SIDEBAR_COOKIE)?.value !== "false";
}
