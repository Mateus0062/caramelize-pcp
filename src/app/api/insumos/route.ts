import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { createInsumo, listInsumos } from "@/lib/db";
import { MAX_QUANTIDADE, MAX_VALOR } from "@/lib/limits";

const createInsumoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do insumo").max(80),
  unidadeMedida: z.string().trim().min(1, "Informe a unidade").max(10),
  estoqueMinimo: z.coerce
    .number()
    .min(0, "Estoque mínimo deve ser >= 0")
    .max(MAX_QUANTIDADE, "Estoque mínimo muito alto"),
  custoUnitario: z.coerce
    .number()
    .min(0, "Custo unitário deve ser >= 0")
    .max(MAX_VALOR, "Custo unitário muito alto"),
  categoriaId: z.coerce.number().int().positive("Selecione uma categoria"),
  estoqueInicial: z.coerce
    .number()
    .min(0)
    .max(MAX_QUANTIDADE, "Estoque inicial muito alto")
    .optional(),
});

export const GET = apiRoute({}, async () => NextResponse.json(await listInsumos()));

export const POST = apiRoute({}, async (request) => {
  const data = await readJson(request, createInsumoSchema);
  return NextResponse.json(await createInsumo(data), { status: 201 });
});
