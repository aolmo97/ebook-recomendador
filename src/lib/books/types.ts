import { Source } from "@/generated/prisma/client";

export interface NormalizedBook {
  source: Source;
  sourceId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  language: string;
  genres: string[];
  synopsis: string | null;
  urlEpub: string;
}

export function toBookId(book: Pick<NormalizedBook, "source" | "sourceId">): string {
  return `${book.source}:${book.sourceId}`;
}

export function parseBookId(id: string): { source: Source; sourceId: string } | null {
  const separatorIndex = id.indexOf(":");
  if (separatorIndex === -1) return null;

  const source = id.slice(0, separatorIndex);
  const sourceId = id.slice(separatorIndex + 1);
  if (!sourceId || !Object.values(Source).includes(source as Source)) return null;

  return { source: source as Source, sourceId };
}
