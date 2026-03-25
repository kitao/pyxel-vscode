import { describe, it, expect } from "vitest";
import { isPyxelRunnable, getNonce } from "../utils";

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
