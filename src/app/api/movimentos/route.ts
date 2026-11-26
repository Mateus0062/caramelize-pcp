import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { createMovimento, listMovimentos } from "@/lib/db";
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

export const GET = apiRoute({}, async () => NextResponse.json(await listMovimentos()));

export const POST = apiRoute({}, async (request) => {
  const data = await readJson(request, schema);
  return NextResponse.json(await createMovimento(data), { status: 201 });
});
