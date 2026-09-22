import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { saveCapture, writeResource } from "./fileOutput";
import type { HostToWebviewMessage } from "./messages";
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
    const isResource = path.extname(filePath).toLowerCase() === ".pyxres";
    const directory = path.dirname(filePath);
    let baseline: string | null | undefined;

    const saveResource = async (data: string): Promise<void> => {
      if (baseline === undefined) {
        vscode.window.showErrorMessage("The resource has not loaded. Reopen it before saving.");
        return;
      }
      try {
        const current = readBase64(filePath);
        if (current !== baseline) {
          const choice = await vscode.window.showWarningMessage(
            `${path.basename(filePath)} changed on disk. Overwrite it with the editor contents?`,
            { modal: true },
            "Overwrite"
          );
          if (choice !== "Overwrite") return;
          if (readBase64(filePath) !== current) {
            vscode.window.showErrorMessage("The resource changed again while confirming. Save again to review the latest conflict.");
            return;
          }
        }
        if (writeResource(filePath, data)) {
          baseline = data;
          this.onResourceSaved(filePath);
        }
      } catch (error: unknown) {
        vscode.window.showErrorMessage(
          `Failed to save ${path.basename(filePath)}: ${toErrorMessage(error)}`
        );
      }
    };

    this.webviews.initialize(
      panel,
      () => {
        if (isResource) {
          this.send(panel, filePath, () => {
            const fileData = readBase64(filePath);
            const palData = readBase64(filePath.replace(/\.pyxres$/i, ".pyxpal"));
            baseline = fileData;
            return { command: "edit", fileName: path.basename(filePath), fileData, palData };
          });
        } else {
          this.sendPlayMessage(panel, filePath);
        }
      },
      (fileName, data) => {
        if (isResource && fileName === path.basename(filePath)) {
          void saveResource(data);
          return;
        }
        saveCapture(directory, fileName, data);
      },
      isResource ? path.basename(filePath) : undefined
    );
  }

  private sendPlayMessage(panel: vscode.WebviewPanel, filePath: string): void {
    this.send(panel, filePath, () => ({
      command: "play",
      fileName: path.basename(filePath),
      fileData: fs.readFileSync(filePath).toString("base64"),
    }));
  }

  // Reading happens inside the callback so a failure never reaches the Webview.
  private send(
    panel: vscode.WebviewPanel,
    filePath: string,
    build: () => HostToWebviewMessage
  ): void {
    this.webviews.resetErrorState(panel.webview);
    try {
      this.webviews.post(panel.webview, build());
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to read ${path.basename(filePath)}: ${toErrorMessage(error)}`
      );
    }
  }
}

function readBase64(filePath: string): string | null {
  return fs.existsSync(filePath)
    ? fs.readFileSync(filePath).toString("base64")
    : null;
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
