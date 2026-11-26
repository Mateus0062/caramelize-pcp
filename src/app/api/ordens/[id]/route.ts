import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteOrdemProducao, updateOrdemProducaoStatus } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum(["PLANEJADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"]),
  permitirEstoqueNegativo: z.boolean().optional(),
});

export async function PATCH(
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
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Status inválido" },
        { status: 400 },
      );
    }
    const updated = await updateOrdemProducaoStatus(
      numericId,
      parsed.data.status,
      parsed.data.permitirEstoqueNegativo ?? false,
    );
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar ordem" },
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
    await deleteOrdemProducao(numericId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao excluir ordem" },
      { status: 400 },
    );
  }
}
