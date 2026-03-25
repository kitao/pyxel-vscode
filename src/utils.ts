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
