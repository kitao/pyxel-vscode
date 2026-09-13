import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  PYXEL_VERSION,
  findExecutable,
  isPyxelRunnable,
  getNonce,
  isSafeFileName,
  isWatchedFile,
} from "../utils";

describe("PYXEL_VERSION", () => {
  it("pins Pyxel to version 2.9.9", () => {
    expect(PYXEL_VERSION).toBe("2.9.9");
  });
});

describe("isPyxelRunnable", () => {
  it("accepts a .py file path", () => {
    expect(isPyxelRunnable("/path/to/game.py")).toBe(true);
  });

  it("rejects undefined", () => {
    expect(isPyxelRunnable(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isPyxelRunnable("")).toBe(false);
  });

  it("rejects non-.py file", () => {
    expect(isPyxelRunnable("/path/to/file.txt")).toBe(false);
  });

  it("rejects .py in directory name", () => {
    expect(isPyxelRunnable("/path/to.py/file.txt")).toBe(false);
  });

  it("accepts .py with spaces in path", () => {
    expect(isPyxelRunnable("/my path/game file.py")).toBe(true);
  });
});

describe("getNonce", () => {
  it("returns a 32-character hex string", () => {
    const nonce = getNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns different values on successive calls", () => {
    const a = getNonce();
    const b = getNonce();
    expect(a).not.toBe(b);
  });
});

describe("isSafeFileName", () => {
  it("accepts a plain file name", () => {
    expect(isSafeFileName("screenshot.png")).toBe(true);
    expect(isSafeFileName("my game.pyxres")).toBe(true);
  });

  it("rejects empty and dot names", () => {
    expect(isSafeFileName("")).toBe(false);
    expect(isSafeFileName(".")).toBe(false);
    expect(isSafeFileName("..")).toBe(false);
  });

  it("rejects names containing path separators", () => {
    expect(isSafeFileName("a/b.png")).toBe(false);
    expect(isSafeFileName("../escape.png")).toBe(false);
    expect(isSafeFileName("a\\b.png")).toBe(false);
    expect(isSafeFileName("..\\escape.png")).toBe(false);
  });
});

describe("isWatchedFile", () => {
  const root = path.join(path.sep, "proj");

  it("accepts files under the root", () => {
    expect(isWatchedFile(path.join(root, "main.py"), root)).toBe(true);
    expect(isWatchedFile(path.join(root, "sub", "a.pyxres"), root)).toBe(true);
  });

  it("rejects files outside the root", () => {
    expect(isWatchedFile(
      path.join(path.sep, "other", "main.py"),
      root
    )).toBe(false);
    expect(isWatchedFile(path.join(root, "..", "main.py"), root)).toBe(false);
  });

  it("rejects dotfiles and skip directories", () => {
    expect(isWatchedFile(path.join(root, ".env"), root)).toBe(false);
    expect(isWatchedFile(
      path.join(root, ".venv", "lib", "x.py"),
      root
    )).toBe(false);
    expect(isWatchedFile(
      path.join(root, "node_modules", "p", "i.js"),
      root
    )).toBe(false);
    expect(isWatchedFile(
      path.join(root, "__pycache__", "m.pyc"),
      root
    )).toBe(false);
  });

  it("rejects files deeper than the collection limit", () => {
    expect(isWatchedFile(path.join(root, "a", "b", "c", "ok.py"), root))
      .toBe(true);
    expect(isWatchedFile(
      path.join(root, "a", "b", "c", "d", "deep.py"),
      root
    )).toBe(false);
  });
});

describe("findExecutable", () => {
  const created: string[] = [];

  function pathDir(...names: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-path-"));
    for (const name of names) fs.writeFileSync(path.join(dir, name), "");
    created.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns the first matching file on PATH", () => {
    const dir = pathDir("uvx");
    const env = { PATH: [path.join(dir, "missing"), dir].join(path.delimiter) };

    expect(findExecutable("uvx", env)).toBe(path.join(dir, "uvx"));
  });

  it("returns undefined when PATH has no match or is unset", () => {
    expect(findExecutable("uvx", { PATH: pathDir() })).toBeUndefined();
    expect(findExecutable("uvx", {})).toBeUndefined();
  });

  it("tries the PATHEXT extensions Windows provides", () => {
    const dir = pathDir("uvx.EXE");

    expect(findExecutable("uvx", { PATH: dir, PATHEXT: ".COM;.EXE" })).toBe(
      path.join(dir, "uvx.EXE")
    );
    expect(findExecutable("uvx", { PATH: dir })).toBeUndefined();
  });
});
