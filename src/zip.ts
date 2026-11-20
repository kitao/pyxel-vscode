import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { openPromise } from "yauzl";

// Both a Python wheel and a VSIX are ZIP archives with a known directory layout.
export async function extractDirectory(
  archivePath: string,
  directory: string,
  destination: string,
  include: (relativePath: string) => boolean = () => true
): Promise<void> {
  const prefix = directory + "/";
  const archive = await openPromise(archivePath, { strictFileNames: true });
  for await (const entry of archive.eachEntry()) {
    if (!entry.fileName.startsWith(prefix) || entry.fileName.endsWith("/")) continue;
    const relativePath = entry.fileName.slice(prefix.length);
    if (!include(relativePath)) continue;
    const target = path.join(destination, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    const input = await archive.openReadStreamPromise(entry);
    await pipeline(input, createWriteStream(target, { flags: "wx" }));
  }
}
