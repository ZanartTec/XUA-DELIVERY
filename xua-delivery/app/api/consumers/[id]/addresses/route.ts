import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { fetchCep } from "@/src/lib/cep";

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

  const { zip_code, street, number, complement, neighborhood, city, state } = body;
  if (!zip_code || !street || !number || !neighborhood || !city || !state) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const address = await prisma.address.create({
    data: {
      consumer_id: id,
      zip_code,
      street,
      number,
      complement: complement || null,
      neighborhood,
      city,
      state,
      is_default: false,
    },
  });

  return NextResponse.json({ address }, { status: 201 });
}
