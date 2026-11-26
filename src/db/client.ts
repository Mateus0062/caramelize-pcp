import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { getPool, hasDatabaseUrl } from "../lib/pg";
import { importarDadosLocais } from "./importar-local";
import { aplicarMigracoes, listarMigracoes } from "./migrator.mjs";
import * as schema from "./schema";

/**
 * Acesso ao banco via Drizzle ORM, com UM único código para os dois modos:
 * - DATABASE_URL definida → PostgreSQL (Supabase), migrations via `npm run db:migrate`;
 * - sem DATABASE_URL → PostgreSQL embutido (PGlite) em data/pglite, para
 *   desenvolvimento, com migrations aplicadas automaticamente.
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const DIRETORIO_MIGRACOES = path.join(process.cwd(), "supabase", "migrations");
const DIRETORIO_PGLITE = path.join(process.cwd(), "data", "pglite");

/**
 * Em produção, a falta de DATABASE_URL é erro de configuração — não um convite
 * para gravar dados num banco local que pode sumir. Para usar o banco local
 * em produção de propósito (ex.: testar o build), defina ALLOW_LOCAL_DB=true.
 */
export function assertLocalModeAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "true") {
    throw new Error(
      "DATABASE_URL não configurada. Em produção o banco local fica desativado: " +
        "configure DATABASE_URL ou, se for intencional, defina ALLOW_LOCAL_DB=true.",
    );
  }
}

const globalForDb = globalThis as unknown as { __caramelizeDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__caramelizeDb) {
    globalForDb.__caramelizeDb = (hasDatabaseUrl() ? conectarPostgres() : abrirBancoLocal()).catch(
      (err) => {
        globalForDb.__caramelizeDb = undefined; // tenta de novo na próxima requisição
        throw err;
      },
    );
  }
  return globalForDb.__caramelizeDb;
}

async function conectarPostgres(): Promise<Db> {
  const pool = getPool();
  await verificarMigracoes(pool);
  return drizzleNodePg({ client: pool, schema }) as unknown as Db;
}

/** Recusa iniciar com o banco desatualizado, com instrução clara no log. */
async function verificarMigracoes(pool: ReturnType<typeof getPool>): Promise<void> {
  let aplicadas: Set<string>;
  try {
    const { rows } = await pool.query("SELECT id FROM schema_migrations");
    aplicadas = new Set(rows.map((r) => String(r.id)));
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") {
      throw new Error(
        'O banco ainda não recebeu as migrations. Execute "npm run db:migrate" com a DATABASE_URL do Supabase.',
      );
    }
    throw err;
  }

  let esperadas: string[];
  try {
    esperadas = listarMigracoes(DIRETORIO_MIGRACOES);
  } catch {
    console.warn("[db] Pasta de migrations não encontrada; conferência de versão do banco ignorada.");
    return;
  }
  const pendentes = esperadas.filter((id) => !aplicadas.has(id));
  if (pendentes.length > 0) {
    throw new Error(
      `Banco desatualizado: faltam as migrations ${pendentes.join(", ")}. Execute "npm run db:migrate".`,
    );
  }
}

async function abrirBancoLocal(): Promise<Db> {
  assertLocalModeAllowed();
  fs.mkdirSync(DIRETORIO_PGLITE, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(DIRETORIO_PGLITE);
  await client.waitReady;

  await aplicarMigracoes(
    { exec: (sql) => client.exec(sql), query: (sql, params) => client.query(sql, params) },
    DIRETORIO_MIGRACOES,
    (msg) => console.info(`[db local] ${msg}`),
  );
  await importarDadosLocais(client);

  return drizzlePglite({ client, schema }) as unknown as Db;
}
