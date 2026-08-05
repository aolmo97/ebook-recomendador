import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGutendexBookById } from "@/lib/books/gutendex";
import { parseBookId } from "@/lib/books/types";

async function getDefaultUser() {
  const existing = await prisma.user.findFirst();
  if (existing) return existing;
  return prisma.user.create({ data: {} });
}

export async function POST(request: NextRequest) {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = body.id;
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  const parsed = parseBookId(id);
  if (!parsed) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  if (parsed.source !== "GUTENBERG") {
    return NextResponse.json({ error: "fuente no soportada" }, { status: 400 });
  }

  try {
    const normalized = await getGutendexBookById(parsed.sourceId);
    if (!normalized) {
      return NextResponse.json({ error: "libro no encontrado" }, { status: 404 });
    }

    const book = await prisma.book.upsert({
      where: {
        source_sourceId: { source: normalized.source, sourceId: normalized.sourceId },
      },
      create: {
        source: normalized.source,
        sourceId: normalized.sourceId,
        title: normalized.title,
        author: normalized.author,
        coverUrl: normalized.coverUrl,
        language: normalized.language,
        genres: normalized.genres,
        synopsis: normalized.synopsis,
        urlEpub: normalized.urlEpub,
      },
      update: {
        title: normalized.title,
        author: normalized.author,
        coverUrl: normalized.coverUrl,
        language: normalized.language,
        genres: normalized.genres,
        synopsis: normalized.synopsis,
        urlEpub: normalized.urlEpub,
      },
    });

    const user = await getDefaultUser();

    const like = await prisma.like.upsert({
      where: { userId_bookId: { userId: user.id, bookId: book.id } },
      create: { userId: user.id, bookId: book.id },
      update: {},
    });

    return NextResponse.json({ liked: true, id, likedAt: like.createdAt });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error guardando like" }, { status: 502 });
  }
}
