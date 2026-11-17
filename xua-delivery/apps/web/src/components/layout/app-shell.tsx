"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import type { UserRole } from "@/src/lib/role-utils";
import { useAuthStore } from "@/src/store/auth";
import { OfflineBanner } from "@/src/components/shared/offline-banner";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { BottomNav, MobileHeader } from "./mobile-nav";
import { ROLE_NAV, resolveActiveItem } from "./nav-config";
import { useNavBadges } from "./use-nav-badges";

interface AppShellProps {
  role: UserRole;
  userName?: string | null;
  /** Estado da sidebar lido do cookie no servidor (sem piscar no primeiro render). */
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
  contentClassName?: string;
}

/**
 * Estrutura do app por perfil.
 * Desktop (≥ 768px): sidebar recolhível + header com breadcrumb e ⌘K.
 * Celular: header simples + bottom nav. Quem decide é o CSS; o conteúdo é o mesmo.
 *
 * Variáveis de layout usadas por `PageHeader` e `StickyActionBar`:
 * `--app-header-h`, `--bottom-nav-h` e `--app-sidebar-w` (acompanha a sidebar recolhida).
 */
export function AppShell({ role, userName, defaultSidebarOpen = true, children, contentClassName }: AppShellProps) {
  const pathname = usePathname();
  const storeUser = useAuthStore((state) => state.user);
  const nav = ROLE_NAV[role];
  const isConsumer = role === "consumer";
  const name = storeUser?.name ?? userName ?? null;
  const firstName = name?.trim().split(/\s+/)[0];
  const activeHref = resolveActiveItem(pathname, nav.items)?.href ?? null;
  const badges = useNavBadges(role);

  return (
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      className={cn(
        "overflow-x-clip bg-background",
        "[--bottom-nav-h:calc(4rem+env(safe-area-inset-bottom))] md:[--bottom-nav-h:0px]",
        "md:[--app-sidebar-w:var(--sidebar-width)] md:has-data-[state=collapsed]:[--app-sidebar-w:var(--sidebar-width-icon)]",
        isConsumer ? "[--app-header-h:4rem] md:[--app-header-h:3.5rem]" : "[--app-header-h:3.5rem]",
      )}
    >
      <OfflineBanner />
      <AppSidebar
        nav={nav}
        homeHref={nav.items[0]?.href ?? "/"}
        activeHref={activeHref}
        badges={badges}
        userName={name}
      />
      <SidebarInset className="min-w-0">
        <MobileHeader isConsumer={isConsumer} roleLabel={nav.badgeLabel} firstName={firstName} />
        <AppHeader pathname={pathname} items={nav.items} isConsumer={isConsumer} />
        <div className="flex-1 pb-(--bottom-nav-h)">
          <div className={contentClassName}>{children}</div>
        </div>
        <BottomNav items={nav.items} activeHref={activeHref} badges={badges} />
      </SidebarInset>
    </SidebarProvider>
  );
}
