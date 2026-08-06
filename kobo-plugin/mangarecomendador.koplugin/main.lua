local ConfirmBox = require("ui/widget/confirmbox")
local DataStorage = require("datastorage")
local FileManager = require("apps/filemanager/filemanager")
local InfoMessage = require("ui/widget/infomessage")
local InputDialog = require("ui/widget/inputdialog")
local JSON = require("json")
local LuaSettings = require("luasettings")
local Menu = require("ui/widget/menu")
local NetworkMgr = require("ui/network/manager")
local ReaderUI = require("apps/reader/readerui")
local TextViewer = require("ui/widget/textviewer")
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local filemanagerutil = require("apps/filemanager/filemanagerutil")
local ffiUtil = require("ffi/util")
local http = require("socket.http")
local ltn12 = require("ltn12")
local logger = require("logger")
local socket = require("socket")
local socketutil = require("socketutil")
local T = ffiUtil.template
local _ = require("gettext")

local DEFAULT_SERVER_URL = "http://127.0.0.1:3000"

-- Mismas claves que MANGA_SOURCE_KEYS en src/lib/manga/id.ts.
local MANGA_SOURCES = {
    { key = "inmanga", label = _("InManga") },
    { key = "manhwaweb", label = _("ManhwaWeb") },
}

local MangaRecomendador = WidgetContainer:extend{
    name = "mangarecomendador",
    is_doc_only = false,
}

function MangaRecomendador:init()
    self.settings = LuaSettings:open(DataStorage:getSettingsDir() .. "/mangarecomendador.lua")
    self.ui.menu:registerToMainMenu(self)
end

function MangaRecomendador:getServerUrl()
    return self.settings:readSetting("server_url", DEFAULT_SERVER_URL)
end

function MangaRecomendador:addToMainMenu(menu_items)
    menu_items.mangarecomendador = {
        text = _("Mi Manga"),
        sorting_hint = "search",
        sub_item_table = {
            {
                text = _("Buscar manga"),
                keep_menu_open = true,
                callback = function() self:promptSearch() end,
            },
            {
                text = _("Configurar servidor"),
                keep_menu_open = true,
                callback = function() self:promptServerUrl() end,
            },
        },
    }
end

function MangaRecomendador:urlEncode(str)
    return (tostring(str):gsub("[^%w%-%.%_%~]", function(c)
        return string.format("%%%02X", string.byte(c))
    end))
end

function MangaRecomendador:sanitizeFilename(name)
    return (tostring(name or "manga"):gsub("[/\\:%*%?\"<>|]", "_"))
end

-- LuaSocket devuelve (nil, "mensaje error") cuando la petición falla antes de
-- llegar a un código HTTP, así que "code" puede acabar siendo un string en
-- vez de un número; por eso se comprueba explícitamente == 200 más abajo.
function MangaRecomendador:apiRequest(method, path)
    local url = self:getServerUrl() .. path
    local sink = {}
    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local code, _headers, status = socket.skip(1, http.request{
        url = url,
        method = method,
        sink = ltn12.sink.table(sink),
    })
    socketutil:reset_timeout()
    local content = table.concat(sink)
    if code ~= 200 then
        logger.warn("mangarecomendador: fallo de red", code, status)
        local decode_ok, decoded = pcall(JSON.decode, content)
        local server_error = (decode_ok and type(decoded) == "table" and decoded.error) or nil
        return false, server_error or T(_("Error de conexión con el servidor (%1)."), tostring(code))
    end
    local decode_ok, decoded = pcall(JSON.decode, content)
    if not decode_ok or type(decoded) ~= "table" then
        return false, _("El servidor devolvió una respuesta no válida.")
    end
    return true, decoded
end

function MangaRecomendador:promptServerUrl()
    local dialog
    dialog = InputDialog:new{
        title = _("Configurar servidor"),
        input = self:getServerUrl(),
        input_hint = "http://192.168.1.10:3000",
        description = _("URL base del servidor Mi Recomendador, sin barra final."),
        buttons = {
            {
                {
                    text = _("Cancelar"),
                    id = "close",
                    callback = function() UIManager:close(dialog) end,
                },
                {
                    text = _("Guardar"),
                    is_enter_default = true,
                    callback = function()
                        local url = dialog:getInputText()
                        UIManager:close(dialog)
                        if url and url ~= "" then
                            url = url:gsub("/+$", "")
                            self.settings:saveSetting("server_url", url)
                            self.settings:flush()
                            UIManager:show(InfoMessage:new{
                                text = T(_("Servidor guardado: %1"), url),
                            })
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

-- Primero se elige la fuente (InManga / ManhwaWeb) y solo después se pide el
-- texto a buscar, porque el endpoint /api/manga/search exige el parámetro
-- "source" (ver src/app/api/manga/search/route.ts).
function MangaRecomendador:promptSearch()
    local item_table = {}
    for _idx, source in ipairs(MANGA_SOURCES) do
        table.insert(item_table, { text = source.label, source_key = source.key })
    end
    local source_menu
    source_menu = Menu:new{
        title = _("Elige fuente"),
        item_table = item_table,
        onMenuSelect = function(_menu, entry)
            UIManager:close(source_menu)
            self:promptSearchQuery(entry.source_key)
        end,
    }
    UIManager:show(source_menu)
end

function MangaRecomendador:promptSearchQuery(source_key)
    local dialog
    dialog = InputDialog:new{
        title = _("Buscar manga"),
        input = "",
        input_hint = _("Título de la serie"),
        buttons = {
            {
                {
                    text = _("Cancelar"),
                    id = "close",
                    callback = function() UIManager:close(dialog) end,
                },
                {
                    text = _("Buscar"),
                    is_enter_default = true,
                    callback = function()
                        local query = dialog:getInputText()
                        UIManager:close(dialog)
                        if query and query ~= "" then
                            self:runSearch(query, source_key)
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

function MangaRecomendador:runSearch(query, source_key)
    NetworkMgr:runWhenOnline(function()
        local path = "/api/manga/search?q=" .. self:urlEncode(query) .. "&source=" .. self:urlEncode(source_key)
        local ok, result = self:apiRequest("GET", path)
        if not ok then
            UIManager:show(InfoMessage:new{ text = result })
            return
        end
        self:showSearchResultsMenu(T(_("Resultados: %1"), query), result.results or {})
    end)
end

function MangaRecomendador:showSearchResultsMenu(title, results)
    if #results == 0 then
        UIManager:show(InfoMessage:new{ text = _("No se han encontrado series.") })
        return
    end
    local item_table = {}
    for _idx, series in ipairs(results) do
        table.insert(item_table, { text = series.title, series_id = series.id })
    end
    local results_menu
    results_menu = Menu:new{
        title = title,
        item_table = item_table,
        onMenuSelect = function(_menu, entry)
            self:showSeriesDetail(entry.series_id)
        end,
    }
    UIManager:show(results_menu)
end

function MangaRecomendador:showSeriesDetail(id)
    NetworkMgr:runWhenOnline(function()
        local ok, series = self:apiRequest("GET", "/api/manga/" .. self:urlEncode(id))
        if not ok then
            UIManager:show(InfoMessage:new{ text = series })
            return
        end
        self:showSeriesViewer(series)
    end)
end

function MangaRecomendador:showSeriesViewer(series)
    local chapter_count = #(series.chapters or {})
    local text = table.concat({
        T(_("Capítulos disponibles: %1"), tostring(chapter_count)),
        "",
        type(series.synopsis) == "string" and series.synopsis ~= "" and series.synopsis or _("Sin sinopsis disponible."),
    }, "\n")
    local viewer
    viewer = TextViewer:new{
        title = series.title,
        text = text,
        buttons_table = {
            {
                {
                    text = _("Ver capítulos"),
                    callback = function()
                        UIManager:close(viewer)
                        self:showChaptersMenu(series)
                    end,
                },
            },
            {
                {
                    text = _("Cerrar"),
                    callback = function() UIManager:close(viewer) end,
                },
            },
        },
    }
    UIManager:show(viewer)
end

function MangaRecomendador:showChaptersMenu(series)
    local chapters = series.chapters or {}
    if #chapters == 0 then
        UIManager:show(InfoMessage:new{ text = _("Esta serie todavía no tiene capítulos listados.") })
        return
    end
    local item_table = {}
    for _idx, chapter in ipairs(chapters) do
        local number = type(chapter.number) == "string" and chapter.number or "?"
        local label = T(_("Capítulo %1"), number)
        if type(chapter.title) == "string" and chapter.title ~= "" then
            label = label .. " - " .. chapter.title
        end
        table.insert(item_table, { text = label, chapter = chapter })
    end
    local chapters_menu
    chapters_menu = Menu:new{
        title = series.title,
        item_table = item_table,
        onMenuSelect = function(_menu, entry)
            UIManager:close(chapters_menu)
            self:downloadChapter(series, entry.chapter)
        end,
    }
    UIManager:show(chapters_menu)
end

-- Un capítulo puede pesar varias decenas de MB (el servidor descarga todas
-- las páginas y las empaqueta en un .cbz antes de responder), así que la
-- descarga puede tardar bastante y no hay forma de mostrar un % real hasta
-- que termina. Igual que en la descarga de Telegram del plugin de libros: se
-- escribe siempre a un archivo temporal primero, porque LuaSocket solo da el
-- código/cabeceras cuando la petición ha terminado del todo.
function MangaRecomendador:downloadChapter(series, chapter)
    local number = type(chapter.number) == "string" and chapter.number or "?"
    NetworkMgr:runWhenOnline(function()
        Trapper:wrap(function()
            Trapper:info(T(_("Descargando capítulo %1… puede tardar un rato."), number))

            local url = self:getServerUrl()
                .. "/api/manga/" .. self:urlEncode(series.id)
                .. "/chapters/" .. self:urlEncode(chapter.chapterId)
                .. "/download"

            local dir = filemanagerutil.getHomeFolder()
            local base_name = self:sanitizeFilename(series.title) .. " - Cap " .. self:sanitizeFilename(number)
            local tmp_filepath = ffiUtil.joinPath(dir, base_name .. ".cbz.part")
            local file = io.open(tmp_filepath, "wb")
            if not file then
                Trapper:clear()
                UIManager:show(InfoMessage:new{ text = _("No se pudo crear el archivo en la biblioteca.") })
                return
            end

            socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT, socketutil.FILE_TOTAL_TIMEOUT)
            local code, headers = socket.skip(1, http.request{
                url = url,
                sink = ltn12.sink.file(file),
            })
            socketutil:reset_timeout()
            Trapper:clear()

            local content_type = (headers and (headers["content-type"] or headers["Content-Type"])) or ""

            if code == 200 and (content_type:find("comicbook", 1, true) or content_type:find("zip", 1, true)) then
                local final_filepath = ffiUtil.joinPath(dir, base_name .. ".cbz")
                os.remove(final_filepath)
                os.rename(tmp_filepath, final_filepath)

                if FileManager.instance then
                    FileManager.instance:onRefresh()
                end

                UIManager:show(ConfirmBox:new{
                    text = T(_("Descargado: %1\n\n¿Abrir ahora?"), base_name .. ".cbz"),
                    ok_text = _("Abrir"),
                    cancel_text = _("Ahora no"),
                    ok_callback = function()
                        ReaderUI:showReader(final_filepath)
                    end,
                })
                return
            end

            -- No es un CBZ: la respuesta es JSON de error (capítulo no
            -- encontrado, fuente caída, timeout de scraping, etc).
            local err_file = io.open(tmp_filepath, "r")
            local content = err_file and err_file:read("*a") or ""
            if err_file then err_file:close() end
            os.remove(tmp_filepath)

            local decode_ok, decoded = pcall(JSON.decode, content)
            local message = (decode_ok and type(decoded) == "table" and decoded.error) or nil
            UIManager:show(InfoMessage:new{
                text = message or T(_("Error descargando el capítulo (%1)."), tostring(code)),
            })
        end)
    end)
end

return MangaRecomendador
