import { NextResponse } from "next/server";
import { fetchPublicBotUsername, getBotUsername, saveBotUsername } from "@/lib/telegram/botHandle";
import { requestPersonalBot } from "@/lib/telegram/bookSearch";

export async function POST() {
  try {
    const previous = await getBotUsername();
    const publicBot = await fetchPublicBotUsername();
    const username = await requestPersonalBot(publicBot);
    await saveBotUsername(username);
    return NextResponse.json({ username: `@${username}`, previous: `@${previous}`, changed: username !== previous });
  } catch (error) {
    console.error("[api/books/bot/update]", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
