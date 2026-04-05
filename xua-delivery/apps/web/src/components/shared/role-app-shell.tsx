"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Droplets,
  FileText,
  Headphones,
  KeyRound,
  MapPin,
  Package,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Truck,
  User,
  Zap,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { UserRole } from "@/src/lib/role-utils";
import { useAuthStore } from "@/src/store/auth";
import { OfflineBanner } from "@/src/components/shared/offline-banner";
import { LogoutButton } from "@/src/components/shared/logout-button";

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

const ROLE_SHELL_CONFIG: Record<UserRole, RoleShellConfig> = {
  consumer: {
    badgeLabel: "Consumidor",
    navItems: [
      { href: "/catalog", label: "Catálogo", icon: ShoppingBag },
      {
        href: "/cart",
        label: "Carrinho",
        icon: ShoppingCart,
        match: ["/cart", "/checkout"],
      },
      { href: "/orders", label: "Pedidos", icon: ReceiptText },
      {
        href: "/subscription/manage",
        label: "Assinatura",
        icon: CalendarDays,
        match: ["/subscription"],
      },
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
      {
        href: "/distributor/reconciliation",
        label: "Concilia",
        icon: ArrowLeftRight,
      },
      { href: "/distributor/kpis", label: "KPIs", icon: BarChart3 },
    ],
  },
  driver: {
    badgeLabel: "Motorista",
    navItems: [
      { href: "/driver/deliveries", label: "Entregas", icon: Truck },
    ],
  },
  ops: {
    badgeLabel: "Operacoes",
    navItems: [
      { href: "/ops/kpis", label: "KPIs", icon: BarChart3 },
      { href: "/ops/zones", label: "Zonas", icon: MapPin },
      { href: "/ops/products", label: "Produtos", icon: Package },
      { href: "/support", label: "Suporte", icon: Headphones },
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

function isItemActive(pathname: string, item: RoleNavItem) {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((prefix) => pathname.startsWith(prefix));
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OfflineBanner />

      {role === "consumer" ? (
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80 shadow-[0_1px_8px_rgba(0,26,64,0.04)]">
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            {/* Endereço de entrega */}
            <button className="flex min-w-0 items-center gap-1.5 text-left">
              <MapPin className="h-4 w-4 shrink-0 text-[#0041c8]" />
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#737688]">
                  Entregar em
                </span>
                <span className="flex items-center gap-0.5 text-sm font-medium text-[#191c1d] truncate">
                  Rua das Águas, 123
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#737688]" />
                </span>
              </div>
            </button>

            {/* Logo centralizado */}
            <span className="text-xl font-bold font-heading text-[#001a40]">Xuá</span>

            {/* Ícone ação */}
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0041c8]/10">
              <Zap className="h-4 w-4 text-[#0041c8]" />
            </button>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80 shadow-[0_1px_8px_rgba(0,26,64,0.04)]">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-[#0041c8] to-[#0055ff]">
                  <Droplets className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold font-heading text-[#0041c8]">Xua</span>
              </div>
              <span className="rounded-full bg-[#0041c8]/10 px-2 py-0.5 text-xs font-semibold text-[#0041c8]">
                {config.badgeLabel}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {firstName ? (
                <span className="hidden max-w-28 truncate text-sm text-muted-foreground sm:block">
                  Ola, {firstName}
                </span>
              ) : null}
              <LogoutButton />
            </div>
          </div>
        </header>
      )}

      <main className={cn("flex-1 pb-24 md:pb-28", contentClassName)}>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur shadow-[0_-1px_8px_rgba(0,26,64,0.04)] supports-backdrop-filter:bg-white/80">
        <ul className="mx-auto flex w-full max-w-3xl items-stretch justify-around gap-1 px-2 py-1.5">
          {config.navItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item);

            return (
              <li key={item.href} className="flex min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-center transition-colors",
                    active ? "text-[#0041c8]" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "fill-[#0041c8]/15")} />
                  <span className={cn("text-[10px] leading-tight", active && "font-semibold")}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}