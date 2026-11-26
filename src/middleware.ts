import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session-token";

/**
 * Primeira barreira: confere a ASSINATURA e a validade do token de sessão.
 * A checagem completa (usuário ativo, papel, senha não alterada) acontece em
 * cada rota da API via `apiRoute()` — o middleware sozinho não é suficiente.
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/password",
]);

const STATIC_FILE = /\.(png|jpe?g|svg|ico|webp|gif|txt|xml)$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || (!pathname.startsWith("/api/") && STATIC_FILE.test(pathname))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let authenticated = false;
  if (token) {
    try {
      authenticated = (await verifySessionToken(token)) !== null;
    } catch (err) {
      console.error(
        "[middleware] Não foi possível validar a sessão:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login" && authenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Não autenticado" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
    if (token) response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
