import type { NormalizedBook } from "./types";

const GUTENDEX_BASE_URL = "https://gutendex.com/books";

interface GutendexAuthor {
  name: string;
}

interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  summaries: string[];
  subjects: string[];
  languages: string[];
  formats: Record<string, string>;
}

interface GutendexListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
}

function formatAuthorName(name: string): string {
  const [last, first] = name.split(",").map((part) => part.trim());
  return first ? `${first} ${last}` : last;
}

function normalizeGutendexBook(raw: GutendexBook): NormalizedBook | null {
  const urlEpub = raw.formats["application/epub+zip"];
  if (!urlEpub) return null;

  return {
    source: "GUTENBERG",
    sourceId: String(raw.id),
    title: raw.title,
    author: raw.authors.map((a) => formatAuthorName(a.name)).join("; ") || "Desconocido",
    coverUrl: raw.formats["image/jpeg"] ?? null,
    language: raw.languages[0] ?? "und",
    genres: raw.subjects,
    synopsis: raw.summaries[0] ?? null,
    urlEpub,
  };
}

export interface SearchGutendexResult {
  books: NormalizedBook[];
  count: number;
  hasNext: boolean;
}

export async function searchGutendex(query: string, page = 1): Promise<SearchGutendexResult> {
  const url = new URL(GUTENDEX_BASE_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("page", String(page));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gutendex respondió ${response.status}`);
  }

  const data: GutendexListResponse = await response.json();
  const books = data.results
    .map(normalizeGutendexBook)
    .filter((book): book is NormalizedBook => book !== null);

  return { books, count: data.count, hasNext: data.next !== null };
}

export async function getGutendexBookById(id: string): Promise<NormalizedBook | null> {
  const response = await fetch(`${GUTENDEX_BASE_URL}/${id}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Gutendex respondió ${response.status}`);
  }

  const raw: GutendexBook = await response.json();
  return normalizeGutendexBook(raw);
}
