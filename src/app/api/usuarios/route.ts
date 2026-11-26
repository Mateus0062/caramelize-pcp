import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { createUserByAdmin, listUsers } from "@/lib/auth-db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";

const createSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(100),
  email: z.string().trim().email("Informe um e-mail válido").max(120),
  senha: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
    .max(PASSWORD_MAX_LENGTH, "A senha é muito longa"),
  role: z.enum(["ADMIN", "OPERADOR"]),
});

export const GET = apiRoute({ role: "ADMIN" }, async () => NextResponse.json(await listUsers()));

export const POST = apiRoute({ role: "ADMIN" }, async (request) => {
  const data = await readJson(request, createSchema);
  return NextResponse.json(await createUserByAdmin(data), { status: 201 });
});
