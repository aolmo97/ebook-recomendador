/**
 * Busca un libro en el bot personal de Telegram @aolmislibros usando una
 * cuenta de usuario real vía MTProto (GramJS) — un bot no puede hablarle a
 * otro bot, por eso hace falta TG_SESSION de una cuenta de usuario.
 *
 * Requiere TG_API_ID, TG_API_HASH, TG_SESSION en el entorno. El session
 * string se genera una vez con `scripts/telegram-login.ts` (login
 * interactivo, no automatizable).
 *
 * Pon TG_DEBUG=1 para loguear texto y botones de cada respuesta del bot —
 * útil para confirmar el formato real antes de fiarte del parseo.
 */

import { Api, TelegramClient } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const API_ID = Number(process.env.TG_API_ID);
const API_HASH = process.env.TG_API_HASH ?? "";
const SESSION = process.env.TG_SESSION ?? "";
const BOT_HANDLE = "@BibliotecaSecretaMEGABot";
const BOT_USERNAME = "BibliotecaSecretaMEGABot";
const RESPONSE_TIMEOUT_MS = 15_000;
const DEBUG = process.env.TG_DEBUG === "1";

let client: TelegramClient | null = null;

function assertEnv() {
  if (!API_ID || !API_HASH || !SESSION) {
    throw new Error(
      "Faltan TG_API_ID / TG_API_HASH / TG_SESSION. Genera el session string con `npx tsx scripts/telegram-login.ts` y ponlos en .env.local"
    );
  }
}

async function getClient(): Promise<TelegramClient> {
  assertEnv();
  if (client) {
    if (!client.connected) await client.connect();
    return client;
  }
  client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}

// Si la operación falla (conexión caída, o el cliente queda en un estado roto
// tras algo como AUTH_KEY_DUPLICATED — reconectar la MISMA instancia no basta
// ahí), descartamos el cliente del todo y reintentamos una vez con uno nuevo.
async function withReconnect<T>(fn: (tg: TelegramClient) => Promise<T>): Promise<T> {
  const tg = await getClient();
  try {
    return await fn(tg);
  } catch {
    try {
      await tg.disconnect();
    } catch {
      // ya estaba muerta, da igual
    }
    client = null;
    const freshTg = await getClient();
    return await fn(freshTg);
  }
}

function debugLog(label: string, message: Api.Message) {
  if (!DEBUG) return;
  const markup = JSON.stringify(message.replyMarkup, (_key, val) =>
    val instanceof Buffer ? val.toString("hex") : val
  );
  console.log(`[TG_DEBUG] ${label} — text=${JSON.stringify(message.message)} replyMarkup=${markup}`);
}

export type BookSearchStatus = "document" | "candidates" | "no_results" | "timeout" | "error";

export interface BookCandidate {
  label: string;
  command: string;
}

export interface BookSearchResult {
  status: BookSearchStatus;
  raw?: string;
  filePath?: string;
  fileName?: string;
  candidates?: BookCandidate[];
  error?: string;
}

async function isFromBot(message: Api.Message): Promise<boolean> {
  const sender = (await message.getSender()) as Api.User | undefined;
  return Boolean(sender?.username?.toLowerCase() === BOT_USERNAME.toLowerCase());
}

async function waitForBotMessage(
  tg: TelegramClient,
  filter?: (m: Api.Message) => boolean
): Promise<Api.Message> {
  return new Promise((resolve, reject) => {
    const eventBuilder = new NewMessage({});
    const timeout = setTimeout(() => {
      tg.removeEventHandler(handler, eventBuilder);
      reject(new Error("timeout"));
    }, RESPONSE_TIMEOUT_MS);

    const handler = async (event: NewMessageEvent) => {
      const message = event.message;
      if (!(await isFromBot(message))) return;
      if (filter && !filter(message)) return;
      clearTimeout(timeout);
      tg.removeEventHandler(handler, eventBuilder);
      resolve(message);
    };

    tg.addEventHandler(handler, eventBuilder);
  });
}

async function downloadDocument(
  tg: TelegramClient,
  message: Api.Message,
  fallbackName: string
): Promise<BookSearchResult> {
  const buffer = await tg.downloadMedia(message, {});
  const doc = message.document as Api.Document | undefined;
  const fileName =
    doc?.attributes.find(
      (a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename
    )?.fileName || `${fallbackName}.epub`;
  const filePath = path.join(os.tmpdir(), `${Date.now()}-${fileName}`);
  fs.writeFileSync(filePath, buffer as Buffer);
  return { status: "document", filePath, fileName };
}

// TODO: confirmar contra @aolmislibros real el texto exacto del botón (puede llevar
// emoji, mayúsculas distintas, etc.) — de momento matchea cualquier botón que
// contenga "epub" (case-insensitive) como substring.
async function clickEpubButton(message: Api.Message): Promise<void> {
  const markup = message.replyMarkup as Api.ReplyInlineMarkup | undefined;
  const rows = markup?.rows ?? [];
  for (let r = 0; r < rows.length; r++) {
    const buttons = rows[r].buttons ?? [];
    for (let c = 0; c < buttons.length; c++) {
      const text = (buttons[c] as { text?: string }).text;
      if (typeof text === "string" && /epub/i.test(text)) {
        await message.click({ i: r, j: c });
        return;
      }
    }
  }
  const seen = rows.map((r) => (r.buttons ?? []).map((b) => (b as { text?: string }).text));
  throw new Error(`Botón "Epub" no encontrado. Botones vistos: ${JSON.stringify(seen)}`);
}

async function waitForNextDocument(tg: TelegramClient, fallbackName: string): Promise<BookSearchResult> {
  try {
    const message = await waitForBotMessage(tg, (m) => Boolean(m.document));
    return downloadDocument(tg, message, fallbackName);
  } catch {
    return { status: "timeout" };
  }
}

// Interpreta cualquier respuesta del bot: documento directo, ficha con botones
// (pulsa "Epub" y espera el documento que llega después), lista de candidatos
// en texto, o "sin resultados".
async function interpretBotMessage(
  tg: TelegramClient,
  message: Api.Message,
  fallbackName: string
): Promise<BookSearchResult> {
  debugLog("respuesta bot", message);

  if (message.document) {
    return downloadDocument(tg, message, fallbackName);
  }

  const markup = message.replyMarkup as Api.ReplyInlineMarkup | undefined;
  if (markup?.rows?.length) {
    try {
      await clickEpubButton(message);
    } catch (err) {
      return { status: "error", raw: message.message ?? "", error: (err as Error).message };
    }
    return waitForNextDocument(tg, fallbackName);
  }

  const text = message.message ?? "";

  // TODO: confirmar contra respuesta real de @aolmislibros. Formato asumido:
  // una línea por candidato, "Título del libro /comando".
  const candidateLines = text
    .split("\n")
    .map((line) => line.match(/^(.*?)\s+(\/\S+)$/))
    .filter((m): m is RegExpMatchArray => m !== null);

  if (candidateLines.length > 0) {
    return {
      status: "candidates",
      raw: text,
      candidates: candidateLines.map((m) => ({ label: m[1].trim(), command: m[2].trim() })),
    };
  }

  return { status: "no_results", raw: text };
}

/** Manda el nombre del libro al bot y espera + interpreta la primera respuesta. */
export async function searchBook(bookName: string): Promise<BookSearchResult> {
  return withReconnect(async (tg) => {
    const waitPromise = waitForBotMessage(tg);
    await tg.sendMessage(BOT_HANDLE, { message: bookName });
    try {
      const message = await waitPromise;
      return interpretBotMessage(tg, message, bookName);
    } catch {
      return { status: "timeout" };
    }
  });
}

/**
 * Manda un "comando" de candidato (ej: "/bOu2y2") como si fuera texto normal
 * y espera + interpreta la respuesta (normalmente la ficha con botón Epub).
 */
export async function sendFollowUp(command: string, fallbackName = "libro"): Promise<BookSearchResult> {
  return withReconnect(async (tg) => {
    const waitPromise = waitForBotMessage(tg);
    await tg.sendMessage(BOT_HANDLE, { message: command });
    try {
      const message = await waitPromise;
      return interpretBotMessage(tg, message, fallbackName);
    } catch {
      return { status: "timeout" };
    }
  });
}
