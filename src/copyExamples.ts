import type * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { extractDirectory } from "./zip";
import { toErrorMessage } from "./utils";

export async function copyExamples(
  api: typeof vscode,
  runtimeDir: string
): Promise<void> {
  const folders = await api.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Copy Examples Here",
  });
  if (!folders?.length) return;
  const parent = folders[0].fsPath;
  const destination = path.join(parent, "pyxel_examples");

  let staged: string | undefined;
  try {
    staged = await fs.promises.mkdtemp(path.join(parent, ".pyxel_examples-"));
    await extractExamples(runtimeDir, staged);
    if (fs.existsSync(destination)) {
      const choice = await api.window.showWarningMessage(
        "Replace pyxel_examples and all changes you have made inside it?",
        { modal: true },
        "Replace"
      );
      if (choice !== "Replace") return;
    }
    replaceExamplesDirectory(staged, destination);
  } catch (error: unknown) {
    api.window.showErrorMessage(`Failed to copy examples: ${toErrorMessage(error)}`);
    return;
  } finally {
    if (staged) fs.rmSync(staged, { recursive: true, force: true });
  }

  const choice = await api.window.showInformationMessage(
    "Copied the Pyxel examples.", "Open Hello Pyxel"
  );
  if (choice) {
    await api.window.showTextDocument(api.Uri.file(path.join(destination, "01_hello_pyxel.py")));
  }
}

async function extractExamples(runtimeDir: string, destination: string): Promise<void> {
  const wheels = (await fs.promises.readdir(runtimeDir)).filter((name) => name.endsWith(".whl"));
  if (wheels.length !== 1) throw new Error("Expected one bundled Pyxel wheel.");
  await extractDirectory(path.join(runtimeDir, wheels[0]), "pyxel/examples", destination,
    (name) => name !== "99_flip_animation.py" && !name.split("/").includes("__pycache__"));
  // Check the introductory example before offering to replace an existing copy.
  await fs.promises.access(path.join(destination, "01_hello_pyxel.py"));
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
