import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { PyxelWebviewManager } from "../pyxelWebview";

interface PanelHarness {
  dispose: () => void;
  message: (value: unknown) => void;
  panel: vscode.WebviewPanel;
  postMessage: ReturnType<typeof vi.fn>;
}

function createPanel(active = false): PanelHarness {
  let disposeHandler = () => {};
  let messageHandler = (_value: unknown) => {};
  const postMessage = vi.fn();
  const panel = {
    active,
    onDidChangeViewState: vi.fn(),
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandler = handler;
      return { dispose: vi.fn() };
    }),
    title: "Pyxel",
    webview: {
      html: "",
      onDidReceiveMessage: vi.fn((handler: (value: unknown) => void) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
      options: {},
      postMessage,
    },
  } as unknown as vscode.WebviewPanel;
  return {
    dispose: () => disposeHandler(),
    message: (value) => messageHandler(value),
    panel,
    postMessage,
  };
}

describe("PyxelWebviewManager", () => {
  const appendLine = vi.fn();
  const show = vi.fn();
  const outputChannel = { appendLine, show } as unknown as vscode.OutputChannel;

  beforeEach(() => {
    appendLine.mockReset();
    show.mockReset();
  });

  it("routes validated Webview messages to their host handlers", () => {
    const manager = new PyxelWebviewManager(outputChannel);
    const harness = createPanel();
    const onReady = vi.fn();
    const onSaved = vi.fn();
    manager.initialize(harness.panel, onReady, onSaved);

    harness.message({ command: "ready" });
    harness.message({ command: "title", title: "My Game" });
    harness.message({
      command: "saved",
      fileName: "capture.png",
      data: "AA==",
    });

    expect(onReady).toHaveBeenCalledOnce();
    expect(harness.panel.title).toBe("My Game");
    expect(onSaved).toHaveBeenCalledWith("capture.png", "AA==");
  });

  it("rejects malformed and unsafe save messages", () => {
    const manager = new PyxelWebviewManager(outputChannel);
    const harness = createPanel();
    const onSaved = vi.fn();
    manager.initialize(harness.panel, vi.fn(), onSaved);

    harness.message({ command: "unknown" });
    harness.message({
      command: "saved",
      fileName: "../escape.png",
      data: "AA==",
    });

    expect(appendLine).toHaveBeenNthCalledWith(
      1, "Ignored malformed message from webview."
    );
    expect(appendLine).toHaveBeenNthCalledWith(
      2, "Ignored save request with unsafe file name: ../escape.png"
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows output once until the error state is reset", () => {
    const manager = new PyxelWebviewManager(outputChannel);
    const harness = createPanel();
    manager.initialize(harness.panel, vi.fn());

    harness.message({ command: "error", message: "first" });
    harness.message({ command: "error", message: "second" });
    manager.resetErrorState();
    harness.message({ command: "error", message: "third" });

    expect(appendLine).toHaveBeenCalledTimes(3);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenCalledWith(true);
  });

  it("forwards shortcuts only to the active tracked Webview", () => {
    const manager = new PyxelWebviewManager(outputChannel);
    const harness = createPanel(true);
    manager.initialize(harness.panel, vi.fn());

    manager.forwardKey({ code: "KeyS", key: "s" });
    manager.forwardKey({ code: 1, key: "s" });
    harness.dispose();
    manager.forwardKey({ code: "KeyZ", key: "z" });

    expect(harness.postMessage).toHaveBeenCalledOnce();
    expect(harness.postMessage).toHaveBeenCalledWith({
      command: "key",
      code: "KeyS",
      key: "s",
      shift: false,
    });
  });
});
