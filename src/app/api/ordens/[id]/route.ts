import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, parseId, readJson } from "@/lib/api";
import { deleteOrdemProducao, updateOrdemProducaoStatus } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum(["PLANEJADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"]),
  permitirEstoqueNegativo: z.boolean().optional(),
});

export const PATCH = apiRoute<{ id: string }>({}, async (request, { params }) => {
  const id = parseId(params.id);
  const { status, permitirEstoqueNegativo = false } = await readJson(request, patchSchema);
  return NextResponse.json(await updateOrdemProducaoStatus(id, status, permitirEstoqueNegativo));
});

export const DELETE = apiRoute<{ id: string }>({}, async (_request, { params }) => {
  await deleteOrdemProducao(parseId(params.id));
  return NextResponse.json({ ok: true });
});
