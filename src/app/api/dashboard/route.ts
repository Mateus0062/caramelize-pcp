import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { getDashboard } from "@/lib/db";

export const GET = apiRoute({}, async () => NextResponse.json(await getDashboard()));
