import { NextRequest, NextResponse } from "next/server";
import { searchGutendex } from "@/lib/books/gutendex";
import { toBookId } from "@/lib/books/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const page = Number(searchParams.get("page") ?? "1") || 1;

  if (!q) {
    return NextResponse.json({ error: "Falta parámetro q" }, { status: 400 });
  }

  try {
    const { books, count, hasNext } = await searchGutendex(q, page);

    return NextResponse.json({
      query: q,
      page,
      count,
      hasNext,
      results: books.map((book) => ({
        id: toBookId(book),
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        language: book.language,
        genres: book.genres,
        synopsis: book.synopsis,
        urlEpub: book.urlEpub,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error consultando Gutendex" }, { status: 502 });
  }
}
