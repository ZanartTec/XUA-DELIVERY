import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { coverageSchema } from "@/src/schemas/distributor/zone";
import { withErrorHandling } from "@/src/lib/api-handler";

export const POST = withErrorHandling(async (req: NextRequest, ctx) => {
  const { id: zoneId } = await ctx!.params;

  const body = await req.json();
  const parsed = coverageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const coverage = await prisma.zoneCoverage.create({
    data: {
      zone_id: zoneId,
      neighborhood: parsed.data.neighborhood,
      zip_code: parsed.data.zip_code,
    },
  });

  return NextResponse.json(coverage, { status: 201 });
});

export const DELETE = withErrorHandling(async (req: NextRequest, ctx) => {
  const { id: zoneId } = await ctx!.params;
  const coverageId = req.nextUrl.searchParams.get("coverageId");

  if (!coverageId) {
    return NextResponse.json({ error: "coverageId obrigatório" }, { status: 400 });
  }

  await prisma.zoneCoverage.delete({
    where: { id: coverageId, zone_id: zoneId },
  });

  return new NextResponse(null, { status: 204 });
});
