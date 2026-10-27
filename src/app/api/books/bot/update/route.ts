import { NextResponse } from "next/server";
import { refreshBotUsername } from "@/lib/telegram/botHandle";

export async function POST() {
  try {
    const { username, previous } = await refreshBotUsername();
    return NextResponse.json({ username: `@${username}`, previous: `@${previous}`, changed: username !== previous });
  } catch (error) {
    console.error("[api/books/bot/update]", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
