import * as vscode from "vscode";
import * as path from "path";
import { saveCapture } from "./fileOutput";
import { PyxelWebviewManager } from "./pyxelWebview";
import {
  collectFiles,
  isPyxelRunnable,
  isWatchedFile,
  toErrorMessage,
} from "./utils";

const RELOAD_DEBOUNCE_MS = 200;

export class RunPanelController {
  private panel: vscode.WebviewPanel | undefined;
  private directory: string | undefined;
  private scriptName: string | undefined;
  private reloadTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly webviews: PyxelWebviewManager,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  dispose(): void {
    this.cancelPendingReload();
    this.panel?.dispose();
  }

  handleFileSave(filePath: string): void {
    if (this.directory && isWatchedFile(filePath, this.directory)) {
      this.scheduleReload();
    }
  }

  async run(uri?: vscode.Uri): Promise<void> {
    const filePath =
      uri?.fsPath ??
      vscode.window.activeTextEditor?.document.fileName;
    if (!isPyxelRunnable(filePath)) {
      vscode.window.showErrorMessage("Open a .py file to run with Pyxel.");
      return;
    }

    const directory = path.dirname(filePath);
    const scriptName = path.basename(filePath);
    let saved: boolean;
    try {
      saved = await this.saveDirtyDocuments(directory);
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        "Failed to save project files before running with Pyxel: " +
        toErrorMessage(error)
      );
      return;
    }
    if (!saved) {
      vscode.window.showErrorMessage(
        "Failed to save project files before running with Pyxel."
      );
      return;
    }

    this.directory = directory;
    this.scriptName = scriptName;
    const isNew = !this.panel;
    const panel = this.ensurePanel();
    panel.title = `Pyxel — ${scriptName}`;
    panel.reveal(isNew ? vscode.ViewColumn.Beside : undefined, true);
    if (!isNew) this.sendRunMessage(panel, directory, scriptName);
    this.cancelPendingReload();
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) return this.panel;

    const panel = vscode.window.createWebviewPanel(
      "pyxel.view",
      "Pyxel",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );
    this.panel = panel;
    this.webviews.initialize(
      panel,
      () => {
        if (this.directory && this.scriptName) {
          this.sendRunMessage(panel, this.directory, this.scriptName);
        }
      },
      (fileName, data) => saveCapture(this.directory, fileName, data)
    );
    panel.onDidDispose(() => {
      this.cancelPendingReload();
      this.panel = undefined;
      this.directory = undefined;
      this.scriptName = undefined;
    });
    return panel;
  }

  private scheduleReload(): void {
    if (!this.panel || !this.directory || !this.scriptName) return;
    const configuration = vscode.workspace.getConfiguration("pyxel");
    if (!configuration.get<boolean>("autoReload", true)) return;
    this.cancelPendingReload();
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      if (this.panel && this.directory && this.scriptName) {
        this.sendRunMessage(this.panel, this.directory, this.scriptName);
      }
    }, RELOAD_DEBOUNCE_MS);
  }

  private cancelPendingReload(): void {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = undefined;
  }

  private sendRunMessage(
    panel: vscode.WebviewPanel,
    directory: string,
    scriptName: string
  ): void {
    this.webviews.resetErrorState();
    this.outputChannel.appendLine(`--- Run ${scriptName} ---`);
    const { files, skipped } = collectFiles(directory);
    for (const entry of skipped) {
      this.outputChannel.appendLine(`Skipped ${entry}`);
    }
    this.webviews.post(panel.webview, { command: "run", scriptName, files });
  }

  private async saveDirtyDocuments(directory: string): Promise<boolean> {
    const documents = vscode.workspace.textDocuments.filter(
      (document) =>
        document.isDirty &&
        !document.isUntitled &&
        isWatchedFile(document.uri.fsPath, directory)
    );
    const results = await Promise.all(
      documents.map((document) => document.save())
    );
    return results.every(Boolean);
  }
}
