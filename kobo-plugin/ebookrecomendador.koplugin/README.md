# Mi Recomendador — plugin de KOReader

Plugin de KOReader para buscar libros, recibir recomendaciones y descargar
epubs directamente desde el servidor "Mi Recomendador" (la Parte A de este
proyecto), sin salir del lector.

## Requisitos previos

- Un Kobo Clara HD con el jailbreak activo (NickelMenu + FBInk ya instalados).
- **KOReader instalado en el dispositivo.** Este plugin no funciona sin
  KOReader; si todavía no lo tienes instalado en el Kobo, instálalo primero
  siguiendo la guía oficial (https://github.com/koreader/koreader/wiki/Installation-on-Kobo-devices).
- El servidor de la Parte A accesible desde la red donde esté el Kobo
  (misma WiFi local, o la URL pública del VPS si ya está desplegado).

No hace falta SSH en el Kobo para instalar este plugin: se copia por USB en
modo almacenamiento masivo.

## 1. Copiar la carpeta del plugin al Kobo

1. Conecta el Kobo al ordenador con el cable USB. En la pantalla del Kobo
   aparecerá el aviso de "conectado" y el dispositivo se montará como una
   unidad de almacenamiento masivo (aparecerá como una unidad más, p. ej.
   `E:\` en Windows).
2. Dentro del almacenamiento del Kobo, entra en la carpeta:
   ```
   .kobo\koreader\plugins\
   ```
   Si `koreader` se instaló como aplicación (no como paquete `.kobo`), la
   ruta equivalente suele ser:
   ```
   koreader\plugins\
   ```
   (la carpeta `plugins` que cuelga de donde esté instalado KOReader en el
   propio Kobo — es la misma carpeta donde ya existen otros `*.koplugin`
   oficiales como `opds.koplugin`, `calibre.koplugin`, etc. Si no la
   encuentras, busca cualquier carpeta que termine en `.koplugin` y copia
   la nuestra al lado).
3. Copia la carpeta completa `ebookrecomendador.koplugin` (tal cual, con
   ese nombre y sin renombrarla) dentro de `plugins\`. Al terminar deberías
   tener:
   ```
   koreader\plugins\ebookrecomendador.koplugin\_meta.lua
   koreader\plugins\ebookrecomendador.koplugin\main.lua
   ```
4. Expulsa el Kobo de forma segura desde el ordenador (no lo desconectes
   sin expulsar) y desconecta el cable USB. El Kobo volverá a arrancar en
   modo lectura.

## 2. Reiniciar KOReader

Si KOReader ya estaba abierto, ciérralo del todo (menú principal →
"Salir" / "Exit", o reinicia el propio Kobo) y vuelve a abrirlo. Los
plugins solo se cargan al arrancar KOReader.

## 3. Verificar que aparece en el menú

1. Abre KOReader.
2. Abre el menú principal (toca la parte superior de la pantalla, o desde
   el gestor de archivos toca el icono de menú).
3. Busca la entrada **"Mi Recomendador"**. En el gestor de archivos suele
   aparecer en la pestaña de herramientas ("Tools" / llave inglesa); si no
   la ves ahí, revisa el resto de pestañas del menú.
4. Si no aparece, entra en el visor de registros de KOReader
   (menú → "Ayuda" → "Ver registro" o similar) y busca líneas que mencionen
   `ebookrecomendador` para ver si hubo un error de carga (típicamente un
   error de sintaxis Lua se muestra ahí con el mensaje exacto y la línea).

## 4. Configurar el servidor

1. Entra en "Mi Recomendador" → "Configurar servidor".
2. Escribe la URL base del servidor (Parte A), por ejemplo:
   - En red local durante desarrollo: `http://192.168.1.XX:3000`
   - En el VPS de Coolify una vez desplegado: `https://tu-dominio-o-ip`
   - **Sin barra al final.**
3. Pulsa "Guardar". La URL se guarda de forma persistente (sobrevive a
   reinicios) en `settings/ebookrecomendador.lua` dentro de la carpeta de
   configuración de KOReader.
4. Asegúrate de que el Kobo esté conectado a la misma red (o a internet, si
   usas la URL del VPS) antes de buscar o descargar, porque KOReader pedirá
   activar el WiFi automáticamente si hace falta.

## 5. Uso

- **Buscar libros**: escribe un texto y pulsa "Buscar". Toca cualquier
  resultado de la lista para ver el detalle (autor, idioma, géneros,
  sinopsis) y desde ahí puedes "Descargar" el epub o darle a "Me gusta".
- **Recomendados para mí**: muestra la lista de recomendaciones actuales
  del servidor (puede salir vacía si todavía no le has dado "Me gusta" a
  ningún libro).
- **Buscar en mi Telegram**: escribe un título y descarga directamente el
  epub desde tu bot personal de Telegram (`GET /api/books/search?q=`, ver
  Parte A). No hay lista de resultados intermedia — el servidor ya elige el
  mejor candidato y encadena la descarga; puede tardar 15-40s porque de
  fondo está hablando con el bot en vivo (búsqueda + clic en el botón Epub +
  espera del documento). Mientras tanto se ve un aviso de carga persistente
  (no es una barra con % real — no se conoce el tamaño del epub hasta que
  termina la descarga). Al acabar, ofrece abrir el libro al momento.
- Los epubs descargados se guardan en la carpeta "Home" configurada en
  KOReader (la misma que usa el gestor de archivos) y la vista de archivos
  se refresca automáticamente al terminar la descarga.

## Solución de problemas

- **"Error de conexión con el servidor"**: revisa que la URL configurada
  sea correcta, que no tenga una barra final, y que el Kobo tenga
  conectividad real hacia esa dirección (mismo WiFi / mismo VPN si aplica).
- **"El servidor devolvió una respuesta no válida"**: normalmente indica
  que la URL configurada no apunta a la API (por ejemplo apunta a una
  página HTML en vez de al servidor Next.js), o que el servidor está caído.
- **"Buscar en mi Telegram" tarda o da timeout**: el servidor depende de que
  su sesión de Telegram (`TG_SESSION`) siga viva y de la latencia real del
  bot — si fue timeout del lado del bot, reintenta la búsqueda.
