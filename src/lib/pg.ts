import fs from "node:fs";
import path from "node:path";
import { Pool, types, type PoolClient, type PoolConfig } from "pg";

/**
 * Pool único de conexões PostgreSQL, compartilhado por todo o servidor.
 * Fica em `globalThis` para não ser recriado a cada hot reload no `next dev`.
 */

/**
 * Colunas TIMESTAMP (sem fuso) guardam o horário em UTC — é o fuso padrão do
 * Supabase, usado pelo NOW()/CURRENT_TIMESTAMP. Por padrão o node-pg leria
 * esses valores no fuso do servidor Node, deslocando os horários em 3h quando
 * o servidor roda no Brasil. Aqui forçamos a leitura como UTC.
 * (Após migrar para TIMESTAMPTZ — supabase/migracao-timestamptz.sql — este
 * ajuste deixa de ser usado, pois o tipo já carrega o fuso.)
 */
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) =>
  new Date(`${value.replace(" ", "T")}Z`),
);

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function getHostname(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "";
  }
}

/**
 * TLS com verificação de certificado.
 * - Banco local (localhost): sem TLS.
 * - DATABASE_SSL_CA_FILE ou DATABASE_SSL_CA: valida contra esse certificado
 *   (o Supabase usa uma CA própria — baixe o certificado no painel:
 *   Project Settings → Database → SSL Configuration).
 * - Sem CA definida: valida contra as CAs públicas do sistema.
 * - DATABASE_SSL_INSECURE=true: desliga a verificação (somente desenvolvimento).
 */
function buildSslConfig(connectionString: string): PoolConfig["ssl"] {
  if (LOCAL_HOSTS.has(getHostname(connectionString))) return false;

  if (process.env.DATABASE_SSL_INSECURE === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_SSL_INSECURE=true não é permitido em produção.");
    }
    console.warn(
      "[db] ATENÇÃO: o certificado TLS do banco NÃO está sendo verificado (DATABASE_SSL_INSECURE=true). Use apenas em desenvolvimento.",
    );
    return { rejectUnauthorized: false };
  }

  const caInline = process.env.DATABASE_SSL_CA?.trim();
  const caFile = process.env.DATABASE_SSL_CA_FILE?.trim();
  let ca: string | undefined;
  if (caInline) {
    ca = caInline.replace(/\\n/g, "\n");
  } else if (caFile) {
    ca = fs.readFileSync(path.resolve(process.cwd(), caFile), "utf-8");
  }

  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
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

/** Executa `fn` numa transação: tudo é gravado junto, ou nada é gravado. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Dica no log do servidor quando a conexão falha por causa do certificado. */
export function logDatabaseHint(err: unknown): void {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);
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
