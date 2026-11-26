import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({}, async (_request, { user }) => NextResponse.json({ user }));
