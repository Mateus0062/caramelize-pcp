import fs from "node:fs";
import path from "node:path";
import { DomainError } from "./errors";
import { assertLocalModeAllowed, writeJsonAtomic } from "./local-store";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  burnPasswordCheck,
  hashPassword,
  isPasswordOutdated,
  LEGACY_DEFAULT_PASSWORD,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "./password";
import { getPool, hasDatabaseUrl } from "./pg";

export type UserRole = "ADMIN" | "OPERADOR";

export interface UserRecord {
  id: number;
  nome: string;
  email: string;
  senhaHash: string;
  role: UserRole;
  ativo: boolean;
  dataCriacao: string;
}

export type PublicUser = Omit<UserRecord, "senhaHash">;

interface LocalUsersFile {
  nextId: number;
  usuarios: UserRecord[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "caramelize-users.json");
const USER_COLUMNS = "id, nome, email, senha_hash, role, ativo, data_criacao";

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    ativo: user.ativo,
    dataCriacao: user.dataCriacao,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapRow(row: Record<string, unknown>): UserRecord {
  return {
    id: Number(row.id),
    nome: String(row.nome),
    email: String(row.email),
    senhaHash: String(row.senha_hash),
    role: row.role as UserRole,
    ativo: Boolean(row.ativo),
    dataCriacao: new Date(row.data_criacao as string).toISOString(),
  };
}

// ----------------------------------------------------------------------------
// Modo local (arquivo JSON)
// ----------------------------------------------------------------------------
function readLocalUsers(): LocalUsersFile {
  assertLocalModeAllowed();
  if (!fs.existsSync(USERS_FILE)) {
    return { nextId: 1, usuarios: [] };
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) as LocalUsersFile;
}

function writeLocalUsers(data: LocalUsersFile): void {
  assertLocalModeAllowed();
  writeJsonAtomic(USERS_FILE, data);
}

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------
async function countUsers(): Promise<number> {
  if (!hasDatabaseUrl()) return readLocalUsers().usuarios.length;
  const res = await getPool().query("SELECT COUNT(*)::int AS total FROM usuario");
  return Number(res.rows[0]?.total ?? 0);
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);
  if (!hasDatabaseUrl()) {
    return readLocalUsers().usuarios.find((u) => u.email.toLowerCase() === normalized) ?? null;
  }
  const res = await getPool().query(
    `SELECT ${USER_COLUMNS} FROM usuario WHERE LOWER(email) = $1 LIMIT 1`,
    [normalized],
  );
  return res.rowCount ? mapRow(res.rows[0]) : null;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  if (!hasDatabaseUrl()) {
    return readLocalUsers().usuarios.find((u) => u.id === id) ?? null;
  }
  const res = await getPool().query(`SELECT ${USER_COLUMNS} FROM usuario WHERE id = $1`, [id]);
  return res.rowCount ? mapRow(res.rows[0]) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  if (!hasDatabaseUrl()) {
    return readLocalUsers()
      .usuarios.map(toPublicUser)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  const res = await getPool().query(`SELECT ${USER_COLUMNS} FROM usuario ORDER BY nome`);
  return res.rows.map((r) => toPublicUser(mapRow(r)));
}

async function countActiveAdmins(): Promise<number> {
  if (!hasDatabaseUrl()) {
    return readLocalUsers().usuarios.filter((u) => u.ativo && u.role === "ADMIN").length;
  }
  const res = await getPool().query(
    "SELECT COUNT(*)::int AS total FROM usuario WHERE ativo = true AND role = 'ADMIN'",
  );
  return Number(res.rows[0]?.total ?? 0);
}

// ----------------------------------------------------------------------------
// Escrita
// ----------------------------------------------------------------------------
async function insertUser(input: {
  nome: string;
  email: string;
  senhaHash: string;
  role: UserRole;
}): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  const nome = input.nome.trim();

  if (!hasDatabaseUrl()) {
    const store = readLocalUsers();
    if (store.usuarios.some((u) => u.email.toLowerCase() === email)) {
      throw new DomainError("Já existe um usuário cadastrado com este e-mail.");
    }
    const user: UserRecord = {
      id: store.nextId++,
      nome,
      email,
      senhaHash: input.senhaHash,
      role: input.role,
      ativo: true,
      dataCriacao: new Date().toISOString(),
    };
    store.usuarios.push(user);
    writeLocalUsers(store);
    return user;
  }

  const res = await getPool().query(
    `INSERT INTO usuario (nome, email, senha_hash, role, ativo)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (email) DO NOTHING
     RETURNING ${USER_COLUMNS}`,
    [nome, email, input.senhaHash, input.role],
  );
  if (!res.rowCount) {
    throw new DomainError("Já existe um usuário cadastrado com este e-mail.");
  }
  return mapRow(res.rows[0]);
}

async function writeUserFields(
  id: number,
  fields: { role?: UserRole; ativo?: boolean; senhaHash?: string },
): Promise<UserRecord> {
  if (!hasDatabaseUrl()) {
    const store = readLocalUsers();
    const user = store.usuarios.find((u) => u.id === id);
    if (!user) throw new DomainError("Usuário não encontrado.");
    if (fields.role !== undefined) user.role = fields.role;
    if (fields.ativo !== undefined) user.ativo = fields.ativo;
    if (fields.senhaHash !== undefined) user.senhaHash = fields.senhaHash;
    writeLocalUsers(store);
    return user;
  }

  const res = await getPool().query(
    `UPDATE usuario
     SET role = COALESCE($1, role),
         ativo = COALESCE($2, ativo),
         senha_hash = COALESCE($3, senha_hash)
     WHERE id = $4
     RETURNING ${USER_COLUMNS}`,
    [fields.role ?? null, fields.ativo ?? null, fields.senhaHash ?? null, id],
  );
  if (!res.rowCount) throw new DomainError("Usuário não encontrado.");
  return mapRow(res.rows[0]);
}

function assertNewPasswordAllowed(novaSenha: string, senhaAtual?: string): void {
  if (novaSenha.length < PASSWORD_MIN_LENGTH) {
    throw new DomainError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (novaSenha === LEGACY_DEFAULT_PASSWORD) {
    throw new DomainError("Esta senha é pública e não pode ser usada. Escolha outra.");
  }
  if (senhaAtual !== undefined && novaSenha === senhaAtual) {
    throw new DomainError("A nova senha deve ser diferente da atual.");
  }
}

// ----------------------------------------------------------------------------
// Administrador inicial (a partir de variáveis de ambiente)
// ----------------------------------------------------------------------------
let initialAdminPromise: Promise<void> | null = null;

/**
 * Se não existe nenhum usuário, cria o administrador definido em
 * ADMIN_EMAIL / ADMIN_PASSWORD (/ ADMIN_NAME). Não há mais senha padrão.
 */
export async function ensureInitialAdmin(): Promise<void> {
  initialAdminPromise ??= (async () => {
    if ((await countUsers()) > 0) return;

    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "";
    const nome = process.env.ADMIN_NAME?.trim() || "Administrador";

    if (!email || !password) {
      console.warn(
        "[auth] Nenhum usuário cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o administrador inicial.",
      );
      return;
    }
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH || password === LEGACY_DEFAULT_PASSWORD) {
      console.error(
        `[auth] ADMIN_PASSWORD precisa ter pelo menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres e não pode ser a senha padrão antiga. Administrador NÃO criado.`,
      );
      return;
    }

    await insertUser({ nome, email, senhaHash: await hashPassword(password), role: "ADMIN" });
    console.info(`[auth] Administrador inicial criado: ${email}`);
  })().catch((err) => {
    initialAdminPromise = null;
    throw err;
  });
  await initialAdminPromise;
}

// ----------------------------------------------------------------------------
// Casos de uso
// ----------------------------------------------------------------------------
export type AuthResult =
  | { status: "ok"; user: UserRecord }
  | { status: "invalid" }
  | { status: "must_change_password" };

export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  await ensureInitialAdmin();

  const user = await findUserByEmail(email);
  if (!user || !user.ativo) {
    await burnPasswordCheck(password);
    return { status: "invalid" };
  }
  if (!(await verifyPassword(password, user.senhaHash))) {
    return { status: "invalid" };
  }
  if (isPasswordOutdated(password)) {
    return { status: "must_change_password" };
  }
  return { status: "ok", user };
}

/** Troca de senha pelo próprio usuário (exige a senha atual). */
export async function changeOwnPassword(
  email: string,
  senhaAtual: string,
  novaSenha: string,
): Promise<UserRecord | null> {
  const user = await findUserByEmail(email);
  if (!user || !user.ativo) {
    await burnPasswordCheck(senhaAtual);
    return null;
  }
  if (!(await verifyPassword(senhaAtual, user.senhaHash))) {
    return null;
  }
  assertNewPasswordAllowed(novaSenha, senhaAtual);
  return writeUserFields(user.id, { senhaHash: await hashPassword(novaSenha) });
}

/** Criação de usuário por um administrador. */
export async function createUserByAdmin(input: {
  nome: string;
  email: string;
  senha: string;
  role: UserRole;
}): Promise<PublicUser> {
  assertNewPasswordAllowed(input.senha);
  const user = await insertUser({
    nome: input.nome,
    email: input.email,
    senhaHash: await hashPassword(input.senha),
    role: input.role,
  });
  return toPublicUser(user);
}

/** Alteração de papel, status ou senha por um administrador. */
export async function updateUserByAdmin(
  actingUserId: number,
  targetId: number,
  changes: { role?: UserRole; ativo?: boolean; novaSenha?: string },
): Promise<PublicUser> {
  const target = await findUserById(targetId);
  if (!target) throw new DomainError("Usuário não encontrado.");

  const changesRole = changes.role !== undefined && changes.role !== target.role;
  const changesAtivo = changes.ativo !== undefined && changes.ativo !== target.ativo;

  if (targetId === actingUserId && (changesRole || changesAtivo)) {
    throw new DomainError("Você não pode alterar o próprio papel nem desativar a própria conta.");
  }

  const removesAdmin =
    target.role === "ADMIN" &&
    target.ativo &&
    ((changesRole && changes.role !== "ADMIN") || (changesAtivo && changes.ativo === false));
  if (removesAdmin && (await countActiveAdmins()) <= 1) {
    throw new DomainError("O sistema precisa de pelo menos um administrador ativo.");
  }

  let senhaHash: string | undefined;
  if (changes.novaSenha !== undefined) {
    assertNewPasswordAllowed(changes.novaSenha);
    senhaHash = await hashPassword(changes.novaSenha);
  }

  const updated = await writeUserFields(targetId, {
    role: changesRole ? changes.role : undefined,
    ativo: changesAtivo ? changes.ativo : undefined,
    senhaHash,
  });
  return toPublicUser(updated);
}
