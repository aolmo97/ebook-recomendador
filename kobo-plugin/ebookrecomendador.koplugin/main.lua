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

local EbookRecomendador = WidgetContainer:extend{
    name = "ebookrecomendador",
    is_doc_only = false,
}

function EbookRecomendador:init()
    self.settings = LuaSettings:open(DataStorage:getSettingsDir() .. "/ebookrecomendador.lua")
    self.ui.menu:registerToMainMenu(self)
end

function EbookRecomendador:getServerUrl()
    return self.settings:readSetting("server_url", DEFAULT_SERVER_URL)
end

function EbookRecomendador:addToMainMenu(menu_items)
    menu_items.ebookrecomendador = {
        text = _("Mi Recomendador"),
        sorting_hint = "search",
        sub_item_table = {
            {
                text = _("Buscar libros"),
                keep_menu_open = true,
                callback = function() self:promptSearch() end,
            },
            {
                text = _("Recomendados para mí"),
                keep_menu_open = true,
                callback = function() self:showRecommendations() end,
            },
            {
                text = _("Buscar en mi Telegram"),
                keep_menu_open = true,
                callback = function() self:promptTelegramSearch() end,
            },
            {
                text = _("Configurar servidor"),
                keep_menu_open = true,
                callback = function() self:promptServerUrl() end,
            },
        },
    }
end

function EbookRecomendador:urlEncode(str)
    return (tostring(str):gsub("[^%w%-%.%_%~]", function(c)
        return string.format("%%%02X", string.byte(c))
    end))
end

function EbookRecomendador:urlDecode(str)
    str = str:gsub("+", " ")
    return (str:gsub("%%(%x%x)", function(hex) return string.char(tonumber(hex, 16)) end))
end

-- LuaSocket devuelve (nil, "mensaje error") cuando la petición falla antes de
-- llegar a un código HTTP, así que "code" puede acabar siendo un string en
-- vez de un número; por eso se comprueba explícitamente == 200 más abajo.
function EbookRecomendador:apiRequest(method, path, body)
    local url = self:getServerUrl() .. path
    local sink = {}
    local request = {
        url = url,
        method = method,
        sink = ltn12.sink.table(sink),
    }
    if body then
        local body_json = JSON.encode(body)
        request.source = ltn12.source.string(body_json)
        request.headers = {
            ["Content-Type"] = "application/json",
            ["Content-Length"] = tostring(#body_json),
        }
    end
    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local code, _headers, status = socket.skip(1, http.request(request))
    socketutil:reset_timeout()
    if code ~= 200 then
        logger.warn("ebookrecomendador: fallo de red", code, status)
        return false, T(_("Error de conexión con el servidor (%1)."), tostring(code))
    end
    local content = table.concat(sink)
    local decode_ok, decoded = pcall(JSON.decode, content)
    if not decode_ok or type(decoded) ~= "table" then
        return false, _("El servidor devolvió una respuesta no válida.")
    end
    return true, decoded
end

function EbookRecomendador:promptServerUrl()
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

function EbookRecomendador:promptSearch()
    local dialog
    dialog = InputDialog:new{
        title = _("Buscar libros"),
        input = "",
        input_hint = _("Título, autor o palabra clave"),
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
                            self:runSearch(query)
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

function EbookRecomendador:promptTelegramSearch()
    local dialog
    dialog = InputDialog:new{
        title = _("Buscar en mi Telegram"),
        input = "",
        input_hint = _("Título del libro"),
        description = _("Busca entre los epubs de tu bot personal de Telegram y lo descarga directo."),
        buttons = {
            {
                {
                    text = _("Cancelar"),
                    id = "close",
                    callback = function() UIManager:close(dialog) end,
                },
                {
                    text = _("Buscar y descargar"),
                    is_enter_default = true,
                    callback = function()
                        local query = dialog:getInputText()
                        UIManager:close(dialog)
                        if query and query ~= "" then
                            self:telegramSearch(query)
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

-- El endpoint /api/books/search puede tardar 15-40s (busca en el bot de
-- Telegram y pulsa el botón Epub en vivo). Con un único resultado el
-- servidor ya baja el epub directo; con varios, devuelve JSON con la lista
-- de candidatos y aquí se le muestra al usuario para que elija. La
-- respuesta se escribe siempre a un archivo temporal primero, porque
-- LuaSocket solo da el código/cabeceras cuando la petición ya ha terminado
-- del todo — así que decidimos si es epub o JSON mirando el Content-Type
-- una vez descargado, no antes.
function EbookRecomendador:telegramSearch(query, command)
    NetworkMgr:runWhenOnline(function()
        Trapper:wrap(function()
            Trapper:info(_("Buscando en tu Telegram… puede tardar hasta 40s."))

            local url = self:getServerUrl() .. "/api/books/search?q=" .. self:urlEncode(query)
            if command then
                url = url .. "&command=" .. self:urlEncode(command)
            end

            local dir = filemanagerutil.getHomeFolder()
            local tmp_filepath = ffiUtil.joinPath(dir, self:sanitizeFilename(query) .. ".epub.part")
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

            if content_type:find("epub", 1, true) then
                local final_filename = self:sanitizeFilename(query) .. ".epub"
                local disposition = headers and (headers["content-disposition"] or headers["Content-Disposition"])
                if disposition then
                    local raw_name = disposition:match('filename="([^"]+)"')
                    if raw_name then
                        final_filename = self:sanitizeFilename(self:urlDecode(raw_name))
                    end
                end
                local final_filepath = ffiUtil.joinPath(dir, final_filename)
                os.remove(final_filepath)
                os.rename(tmp_filepath, final_filepath)

                if FileManager.instance then
                    FileManager.instance:onRefresh()
                end

                UIManager:show(ConfirmBox:new{
                    text = T(_("Descargado: %1\n\n¿Abrir ahora?"), final_filename),
                    ok_text = _("Abrir"),
                    cancel_text = _("Ahora no"),
                    ok_callback = function()
                        ReaderUI:showReader(final_filepath)
                    end,
                })
                return
            end

            -- No es un epub: o es JSON con candidatos, o un JSON/HTML de error.
            local err_file = io.open(tmp_filepath, "r")
            local content = err_file and err_file:read("*a") or ""
            if err_file then err_file:close() end
            os.remove(tmp_filepath)

            local decode_ok, decoded = pcall(JSON.decode, content)
            if not decode_ok or type(decoded) ~= "table" then
                UIManager:show(InfoMessage:new{
                    text = T(_("Error buscando en Telegram (%1)."), tostring(code)),
                })
                return
            end

            if decoded.status == "candidates" and decoded.candidates and #decoded.candidates > 0 then
                self:showTelegramCandidates(query, decoded.candidates)
            else
                UIManager:show(InfoMessage:new{ text = decoded.error or _("No se encontró el libro.") })
            end
        end)
    end)
end

function EbookRecomendador:showTelegramCandidates(query, candidates)
    local item_table = {}
    for _idx, candidate in ipairs(candidates) do
        table.insert(item_table, { text = candidate.label, command = candidate.command })
    end
    local candidates_menu
    candidates_menu = Menu:new{
        title = _("Elige un libro"),
        item_table = item_table,
        onMenuSelect = function(_menu, entry)
            UIManager:close(candidates_menu)
            self:telegramSearch(query, entry.command)
        end,
    }
    UIManager:show(candidates_menu)
end

function EbookRecomendador:runSearch(query)
    NetworkMgr:runWhenOnline(function()
        local path = "/api/buscar?q=" .. self:urlEncode(query) .. "&page=1"
        local ok, result = self:apiRequest("GET", path)
        if not ok then
            UIManager:show(InfoMessage:new{ text = result })
            return
        end
        self:showResultsMenu(T(_("Resultados: %1"), query), result.results or {})
    end)
end

function EbookRecomendador:showRecommendations()
    NetworkMgr:runWhenOnline(function()
        local ok, result = self:apiRequest("GET", "/api/recomendaciones")
        if not ok then
            UIManager:show(InfoMessage:new{ text = result })
            return
        end
        self:showResultsMenu(_("Recomendados para ti"), result.results or {})
    end)
end

function EbookRecomendador:showResultsMenu(title, results)
    if #results == 0 then
        UIManager:show(InfoMessage:new{ text = _("No se han encontrado resultados.") })
        return
    end
    local item_table = {}
    for _idx, book in ipairs(results) do
        table.insert(item_table, {
            text = book.title .. " - " .. (book.author or _("Autor desconocido")),
            book_id = book.id,
        })
    end
    local results_menu = Menu:new{
        title = title,
        item_table = item_table,
        onMenuSelect = function(_menu, entry)
            self:showBookDetail(entry.book_id)
        end,
    }
    UIManager:show(results_menu)
end

function EbookRecomendador:showBookDetail(id)
    NetworkMgr:runWhenOnline(function()
        local ok, book = self:apiRequest("GET", "/api/libro/" .. self:urlEncode(id))
        if not ok then
            UIManager:show(InfoMessage:new{ text = book })
            return
        end
        self:showBookViewer(book)
    end)
end

function EbookRecomendador:showBookViewer(book)
    local genres = table.concat(book.genres or {}, ", ")
    local text = table.concat({
        T(_("Autor: %1"), book.author or "-"),
        T(_("Idioma: %1"), book.language or "-"),
        T(_("Géneros: %1"), genres ~= "" and genres or "-"),
        "",
        book.synopsis or _("Sin sinopsis disponible."),
    }, "\n")
    local viewer
    viewer = TextViewer:new{
        title = book.title,
        text = text,
        buttons_table = {
            {
                {
                    text = _("Descargar"),
                    callback = function() self:downloadBook(book) end,
                },
                {
                    text = _("Me gusta"),
                    callback = function() self:likeBook(book) end,
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

function EbookRecomendador:sanitizeFilename(name)
    return (tostring(name or "libro"):gsub("[/\\:%*%?\"<>|]", "_"))
end

function EbookRecomendador:downloadBook(book)
    if not book.urlEpub then
        UIManager:show(InfoMessage:new{ text = _("Este libro no tiene enlace de descarga.") })
        return
    end
    NetworkMgr:runWhenOnline(function()
        local dir = filemanagerutil.getHomeFolder()
        local filename = self:sanitizeFilename(book.title) .. ".epub"
        local filepath = ffiUtil.joinPath(dir, filename)
        local file = io.open(filepath, "w")
        if not file then
            UIManager:show(InfoMessage:new{ text = _("No se pudo crear el archivo en la biblioteca.") })
            return
        end
        socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT, socketutil.FILE_TOTAL_TIMEOUT)
        local code = socket.skip(1, http.request{
            url = book.urlEpub,
            sink = ltn12.sink.file(file),
        })
        socketutil:reset_timeout()
        if code == 200 then
            UIManager:show(InfoMessage:new{ text = T(_("Descargado: %1"), filename) })
            if FileManager.instance then
                FileManager.instance:onRefresh()
            end
        else
            UIManager:show(InfoMessage:new{ text = _("Error al descargar el libro.") })
        end
    end)
end

function EbookRecomendador:likeBook(book)
    NetworkMgr:runWhenOnline(function()
        local ok, result = self:apiRequest("POST", "/api/like", { id = book.id })
        if ok and type(result) == "table" and result.liked then
            UIManager:show(InfoMessage:new{ text = _("Añadido a Me gusta.") })
        else
            UIManager:show(InfoMessage:new{
                text = type(result) == "string" and result or _("No se pudo dar Me gusta."),
            })
        end
    end)
end

return EbookRecomendador
