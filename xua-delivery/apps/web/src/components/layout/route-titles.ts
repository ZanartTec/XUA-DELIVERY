import { resolveActiveItem, type NavItem } from "./nav-config";

export interface Crumb {
  label: string;
  /** Sem `href` = só rótulo (grupo do menu ou página atual). */
  href?: string;
}

/** Título de cada rota do app. `[id]` casa qualquer segmento dinâmico. */
const ROUTE_TITLES: ReadonlyArray<readonly [pattern: string, title: string]> = [
  // Consumidor
  ["/catalog", "Catálogo"],
  ["/cart", "Carrinho"],
  ["/checkout/distributor", "Distribuidora"],
  ["/checkout/schedule", "Agendamento"],
  ["/checkout/payment", "Pagamento"],
  ["/checkout/confirmation", "Pedido confirmado"],
  ["/orders", "Pedidos"],
  ["/orders/[id]", "Pedido"],
  ["/profile", "Perfil"],
  ["/profile/addresses", "Endereços"],
  ["/profile/edit", "Editar dados"],
  ["/profile/password", "Senha"],
  ["/profile/help", "Ajuda"],
  ["/subscription/manage", "Assinatura"],
  ["/subscription/create", "Nova assinatura"],
  // Distribuidor
  ["/distributor/queue", "Pedidos"],
  ["/distributor/orders/[id]", "Pedido"],
  ["/distributor/orders/[id]/checklist", "Conferência"],
  ["/distributor/routes/[id]", "Rota"],
  ["/distributor/inventory", "Estoque"],
  ["/distributor/inventory/reconciliation", "Conciliação"],
  ["/distributor/reconciliation", "Conciliação"],
  ["/distributor/drivers", "Motoristas"],
  ["/distributor/schedule", "Agenda"],
  ["/distributor/payment-config", "Pagamento"],
  ["/distributor/kpis", "Indicadores"],
  ["/distributor/deposit-program", "Programa de caução"],
  ["/distributor/account", "Conta"],
  // Motorista
  ["/driver/deliveries", "Entregas"],
  ["/driver/deliveries/[id]", "Entrega"],
  ["/driver/deliveries/[id]/otp", "Código de entrega"],
  ["/driver/deliveries/[id]/failure", "Falha na entrega"],
  ["/driver/history", "Histórico"],
  ["/driver/account", "Conta"],
  // Operações e suporte
  ["/support", "Suporte"],
  ["/support/[id]", "Atendimento"],
  ["/support/account", "Conta"],
  ["/ops/kpis", "Indicadores"],
  ["/ops/otp-override", "Sem código"],
  ["/ops/distributors", "Distribuidoras"],
  ["/ops/zones", "Zonas"],
  ["/ops/drivers", "Motoristas"],
  ["/ops/inventory", "Estoque"],
  ["/ops/inventory/reconciliations", "Conciliações"],
  ["/ops/products", "Produtos"],
  ["/ops/subscription-plans", "Planos"],
  ["/ops/banners", "Banners"],
  ["/ops/audit-export", "Auditoria"],
  ["/ops/account", "Conta"],
];

const COMPILED = ROUTE_TITLES.map(
  ([pattern, title]) => [new RegExp(`^${pattern.replace(/\[id\]/g, "[^/]+")}$`), title] as const,
);

export function titleForPath(pathname: string): string | undefined {
  return COMPILED.find(([re]) => re.test(pathname))?.[1];
}

/**
 * Breadcrumb da rota atual: [grupo do menu] / página do menu / … / página atual.
 * Sem `useMatches` (o Next não tem), então tudo sai do pathname e dos títulos acima.
 */
export function buildCrumbs(pathname: string, items: NavItem[]): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const trail: Crumb[] = [];
  for (let i = 1; i <= segments.length; i++) {
    const href = `/${segments.slice(0, i).join("/")}`;
    const label = titleForPath(href);
    if (label) trail.push({ label, href });
  }

  const active = resolveActiveItem(pathname, items);
  if (active && trail[0]?.href !== active.href) trail.unshift({ label: active.label, href: active.href });
  if (active?.group) trail.unshift({ label: active.group });

  // A página atual não é link.
  const last = trail[trail.length - 1];
  if (last) trail[trail.length - 1] = { label: last.label };
  return trail;
}
