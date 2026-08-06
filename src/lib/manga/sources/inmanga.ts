import * as cheerio from "cheerio";
import type { MangaChapterSummary, MangaImageRequest, MangaSearchItem, MangaSeriesDetail, MangaSource } from "../types";

/**
 * Adaptador real contra inmanga.com (ASP.NET MVC + jQuery, sin API pública
 * documentada). Endpoints descubiertos inspeccionando los bundles JS del
 * sitio (SysScripts/Chapters/chapter.index.init.js, bundles/manga/consult/js):
 *
 * - Buscar series:     POST /manga/getMangasConsultResult  → fragmento HTML
 * - Detalle de serie:  GET  /ver/manga/{slug-cualquiera}/{seriesId} → HTML server-rendered
 *                      (el slug se ignora en el servidor, solo importa el GUID)
 * - Capítulos de serie: GET /chapter/getall?mangaIdentification={seriesId} → JSON doble-encodeado
 * - Páginas de capítulo: GET /chapter/chapterIndexControls?identification={chapterId} → fragmento HTML
 *                      con un <img id="{pageId}" data-pagenumber="N"> por página, en orden
 * - Imagen de página:  https://cdn1.intomanga.com/i/m/{seriesId}/c/{chapterId}/o/{pageId}.jpg
 *
 * IDs no encontrados → HTTP 404 ("Server Error") en las rutas HTML, o
 * `{success:false}` en las JSON. robots.txt no restringe ninguna ruta.
 */
const BASE_URL = "https://inmanga.com";
const CDN_BASE_URL = "https://cdn1.intomanga.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface InMangaChapterEntry {
  Identification: string;
  Number: number;
  FriendlyChapterNumber: string;
  RegistrationDate: string;
}

interface InMangaGetAllResponse {
  success: boolean;
  result: InMangaChapterEntry[];
}

async function inMangaGet(path: string): Promise<{ status: number; html: () => Promise<string> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  return { status: response.status, html: () => response.text() };
}

export class InMangaSource implements MangaSource {
  async search(query: string): Promise<MangaSearchItem[]> {
    const response = await fetch(`${BASE_URL}/manga/getMangasConsultResult`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({
        "filter[generes][]": "-1",
        "filter[queryString]": query,
        "filter[skip]": "0",
        "filter[take]": "20",
        "filter[sortby]": "1",
        "filter[broadcastStatus]": "",
        "filter[onlyFavorites]": "false",
        d: "",
      }),
    });
    if (!response.ok) {
      throw new Error(`InManga respondió ${response.status}`);
    }

    const $ = cheerio.load(await response.text());
    return $("a.manga-result")
      .map((_, el) => {
        const href = $(el).attr("href") ?? "";
        const id = href.split("/").filter(Boolean).pop() ?? "";
        return {
          id,
          title: $(el).find("h4.ellipsed-text").text().replace(/\s+/g, " ").trim(),
          coverUrl: $(el).find("img").attr("data-src") ?? null,
          sourceUrl: `${BASE_URL}${href}`,
        };
      })
      .get()
      .filter((item) => item.id);
  }

  async getSeries(id: string): Promise<MangaSeriesDetail | null> {
    const page = await inMangaGet(`/ver/manga/serie/${id}`);
    if (page.status === 404) return null;
    if (page.status !== 200) throw new Error(`InManga respondió ${page.status}`);

    const $ = cheerio.load(await page.html());
    const title = $("h1").first().text().trim();
    if (!title) return null;

    $("br").replaceWith("\n");
    const synopsis = $("h1").parent().next(".panel-body").text().trim() || null;
    const coverUrl = $(".custom-bg-center img").attr("src") ?? null;

    const chaptersResponse = await fetch(`${BASE_URL}/chapter/getall?mangaIdentification=${id}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!chaptersResponse.ok) {
      throw new Error(`InManga respondió ${chaptersResponse.status}`);
    }
    const outer: { data: string } = await chaptersResponse.json();
    const inner: InMangaGetAllResponse = JSON.parse(outer.data);

    const chapters: MangaChapterSummary[] = inner.success
      ? inner.result
          .map((c) => ({
            chapterId: c.Identification.toLowerCase(),
            number: c.FriendlyChapterNumber,
            title: null,
            publishedAt: c.RegistrationDate,
          }))
          .sort((a, b) => Number(a.number) - Number(b.number))
      : [];

    return {
      id,
      title,
      synopsis,
      coverUrl,
      sourceUrl: `${BASE_URL}/ver/manga/serie/${id}`,
      chapters,
    };
  }

  async getChapterImages(seriesId: string, chapterId: string): Promise<MangaImageRequest[]> {
    const page = await inMangaGet(`/chapter/chapterIndexControls?identification=${chapterId}`);
    if (page.status === 404) return [];
    if (page.status !== 200) throw new Error(`InManga respondió ${page.status}`);

    const $ = cheerio.load(await page.html());
    return $("img.ImageContainer")
      .map((_, el) => {
        const pageId = $(el).attr("id") ?? "";
        return { url: `${CDN_BASE_URL}/i/m/${seriesId}/c/${chapterId}/o/${pageId}.jpg` };
      })
      .get()
      .filter((img) => img.url);
  }
}
