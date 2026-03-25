import { describe, it, expect } from "vitest";
import { isPyxelRunnable } from "../utils";

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
