import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export const PYXEL_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/kitao/pyxel@main/wasm";
export const PYXEL_API_REFERENCE_URL =
  "https://kitao.github.io/pyxel/web/api-reference/";
export const PYXEL_EDITOR_MANUAL_URL =
  "https://kitao.github.io/pyxel/web/editor-manual/";

export const SKIP_DIRS = new Set([
  ".git", "__pycache__", "node_modules", ".venv", "venv", ".tox", ".mypy_cache",
]);
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
export const MAX_DEPTH = 3;

export function isPyxelRunnable(filePath: string | undefined): filePath is string {
  return !!filePath && filePath.endsWith(".py");
}

export function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function collectFiles(rootDir: string): Record<string, string> {
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

export function getWebviewHtml(): string {
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
