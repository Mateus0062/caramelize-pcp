/**
 * Token de sessão assinado com HMAC-SHA256 via Web Crypto.
 *
 * Este módulo não usa APIs exclusivas do Node, então funciona tanto no
 * middleware (Edge Runtime) quanto nas rotas da API (Node.js). Assim existe
 * uma única implementação de assinatura/verificação.
 */

export const SESSION_COOKIE_NAME = "caramelize_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 horas

export interface SessionTokenPayload {
  /** ID do usuário */
  sub: number;
  /** Impressão digital da senha atual: trocar a senha invalida as sessões antigas */
  fp: string;
  /** Expiração (segundos desde epoch) */
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 2048;

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET não configurado ou muito curto (mínimo de ${MIN_SECRET_LENGTH} caracteres). ` +
        "Gere um valor aleatório e defina-o no .env.local ou nas variáveis de ambiente do servidor.",
    );
  }
  return secret;
}

let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function getHmacKey(): Promise<CryptoKey> {
  const secret = getAuthSecret();
  if (!cachedKey || cachedKey.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      ),
    };
  }
  return cachedKey.key;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(data: string): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign("HMAC", await getHmacKey(), encoder.encode(data));
  return new Uint8Array(signature);
}

export async function signSessionToken(
  payload: Omit<SessionTokenPayload, "exp">,
): Promise<string> {
  const full: SessionTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = toBase64Url(encoder.encode(JSON.stringify(full)));
  const signature = toBase64Url(await hmac(encoded));
  return `${encoded}.${signature}`;
}

/**
 * Confere assinatura e validade do token. Não consulta o banco: quem precisa
 * saber se o usuário continua ativo deve usar `getCurrentSession()` (auth.ts).
 * Lança erro se AUTH_SECRET não estiver configurado (falha fechada).
 */
export async function verifySessionToken(
  token: string | null | undefined,
): Promise<SessionTokenPayload | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await getHmacKey(),
    signatureBytes,
    encoder.encode(encoded),
  );
  if (!valid) return null;

  const payloadBytes = fromBase64Url(encoded);
  if (!payloadBytes) return null;

  try {
    const payload = JSON.parse(decoder.decode(payloadBytes)) as Partial<SessionTokenPayload>;
    if (
      typeof payload.sub !== "number" ||
      !Number.isInteger(payload.sub) ||
      typeof payload.fp !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub, fp: payload.fp, exp: payload.exp };
  } catch {
    return null;
  }
}

/**
 * Derivado do hash da senha com a chave secreta: não revela nada do hash,
 * mas muda sempre que a senha muda.
 */
export async function passwordFingerprint(senhaHash: string): Promise<string> {
  return toBase64Url(await hmac(`fp:${senhaHash}`)).slice(0, 22);
}
