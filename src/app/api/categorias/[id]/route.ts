import { NextRequest, NextResponse } from "next/server";
import { deleteCategoria } from "@/lib/db";

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
    await deleteCategoria(numericId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao excluir categoria" },
      { status: 400 },
    );
  }
}
