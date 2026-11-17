"use client";

import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/src/components/ui/sidebar";
import { groupNavItems, type NavItem } from "./nav-config";

const BADGE_LIMIT = 99;

interface NavPrincipalProps {
  items: NavItem[];
  activeHref: string | null;
  badges: Record<string, number>;
}

/** Menu da sidebar. Item ativo: barra de 2px na cor da marca + fundo de destaque. */
export function NavPrincipal({ items, activeHref, badges }: NavPrincipalProps) {
  return (
    <>
      {groupNavItems(items).map((group, index) => (
        <SidebarGroup key={group.label ?? `grupo-${index}`}>
          {group.label ? (
            <SidebarGroupLabel className="text-[11px] font-semibold tracking-[0.12em] uppercase">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarMenu>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = href === activeHref;
              const count = badges[href] ?? 0;
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={label}>
                    <Link href={href} aria-current={active ? "page" : undefined}>
                      <Icon strokeWidth={2} aria-hidden />
                      <span className="group-data-[collapsible=icon]:hidden">{label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {count > 0 ? (
                    <SidebarMenuBadge className="rounded-full bg-primary/10 text-primary tabular-nums">
                      {count > BADGE_LIMIT ? `${BADGE_LIMIT}+` : count}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
