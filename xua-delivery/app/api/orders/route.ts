import { NextRequest, NextResponse } from "next/server";
import { createOrderSchema } from "@/src/schemas/order";
import { orderService } from "@/src/services/order-service";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role");
  const scope = req.nextUrl.searchParams.get("scope");

  // SEC-12: Verificação de role para scope=distributor
  if (scope === "distributor") {
    if (role !== "distributor_admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    const status = req.nextUrl.searchParams.get("status");
    const query = db(TABLES.ORDERS).where({ distributor_id: userId });
    if (status) query.where({ status });
    const orders = await query.orderBy("created_at", "desc");
    return NextResponse.json({ orders });
  }

  // SEC-08: Verificação de role + sanitização de wildcard SQL
  if (scope === "support") {
    if (role !== "support" && role !== "ops") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const q = (req.nextUrl.searchParams.get("q") ?? "").replace(/[%_\\]/g, "");
    if (q.length < 3) {
      return NextResponse.json({ error: "Busca deve ter ao menos 3 caracteres" }, { status: 400 });
    }

    const orders = await db(TABLES.ORDERS)
      .join(TABLES.CONSUMERS, `${TABLES.ORDERS}.consumer_id`, `${TABLES.CONSUMERS}.id`)
      .where(function () {
        this.where(`${TABLES.CONSUMERS}.phone`, "like", `%${q}%`)
          .orWhere(`${TABLES.CONSUMERS}.email`, "like", `%${q}%`)
          .orWhere(`${TABLES.ORDERS}.id`, q);
      })
      .select(
        `${TABLES.ORDERS}.*`,
        `${TABLES.CONSUMERS}.name as consumer_name`,
        `${TABLES.CONSUMERS}.email as consumer_email`,
        `${TABLES.CONSUMERS}.phone as consumer_phone`
      )
      .orderBy(`${TABLES.ORDERS}.created_at`, "desc")
      .limit(50);
    return NextResponse.json({ orders });
  }

  if (role === "consumer") {
    const orders = await db(TABLES.ORDERS)
      .where({ consumer_id: userId })
      .orderBy("created_at", "desc");
    return NextResponse.json({ orders });
  }

  return NextResponse.json({ orders: [] });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // FUNC-03: Resolve zona e distribuidor pelo endereço
  const address = await db(TABLES.ADDRESSES).where({ id: parsed.data.address_id, consumer_id: userId }).first();
  if (!address) {
    return NextResponse.json({ error: "Endereço não encontrado" }, { status: 404 });
  }
  if (!address.zone_id) {
    return NextResponse.json({ error: "Endereço sem zona de entrega configurada" }, { status: 400 });
  }

  const zone = await db(TABLES.ZONES).where({ id: address.zone_id, is_active: true }).first();
  if (!zone) {
    return NextResponse.json({ error: "Zona de entrega inativa" }, { status: 400 });
  }

  // Busca preços reais dos produtos
  const productIds = parsed.data.items.map((i) => i.product_id);
  const products = await db(TABLES.PRODUCTS).whereIn("id", productIds).where({ is_active: true });
  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "Um ou mais produtos inválidos ou inativos" }, { status: 400 });
  }

  const productMap = new Map(products.map((p: { id: string; name: string; price_cents: number }) => [p.id, p]));

  try {
    const order = await orderService.createOrder({
      consumerId: userId,
      addressId: parsed.data.address_id,
      distributorId: zone.distributor_id,
      zoneId: zone.id,
      deliveryDate: parsed.data.delivery_date,
      deliveryWindow: parsed.data.delivery_window,
      items: parsed.data.items.map((i) => {
        const product = productMap.get(i.product_id)!;
        return {
          product_id: i.product_id,
          product_name: product.name,
          unit_price_cents: product.price_cents,
          quantity: i.quantity,
        };
      }),
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    if (msg === "SLOT_FULL") {
      return NextResponse.json({ error: "Horário de entrega esgotado" }, { status: 409 });
    }
    if (msg === "SLOT_NOT_FOUND") {
      return NextResponse.json({ error: "Horário de entrega não disponível" }, { status: 404 });
    }
    throw error;
  }
}
