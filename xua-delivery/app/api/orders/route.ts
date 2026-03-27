import { NextRequest, NextResponse } from "next/server";
import { createOrderSchema } from "@/src/schemas/order";
import { orderService } from "@/src/services/ops/order-service";
import { prisma } from "@/src/lib/prisma";
import { DeliveryWindow, OrderStatus } from "@/src/types/enums";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role");
  const scope = req.nextUrl.searchParams.get("scope");

  // SEC-12: Verificação de role para scope=distributor
  if (scope === "distributor") {
    if (role !== "distributor_admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    const statusParam = req.nextUrl.searchParams.get("status");
    const statusEnum = statusParam ? (statusParam as OrderStatus) : undefined;
    const orders = await prisma.order.findMany({
      where: {
        distributor_id: userId!,
        ...(statusEnum ? { status: statusEnum } : {}),
      },
      orderBy: { created_at: "desc" },
    });
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

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { consumer: { phone: { contains: q } } },
          { consumer: { email: { contains: q } } },
          { id: q },
        ],
      },
      include: {
        consumer: {
          select: { name: true, email: true, phone: true },
        },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    // Flatten consumer data para manter compatibilidade com a resposta anterior
    const mapped = orders.map(({ consumer, ...order }) => ({
      ...order,
      consumer_name: consumer.name,
      consumer_email: consumer.email,
      consumer_phone: consumer.phone,
    }));
    return NextResponse.json({ orders: mapped });
  }

  if (role === "consumer") {
    const orders = await prisma.order.findMany({
      where: { consumer_id: userId! },
      orderBy: { created_at: "desc" },
    });
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
  const address = await prisma.address.findFirst({
    where: { id: parsed.data.address_id, consumer_id: userId },
  });
  if (!address) {
    return NextResponse.json({ error: "Endereço não encontrado" }, { status: 404 });
  }
  if (!address.zone_id) {
    return NextResponse.json({ error: "Endereço sem zona de entrega configurada" }, { status: 400 });
  }

  const zone = await prisma.zone.findFirst({
    where: { id: address.zone_id, is_active: true },
  });
  if (!zone) {
    return NextResponse.json({ error: "Zona de entrega inativa" }, { status: 400 });
  }

  // Busca preços reais dos produtos
  const productIds = parsed.data.items.map((i) => i.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, is_active: true },
  });
  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "Um ou mais produtos inválidos ou inativos" }, { status: 400 });
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  const windowEnum = parsed.data.delivery_window === "morning" ? DeliveryWindow.MORNING : DeliveryWindow.AFTERNOON;

  try {
    const order = await orderService.createOrder({
      consumerId: userId,
      addressId: parsed.data.address_id,
      distributorId: zone.distributor_id,
      zoneId: zone.id,
      deliveryDate: parsed.data.delivery_date,
      deliveryWindow: windowEnum,
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
