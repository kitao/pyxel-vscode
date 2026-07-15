import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const vscodeState = vi.hoisted(() => ({
  asRelativePath: vi.fn(),
  executeCommand: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  uriFile: vi.fn((filePath: string) => ({ fsPath: filePath })),
}));

vi.mock("vscode", () => ({
  Uri: { file: vscodeState.uriFile },
  commands: { executeCommand: vscodeState.executeCommand },
  window: {
    showErrorMessage: vscodeState.showErrorMessage,
    showInformationMessage: vscodeState.showInformationMessage,
  },
  workspace: { asRelativePath: vscodeState.asRelativePath },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

import { saveCapture, writeResource } from "../fileOutput";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-output-test-"));
  vi.mocked(fs.writeFileSync).mockClear();
  vscodeState.asRelativePath.mockImplementation((filePath) => filePath);
  vscodeState.executeCommand.mockReset().mockResolvedValue(undefined);
  vscodeState.showErrorMessage.mockReset();
  vscodeState.showInformationMessage.mockReset().mockResolvedValue(undefined);
  vscodeState.uriFile.mockClear();
});

afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const actual = await vi.importActual<typeof import("fs")>("fs");
  vi.mocked(fs.writeFileSync).mockImplementation(actual.writeFileSync);
});

describe("file output", () => {
  it("writes decoded resource data", () => {
    const filePath = path.join(tmpDir, "game.pyxres");

    expect(writeResource(filePath, Buffer.from("resource").toString("base64")))
      .toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe("resource");
  });

  it("reports the resource file name when writing fails", () => {
    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    expect(writeResource(path.join(tmpDir, "game.pyxres"), "AA=="))
      .toBe(false);
    expect(vscodeState.showErrorMessage).toHaveBeenCalledWith(
      "Failed to save game.pyxres: disk full"
    );
  });

  it("writes a capture and opens the saved URI on request", async () => {
    const filePath = path.join(tmpDir, "capture.png");
    vscodeState.asRelativePath.mockReturnValue("capture.png");
    vscodeState.showInformationMessage.mockResolvedValue("Open");

    saveCapture(
      tmpDir,
      "capture.png",
      Buffer.from("capture").toString("base64")
    );

    await vi.waitFor(() => {
      expect(vscodeState.executeCommand).toHaveBeenCalledWith(
        "vscode.open",
        { fsPath: filePath }
      );
    });
    expect(fs.readFileSync(filePath, "utf8")).toBe("capture");
  });

  it("does nothing when no destination directory is active", () => {
    saveCapture(undefined, "capture.png", "AA==");

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(vscodeState.showInformationMessage).not.toHaveBeenCalled();
  });
});
