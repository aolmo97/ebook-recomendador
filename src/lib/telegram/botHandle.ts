/**
 * Handle del bot de Biblioteca Secreta. Cambia cada cierto tiempo, así que se
 * guarda en la BD (el disco del contenedor se pierde al redeployar) y se
 * refresca leyendo http://bibliotecasecreta.nl (redirige a una página de
 * telegra.ph con los enlaces t.me de los bots).
 */

import { prisma } from "@/lib/prisma";

const SOURCE_URL = "http://bibliotecasecreta.nl";
const FALLBACK_USERNAME = "BibliotecaSecretaMEGABot";
const SETTING_KEY = "telegram_bot_username";

let cached: string | null = null;

export async function getBotUsername(): Promise<string> {
  if (cached) return cached;
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    if (row) {
      cached = row.value;
      return cached;
    }
  } catch {
    // tabla aún sin migrar: se usa el valor por defecto
  }
  return FALLBACK_USERNAME;
}

export async function getBotHandle(): Promise<string> {
  return `@${await getBotUsername()}`;
}

/** Lee la web, extrae el bot en español y lo persiste. Devuelve el username. */
export async function refreshBotUsername(): Promise<{ username: string; previous: string }> {
  const previous = await getBotUsername();
  const res = await fetch(SOURCE_URL, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`La web respondió ${res.status}`);
  const html = await res.text();

  const usernames = [...html.matchAll(/t\.me\/([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const unique = [...new Set(usernames)].filter((u) => /bot$/i.test(u));
  // La página lista un bot por idioma; el catalán no sirve para este uso.
  const spanish = unique.find((u) => !/catala/i.test(u)) ?? unique[0];
  if (!spanish) throw new Error("No se encontró ningún bot de Telegram en la página");

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: spanish },
    update: { value: spanish },
  });
  cached = spanish;
  return { username: spanish, previous };
}
