import type * as vscode from "vscode";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import { PYXEL_VERSION } from "./utils";

export const EXAMPLES_PREFIX = "python/pyxel/examples/";
const CDN_BASE = `https://cdn.jsdelivr.net/gh/kitao/pyxel@v${PYXEL_VERSION}`;

type VsCodeApi = typeof vscode;

export function getExamplesTreeUrl(): string {
  return `https://api.github.com/repos/kitao/pyxel/git/trees/v${PYXEL_VERSION}?recursive=1`;
}

export function isRedirectStatus(statusCode: number | undefined): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 ||
    statusCode === 307 || statusCode === 308;
}

export function resolveRedirectUrl(currentUrl: string, location: string): string {
  return new URL(location, currentUrl).toString();
}

export function selectExampleFiles(treeJson: unknown): string[] {
  if (!treeJson || typeof treeJson !== "object" ||
      !Array.isArray((treeJson as { tree?: unknown }).tree)) {
    throw new Error("Invalid GitHub tree response");
  }

  return (treeJson as { tree: unknown[] }).tree.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { path: entryPath, type } = entry as { path?: unknown; type?: unknown };
    if (type !== "blob" || typeof entryPath !== "string") return [];
    if (!entryPath.startsWith(EXAMPLES_PREFIX)) return [];
    if (entryPath.includes("__pycache__")) return [];
    return [entryPath];
  });
}

export function httpsGet(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error("Too many redirects"));
      return;
    }

    const opts = { headers: { "User-Agent": "pyxel-vscode" } };
    https.get(url, opts, (res) => {
      if (isRedirectStatus(res.statusCode)) {
        res.resume();
        const location = res.headers.location;
        if (!location) {
          reject(new Error(`Redirect missing Location for ${url}`));
          return;
        }
        httpsGet(resolveRedirectUrl(url, location), maxRedirects - 1)
          .then(resolve, reject);
        return;
      }

      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export async function copyExamples(vscodeApi: VsCodeApi): Promise<void> {
  const folders = await vscodeApi.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Copy Examples Here",
  });
  if (!folders || folders.length === 0) return;
  const targetDir = folders[0].fsPath;

  await vscodeApi.window.withProgress(
    {
      location: vscodeApi.ProgressLocation.Notification,
      title: "Copying Pyxel examples...",
    },
    async () => {
      try {
        const treeJson = JSON.parse((await httpsGet(getExamplesTreeUrl())).toString());
        const files = selectExampleFiles(treeJson);

        const examplesDir = path.join(targetDir, "pyxel_examples");
        fs.rmSync(examplesDir, { recursive: true, force: true });
        fs.mkdirSync(examplesDir, { recursive: true });

        await Promise.all(files.map(async (file) => {
          const relPath = file.slice(EXAMPLES_PREFIX.length);
          const data = await httpsGet(`${CDN_BASE}/${file}`);
          const filePath = path.join(examplesDir, relPath);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, data);
        }));

        vscodeApi.window.showInformationMessage(
          `Copied ${files.length} example files.`
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        vscodeApi.window.showErrorMessage(
          `Failed to copy examples: ${message}`
        );
      }
    }
  );
}
