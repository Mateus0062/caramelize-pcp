import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, parseId, readJson } from "@/lib/api";
import { deleteInsumo, updateInsumo } from "@/lib/db";
import { MAX_QUANTIDADE, MAX_VALOR } from "@/lib/limits";

const updateSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do insumo").max(80),
  unidadeMedida: z.string().trim().min(1, "Informe a unidade").max(10),
  estoqueMinimo: z.coerce.number().min(0).max(MAX_QUANTIDADE, "Estoque mínimo muito alto"),
  custoUnitario: z.coerce.number().min(0).max(MAX_VALOR, "Custo unitário muito alto"),
  categoriaId: z.coerce.number().int().positive("Selecione uma categoria"),
});

export const PUT = apiRoute<{ id: string }>({ role: "ADMIN" }, async (request, { params }) => {
  const id = parseId(params.id);
  const data = await readJson(request, updateSchema);
  return NextResponse.json(await updateInsumo(id, data));
});

export const DELETE = apiRoute<{ id: string }>({ role: "ADMIN" }, async (_request, { params }) => {
  await deleteInsumo(parseId(params.id));
  return NextResponse.json({ ok: true });
});
