// Configuração TLS da conexão PostgreSQL, compartilhada pelo servidor (pg.ts)
// e pelo comando `npm run db:migrate`.
import fs from "node:fs";
import path from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** @param {string} connectionString */
function getHostname(connectionString) {
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
 *
 * @param {string} connectionString
 * @returns {false | { rejectUnauthorized: boolean, ca?: string }}
 */
export function buildSslConfig(connectionString) {
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
  /** @type {string | undefined} */
  let ca;
  if (caInline) {
    ca = caInline.replace(/\\n/g, "\n");
  } else if (caFile) {
    ca = fs.readFileSync(path.resolve(process.cwd(), caFile), "utf-8");
  }

  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}
