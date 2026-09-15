import { beforeEach, describe, expect, it, vi } from "vitest";

type CommandHandler = (...args: unknown[]) => unknown;

const vscodeState = vi.hoisted(() => ({
  activeTextEditor: undefined as
    | { document: { fileName: string } }
    | undefined,
  commandHandlers: new Map<string, CommandHandler>(),
  createWebviewPanel: vi.fn(),
  executeCommand: vi.fn(),
  showErrorMessage: vi.fn(),
  showSaveDialog: vi.fn(),
  textDocuments: [] as Array<{
    fileName: string;
    isDirty: boolean;
    isUntitled: boolean;
    save: () => Promise<boolean>;
    uri: { fsPath: string };
  }>,
}));

vi.mock("vscode", () => ({
  ViewColumn: { Beside: 2 },
  commands: {
    executeCommand: vscodeState.executeCommand,
    registerCommand: vi.fn((name: string, handler: CommandHandler) => {
      vscodeState.commandHandlers.set(name, handler);
      return { dispose: vi.fn() };
    }),
  },
  window: {
    get activeTextEditor() {
      return vscodeState.activeTextEditor;
    },
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
      show: vi.fn(),
    })),
    createWebviewPanel: vscodeState.createWebviewPanel,
    registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
    showErrorMessage: vscodeState.showErrorMessage,
    showSaveDialog: vscodeState.showSaveDialog,
  },
  workspace: {
    get textDocuments() {
      return vscodeState.textDocuments;
    },
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

import { activate } from "../extension";

beforeEach(() => {
  vscodeState.activeTextEditor = undefined;
  vscodeState.commandHandlers.clear();
  vscodeState.createWebviewPanel.mockReset();
  vscodeState.createWebviewPanel.mockReturnValue({
    active: false,
    onDidChangeViewState: vi.fn(),
    onDidDispose: vi.fn(),
    reveal: vi.fn(),
    title: "Pyxel",
    webview: {
      html: "",
      onDidReceiveMessage: vi.fn(),
      options: {},
      postMessage: vi.fn(),
    },
  });
  vscodeState.showErrorMessage.mockReset();
  vscodeState.executeCommand.mockReset();
  vscodeState.showSaveDialog.mockReset();
  vscodeState.textDocuments = [];
});

function activateExtension(): void {
  const context = {
    subscriptions: { push: vi.fn() },
  } as unknown as Parameters<typeof activate>[0];
  activate(context);
}

describe("activation", () => {
  it("registers every command used by the extension manifest", () => {
    activateExtension();

    expect([...vscodeState.commandHandlers.keys()].sort()).toEqual([
      "pyxel.apiReference",
      "pyxel.copyExamples",
      "pyxel.editorManual",
      "pyxel.forwardKey",
      "pyxel.newResource",
      "pyxel.run",
    ]);
  });
});

describe("Pyxel: Run", () => {
  it("does not run when a project file cannot be saved", async () => {
    const fileName = "/project/game.py";
    vscodeState.activeTextEditor = { document: { fileName } };
    vscodeState.textDocuments = [{
      fileName,
      isDirty: true,
      isUntitled: false,
      save: vi.fn().mockResolvedValue(false),
      uri: { fsPath: fileName },
    }];
    activateExtension();

    await vscodeState.commandHandlers.get("pyxel.run")!();

    expect(vscodeState.createWebviewPanel).not.toHaveBeenCalled();
    expect(vscodeState.showErrorMessage).toHaveBeenCalledWith(
      "Failed to save project files before running with Pyxel."
    );
  });

  it("reports an error when saving a project file throws", async () => {
    const fileName = "/project/game.py";
    vscodeState.activeTextEditor = { document: { fileName } };
    vscodeState.textDocuments = [{
      fileName,
      isDirty: true,
      isUntitled: false,
      save: vi.fn().mockRejectedValue(new Error("disk full")),
      uri: { fsPath: fileName },
    }];
    activateExtension();

    await vscodeState.commandHandlers.get("pyxel.run")!();

    expect(vscodeState.createWebviewPanel).not.toHaveBeenCalled();
    expect(vscodeState.showErrorMessage).toHaveBeenCalledWith(
      "Failed to save project files before running with Pyxel: disk full"
    );
  });
});

describe("Pyxel: New Resource", () => {
  it("adds the pyxres extension when the selected name has none", async () => {
    const selectedUri = {
      path: "/project/new_resource",
      with: vi.fn(({ path: newPath }: { path: string }) => ({ path: newPath })),
    };
    vscodeState.showSaveDialog.mockResolvedValue(selectedUri);
    activateExtension();

    await vscodeState.commandHandlers.get("pyxel.newResource")!();

    expect(selectedUri.with).toHaveBeenCalledWith({
      path: "/project/new_resource.pyxres",
    });
    expect(vscodeState.executeCommand).toHaveBeenCalledWith(
      "vscode.openWith",
      { path: "/project/new_resource.pyxres" },
      "pyxel.editor"
    );
  });
});
