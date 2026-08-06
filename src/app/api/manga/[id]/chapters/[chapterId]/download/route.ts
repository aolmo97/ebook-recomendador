import { NextRequest, NextResponse } from "next/server";
import { buildCbz } from "@/lib/manga/cbz";
import { downloadChapterImages } from "@/lib/manga/download";
import { parseMangaId } from "@/lib/manga/id";
import { getMangaSource } from "@/lib/manga/source";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> },
) {
  const { id, chapterId } = await params;
  const decodedChapterId = decodeURIComponent(chapterId);

  const parsed = parseMangaId(decodeURIComponent(id));
  if (!parsed) {
    return NextResponse.json({ error: "Serie no encontrada" }, { status: 404 });
  }

  try {
    const images = await getMangaSource(parsed.source).getChapterImages(parsed.sourceId, decodedChapterId);
    if (images.length === 0) {
      return NextResponse.json({ error: "Capítulo no encontrado o sin páginas" }, { status: 404 });
    }

    let buffers;
    try {
      buffers = await downloadChapterImages(images);
    } catch (error) {
      console.error("[api/manga/download] fallo descargando páginas", error);
      return NextResponse.json({ error: "Fallo descargando páginas del capítulo" }, { status: 502 });
    }

    const cbz = await buildCbz(buffers);

    return new NextResponse(new Uint8Array(cbz), {
      headers: {
        "Content-Type": "application/vnd.comicbook+zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(decodedChapterId)}.cbz"`,
      },
    });
  } catch (error) {
    console.error("[api/manga/download]", error);
    return NextResponse.json({ error: "Error consultando la fuente de manga" }, { status: 502 });
  }
}
