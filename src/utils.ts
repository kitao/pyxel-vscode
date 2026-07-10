import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export const PYXEL_VERSION = "2.9.6";
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

export function isPyxelRunnable(filePath: string | undefined): filePath is string {
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

// Whether a saved file is part of what collectFiles would bundle.
export function isWatchedFile(savedPath: string, rootDir: string): boolean {
  const relPath = path.relative(rootDir, savedPath);
  if (!relPath || relPath.startsWith("..") || path.isAbsolute(relPath)) return false;
  return relPath
    .split(path.sep)
    .every((part) => !part.startsWith(".") && !SKIP_DIRS.has(part));
}

export function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export interface CollectedFiles {
  files: Record<string, string>;
  skipped: string[];
}

export function collectFiles(rootDir: string): CollectedFiles {
  const files: Record<string, string> = {};
  const skipped: string[] = [];
  let totalSize = 0;
  let truncated = false;

  const rel = (fullPath: string) =>
    path.relative(rootDir, fullPath).replace(/\\/g, "/");

  function walk(dir: string, depth: number) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (depth >= MAX_DEPTH) {
          skipped.push(`${rel(fullPath)}/ (exceeds depth limit of ${MAX_DEPTH})`);
          continue;
        }
        walk(fullPath, depth + 1);
      } else if (stat.isFile()) {
        if (stat.size > MAX_FILE_SIZE) {
          skipped.push(`${rel(fullPath)} (exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB file limit)`);
          continue;
        }
        if (totalSize + stat.size > MAX_TOTAL_SIZE) {
          truncated = true;
          skipped.push(`${rel(fullPath)} and remaining files (exceeds ${MAX_TOTAL_SIZE / 1024 / 1024} MB total limit)`);
          return;
        }
        totalSize += stat.size;
        files[rel(fullPath)] = fs.readFileSync(fullPath).toString("base64");
      }
    }
  }
  walk(rootDir, 0);
  return { files, skipped };
}
