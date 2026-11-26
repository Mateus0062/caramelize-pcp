import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/db";

export async function GET() {
  try {
    const data = await getDashboard();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao carregar dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
