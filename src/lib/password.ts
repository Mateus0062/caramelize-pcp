import crypto from "node:crypto";

const KEY_LENGTH = 64;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/**
 * Senha padrão das versões anteriores do sistema. Ela era exibida na tela de
 * login, portanto é pública: quem ainda a usa é obrigado a trocá-la.
 */
export const LEGACY_DEFAULT_PASSWORD = "caramelize123";

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, "hex");
  if (keyBuf.length !== KEY_LENGTH) return false;
  const derived = await scryptAsync(password, salt);
  return crypto.timingSafeEqual(derived, keyBuf);
}

let dummyHash: Promise<string> | null = null;

/**
 * Executa uma verificação "de mentira" com o mesmo custo de uma real, para que
 * o tempo de resposta não revele se um e-mail está cadastrado.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}

/** Senhas que precisam ser trocadas no próximo login. */
export function isPasswordOutdated(password: string): boolean {
  return password === LEGACY_DEFAULT_PASSWORD || password.length < PASSWORD_MIN_LENGTH;
}
