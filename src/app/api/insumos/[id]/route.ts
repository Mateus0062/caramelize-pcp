import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteInsumo, updateInsumo } from "@/lib/db";

const updateSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  unidadeMedida: z.string().trim().min(1).max(10),
  estoqueMinimo: z.coerce.number().min(0),
  custoUnitario: z.coerce.number().min(0),
  categoriaId: z.coerce.number().int().positive(),
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
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }
    const updated = await updateInsumo(numericId, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar insumo" },
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
    await deleteInsumo(numericId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao excluir insumo" },
      { status: 400 },
    );
  }
}
