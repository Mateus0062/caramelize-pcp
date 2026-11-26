import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOrdemProducao, listOrdensProducao } from "@/lib/db";

const createSchema = z.object({
  receitaId: z.coerce.number().int().positive("Selecione uma receita"),
  formaId: z.coerce.number().int().positive("Selecione uma forma"),
  quantidadeUnidades: z.coerce
    .number()
    .int()
    .positive("Quantidade deve ser maior que zero"),
  precoVendaUnitario: z.coerce.number().min(0).nullable().optional(),
  observacao: z.string().max(255).nullable().optional(),
  dataPrevista: z.string().optional(),
});

export async function GET() {
  try {
    const ordens = await listOrdensProducao();
    return NextResponse.json(ordens);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar ordens" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }
    const created = await createOrdemProducao(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar ordem" },
      { status: 400 },
    );
  }
}
