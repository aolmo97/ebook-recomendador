import * as cheerio from "cheerio";
import type { MangaImageRequest, MangaSearchItem, MangaSeriesDetail, MangaSource } from "../types";

/**
 * TODO: PLANTILLA para la fuente real por scraping HTML.
 *
 * No apunta a ningún sitio real todavía — rellenar `BASE_URL` y los
 * selectores CSS marcados con TODO en cuanto se confirme la web fuente.
 * Usa cheerio (ya instalado) para parsear el HTML, igual que MangaDexSource
 * (src/lib/manga/sources/mangadex.ts) implementa el mismo MangaSource pero
 * contra una API JSON. Una vez lista, actívala en src/lib/manga/source.ts.
 *
 * Puntos a cuidar respecto al adaptador de API:
 * - User-Agent de navegador real (algunos sitios bloquean UAs de bot).
 * - Los selectores CSS son frágiles: si el sitio cambia el HTML, se rompe.
 * - Revisar robots.txt / términos de uso del sitio elegido antes de scrapear.
 */
const BASE_URL = "https://TODO-dominio-de-la-fuente.example";

async function fetchHtml(path: string): Promise<cheerio.CheerioAPI> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`Fuente respondió ${response.status}`);
  }
  return cheerio.load(await response.text());
}

export class ScrapingExampleSource implements MangaSource {
  async search(query: string): Promise<MangaSearchItem[]> {
    const $ = await fetchHtml(`/search?q=${encodeURIComponent(query)}`);

    // TODO: ajustar selectores al HTML real del sitio.
    return $(".TODO-search-result-card")
      .map((_, el) => {
        const anchor = $(el).find("a.TODO-title-link");
        const href = anchor.attr("href") ?? "";
        return {
          id: href, // usar el slug/URL como id estable
          title: anchor.text().trim(),
          coverUrl: $(el).find("img.TODO-cover").attr("src") ?? null,
          sourceUrl: `${BASE_URL}${href}`,
        };
      })
      .get();
  }

  async getSeries(id: string): Promise<MangaSeriesDetail | null> {
    const $ = await fetchHtml(id);

    // TODO: ajustar selectores al HTML real del sitio.
    const title = $(".TODO-series-title").text().trim();
    if (!title) return null;

    return {
      id,
      title,
      synopsis: $(".TODO-series-synopsis").text().trim() || null,
      coverUrl: $(".TODO-series-cover").attr("src") ?? null,
      sourceUrl: `${BASE_URL}${id}`,
      chapters: $(".TODO-chapter-row")
        .map((_, el) => ({
          chapterId: $(el).find("a").attr("href") ?? "",
          number: $(el).data("chapter-number")?.toString() ?? "?",
          title: $(el).find(".TODO-chapter-title").text().trim() || null,
          publishedAt: $(el).find("time").attr("datetime") ?? null,
        }))
        .get(),
    };
  }

  async getChapterImages(_seriesId: string, chapterId: string): Promise<MangaImageRequest[]> {
    const $ = await fetchHtml(chapterId);

    // TODO: ajustar selector al HTML real del sitio (imágenes del lector).
    return $("img.TODO-page-image")
      .map((_, el) => ({ url: $(el).attr("src") ?? $(el).attr("data-src") ?? "", referer: BASE_URL }))
      .get()
      .filter((img) => img.url);
  }
}
