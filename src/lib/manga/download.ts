import pLimit from "p-limit";
import type { MangaImageRequest } from "./types";

const CONCURRENCY = 4;
const MAX_RETRIES = 3;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadOne(image: MangaImageRequest): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(image.url, {
        headers: {
          "User-Agent": USER_AGENT,
          ...(image.referer ? { Referer: image.referer } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(300 * attempt);
    }
  }
  throw new Error(`No se pudo descargar ${image.url}: ${String(lastError)}`);
}

/** Descarga las imágenes en orden, con límite de concurrencia y reintentos. */
export async function downloadChapterImages(images: MangaImageRequest[]): Promise<Buffer[]> {
  const limit = pLimit(CONCURRENCY);
  return Promise.all(images.map((image) => limit(() => downloadOne(image))));
}
