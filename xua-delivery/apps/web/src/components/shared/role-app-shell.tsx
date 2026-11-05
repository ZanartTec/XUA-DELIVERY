"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  Headphones,
  History,
  Image,
  KeyRound,
  MapPin,
  MoreHorizontal,
  Package,
  Repeat,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Truck,
  User,
  UserCog,
  Wallet,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { UserRole } from "@/src/lib/role-utils";
import { useAuthStore } from "@/src/store/auth";
import { useCartStore } from "@/src/store/cart";
import { useIsClient } from "@/src/hooks/use-is-client";
import { OfflineBanner } from "@/src/components/shared/offline-banner";
import { LogoutButton } from "@/src/components/shared/logout-button";
import { AddressSheet } from "@/src/components/consumer/address-sheet";
import { useSelectedAddress } from "@/src/hooks/consumer/use-addresses";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";

interface RoleNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: string[];
}

interface RoleShellConfig {
  badgeLabel: string;
  navItems: RoleNavItem[];
}

/** No mobile cabem 5 itens; acima disso, os 4 primeiros + "Mais". */
const MAX_BOTTOM_ITEMS = 5;

const ROLE_SHELL_CONFIG: Record<UserRole, RoleShellConfig> = {
  consumer: {
    badgeLabel: "Consumidor",
    navItems: [
      { href: "/catalog", label: "Catálogo", icon: ShoppingBag },
      { href: "/cart", label: "Carrinho", icon: ShoppingCart, match: ["/cart", "/checkout"] },
      { href: "/orders", label: "Pedidos", icon: ReceiptText },
      { href: "/subscription/manage", label: "Assinatura", icon: CalendarDays, match: ["/subscription"] },
      { href: "/profile", label: "Perfil", icon: User },
    ],
  },
  distributor_admin: {
    badgeLabel: "Distribuidor",
    navItems: [
      {
        href: "/distributor/queue",
        label: "Pedidos",
        icon: ClipboardList,
        match: ["/distributor/queue", "/distributor/orders", "/distributor/routes"],
      },
      { href: "/distributor/inventory", label: "Estoque", icon: Boxes, match: ["/distributor/inventory"] },
      { href: "/distributor/inventory/reconciliation", label: "Conciliação", icon: ArrowLeftRight },
      { href: "/distributor/schedule", label: "Agenda", icon: CalendarDays },
      { href: "/distributor/payment-config", label: "Pagamento", icon: Wallet },
      { href: "/distributor/drivers", label: "Motoristas", icon: UserCog },
      // Venda simples (sem caução): entrada oculta até a feature Comodato B2B.
      // Tela continua acessível por rota direta (/distributor/deposit-program).
      { href: "/distributor/kpis", label: "KPIs", icon: BarChart3 },
    ],
  },
  driver: {
    badgeLabel: "Motorista",
    navItems: [
      { href: "/driver/deliveries", label: "Entregas", icon: Truck },
      { href: "/driver/history", label: "Histórico", icon: History },
    ],
  },
  ops: {
    badgeLabel: "Operações",
    navItems: [
      { href: "/ops/kpis", label: "KPIs", icon: BarChart3 },
      { href: "/support", label: "Suporte", icon: Headphones },
      { href: "/ops/zones", label: "Zonas", icon: MapPin },
      { href: "/ops/inventory", label: "Estoque", icon: Boxes, match: ["/ops/inventory"] },
      { href: "/ops/products", label: "Produtos", icon: Package },
      { href: "/ops/banners", label: "Banners", icon: Image },
      { href: "/ops/subscription-plans", label: "Planos", icon: Repeat },
      { href: "/ops/distributors", label: "Distribuidoras", icon: Building2 },
      { href: "/ops/drivers", label: "Motoristas", icon: UserCog },
      { href: "/ops/otp-override", label: "OTP", icon: KeyRound },
      { href: "/ops/audit-export", label: "Auditoria", icon: FileText },
    ],
  },
  support: {
    badgeLabel: "Suporte",
    navItems: [
      { href: "/support", label: "Suporte", icon: Headphones },
      { href: "/ops/otp-override", label: "OTP", icon: KeyRound },
    ],
  },
};

/**
 * Item ativo = o de prefixo mais longo que casa com a rota. Evita dois itens
 * acesos ao mesmo tempo (ex.: "Estoque" e "Conciliação" na distribuidora, D-01).
 */
function resolveActiveHref(pathname: string, items: RoleNavItem[]): string | null {
  let best: { href: string; len: number } | null = null;
  for (const item of items) {
    for (const prefix of item.match ?? [item.href]) {
      const hit = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (hit && (!best || prefix.length > best.len)) best = { href: item.href, len: prefix.length };
    }
  }
  return best?.href ?? null;
}

function useCartCount(enabled: boolean) {
  const total = useCartStore((s) => s.getTotalItems());
  const mounted = useIsClient();
  return enabled && mounted ? total : 0;
}

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

export function RoleAppShell({
  role,
  userName,
  children,
  contentClassName,
}: {
  role: UserRole;
  userName?: string | null;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const storeUser = useAuthStore((state) => state.user);
  const config = ROLE_SHELL_CONFIG[role];
  const resolvedName = storeUser?.name ?? userName ?? null;
  const firstName = resolvedName?.trim().split(/\s+/)[0];
  const isConsumer = role === "consumer";

  const activeHref = resolveActiveHref(pathname, config.navItems);
  const cartCount = useCartCount(isConsumer);
  const badgeFor = (href: string) => (isConsumer && href === "/cart" ? cartCount : 0);

  const overflow = config.navItems.length > MAX_BOTTOM_ITEMS;
  const bottomItems = overflow ? config.navItems.slice(0, MAX_BOTTOM_ITEMS - 1) : config.navItems;
  const moreItems = overflow ? config.navItems.slice(MAX_BOTTOM_ITEMS - 1) : [];
  const moreActive = moreItems.some((i) => i.href === activeHref);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col overflow-x-clip bg-background",
        "[--bottom-nav-h:calc(4rem+env(safe-area-inset-bottom))] md:[--app-sidebar-w:15rem] md:[--bottom-nav-h:0px]",
        isConsumer ? "[--app-header-h:4rem]" : "[--app-header-h:3.5rem]",
      )}
    >
      <OfflineBanner />

      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-(--app-sidebar-w) flex-col border-r border-hairline bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <img src="/logo-transparent.png" alt="Xuá" className="h-9 w-auto" />
          {!isConsumer ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {config.badgeLabel}
            </span>
          ) : null}
        </div>
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="grid gap-1">
            {config.navItems.map((item) => {
              const active = item.href === activeHref;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    <CountBadge count={badgeFor(item.href)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center justify-between gap-2 border-t border-hairline px-5 py-3">
          <span className="truncate text-sm text-muted-foreground">{firstName ? `Olá, ${firstName}` : null}</span>
          <LogoutButton />
        </div>
      </aside>

      {/* Header (topo: contexto) */}
      <header className="sticky top-0 z-40 bg-background/95 shadow-[0_1px_8px_rgba(0,26,64,0.04)] backdrop-blur supports-backdrop-filter:bg-background/80 md:pl-(--app-sidebar-w)">
        {isConsumer ? (
          <ConsumerHeader />
        ) : (
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/logo-transparent.png" alt="Xuá" className="h-8 w-auto" />
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {config.badgeLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {firstName ? (
                <span className="hidden max-w-28 truncate text-sm text-muted-foreground sm:block">Olá, {firstName}</span>
              ) : null}
              <LogoutButton />
            </div>
          </div>
        )}
      </header>

      <main className={cn("flex-1 pb-(--bottom-nav-h) md:pl-(--app-sidebar-w)", contentClassName)}>{children}</main>

      {/* Bottom nav (mobile, zona do polegar) */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/85 md:hidden"
      >
        <ul className="mx-auto flex h-16 w-full max-w-3xl items-stretch justify-around px-1">
          {bottomItems.map((item) => (
            <li key={item.href} className="flex min-w-0 flex-1">
              <BottomNavLink item={item} active={item.href === activeHref} badge={badgeFor(item.href)} />
            </li>
          ))}
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
              {moreItems.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
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
    </div>
  );
}

function BottomNavLink({ item, active, badge }: { item: RoleNavItem; active: boolean; badge: number }) {
  const Icon = item.icon;
  return (
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
      <span className={cn("truncate text-[11px] leading-tight", active && "font-semibold")}>{item.label}</span>
      {badge > 0 ? <span className="sr-only">{`, ${badge} itens`}</span> : null}
    </Link>
  );
}

/** Header do consumidor: "Entregar em …" (abre o seletor de endereço). */
function ConsumerHeader() {
  const { address, isLoading } = useSelectedAddress();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-2 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-muted"
          aria-label={address ? `Endereço de entrega: ${address.street}, ${address.number}. Trocar` : "Selecionar endereço de entrega"}
        >
          <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Entregar em
            </span>
            <span className="flex items-center gap-0.5 text-sm font-medium text-foreground">
              <span className="truncate">
                {address
                  ? `${address.label ? `${address.label} · ` : ""}${address.street}, ${address.number}`
                  : isLoading
                    ? "Carregando…"
                    : "Adicionar endereço"}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </span>
        </button>
        <img src="/logo-transparent.png" alt="Xuá" className="h-10 w-auto shrink-0 md:hidden" />
      </div>
      <AddressSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
