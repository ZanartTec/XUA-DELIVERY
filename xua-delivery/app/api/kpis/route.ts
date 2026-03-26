import { NextRequest, NextResponse } from "next/server";
import { kpiService } from "@/src/services/distributor/kpi-service";
import { withErrorHandling } from "@/src/lib/api-handler";

function parsePeriodDates(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  const days = period === "1d" ? 1 : period === "30d" ? 30 : period === "90d" ? 90 : 7;
  start.setDate(start.getDate() - days);
  return { start, end };
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const role = req.headers.get("x-user-role");
  const userId = req.headers.get("x-user-id");
  const period = req.nextUrl.searchParams.get("period") ?? "7d";
  const distributorId = req.nextUrl.searchParams.get("distributorId");

  const { start, end } = parsePeriodDates(period);

  if (role === "distributor_admin") {
    const [sla, acceptance, redelivery] = await Promise.all([
      kpiService.slaAcceptance(userId!, start, end),
      kpiService.acceptanceRate(userId!, start, end),
      kpiService.redeliveryRate(userId!, start, end),
    ]);

    return NextResponse.json({
      kpis: {
        sla_acceptance_pct: sla.rate,
        acceptance_rate_pct: acceptance.rate,
        redelivery_rate_pct: redelivery.rate,
      },
    });
  }

  if (role === "ops") {
    // Se distributorId informado, retorna KPIs dele
    if (distributorId) {
      const [sla, acceptance, redelivery] = await Promise.all([
        kpiService.slaAcceptance(distributorId, start, end),
        kpiService.acceptanceRate(distributorId, start, end),
        kpiService.redeliveryRate(distributorId, start, end),
      ]);

      return NextResponse.json({
        kpis: {
          sla_acceptance_pct: sla.rate,
          acceptance_rate_pct: acceptance.rate,
          redelivery_rate_pct: redelivery.rate,
        },
      });
    }

    // Sem distributorId: retorna KPIs de todos
    const { prisma } = await import("@/src/lib/prisma");
    const distributors = await prisma.distributor.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
    });

    const kpis = await Promise.all(
      distributors.map(async (d) => {
        const [sla, acceptance, redelivery] = await Promise.all([
          kpiService.slaAcceptance(d.id, start, end),
          kpiService.acceptanceRate(d.id, start, end),
          kpiService.redeliveryRate(d.id, start, end),
        ]);
        return {
          distributor_id: d.id,
          distributor_name: d.name,
          sla_acceptance_pct: sla.rate,
          acceptance_rate_pct: acceptance.rate,
          redelivery_rate_pct: redelivery.rate,
        };
      })
    );

    return NextResponse.json({ kpis });
  }

  return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
});
