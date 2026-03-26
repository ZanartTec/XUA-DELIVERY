import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/src/lib/api-handler";
import { prisma } from "@/src/lib/prisma";
import redis from "@/src/lib/redis";

const CACHE_KEY = "products:active";
const CACHE_TTL = 300; // 5 minutos

export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const cached = await redis.get(CACHE_KEY).catch(() => null);
  if (cached) {
    return NextResponse.json({ products: JSON.parse(cached) });
  }

  const products = await prisma.product.findMany({
    where: { is_active: true },
    select: {
      id: true,
      name: true,
      description: true,
      price_cents: true,
      deposit_cents: true,
      is_active: true,
    },
    orderBy: { name: "asc" },
  });

  redis.set(CACHE_KEY, JSON.stringify(products), "EX", CACHE_TTL).catch(() => {});

  return NextResponse.json({ products });
});
