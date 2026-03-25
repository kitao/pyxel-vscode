import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export const PYXEL_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/kitao/pyxel@main/wasm";
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

export function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function collectFiles(rootDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  let totalSize = 0;

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || totalSize > MAX_TOTAL_SIZE) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
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
        walk(fullPath, depth + 1);
      } else if (stat.isFile() && stat.size <= MAX_FILE_SIZE) {
        totalSize += stat.size;
        if (totalSize > MAX_TOTAL_SIZE) return;
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
        files[relPath] = fs.readFileSync(fullPath).toString("base64");
      }
    }
  }
  walk(rootDir, 0);
  return files;
}
