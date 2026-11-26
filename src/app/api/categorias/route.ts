import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { createCategoria, listCategorias } from "@/lib/db";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da categoria").max(50),
});

export const GET = apiRoute({}, async () => NextResponse.json(await listCategorias()));

export const POST = apiRoute({}, async (request) => {
  const { nome } = await readJson(request, schema);
  return NextResponse.json(await createCategoria(nome), { status: 201 });
});
