import { PYXEL_CDN_BASE, getNonce } from "./utils";

export function getWebviewHtml(): string {
  const nonce = getNonce();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src https://cdn.jsdelivr.net;
      script-src 'nonce-${nonce}' https://cdn.jsdelivr.net 'unsafe-eval';
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
    #pyxel-error {
      display: none;
      padding: 16px;
      color: #ddd;
      font-family: sans-serif;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div id="pyxel-error"></div>
  <script src="${PYXEL_CDN_BASE}/pyxel.js"></script>
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();

    function postError(message) {
      vscodeApi.postMessage({ command: "error", message });
    }

    const RUNTIME_LOAD_ERROR =
      "Failed to load the Pyxel runtime from cdn.jsdelivr.net. " +
      "Check your network connection, then close and reopen this panel.";

    function showFatalError(message) {
      const el = document.getElementById("pyxel-error");
      el.textContent = message;
      el.style.display = "block";
      postError(message);
    }

    // Forward console.error to VS Code output channel
    const _origConsoleError = console.error;
    console.error = (...args) => {
      _origConsoleError.apply(console, args);
      postError(args.join(" "));
    };

    function installSaveBridge() {
      const saveBridge = function(filename) {
        try {
          const fs = window.pyxelContext?.pyodide?.FS;
          if (!fs) {
            postError("Pyxel filesystem is not ready.");
            return;
          }
          const basename = filename.split(/[\\\\/]/).pop() || filename;
          const bytes = fs.readFile(filename);
          const chunkSize = 0x8000;
          let binary = "";
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          vscodeApi.postMessage({ command: "saved", fileName: basename, data: btoa(binary) });
        } catch (error) {
          const message = error?.message || String(error);
          postError(\`Failed to save \${filename}: \${message}\`);
        }
      };
      Object.defineProperty(window, "_savePyxelFile", {
        configurable: true,
        get: () => saveBridge,
        set: () => {},
      });
    }

    // Auto-dismiss click-to-play overlay
    new MutationObserver(() => {
      const el = document.getElementById("pyxel-prompt");
      if (el) document.body.click();
    }).observe(document.body, { childList: true, subtree: true });

    let pyxelReady = false;
    let launching = false;
    let pendingScript = null;

    async function executePyxel(script) {
      if (typeof launchPyxel === "undefined") {
        showFatalError(RUNTIME_LOAD_ERROR);
        return;
      }
      if (launching) {
        pendingScript = script;
        return;
      }
      if (!pyxelReady) {
        launching = true;
        installSaveBridge();
        try {
          await launchPyxel({ command: "run", script });
          pyxelReady = true;
        } catch (error) {
          const message = error?.message || String(error);
          postError(\`Failed to launch Pyxel: \${message}\`);
        } finally {
          launching = false;
        }
        if (!pyxelReady) {
          pendingScript = null;
          return;
        }
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

    let prevRunFiles = [];

    // File names are passed to Python as data (js.window globals) rather than
    // interpolated into the source, so any filename is injection-safe.
    function handleRun(scriptName, files) {
      window._pendingFiles = files;
      window._pendingScriptName = scriptName;
      window._staleFiles = prevRunFiles.filter((name) => !(name in files));
      prevRunFiles = Object.keys(files);
      executePyxel(\`
import js, base64, os, pyxel.cli
for name in js.window._staleFiles.to_py():
    try:
        os.remove(name)
    except OSError:
        pass
files = js.window._pendingFiles.to_py()
for name, b64 in files.items():
    if '/' in name:
        os.makedirs(os.path.dirname(name), exist_ok=True)
    with open(name, 'wb') as f:
        f.write(base64.b64decode(b64))
pyxel.cli.run_python_script(js.window._pendingScriptName)
      \`);
    }

    function handleEdit(fileName, fileData, palData) {
      window._pendingFileData = fileData;
      window._pendingPalData = palData;
      window._pendingFileName = fileName;
      executePyxel(\`
import js, base64, pyxel.cli
name = js.window._pendingFileName
file_data = js.window._pendingFileData
if file_data:
    data = base64.b64decode(file_data)
    with open(name, 'wb') as f:
        f.write(data)
pal_data = js.window._pendingPalData
if pal_data:
    pal_name = name[:-7] + '.pyxpal' if name.endswith('.pyxres') else name + '.pyxpal'
    with open(pal_name, 'wb') as f:
        f.write(base64.b64decode(pal_data))
pyxel.cli.edit_pyxel_resource(name)
      \`);
    }

    function handlePlay(fileName, fileData) {
      window._pendingFileData = fileData;
      window._pendingFileName = fileName;
      executePyxel(\`
import js, base64, pyxel.cli
name = js.window._pendingFileName
data = base64.b64decode(js.window._pendingFileData)
with open(name, 'wb') as f:
    f.write(data)
pyxel.cli.play_pyxel_app(name)
      \`);
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
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
