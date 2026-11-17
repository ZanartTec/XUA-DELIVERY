"use client";

import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/src/components/ui/sidebar";
import type { NavItem, RoleNav } from "./nav-config";
import { NavPrincipal } from "./nav-principal";
import { UserMenu } from "./user-menu";

interface AppSidebarProps {
  nav: RoleNav;
  /** Onde o logo leva: o primeiro item do menu do perfil. */
  homeHref: string;
  activeHref: string | null;
  badges: Record<string, number>;
  userName: string | null;
}

/** Sidebar do desktop (≥ 768px): logo e perfil, menu por grupos, usuário no rodapé. Recolhe para ícones. */
export function AppSidebar({ nav, homeHref, activeHref, badges, userName }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const accountItem: NavItem | undefined = nav.items.find((item) => item.href.endsWith("/account"));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href={homeHref}
          aria-label="Xuá — início"
          className="flex h-12 items-center gap-2 rounded-md px-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={collapsed ? "/icons/icon-192.png" : "/logo-transparent.png"}
            alt="Xuá"
            className={collapsed ? "size-8 rounded-md" : "h-9 w-auto"}
          />
          {collapsed ? null : (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {nav.badgeLabel}
            </span>
          )}
        </Link>
      </SidebarHeader>
      <SidebarSeparator className="mx-0" />
      <SidebarContent>
        <NavPrincipal items={nav.items} activeHref={activeHref} badges={badges} />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu name={userName} roleLabel={nav.badgeLabel} accountItem={accountItem} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
