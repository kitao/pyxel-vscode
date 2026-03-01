import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as https from "https";

const PYXEL_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/kitao/pyxel/wasm";

// Pyxel panel state
let pyxelPanel: vscode.WebviewPanel | undefined;
let pyxelMode: "run" | "edit" | "play" | undefined;
let lastRunDir: string | undefined;
let lastRunScript: string | undefined;
let currentEditPath: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("pyxel.run", runPyxel),
    vscode.commands.registerCommand("pyxel.newResource", newResource),
    vscode.commands.registerCommand("pyxel.copyExamples", copyExamples)
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
      if (pyxelPanel && pyxelMode === "run" && lastRunDir && lastRunScript) {
        sendRunMessage(pyxelPanel, lastRunDir, lastRunScript);
      }
    })
  );
}

export function deactivate() {
  pyxelPanel?.dispose();
}

// --- Panel management ---

function ensurePyxelPanel(): vscode.WebviewPanel {
  if (pyxelPanel) return pyxelPanel;

  pyxelPanel = vscode.window.createWebviewPanel(
    "pyxel.view",
    "Pyxel",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  pyxelPanel.webview.html = getWebviewHtml();

  pyxelPanel.webview.onDidReceiveMessage((msg) => {
    if (msg.command === "ready") {
      if (pyxelMode === "run" && lastRunDir && lastRunScript) {
        sendRunMessage(pyxelPanel!, lastRunDir, lastRunScript);
      } else if (pyxelMode === "edit" && currentEditPath) {
        sendEditMessage(pyxelPanel!, currentEditPath);
      } else if (pyxelMode === "play" && currentEditPath) {
        sendPlayMessage(pyxelPanel!, currentEditPath);
      }
    } else if (msg.command === "saved" && currentEditPath) {
      try {
        fs.writeFileSync(currentEditPath, Buffer.from(msg.data, "base64"));
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to save: ${e.message}`);
      }
    }
  });

  pyxelPanel.onDidDispose(() => {
    pyxelPanel = undefined;
    pyxelMode = undefined;
  });

  return pyxelPanel;
}

function launchInPanel(
  mode: typeof pyxelMode,
  title: string,
  send: (panel: vscode.WebviewPanel) => void
) {
  const isNew = !pyxelPanel;
  pyxelMode = mode;
  const panel = ensurePyxelPanel();
  panel.title = title;
  panel.reveal(vscode.ViewColumn.Beside, true);
  if (!isNew) send(panel);
}

// --- Commands ---

function runPyxel() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document.fileName.endsWith(".py")) {
    vscode.window.showErrorMessage("Open a .py file to run with Pyxel.");
    return;
  }
  lastRunDir = path.dirname(editor.document.fileName);
  lastRunScript = path.basename(editor.document.fileName);
  launchInPanel("run", "Pyxel", (p) =>
    sendRunMessage(p, lastRunDir!, lastRunScript!)
  );
}

async function newResource() {
  const uri = await vscode.window.showSaveDialog({
    filters: { "Pyxel Resource": ["pyxres"] },
  });
  if (!uri) return;
  currentEditPath = uri.fsPath;
  launchInPanel("edit", path.basename(uri.fsPath), (p) =>
    sendEditMessage(p, currentEditPath!)
  );
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
    currentEditPath = filePath;
    const isEdit = path.extname(filePath) === ".pyxres";
    launchInPanel(
      isEdit ? "edit" : "play",
      path.basename(filePath),
      (p) => isEdit ? sendEditMessage(p, filePath) : sendPlayMessage(p, filePath)
    );

    // Redirect to shared panel
    webviewPanel.webview.html = "";
    setTimeout(() => webviewPanel.dispose(), 0);
  }
}

// --- File collection ---

const SKIP_DIRS = new Set([
  ".git", "__pycache__", "node_modules", ".venv", "venv", ".tox", ".mypy_cache",
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
const MAX_DEPTH = 3;

function collectFiles(rootDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  let totalSize = 0;

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || totalSize > MAX_TOTAL_SIZE) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (stat.isFile() && stat.size <= MAX_FILE_SIZE) {
        totalSize += stat.size;
        if (totalSize > MAX_TOTAL_SIZE) return;
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
        files[relPath] = fs.readFileSync(fullPath).toString("base64");
      }
    }
  }
  walk(rootDir, 0);
  return files;
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

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

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

    function handleRun(scriptName, files) {
      window._pendingFiles = files;
      executePyxel(\`
import js, base64, pyxel.cli, os
files = js.window._pendingFiles.to_py()
for name, b64 in files.items():
    if '/' in name:
        os.makedirs(os.path.dirname(name), exist_ok=True)
    with open(name, 'wb') as f:
        f.write(base64.b64decode(b64))
pyxel.cli.run_python_script('\${scriptName}')
      \`);
    }

    function handleEdit(fileName, fileData, palData) {
      window._pendingFileData = fileData;
      window._pendingPalData = palData;
      executePyxel(\`
import js, base64, pyxel, pyxel.cli
file_data = js.window._pendingFileData
if file_data:
    data = base64.b64decode(file_data)
    with open('\${fileName}', 'wb') as f:
        f.write(data)
pal_data = js.window._pendingPalData
if pal_data:
    pal_name = '\${fileName}'.replace('.pyxres', '.pyxpal')
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
pyxel.cli.edit_pyxel_resource('\${fileName}')
      \`);
    }

    function handlePlay(fileName, fileData) {
      window._pendingFileData = fileData;
      executePyxel(\`
import js, base64, pyxel.cli
data = base64.b64decode(js.window._pendingFileData)
with open('\${fileName}', 'wb') as f:
    f.write(data)
pyxel.cli.play_pyxel_app('\${fileName}')
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
      }
    });

    vscodeApi.postMessage({ command: "ready" });
  </script>
</body>
</html>`;
}
