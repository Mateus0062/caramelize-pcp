// Aplica as migrations de supabase/migrations/ no PostgreSQL da DATABASE_URL.
//
//   npm run db:migrate            aplica as pendentes
//   npm run db:migrate -- --status  só mostra o que já foi aplicado e o que falta
//
// Lê as variáveis do .env.local (como o Next.js). Use uma conexão com
// permissão de criar/alterar tabelas (ex.: o usuário "postgres" do Supabase).
import path from "node:path";
import nextEnv from "@next/env";
import pg from "pg";
import { aplicarMigracoes, listarMigracoes, migracoesAplicadas } from "../src/db/migrator.mjs";
import { buildSslConfig } from "../src/lib/pg-ssl.mjs";

const raiz = process.cwd();
nextEnv.loadEnvConfig(raiz);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL não definida. Configure-a no .env.local ou no ambiente.");
  process.exit(1);
}

const dir = path.join(raiz, "supabase", "migrations");
const client = new pg.Client({ connectionString: url, ssl: buildSslConfig(url) });

try {
  await client.connect();
  const executor = {
    exec: (sql) => client.query(sql),
    query: (sql, params) => client.query(sql, params),
  };

  if (process.argv.includes("--status")) {
    const aplicadas = await migracoesAplicadas(executor);
    for (const id of listarMigracoes(dir)) {
      console.log(`${aplicadas.has(id) ? "✓ aplicada " : "• pendente "} ${id}`);
    }
  } else {
    const novas = await aplicarMigracoes(executor, dir, (msg) => console.log(`✓ ${msg}`));
    console.log(novas.length ? `${novas.length} migration(s) aplicada(s).` : "O banco já está atualizado.");
  }
} catch (err) {
  console.error("Falha:", err instanceof Error ? err.message : err);
  if (/certificate/i.test(String(err?.message ?? err))) {
    console.error(
      "Dica: baixe o certificado do Supabase (Project Settings → Database → SSL Configuration) e defina DATABASE_SSL_CA_FILE.",
    );
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
