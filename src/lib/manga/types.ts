export interface MangaSearchItem {
  id: string;
  title: string;
  coverUrl: string | null;
  sourceUrl: string;
}

export interface MangaChapterSummary {
  chapterId: string;
  number: string;
  title: string | null;
  publishedAt: string | null;
}

export interface MangaSeriesDetail {
  id: string;
  title: string;
  synopsis: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  chapters: MangaChapterSummary[];
}

/** Una imagen de capítulo a descargar. `referer` cuando la fuente exige ese header (hotlink protection). */
export interface MangaImageRequest {
  url: string;
  referer?: string;
}

/**
 * Adaptador de fuente de manga. Cambiar de fuente = escribir una nueva
 * implementación de esta interfaz y sustituirla en `source.ts`.
 */
export interface MangaSource {
  search(query: string): Promise<MangaSearchItem[]>;
  getSeries(id: string): Promise<MangaSeriesDetail | null>;
  getChapterImages(seriesId: string, chapterId: string): Promise<MangaImageRequest[]>;
}
