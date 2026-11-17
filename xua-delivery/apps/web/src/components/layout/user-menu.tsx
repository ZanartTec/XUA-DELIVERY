"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronsUpDown, CircleUser, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/src/components/ui/sidebar";
import { logout } from "@/src/components/shared/logout-button";
import type { NavItem } from "./nav-config";

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

interface UserMenuProps {
  name: string | null;
  roleLabel: string;
  /** Item "Conta" do perfil, quando existir. */
  accountItem?: NavItem;
}

/** Rodapé da sidebar: avatar, nome e perfil; menu com conta e sair. */
export function UserMenu({ name, roleLabel, accountItem }: UserMenuProps) {
  const [leaving, setLeaving] = useState(false);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={name ?? roleLabel} aria-label="Menu do usuário">
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[13px] font-medium text-foreground">{name ?? "Minha conta"}</span>
                <span className="truncate text-[11px] text-muted-foreground">{roleLabel}</span>
              </span>
              <ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuLabel className="grid font-normal">
              <span className="truncate text-[13px] font-medium text-foreground">{name ?? "Minha conta"}</span>
              <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accountItem ? (
              <DropdownMenuItem asChild>
                <Link href={accountItem.href}>
                  <CircleUser aria-hidden />
                  Minha conta
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={leaving}
              onSelect={(event) => {
                event.preventDefault();
                setLeaving(true);
                void logout();
              }}
            >
              <LogOut aria-hidden />
              {leaving ? "Saindo…" : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
