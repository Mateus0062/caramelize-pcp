import { HttpError } from "./errors";

/**
 * Limite de tentativas em memória (janela fixa de 15 minutos).
 * Conta apenas FALHAS, então o uso normal nunca é bloqueado.
 *
 * Observação: o contador vive na memória do processo. Com várias instâncias
 * (ex.: serverless), cada uma tem o seu — para isso use um armazenamento
 * compartilhado (Redis/Upstash) com a mesma interface.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitRule {
  key: string;
  limit: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 10_000;

const globalForRateLimit = globalThis as unknown as {
  __caramelizeRateLimit?: Map<string, Bucket>;
};
const buckets = (globalForRateLimit.__caramelizeRateLimit ??= new Map<string, Bucket>());

function activeBucket(key: string, now: number): Bucket | null {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return null;
  return bucket;
}

function prune(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function assertNotRateLimited(rules: RateLimitRule[]): void {
  const now = Date.now();
  for (const rule of rules) {
    const bucket = activeBucket(rule.key, now);
    if (bucket && bucket.count >= rule.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpError(
        429,
        `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfterSec / 60)} minuto(s).`,
        { headers: { "Retry-After": String(retryAfterSec) } },
      );
    }
  }
}

export function recordFailure(rules: RateLimitRule[]): void {
  const now = Date.now();
  prune(now);
  for (const rule of rules) {
    const bucket = activeBucket(rule.key, now) ?? { count: 0, resetAt: now + WINDOW_MS };
    bucket.count += 1;
    buckets.set(rule.key, bucket);
  }
}

export function clearFailures(keys: string[]): void {
  for (const key of keys) buckets.delete(key);
}

/**
 * IP do cliente. Atrás de um proxy confiável (Vercel, Nginx...) o primeiro
 * valor de X-Forwarded-For é o IP real; sem proxy o cabeçalho pode ser forjado.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "desconhecido";
  return request.headers.get("x-real-ip")?.trim() || "desconhecido";
}

/**
 * Regras para login e troca de senha:
 * - 5 falhas por e-mail + IP (força bruta comum);
 * - 30 falhas por e-mail vindas de qualquer IP (ataque distribuído);
 * - 20 falhas por IP em qualquer e-mail (varredura de contas).
 */
export function credentialRules(scope: string, ip: string, email: string): RateLimitRule[] {
  return [
    { key: `${scope}:pair:${email}|${ip}`, limit: 5 },
    { key: `${scope}:email:${email}`, limit: 30 },
    { key: `${scope}:ip:${ip}`, limit: 20 },
  ];
}
