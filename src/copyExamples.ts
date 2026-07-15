import type * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { httpsGet } from "./http";
import { PYXEL_VERSION, toErrorMessage } from "./utils";

export const EXAMPLES_PREFIX = "python/pyxel/examples/";
const CDN_BASE = `https://cdn.jsdelivr.net/gh/kitao/pyxel@v${PYXEL_VERSION}`;
const DOWNLOAD_CONCURRENCY = 8;

type VsCodeApi = typeof vscode;

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
      // Keep the existing examples until the replacement is ready.
      let tmpDir: string | undefined;
      try {
        tmpDir = fs.mkdtempSync(path.join(targetDir, ".pyxel_examples-"));
        const treeJson = JSON.parse(
          (await httpsGet(getExamplesTreeUrl(), 5, token)).toString()
        );
        const files = selectExampleFiles(treeJson);
        await downloadAll(files, tmpDir, token);
        if (token.isCancellationRequested) return;
        replaceExamplesDirectory(tmpDir, examplesDir);
        vscodeApi.window.showInformationMessage(
          `Copied ${files.length} example files.`
        );
      } catch (error: unknown) {
        if (token.isCancellationRequested) return;
        vscodeApi.window.showErrorMessage(
          `Failed to copy examples: ${toErrorMessage(error)}`
        );
      } finally {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  );
}

export function getExamplesTreeUrl(): string {
  return `https://api.github.com/repos/kitao/pyxel/git/trees/v${PYXEL_VERSION}?recursive=1`;
}

export function selectExampleFiles(treeJson: unknown): string[] {
  if (
    !treeJson ||
    typeof treeJson !== "object" ||
    !Array.isArray((treeJson as { tree?: unknown }).tree)
  ) {
    throw new Error("Invalid GitHub tree response");
  }
  if ((treeJson as { truncated?: unknown }).truncated === true) {
    throw new Error("GitHub tree response is truncated");
  }

  const files = (treeJson as { tree: unknown[] }).tree.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { path: entryPath, type } = entry as {
      path?: unknown;
      type?: unknown;
    };
    if (type !== "blob" || typeof entryPath !== "string") return [];
    if (!entryPath.startsWith(EXAMPLES_PREFIX)) return [];
    if (entryPath.includes("__pycache__")) return [];
    if (entryPath.includes("\\")) return [];
    if (entryPath.split("/").some((part) => part === ".." || part === "")) {
      return [];
    }
    return [entryPath];
  });
  if (files.length === 0) {
    throw new Error("GitHub tree response contains no Pyxel examples");
  }
  return files;
}

function replaceExamplesDirectory(
  sourceDir: string,
  examplesDir: string
): void {
  let backupRoot: string | undefined;
  let backupDir: string | undefined;
  if (fs.existsSync(examplesDir)) {
    backupRoot = fs.mkdtempSync(
      path.join(path.dirname(examplesDir), ".pyxel_examples-backup-")
    );
    backupDir = path.join(backupRoot, path.basename(examplesDir));
    try {
      fs.renameSync(examplesDir, backupDir);
    } catch (error: unknown) {
      fs.rmSync(backupRoot, { recursive: true, force: true });
      throw error;
    }
  }

  try {
    fs.renameSync(sourceDir, examplesDir);
  } catch (error: unknown) {
    if (backupRoot && backupDir) {
      try {
        fs.renameSync(backupDir, examplesDir);
      } catch (restoreError: unknown) {
        throw new Error(
          `Failed to restore existing examples from ${backupDir}: ` +
          toErrorMessage(restoreError),
          { cause: error }
        );
      }
      fs.rmSync(backupRoot, { recursive: true, force: true });
    }
    throw error;
  }

  if (backupRoot) {
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

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
        const data = await httpsGet(`${CDN_BASE}/${file}`, 5, token);
        const filePath = path.join(destDir, file.slice(EXAMPLES_PREFIX.length));
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, data);
      } catch (error: unknown) {
        if (token.isCancellationRequested) return;
        if (!aborted) {
          aborted = true;
          firstError = error;
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
  if (token.isCancellationRequested) return;
  if (aborted) throw firstError;
}
