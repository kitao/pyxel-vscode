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
  private pendingRun: symbol | undefined;
  private nextSessionId = 0;
  private readonly captureDirectories = new Map<number, string>();

  constructor(
    private readonly webviews: PyxelWebviewManager,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  dispose(): void {
    this.pendingRun = undefined;
    this.cancelPendingReload();
    this.session?.panel.dispose();
    this.session = undefined;
    this.captureDirectories.clear();
  }

  handleFileSave(filePath: string): void {
    // Run sends one complete snapshot after all of its saves succeed.
    if (this.pendingRun) return;
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
    const request = Symbol();
    this.pendingRun = request;
    this.cancelPendingReload();
    let saved: boolean;
    try {
      saved = await this.saveDirtyDocuments(directory);
    } catch (error: unknown) {
      if (request !== this.pendingRun) return;
      this.pendingRun = undefined;
      vscode.window.showErrorMessage(
        "Failed to save project files before running with Pyxel: " +
        toErrorMessage(error)
      );
      return;
    }
    if (request !== this.pendingRun) return;
    this.pendingRun = undefined;
    if (!saved) {
      vscode.window.showErrorMessage(
        "Failed to save project files before running with Pyxel."
      );
      return;
    }

    const running = this.session?.panel;
    const panel = running ?? this.createPanel();
    const session = { directory, panel, scriptName };
    // Keep the current session if the requested script cannot be collected.
    if (running && !this.sendRunMessage(session)) return;
    this.session = session;
    panel.title = `Pyxel — ${scriptName}`;
    // Creation already opens a persistent tab. Revealing it again immediately
    // can race that first open and turn it into a replaceable preview tab.
    if (running) panel.reveal(undefined, true);
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
        if (this.session?.panel === panel) this.sendRunMessage(this.session);
      },
      (fileName, data, sessionId) => {
        if (sessionId === undefined) return;
        saveCapture(this.captureDirectories.get(sessionId), fileName, data);
      }
    );
    panel.onDidDispose(() => {
      this.pendingRun = undefined;
      this.cancelPendingReload();
      this.session = undefined;
      this.captureDirectories.clear();
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

  private sendRunMessage(session: RunSession): boolean {
    if (this.pendingRun) return false;
    this.outputChannel.appendLine(`--- Run ${session.scriptName} ---`);
    const { files, skipped } = collectFiles(session.directory);
    for (const entry of skipped) {
      this.outputChannel.appendLine(`Skipped ${entry}`);
    }
    if (!Object.hasOwn(files, session.scriptName)) {
      const message = `${session.scriptName} was not included in the Pyxel project. ` +
        "Check that the file exists and is within the project file limits. See Output > Pyxel for details.";
      this.outputChannel.appendLine(message);
      vscode.window.showErrorMessage(message);
      return false;
    }
    this.webviews.resetErrorState(session.panel.webview);
    const sessionId = this.nextSessionId++;
    this.captureDirectories.set(sessionId, session.directory);
    this.webviews.post(session.panel.webview, {
      command: "run",
      sessionId,
      scriptName: session.scriptName,
      files,
    });
    return true;
  }

  private async saveDirtyDocuments(directory: string): Promise<boolean> {
    const documents = vscode.workspace.textDocuments.filter(
      (document) =>
        document.isDirty &&
        !document.isUntitled &&
        isWatchedFile(document.uri.fsPath, directory)
    );
    // A rejected save must not leave sibling saves firing reload events later.
    const results = await Promise.allSettled(
      documents.map(async (document) => document.save())
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw new Error(toErrorMessage(failure.reason));
    return results.every((result) => result.status === "fulfilled" && result.value);
  }
}
