import { describe, expect, it } from "vitest";
import {
  PYXEL_VERSION,
  isPyxelRunnable,
  getNonce,
  isSafeFileName,
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
