export type MangaSourceKey = "inmanga" | "manhwaweb";

export const MANGA_SOURCE_KEYS: MangaSourceKey[] = ["inmanga", "manhwaweb"];

export function isMangaSourceKey(value: string): value is MangaSourceKey {
  return (MANGA_SOURCE_KEYS as string[]).includes(value);
}

// Id público de serie = "fuente:idDeLaFuente", mismo patrón que toBookId/parseBookId
// en el módulo books (src/lib/books/types.ts), para soportar varias fuentes de
// manga a la vez sin que sus ids (GUIDs, slugs...) choquen entre sí.
export function encodeMangaId(source: MangaSourceKey, sourceId: string): string {
  return `${source}:${sourceId}`;
}

export function parseMangaId(id: string): { source: MangaSourceKey; sourceId: string } | null {
  const separatorIndex = id.indexOf(":");
  if (separatorIndex === -1) return null;

  const source = id.slice(0, separatorIndex);
  const sourceId = id.slice(separatorIndex + 1);
  if (!sourceId || !isMangaSourceKey(source)) return null;

  return { source, sourceId };
}
