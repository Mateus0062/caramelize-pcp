import { NextResponse } from "next/server";
import { apiRoute, parseId } from "@/lib/api";
import { deleteCategoria } from "@/lib/db";

export const DELETE = apiRoute<{ id: string }>({ role: "ADMIN" }, async (_request, { params }) => {
  await deleteCategoria(parseId(params.id));
  return NextResponse.json({ ok: true });
});
