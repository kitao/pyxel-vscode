import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export const PYXEL_VERSION = "2.9.8";
export const PYXEL_CDN_BASE =
  `https://cdn.jsdelivr.net/gh/kitao/pyxel@v${PYXEL_VERSION}/wasm`;
export const PYXEL_API_REFERENCE_URL =
  "https://kitao.github.io/pyxel/web/api-reference/";
export const PYXEL_EDITOR_MANUAL_URL =
  "https://kitao.github.io/pyxel/web/editor-manual/";

export const SKIP_DIRS = new Set([
  ".git", "__pycache__", "node_modules", ".venv", "venv", ".tox", ".mypy_cache",
]);
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
export const MAX_DEPTH = 3;

export interface CollectedFiles {
  files: Record<string, string>;
  skipped: string[];
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isPyxelRunnable(
  filePath: string | undefined
): filePath is string {
  return !!filePath && filePath.endsWith(".py");
}

// Reject file names that could escape the destination directory.
export function isSafeFileName(fileName: string): boolean {
  return (
    fileName.length > 0 &&
    fileName !== "." &&
    fileName !== ".." &&
    !fileName.includes("/") &&
    !fileName.includes("\\") &&
    fileName === path.basename(fileName)
  );
}

// Whether a saved path can affect the files collected for the running project.
export function isWatchedFile(savedPath: string, rootDir: string): boolean {
  const relPath = path.relative(rootDir, savedPath);
  if (!relPath || relPath.startsWith("..") || path.isAbsolute(relPath)) {
    return false;
  }
  const parts = relPath.split(path.sep);
  const directoryDepth = parts.length - 1;
  return (
    directoryDepth <= MAX_DEPTH &&
    parts.every((part) => !part.startsWith(".") && !SKIP_DIRS.has(part))
  );
}

export function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function collectFiles(rootDir: string): CollectedFiles {
  const files: Record<string, string> = {};
  const skipped: string[] = [];
  let totalSize = 0;
  let truncated = false;

  const rel = (fullPath: string) =>
    path.relative(rootDir, fullPath).split(path.sep).join("/");

  function walk(dir: string, depth: number): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir).sort();
    } catch (error: unknown) {
      const directory = rel(dir) || ".";
      skipped.push(
        `${directory}/ (could not be read: ${toErrorMessage(error)})`
      );
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(fullPath);
      } catch (error: unknown) {
        skipped.push(
          `${rel(fullPath)} (could not be inspected: ${toErrorMessage(error)})`
        );
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (depth >= MAX_DEPTH) {
          skipped.push(
            `${rel(fullPath)}/ (exceeds depth limit of ${MAX_DEPTH})`
          );
          continue;
        }
        walk(fullPath, depth + 1);
      } else if (stat.isFile()) {
        if (stat.size > MAX_FILE_SIZE) {
          const limit = MAX_FILE_SIZE / 1024 / 1024;
          skipped.push(`${rel(fullPath)} (exceeds ${limit} MB file limit)`);
          continue;
        }
        if (totalSize + stat.size > MAX_TOTAL_SIZE) {
          truncated = true;
          const limit = MAX_TOTAL_SIZE / 1024 / 1024;
          skipped.push(
            `${rel(fullPath)} and remaining files ` +
            `(exceeds ${limit} MB total limit)`
          );
          return;
        }
        let data: Buffer;
        try {
          data = fs.readFileSync(fullPath);
        } catch (error: unknown) {
          skipped.push(
            `${rel(fullPath)} ` +
            `(could not be read: ${toErrorMessage(error)})`
          );
          continue;
        }
        totalSize += stat.size;
        files[rel(fullPath)] = data.toString("base64");
      }
    }
  }
  walk(rootDir, 0);
  return { files, skipped };
}
