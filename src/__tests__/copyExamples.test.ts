import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { copyExamples } from "../copyExamples";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

let root: string;
const source = path.resolve(__dirname, "../../vendor/pyxel");
let destination: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-examples-"));
  destination = path.join(root, "pyxel_examples");
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.mocked(fs.renameSync).mockReset();
});

function harness(runtimeDir = source) {
  const window = {
    showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: root }]),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn(),
    showTextDocument: vi.fn(),
  };
  const api = { window, Uri: { file: (p: string) => p } } as unknown as Parameters<typeof copyExamples>[0];
  return { window, copy: () => copyExamples(api, runtimeDir) };
}

describe("Copy Examples", () => {
  it("copies the bundled tree byte for byte and opens the example on request", async () => {
    const { window, copy } = harness();
    window.showInformationMessage.mockResolvedValue("Open Hello Pyxel");
    await copy();
    expect(fs.readFileSync(path.join(destination, "assets", "sample.pyxres")).readUInt16BE(0)).toBe(0x504b);
    expect(fs.existsSync(path.join(destination, "cube", "c01_hello_cube.py"))).toBe(true);
    expect(fs.existsSync(path.join(destination, "99_flip_animation.py"))).toBe(false);
    expect(window.showTextDocument).toHaveBeenCalledWith(path.join(destination, "01_hello_pyxel.py"));
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it("does nothing when the folder picker is cancelled", async () => {
    const { window, copy } = harness();
    window.showOpenDialog.mockResolvedValue(undefined);
    await copy();
    expect(fs.existsSync(destination)).toBe(false);
  });

  it("keeps edited examples when replacement is declined", async () => {
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "work.py"), "edited");
    const { copy, window } = harness();
    await copy();
    expect(fs.readFileSync(path.join(destination, "work.py"), "utf8")).toBe("edited");
    expect(window.showWarningMessage).toHaveBeenCalledOnce();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(fs.readdirSync(root).sort()).toEqual(["pyxel_examples"]);
  });

  it("replaces the entire folder after confirmation", async () => {
    const { copy, window } = harness();
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "obsolete"), "old");
    window.showWarningMessage.mockResolvedValue("Replace");
    await copy();
    expect(fs.existsSync(path.join(destination, "01_hello_pyxel.py"))).toBe(true);
    expect(fs.existsSync(path.join(destination, "obsolete"))).toBe(false);
    expect(window.showTextDocument).not.toHaveBeenCalled();
  });

  it("keeps the destination when the bundled wheel cannot be read", async () => {
    const { copy, window } = harness(root);
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "work.py"), "edited");
    fs.writeFileSync(path.join(root, "broken.whl"), "incomplete");
    await copy();
    expect(fs.readFileSync(path.join(destination, "work.py"), "utf8")).toBe("edited");
    expect(window.showWarningMessage).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledOnce();
    expect(fs.readdirSync(root).sort()).toEqual(["broken.whl", "pyxel_examples"]);
  });

  it("restores the previous folder on failure", async () => {
    const { copy, window } = harness();
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "work.py"), "edited");
    window.showWarningMessage.mockResolvedValue("Replace");
    const actual = await vi.importActual<typeof import("fs")>("fs");
    vi.mocked(fs.renameSync).mockImplementationOnce(actual.renameSync)
      .mockImplementationOnce(() => { throw new Error("rename failed"); });
    await copy();
    expect(fs.readFileSync(path.join(destination, "work.py"), "utf8")).toBe("edited");
    expect(window.showErrorMessage).toHaveBeenCalledWith("Failed to copy examples: rename failed");
    expect(fs.readdirSync(root).sort()).toEqual(["pyxel_examples"]);
  });
});
