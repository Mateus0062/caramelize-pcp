import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { createSessionToken, setSessionCookie, toSessionUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/auth-db";
import { HttpError } from "@/lib/errors";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";
import {
  assertNotRateLimited,
  clearFailures,
  clientIp,
  credentialRules,
  recordFailure,
} from "@/lib/rate-limit";

/**
 * Troca de senha pelo próprio usuário. Funciona com ou sem sessão, pois
 * exige a senha atual — é usada também para a troca obrigatória no login.
 * Ao trocar, todas as outras sessões desse usuário deixam de valer.
 */
const schema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(120),
  senhaAtual: z.string().min(1, "Informe a senha atual").max(PASSWORD_MAX_LENGTH),
  novaSenha: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `A nova senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
    .max(PASSWORD_MAX_LENGTH, "A nova senha é muito longa"),
});

export async function POST(request: NextRequest) {
  try {
    const { email, senhaAtual, novaSenha } = await readJson(request, schema);
    const normalizedEmail = email.toLowerCase();
    const rules = credentialRules("senha", clientIp(request), normalizedEmail);
    assertNotRateLimited(rules);

    const user = await changeOwnPassword(normalizedEmail, senhaAtual, novaSenha);
    if (!user) {
      recordFailure(rules);
      throw new HttpError(401, "E-mail ou senha atual incorretos.");
    }
    clearFailures([rules[0].key]);

    const response = NextResponse.json({ user: toSessionUser(user) });
    setSessionCookie(response, await createSessionToken(user));
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
