import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCategoria, listCategorias } from "@/lib/db";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da categoria").max(50),
});

export async function GET() {
  try {
    const categorias = await listCategorias();
    return NextResponse.json(categorias);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar categorias" },
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
    const created = await createCategoria(parsed.data.nome);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar categoria" },
      { status: 400 },
    );
  }
}
