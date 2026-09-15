import * as crypto from "crypto";
import * as path from "path";

export const PYXEL_VERSION = "2.9.9";
export const PYXEL_CDN_BASE =
  `https://cdn.jsdelivr.net/gh/kitao/pyxel@v${PYXEL_VERSION}/wasm`;
export const PYXEL_API_REFERENCE_URL =
  "https://kitao.github.io/pyxel/web/api-reference/";
export const PYXEL_EDITOR_MANUAL_URL =
  "https://kitao.github.io/pyxel/web/editor-manual/";

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

export function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
