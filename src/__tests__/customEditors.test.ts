import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type * as vscode from "vscode";
import type { PyxelWebviewManager } from "../pyxelWebview";

const vscodeState = vi.hoisted(() => ({
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  commands: { executeCommand: vi.fn() },
  window: {
    showErrorMessage: vscodeState.showErrorMessage,
    showInformationMessage: vscodeState.showInformationMessage,
  },
  workspace: { asRelativePath: (fsPath: string) => fsPath },
}));

import { PyxelFileProvider } from "../customEditors";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-editor-test-"));
  vscodeState.showErrorMessage.mockReset();
  vscodeState.showInformationMessage.mockReset();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createHarness(filePath: string) {
  let readyHandler = () => {};
  let savedHandler: (fileName: string, data: string) => void = () => {};
  const post = vi.fn();
  const resetErrorState = vi.fn();
  const webviews = {
    initialize: vi.fn((
      _panel: vscode.WebviewPanel,
      onReady: () => void,
      onSaved: (fileName: string, data: string) => void
    ) => {
      readyHandler = onReady;
      savedHandler = onSaved;
    }),
    post,
    resetErrorState,
  } as unknown as PyxelWebviewManager;
  const onResourceSaved = vi.fn();
  const provider = new PyxelFileProvider(webviews, onResourceSaved);
  const panel = { webview: {} } as unknown as vscode.WebviewPanel;

  provider.resolveCustomEditor(
    { uri: { fsPath: filePath } } as unknown as vscode.CustomDocument,
    panel,
    {} as vscode.CancellationToken
  );

  return {
    onResourceSaved,
    panel,
    post,
    provider,
    ready: () => readyHandler(),
    resetErrorState,
    save: (fileName: string, data: string) => savedHandler(fileName, data),
  };
}

const base64 = (text: string) => Buffer.from(text).toString("base64");

describe("Pyxel Editor (.pyxres)", () => {
  it("sends the resource and the palette beside it", () => {
    const filePath = path.join(tmpDir, "game.pyxres");
    fs.writeFileSync(filePath, "resource");
    fs.writeFileSync(path.join(tmpDir, "game.pyxpal"), "palette");
    const harness = createHarness(filePath);

    harness.ready();

    expect(harness.resetErrorState).toHaveBeenCalledOnce();
    expect(harness.post).toHaveBeenCalledWith(harness.panel.webview, {
      command: "edit",
      fileName: "game.pyxres",
      fileData: base64("resource"),
      palData: base64("palette"),
    });
  });

  it("sends a null palette when none exists, and null data for a new file", () => {
    const filePath = path.join(tmpDir, "new.pyxres");
    const harness = createHarness(filePath);

    harness.ready();

    expect(harness.post).toHaveBeenCalledWith(harness.panel.webview, {
      command: "edit",
      fileName: "new.pyxres",
      fileData: null,
      palData: null,
    });
  });

  it("writes a saved resource back and notifies the run panel", () => {
    const filePath = path.join(tmpDir, "game.pyxres");
    fs.writeFileSync(filePath, "old");
    const harness = createHarness(filePath);

    harness.save("game.pyxres", base64("new"));

    expect(fs.readFileSync(filePath, "utf8")).toBe("new");
    expect(harness.onResourceSaved).toHaveBeenCalledWith(filePath);
  });

  it("saves any other file from the editor as a capture instead", () => {
    const filePath = path.join(tmpDir, "game.pyxres");
    fs.writeFileSync(filePath, "resource");
    const harness = createHarness(filePath);

    harness.save("screenshot.png", base64("image"));

    expect(fs.readFileSync(path.join(tmpDir, "screenshot.png"), "utf8"))
      .toBe("image");
    expect(fs.readFileSync(filePath, "utf8")).toBe("resource");
    expect(harness.onResourceSaved).not.toHaveBeenCalled();
  });
});

describe("Pyxel Player (.pyxapp)", () => {
  it("sends the app to the player", () => {
    const filePath = path.join(tmpDir, "game.pyxapp");
    fs.writeFileSync(filePath, "app");
    const harness = createHarness(filePath);

    harness.ready();

    expect(harness.post).toHaveBeenCalledWith(harness.panel.webview, {
      command: "play",
      fileName: "game.pyxapp",
      fileData: base64("app"),
    });
  });

  it("reports a read failure instead of posting to the Webview", () => {
    const harness = createHarness(path.join(tmpDir, "missing.pyxapp"));

    harness.ready();

    expect(harness.post).not.toHaveBeenCalled();
    expect(vscodeState.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read missing.pyxapp:")
    );
  });

  it("never treats a saved file as the app itself", () => {
    const filePath = path.join(tmpDir, "game.pyxapp");
    fs.writeFileSync(filePath, "app");
    const harness = createHarness(filePath);

    harness.save("game.pyxapp", base64("overwritten"));

    expect(fs.readFileSync(filePath, "utf8")).toBe("overwritten");
    expect(harness.onResourceSaved).not.toHaveBeenCalled();
  });
});

describe("openCustomDocument", () => {
  it("returns a disposable document for the opened uri", () => {
    const harness = createHarness(path.join(tmpDir, "game.pyxres"));
    const uri = { fsPath: "/project/game.pyxres" } as vscode.Uri;

    const document = harness.provider.openCustomDocument(
      uri,
      {} as vscode.CustomDocumentOpenContext,
      {} as vscode.CancellationToken
    );

    expect(document.uri).toBe(uri);
    expect(() => document.dispose()).not.toThrow();
  });
});
