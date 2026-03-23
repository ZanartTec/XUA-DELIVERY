import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { zoneSchema } from "@/src/schemas/zone";
import { withErrorHandling } from "@/src/lib/api-handler";

export const GET = withErrorHandling(async () => {
  const zones = await prisma.zone.findMany({
    where: { is_active: true },
    include: { coverage: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(zones);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = zoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const zone = await prisma.zone.create({ data: parsed.data });
  return NextResponse.json(zone, { status: 201 });
});
