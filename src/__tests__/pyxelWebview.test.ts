import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { PyxelWebviewManager } from "../pyxelWebview";

interface PanelHarness {
  dispose: () => void;
  message: (value: unknown) => void;
  setActive: (active: boolean) => void;
  panel: vscode.WebviewPanel;
  postMessage: ReturnType<typeof vi.fn>;
}

function createPanel(active = false): PanelHarness {
  let disposeHandler = () => {};
  let stateHandler = () => {};
  let messageHandler = (_value: unknown) => {};
  const postMessage = vi.fn();
  const panel = {
    active,
    onDidChangeViewState: vi.fn((handler: () => void) => { stateHandler = handler; }),
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
    setActive: (active) => {
      Object.assign(panel, { active });
      stateHandler();
    },
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
    const manager = new PyxelWebviewManager(outputChannel, () => "/* script */");
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
    const manager = new PyxelWebviewManager(outputChannel, () => "/* script */");
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
    const manager = new PyxelWebviewManager(outputChannel, () => "/* script */");
    const harness = createPanel();
    manager.initialize(harness.panel, vi.fn());

    harness.message({ command: "error", message: "first" });
    harness.message({ command: "error", message: "second" });
    manager.resetErrorState(harness.panel.webview);
    harness.message({ command: "error", message: "third" });

    expect(appendLine).toHaveBeenCalledTimes(3);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenCalledWith(true);
  });

  it("forwards shortcuts only to the active tracked Webview", () => {
    const manager = new PyxelWebviewManager(outputChannel, () => "/* script */");
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

  it("does not send a shortcut to a panel after it loses focus", () => {
    const manager = new PyxelWebviewManager(outputChannel, () => "/* script */");
    const harness = createPanel(true);
    manager.initialize(harness.panel, vi.fn());
    harness.setActive(false);

    manager.forwardKey({ code: "KeyS", key: "s" });

    expect(harness.postMessage).not.toHaveBeenCalled();
  });

  it("shows errors independently for each panel", () => {
    const manager = new PyxelWebviewManager(outputChannel, () => "/* script */");
    const first = createPanel();
    const second = createPanel();
    manager.initialize(first.panel, vi.fn());
    manager.initialize(second.panel, vi.fn());

    first.message({ command: "error", message: "first panel" });
    second.message({ command: "error", message: "second panel" });
    second.message({ command: "error", message: "repeat" });

    expect(show).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected message delivery without an unhandled rejection", async () => {
    const manager = new PyxelWebviewManager(outputChannel, () => "/* script */");
    const harness = createPanel();
    harness.postMessage.mockRejectedValue(new Error("panel closed"));

    manager.post(harness.panel.webview, {
      command: "key", code: "KeyS", key: "s", shift: false,
    });

    await vi.waitFor(() => expect(appendLine).toHaveBeenCalledWith(
      "Failed to send to Pyxel: panel closed"
    ));
  });
});
