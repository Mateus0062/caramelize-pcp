import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { clearSessionCookie, getCurrentSession, type SessionUser } from "./auth";
import { DomainError, HttpError } from "./errors";
import { erroOriginal, logDatabaseHint } from "./pg";

const MAX_BODY_BYTES = 100 * 1024; // 100 KB

/** Códigos SQLSTATE do Postgres que indicam dados inválidos (não falha do servidor). */
const PG_ERROR_MESSAGES: Record<string, string> = {
  "23503": "Não foi possível concluir: este registro está ligado a outro, ou o registro relacionado não existe.",
  "23505": "Já existe um registro com esses dados.",
  "23514": "Algum valor está fora do permitido.",
  "22003": "Algum valor numérico está fora do limite permitido.",
  "22001": "Algum texto excede o tamanho permitido.",
};

/**
 * Converte qualquer erro numa resposta JSON sem vazar detalhes internos.
 * Só mensagens de DomainError/HttpError chegam ao navegador; o resto vai
 * para o log do servidor e o cliente recebe uma mensagem genérica.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, ...(err.code ? { code: err.code } : {}) },
      { status: err.status, headers: err.headers },
    );
  }
  if (err instanceof DomainError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Rede de segurança: violações de integridade do Postgres viram 400 com
  // mensagem genérica (o detalhe técnico fica só no log do servidor).
  const pgCode = (erroOriginal(err) as { code?: unknown } | null)?.code;
  const pgMessage = typeof pgCode === "string" ? PG_ERROR_MESSAGES[pgCode] : undefined;
  if (pgMessage) {
    console.warn("[api] Violação de integridade no banco:", err);
    return NextResponse.json({ error: pgMessage }, { status: 400 });
  }

  console.error("[api] Erro inesperado:", err);
  logDatabaseHint(err);
  return NextResponse.json(
    { error: "Erro interno do servidor. Tente novamente em instantes." },
    { status: 500 },
  );
}

/** Lê e valida o corpo JSON. Lança HttpError 400/413 com mensagem amigável. */
export async function readJson<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<z.output<S>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "Requisição muito grande.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Requisição inválida.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  return parsed.data;
}

export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "ID inválido.");
  }
  return id;
}

type RouteParams = Record<string, string>;

interface RouteOptions {
  /** Papel exigido. Sem valor: qualquer usuário autenticado. */
  role?: SessionUser["role"];
}

type RouteHandler<P extends RouteParams> = (
  request: NextRequest,
  ctx: { user: SessionUser; params: P },
) => Promise<Response>;

/**
 * Envolve uma rota da API com:
 * - autenticação real (assinatura do token + usuário ativo no banco);
 * - autorização por papel;
 * - tratamento de erros sem vazamento de detalhes internos.
 */
export function apiRoute<P extends RouteParams = RouteParams>(
  options: RouteOptions,
  handler: RouteHandler<P>,
) {
  return async (request: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const user = await getCurrentSession();
      if (!user) {
        const response = NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        clearSessionCookie(response);
        return response;
      }
      if (options.role && user.role !== options.role) {
        throw new HttpError(403, "Apenas administradores podem realizar esta ação.");
      }
      const params = ((await context?.params) ?? {}) as P;
      return await handler(request, { user, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
