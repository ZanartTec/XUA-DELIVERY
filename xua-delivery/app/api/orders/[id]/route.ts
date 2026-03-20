import { NextRequest, NextResponse } from "next/server";
import { orderService } from "@/src/services/order-service";
import db from "@/src/lib/db";
import { TABLES } from "@/src/lib/tables";

// SEC-05: Verifica se o usuário tem acesso ao pedido
function canAccess(order: Record<string, string>, userId: string, role: string): boolean {
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

  const order = await db(TABLES.ORDERS).where({ id }).first();
  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (!userId || !canAccess(order, userId, role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const items = await db(TABLES.ORDER_ITEMS)
    .join(TABLES.PRODUCTS, `${TABLES.ORDER_ITEMS}.product_id`, `${TABLES.PRODUCTS}.id`)
    .where({ order_id: id })
    .select(`${TABLES.PRODUCTS}.name as product_name`, `${TABLES.ORDER_ITEMS}.quantity as qty`, `${TABLES.ORDER_ITEMS}.unit_price_cents`);

  const events = await db(TABLES.AUDIT_EVENTS)
    .where({ order_id: id })
    .orderBy("occurred_at", "asc")
    .select("event_type as status", "occurred_at as timestamp", "actor_id as actor");

  return NextResponse.json({
    order: { ...order, items, events },
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
  const existing = await db(TABLES.ORDERS).where({ id }).first();
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

  const order = await db(TABLES.ORDERS).where({ id }).first();
  return NextResponse.json({ order });
}
