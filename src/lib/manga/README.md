# Módulo manga

Hermano del módulo `books`, mismo estilo de rutas/errores, sin auth (el proyecto
no tiene auth en ningún endpoint todavía).

## Endpoints (`src/app/api/manga/...`)

- `GET /api/manga/search?q=<texto>&source=<inmanga|manhwaweb>` — `source` es
  obligatorio (400 si falta o no es un valor válido). El plugin de KOReader
  le pregunta al usuario qué fuente usar antes de llamar a este endpoint.
- `GET /api/manga/:id`
- `GET /api/manga/:id/chapters/:chapterId/download` → `.cbz`

El `id` de serie que devuelve `search` (y que hay que pasar a los otros dos
endpoints) va prefijado con la fuente: `"inmanga:<guid>"` o
`"manhwaweb:<slug>"` — mismo patrón que `source:sourceId` en el módulo
`books` (`src/lib/books/types.ts`). Ver `src/lib/manga/id.ts`. `chapterId` no
lleva prefijo: ya viene delimitado por el `id` de la serie.

## Patrón adaptador multi-fuente

`src/lib/manga/types.ts` define `MangaSource` (`search`, `getSeries`,
`getChapterImages`), agnóstico a la fuente concreta. `src/lib/manga/id.ts`
codifica/decodifica el id compuesto `fuente:idDeLaFuente`. `src/lib/manga/source.ts`
es el registro `mangaSources: Record<MangaSourceKey, MangaSource>` +
`getMangaSource(key)` — las rutas y `repository.ts` resuelven qué adaptador
usar a partir del id compuesto, nunca hardcodeado.

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
- `sources/manhwaweb.ts` — adaptador **real**, contra el backend JSON de
  manhwaweb.com (`manhwawebbackend-production.up.railway.app`, sin
  `robots.txt` propio). **El frontend `manhwaweb.com` bloquea explícitamente
  a `ClaudeBot` en su `robots.txt`** — estos endpoints se obtuvieron de
  capturas de Network pasadas por el usuario, no scrapeando el frontend:
  - Buscar: `GET /manhwa/library?buscar={q}&estado=&tipo=&erotico=&demografia=&order_item=alfabetico&order_dir=desc&page=0&generes=`
    → `{"data": [...], "next": bool}`.
  - Detalle: `GET /manhwa/see/{id}` → JSON con `name_esp`/`the_real_name`,
    `_sinopsis`, `_imagen` (portada) y `chapters: [{chapter, link, create}]`
    (`link` es la URL de lectura del frontend, `https://manhwaweb.com/leer/{chapterId}`).
  - Páginas: `GET /chapters/see/{chapterId}` → `{"chapter": {"img": [urls...]}}`.
    `chapterId` = lo que va después de `/leer/` en el `link` de arriba (incluye
    el id de la serie repetido, p.ej. `solo-leveling-ragnarok_.../leer/` da
    `solo-leveling-ragnarok_..._1783909089054-0.01_01`).
  - Las imágenes están en un CDN aparte (`img2mw.xyz`) con protección
    anti-hotlink: sin `Referer: https://manhwaweb.com` responden **403**
    (visto en pruebas). El adaptador pone ese `referer` en cada
    `MangaImageRequest`, que `download.ts` ya sabe reenviar.
  - IDs inexistentes: sin confirmar en pruebas reales (no se pudo probar
    directamente contra el frontend); el adaptador trata cualquier
    JSON.parse fallido o campo de título vacío como "no encontrado" por
    seguridad, ver `sources/manhwaweb.ts`.
- `sources/mangadex.ts` — adaptador de referencia contra la API pública de
  MangaDex (sin scraping), fuera del registro `mangaSources`. Queda como
  ejemplo si `inmanga` o `manhwaweb` cambian y hay que sustituir alguna rápido.

### Añadir/cambiar una fuente

Implementar `MangaSource` en `sources/`, añadirla a `MANGA_SOURCE_KEYS` (en
`id.ts`) y al registro `mangaSources` (en `source.ts`). Nada más cambia:
rutas, caché Prisma y descarga/CBZ son agnósticas a la fuente. El plugin de
KOReader necesita su propia entrada en `MANGA_SOURCES` (`main.lua`) con la
misma clave.

### Riesgos de scraping (ambas fuentes)

- Selectores CSS y endpoints frágiles: si cualquiera de los dos sitios
  cambia su HTML/JS/API, esto se rompe silenciosamente (listas vacías, no
  errores explícitos).
- inmanga.com usa Cloudflare (challenge script visible en el HTML) pero no lo
  vimos bloquear estas rutas en pruebas puntuales; bajo carga sostenida
  podría empezar a desafiar/bloquear al `User-Agent` usado.
- manhwaweb.com bloquea `ClaudeBot` en su `robots.txt` — cualquier trabajo
  futuro sobre `sources/manhwaweb.ts` en sesiones con Claude debe seguir
  haciéndose a partir de capturas que pase el usuario, no fetcheando el
  frontend directamente (el backend en Railway sí es libre).

## Caché (Prisma)

Modelos `MangaSeries` / `MangaChapter` (solo metadata, no imágenes). TTL de
1h en `repository.ts::getSeriesCached`. La búsqueda no se cachea (varía por
query, es barata de repetir).

## Descarga + CBZ

`download.ts`: concurrencia 4 (`p-limit`), 3 reintentos con backoff, User-Agent
de navegador. `cbz.ts`: `archiver` (`ZipArchive`, API v8), imágenes nombradas
`001.ext`, `002.ext`... en memoria (sin tocar disco), buffer completo servido
en la respuesta — igual de simple que `serveEpub` en el módulo books.
