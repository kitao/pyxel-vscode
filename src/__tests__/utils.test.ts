import { describe, it, expect } from "vitest";
import { isPyxelRunnable, getNonce, isSafeFileName, isWatchedFile } from "../utils";
import * as path from "path";

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
    expect(isWatchedFile(path.join(path.sep, "other", "main.py"), root)).toBe(false);
    expect(isWatchedFile(path.join(root, "..", "main.py"), root)).toBe(false);
  });

  it("rejects dotfiles and skip directories", () => {
    expect(isWatchedFile(path.join(root, ".env"), root)).toBe(false);
    expect(isWatchedFile(path.join(root, ".venv", "lib", "x.py"), root)).toBe(false);
    expect(isWatchedFile(path.join(root, "node_modules", "p", "i.js"), root)).toBe(false);
    expect(isWatchedFile(path.join(root, "__pycache__", "m.pyc"), root)).toBe(false);
  });
});

