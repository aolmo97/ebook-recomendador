import { NextRequest, NextResponse } from "next/server";
import { getSeriesCached } from "@/lib/manga/repository";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const series = await getSeriesCached(decodeURIComponent(id));
    if (!series) {
      return NextResponse.json({ error: "Serie no encontrada" }, { status: 404 });
    }
    return NextResponse.json(series);
  } catch (error) {
    console.error("[api/manga/:id]", error);
    return NextResponse.json({ error: "Error consultando la fuente de manga" }, { status: 502 });
  }
}
