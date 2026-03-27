import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/src/lib/api-handler";
import { depositService } from "@/src/services/consumer/deposit-service";

export const GET = withErrorHandling(async (req: NextRequest, ctx) => {
  const userId = req.headers.get("x-user-id");
  const { id } = await ctx!.params;

  if (userId !== id) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const preview = await depositService.getPreview(id);
  return NextResponse.json(preview);
});