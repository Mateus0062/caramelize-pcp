import { Pool } from "pg";
import { buildSslConfig } from "./pg-ssl.mjs";

/**
 * Pool único de conexões PostgreSQL, compartilhado por todo o servidor.
 * Fica em `globalThis` para não ser recriado a cada hot reload no `next dev`.
 */

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

const globalForPg = globalThis as unknown as { __caramelizePgPool?: Pool };

export function getPool(): Pool {
  if (!globalForPg.__caramelizePgPool) {
    const connectionString = (process.env.DATABASE_URL ?? "").trim();
    const pool = new Pool({
      connectionString,
      ssl: buildSslConfig(connectionString),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
    pool.on("error", (err) => {
      console.error("[db] Erro em conexão ociosa do pool:", err);
    });
    globalForPg.__caramelizePgPool = pool;
  }
  return globalForPg.__caramelizePgPool;
}

/** O Drizzle embrulha erros do banco; o erro original (com o código SQLSTATE) fica em `cause`. */
export function erroOriginal(err: unknown): unknown {
  let atual = err;
  for (let i = 0; i < 3 && atual && typeof atual === "object" && !("code" in atual) && "cause" in atual; i++) {
    atual = (atual as { cause?: unknown }).cause;
  }
  return atual;
}

/** Dica no log do servidor quando a conexão falha por causa do certificado. */
export function logDatabaseHint(err: unknown): void {
  const original = erroOriginal(err);
  const code = (original as { code?: string } | null)?.code ?? "";
  const message = original instanceof Error ? original.message : String(original);
  if (
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    /certificate/i.test(message)
  ) {
    console.error(
      "[db] Dica: o certificado TLS do banco não foi reconhecido. Baixe o certificado do Supabase " +
        "(Project Settings → Database → SSL Configuration) e defina DATABASE_SSL_CA_FILE com o caminho do arquivo.",
    );
  }
}
