import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { createMovimento, listMovimentos } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { MAX_QUANTIDADE, MAX_VALOR } from "@/lib/limits";

const schema = z.object({
  insumoId: z.coerce.number().int().positive("Selecione um insumo"),
  quantidade: z.coerce
    .number()
    .positive("Quantidade deve ser maior que zero")
    .max(MAX_QUANTIDADE, "Quantidade muito alta"),
  tipo: z.enum(["COMPRA", "PRODUCAO", "AJUSTE_ENTRADA", "AJUSTE_SAIDA"]),
  custoUnitario: z.coerce
    .number()
    .min(0)
    .max(MAX_VALOR, "Custo unitário muito alto")
    .nullable()
    .optional(),
  observacao: z.string().max(255).nullable().optional(),
  atualizarPrecoInsumo: z.boolean().optional(),
});

const paginaSchema = z.object({
  limite: z.coerce.number().int().min(1).max(1000).optional(),
  deslocamento: z.coerce.number().int().min(0).max(10_000_000).optional(),
});

/** GET /api/movimentos?limite=200&deslocamento=200 — histórico paginado (mais recentes primeiro). */
export const GET = apiRoute({}, async (request) => {
  const params = request.nextUrl.searchParams;
  const parsed = paginaSchema.safeParse({
    limite: params.get("limite") ?? undefined,
    deslocamento: params.get("deslocamento") ?? undefined,
  });
  if (!parsed.success) {
    throw new HttpError(400, "Parâmetros de paginação inválidos.");
  }
  return NextResponse.json(await listMovimentos(parsed.data));
});

export const POST = apiRoute({}, async (request) => {
  const data = await readJson(request, schema);
  return NextResponse.json(await createMovimento(data), { status: 201 });
});
