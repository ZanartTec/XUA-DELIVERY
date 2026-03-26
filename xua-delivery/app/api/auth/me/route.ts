import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/src/lib/api-handler";
import { consumerRepository } from "@/src/repositories/consumer/consumer-repository";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const consumer = await consumerRepository.findById(userId);
  if (!consumer) {
    return NextResponse.json({ error: "Consumidor não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ consumer });
});
