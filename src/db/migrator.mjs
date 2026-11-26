// Executor de migrations SQL, usado pelo banco local (PGlite, automático) e
// pelo comando `npm run db:migrate` (Supabase/PostgreSQL).
//
// Cada arquivo NNNN_nome.sql em supabase/migrations/ é aplicado uma única
// vez, em ordem, dentro de uma transação, e registrado em schema_migrations.
import fs from "node:fs";
import path from "node:path";

const PADRAO_ARQUIVO = /^(\d{4}_[a-z0-9_]+)\.sql$/;

/**
 * @typedef {object} Executor
 * @property {(sql: string) => Promise<unknown>} exec  Executa um ou mais comandos SQL sem parâmetros.
 * @property {(sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>} query
 */

/** @param {string} dir @returns {string[]} ids das migrations, em ordem */
export function listarMigracoes(dir) {
  return fs
    .readdirSync(dir)
    .map((arquivo) => PADRAO_ARQUIVO.exec(arquivo)?.[1])
    .filter((id) => typeof id === "string")
    .sort();
}

/** @param {Executor} executor @returns {Promise<Set<string>>} */
export async function migracoesAplicadas(executor) {
  await executor.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id VARCHAR(200) PRIMARY KEY,
       aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
  const { rows } = await executor.query("SELECT id FROM schema_migrations");
  return new Set(rows.map((r) => String(r.id)));
}

/**
 * Aplica as migrations pendentes. O executor precisa usar UMA conexão só
 * (BEGIN/COMMIT na mesma sessão).
 * @param {Executor} executor
 * @param {string} dir
 * @param {(msg: string) => void} [log]
 * @returns {Promise<string[]>} ids aplicados agora
 */
export async function aplicarMigracoes(executor, dir, log = () => {}) {
  const aplicadas = await migracoesAplicadas(executor);
  const novas = [];
  for (const id of listarMigracoes(dir)) {
    if (aplicadas.has(id)) continue;
    const texto = fs.readFileSync(path.join(dir, `${id}.sql`), "utf8");
    await executor.exec("BEGIN");
    try {
      await executor.exec(texto);
      await executor.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await executor.exec("COMMIT");
    } catch (err) {
      await executor.exec("ROLLBACK").catch(() => undefined);
      throw new Error(`Falha ao aplicar a migration ${id}: ${err instanceof Error ? err.message : err}`, {
        cause: err,
      });
    }
    log(`migration aplicada: ${id}`);
    novas.push(id);
  }
  return novas;
}
