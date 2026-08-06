# Módulo manga

Hermano del módulo `books`, mismo estilo de rutas/errores, sin auth (el proyecto
no tiene auth en ningún endpoint todavía).

## Endpoints (`src/app/api/manga/...`)

- `GET /api/manga/search?q=<texto>`
- `GET /api/manga/:id`
- `GET /api/manga/:id/chapters/:chapterId/download` → `.cbz`

## Patrón adaptador

`src/lib/manga/types.ts` define `MangaSource` (`search`, `getSeries`,
`getChapterImages`). Fuente activa: `src/lib/manga/source.ts`.

- `sources/mangadex.ts` — adaptador **fake/de prueba** contra la API pública
  de MangaDex. Funciona de verdad (probado end-to-end), permite validar todo
  el flujo mientras se confirma la fuente real.
- `sources/scrapingExample.ts` — plantilla para la fuente real por scraping
  HTML (cheerio). No apunta a ningún sitio: tiene `BASE_URL` y selectores
  marcados `TODO`.

### Cómo conectar la fuente real

1. Rellenar `BASE_URL` y selectores en `sources/scrapingExample.ts` (o crear
   otro archivo si la fuente real tiene API JSON en vez de HTML — copiar el
   patrón de `mangadex.ts` en ese caso).
2. En `source.ts`, cambiar `export const mangaSource: MangaSource = new MangaDexSource()`
   por la nueva implementación.
3. Nada más cambia: rutas, caché Prisma y descarga/CBZ son agnósticas a la fuente.

## Caché (Prisma)

Modelos `MangaSeries` / `MangaChapter` (solo metadata, no imágenes). TTL de
1h en `repository.ts::getSeriesCached`. La búsqueda no se cachea (varía por
query, es barata de repetir).

## Descarga + CBZ

`download.ts`: concurrencia 4 (`p-limit`), 3 reintentos con backoff, User-Agent
de navegador. `cbz.ts`: `archiver` (`ZipArchive`, API v8), imágenes nombradas
`001.ext`, `002.ext`... en memoria (sin tocar disco), buffer completo servido
en la respuesta — igual de simple que `serveEpub` en el módulo books.
