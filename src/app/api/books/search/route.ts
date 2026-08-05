import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import { searchBook, sendFollowUp, type BookSearchResult } from "@/lib/telegram/bookSearch";

function errorResponse(result: BookSearchResult) {
  switch (result.status) {
    case "no_results":
      return NextResponse.json({ error: "No se encontró el libro", raw: result.raw }, { status: 404 });
    case "timeout":
      return NextResponse.json({ error: "Timeout esperando respuesta del bot de Telegram" }, { status: 504 });
    case "error":
      return NextResponse.json({ error: result.error ?? "Error desconocido" }, { status: 502 });
    default:
      return NextResponse.json({ error: "Respuesta inesperada", result }, { status: 502 });
  }
}

function serveEpub(filePath: string, fileName: string) {
  const file = fs.readFileSync(filePath);
  fs.unlink(filePath, () => {});
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "Falta parámetro q" }, { status: 400 });
  }

  try {
    let result = await searchBook(q);

    if (result.status === "candidates") {
      const candidates = result.candidates ?? [];
      if (candidates.length === 0) {
        return NextResponse.json({ error: "No se encontró el libro", raw: result.raw }, { status: 404 });
      }
      // Cogemos el candidato cuyo título coincida mejor con la búsqueda; si no,
      // el primero de la lista. Para elegir a mano, se puede exponer luego un
      // ?candidates=1 que devuelva la lista sin encadenar el follow-up.
      const normalized = q.toLowerCase();
      const best =
        candidates.find((c) => c.label.toLowerCase().includes(normalized)) ?? candidates[0];
      result = await sendFollowUp(best.command, q);
    }

    if (result.status === "document" && result.filePath) {
      return serveEpub(result.filePath, result.fileName ?? `${q}.epub`);
    }

    return errorResponse(result);
  } catch (error) {
    console.error("[api/books/search]", error);
    return NextResponse.json({ error: "Error interno consultando Telegram" }, { status: 500 });
  }
}
