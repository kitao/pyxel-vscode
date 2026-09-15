import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

const vscodeState = vi.hoisted(() => ({ createWebviewPanel: vi.fn() }));

vi.mock("vscode", () => ({
  ViewColumn: { Beside: 2 },
  window: { createWebviewPanel: vscodeState.createWebviewPanel },
}));

import { createDocumentationCommand } from "../documentationPanels";

const URL = "https://kitao.github.io/pyxel/web/api-reference/";

function createPanel() {
  let disposeHandler = () => {};
  const panel = {
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandler = handler;
    }),
    reveal: vi.fn(),
    webview: { html: "" },
  } as unknown as vscode.WebviewPanel;
  return { dispose: () => disposeHandler(), panel };
}

beforeEach(() => {
  vscodeState.createWebviewPanel.mockReset();
});

describe("createDocumentationCommand", () => {
  it("opens the page beside the code without taking focus", () => {
    const { panel } = createPanel();
    vscodeState.createWebviewPanel.mockReturnValue(panel);

    createDocumentationCommand("pyxel.apiReference", "Pyxel API Reference", URL)();

    expect(vscodeState.createWebviewPanel).toHaveBeenCalledWith(
      "pyxel.apiReference",
      "Pyxel API Reference",
      { viewColumn: 2, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [] }
    );
  });

  it("embeds the documentation and allows no other origin", () => {
    const { panel } = createPanel();
    vscodeState.createWebviewPanel.mockReturnValue(panel);

    createDocumentationCommand("pyxel.apiReference", "Pyxel API Reference", URL)();

    expect(panel.webview.html).toContain(`<iframe src="${URL}"`);
    expect(panel.webview.html).toContain("default-src 'none'");
    expect(panel.webview.html).toContain("frame-src https://kitao.github.io");
  });

  it("reveals the panel it already opened instead of a second one", () => {
    const { panel } = createPanel();
    vscodeState.createWebviewPanel.mockReturnValue(panel);
    const open = createDocumentationCommand("pyxel.apiReference", "Docs", URL);

    open();
    open();

    expect(vscodeState.createWebviewPanel).toHaveBeenCalledOnce();
    expect(panel.reveal).toHaveBeenCalledOnce();
  });

  it("opens a fresh panel after the user closed the previous one", () => {
    const first = createPanel();
    vscodeState.createWebviewPanel.mockReturnValue(first.panel);
    const open = createDocumentationCommand("pyxel.apiReference", "Docs", URL);

    open();
    first.dispose();
    vscodeState.createWebviewPanel.mockReturnValue(createPanel().panel);
    open();

    expect(vscodeState.createWebviewPanel).toHaveBeenCalledTimes(2);
  });
});
