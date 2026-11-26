import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, parseId, readJson } from "@/lib/api";
import { deleteOrdemProducao, updateOrdemProducaoStatus } from "@/lib/db";
import { HttpError } from "@/lib/errors";

const patchSchema = z.object({
  status: z.enum(["PLANEJADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"]),
  permitirEstoqueNegativo: z.boolean().optional(),
});

export const PATCH = apiRoute<{ id: string }>({}, async (request, { params, user }) => {
  const id = parseId(params.id);
  const { status, permitirEstoqueNegativo = false } = await readJson(request, patchSchema);
  if (permitirEstoqueNegativo && user.role !== "ADMIN") {
    throw new HttpError(
      403,
      "Apenas administradores podem concluir uma ordem com estoque insuficiente.",
    );
  }
  return NextResponse.json(await updateOrdemProducaoStatus(id, status, permitirEstoqueNegativo));
});

export const DELETE = apiRoute<{ id: string }>({ role: "ADMIN" }, async (_request, { params }) => {
  await deleteOrdemProducao(parseId(params.id));
  return NextResponse.json({ ok: true });
});
