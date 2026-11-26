import { NextResponse } from "next/server";
import { apiRoute, parseId, readJson } from "@/lib/api";
import { deleteReceita, updateReceita } from "@/lib/db";
import { consolidarItens, receitaSchema } from "@/lib/receita-schema";

export const PUT = apiRoute<{ id: string }>({ role: "ADMIN" }, async (request, { params }) => {
  const id = parseId(params.id);
  const data = await readJson(request, receitaSchema);
  const updated = await updateReceita(id, { ...data, itens: consolidarItens(data.itens) });
  return NextResponse.json(updated);
});

export const DELETE = apiRoute<{ id: string }>({ role: "ADMIN" }, async (_request, { params }) => {
  await deleteReceita(parseId(params.id));
  return NextResponse.json({ ok: true });
});
