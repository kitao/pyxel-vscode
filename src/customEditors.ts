import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { saveCapture, writeResource } from "./fileOutput";
import { PyxelWebviewManager } from "./pyxelWebview";
import { toErrorMessage } from "./utils";

export class PyxelFileProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(
    private readonly webviews: PyxelWebviewManager,
    private readonly onResourceSaved: (filePath: string) => void
  ) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const filePath = document.uri.fsPath;
    const isResource = path.extname(filePath) === ".pyxres";
    const directory = path.dirname(filePath);

    this.webviews.initialize(
      panel,
      () => {
        if (isResource) {
          this.sendEditMessage(panel, filePath);
        } else {
          this.sendPlayMessage(panel, filePath);
        }
      },
      (fileName, data) => {
        if (isResource && fileName === path.basename(filePath)) {
          if (writeResource(filePath, data)) this.onResourceSaved(filePath);
          return;
        }
        saveCapture(directory, fileName, data);
      }
    );
  }

  private sendEditMessage(panel: vscode.WebviewPanel, filePath: string): void {
    this.webviews.resetErrorState();
    const fileName = path.basename(filePath);
    try {
      const fileData = fs.existsSync(filePath)
        ? fs.readFileSync(filePath).toString("base64")
        : null;
      const palettePath = filePath.replace(/\.pyxres$/, ".pyxpal");
      const paletteData = fs.existsSync(palettePath)
        ? fs.readFileSync(palettePath).toString("base64")
        : null;
      this.webviews.post(panel.webview, {
        command: "edit",
        fileName,
        fileData,
        palData: paletteData,
      });
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to read ${fileName}: ${toErrorMessage(error)}`
      );
    }
  }

  private sendPlayMessage(panel: vscode.WebviewPanel, filePath: string): void {
    this.webviews.resetErrorState();
    const fileName = path.basename(filePath);
    try {
      const fileData = fs.readFileSync(filePath).toString("base64");
      this.webviews.post(panel.webview, {
        command: "play",
        fileName,
        fileData,
      });
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to read ${fileName}: ${toErrorMessage(error)}`
      );
    }
  }
}

export async function createResource(): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    filters: { "Pyxel Resource": ["pyxres"] },
  });
  if (!uri) return;
  const resourceUri = path.extname(uri.path).toLowerCase() === ".pyxres"
    ? uri
    : uri.with({ path: `${uri.path}.pyxres` });
  await vscode.commands.executeCommand(
    "vscode.openWith",
    resourceUri,
    "pyxel.editor"
  );
}
