import { MangaDexSource } from "./sources/mangadex";
import type { MangaSource } from "./types";

// Fuente activa. Cuando se confirme la web fuente real, sustituir por su
// adaptador (p.ej. basado en src/lib/manga/sources/scrapingExample.ts).
export const mangaSource: MangaSource = new MangaDexSource();
