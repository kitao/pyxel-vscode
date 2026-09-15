import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { toErrorMessage } from "./utils";

export function writeResource(filePath: string, data: string): boolean {
  try {
    // Write beside the destination before replacing it, so a partial write
    // cannot truncate the user's resource. Follow an explicitly opened link.
    const exists = fs.existsSync(filePath);
    const destination = exists
      ? fs.realpathSync(filePath)
      : filePath;
    const mode = exists
      ? fs.statSync(destination).mode
      : undefined;
    if (mode !== undefined) fs.accessSync(destination, fs.constants.W_OK);
    const temporary = fs.mkdtempSync(
      path.join(path.dirname(destination), ".pyxel-save-")
    );
    try {
      const staged = path.join(temporary, "resource");
      fs.writeFileSync(staged, Buffer.from(data, "base64"), { mode });
      if (mode !== undefined) fs.chmodSync(staged, mode);
      fs.renameSync(staged, destination);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
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
