import { NextResponse } from "next/server";
import { apiRoute, readJson } from "@/lib/api";
import { createReceita, listReceitas } from "@/lib/db";
import { consolidarItens, receitaSchema } from "@/lib/receita-schema";

export const GET = apiRoute({}, async () => NextResponse.json(await listReceitas()));

export const POST = apiRoute({ role: "ADMIN" }, async (request) => {
  const data = await readJson(request, receitaSchema);
  const created = await createReceita({ ...data, itens: consolidarItens(data.itens) });
  return NextResponse.json(created, { status: 201 });
});
