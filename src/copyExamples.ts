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

const REQUEST_TIMEOUT_MS = 30 * 1000;

export function httpsGet(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error("Too many redirects"));
      return;
    }

    const opts = { headers: { "User-Agent": "pyxel-vscode" } };
    const req = https.get(url, opts, (res) => {
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
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out for ${url}`));
    });
    req.on("error", reject);
  });
}

const DOWNLOAD_CONCURRENCY = 8;

export async function copyExamples(vscodeApi: VsCodeApi): Promise<void> {
  const folders = await vscodeApi.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Copy Examples Here",
  });
  if (!folders || folders.length === 0) return;
  const targetDir = folders[0].fsPath;
  const examplesDir = path.join(targetDir, "pyxel_examples");

  if (fs.existsSync(examplesDir)) {
    const choice = await vscodeApi.window.showWarningMessage(
      "The folder pyxel_examples already exists here. Replace it?",
      { modal: true },
      "Replace"
    );
    if (choice !== "Replace") return;
  }

  await vscodeApi.window.withProgress(
    {
      location: vscodeApi.ProgressLocation.Notification,
      title: "Copying Pyxel examples...",
      cancellable: true,
    },
    async (_progress, token) => {
      // Download into a temp dir, then swap in atomically so the existing
      // examples survive a failed or cancelled copy.
      let tmpDir: string | undefined;
      try {
        tmpDir = fs.mkdtempSync(path.join(targetDir, ".pyxel_examples-"));
        const treeJson = JSON.parse((await httpsGet(getExamplesTreeUrl())).toString());
        const files = selectExampleFiles(treeJson);
        await downloadAll(files, tmpDir, token);
        if (token.isCancellationRequested) return;
        fs.rmSync(examplesDir, { recursive: true, force: true });
        fs.renameSync(tmpDir, examplesDir);
        vscodeApi.window.showInformationMessage(
          `Copied ${files.length} example files.`
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        vscodeApi.window.showErrorMessage(
          `Failed to copy examples: ${message}`
        );
      } finally {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  );
}

// Download files into destDir with bounded concurrency, honoring cancellation.
async function downloadAll(
  files: string[],
  destDir: string,
  token: vscode.CancellationToken
): Promise<void> {
  let next = 0;
  let aborted = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!aborted && next < files.length && !token.isCancellationRequested) {
      const file = files[next++];
      try {
        const data = await httpsGet(`${CDN_BASE}/${file}`);
        const filePath = path.join(destDir, file.slice(EXAMPLES_PREFIX.length));
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, data);
      } catch (e: unknown) {
        if (!aborted) {
          aborted = true;
          firstError = e;
        }
        return;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(DOWNLOAD_CONCURRENCY, files.length) },
    () => worker()
  );
  await Promise.all(workers);
  if (aborted) throw firstError;
}
