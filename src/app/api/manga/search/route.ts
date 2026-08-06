import { NextRequest, NextResponse } from "next/server";
import { encodeMangaId, isMangaSourceKey, MANGA_SOURCE_KEYS } from "@/lib/manga/id";
import { getMangaSource } from "@/lib/manga/source";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const source = searchParams.get("source")?.trim();

  if (!q) {
    return NextResponse.json({ error: "Falta parámetro q" }, { status: 400 });
  }
  if (!source || !isMangaSourceKey(source)) {
    return NextResponse.json(
      { error: `Falta o es inválido el parámetro source (valores válidos: ${MANGA_SOURCE_KEYS.join(", ")})` },
      { status: 400 },
    );
  }

  try {
    const results = await getMangaSource(source).search(q);
    return NextResponse.json({
      query: q,
      source,
      results: results.map((item) => ({ ...item, id: encodeMangaId(source, item.id) })),
    });
  } catch (error) {
    console.error("[api/manga/search]", error);
    return NextResponse.json({ error: "Error consultando la fuente de manga" }, { status: 502 });
  }
}
