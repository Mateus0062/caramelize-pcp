import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { createSessionToken, setSessionCookie, toSessionUser } from "@/lib/auth";
import { authenticateUser } from "@/lib/auth-db";
import { HttpError } from "@/lib/errors";
import { PASSWORD_MAX_LENGTH } from "@/lib/password";
import {
  assertNotRateLimited,
  clearFailures,
  clientIp,
  credentialRules,
  recordFailure,
} from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(120),
  password: z.string().min(1, "Informe sua senha").max(PASSWORD_MAX_LENGTH),
});

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await readJson(request, loginSchema);
    const normalizedEmail = email.toLowerCase();
    const rules = credentialRules("login", clientIp(request), normalizedEmail);
    assertNotRateLimited(rules);

    const result = await authenticateUser(normalizedEmail, password);

    if (result.status === "invalid") {
      recordFailure(rules);
      throw new HttpError(401, "E-mail ou senha incorretos.");
    }

    clearFailures([rules[0].key]);

    if (result.status === "must_change_password") {
      throw new HttpError(
        403,
        "Por segurança, defina uma nova senha antes de entrar.",
        { code: "MUST_CHANGE_PASSWORD" },
      );
    }

    const response = NextResponse.json({ user: toSessionUser(result.user) });
    setSessionCookie(response, await createSessionToken(result.user));
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
