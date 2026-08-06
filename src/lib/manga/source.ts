import { InMangaSource } from "./sources/inmanga";
import type { MangaSource } from "./types";

// Fuente activa: inmanga.com (scraping real, ver sources/inmanga.ts).
// sources/mangadex.ts queda como fallback/referencia (API pública, sin scraping).
export const mangaSource: MangaSource = new InMangaSource();
