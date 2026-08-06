import { prisma } from "@/lib/prisma";
import { mangaSource } from "./source";
import type { MangaSeriesDetail } from "./types";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h: suficiente para evitar rescrapeos en ráfaga sin servir capítulos muy desactualizados

/**
 * Detalle de serie con caché de metadata en Prisma (no imágenes). La
 * búsqueda (search) no se cachea: varía por query y es barata de repetir.
 */
export async function getSeriesCached(id: string): Promise<MangaSeriesDetail | null> {
  const cached = await prisma.mangaSeries.findUnique({
    where: { id },
    include: { chapters: { orderBy: { updatedAt: "asc" } } },
  });

  if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return {
      id: cached.id,
      title: cached.title,
      synopsis: cached.synopsis,
      coverUrl: cached.coverUrl,
      sourceUrl: cached.sourceUrl,
      chapters: cached.chapters.map((c) => ({
        chapterId: c.chapterId,
        number: c.number,
        title: c.title,
        publishedAt: c.publishedAt?.toISOString() ?? null,
      })),
    };
  }

  const fresh = await mangaSource.getSeries(id);
  if (!fresh) return null;

  await prisma.mangaSeries.upsert({
    where: { id: fresh.id },
    create: {
      id: fresh.id,
      title: fresh.title,
      synopsis: fresh.synopsis,
      coverUrl: fresh.coverUrl,
      sourceUrl: fresh.sourceUrl,
    },
    update: {
      title: fresh.title,
      synopsis: fresh.synopsis,
      coverUrl: fresh.coverUrl,
      sourceUrl: fresh.sourceUrl,
    },
  });

  for (const chapter of fresh.chapters) {
    await prisma.mangaChapter.upsert({
      where: { seriesId_chapterId: { seriesId: fresh.id, chapterId: chapter.chapterId } },
      create: {
        seriesId: fresh.id,
        chapterId: chapter.chapterId,
        number: chapter.number,
        title: chapter.title,
        publishedAt: chapter.publishedAt ? new Date(chapter.publishedAt) : null,
      },
      update: {
        number: chapter.number,
        title: chapter.title,
        publishedAt: chapter.publishedAt ? new Date(chapter.publishedAt) : null,
      },
    });
  }

  return fresh;
}
