import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { fetchCep } from "@/src/lib/cep";
import { z } from "zod";

const createAddressSchema = z.object({
  zip_code: z.string().trim().min(1, "CEP é obrigatório"),
  street: z.string().trim().min(1, "Rua é obrigatória"),
  number: z.string().trim().min(1, "Número é obrigatório"),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(1, "Bairro é obrigatório"),
  city: z.string().trim().min(1, "Cidade é obrigatória"),
  state: z.string().trim().min(1, "Estado é obrigatório"),
  is_default: z.boolean().optional().default(false),
});

function formatZipCode(zipCode: string) {
  const clean = zipCode.replace(/\D/g, "");
  return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // SEC-05: Verificação de ownership
  const userId = req.headers.get("x-user-id");
  if (id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action");
  if (action === "cep") {
    const cep = req.nextUrl.searchParams.get("cep") ?? "";
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      return NextResponse.json({ error: "CEP inválido" }, { status: 400 });
    }
    const data = await fetchCep(clean);
    if (!data) {
      return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  const addresses = await prisma.address.findMany({
    where: { consumer_id: id },
    orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
  });

  return NextResponse.json({ addresses });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // SEC-05: Verificação de ownership
  const userId = req.headers.get("x-user-id");
  if (id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createAddressSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 }
    );
  }

  const cleanZipCode = parsed.data.zip_code.replace(/\D/g, "");
  if (cleanZipCode.length !== 8) {
    return NextResponse.json({ error: "CEP inválido" }, { status: 400 });
  }

  const formattedZipCode = formatZipCode(cleanZipCode);

  const result = await prisma.$transaction(async (tx) => {
    const coverage = await tx.zoneCoverage.findFirst({
      where: {
        zip_code: { in: [cleanZipCode, formattedZipCode] },
        zone: { is_active: true },
      },
      select: { zone_id: true },
    });

    if (!coverage) {
      return { code: "NO_COVERAGE" as const };
    }

    if (parsed.data.is_default) {
      await tx.address.updateMany({
        where: { consumer_id: id, is_default: true },
        data: { is_default: false },
      });
    }

    const address = await tx.address.create({
      data: {
        consumer_id: id,
        zip_code: formattedZipCode,
        street: parsed.data.street,
        number: parsed.data.number,
        complement: parsed.data.complement || null,
        neighborhood: parsed.data.neighborhood,
        city: parsed.data.city,
        state: parsed.data.state,
        zone_id: coverage.zone_id,
        is_default: parsed.data.is_default,
      },
    });

    return { address };
  });

  if ("code" in result) {
    return NextResponse.json(
      { error: "Ainda não atendemos sua região", code: "NO_COVERAGE" },
      { status: 400 }
    );
  }

  return NextResponse.json({ address: result.address }, { status: 201 });
}
