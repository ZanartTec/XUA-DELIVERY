import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { profileUpdateSchema } from "@/src/schemas/consumer/consumer";
import { withErrorHandling } from "@/src/lib/api-handler";

export const PATCH = withErrorHandling(async (req: NextRequest, ctx) => {
  const userId = req.headers.get("x-user-id")!;
  const { id } = await ctx!.params;

  // Consumidor só pode editar o próprio perfil
  if (userId !== id) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.consumer.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
  });
});
