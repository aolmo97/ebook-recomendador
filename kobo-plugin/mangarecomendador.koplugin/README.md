# Mi Manga — plugin de KOReader

Plugin de KOReader para buscar series de manga, ver sus capítulos y
descargarlos como `.cbz` directamente desde el módulo `manga` del servidor
"Mi Recomendador" (`/api/manga/...`), sin salir del lector. Es independiente
del plugin de libros (`ebookrecomendador.koplugin`) — puedes tener los dos
instalados a la vez.

## Requisitos previos

- Un Kobo Clara HD con el jailbreak activo y KOReader instalado (ver el
  README de `ebookrecomendador.koplugin` si todavía no lo tienes).
- El servidor accesible desde la red donde esté el Kobo (misma WiFi local, o
  la URL pública del VPS si ya está desplegado).
- El módulo `manga` del servidor con una fuente real activa (ver
  `src/lib/manga/README.md` — ahora mismo scraping de inmanga.com).

## 1. Copiar la carpeta del plugin al Kobo

1. Conecta el Kobo por USB (modo almacenamiento masivo).
2. Entra en `.kobo\koreader\plugins\` (o `koreader\plugins\` si KOReader está
   instalado como aplicación — la misma carpeta donde ya está
   `ebookrecomendador.koplugin` si lo tienes instalado).
3. Copia la carpeta completa `mangarecomendador.koplugin` (tal cual, sin
   renombrarla) dentro de `plugins\`. Al terminar deberías tener:
   ```
   koreader\plugins\mangarecomendador.koplugin\_meta.lua
   koreader\plugins\mangarecomendador.koplugin\main.lua
   ```
4. Expulsa el Kobo de forma segura y desconecta el cable.

## 2. Reiniciar KOReader

Ciérralo del todo y vuelve a abrirlo — los plugins solo se cargan al
arrancar.

## 3. Configurar el servidor

1. Abre KOReader → menú → **"Mi Manga"** → "Configurar servidor".
2. Escribe la URL base del servidor (la misma Parte A que ya usa
   `ebookrecomendador.koplugin`), sin barra final.
3. "Guardar". Se persiste en `settings/mangarecomendador.lua` (config propia,
   separada de la del plugin de libros).

## 4. Uso

- **Buscar manga**: escribe un título y pulsa "Buscar". Toca cualquier
  resultado para ver el detalle (número de capítulos + sinopsis).
- Desde el detalle, **"Ver capítulos"** abre la lista completa de la serie
  (en el mismo orden que devuelve el servidor).
- Toca un capítulo para descargarlo. El servidor descarga todas las páginas
  de la fuente y las empaqueta en un `.cbz` antes de responder, así que
  **puede tardar bastante** (varias decenas de MB en capítulos largos) — no
  hay barra de progreso real porque no se conoce el tamaño hasta que termina.
- Al acabar, ofrece abrir el `.cbz` al momento (KOReader lo lee de forma
  nativa como cómic). El archivo queda guardado en la carpeta "Home" de
  KOReader, nombrado `Serie - Cap N.cbz`.

## Solución de problemas

- **"Error de conexión con el servidor"**: revisa la URL configurada y la
  conectividad del Kobo hacia esa dirección.
- **"Capítulo no encontrado o sin páginas"** / **"Serie no encontrada"**: el
  id ya no existe en la fuente, o la fuente cambió de estructura (ver el
  README del módulo `manga` en el servidor — el scraping de inmanga.com es
  frágil por diseño, selectores y endpoints pueden romperse sin aviso).
- **La descarga tarda mucho o da timeout**: normal en capítulos con muchas
  páginas; si falla repetidamente, puede que la fuente esté limitando la
  concurrencia (ver nota de Cloudflare en el README del módulo `manga`).
