import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { usuario } from "../db/schema";
import { DomainError } from "./errors";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  burnPasswordCheck,
  hashPassword,
  isPasswordOutdated,
  LEGACY_DEFAULT_PASSWORD,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "./password";

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

function mapRow(r: typeof usuario.$inferSelect): UserRecord {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    senhaHash: r.senhaHash,
    role: r.role,
    ativo: r.ativo,
    dataCriacao: (r.dataCriacao ?? new Date(0)).toISOString(),
  };
}

const emailIgual = (email: string) => sql`LOWER(${usuario.email}) = ${normalizeEmail(email)}`;

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------
async function countUsers(): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(usuario);
  return Number(r?.total ?? 0);
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const db = await getDb();
  const [r] = await db.select().from(usuario).where(emailIgual(email)).limit(1);
  return r ? mapRow(r) : null;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  const db = await getDb();
  const [r] = await db.select().from(usuario).where(eq(usuario.id, id)).limit(1);
  return r ? mapRow(r) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db.select().from(usuario).orderBy(asc(usuario.nome));
  return rows.map((r) => toPublicUser(mapRow(r)));
}

async function countActiveAdmins(): Promise<number> {
  const db = await getDb();
  const [r] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(usuario)
    .where(and(eq(usuario.ativo, true), eq(usuario.role, "ADMIN")));
  return Number(r?.total ?? 0);
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
  const db = await getDb();
  if (await findUserByEmail(input.email)) {
    throw new DomainError("Já existe um usuário cadastrado com este e-mail.");
  }
  const [r] = await db
    .insert(usuario)
    .values({
      nome: input.nome.trim(),
      email: normalizeEmail(input.email),
      senhaHash: input.senhaHash,
      role: input.role,
      ativo: true,
    })
    .returning();
  return mapRow(r);
}

async function writeUserFields(
  id: number,
  fields: { role?: UserRole; ativo?: boolean; senhaHash?: string },
): Promise<UserRecord> {
  const db = await getDb();
  const [r] = await db.update(usuario).set(fields).where(eq(usuario.id, id)).returning();
  if (!r) throw new DomainError("Usuário não encontrado.");
  return mapRow(r);
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
 * ADMIN_EMAIL / ADMIN_PASSWORD (/ ADMIN_NAME). Não há senha padrão.
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

  const fields: { role?: UserRole; ativo?: boolean; senhaHash?: string } = {};
  if (changesRole) fields.role = changes.role;
  if (changesAtivo) fields.ativo = changes.ativo;
  if (changes.novaSenha !== undefined) {
    assertNewPasswordAllowed(changes.novaSenha);
    fields.senhaHash = await hashPassword(changes.novaSenha);
  }
  if (Object.keys(fields).length === 0) return toPublicUser(target);

  return toPublicUser(await writeUserFields(targetId, fields));
}
