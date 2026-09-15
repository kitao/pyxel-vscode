import * as vscode from "vscode";
import { copyExamples } from "./copyExamples";
import { createResource, PyxelFileProvider } from "./customEditors";
import { createDocumentationCommand } from "./documentationPanels";
import { PyxelWebviewManager } from "./pyxelWebview";
import { RunPanelController } from "./runPanel";
import { PYXEL_API_REFERENCE_URL, PYXEL_EDITOR_MANUAL_URL } from "./utils";

let runPanel: RunPanelController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Pyxel");
  const webviews = new PyxelWebviewManager(outputChannel);
  const controller = new RunPanelController(webviews, outputChannel);
  runPanel = controller;
  const fileProvider = new PyxelFileProvider(
    webviews,
    (filePath) => controller.handleFileSave(filePath)
  );
  const editorOptions = { webviewOptions: { retainContextWhenHidden: true } };

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand("pyxel.run", (uri?: vscode.Uri) =>
      controller.run(uri)
    ),
    vscode.commands.registerCommand("pyxel.newResource", createResource),
    vscode.commands.registerCommand("pyxel.copyExamples", () =>
      copyExamples(vscode)
    ),
    vscode.commands.registerCommand(
      "pyxel.apiReference",
      createDocumentationCommand(
        "pyxel.apiReference",
        "Pyxel API Reference",
        PYXEL_API_REFERENCE_URL
      )
    ),
    vscode.commands.registerCommand(
      "pyxel.editorManual",
      createDocumentationCommand(
        "pyxel.editorManual",
        "Pyxel Editor Manual",
        PYXEL_EDITOR_MANUAL_URL
      )
    ),
    vscode.commands.registerCommand("pyxel.forwardKey", (args: unknown) =>
      webviews.forwardKey(args)
    ),
    vscode.window.registerCustomEditorProvider(
      "pyxel.editor", fileProvider, editorOptions
    ),
    vscode.window.registerCustomEditorProvider(
      "pyxel.player", fileProvider, editorOptions
    ),
    vscode.workspace.onDidSaveTextDocument((document) =>
      controller.handleFileSave(document.uri.fsPath)
    )
  );
}

export function deactivate(): void {
  runPanel?.dispose();
  runPanel = undefined;
}
