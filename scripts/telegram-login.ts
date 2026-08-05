/**
 * Login inicial de GramJS — se ejecuta UNA VEZ, a mano, de forma interactiva
 * (pide teléfono + código SMS + password de 2FA si tienes). Genera el
 * TG_SESSION que luego va en .env.local. No se puede automatizar: el código
 * llega por SMS/Telegram a tu propio teléfono.
 *
 * Uso:
 *   npx tsx scripts/telegram-login.ts
 *
 * Requiere TG_API_ID y TG_API_HASH ya puestos en .env.local (sácalos de
 * https://my.telegram.org > API development tools).
 */
import dotenv from "dotenv";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import input from "input";

dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback a .env si algo falta en .env.local

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH ?? "";

if (!apiId || !apiHash) {
  console.error("Faltan TG_API_ID / TG_API_HASH en .env.local. Sácalos de https://my.telegram.org");
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    phoneNumber: async () => await input.text("Teléfono (con prefijo, ej +34...): "),
    password: async () => await input.text("Password (si tienes 2FA, si no Enter): "),
    phoneCode: async () => await input.text("Código recibido por Telegram/SMS: "),
    onError: (err) => console.log(err),
  });
  console.log("\nSESSION STRING — cópialo en .env.local como TG_SESSION:\n");
  console.log(client.session.save());
  await client.disconnect();
})();
