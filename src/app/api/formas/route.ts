import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { createForma, listFormas } from "@/lib/db";
import { MAX_QUANTIDADE } from "@/lib/limits";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da forma").max(80),
  volumeMl: z.coerce
    .number()
    .positive("Volume em ml deve ser maior que zero")
    .max(MAX_QUANTIDADE, "Volume muito alto"),
  insumoId: z.coerce.number().int().positive("Selecione o insumo da embalagem"),
});

export const GET = apiRoute({}, async () => NextResponse.json(await listFormas()));

export const POST = apiRoute({}, async (request) => {
  const data = await readJson(request, schema);
  return NextResponse.json(await createForma(data), { status: 201 });
});
