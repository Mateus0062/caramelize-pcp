import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createForma, listFormas } from "@/lib/db";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da forma").max(80),
  volumeMl: z.coerce.number().positive("Volume em ml deve ser maior que zero"),
  insumoId: z.coerce.number().int().positive("Selecione o insumo da embalagem"),
});

export async function GET() {
  try {
    const formas = await listFormas();
    return NextResponse.json(formas);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar formas" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }
    const created = await createForma(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar forma" },
      { status: 400 },
    );
  }
}
