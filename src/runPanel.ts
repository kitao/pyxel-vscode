import * as vscode from "vscode";
import * as path from "path";
import { saveCapture } from "./fileOutput";
import { collectFiles, isWatchedFile } from "./projectFiles";
import { PyxelWebviewManager } from "./pyxelWebview";
import { isPyxelRunnable, toErrorMessage } from "./utils";

const RELOAD_DEBOUNCE_MS = 200;

// What the panel is currently running. The three belong together: the panel
// cannot reload without knowing the script, and neither outlives the panel.
interface RunSession {
  directory: string;
  panel: vscode.WebviewPanel;
  scriptName: string;
}

export class RunPanelController {
  private session: RunSession | undefined;
  private reloadTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly webviews: PyxelWebviewManager,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  dispose(): void {
    this.cancelPendingReload();
    this.session?.panel.dispose();
  }

  handleFileSave(filePath: string): void {
    const session = this.session;
    if (session && isWatchedFile(filePath, session.directory)) {
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

    const running = this.session?.panel;
    const panel = running ?? this.createPanel();
    const session = { directory, panel, scriptName };
    this.session = session;
    panel.title = `Pyxel — ${scriptName}`;
    panel.reveal(running ? undefined : vscode.ViewColumn.Beside, true);
    // A new panel sends the project itself once the Webview reports ready.
    if (running) this.sendRunMessage(session);
    this.cancelPendingReload();
  }

  private createPanel(): vscode.WebviewPanel {
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
    this.webviews.initialize(
      panel,
      () => {
        if (this.session) this.sendRunMessage(this.session);
      },
      (fileName, data) => saveCapture(this.session?.directory, fileName, data)
    );
    panel.onDidDispose(() => {
      this.cancelPendingReload();
      this.session = undefined;
    });
    return panel;
  }

  private scheduleReload(): void {
    const configuration = vscode.workspace.getConfiguration("pyxel");
    if (!configuration.get<boolean>("autoReload", true)) return;
    this.cancelPendingReload();
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      if (this.session) this.sendRunMessage(this.session);
    }, RELOAD_DEBOUNCE_MS);
  }

  private cancelPendingReload(): void {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = undefined;
  }

  private sendRunMessage(session: RunSession): void {
    this.webviews.resetErrorState(session.panel.webview);
    this.outputChannel.appendLine(`--- Run ${session.scriptName} ---`);
    const { files, skipped } = collectFiles(session.directory);
    for (const entry of skipped) {
      this.outputChannel.appendLine(`Skipped ${entry}`);
    }
    this.webviews.post(session.panel.webview, {
      command: "run",
      scriptName: session.scriptName,
      files,
    });
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
