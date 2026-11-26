import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { hashPassword, verifyPassword, type SessionUser } from "./auth";

interface StoredUser {
  id: number;
  nome: string;
  email: string;
  senhaHash: string;
  role: "ADMIN" | "OPERADOR";
  ativo: boolean;
  dataCriacao: string;
}

interface LocalUsersFile {
  nextId: number;
  usuarios: StoredUser[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "caramelize-users.json");

const DEFAULT_ADMIN_EMAIL = "admin@caramelize.com.br";
const DEFAULT_ADMIN_PASS = "caramelize123";

let authPool: Pool | null = null;
let tableReadyPromise: Promise<void> | null = null;

function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function getPool(): Pool {
  if (!authPool) {
    authPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return authPool;
}

async function ensurePgUsuarioTable(): Promise<void> {
  if (!tableReadyPromise) {
    tableReadyPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usuario (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nome VARCHAR(100) NOT NULL,
          email VARCHAR(120) NOT NULL UNIQUE,
          senha_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL DEFAULT 'OPERADOR' CHECK (role IN ('ADMIN', 'OPERADOR')),
          ativo BOOLEAN NOT NULL DEFAULT true,
          data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Se a tabela estiver vazia, cria o usuário administrador inicial
      const countRes = await pool.query("SELECT COUNT(*)::int AS total FROM usuario");
      if (Number(countRes.rows[0]?.total ?? 0) === 0) {
        await pool.query(
          `INSERT INTO usuario (nome, email, senha_hash, role, ativo)
           VALUES ($1, $2, $3, 'ADMIN', true)
           ON CONFLICT (email) DO NOTHING`,
          [
            "Administrador Caramelize",
            DEFAULT_ADMIN_EMAIL,
            hashPassword(DEFAULT_ADMIN_PASS),
          ],
        );
      }
    })().catch((err) => {
      tableReadyPromise = null;
      throw err;
    });
  }
  await tableReadyPromise;
}

function readLocalUsers(): LocalUsersFile {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    const initial: LocalUsersFile = {
      nextId: 2,
      usuarios: [
        {
          id: 1,
          nome: "Administrador Caramelize",
          email: DEFAULT_ADMIN_EMAIL,
          senhaHash: hashPassword(DEFAULT_ADMIN_PASS),
          role: "ADMIN",
          ativo: true,
          dataCriacao: new Date().toISOString(),
        },
      ],
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) as LocalUsersFile;
}

function writeLocalUsers(data: LocalUsersFile): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!hasDatabaseUrl()) {
    const store = readLocalUsers();
    const user = store.usuarios.find(
      (u) => u.ativo && u.email.toLowerCase() === normalizedEmail,
    );
    if (!user || !verifyPassword(password, user.senhaHash)) {
      return null;
    }
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
    };
  }

  await ensurePgUsuarioTable();
  const res = await getPool().query(
    `SELECT id, nome, email, senha_hash, role, ativo
     FROM usuario
     WHERE LOWER(email) = $1 AND ativo = true
     LIMIT 1`,
    [normalizedEmail],
  );
  if (res.rowCount === 0) return null;

  const row = res.rows[0];
  if (!verifyPassword(password, row.senha_hash)) {
    return null;
  }

  return {
    id: Number(row.id),
    nome: row.nome,
    email: row.email,
    role: row.role as "ADMIN" | "OPERADOR",
  };
}

export async function registerUser(input: {
  nome: string;
  email: string;
  password: string;
}): Promise<SessionUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const nome = input.nome.trim();
  const senhaHash = hashPassword(input.password);

  if (!hasDatabaseUrl()) {
    const store = readLocalUsers();
    if (store.usuarios.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      throw new Error("Já existe uma conta cadastrada com este e-mail.");
    }
    const role = store.usuarios.length === 0 ? "ADMIN" : "OPERADOR";
    const user: StoredUser = {
      id: store.nextId++,
      nome,
      email: normalizedEmail,
      senhaHash,
      role,
      ativo: true,
      dataCriacao: new Date().toISOString(),
    };
    store.usuarios.push(user);
    writeLocalUsers(store);
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
    };
  }

  await ensurePgUsuarioTable();
  const pool = getPool();
  const exists = await pool.query(
    "SELECT 1 FROM usuario WHERE LOWER(email) = $1 LIMIT 1",
    [normalizedEmail],
  );
  if (exists.rowCount && exists.rowCount > 0) {
    throw new Error("Já existe uma conta cadastrada com este e-mail.");
  }

  const res = await pool.query(
    `INSERT INTO usuario (nome, email, senha_hash, role, ativo)
     VALUES ($1, $2, $3, 'OPERADOR', true)
     RETURNING id, nome, email, role`,
    [nome, normalizedEmail, senhaHash],
  );
  const row = res.rows[0];
  return {
    id: Number(row.id),
    nome: row.nome,
    email: row.email,
    role: row.role as "ADMIN" | "OPERADOR",
  };
}
