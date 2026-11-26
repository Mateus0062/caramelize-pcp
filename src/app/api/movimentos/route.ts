import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMovimento, listMovimentos } from "@/lib/db";

const schema = z.object({
  insumoId: z.coerce.number().int().positive("Selecione um insumo"),
  quantidade: z.coerce.number().positive("Quantidade deve ser maior que zero"),
  tipo: z.enum(["COMPRA", "PRODUCAO", "AJUSTE_ENTRADA", "AJUSTE_SAIDA"]),
  custoUnitario: z.coerce.number().min(0).nullable().optional(),
  observacao: z.string().max(255).nullable().optional(),
  atualizarPrecoInsumo: z.boolean().optional(),
});

export async function GET() {
  try {
    const movimentos = await listMovimentos();
    return NextResponse.json(movimentos);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar movimentos" },
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
    const created = await createMovimento(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao registrar movimento" },
      { status: 400 },
    );
  }
}
