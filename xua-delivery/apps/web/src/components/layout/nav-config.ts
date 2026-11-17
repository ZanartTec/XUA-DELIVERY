import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CircleUser,
  ClipboardList,
  FileText,
  Headphones,
  History,
  Image,
  KeyRound,
  MapPin,
  Package,
  ReceiptText,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Truck,
  User,
  UserCog,
  Wallet,
} from "lucide-react";
import type { UserRole } from "@/src/lib/role-utils";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Prefixos extras que também acendem o item (ex.: telas de detalhe). */
  match?: string[];
  /** Título de seção na sidebar; itens seguidos do mesmo grupo ficam juntos. */
  group?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface RoleNav {
  badgeLabel: string;
  items: NavItem[];
}

/** Menu de cada perfil. A mesma lista alimenta sidebar, bottom nav, paleta ⌘K e breadcrumb. */
export const ROLE_NAV: Record<UserRole, RoleNav> = {
  consumer: {
    badgeLabel: "Consumidor",
    items: [
      { href: "/catalog", label: "Catálogo", icon: ShoppingBag },
      { href: "/cart", label: "Carrinho", icon: ShoppingCart, match: ["/cart", "/checkout"] },
      { href: "/orders", label: "Pedidos", icon: ReceiptText },
      { href: "/subscription/manage", label: "Assinatura", icon: CalendarDays, match: ["/subscription"] },
      { href: "/profile", label: "Perfil", icon: User },
    ],
  },
  distributor_admin: {
    badgeLabel: "Distribuidor",
    items: [
      {
        href: "/distributor/queue",
        label: "Pedidos",
        icon: ClipboardList,
        match: ["/distributor/queue", "/distributor/orders", "/distributor/routes"],
        group: "Operação",
      },
      // Conciliação é uma ação dentro do Estoque, não um item próprio.
      {
        href: "/distributor/inventory",
        label: "Estoque",
        icon: Boxes,
        match: ["/distributor/inventory", "/distributor/reconciliation"],
        group: "Operação",
      },
      { href: "/distributor/drivers", label: "Motoristas", icon: UserCog, group: "Operação" },
      { href: "/distributor/schedule", label: "Agenda", icon: CalendarDays, group: "Operação" },
      { href: "/distributor/payment-config", label: "Pagamento", icon: Wallet, group: "Gestão" },
      { href: "/distributor/kpis", label: "Indicadores", icon: BarChart3, group: "Gestão" },
      { href: "/distributor/account", label: "Conta", icon: CircleUser, group: "Gestão" },
    ],
  },
  driver: {
    badgeLabel: "Motorista",
    items: [
      { href: "/driver/deliveries", label: "Entregas", icon: Truck },
      { href: "/driver/history", label: "Histórico", icon: History },
      { href: "/driver/account", label: "Conta", icon: CircleUser },
    ],
  },
  ops: {
    badgeLabel: "Operações",
    items: [
      { href: "/support", label: "Suporte", icon: Headphones, group: "Operação" },
      { href: "/ops/kpis", label: "Indicadores", icon: BarChart3, group: "Operação" },
      { href: "/ops/otp-override", label: "Sem código", icon: KeyRound, group: "Operação" },
      { href: "/ops/distributors", label: "Distribuidoras", icon: Building2, group: "Rede" },
      { href: "/ops/zones", label: "Zonas", icon: MapPin, group: "Rede" },
      { href: "/ops/drivers", label: "Motoristas", icon: UserCog, group: "Rede" },
      { href: "/ops/inventory", label: "Estoque", icon: Boxes, group: "Rede" },
      { href: "/ops/products", label: "Produtos", icon: Package, group: "Catálogo" },
      { href: "/ops/subscription-plans", label: "Planos", icon: Repeat, group: "Catálogo" },
      { href: "/ops/banners", label: "Banners", icon: Image, group: "Catálogo" },
      { href: "/ops/audit-export", label: "Auditoria", icon: FileText, group: "Sistema" },
      { href: "/ops/account", label: "Conta", icon: CircleUser, group: "Sistema" },
    ],
  },
  support: {
    badgeLabel: "Suporte",
    items: [
      { href: "/support", label: "Suporte", icon: Headphones, group: "Operação" },
      { href: "/ops/otp-override", label: "Sem código", icon: KeyRound, group: "Operação" },
      { href: "/support/account", label: "Conta", icon: CircleUser, group: "Sistema" },
    ],
  },
};

/**
 * Item ativo = o de prefixo mais longo que casa com a rota. Evita dois itens
 * acesos ao mesmo tempo (ex.: "Estoque" e "Conciliação" na distribuidora).
 */
export function resolveActiveItem(pathname: string, items: NavItem[]): NavItem | null {
  let best: { item: NavItem; len: number } | null = null;
  for (const item of items) {
    for (const prefix of item.match ?? [item.href]) {
      const hit = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (hit && (!best || prefix.length > best.len)) best = { item, len: prefix.length };
    }
  }
  return best?.item ?? null;
}

/** Agrupa itens consecutivos de mesmo `group`; itens sem grupo ficam num bloco sem rótulo. */
export function groupNavItems(items: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === item.group) last.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }
  return groups;
}
