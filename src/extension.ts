import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as https from "https";
import {
  PYXEL_CDN_BASE, PYXEL_API_REFERENCE_URL, PYXEL_EDITOR_MANUAL_URL,
  isPyxelRunnable, getNonce, collectFiles,
} from "./utils";

// Mutable state
let outputChannel: vscode.OutputChannel;
let runPanel: vscode.WebviewPanel | undefined;
let lastRunDir: string | undefined;
let lastRunScript: string | undefined;
let activePyxelWebview: vscode.Webview | undefined;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Pyxel");

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand("pyxel.run", runPyxel),
    vscode.commands.registerCommand("pyxel.newResource", newResource),
    vscode.commands.registerCommand("pyxel.copyExamples", copyExamples),
    vscode.commands.registerCommand(
      "pyxel.apiReference",
      createIframeCommand("pyxel.apiReference", "Pyxel API Reference", PYXEL_API_REFERENCE_URL)
    ),
    vscode.commands.registerCommand(
      "pyxel.editorManual",
      createIframeCommand("pyxel.editorManual", "Pyxel Editor Manual", PYXEL_EDITOR_MANUAL_URL)
    ),
    vscode.commands.registerCommand("pyxel.forwardKey", (args: any) => {
      activePyxelWebview?.postMessage({
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
    vscode.workspace.onDidSaveTextDocument(() => {
      if (runPanel && lastRunDir && lastRunScript) {
        sendRunMessage(runPanel, lastRunDir, lastRunScript);
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
  onSaved?: (data: string) => void
): void {
  panel.webview.options = { enableScripts: true };
  panel.webview.html = getWebviewHtml();
  trackPanel(panel);

  panel.webview.onDidReceiveMessage((msg) => {
    if (msg.command === "ready") {
      onReady();
    } else if (msg.command === "title") {
      panel.title = msg.title;
    } else if (msg.command === "error") {
      outputChannel.appendLine(msg.message);
      outputChannel.show(true);
    } else if (msg.command === "saved" && onSaved) {
      onSaved(msg.data);
    }
  });
}

function saveHandler(filePath: string): (data: string) => void {
  return (data) => {
    try {
      fs.writeFileSync(filePath, Buffer.from(data, "base64"));
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to save: ${e.message}`);
    }
  };
}

// --- Run panel management ---

function ensureRunPanel(): vscode.WebviewPanel {
  if (runPanel) return runPanel;

  runPanel = vscode.window.createWebviewPanel(
    "pyxel.view",
    "Pyxel",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  initPyxelWebview(runPanel, () => {
    if (lastRunDir && lastRunScript) {
      sendRunMessage(runPanel!, lastRunDir, lastRunScript);
    }
  });

  runPanel.onDidDispose(() => {
    runPanel = undefined;
  });

  return runPanel;
}

// --- Commands ---

function runPyxel(uri?: vscode.Uri) {
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
  lastRunDir = path.dirname(filePath);
  lastRunScript = path.basename(filePath);
  const isNew = !runPanel;
  const panel = ensureRunPanel();
  panel.title = "Pyxel";
  panel.reveal(isNew ? vscode.ViewColumn.Beside : undefined, true);
  if (!isNew) sendRunMessage(panel, lastRunDir, lastRunScript);
}

async function newResource() {
  const uri = await vscode.window.showSaveDialog({
    filters: { "Pyxel Resource": ["pyxres"] },
  });
  if (!uri) return;
  await vscode.commands.executeCommand("vscode.open", uri);
}

// --- Copy examples ---

const GITHUB_TREE_URL =
  "https://api.github.com/repos/kitao/pyxel/git/trees/main?recursive=1";
const EXAMPLES_PREFIX = "python/pyxel/examples/";
const CDN_BASE = "https://cdn.jsdelivr.net/gh/kitao/pyxel";

function httpsGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const opts = { headers: { "User-Agent": "pyxel-vscode" } };
    https.get(url, opts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpsGet(res.headers.location!).then(resolve, reject);
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

async function copyExamples() {
  const folders = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Copy Examples Here",
  });
  if (!folders || folders.length === 0) return;
  const targetDir = folders[0].fsPath;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Copying Pyxel examples..." },
    async () => {
      try {
        const treeJson = JSON.parse((await httpsGet(GITHUB_TREE_URL)).toString());
        const files: { path: string }[] = treeJson.tree.filter(
          (f: any) =>
            f.type === "blob" &&
            f.path.startsWith(EXAMPLES_PREFIX) &&
            !f.path.includes("__pycache__")
        );

        const examplesDir = path.join(targetDir, "pyxel_examples");
        fs.rmSync(examplesDir, { recursive: true, force: true });
        fs.mkdirSync(examplesDir, { recursive: true });

        await Promise.all(files.map(async (file) => {
          const relPath = file.path.slice(EXAMPLES_PREFIX.length);
          const data = await httpsGet(`${CDN_BASE}/${file.path}`);
          const filePath = path.join(examplesDir, relPath);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, data);
        }));

        vscode.window.showInformationMessage(
          `Copied ${files.length} example files.`
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(
          `Failed to copy examples: ${e.message}`
        );
      }
    }
  );
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

    initPyxelWebview(
      webviewPanel,
      () => {
        if (isEdit) sendEditMessage(webviewPanel, filePath);
        else sendPlayMessage(webviewPanel, filePath);
      },
      isEdit ? saveHandler(filePath) : undefined
    );
  }
}

// --- Message senders ---

function sendRunMessage(
  target: vscode.WebviewPanel, rootDir: string, scriptName: string
) {
  target.webview.postMessage({
    command: "run", scriptName, files: collectFiles(rootDir),
  });
}

function sendEditMessage(target: vscode.WebviewPanel, filePath: string) {
  const fileName = path.basename(filePath);
  const fileData = fs.existsSync(filePath)
    ? fs.readFileSync(filePath).toString("base64")
    : null;
  const palPath = filePath.replace(/\.pyxres$/, ".pyxpal");
  const palData = fs.existsSync(palPath)
    ? fs.readFileSync(palPath).toString("base64")
    : null;
  target.webview.postMessage({ command: "edit", fileName, fileData, palData });
}

function sendPlayMessage(target: vscode.WebviewPanel, filePath: string) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath).toString("base64");
  target.webview.postMessage({ command: "play", fileName, fileData });
}

// --- WebView HTML ---

function getWebviewHtml(): string {
  const nonce = getNonce();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src https://cdn.jsdelivr.net;
      script-src 'nonce-${nonce}' https://cdn.jsdelivr.net 'unsafe-eval' 'unsafe-inline';
      style-src https://cdn.jsdelivr.net 'unsafe-inline';
      img-src https://cdn.jsdelivr.net data: blob:;
      connect-src https://cdn.jsdelivr.net blob: data:;
      worker-src blob:;
      font-src https://cdn.jsdelivr.net data:;
      child-src blob:;">
  <style>
    body {
      margin: 0;
      overflow: hidden;
      background: #000;
    }
    #pyxel-prompt {
      display: none !important;
    }
  </style>
</head>
<body>
  <script src="${PYXEL_CDN_BASE}/pyxel.js"></script>
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();

    // Forward console.error to VS Code output channel
    const _origConsoleError = console.error;
    console.error = (...args) => {
      _origConsoleError.apply(console, args);
      vscodeApi.postMessage({ command: "error", message: args.join(" ") });
    };

    window._vscodeNotifySave = function(b64Data) {
      vscodeApi.postMessage({ command: "saved", data: b64Data });
    };

    // Auto-dismiss click-to-play overlay
    new MutationObserver(() => {
      const el = document.getElementById("pyxel-prompt");
      if (el) document.body.click();
    }).observe(document.body, { childList: true, subtree: true });

    let pyxelReady = false;
    let launching = false;
    let pendingScript = null;

    async function executePyxel(script) {
      if (launching) {
        pendingScript = script;
        return;
      }
      if (!pyxelReady) {
        launching = true;
        await launchPyxel({ command: "run", script });
        pyxelReady = true;
        launching = false;
        if (pendingScript) {
          const s = pendingScript;
          pendingScript = null;
          window.pyxelContext.params.script = s;
          resetPyxel();
        }
        return;
      }
      window.pyxelContext.params.script = script;
      resetPyxel();
    }

    // Escape string for embedding in Python single-quoted literals
    function pyEsc(s) {
      return s.replace(/\\\\/g, "\\\\\\\\").replace(/'/g, "\\\\'");
    }

    function handleRun(scriptName, files) {
      window._pendingFiles = files;
      const name = pyEsc(scriptName);
      executePyxel(\`
import js, base64, pyxel.cli, os
files = js.window._pendingFiles.to_py()
for name, b64 in files.items():
    if '/' in name:
        os.makedirs(os.path.dirname(name), exist_ok=True)
    with open(name, 'wb') as f:
        f.write(base64.b64decode(b64))
pyxel.cli.run_python_script('\${name}')
      \`);
    }

    function handleEdit(fileName, fileData, palData) {
      window._pendingFileData = fileData;
      window._pendingPalData = palData;
      const name = pyEsc(fileName);
      executePyxel(\`
import js, base64, pyxel, pyxel.cli
file_data = js.window._pendingFileData
if file_data:
    data = base64.b64decode(file_data)
    with open('\${name}', 'wb') as f:
        f.write(data)
pal_data = js.window._pendingPalData
if pal_data:
    pal_name = '\${name}'.replace('.pyxres', '.pyxpal')
    with open(pal_name, 'wb') as f:
        f.write(base64.b64decode(pal_data))
if not hasattr(pyxel, '_original_save'):
    pyxel._original_save = pyxel.save
def _save_and_notify(filename):
    pyxel._original_save(filename)
    with open(filename, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    js.window._vscodeNotifySave(b64)
pyxel.save = _save_and_notify
pyxel.cli.edit_pyxel_resource('\${name}')
      \`);
    }

    function handlePlay(fileName, fileData) {
      window._pendingFileData = fileData;
      const name = pyEsc(fileName);
      executePyxel(\`
import js, base64, pyxel.cli
data = base64.b64decode(js.window._pendingFileData)
with open('\${name}', 'wb') as f:
    f.write(data)
pyxel.cli.play_pyxel_app('\${name}')
      \`);
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.command === "run") {
        handleRun(msg.scriptName, msg.files);
      } else if (msg.command === "edit") {
        handleEdit(msg.fileName, msg.fileData, msg.palData);
      } else if (msg.command === "play") {
        handlePlay(msg.fileName, msg.fileData);
      } else if (msg.command === "key") {
        // Forward keyboard shortcuts from VS Code to Pyxel
        const fire = (type, code, key, opts) =>
          document.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, ...opts }));
        fire("keydown", "ControlLeft", "Control", { ctrlKey: true });
        if (msg.shift) fire("keydown", "ShiftLeft", "Shift", { ctrlKey: true, shiftKey: true });
        fire("keydown", msg.code, msg.key, { ctrlKey: true, shiftKey: !!msg.shift });
        setTimeout(() => {
          fire("keyup", msg.code, msg.key, {});
          if (msg.shift) fire("keyup", "ShiftLeft", "Shift", {});
          fire("keyup", "ControlLeft", "Control", {});
        }, 80);
      }
    });

    // Watch for document.title changes (set by pyxel.init title parameter)
    new MutationObserver(() => {
      if (document.title) {
        vscodeApi.postMessage({ command: "title", title: document.title });
      }
    }).observe(document.querySelector("title") || document.head, {
      childList: true, subtree: true, characterData: true,
    });

    vscodeApi.postMessage({ command: "ready" });
  </script>
</body>
</html>`;
}
