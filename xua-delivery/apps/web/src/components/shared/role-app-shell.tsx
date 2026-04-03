"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  Droplets,
  FileText,
  Headphones,
  KeyRound,
  MapPin,
  RefreshCw,
  ShoppingCart,
  Truck,
  User,
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
      { href: "/catalog", label: "Catalogo", icon: Droplets },
      {
        href: "/cart",
        label: "Carrinho",
        icon: ShoppingCart,
        match: ["/cart", "/checkout"],
      },
      { href: "/orders", label: "Pedidos", icon: ClipboardList },
      {
        href: "/subscription/manage",
        label: "Assinatura",
        icon: RefreshCw,
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

      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <Droplets className="h-6 w-6 text-accent" />
              <span className="text-lg font-bold text-primary">Xua</span>
            </div>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
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

      <main className={cn("flex-1 pb-24 md:pb-28", contentClassName)}>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-white/80">
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
                    active ? "text-accent" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "fill-accent/15")} />
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