"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { RealtimeIndicator } from "@/src/realtime/realtime-indicator";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/src/components/ui/drawer";
import { ConsumerAddress } from "./consumer-address";
import type { NavItem } from "./nav-config";

/** No celular cabem 5 itens; acima disso, os 4 primeiros + "Mais". */
const MAX_BOTTOM_ITEMS = 5;

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      key={count}
      className={cn(
        "flex h-4 min-w-4 animate-badge-pop items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground ring-2 ring-background",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface MobileHeaderProps {
  isConsumer: boolean;
  roleLabel: string;
  firstName?: string;
}

/** Topo do celular (< 768px): endereço (consumidor) ou logo, perfil e estado do tempo real. */
export function MobileHeader({ isConsumer, roleLabel, firstName }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-background/95 shadow-[0_1px_8px_rgba(0,26,64,0.04)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
      {isConsumer ? (
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <div className="min-w-0 flex-1">
            <ConsumerAddress />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-transparent.png" alt="Xuá" className="h-10 w-auto shrink-0" />
        </div>
      ) : (
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-transparent.png" alt="Xuá" className="h-8 w-auto" />
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {roleLabel}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <RealtimeIndicator />
            {firstName ? (
              <span className="max-w-32 truncate text-sm text-muted-foreground">Olá, {firstName}</span>
            ) : null}
          </div>
        </div>
      )}
    </header>
  );
}

interface BottomNavProps {
  items: NavItem[];
  activeHref: string | null;
  badges: Record<string, number>;
}

/** Navegação inferior do celular (zona do polegar). Passou de 5 itens, o resto vai para "Mais". */
export function BottomNav({ items, activeHref, badges }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const overflow = items.length > MAX_BOTTOM_ITEMS;
  const visible = overflow ? items.slice(0, MAX_BOTTOM_ITEMS - 1) : items;
  const more = overflow ? items.slice(MAX_BOTTOM_ITEMS - 1) : [];
  const moreActive = more.some((item) => item.href === activeHref);

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/85 md:hidden"
      >
        <ul className="mx-auto flex h-16 w-full max-w-3xl items-stretch justify-around px-1">
          {visible.map((item) => {
            const Icon = item.icon;
            const active = item.href === activeHref;
            const badge = badges[item.href] ?? 0;
            return (
              <li key={item.href} className="flex min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center transition-colors",
                    active ? "text-primary" : badge > 0 ? "text-primary/80" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="relative inline-flex">
                    <Icon className={cn("size-5", active && "fill-primary/15")} aria-hidden />
                    <CountBadge count={badge} className="absolute -top-1.5 -right-2.5" />
                  </span>
                  <span className={cn("truncate text-[11px] leading-tight", active && "font-semibold")}>
                    {item.label}
                  </span>
                  {badge > 0 ? <span className="sr-only">{`, ${badge} itens`}</span> : null}
                </Link>
              </li>
            );
          })}
          {overflow ? (
            <li className="flex min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center transition-colors",
                  moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MoreHorizontal className="size-5" aria-hidden />
                <span className={cn("text-[11px] leading-tight", moreActive && "font-semibold")}>Mais</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {overflow ? (
        <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="font-heading">Mais opções</DrawerTitle>
            </DrawerHeader>
            <ul className="grid grid-cols-3 gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {more.map((item) => {
                const Icon = item.icon;
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs transition-colors",
                        active
                          ? "border-primary bg-secondary font-semibold text-primary"
                          : "border-hairline bg-card text-foreground hover:border-primary/40",
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </DrawerContent>
        </Drawer>
      ) : null}
    </>
  );
}
