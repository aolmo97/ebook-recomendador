import { NextRequest, NextResponse } from "next/server";
import { getGutendexBookById } from "@/lib/books/gutendex";
import { parseBookId, toBookId } from "@/lib/books/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = parseBookId(id);

  if (!parsed) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  if (parsed.source !== "GUTENBERG") {
    return NextResponse.json({ error: "fuente no soportada" }, { status: 400 });
  }

  try {
    const book = await getGutendexBookById(parsed.sourceId);
    if (!book) {
      return NextResponse.json({ error: "libro no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      id: toBookId(book),
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      language: book.language,
      genres: book.genres,
      synopsis: book.synopsis,
      urlEpub: book.urlEpub,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error consultando Gutendex" }, { status: 502 });
  }
}
