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

- `sources/inmanga.ts` — adaptador **real**, scraping de inmanga.com. Endpoints
  descubiertos inspeccionando los bundles JS del sitio (no hay API pública):
  - Buscar: `POST /manga/getMangasConsultResult` → fragmento HTML de tarjetas.
  - Detalle: `GET /ver/manga/{slug-cualquiera}/{seriesId}` → HTML server-rendered
    (el slug se ignora en el servidor, solo importa el GUID).
  - Capítulos: `GET /chapter/getall?mangaIdentification={seriesId}` → JSON
    doble-encodeado (`{"data": "<json string>"}`).
  - Páginas: `GET /chapter/chapterIndexControls?identification={chapterId}` →
    fragmento HTML con un `<img id="{pageId}" data-pagenumber="N">` por página.
  - Imagen: `https://cdn1.intomanga.com/i/m/{seriesId}/c/{chapterId}/o/{pageId}.jpg`.
  - IDs inexistentes → HTTP 404 en las rutas HTML, `{success:false}` en las JSON.
    `robots.txt` no restringe ninguna ruta usada aquí.
- `sources/mangadex.ts` — adaptador de referencia contra la API pública de
  MangaDex (sin scraping). Queda como fallback/ejemplo si inmanga cambia de
  HTML y hay que reemplazar temporalmente la fuente activa.

### Cambiar de fuente

En `source.ts`, cambiar `export const mangaSource: MangaSource = new InMangaSource()`
por otra implementación de `MangaSource`. Nada más cambia: rutas, caché Prisma
y descarga/CBZ son agnósticas a la fuente.

### Riesgos de inmanga.ts (scraping real)

- Selectores CSS y endpoints frágiles: si el sitio cambia el HTML/JS, esto se
  rompe silenciosamente (empieza a devolver listas vacías, no errores).
- El sitio usa Cloudflare (challenge script visible en el HTML) pero no lo vimos
  bloquear estas rutas en pruebas puntuales; bajo carga sostenida podría empezar
  a desafiar/bloquear al `User-Agent` usado — si pasa, bajar la concurrencia en
  `download.ts` y espaciar más los reintentos.

## Caché (Prisma)

Modelos `MangaSeries` / `MangaChapter` (solo metadata, no imágenes). TTL de
1h en `repository.ts::getSeriesCached`. La búsqueda no se cachea (varía por
query, es barata de repetir).

## Descarga + CBZ

`download.ts`: concurrencia 4 (`p-limit`), 3 reintentos con backoff, User-Agent
de navegador. `cbz.ts`: `archiver` (`ZipArchive`, API v8), imágenes nombradas
`001.ext`, `002.ext`... en memoria (sin tocar disco), buffer completo servido
en la respuesta — igual de simple que `serveEpub` en el módulo books.
