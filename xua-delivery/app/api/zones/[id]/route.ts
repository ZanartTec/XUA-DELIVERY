import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { zoneSchema } from "@/src/schemas/distributor/zone";
import { withErrorHandling } from "@/src/lib/api-handler";

export const PATCH = withErrorHandling(async (req: NextRequest, ctx) => {
  const { id } = await ctx!.params;

  const body = await req.json();
  const parsed = zoneSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const zone = await prisma.zone.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(zone);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, ctx) => {
  const { id } = await ctx!.params;

  // Soft delete via is_active
  await prisma.zone.update({
    where: { id },
    data: { is_active: false },
  });

  return new NextResponse(null, { status: 204 });
});
