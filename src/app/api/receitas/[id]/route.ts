import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteReceita, updateReceita } from "@/lib/db";

const receitaSchema = z.object({
  nome: z.string().trim().min(2).max(100),
  descricao: z.string().max(255).nullable().optional(),
  rendimentoMl: z.coerce.number().positive(),
  margemLucro: z.coerce.number().min(0).max(95).default(65),
  itens: z
    .array(
      z.object({
        insumoId: z.coerce.number().int().positive(),
        quantidade: z.coerce.number().positive(),
      }),
    )
    .min(1),
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const body = await request.json();
    const parsed = receitaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }

    const itensUnicos = new Map<number, number>();
    for (const item of parsed.data.itens) {
      itensUnicos.set(
        item.insumoId,
        Number(((itensUnicos.get(item.insumoId) ?? 0) + item.quantidade).toFixed(3)),
      );
    }

    const updated = await updateReceita(numericId, {
      ...parsed.data,
      itens: Array.from(itensUnicos.entries()).map(([insumoId, quantidade]) => ({
        insumoId,
        quantidade,
      })),
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar receita" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    await deleteReceita(numericId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao excluir receita" },
      { status: 400 },
    );
  }
}
