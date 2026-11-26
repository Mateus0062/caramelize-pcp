import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { createOrdemProducao, listOrdensProducao } from "@/lib/db";
import { MAX_UNIDADES, MAX_VALOR } from "@/lib/limits";

const createSchema = z.object({
  receitaId: z.coerce.number().int().positive("Selecione uma receita"),
  formaId: z.coerce.number().int().positive("Selecione uma forma"),
  quantidadeUnidades: z.coerce
    .number()
    .int()
    .positive("Quantidade deve ser maior que zero")
    .max(MAX_UNIDADES, "Quantidade muito alta"),
  precoVendaUnitario: z.coerce
    .number()
    .min(0)
    .max(MAX_VALOR, "Preço muito alto")
    .nullable()
    .optional(),
  observacao: z.string().max(255).nullable().optional(),
  dataPrevista: z.string().max(40).optional(),
});

export const GET = apiRoute({}, async () => NextResponse.json(await listOrdensProducao()));

export const POST = apiRoute({}, async (request) => {
  const data = await readJson(request, createSchema);
  return NextResponse.json(await createOrdemProducao(data), { status: 201 });
});
