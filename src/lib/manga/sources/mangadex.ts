import type { MangaChapterSummary, MangaImageRequest, MangaSearchItem, MangaSeriesDetail, MangaSource } from "../types";

/**
 * Adaptador "fake"/de ejemplo contra la API pública de MangaDex, para poder
 * probar el flujo completo (search → detalle → CBZ) sin depender aún de la
 * web fuente real. Sustituir por otro MangaSource cuando se confirme la
 * fuente definitiva (ver README.md de este módulo).
 */
const API_BASE = "https://api.mangadex.org";
const UPLOADS_BASE = "https://uploads.mangadex.org";

interface MangaDexTitleMap {
  [lang: string]: string;
}

interface MangaDexCoverAttributes {
  fileName: string;
}

interface MangaDexRelationship {
  type: string;
  attributes?: MangaDexCoverAttributes;
}

interface MangaDexMangaAttributes {
  title: MangaDexTitleMap;
  description?: MangaDexTitleMap;
}

interface MangaDexManga {
  id: string;
  attributes: MangaDexMangaAttributes;
  relationships: MangaDexRelationship[];
}

interface MangaDexListResponse<T> {
  data: T[];
}

interface MangaDexSingleResponse<T> {
  data: T;
}

interface MangaDexChapterAttributes {
  chapter: string | null;
  title: string | null;
  publishAt: string;
  externalUrl: string | null;
}

interface MangaDexChapter {
  id: string;
  attributes: MangaDexChapterAttributes;
}

interface MangaDexAtHomeResponse {
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
  };
}

function pickTitle(titles: MangaDexTitleMap | undefined): string {
  if (!titles) return "Sin título";
  return titles.en ?? Object.values(titles)[0] ?? "Sin título";
}

function coverUrlOf(manga: MangaDexManga): string | null {
  const cover = manga.relationships.find((rel) => rel.type === "cover_art");
  if (!cover?.attributes?.fileName) return null;
  return `${UPLOADS_BASE}/covers/${manga.id}/${cover.attributes.fileName}.256.jpg`;
}

async function mangaDexFetch<T>(path: string, params: Record<string, string | string[]>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(`${key}[]`, v);
    } else {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "koreader-manga-plugin/1.0 (+test-adapter)" },
  });
  if (!response.ok) {
    throw new Error(`MangaDex respondió ${response.status}`);
  }
  return response.json();
}

export class MangaDexSource implements MangaSource {
  async search(query: string): Promise<MangaSearchItem[]> {
    const { data } = await mangaDexFetch<MangaDexListResponse<MangaDexManga>>("/manga", {
      title: query,
      limit: "20",
      includes: ["cover_art"],
    });

    return data.map((manga) => ({
      id: manga.id,
      title: pickTitle(manga.attributes.title),
      coverUrl: coverUrlOf(manga),
      sourceUrl: `https://mangadex.org/title/${manga.id}`,
    }));
  }

  async getSeries(id: string): Promise<MangaSeriesDetail | null> {
    let manga: MangaDexManga;
    try {
      const res = await mangaDexFetch<MangaDexSingleResponse<MangaDexManga>>(`/manga/${id}`, {
        includes: ["cover_art"],
      });
      manga = res.data;
    } catch {
      return null;
    }

    const chapters: MangaChapterSummary[] = [];
    let offset = 0;
    const limit = 100;
    for (;;) {
      const feed = await mangaDexFetch<MangaDexListResponse<MangaDexChapter>>(`/manga/${id}/feed`, {
        translatedLanguage: ["en"],
        "order[volume]": "asc",
        "order[chapter]": "asc",
        limit: String(limit),
        offset: String(offset),
      } as Record<string, string | string[]>);

      for (const chapter of feed.data) {
        if (chapter.attributes.externalUrl) continue; // no legible: enlaza a otra web
        chapters.push({
          chapterId: chapter.id,
          number: chapter.attributes.chapter ?? "?",
          title: chapter.attributes.title,
          publishedAt: chapter.attributes.publishAt,
        });
      }

      if (feed.data.length < limit) break;
      offset += limit;
    }

    return {
      id: manga.id,
      title: pickTitle(manga.attributes.title),
      synopsis: manga.attributes.description ? pickTitle(manga.attributes.description) : null,
      coverUrl: coverUrlOf(manga),
      sourceUrl: `https://mangadex.org/title/${manga.id}`,
      chapters,
    };
  }

  async getChapterImages(_seriesId: string, chapterId: string): Promise<MangaImageRequest[]> {
    const res = await mangaDexFetch<MangaDexAtHomeResponse>(`/at-home/server/${chapterId}`, {});
    const { baseUrl, chapter } = res;
    return chapter.data.map((fileName) => ({
      url: `${baseUrl}/data/${chapter.hash}/${fileName}`,
      referer: "https://mangadex.org",
    }));
  }
}
