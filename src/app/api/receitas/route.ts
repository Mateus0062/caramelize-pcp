import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createReceita, listReceitas } from "@/lib/db";

const receitaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da receita").max(100),
  descricao: z.string().max(255).nullable().optional(),
  rendimentoMl: z.coerce.number().positive("Rendimento em ml deve ser > 0"),
  margemLucro: z.coerce.number().min(0).max(95).default(65),
  itens: z
    .array(
      z.object({
        insumoId: z.coerce.number().int().positive(),
        quantidade: z.coerce.number().positive(),
      }),
    )
    .min(1, "Adicione pelo menos 1 insumo na receita"),
});

export async function GET() {
  try {
    const receitas = await listReceitas();
    return NextResponse.json(receitas);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar receitas" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = receitaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    // Garante insumos únicos na receita somando duplicados caso existam
    const itensUnicos = new Map<number, number>();
    for (const item of parsed.data.itens) {
      itensUnicos.set(
        item.insumoId,
        Number(((itensUnicos.get(item.insumoId) ?? 0) + item.quantidade).toFixed(3)),
      );
    }

    const created = await createReceita({
      ...parsed.data,
      itens: Array.from(itensUnicos.entries()).map(([insumoId, quantidade]) => ({
        insumoId,
        quantidade,
      })),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar receita" },
      { status: 400 },
    );
  }
}
