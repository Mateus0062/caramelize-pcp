import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { findUserById, type UserRecord, type UserRole } from "./auth-db";
import {
  passwordFingerprint,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./session-token";

export { SESSION_COOKIE_NAME };

export interface SessionUser {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
}

export function toSessionUser(user: UserRecord): SessionUser {
  return { id: user.id, nome: user.nome, email: user.email, role: user.role };
}

export async function createSessionToken(user: Pick<UserRecord, "id" | "senhaHash">): Promise<string> {
  return signSessionToken({ sub: user.id, fp: await passwordFingerprint(user.senhaHash) });
}

/**
 * Sessão do usuário atual, validada contra o banco a cada requisição:
 * - assinatura e expiração do token;
 * - usuário existe e está ativo;
 * - a senha não mudou desde o login (trocar a senha encerra as outras sessões);
 * - papel (ADMIN/OPERADOR) sempre lido do banco, nunca do token.
 */
export async function getCurrentSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!payload) return null;

  const user = await findUserById(payload.sub);
  if (!user || !user.ativo) return null;
  if ((await passwordFingerprint(user.senhaHash)) !== payload.fp) return null;

  return toSessionUser(user);
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
}
