import type { MangaSourceKey } from "./id";
import { InMangaSource } from "./sources/inmanga";
import { ManhwaWebSource } from "./sources/manhwaweb";
import type { MangaSource } from "./types";

// Registro de fuentes activas. sources/mangadex.ts queda fuera del registro,
// como fallback/referencia (API pública, sin scraping) por si alguna de las
// dos fuentes reales cambia y hay que sustituirla rápido.
export const mangaSources: Record<MangaSourceKey, MangaSource> = {
  inmanga: new InMangaSource(),
  manhwaweb: new ManhwaWebSource(),
};

export function getMangaSource(key: MangaSourceKey): MangaSource {
  return mangaSources[key];
}
