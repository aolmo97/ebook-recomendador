import { prisma } from "@/lib/prisma";
import { parseMangaId } from "./id";
import { getMangaSource } from "./source";
import type { MangaSeriesDetail } from "./types";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h: suficiente para evitar rescrapeos en ráfaga sin servir capítulos muy desactualizados

/**
 * Detalle de serie con caché de metadata en Prisma (no imágenes). `id` es el
 * id compuesto "fuente:idDeLaFuente" (ver id.ts) — se usa tal cual como
 * clave primaria en Prisma, así que series de distintas fuentes nunca
 * chocan. La búsqueda (search) no se cachea: varía por query y es barata de
 * repetir.
 */
export async function getSeriesCached(id: string): Promise<MangaSeriesDetail | null> {
  const parsed = parseMangaId(id);
  if (!parsed) return null;

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

  const fresh = await getMangaSource(parsed.source).getSeries(parsed.sourceId);
  if (!fresh) return null;

  await prisma.mangaSeries.upsert({
    where: { id },
    create: {
      id,
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
      where: { seriesId_chapterId: { seriesId: id, chapterId: chapter.chapterId } },
      create: {
        seriesId: id,
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

  return { ...fresh, id };
}
