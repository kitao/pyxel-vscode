import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type * as vscode from "vscode";
import type { PyxelWebviewManager } from "../pyxelWebview";

const vscodeState = vi.hoisted(() => ({
  autoReload: true,
  createWebviewPanel: vi.fn(),
  showErrorMessage: vi.fn(),
  textDocuments: [] as vscode.TextDocument[],
}));

vi.mock("vscode", () => ({
  ViewColumn: { Beside: 2 },
  window: {
    activeTextEditor: undefined,
    createWebviewPanel: vscodeState.createWebviewPanel,
    showErrorMessage: vscodeState.showErrorMessage,
  },
  workspace: {
    get textDocuments() {
      return vscodeState.textDocuments;
    },
    getConfiguration: vi.fn(() => ({
      get: vi.fn((name: string, defaultValue: unknown) =>
        name === "autoReload" ? vscodeState.autoReload : defaultValue),
    })),
  },
}));

import { RunPanelController } from "../runPanel";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-run-test-"));
  vscodeState.autoReload = true;
  vscodeState.createWebviewPanel.mockReset();
  vscodeState.showErrorMessage.mockReset();
  vscodeState.textDocuments = [];
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createHarness() {
  let readyHandler = () => {};
  let disposeHandler = () => {};
  const panel = {
    dispose: vi.fn(),
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandler = handler;
    }),
    reveal: vi.fn(),
    title: "Pyxel",
    webview: {},
  } as unknown as vscode.WebviewPanel;
  vscodeState.createWebviewPanel.mockReturnValue(panel);

  const post = vi.fn();
  const resetErrorState = vi.fn();
  const webviews = {
    initialize: vi.fn(
      (_panel: vscode.WebviewPanel, onReady: () => void) => {
        readyHandler = onReady;
      }
    ),
    post,
    resetErrorState,
  } as unknown as PyxelWebviewManager;
  const appendLine = vi.fn();
  const outputChannel = { appendLine } as unknown as vscode.OutputChannel;
  const controller = new RunPanelController(webviews, outputChannel);

  return {
    appendLine,
    controller,
    dispose: () => disposeHandler(),
    panel,
    post,
    ready: () => readyHandler(),
    resetErrorState,
  };
}

describe("RunPanelController", () => {
  it("sends the project to the Webview after it is ready", async () => {
    const scriptPath = path.join(tmpDir, "game.py");
    fs.writeFileSync(scriptPath, "print('hello')");
    const harness = createHarness();

    await harness.controller.run({ fsPath: scriptPath } as vscode.Uri);

    expect(harness.post).not.toHaveBeenCalled();
    expect(harness.panel.reveal).toHaveBeenCalledWith(2, true);
    harness.ready();
    expect(harness.resetErrorState).toHaveBeenCalledOnce();
    expect(harness.appendLine).toHaveBeenCalledWith("--- Run game.py ---");
    expect(harness.post).toHaveBeenCalledWith(harness.panel.webview, {
      command: "run",
      scriptName: "game.py",
      files: {
        "game.py": Buffer.from("print('hello')").toString("base64"),
      },
    });
  });

  it("debounces reloads for saved project files", async () => {
    vi.useFakeTimers();
    const scriptPath = path.join(tmpDir, "game.py");
    fs.writeFileSync(scriptPath, "pass");
    const harness = createHarness();
    await harness.controller.run({ fsPath: scriptPath } as vscode.Uri);
    harness.ready();
    harness.post.mockClear();

    harness.controller.handleFileSave(scriptPath);
    harness.controller.handleFileSave(scriptPath);
    await vi.advanceTimersByTimeAsync(199);
    expect(harness.post).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.post).toHaveBeenCalledOnce();
  });

  it("reuses the open panel for the next script", async () => {
    const first = path.join(tmpDir, "first.py");
    const second = path.join(tmpDir, "second.py");
    fs.writeFileSync(first, "pass");
    fs.writeFileSync(second, "pass");
    const harness = createHarness();
    await harness.controller.run({ fsPath: first } as vscode.Uri);
    harness.ready();
    harness.post.mockClear();

    await harness.controller.run({ fsPath: second } as vscode.Uri);

    expect(vscodeState.createWebviewPanel).toHaveBeenCalledOnce();
    expect(harness.panel.title).toBe("Pyxel — second.py");
    expect(harness.panel.reveal).toHaveBeenLastCalledWith(undefined, true);
    expect(harness.post).toHaveBeenCalledWith(
      harness.panel.webview,
      expect.objectContaining({ command: "run", scriptName: "second.py" })
    );
  });

  it("stops reloading once the panel is closed", async () => {
    vi.useFakeTimers();
    const scriptPath = path.join(tmpDir, "game.py");
    fs.writeFileSync(scriptPath, "pass");
    const harness = createHarness();
    await harness.controller.run({ fsPath: scriptPath } as vscode.Uri);
    harness.ready();
    harness.post.mockClear();
    harness.dispose();

    harness.controller.handleFileSave(scriptPath);
    await vi.advanceTimersByTimeAsync(1000);

    expect(harness.post).not.toHaveBeenCalled();
  });

  it("leaves the game alone when auto-reload is off", async () => {
    vi.useFakeTimers();
    vscodeState.autoReload = false;
    const scriptPath = path.join(tmpDir, "game.py");
    fs.writeFileSync(scriptPath, "pass");
    const harness = createHarness();
    await harness.controller.run({ fsPath: scriptPath } as vscode.Uri);
    harness.ready();
    harness.post.mockClear();

    harness.controller.handleFileSave(scriptPath);
    await vi.advanceTimersByTimeAsync(1000);

    expect(harness.post).not.toHaveBeenCalled();
  });

  it("keeps the newest run when an older request is still saving", async () => {
    const first = path.join(tmpDir, "first", "game.py");
    const second = path.join(tmpDir, "second", "game.py");
    for (const file of [first, second]) {
      fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(file, file);
    }
    let finishSave = (_saved: boolean) => {};
    vscodeState.textDocuments = [{
      isDirty: true,
      isUntitled: false,
      uri: { fsPath: first },
      save: () => new Promise<boolean>((resolve) => { finishSave = resolve; }),
    } as unknown as vscode.TextDocument];
    const harness = createHarness();

    const pending = harness.controller.run({ fsPath: first } as vscode.Uri);
    await harness.controller.run({ fsPath: second } as vscode.Uri);
    harness.ready();
    harness.post.mockClear();
    finishSave(true);
    await pending;

    expect(harness.post).not.toHaveBeenCalled();
  });

  it("does not open a panel after disposal while saving", async () => {
    const script = path.join(tmpDir, "game.py");
    fs.writeFileSync(script, "pass");
    let finishSave = (_saved: boolean) => {};
    vscodeState.textDocuments = [{
      isDirty: true,
      isUntitled: false,
      uri: { fsPath: script },
      save: () => new Promise<boolean>((resolve) => { finishSave = resolve; }),
    } as unknown as vscode.TextDocument];
    const harness = createHarness();
    const pending = harness.controller.run({ fsPath: script } as vscode.Uri);
    harness.controller.dispose();
    finishSave(true);
    await pending;

    expect(vscodeState.createWebviewPanel).not.toHaveBeenCalled();
  });

  it("reports a missing entry script without resetting the game", async () => {
    const harness = createHarness();
    await harness.controller.run({ fsPath: path.join(tmpDir, "missing.py") } as vscode.Uri);
    harness.ready();

    expect(harness.post).not.toHaveBeenCalled();
    expect(vscodeState.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("missing.py was not included")
    );
  });

  it.each([true, false, "reject", "throw"] as const)(
    "does not auto-reload midway through Run's saves (saved=%s)",
    async (saved) => {
      vi.useFakeTimers();
      const script = path.join(tmpDir, "game.py");
      const resource = path.join(tmpDir, "data.txt");
      fs.writeFileSync(script, "pass");
      fs.writeFileSync(resource, "data");
      const harness = createHarness();
      await harness.controller.run({ fsPath: script } as vscode.Uri);
      harness.ready();
      harness.post.mockClear();

      let finishSave = (_saved: boolean) => {};
      vscodeState.textDocuments = [
        {
          isDirty: true, isUntitled: false, uri: { fsPath: script },
          save: () => {
            harness.controller.handleFileSave(script);
            if (saved === "throw") throw new Error("save failed");
            return saved === "reject"
              ? Promise.reject(new Error("save failed"))
              : Promise.resolve(true);
          },
        },
        {
          isDirty: true, isUntitled: false, uri: { fsPath: resource },
          save: () => new Promise<boolean>((resolve) => {
            finishSave = (result) => {
              harness.controller.handleFileSave(resource);
              resolve(result);
            };
          }),
        },
      ] as unknown as vscode.TextDocument[];
      // Run must also cancel a reload already scheduled by an earlier save.
      harness.controller.handleFileSave(resource);
      const pending = harness.controller.run({ fsPath: script } as vscode.Uri);
      await vi.advanceTimersByTimeAsync(250);
      expect(harness.post).not.toHaveBeenCalled();

      finishSave(saved !== false);
      await pending;
      await vi.advanceTimersByTimeAsync(250);
      expect(harness.post).toHaveBeenCalledTimes(saved === true ? 1 : 0);

      harness.post.mockClear();
      harness.controller.handleFileSave(resource);
      await vi.advanceTimersByTimeAsync(250);
      expect(harness.post).toHaveBeenCalledOnce();
    }
  );

});
