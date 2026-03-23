import { NextRequest, NextResponse } from "next/server";
import { capacityService } from "@/src/services/capacity-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: zoneId } = await params;
  const date = req.nextUrl.searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Parâmetro date é obrigatório" }, { status: 400 });
  }

  const startDate = date;
  const endDate = new Date(new Date(date).getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const slots = await capacityService.checkAvailability(zoneId, startDate, endDate);
  return NextResponse.json({ slots });
}
