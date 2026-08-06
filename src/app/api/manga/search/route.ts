import { NextRequest, NextResponse } from "next/server";
import { mangaSource } from "@/lib/manga/source";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "Falta parámetro q" }, { status: 400 });
  }

  try {
    const results = await mangaSource.search(q);
    return NextResponse.json({ query: q, results });
  } catch (error) {
    console.error("[api/manga/search]", error);
    return NextResponse.json({ error: "Error consultando la fuente de manga" }, { status: 502 });
  }
}
