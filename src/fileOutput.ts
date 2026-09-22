import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { isSafeFileName, toErrorMessage } from "./utils";

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
  let destination: string;
  try {
    if (!isSafeFileName(fileName)) throw new Error("Unsafe capture file name");
    destination = writeNewCapture(directory, fileName, Buffer.from(data, "base64"));
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

// Exclusive creation never follows an existing symlink or truncates a capture.
// Keep both captures when the runtime generates the same name more than once.
function writeNewCapture(directory: string, fileName: string, data: Buffer): string {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  for (let suffix = 0; suffix < 10000; suffix++) {
    const name = suffix === 0 ? fileName : `${stem} (${suffix})${extension}`;
    const destination = path.join(directory, name);
    let descriptor: number;
    try {
      descriptor = fs.openSync(destination, "wx");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    try {
      try {
        fs.writeFileSync(descriptor, data);
      } finally {
        fs.closeSync(descriptor);
      }
    } catch (error: unknown) {
      fs.unlinkSync(destination);
      throw error;
    }
    return destination;
  }
  throw new Error("No unused capture file name is available");
}
