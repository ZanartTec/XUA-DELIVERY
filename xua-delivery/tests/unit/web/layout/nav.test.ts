import { describe, expect, it } from "vitest";
import { ROLE_NAV, groupNavItems, resolveActiveItem } from "@/src/components/layout/nav-config";
import { buildCrumbs, titleForPath } from "@/src/components/layout/route-titles";

const distributor = ROLE_NAV.distributor_admin.items;
const ops = ROLE_NAV.ops.items;

describe("resolveActiveItem", () => {
  it("acende o item pelo prefixo mais longo", () => {
    expect(resolveActiveItem("/distributor/queue", distributor)?.label).toBe("Pedidos");
    expect(resolveActiveItem("/distributor/orders/abc/checklist", distributor)?.label).toBe("Pedidos");
    expect(resolveActiveItem("/distributor/inventory/reconciliation", distributor)?.label).toBe("Estoque");
  });

  it("não acende item para rota fora do menu", () => {
    expect(resolveActiveItem("/login", distributor)).toBeNull();
  });

  it("não confunde prefixos parecidos", () => {
    expect(resolveActiveItem("/ops/inventoryx", ops)).toBeNull();
  });
});

describe("groupNavItems", () => {
  it("agrupa itens consecutivos de mesmo grupo", () => {
    const groups = groupNavItems(distributor);
    expect(groups.map((g) => g.label)).toEqual(["Operação", "Gestão"]);
    expect(groups[0]?.items).toHaveLength(4);
  });

  it("perfil sem grupos gera um bloco sem rótulo", () => {
    const groups = groupNavItems(ROLE_NAV.driver.items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBeUndefined();
  });
});

describe("titleForPath", () => {
  it("casa segmentos dinâmicos", () => {
    expect(titleForPath("/distributor/orders/123")).toBe("Pedido");
    expect(titleForPath("/driver/deliveries/9/otp")).toBe("Código de entrega");
  });

  it("devolve undefined para rota desconhecida", () => {
    expect(titleForPath("/nada")).toBeUndefined();
  });
});

describe("buildCrumbs", () => {
  it("lista de nível único: grupo / página atual", () => {
    expect(buildCrumbs("/distributor/queue", distributor)).toEqual([{ label: "Operação" }, { label: "Pedidos" }]);
  });

  it("detalhe: grupo / página do menu (link) / página atual", () => {
    expect(buildCrumbs("/distributor/orders/42", distributor)).toEqual([
      { label: "Operação" },
      { label: "Pedidos", href: "/distributor/queue" },
      { label: "Pedido" },
    ]);
  });

  it("subpágina com pai no mapa não repete o item do menu", () => {
    expect(buildCrumbs("/ops/inventory/reconciliations", ops)).toEqual([
      { label: "Rede" },
      { label: "Estoque", href: "/ops/inventory" },
      { label: "Conciliações" },
    ]);
  });

  it("perfil sem grupo não ganha rótulo de grupo", () => {
    expect(buildCrumbs("/driver/history", ROLE_NAV.driver.items)).toEqual([{ label: "Histórico" }]);
  });
});
