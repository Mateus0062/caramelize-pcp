import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createInsumo, listInsumos } from "@/lib/db";

const createInsumoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do insumo").max(80),
  unidadeMedida: z.string().trim().min(1, "Informe a unidade").max(10),
  estoqueMinimo: z.coerce.number().min(0, "Estoque mínimo deve ser >= 0"),
  custoUnitario: z.coerce.number().min(0, "Custo unitário deve ser >= 0"),
  categoriaId: z.coerce.number().int().positive("Selecione uma categoria"),
  estoqueInicial: z.coerce.number().min(0).optional(),
});

export async function GET() {
  try {
    const insumos = await listInsumos();
    return NextResponse.json(insumos);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar insumos" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createInsumoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }
    const created = await createInsumo(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar insumo" },
      { status: 400 },
    );
  }
}
