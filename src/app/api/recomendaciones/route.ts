import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchGutendex } from "@/lib/books/gutendex";
import { toBookId, type NormalizedBook } from "@/lib/books/types";

const MAX_AUTHORS = 5;
const MAX_RESULTS = 20;

export async function GET() {
  const user = await prisma.user.findFirst({
    include: { likes: { include: { book: true } } },
  });

  if (!user || user.likes.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const likedBooks = user.likes.map((like) => like.book);
  const likedIds = new Set(likedBooks.map((book) => `${book.source}:${book.sourceId}`));
  const authors = [...new Set(likedBooks.map((book) => book.author))].slice(0, MAX_AUTHORS);

  const seenIds = new Set<string>();
  const candidates: NormalizedBook[] = [];

  for (const author of authors) {
    if (candidates.length >= MAX_RESULTS) break;

    const { books } = await searchGutendex(author);
    for (const book of books) {
      const id = toBookId(book);
      if (likedIds.has(id) || seenIds.has(id)) continue;

      seenIds.add(id);
      candidates.push(book);
      if (candidates.length >= MAX_RESULTS) break;
    }
  }

  return NextResponse.json({
    results: candidates.map((book) => ({
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
}
