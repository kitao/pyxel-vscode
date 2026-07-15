import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type * as vscode from "vscode";
import type { PyxelWebviewManager } from "../pyxelWebview";

const vscodeState = vi.hoisted(() => ({
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
      get: vi.fn((_name: string, defaultValue: unknown) => defaultValue),
    })),
  },
}));

import { RunPanelController } from "../runPanel";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-run-test-"));
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
});
