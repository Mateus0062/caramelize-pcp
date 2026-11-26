import { NextRequest, NextResponse } from "next/server";
import { deleteForma } from "@/lib/db";

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
    await deleteForma(numericId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao excluir forma" },
      { status: 400 },
    );
  }
}
