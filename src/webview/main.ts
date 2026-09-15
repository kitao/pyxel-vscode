// The script that runs inside the Pyxel Webview. It is compiled on its own
// against the DOM and imports nothing, so the emitted file is a standalone
// module. webview.test.ts asserts that the protocol below still matches the
// host side in src/messages.ts.
export type HostMessage =
  | { command: "run"; scriptName: string; files: Record<string, string> }
  | {
    command: "edit";
    fileName: string;
    fileData: string | null;
    palData: string | null;
  }
  | { command: "play"; fileName: string; fileData: string }
  | { command: "key"; code: string; key: string; shift: boolean };

export type WebviewMessage =
  | { command: "ready" }
  | { command: "title"; title: string }
  | { command: "error"; message: string }
  | { command: "saved"; fileName: string; data: string };

// Provided by VS Code and by the Pyxel Web runtime loaded from the CDN.
declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
};
declare function launchPyxel(
  params: { command: string; script: string }
): Promise<void>;
declare function resetPyxel(): Promise<void>;

interface PyodideFileSystem {
  readFile(path: string): Uint8Array;
}

interface PyxelContext {
  params: { script: string };
  pyodide?: { FS?: PyodideFileSystem };
}

declare global {
  interface Window {
    pyxelContext?: PyxelContext;
    _pendingFiles?: Record<string, string>;
    _pendingScriptName?: string;
    _pendingFileName?: string;
    _pendingFileData?: string | null;
    _pendingPalData?: string | null;
    _savePyxelFile?: (filename: string) => void;
  }
}

// File names reach Python as data (js.window globals) instead of being
// interpolated into the source, so any file name is injection-safe.
// resetPyxel clears the working directory before this script runs again.
export const RUN_SCRIPT = `
import base64
import js
import os
import pyxel.cli

files = js.window._pendingFiles.to_py()
for name, b64 in files.items():
    if '/' in name:
        os.makedirs(os.path.dirname(name), exist_ok=True)
    with open(name, 'wb') as f:
        f.write(base64.b64decode(b64))
pyxel.cli.run_python_script(js.window._pendingScriptName)
`;

export const EDIT_SCRIPT = `
import base64
import js
import pyxel.cli

name = js.window._pendingFileName
file_data = js.window._pendingFileData
if file_data:
    data = base64.b64decode(file_data)
    with open(name, 'wb') as f:
        f.write(data)
pal_data = js.window._pendingPalData
if pal_data:
    if name.lower().endswith('.pyxres'):
        pal_name = name[:-7] + '.pyxpal'
    else:
        pal_name = name + '.pyxpal'
    with open(pal_name, 'wb') as f:
        f.write(base64.b64decode(pal_data))
pyxel.cli.edit_pyxel_resource(name)
`;

export const PLAY_SCRIPT = `
import base64
import js
import pyxel.cli

name = js.window._pendingFileName
data = base64.b64decode(js.window._pendingFileData)
with open(name, 'wb') as f:
    f.write(data)
pyxel.cli.play_pyxel_app(name)
`;

export const RUNTIME_LOAD_ERROR =
  "Failed to load the Pyxel runtime from cdn.jsdelivr.net. " +
  "Check your network connection, then close and reopen this panel.";

export const KEY_RELEASE_DELAY_MS = 80;

export function toErrorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message ? message : String(error);
}

// String.fromCharCode takes the bytes as arguments, so they go in chunks.
export function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export interface KeyStep {
  type: "keydown" | "keyup";
  code: string;
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
}

// Pyxel reads Ctrl even on macOS, so a forwarded key always arrives as Ctrl
// with the modifier pressed around it and released afterwards.
export function keySteps(
  key: { code: string; key: string; shift: boolean }
): { press: KeyStep[]; release: KeyStep[] } {
  const press: KeyStep[] = [
    { type: "keydown", code: "ControlLeft", key: "Control", ctrlKey: true, shiftKey: false },
  ];
  if (key.shift) {
    press.push({ type: "keydown", code: "ShiftLeft", key: "Shift", ctrlKey: true, shiftKey: true });
  }
  press.push({ type: "keydown", code: key.code, key: key.key, ctrlKey: true, shiftKey: key.shift });

  const release: KeyStep[] = [
    { type: "keyup", code: key.code, key: key.key, ctrlKey: false, shiftKey: false },
  ];
  if (key.shift) {
    release.push({ type: "keyup", code: "ShiftLeft", key: "Shift", ctrlKey: false, shiftKey: false });
  }
  release.push({ type: "keyup", code: "ControlLeft", key: "Control", ctrlKey: false, shiftKey: false });

  return { press, release };
}

export interface RunnerHost {
  isRuntimeLoaded(): boolean;
  installSaveBridge(): void;
  launch(script: string): Promise<void>;
  reset(script: string): Promise<void>;
  reportError(message: string): void;
  reportFatal(message: string): void;
}

// Pyxel starts once; every later script resets the running instance. A script
// that arrives while either is in flight replaces the queued one, so rapid
// reloads never overlap and only the newest one runs.
export class PyxelRunner {
  private started = false;
  private busy = false;
  private queued: { script: string; prepare: () => void } | null = null;

  constructor(private readonly host: RunnerHost) {}

  async run(script: string, prepare: () => void = () => {}): Promise<void> {
    if (!this.host.isRuntimeLoaded()) {
      this.host.reportFatal(RUNTIME_LOAD_ERROR);
      return;
    }
    if (this.busy) {
      this.queued = { script, prepare };
      return;
    }

    this.busy = true;
    const operation = this.started ? "reset" : "launch";
    try {
      // Publish the payload only when this request starts. A later message
      // must not change the globals while launch/reset is still using them.
      prepare();
      if (this.started) {
        await this.host.reset(script);
      } else {
        this.host.installSaveBridge();
        await this.host.launch(script);
        this.started = true;
      }
    } catch (error: unknown) {
      this.host.reportError(`Failed to ${operation} Pyxel: ${toErrorMessage(error)}`);
    } finally {
      this.busy = false;
    }

    // A failed launch leaves nothing to reset, so drop what was queued.
    const next = this.queued;
    this.queued = null;
    if (this.started && next !== null) await this.run(next.script, next.prepare);
  }
}

export function start(): void {
  const api = acquireVsCodeApi();
  const post = (message: WebviewMessage) => api.postMessage(message);
  const reportError = (message: string) => post({ command: "error", message });

  const reportFatal = (message: string) => {
    const element = document.getElementById("pyxel-error");
    if (element) {
      element.textContent = message;
      element.style.display = "block";
    }
    reportError(message);
  };

  // Everything Pyxel logs, Python tracebacks included, reaches the host.
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    reportError(args.join(" "));
  };

  // Pyxel saves through window._savePyxelFile; a getter keeps the runtime
  // from replacing the bridge with its own browser download.
  const installSaveBridge = () => {
    const saveBridge = (filename: string) => {
      try {
        const files = window.pyxelContext?.pyodide?.FS;
        if (!files) {
          reportError("Pyxel filesystem is not ready.");
          return;
        }
        const fileName = filename.split(/[\\/]/).pop() || filename;
        post({
          command: "saved",
          fileName,
          data: encodeBase64(files.readFile(filename)),
        });
      } catch (error: unknown) {
        reportError(`Failed to save ${filename}: ${toErrorMessage(error)}`);
      }
    };
    Object.defineProperty(window, "_savePyxelFile", {
      configurable: true,
      get: () => saveBridge,
      set: () => {},
    });
  };

  const runner = new PyxelRunner({
    isRuntimeLoaded: () => typeof launchPyxel !== "undefined",
    installSaveBridge,
    launch: (script) => launchPyxel({ command: "run", script }),
    reset: async (script) => {
      const context = window.pyxelContext;
      if (context) context.params.script = script;
      await resetPyxel();
    },
    reportError,
    reportFatal,
  });

  // Skip the runtime's click-to-play overlay.
  new MutationObserver(() => {
    if (document.getElementById("pyxel-prompt")) document.body.click();
  }).observe(document.body, { childList: true, subtree: true });

  const dispatch = (step: KeyStep) => {
    document.dispatchEvent(new KeyboardEvent(step.type, {
      bubbles: true,
      code: step.code,
      key: step.key,
      ctrlKey: step.ctrlKey,
      shiftKey: step.shiftKey,
    }));
  };

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data as HostMessage | null;
    if (!message || typeof message !== "object") return;
    switch (message.command) {
      case "run":
        void runner.run(RUN_SCRIPT, () => {
          window._pendingFiles = message.files;
          window._pendingScriptName = message.scriptName;
        });
        break;
      case "edit":
        void runner.run(EDIT_SCRIPT, () => {
          window._pendingFileName = message.fileName;
          window._pendingFileData = message.fileData;
          window._pendingPalData = message.palData;
        });
        break;
      case "play":
        void runner.run(PLAY_SCRIPT, () => {
          window._pendingFileName = message.fileName;
          window._pendingFileData = message.fileData;
        });
        break;
      case "key": {
        const { press, release } = keySteps(message);
        press.forEach(dispatch);
        setTimeout(() => release.forEach(dispatch), KEY_RELEASE_DELAY_MS);
        break;
      }
    }
  });

  // Pyxel sets the document title; mirror it onto the panel tab.
  new MutationObserver(() => {
    if (document.title) post({ command: "title", title: document.title });
  }).observe(document.querySelector("title") ?? document.head, {
    characterData: true,
    childList: true,
    subtree: true,
  });

  post({ command: "ready" });
}

// Only the Webview provides the VS Code API, so importing this file elsewhere
// (a test, for instance) has no side effects.
if (typeof acquireVsCodeApi === "function") start();
