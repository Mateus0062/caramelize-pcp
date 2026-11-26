import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, parseId, readJson } from "@/lib/api";
import { updateUserByAdmin } from "@/lib/auth-db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";

const patchSchema = z
  .object({
    role: z.enum(["ADMIN", "OPERADOR"]).optional(),
    ativo: z.boolean().optional(),
    novaSenha: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(PASSWORD_MAX_LENGTH, "A senha é muito longa")
      .optional(),
  })
  .refine(
    (data) => data.role !== undefined || data.ativo !== undefined || data.novaSenha !== undefined,
    { message: "Nenhuma alteração informada." },
  );

export const PATCH = apiRoute<{ id: string }>({ role: "ADMIN" }, async (request, { params, user }) => {
  const targetId = parseId(params.id);
  const changes = await readJson(request, patchSchema);
  return NextResponse.json(await updateUserByAdmin(user.id, targetId, changes));
});
