import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  PYXEL_API_REFERENCE_URL, PYXEL_EDITOR_MANUAL_URL,
  isPyxelRunnable, isSafeFileName, isWatchedFile, collectFiles,
} from "./utils";
import { HostToWebviewMessage, parseWebviewMessage } from "./messages";
import { getWebviewHtml } from "./webviewHtml";
import { copyExamples } from "./copyExamples";

// Mutable state
let outputChannel: vscode.OutputChannel;
let runPanel: vscode.WebviewPanel | undefined;
let lastRunDir: string | undefined;
let lastRunScript: string | undefined;
let activePyxelWebview: vscode.Webview | undefined;
let errorPanelShown = false;
let reloadTimer: NodeJS.Timeout | undefined;

const RELOAD_DEBOUNCE_MS = 200;

interface ForwardKeyArgs {
  code: string;
  key: string;
  shift?: boolean;
}

function isForwardKeyArgs(args: unknown): args is ForwardKeyArgs {
  if (!args || typeof args !== "object") return false;
  const value = args as { code?: unknown; key?: unknown };
  return typeof value.code === "string" && typeof value.key === "string";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Pyxel");

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand("pyxel.run", runPyxel),
    vscode.commands.registerCommand("pyxel.newResource", newResource),
    vscode.commands.registerCommand("pyxel.copyExamples", () => copyExamples(vscode)),
    vscode.commands.registerCommand(
      "pyxel.apiReference",
      createIframeCommand("pyxel.apiReference", "Pyxel API Reference", PYXEL_API_REFERENCE_URL)
    ),
    vscode.commands.registerCommand(
      "pyxel.editorManual",
      createIframeCommand("pyxel.editorManual", "Pyxel Editor Manual", PYXEL_EDITOR_MANUAL_URL)
    ),
    vscode.commands.registerCommand("pyxel.forwardKey", (args: unknown) => {
      if (!isForwardKeyArgs(args)) return;
      if (!activePyxelWebview) return;
      postToWebview(activePyxelWebview, {
        command: "key", code: args.code, key: args.key, shift: !!args.shift,
      });
    })
  );
  const editorOpts = { webviewOptions: { retainContextWhenHidden: true } };
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "pyxel.editor", new PyxelFileProvider(), editorOpts
    ),
    vscode.window.registerCustomEditorProvider(
      "pyxel.player", new PyxelFileProvider(), editorOpts
    )
  );

  // Auto-reload on file save (run mode only)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (lastRunDir && isWatchedFile(doc.uri.fsPath, lastRunDir)) {
        scheduleReload();
      }
    })
  );
}

export function deactivate() {
  runPanel?.dispose();
}

// --- Iframe panel factory ---

function createIframeCommand(
  viewType: string, title: string, url: string
): () => void {
  let panel: vscode.WebviewPanel | undefined;
  return () => {
    if (panel) { panel.reveal(); return; }
    panel = vscode.window.createWebviewPanel(
      viewType, title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true }
    );
    panel.webview.html = `<!doctype html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; frame-src https://kitao.github.io; style-src 'unsafe-inline';">
<style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:none;overflow:hidden;display:block;}</style>
</head><body>
<iframe src="${url}"></iframe>
</body></html>`;
    panel.onDidDispose(() => { panel = undefined; });
  };
}

// --- Panel utilities ---

function postToWebview(webview: vscode.Webview, msg: HostToWebviewMessage): void {
  webview.postMessage(msg);
}

// Log a webview error; pop the output panel only once per run/session.
function reportWebviewError(message: string): void {
  outputChannel.appendLine(message);
  if (!errorPanelShown) {
    errorPanelShown = true;
    outputChannel.show(true);
  }
}

function trackPanel(panel: vscode.WebviewPanel) {
  if (panel.active) activePyxelWebview = panel.webview;
  panel.onDidChangeViewState(() => {
    if (panel.active) activePyxelWebview = panel.webview;
  });
  panel.onDidDispose(() => {
    if (activePyxelWebview === panel.webview) {
      activePyxelWebview = undefined;
    }
  });
}

function initPyxelWebview(
  panel: vscode.WebviewPanel,
  onReady: () => void,
  onSaved?: (fileName: string, data: string) => void
): void {
  panel.webview.options = { enableScripts: true };
  panel.webview.html = getWebviewHtml();
  trackPanel(panel);

  panel.webview.onDidReceiveMessage((raw: unknown) => {
    const msg = parseWebviewMessage(raw);
    if (!msg) {
      outputChannel.appendLine("Ignored malformed message from webview.");
      return;
    }
    if (msg.command === "ready") {
      onReady();
    } else if (msg.command === "title") {
      panel.title = msg.title;
    } else if (msg.command === "error") {
      reportWebviewError(msg.message);
    } else if (msg.command === "saved" && onSaved) {
      if (!isSafeFileName(msg.fileName)) {
        outputChannel.appendLine(`Ignored save request with unsafe file name: ${msg.fileName}`);
        return;
      }
      onSaved(msg.fileName, msg.data);
    }
  });
}

// Write the edited resource back to its original file on disk.
function writeResource(filePath: string, data: string): void {
  try {
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`Failed to save: ${errorMessage(e)}`);
    return;
  }
  // Editor saves bypass onDidSaveTextDocument, so reload explicitly.
  if (lastRunDir && isWatchedFile(filePath, lastRunDir)) {
    scheduleReload();
  }
}

// Persist a Pyxel capture (screenshot, screencast, image/palette dump) next to
// the running game, then point the user at the file.
function saveCapture(dir: string | undefined, fileName: string, data: string): void {
  if (!dir) return;
  const dest = path.join(dir, fileName);
  try {
    fs.writeFileSync(dest, Buffer.from(data, "base64"));
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`Failed to save ${fileName}: ${errorMessage(e)}`);
    return;
  }
  const shown = vscode.workspace.asRelativePath(dest);
  vscode.window
    .showInformationMessage(`Saved: ${shown}`, "Open", "Reveal in Explorer")
    .then((choice) => {
      const uri = vscode.Uri.file(dest);
      if (choice === "Open") {
        vscode.commands.executeCommand("vscode.open", uri);
      } else if (choice === "Reveal in Explorer") {
        vscode.commands.executeCommand("revealFileInOS", uri);
      }
    });
}

// --- Run panel management ---

// Debounced reload so Save All triggers a single re-run.
function scheduleReload(): void {
  if (!runPanel || !lastRunDir || !lastRunScript) return;
  const config = vscode.workspace.getConfiguration("pyxel");
  if (!config.get<boolean>("autoReload", true)) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined;
    if (runPanel && lastRunDir && lastRunScript) {
      sendRunMessage(runPanel, lastRunDir, lastRunScript);
    }
  }, RELOAD_DEBOUNCE_MS);
}

function cancelPendingReload(): void {
  clearTimeout(reloadTimer);
  reloadTimer = undefined;
}

function ensureRunPanel(): vscode.WebviewPanel {
  if (runPanel) return runPanel;

  runPanel = vscode.window.createWebviewPanel(
    "pyxel.view",
    "Pyxel",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  initPyxelWebview(
    runPanel,
    () => {
      if (lastRunDir && lastRunScript) {
        sendRunMessage(runPanel!, lastRunDir, lastRunScript);
      }
    },
    (fileName, data) => saveCapture(lastRunDir, fileName, data)
  );

  runPanel.onDidDispose(() => {
    cancelPendingReload();
    runPanel = undefined;
    lastRunDir = undefined;
    lastRunScript = undefined;
  });

  return runPanel;
}

// --- Commands ---

async function runPyxel(uri?: vscode.Uri) {
  let filePath: string | undefined;
  if (uri) {
    filePath = uri.fsPath;
  } else {
    const editor = vscode.window.activeTextEditor;
    if (editor) filePath = editor.document.fileName;
  }
  if (!isPyxelRunnable(filePath)) {
    vscode.window.showErrorMessage("Open a .py file to run with Pyxel.");
    return;
  }
  const runDir = path.dirname(filePath);
  const runScript = path.basename(filePath);
  lastRunDir = runDir;
  lastRunScript = runScript;
  await saveDirtyDocuments(runDir);
  const isNew = !runPanel;
  const panel = ensureRunPanel();
  panel.title = `Pyxel — ${runScript}`;
  panel.reveal(isNew ? vscode.ViewColumn.Beside : undefined, true);
  if (!isNew) sendRunMessage(panel, runDir, runScript);
  // The saves above fire save events; this run supersedes their reload.
  cancelPendingReload();
}

// Save dirty documents under dir so the run picks up in-editor changes.
async function saveDirtyDocuments(dir: string): Promise<void> {
  const dirty = vscode.workspace.textDocuments.filter(
    (doc) => doc.isDirty && !doc.isUntitled && isWatchedFile(doc.uri.fsPath, dir)
  );
  await Promise.all(dirty.map((doc) => doc.save()));
}

async function newResource() {
  const uri = await vscode.window.showSaveDialog({
    filters: { "Pyxel Resource": ["pyxres"] },
  });
  if (!uri) return;
  await vscode.commands.executeCommand("vscode.open", uri);
}

// --- Custom editor provider for .pyxres and .pyxapp ---

class PyxelFileProvider implements vscode.CustomReadonlyEditorProvider {

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const filePath = document.uri.fsPath;
    const isEdit = path.extname(filePath) === ".pyxres";
    const fileDir = path.dirname(filePath);

    initPyxelWebview(
      webviewPanel,
      () => {
        if (isEdit) sendEditMessage(webviewPanel, filePath);
        else sendPlayMessage(webviewPanel, filePath);
      },
      (fileName, data) => {
        // The editor's Save button writes the resource itself back to disk;
        // anything else (screenshots, dumps) is treated as a capture.
        if (isEdit && fileName === path.basename(filePath)) {
          writeResource(filePath, data);
        } else {
          saveCapture(fileDir, fileName, data);
        }
      }
    );
  }
}

// --- Message senders ---

function sendRunMessage(
  target: vscode.WebviewPanel, rootDir: string, scriptName: string
) {
  errorPanelShown = false;
  outputChannel.appendLine(`--- Run ${scriptName} ---`);
  const { files, skipped } = collectFiles(rootDir);
  for (const entry of skipped) {
    outputChannel.appendLine(`Skipped ${entry}`);
  }
  postToWebview(target.webview, { command: "run", scriptName, files });
}

function sendEditMessage(target: vscode.WebviewPanel, filePath: string) {
  errorPanelShown = false;
  const fileName = path.basename(filePath);
  try {
    const fileData = fs.existsSync(filePath)
      ? fs.readFileSync(filePath).toString("base64")
      : null;
    const palPath = filePath.replace(/\.pyxres$/, ".pyxpal");
    const palData = fs.existsSync(palPath)
      ? fs.readFileSync(palPath).toString("base64")
      : null;
    postToWebview(target.webview, { command: "edit", fileName, fileData, palData });
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`Failed to read ${fileName}: ${errorMessage(e)}`);
  }
}

function sendPlayMessage(target: vscode.WebviewPanel, filePath: string) {
  errorPanelShown = false;
  const fileName = path.basename(filePath);
  try {
    const fileData = fs.readFileSync(filePath).toString("base64");
    postToWebview(target.webview, { command: "play", fileName, fileData });
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`Failed to read ${fileName}: ${errorMessage(e)}`);
  }
}
