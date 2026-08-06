import { ZipArchive } from "archiver";

function detectExtension(buffer: Buffer): string {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.subarray(0, 3).toString("ascii") === "GIF") return "gif";
  return "jpg";
}

/** Empaqueta las imágenes (en orden) en un .cbz y devuelve el buffer resultante. */
export async function buildCbz(images: Buffer[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    images.forEach((image, index) => {
      const name = `${String(index + 1).padStart(3, "0")}.${detectExtension(image)}`;
      archive.append(image, { name });
    });

    archive.finalize();
  });
}
