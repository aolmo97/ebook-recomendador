import type { MangaChapterSummary, MangaImageRequest, MangaSearchItem, MangaSeriesDetail, MangaSource } from "../types";

/**
 * Adaptador real contra manhwaweb.com. El frontend (manhwaweb.com) bloquea
 * explícitamente a ClaudeBot en su robots.txt, así que estos endpoints se
 * obtuvieron con capturas de Network pasadas por el usuario (no scrapeando
 * el frontend en vivo), contra su backend en Railway, que sí es de acceso
 * libre (sin robots.txt propio):
 *
 * - Buscar:            GET {BACKEND}/manhwa/library?buscar={q}&...filtros vacíos
 * - Detalle de serie:  GET {BACKEND}/manhwa/see/{id}
 * - Páginas de capítulo: GET {BACKEND}/chapters/see/{chapterId}
 *
 * El `chapterId` no es un id suelto: es el slug completo que aparece tras
 * "/leer/" en el link de cada capítulo dentro del detalle de la serie
 * (p.ej. "solo-leveling-ragnarok_170.../leer/" da paso a
 * "solo-leveling-ragnarok_170..._1783909089054-0.01_01").
 */
const BACKEND_BASE_URL = "https://manhwawebbackend-production.up.railway.app";
const FRONTEND_BASE_URL = "https://manhwaweb.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface ManhwaWebSearchItem {
  real_id: string;
  _imagen?: string;
  the_real_name: string;
  name_esp?: string;
}

interface ManhwaWebSearchResponse {
  data: ManhwaWebSearchItem[];
}

interface ManhwaWebChapterEntry {
  chapter: number;
  link: string;
  create: number;
}

interface ManhwaWebDetailResponse {
  _imagen?: string;
  _sinopsis?: string;
  name_esp?: string;
  the_real_name?: string;
  chapters?: ManhwaWebChapterEntry[];
}

interface ManhwaWebChapterPagesResponse {
  chapter?: { img?: string[] };
}

function extractChapterId(link: string): string {
  const marker = "/leer/";
  const idx = link.indexOf(marker);
  return idx === -1 ? link : link.slice(idx + marker.length);
}

async function manhwaWebFetch(path: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Origin: FRONTEND_BASE_URL,
      Referer: `${FRONTEND_BASE_URL}/`,
    },
  });
  return { status: response.status, text: await response.text() };
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export class ManhwaWebSource implements MangaSource {
  async search(query: string): Promise<MangaSearchItem[]> {
    const params = new URLSearchParams({
      buscar: query,
      estado: "",
      tipo: "",
      erotico: "",
      demografia: "",
      order_item: "alfabetico",
      order_dir: "desc",
      page: "0",
      generes: "",
    });

    const res = await manhwaWebFetch(`/manhwa/library?${params.toString()}`);
    if (res.status !== 200) {
      throw new Error(`ManhwaWeb respondió ${res.status}`);
    }
    const data = safeJsonParse<ManhwaWebSearchResponse>(res.text);
    if (!data) {
      throw new Error("ManhwaWeb devolvió una respuesta no válida");
    }

    return data.data.map((item) => ({
      id: item.real_id,
      title: item.name_esp || item.the_real_name,
      coverUrl: item._imagen ?? null,
      sourceUrl: `${FRONTEND_BASE_URL}/manhwa/${item.real_id}`,
    }));
  }

  async getSeries(id: string): Promise<MangaSeriesDetail | null> {
    const res = await manhwaWebFetch(`/manhwa/see/${id}`);
    if (res.status === 404) return null;
    if (res.status !== 200) {
      throw new Error(`ManhwaWeb respondió ${res.status}`);
    }

    const data = safeJsonParse<ManhwaWebDetailResponse>(res.text);
    const title = data?.name_esp || data?.the_real_name;
    if (!data || !title) return null;

    const chapters: MangaChapterSummary[] = (data.chapters ?? []).map((c) => ({
      chapterId: extractChapterId(c.link),
      number: String(c.chapter),
      title: null,
      publishedAt: new Date(c.create).toISOString(),
    }));

    return {
      id,
      title,
      synopsis: data._sinopsis || null,
      coverUrl: data._imagen ?? null,
      sourceUrl: `${FRONTEND_BASE_URL}/manhwa/${id}`,
      chapters,
    };
  }

  async getChapterImages(_seriesId: string, chapterId: string): Promise<MangaImageRequest[]> {
    const res = await manhwaWebFetch(`/chapters/see/${chapterId}`);
    if (res.status === 404) return [];
    if (res.status !== 200) {
      throw new Error(`ManhwaWeb respondió ${res.status}`);
    }

    const data = safeJsonParse<ManhwaWebChapterPagesResponse>(res.text);
    const images = data?.chapter?.img ?? [];
    return images.map((url) => ({ url, referer: FRONTEND_BASE_URL }));
  }
}
