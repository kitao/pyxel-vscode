import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { toErrorMessage } from "./utils";

export function writeResource(filePath: string, data: string): boolean {
  try {
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
    return true;
  } catch (error: unknown) {
    vscode.window.showErrorMessage(
      `Failed to save ${path.basename(filePath)}: ${toErrorMessage(error)}`
    );
    return false;
  }
}

export function saveCapture(
  directory: string | undefined,
  fileName: string,
  data: string
): void {
  if (!directory) return;
  const destination = path.join(directory, fileName);
  try {
    fs.writeFileSync(destination, Buffer.from(data, "base64"));
  } catch (error: unknown) {
    vscode.window.showErrorMessage(
      `Failed to save ${fileName}: ${toErrorMessage(error)}`
    );
    return;
  }

  const shownPath = vscode.workspace.asRelativePath(destination);
  void Promise.resolve(vscode.window.showInformationMessage(
    `Saved: ${shownPath}`,
    "Open",
    "Reveal in Explorer"
  ))
    .then((choice) => {
      const uri = vscode.Uri.file(destination);
      if (choice === "Open") {
        return vscode.commands.executeCommand("vscode.open", uri);
      } else if (choice === "Reveal in Explorer") {
        return vscode.commands.executeCommand("revealFileInOS", uri);
      }
      return undefined;
    })
    .catch((error: unknown) => {
      vscode.window.showErrorMessage(
        `Failed to open ${fileName}: ${toErrorMessage(error)}`
      );
    });
}
