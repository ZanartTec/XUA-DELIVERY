import { NextRequest, NextResponse } from "next/server";
import { orderService } from "@/src/services/order-service";
import { prisma } from "@/src/lib/prisma";

// SEC-05: Verifica se o usuário tem acesso ao pedido
function canAccess(order: { consumer_id: string; distributor_id: string; driver_id: string | null }, userId: string, role: string): boolean {
  if (role === "ops" || role === "support") return true;
  if (role === "consumer" && order.consumer_id === userId) return true;
  if (role === "distributor_admin" && order.distributor_id === userId) return true;
  if (role === "driver" && order.driver_id === userId) return true;
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role") ?? "";

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (!userId || !canAccess(order, userId, role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const items = await prisma.orderItem.findMany({
    where: { order_id: id },
    select: {
      quantity: true,
      unit_price_cents: true,
      product: { select: { name: true } },
    },
  });

  const events = await prisma.auditEvent.findMany({
    where: { order_id: id },
    orderBy: { occurred_at: "asc" },
    select: { event_type: true, occurred_at: true, actor_id: true },
  });

  return NextResponse.json({
    order: {
      ...order,
      items: items.map((i) => ({
        product_name: i.product.name,
        qty: i.quantity,
        unit_price_cents: i.unit_price_cents,
      })),
      events: events.map((e) => ({
        status: e.event_type,
        timestamp: e.occurred_at,
        actor: e.actor_id,
      })),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") ?? "system";
  const role = req.headers.get("x-user-role") ?? "";

  // SEC-05: Verifica ownership antes de permitir ação
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  if (!canAccess(existing, userId, role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const { action, ...payload } = body;

  switch (action) {
    case "accept":
      await orderService.acceptOrder(id, userId);
      break;
    case "reject":
      await orderService.rejectOrder(id, userId, payload.reason);
      break;
    case "dispatch":
      await orderService.dispatch(id, userId);
      break;
    case "deliver":
      await orderService.deliverOrder(id, userId);
      break;
    case "cancel":
      await orderService.cancelOrder(id, userId, payload.actor_type ?? "consumer", payload.reason ?? "Cancelado pelo usuário");
      break;
    case "verify_otp": {
      const { otpService } = await import("@/src/services/otp-service");
      const valid = await otpService.validate(id, payload.code, userId);
      if (!valid) {
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 400 });
      }
      await orderService.deliverOrder(id, userId);
      break;
    }
    case "otp_override": {
      const { otpService: otpSvc } = await import("@/src/services/otp-service");
      await otpSvc.override(id, userId, payload.reason);
      await orderService.deliverOrder(id, userId);
      break;
    }
    case "complete_checklist":
      await orderService.completeChecklist(id, userId);
      break;
    default:
      return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  return NextResponse.json({ order });
}
