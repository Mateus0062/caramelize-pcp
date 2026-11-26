import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { getPainelCompleto } from "@/lib/db";

/**
 * Carga completa da tela principal numa única requisição: usuário, dashboard,
 * cadastros, saldos e os movimentos mais recentes (o restante é paginado em
 * /api/movimentos).
 */
export const GET = apiRoute({}, async (_request, { user }) => {
  const painel = await getPainelCompleto();
  return NextResponse.json({ user, ...painel });
});
